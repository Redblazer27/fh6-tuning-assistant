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

  const tires = computeTirePressure(ranges, surface, discipline, wd, wdRear, rationale);
  const gearing = computeGearing(car, spec, ranges, discipline, rationale);
  const alignment = computeAlignment(ranges, surface, discipline, spec, rationale);
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
  const damping = computeDamping(ranges, surface, discipline, rationale);
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
  ranges: TuneRanges,
  surface: Surface,
  discipline: Discipline,
  wd: number,
  wdRear: number,
  rationale: TuneResult['rationale'],
): TuneSpec['tires'] {
  if (discipline === 'drift') {
    // Drift (grip = control): FRONT a touch less grip (higher pressure) so it
    // won't rotate the car on entry; REAR lower pressure for tire deformation /
    // side bite so the car drives through the corner instead of skating. Rear
    // pressure is the primary grip knob — drop it for more grip, raise for less.
    const frontPsi = snapRange(ranges.tirePressurePsi, barToPsi(2.5)); // ~36 psi
    const rearPsi = snapRange(ranges.tirePressurePsi, barToPsi(1.5)); // ~22 psi
    rationale.tires =
      'Drift: front ~2.5 bar (slightly less grip so entries don’t snap the car around), rear ~1.5 bar ' +
      'for side bite and drive off the corner. Rear pressure is your main grip dial — lower = more grip.';
    return { frontPsi, rearPsi };
  }

  let base = TIRE_PRESSURE_BASE[surface];
  let frontAdj = 0;
  let rearAdj = 0;
  if (discipline === 'drag') {
    frontAdj -= 3;
    rearAdj += 1;
  } else if (discipline === 'top_speed') {
    base += 3;
  }
  const frontPsi = snapRange(ranges.tirePressurePsi, base + frontAdj + (wd - 0.5) * 4);
  const rearPsi = snapRange(ranges.tirePressurePsi, base + rearAdj + (wdRear - 0.5) * 4);
  rationale.tires =
    'Warm-pressure target for grip; lower on loose surfaces for compliance. Heavier axle set a ' +
    'touch higher. If grip feels low after a few laps, drop ~1–2 psi.';
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
  const r = DEFAULT_TIRE_RADIUS_M;
  const stockTop = car.stockTopSpeedKmh ?? 250;
  const vmax = stockTop * Math.cbrt(spec.powerHp / car.powerHp);

  const topFactor: Record<Discipline, number> = {
    top_speed: 1.0,
    drag: 0.9,
    road: 0.92,
    street: 0.92,
    dirt: 0.0,
    rally: 0.0,
    cross_country: 0.0,
    drift: 0.0,
    pr_stunts: 0.85,
    custom: 0.9,
  };
  // Drift no longer chases a top speed (see below); other technical disciplines
  // still target a fixed sensible top.
  const fixedTop: Partial<Record<Discipline, number>> = {
    dirt: 195,
    rally: 205,
    cross_country: 185,
  };
  const targetTop = clamp(fixedTop[discipline] ?? vmax * topFactor[discipline], 120, 480);

  const topGearRatio =
    discipline === 'top_speed'
      ? 0.92
      : discipline === 'drag'
        ? 0.95
        : ['dirt', 'rally', 'cross_country'].includes(discipline)
          ? 1.2
          : discipline === 'drift'
            ? 1.1
            : 1.0;
  const firstGearRatio = ['dirt', 'rally', 'cross_country', 'drift'].includes(discipline)
    ? 3.4
    : discipline === 'top_speed' || discipline === 'drag'
      ? 2.7
      : 3.1;

  // Drift keeps 6 gears so 3rd/4th can be the drift gears and 5/6 stay for cruising.
  const gearCount =
    discipline === 'drift' ? 6 : discipline === 'top_speed' || spec.powerHp > 600 ? 7 : 6;

  // Geometric spacing between 1st and top gear so shift points sit near the peak.
  const gears: number[] = [];
  for (let i = 0; i < gearCount; i += 1) {
    const t = i / (gearCount - 1); // gearCount is always 6 or 7
    const ratio = firstGearRatio * (topGearRatio / firstGearRatio) ** t;
    gears.push(snapRange(ranges.gearRatio, ratio));
  }

  let finalDrive: number;
  if (discipline === 'drift') {
    // Don't target a top speed. Raise the final drive so 3rd/4th (the drift gears)
    // sit high in the powerband at corner speeds and never bounce off the limiter
    // mid-slide. Anchor 4th gear's redline speed to a moderate drift speed that
    // scales gently with power; a low-power, high-revving car therefore gets a
    // shorter overall gearing (fixing the old "rev-limiter at ~109 km/h" build).
    const vDrift4 = clamp(115 + (spec.powerHp - 300) * 0.03, 105, 150); // km/h at redline in 4th
    const gear4 = gears[3] ?? gears[gears.length - 1]!;
    const wheelRpm4 = ((vDrift4 / 3.6 / r) * 60) / (2 * Math.PI);
    finalDrive = snapRange(ranges.finalDrive, redline / (wheelRpm4 * gear4));
    rationale.gearing =
      'Drift: final drive raised so 3rd and 4th are the drift gears — high in the powerband at corner ' +
      'speed, no rev-limiter bounce mid-slide. 1st/2nd short, 5th/6th just cruise. If 4th bogs at low ' +
      'speed, shorten it (or raise the final drive) a touch.';
  } else {
    // Final drive so redline in top gear lands at the target top speed.
    const vTarget = targetTop / 3.6; // m/s
    const wheelRpm = ((vTarget / r) * 60) / (2 * Math.PI);
    finalDrive = snapRange(ranges.finalDrive, redline / (wheelRpm * topGearRatio));
    rationale.gearing =
      'Final drive set so top gear tops out near your target speed; ratios spaced geometrically so ' +
      'each shift lands near peak power. Shorter for dirt/technical, taller for top speed.';
  }
  return { finalDrive, gears };
}

