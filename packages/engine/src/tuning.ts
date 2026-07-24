import {
  DISCIPLINE_SURFACE,
  TUNING_CATEGORIES,
  barToPsi,
  clamp,
  nPerMmToKgfPerMm,
  nPerMmToLbfPerIn,
  snapToStep,
  type BuildRequest,
  type Discipline,
  type Drivetrain,
  type Surface,
  type TuneSpec,
  type TuningCategory,
} from '@fh6/shared';
import type { TuneRanges } from '@fh6/data';
import type { ResolvedCar } from './effectiveCar.ts';
import {
  ARB_BASE_STIFFNESS,
  BUMP_TO_REBOUND_RATIO,
  DAMPING_REBOUND_FRACTION,
  DEFAULT_TIRE_RADIUS_M,
  RIDE_FREQUENCY,
  TIRE_PRESSURE_BASE,
  TIRE_PRESSURE_COMPOUND_ADJUST,
  UNSPRUNG_FRACTION,
} from './constants.ts';
import type { BuiltSpec, TuneResult } from './types.ts';

interface Range {
  min: number;
  max: number;
  step: number;
}

const snapRange = (range: Range, value: number): number =>
  snapToStep(value, range.min, range.max, range.step);

/** Map a 0..1 fraction into a range, then snap to the range's grid. */
const fracToRange = (range: Range, frac: number): number =>
  snapRange(range, range.min + clamp(frac, 0, 1) * (range.max - range.min));

/**
 * The tuning engine. Given a built car + its tunable ranges + the goal, it
 * produces a complete TuneSpec using explicit vehicle-dynamics heuristics, each
 * documented in docs/tuning-engine-design.md. Every value is clamped to the
 * car's legal range, so output is always in-game-valid. Deterministic.
 */
export function computeTune(
  car: ResolvedCar,
  spec: BuiltSpec,
  ranges: TuneRanges,
  request: BuildRequest,
): TuneResult {
  const discipline = request.discipline;
  const surface = DISCIPLINE_SURFACE[discipline];
  const wd = spec.weightDistFrontPct / 100;
  const wdRear = 1 - wd;
  const unlocked = spec.unlockedTuning;
  const rationale: TuneResult['rationale'] = {};

  const tires = computeTirePressure(spec, ranges, surface, discipline, wd, wdRear, rationale);
  const gearing = computeGearing(car, spec, ranges, discipline, rationale);
  const alignment = computeAlignment(ranges, surface, discipline, spec, request, rationale);
  const antiRollBars = computeArbs(
    ranges,
    surface,
    discipline,
    spec,
    request,
    wd,
    wdRear,
    rationale,
  );
  const springs = computeSprings(spec, ranges, surface, discipline, wd, wdRear, rationale);
  const damping = computeDamping(spec, ranges, surface, discipline, request, rationale);
  const aero = computeAero(spec, ranges, discipline, request, wd, rationale);
  const brakes = computeBrakes(ranges, wd, discipline, request, rationale);
  const differential = computeDifferential(spec, ranges, discipline, request, rationale);

  const tune: TuneSpec = {
    units: {
      pressure: 'psi',
      springRate: ranges.springRate.unit,
      rideHeight: ranges.rideHeight.unit,
      downforce: ranges.aero.unit,
    },
    tires,
    gearing,
    alignment,
    antiRollBars,
    springs,
    damping,
    aero,
    brakes,
    differential,
  };

  const aeroTunable =
    unlocked.has('aero') && spec.hasAero && !request.constraints.noAero && aero !== null;
  const tunable = Object.fromEntries(
    TUNING_CATEGORIES.map((c) => [c, c === 'aero' ? aeroTunable : unlocked.has(c)]),
  ) as Record<TuningCategory, boolean>;

  return { tune, tunable, rationale };
}

