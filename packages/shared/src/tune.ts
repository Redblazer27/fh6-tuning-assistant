import type { Drivetrain } from './enums.ts';

/**
 * TuneSpec — the complete in-game tune, laid out in FH6 tuning-menu order.
 *
 * Dimensioned fields (spring rate, ride height, downforce, pressure) are expressed
 * in the units declared by `units`, which the engine copies from the car's TuneRanges
 * so a value can always be labelled correctly by the UI and in exports.
 *
 * Forza-scale fields (ARBs, damping) are unitless slider values within the car's
 * per-part min/max range.
 */

export interface TuneUnits {
  pressure: 'psi';
  springRate: 'kgf/mm' | 'lbf/in' | 'N/mm';
  rideHeight: 'cm' | 'in';
  downforce: 'kgf' | 'lbf';
}

export interface TirePressureTune {
  frontPsi: number;
  rearPsi: number;
}

export interface GearingTune {
  finalDrive: number;
  /** Individual gear ratios, index 0 = 1st gear. Length = number of gears. */
  gears: number[];
}

export interface AlignmentTune {
  camberFrontDeg: number;
  camberRearDeg: number;
  toeFrontDeg: number;
  toeRearDeg: number;
  casterDeg: number;
}

export interface ArbTune {
  /** Forza anti-roll bar slider (per-car range, typically ~1..65). */
  front: number;
  rear: number;
}

export interface SpringsTune {
  frontRate: number;
  rearRate: number;
  frontRideHeight: number;
  rearRideHeight: number;
}

export interface DampingTune {
  reboundFront: number;
  reboundRear: number;
  bumpFront: number;
  bumpRear: number;
}

export interface AeroTune {
  frontDownforce: number;
  rearDownforce: number;
}

export interface BrakeTune {
  /** Front brake balance, 0..100 (%). Higher = more front bias. */
  balanceFrontPct: number;
  /** Brake pressure, 0..100+ (%). */
  pressurePct: number;
}

export interface DifferentialTune {
  drivetrain: Drivetrain;
  /** RWD/AWD rear axle accel & decel lock (%). */
  accelRearPct?: number;
  decelRearPct?: number;
  /** FWD/AWD front axle accel & decel lock (%). */
  accelFrontPct?: number;
  decelFrontPct?: number;
  /** AWD center differential balance — % of torque to the FRONT axle. */
  centerBalanceFrontPct?: number;
}

export interface TuneSpec {
  units: TuneUnits;
  tires: TirePressureTune;
  gearing: GearingTune;
  alignment: AlignmentTune;
  antiRollBars: ArbTune;
  springs: SpringsTune;
  damping: DampingTune;
  aero: AeroTune | null;
  brakes: BrakeTune;
  differential: DifferentialTune;
}

/** Deep-partial of a TuneSpec, used for user manual overrides. */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};
export type TuneOverrides = DeepPartial<TuneSpec>;