// --- Alignment ----------------------------------------------------------------
function computeAlignment(
  ranges: TuneRanges,
  surface: Surface,
  discipline: Discipline,
  spec: BuiltSpec,
  rationale: TuneResult['rationale'],
): TuneSpec['alignment'] {
  if (discipline === 'drift') {
    // Drift on a wheel (expert model): moderate front camber for a contact patch
    // at lock; REAR camber near zero because FH6 over-exaggerates it (rear grip is
    // what you want). Front toe-OUT fakes the positive Ackermann the game lacks
    // (angle + stability); rear toe-IN gives forward bite / drive. Caster MAXED —
    // on a wheel there's no downside: more self-steer, load transfer and camber
    // gain at lock.
    rationale.alignment =
      'Drift (wheel): ~-2.5° front camber, rear camber near zero for rear grip (FH6 over-does camber). ' +
      'Front toe-out fakes Ackermann for angle + stability; rear toe-in gives forward bite. Caster maxed ' +
      'for self-steer and grip.';
    return {
      camberFrontDeg: snapRange(ranges.camberDeg, -2.5),
      camberRearDeg: snapRange(ranges.camberDeg, -0.3),
      toeFrontDeg: snapRange(ranges.toeDeg, -1.0), // toe-OUT front
      toeRearDeg: snapRange(ranges.toeDeg, 0.5), // toe-IN rear
      casterDeg: ranges.casterDeg.max,
    };
  }

  const baseCamber: Record<Surface, number> = { tarmac: -1.3, dirt: -0.6, snow: -0.4, mixed: -0.9 };
  let camberFront = baseCamber[surface];
  if (['semi_slick', 'slick'].includes(spec.tireCompound)) camberFront -= 0.2;
  if (discipline === 'drag') camberFront += 1.0;
  if (discipline === 'top_speed') camberFront += 0.5;
  const camberRear = camberFront + 0.3; // rear a touch less negative

  let toeFront = 0;
  let toeRear = 0.1;
  if (['road', 'street'].includes(discipline)) toeFront = -0.1;
  if (['dirt', 'rally', 'cross_country'].includes(discipline)) toeRear = 0.15;

  let caster = 5.5;
  if (discipline === 'drag') caster = 4.5;

  rationale.alignment =
    'Negative camber for cornering contact (less for straight-line events), small front toe-out ' +
    'for turn-in, rear toe-in for stability, healthy caster for self-centering.';
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
  const base = ARB_BASE_STIFFNESS[surface];
  let frontFrac = base * (wd / 0.5);
  let rearFrac = base * (wdRear / 0.5);

  // Rotation bias: positive = more rotation (less understeer).
  let bias = spec.drivetrain === 'FWD' ? 0.08 : spec.drivetrain === 'RWD' ? -0.05 : 0;
  if (request.drivingStyle === 'aggressive') bias += 0.03;
  if (request.drivingStyle === 'smooth') bias -= 0.03;
  frontFrac -= bias;
  rearFrac += bias;

  if (discipline === 'drift') {
    // Drift (expert consensus across guides): bars run VERY soft (~5–7, not the
    // game's stiff default) so the car can roll and load its outside tires for grip.
    // Front kept a touch stiffer than rear: a stiffer front sharpens turn-in, a soft
    // rear is a pure grip aid (keeps the rear planted so you drive through the slide).
    frontFrac = 0.1;
    rearFrac = 0.065;
  }

  rationale.antiroll_bars =
    discipline === 'drift'
      ? 'Very soft bars for grip, front a touch stiffer than rear: stiffer front = sharper turn-in, soft ' +
        'rear = more rear grip so you drive through the slide. Stiffen the front a little if entries feel lazy.'
      : 'Bars scaled to axle weight, then biased for balance (stiffer rear reduces understeer, stiffer ' +
        'front reduces oversteer). Change these first for a handling-balance issue.';
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
  const freq = RIDE_FREQUENCY[surface];
  let freqFront = freq.front;
  let freqRear = freq.rear;
  if (discipline === 'drift') {
    freqFront *= 1.12;
    freqRear *= 0.95;
  }
  if (discipline === 'top_speed') {
    freqFront *= 0.95;
    freqRear *= 0.95;
  }

  const sprung = spec.massKg * (1 - UNSPRUNG_FRACTION);
  const cornerFront = (sprung * wd) / 2;
  const cornerRear = (sprung * wdRear) / 2;

  const rateNPerMm = (f: number, m: number): number => ((2 * Math.PI * f) ** 2 * m) / 1000;
  const toUnit = (nPerMm: number): number => {
    switch (ranges.springRate.unit) {
      case 'N/mm':
        return nPerMm;
      case 'kgf/mm':
        return nPerMmToKgfPerMm(nPerMm);
      default:
        return nPerMmToLbfPerIn(nPerMm);
    }
  };

  const frontRate = snapRange(ranges.springRate, toUnit(rateNPerMm(freqFront, cornerFront)));
  const rearRate = snapRange(ranges.springRate, toUnit(rateNPerMm(freqRear, cornerRear)));

  const rideBase: Record<Surface, number> = { tarmac: 0.14, dirt: 0.78, snow: 0.72, mixed: 0.5 };
  const rh = rideBase[surface];
  // Drift wants rake the OTHER way — rear LOWER than front — to load and settle the
  // rear suspension (rear grip / stability). Everything else keeps a slight
  // front-low rake for grip/aero.
  const frontRideHeight = fracToRange(ranges.rideHeight, discipline === 'drift' ? rh + 0.05 : rh);
  const rearRideHeight = fracToRange(ranges.rideHeight, discipline === 'drift' ? rh : rh + 0.04);

  rationale.springs =
    discipline === 'drift'
      ? 'Front stiffer than rear, both realistic (never full-stiff — that kills control). Rear ride ' +
        'height LOWER than front to load and settle the rear for grip and stability.'
      : 'Spring rates from target ride frequencies (stiffer on tarmac, softer on loose surfaces), scaled ' +
        'to each corner’s sprung mass. Ride height low for grip/aero, high for dirt to avoid bottoming.';
  return { frontRate, rearRate, frontRideHeight, rearRideHeight };
}