// --- Tires --------------------------------------------------------------------
function computeTirePressure(
  spec: BuiltSpec,
  ranges: TuneRanges,
  surface: Surface,
  discipline: Discipline,
  wd: number,
  wdRear: number,
  rationale: TuneResult['rationale'],
): TuneSpec['tires'] {
  if (discipline === 'drift') {
    const frontPsi = snapRange(ranges.tirePressurePsi, barToPsi(2.5));
    const rearPsi = snapRange(ranges.tirePressurePsi, barToPsi(1.5));
    rationale.tires =
      'Drift: front ~2.5 bar limits entry snap; rear ~1.5 bar adds side bite and drive. Rear pressure is the main grip dial — lower adds grip.';
    return { frontPsi, rearPsi };
  }

  if (discipline === 'drag') {
    const targets: Record<Drivetrain, [number, number]> = {
      RWD: [32, 24],
      FWD: [24, 32],
      AWD: [25, 25],
    };
    const [front, rear] = targets[spec.drivetrain];
    rationale.tires =
      'Drag: lower pressure on the driven axle for launch footprint and higher pressure on the free axle to reduce rolling loss. Fine-tune from telemetry and trap speed.';
    return {
      frontPsi: snapRange(ranges.tirePressurePsi, front),
      rearPsi: snapRange(ranges.tirePressurePsi, rear),
    };
  }

  let base = TIRE_PRESSURE_BASE[surface] + TIRE_PRESSURE_COMPOUND_ADJUST[spec.tireCompound];
  if (discipline === 'top_speed') base += 3;
  const axleSpread = discipline === 'top_speed' ? 1 : 3;
  const frontPsi = snapRange(ranges.tirePressurePsi, base + (wd - 0.5) * axleSpread);
  const rearPsi = snapRange(ranges.tirePressurePsi, base + (wdRear - 0.5) * axleSpread);
  rationale.tires =
    'Cold menu pressures are adjusted for surface, tire construction and axle load. Use telemetry after several loaded corners: even hot temperatures and a stable contact patch matter more than one universal pressure.';
  return { frontPsi, rearPsi };
}
// --- Gearing ------------------------------------------------------------------
function computeGearing(
  car: ResolvedCar,
  spec: BuiltSpec,
  ranges: TuneRanges,
  discipline: Discipline,
  rationale: TuneResult['rationale'],
): TuneSpec['gearing'] {
  const redline = spec.redlineRpm;
  const powerPeak = clamp(spec.powerPeakRpm ?? redline * 0.82, redline * 0.55, redline * 0.98);
  const radius = DEFAULT_TIRE_RADIUS_M;
  const stockTop = car.stockTopSpeedKmh ?? 250;
  const powerScale = Math.cbrt(Math.max(spec.powerHp, 1) / Math.max(car.powerHp, 1));
  const disciplineFactor: Record<Discipline, number> = {
    road: 0.93,
    street: 0.88,
    dirt: 0.78,
    rally: 0.82,
    cross_country: 0.76,
    drag: 0.9,
    drift: 0,
    top_speed: 1.02,
    pr_stunts: 0.9,
    custom: 0.9,
  };
  const targetTop = clamp(stockTop * powerScale * disciplineFactor[discipline], 110, 480);
  const topRatio: Record<Discipline, number> = {
    road: 0.95,
    street: 1,
    dirt: 1.12,
    rally: 1.08,
    cross_country: 1.14,
    drag: 0.92,
    drift: 1,
    top_speed: 0.86,
    pr_stunts: 0.98,
    custom: 1,
  };
  const firstRatio: Record<Discipline, number> = {
    road: 3.05,
    street: 3.15,
    dirt: 3.25,
    rally: 3.2,
    cross_country: 3.3,
    drag: 2.65,
    drift: 3,
    top_speed: 2.55,
    pr_stunts: 3.05,
    custom: 3.1,
  };
  const gearCount =
    discipline === 'top_speed'
      ? 7
      : spec.transmissionTier === 'race'
        ? 6
        : clamp(car.numGears ?? 6, 4, 7);
  const gears: number[] = [];
  const shiftDrop = clamp(powerPeak / redline, 0.64, 0.9);
  const geometricTop = Math.max(
    topRatio[discipline],
    firstRatio[discipline] * shiftDrop ** (gearCount - 1),
  );
  for (let i = 0; i < gearCount; i += 1) {
    const t = i / Math.max(gearCount - 1, 1);
    gears.push(
      snapRange(
        ranges.gearRatio,
        firstRatio[discipline] * (geometricTop / firstRatio[discipline]) ** t,
      ),
    );
  }

  let finalDrive: number;
  if (discipline === 'drift') {
    const targetThirdKmh = clamp(145 + (spec.powerHp - 450) * 0.04, 135, 160);
    finalDrive = snapRange(ranges.finalDrive, clamp(4.1 - (spec.powerHp - 450) * 0.001, 3.8, 4.3));
    const ratioFor = (speedKmh: number): number =>
      snapRange(
        ranges.gearRatio,
        (redline * 2 * Math.PI * radius * 60) / (finalDrive * speedKmh * 1000),
      );
    const gear3 = ratioFor(targetThirdKmh);
    const gear4 = ratioFor(targetThirdKmh * 1.28);
    gears.splice(
      0,
      gears.length,
      snapRange(ranges.gearRatio, 3),
      snapRange(ranges.gearRatio, Math.max(2.15, gear3 * 1.3)),
      gear3,
      gear4,
      snapRange(ranges.gearRatio, gear4 * 0.8),
      snapRange(ranges.gearRatio, gear4 * 0.64),
    );
    rationale.gearing =
      'Drift: 3rd/4th include wheelspin reserve and follow the real limiter and powerband; 1st/2nd initiate and 5th/6th cruise. Lengthen only the gear that reaches the limiter mid-slide.';
  } else {
    const top = gears.at(-1) ?? topRatio[discipline];
    const wheelRpm = ((targetTop / 3.6 / radius) * 60) / (2 * Math.PI);
    finalDrive = snapRange(ranges.finalDrive, redline / (wheelRpm * top));
    rationale.gearing =
      'Gearing is scaled from this car’s stock speed, built power, limiter and power peak — there is no fixed rally/dirt speed target. Ratios keep post-shift RPM in the useful band; telemetry near the limiter decides the final correction.';
  }
  return { finalDrive, gears };
}
// --- Alignment ----------------------------------------------------------------
function computeAlignment(
  ranges: TuneRanges,
  surface: Surface,
  discipline: Discipline,
  spec: BuiltSpec,
  request: BuildRequest,
  rationale: TuneResult['rationale'],
): TuneSpec['alignment'] {
  if (discipline === 'drift') {
    rationale.alignment =
      'Drift (wheel): ~-2.5° front camber, near-zero rear camber for rear grip, front toe-out for angle/stability, rear toe-in for drive, and maximum caster for self-steer.';
    return {
      camberFrontDeg: snapRange(ranges.camberDeg, -2.5),
      camberRearDeg: snapRange(ranges.camberDeg, -0.3),
      toeFrontDeg: snapRange(ranges.toeDeg, -1),
      toeRearDeg: snapRange(ranges.toeDeg, 0.5),
      casterDeg: ranges.casterDeg.max,
    };
  }

  const profile: Record<Discipline, [number, number, number]> = {
    road: [-1, -0.7, 6.8],
    street: [-0.9, -0.6, 6.7],
    dirt: [-0.5, -0.3, 6.5],
    rally: [-0.6, -0.35, 6.6],
    cross_country: [-0.35, -0.2, 6.4],
    drag: [0, 0, 6.2],
    drift: [-2.5, -0.3, ranges.casterDeg.max],
    top_speed: [-0.25, -0.15, 6.7],
    pr_stunts: [-0.7, -0.45, 6.6],
    custom: [-0.8, -0.5, 6.6],
  };
  const [baseCamberFront, baseCamberRear, caster] = profile[discipline];
  let camberFront = baseCamberFront;
  let camberRear = baseCamberRear;
  if (surface === 'tarmac' && ['semi_slick', 'slick'].includes(spec.tireCompound)) {
    camberFront -= 0.1;
    camberRear -= 0.05;
  }
  const toeFront =
    ['road', 'street'].includes(discipline) && request.drivingStyle === 'aggressive' ? -0.1 : 0;
  const toeRear = discipline === 'top_speed' ? 0.1 : 0;
  rationale.alignment =
    'FH6 baseline uses modest negative camber, near-zero toe to avoid scrub, and 6.5–7° caster for stable self-centering. Straight-line modes use almost zero camber; telemetry tire temperatures should drive further changes.';
  return {
    camberFrontDeg: snapRange(ranges.camberDeg, camberFront),
    camberRearDeg: snapRange(ranges.camberDeg, camberRear),
    toeFrontDeg: snapRange(ranges.toeDeg, toeFront),
    toeRearDeg: snapRange(ranges.toeDeg, toeRear),
    casterDeg: snapRange(ranges.casterDeg, caster),
  };
}
// --- Anti-roll bars -----------------------------------------------------------
function computeArbs(
  ranges: TuneRanges,
  surface: Surface,
  discipline: Discipline,
  spec: BuiltSpec,
  request: BuildRequest,
  wd: number,
  wdRear: number,
  rationale: TuneResult['rationale'],
): TuneSpec['antiRollBars'] {
  if (discipline === 'drift') {
    rationale.antiroll_bars =
      'Drift: very soft bars preserve side bite; front stays slightly stiffer for turn-in while the softer rear helps the car drive through the slide.';
    return { front: fracToRange(ranges.arb, 0.1), rear: fracToRange(ranges.arb, 0.065) };
  }

  if (discipline === 'drag') {
    const fractions: Record<Drivetrain, [number, number]> = {
      RWD: [0.12, 0.42],
      FWD: [0.42, 0.12],
      AWD: [0.2, 0.28],
    };
    const [front, rear] = fractions[spec.drivetrain];
    rationale.antiroll_bars =
      'Drag bars favor longitudinal load transfer toward the driven axle while keeping the opposite end controlled. Launch telemetry is the final authority.';
    return { front: fracToRange(ranges.arb, front), rear: fracToRange(ranges.arb, rear) };
  }

  let frontFrac = ARB_BASE_STIFFNESS[surface] * (wd / 0.5);
  let rearFrac = ARB_BASE_STIFFNESS[surface] * (wdRear / 0.5);
  let rotation = spec.drivetrain === 'FWD' ? 0.05 : spec.drivetrain === 'RWD' ? -0.025 : 0;
  if (request.drivingStyle === 'aggressive') rotation += 0.025;
  if (request.drivingStyle === 'smooth') rotation -= 0.02;
  frontFrac -= rotation;
  rearFrac += rotation;
  if (discipline === 'top_speed') {
    frontFrac *= 0.75;
    rearFrac *= 0.75;
  }
  rationale.antiroll_bars =
    'Moderate bars are scaled to axle load, surface and drivetrain. Loose-surface bars remain very soft for independent wheel travel; balance changes should be small and telemetry-led.';
  return {
    front: fracToRange(ranges.arb, frontFrac),
    rear: fracToRange(ranges.arb, rearFrac),
  };
}
// --- Springs + ride height ----------------------------------------------------
function computeSprings(
  spec: BuiltSpec,
  ranges: TuneRanges,
  surface: Surface,
  discipline: Discipline,
  wd: number,
  wdRear: number,
  rationale: TuneResult['rationale'],
): TuneSpec['springs'] {
  let freqFront = RIDE_FREQUENCY[surface].front;
  let freqRear = RIDE_FREQUENCY[surface].rear;
  if (discipline === 'drift') {
    freqFront *= 1.3;
    freqRear *= 1.1;
  } else if (discipline === 'drag') {
    const transfer: Record<Drivetrain, [number, number]> = {
      RWD: [0.78, 1.08],
      FWD: [1.08, 0.78],
      AWD: [0.9, 0.95],
    };
    [freqFront, freqRear] = transfer[spec.drivetrain].map((x) => x * 1.7) as [number, number];
  } else if (discipline === 'top_speed') {
    freqFront *= 0.95;
    freqRear *= 0.95;
  }

  const sprung = spec.massKg * (1 - UNSPRUNG_FRACTION);
  const cornerFront = (sprung * wd) / 2;
  const cornerRear = (sprung * wdRear) / 2;
  const rateNPerMm = (frequency: number, mass: number): number =>
    ((2 * Math.PI * frequency) ** 2 * mass) / 1000;
  const toUnit = (value: number): number =>
    ranges.springRate.unit === 'N/mm'
      ? value
      : ranges.springRate.unit === 'kgf/mm'
        ? nPerMmToKgfPerMm(value)
        : nPerMmToLbfPerIn(value);
  const frontRate = snapRange(ranges.springRate, toUnit(rateNPerMm(freqFront, cornerFront)));
  const rearRate = snapRange(ranges.springRate, toUnit(rateNPerMm(freqRear, cornerRear)));

  const heights: Record<Discipline, [number, number]> = {
    road: [0.24, 0.27],
    street: [0.32, 0.35],
    dirt: [0.78, 0.82],
    rally: [0.72, 0.76],
    cross_country: [0.88, 0.92],
    drag: [0.28, 0.3],
    drift: [0.19, 0.14],
    top_speed: [0.12, 0.14],
    pr_stunts: [0.55, 0.58],
    custom: [0.35, 0.38],
  };
  const [frontHeight, rearHeight] = heights[discipline];
  rationale.springs =
    discipline === 'drift'
      ? 'Drift: the front is firmer than the rear and the rear sits lower to settle the driven axle for side bite and stability.'
      : 'Spring rates come from sprung corner mass and discipline-specific ride frequency. Tarmac controls roll; loose modes stay compliant and gain travel, with cross-country highest for impacts.';
  return {
    frontRate,
    rearRate,
    frontRideHeight: fracToRange(ranges.rideHeight, frontHeight),
    rearRideHeight: fracToRange(ranges.rideHeight, rearHeight),
  };
}
// --- Damping ------------------------------------------------------------------
function computeDamping(
  spec: BuiltSpec,
  ranges: TuneRanges,
  surface: Surface,
  discipline: Discipline,
  request: BuildRequest,
  rationale: TuneResult['rationale'],
): TuneSpec['damping'] {
  if (discipline === 'drift') {
    rationale.damping =
      'Drift: high rebound settles transitions, while low bump lets the tires take load quickly; the rear is softest in bump for side bite.';
    return {
      reboundFront: fracToRange(ranges.damping, 0.53),
      reboundRear: fracToRange(ranges.damping, 0.84),
      bumpFront: fracToRange(ranges.damping, 0.32),
      bumpRear: fracToRange(ranges.damping, 0.16),
    };
  }

  if (discipline === 'drag') {
    const transfer: Record<Drivetrain, [number, number, number, number]> = {
      RWD: [0.28, 0.62, 0.18, 0.36],
      FWD: [0.62, 0.28, 0.36, 0.18],
      AWD: [0.42, 0.48, 0.24, 0.28],
    };
    const [rf, rr, bf, br] = transfer[spec.drivetrain];
    rationale.damping =
      'Drag damping supports controlled load transfer toward the driven axle. Adjust one end at a time from launch squat, wheelspin and wheel-hop telemetry.';
    return {
      reboundFront: fracToRange(ranges.damping, rf),
      reboundRear: fracToRange(ranges.damping, rr),
      bumpFront: fracToRange(ranges.damping, bf),
      bumpRear: fracToRange(ranges.damping, br),
    };
  }

  let reboundFront = DAMPING_REBOUND_FRACTION[surface];
  let reboundRear = reboundFront * (surface === 'tarmac' ? 1.03 : 0.94);
  if (request.drivingStyle === 'smooth') {
    reboundFront *= 0.94;
    reboundRear *= 0.94;
  } else if (request.drivingStyle === 'aggressive') {
    reboundFront *= 1.04;
    reboundRear *= 1.04;
  }
  const bumpRatio = BUMP_TO_REBOUND_RATIO[surface];
  rationale.damping =
    'Rebound controls chassis motion and bump stays substantially softer so tires can absorb surface changes. Dirt, rally and cross-country use especially low bump and softer rear rebound for compliance.';
  return {
    reboundFront: fracToRange(ranges.damping, reboundFront),
    reboundRear: fracToRange(ranges.damping, reboundRear),
    bumpFront: fracToRange(ranges.damping, reboundFront * bumpRatio),
    bumpRear: fracToRange(ranges.damping, reboundRear * bumpRatio),
  };
}
// --- Aero ---------------------------------------------------------------------
function computeAero(
  spec: BuiltSpec,
  ranges: TuneRanges,
  discipline: Discipline,
  request: BuildRequest,
  wd: number,
  rationale: TuneResult['rationale'],
): TuneSpec['aero'] {
  if (!spec.hasAero || request.constraints.noAero) return null;
  const front = spec.aeroFront ?? { minKgf: 0, maxKgf: 0 };
  const rear = spec.aeroRear ?? { minKgf: 0, maxKgf: 0 };
  const profile: Record<Discipline, [number, number]> = {
    road: [0.95, 0.65],
    street: [0.85, 0.55],
    dirt: [0.55, 0.4],
    rally: [0.5, 0.35],
    cross_country: [0.3, 0.22],
    drag: [0, 0],
    drift: [0.05, 0.05],
    top_speed: [0, 0],
    pr_stunts: [0.6, 0.45],
    custom: [0.75, 0.55],
  };
  const levels = profile[discipline];
  let frontLevel = levels[0];
  const rearLevel = levels[1];
  frontLevel *= clamp(wd / 0.5, 0.85, 1.12);
  const frontKgf = front.minKgf + clamp(frontLevel, 0, 1) * (front.maxKgf - front.minKgf);
  const rearKgf = rear.minKgf + clamp(rearLevel, 0, 1) * (rear.maxKgf - rear.minKgf);
  const toUnit = (kgf: number): number => (ranges.aero.unit === 'lbf' ? kgf * 2.2046226218 : kgf);
  rationale.aero =
    'Road modes use front-biased downforce for turn-in, adding only enough rear for stability. Loose modes use less because jumps and low-speed corners benefit less; drag/top-speed start at minimum and add rear only if telemetry shows instability.';
  return {
    frontDownforce: snapRange(ranges.aero, toUnit(frontKgf)),
    rearDownforce: snapRange(ranges.aero, toUnit(rearKgf)),
  };
}
// --- Brakes -------------------------------------------------------------------
function computeBrakes(
  ranges: TuneRanges,
  wd: number,
  discipline: Discipline,
  request: BuildRequest,
  rationale: TuneResult['rationale'],
): TuneSpec['brakes'] {
  if (discipline === 'drift') {
    rationale.brakes =
      'Drift: ~75% front balance and ~55% force let left-foot braking tighten the line without snapping or straightening the car.';
    return {
      balanceFrontPct: snapRange(ranges.brakeBalancePct, 75),
      pressurePct: snapRange(ranges.brakePressurePct, 55),
    };
  }
  const profile: Record<Discipline, [number, number]> = {
    road: [48, 100],
    street: [49, 98],
    dirt: [50, 94],
    rally: [50, 96],
    cross_country: [50, 92],
    drag: [50, 95],
    drift: [75, 55],
    top_speed: [49, 100],
    pr_stunts: [49, 98],
    custom: [49, 98],
  };
  let [balance, pressure] = profile[discipline];
  balance += clamp((wd * 100 - 50) * 0.08, -1.5, 1.5);
  if (request.drivingStyle === 'smooth') pressure -= 3;
  if (request.drivingStyle === 'aggressive') pressure += 3;
  rationale.brakes =
    'FH6 brake balance starts close to the neutral 48–50% region; pressure is lower on loose surfaces and higher on tarmac. Move forward only if the rear locks or steps out under braking.';
  return {
    balanceFrontPct: snapRange(ranges.brakeBalancePct, balance),
    pressurePct: snapRange(ranges.brakePressurePct, pressure),
  };
}
// --- Differential -------------------------------------------------------------
function computeDifferential(
  spec: BuiltSpec,
  ranges: TuneRanges,
  discipline: Discipline,
  request: BuildRequest,
  rationale: TuneResult['rationale'],
): TuneSpec['differential'] {
  const drivetrain: Drivetrain = spec.drivetrain;
  const style =
    request.drivingStyle === 'aggressive' ? 5 : request.drivingStyle === 'smooth' ? -5 : 0;
  const p = (value: number) => snapRange(ranges.differentialPct, value);
  const rwd: Record<Discipline, [number, number]> = {
    road: [55, 15],
    street: [50, 18],
    dirt: [65, 25],
    rally: [65, 25],
    cross_country: [70, 30],
    drag: [85, 5],
    drift: [95, 85],
    top_speed: [45, 15],
    pr_stunts: [60, 20],
    custom: [50, 15],
  };
  const fwd: Record<Discipline, [number, number]> = {
    road: [35, 5],
    street: [35, 5],
    dirt: [50, 10],
    rally: [50, 10],
    cross_country: [55, 12],
    drag: [85, 5],
    drift: [60, 10],
    top_speed: [40, 5],
    pr_stunts: [45, 10],
    custom: [35, 5],
  };
  const awd: Record<Discipline, [number, number, number, number, number]> = {
    road: [25, 5, 65, 15, 25],
    street: [25, 5, 60, 15, 28],
    dirt: [40, 10, 70, 25, 35],
    rally: [35, 8, 65, 22, 30],
    cross_country: [45, 12, 75, 30, 40],
    drag: [70, 5, 90, 5, 35],
    drift: [20, 10, 95, 85, 20],
    top_speed: [35, 10, 55, 15, 35],
    pr_stunts: [35, 8, 65, 20, 30],
    custom: [30, 8, 55, 18, 30],
  };

  rationale.differential =
    discipline === 'drift'
      ? 'Drift keeps the rear near locked under power and highly coupled off throttle for predictable transitions; AWD retains a strong rear bias.'
      : discipline === 'drag'
        ? 'Drag uses high driven-axle acceleration lock and very low coast lock for launch traction without unnecessary braking bind.'
        : ['dirt', 'rally', 'cross_country'].includes(discipline)
          ? 'Loose modes use stronger acceleration lock and moderate coast stability; AWD remains rear-biased enough to rotate.'
          : 'Road modes use moderate acceleration lock and low coast lock so power exits cleanly without binding turn-in. FWD stays more open to limit power understeer.';

  if (drivetrain === 'RWD') {
    const [accel, decel] = rwd[discipline];
    return { drivetrain, accelRearPct: p(accel + style), decelRearPct: p(decel) };
  }
  if (drivetrain === 'FWD') {
    const [accel, decel] = fwd[discipline];
    return { drivetrain, accelFrontPct: p(accel + style), decelFrontPct: p(decel) };
  }
  const [frontAccel, frontDecel, rearAccel, rearDecel, centerFront] = awd[discipline];
  return {
    drivetrain,
    accelFrontPct: p(frontAccel + style),
    decelFrontPct: p(frontDecel),
    accelRearPct: p(rearAccel + style),
    decelRearPct: p(rearDecel),
    centerBalanceFrontPct: p(centerFront),
  };
}