// --- Damping ------------------------------------------------------------------
function computeDamping(
  ranges: TuneRanges,
  surface: Surface,
  discipline: Discipline,
  rationale: TuneResult['rationale'],
): TuneSpec['damping'] {
  if (discipline === 'drift') {
    // Drift (expert model): HIGH rebound (slows the shock extending → the car feels
    // softer and stays settled), rear higher than front; LOW bump so the suspension
    // compresses quickly, rear softest. Front bump kept mid so the nose isn't twitchy.
    rationale.damping =
      'Drift: high rebound (keeps the car settled through transitions; rear a bit higher than front) and ' +
      'low bump (lets the suspension compress fast, rear softest). If the car won’t transition, drop rear rebound.';
    return {
      reboundFront: fracToRange(ranges.damping, 0.53),
      reboundRear: fracToRange(ranges.damping, 0.84),
      bumpFront: fracToRange(ranges.damping, 0.32),
      bumpRear: fracToRange(ranges.damping, 0.16),
    };
  }
  const reboundFrac = DAMPING_REBOUND_FRACTION[surface];
  const bumpFrac = reboundFrac * BUMP_TO_REBOUND_RATIO;
  rationale.damping =
    'Rebound firmer than bump, placed from a target damping ratio (softer on loose surfaces). Rear ' +
    'a touch firmer than front to match the stiffer rear springs.';
  return {
    reboundFront: fracToRange(ranges.damping, reboundFrac),
    reboundRear: fracToRange(ranges.damping, reboundFrac * 1.05),
    bumpFront: fracToRange(ranges.damping, bumpFrac),
    bumpRear: fracToRange(ranges.damping, bumpFrac * 1.05),
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

  const level: Record<Discipline, number> = {
    road: 0.85,
    street: 0.8,
    dirt: 0.6,
    rally: 0.6,
    cross_country: 0.6,
    drag: 0.0,
    drift: 0.05,
    top_speed: 0.0,
    pr_stunts: 0.4,
    custom: 0.7,
  };
  const lvl = level[discipline];
  const rearDF = rear.minKgf + lvl * (rear.maxKgf - rear.minKgf);
  const frontLvl = lvl * clamp(wd / 0.5, 0.6, 1.2) * 0.85;
  const frontDF = front.minKgf + frontLvl * (front.maxKgf - front.minKgf);

  const toUnit = (kgf: number): number => (ranges.aero.unit === 'lbf' ? kgf * 2.2046226218 : kgf);
  rationale.aero =
    'More downforce = more grip but more drag (lower top speed). Balanced front/rear for stability; ' +
    'set to zero for drag/top-speed runs.';
  return {
    frontDownforce: snapRange(ranges.aero, toUnit(clamp(frontDF, front.minKgf, front.maxKgf))),
    rearDownforce: snapRange(ranges.aero, toUnit(clamp(rearDF, rear.minKgf, rear.maxKgf))),
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
    // Drift (expert consensus): strong FRONT bias + REDUCED force so you can left-foot
    // brake to adjust angle without upsetting the car (too far front = over-rotate,
    // too far rear = bogs/straightens; too much force = snaps the car around). Guides
    // run ~70–85% front and ~40–60% force — this sits in the middle of that.
    rationale.brakes =
      'Drift: ~75% front brake bias and ~55% force so a dab of (left-foot) brake tightens your line ' +
      'instead of spinning or straightening the car. Drop the force further if the brakes feel too strong.';
    return {
      balanceFrontPct: snapRange(ranges.brakeBalancePct, 75),
      pressurePct: snapRange(ranges.brakePressurePct, 55),
    };
  }
  const balanceFront = 50 + (wd * 100 - 50) * 0.15;
  let pressure = 100;
  if (request.drivingStyle === 'smooth') pressure -= 2;
  rationale.brakes =
    'Balance biased slightly toward the heavier axle. Lower pressure a little in the wet to avoid lock-ups.';
  return {
    balanceFrontPct: snapRange(ranges.brakeBalancePct, balanceFront),
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
  const dt: Drivetrain = spec.drivetrain;
  const styleAccel =
    request.drivingStyle === 'aggressive' ? 5 : request.drivingStyle === 'smooth' ? -5 : 0;
  const p = (v: number) => snapRange(ranges.differentialPct, v);

  const rearAccelBase: Record<Discipline, number> = {
    road: 40,
    street: 45,
    dirt: 55,
    rally: 55,
    cross_country: 55,
    drag: 60,
    drift: 95,
    top_speed: 30,
    pr_stunts: 45,
    custom: 40,
  };
  const rearDecelBase =
    discipline === 'drift' ? 85 : ['dirt', 'rally', 'cross_country'].includes(discipline) ? 25 : 15;

  rationale.differential =
    discipline === 'drift'
      ? 'Drift: ~95% accel lock so both rear wheels drive together and break traction smoothly; ~85% ' +
        'decel so the diff frees up a little in transitions and big entries instead of over-rotating.'
      : 'Accel lock controls power-down and corner-exit traction; decel lock controls stability under ' +
        'braking. Higher accel for loose surfaces and drift; lower on FWD to cut understeer.';

  if (dt === 'FWD') {
    const accel =
      discipline === 'drift'
        ? 60
        : ['dirt', 'rally', 'cross_country'].includes(discipline)
          ? 45
          : 30;
    return {
      drivetrain: dt,
      accelFrontPct: p(accel + styleAccel),
      decelFrontPct: p(10),
    };
  }
  if (dt === 'RWD') {
    return {
      drivetrain: dt,
      accelRearPct: p(rearAccelBase[discipline] + styleAccel),
      decelRearPct: p(rearDecelBase),
    };
  }
  // AWD
  const centerFront =
    discipline === 'drift'
      ? 20
      : ['dirt', 'rally', 'cross_country'].includes(discipline)
        ? 40
        : discipline === 'top_speed'
          ? 35
          : 30;
  return {
    drivetrain: dt,
    centerBalanceFrontPct: p(centerFront),
    accelFrontPct: p(15),
    accelRearPct: p(rearAccelBase[discipline] + styleAccel),
    decelFrontPct: p(10),
    decelRearPct: p(rearDecelBase),
  };
}
