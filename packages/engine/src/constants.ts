import type { Discipline, Drivetrain, Surface, TireCompound } from '@fh6/shared';

/**
 * Model constants for the tuning + PI engines.
 *
 * These are MODEL PARAMETERS (heuristics), not observed game facts — that is why
 * they live in the engine, not the data package. Each is documented with its
 * expected effect in docs/tuning-engine-design.md and is refined by feedback.
 * Confidence: medium/low. Nothing here is presented to the user as exact.
 */

export const DISCLAIMER =
  'Estimated results. In-game handling depends on game updates, DLC and balance patches, ' +
  'difficulty/assists, your controller or wheel setup, route/surface/weather, and driver technique. ' +
  'Estimated PI is an approximation (shown ±N), not an exact figure. Verify in-game and report results.';

// --- Tire grip -----------------------------------------------------------------
// Dimensionless lateral grip index per compound per surface (stock street ≈ 1.0).
export const TIRE_GRIP: Record<'tarmac' | 'dirt' | 'snow', Record<TireCompound, number>> = {
  tarmac: {
    stock: 1.0,
    street: 1.06,
    sport: 1.14,
    semi_slick: 1.22,
    slick: 1.3,
    drag: 1.1,
    rally: 0.98,
    offroad: 0.88,
    snow: 0.85,
    drift: 1.02,
  },
  dirt: {
    stock: 0.6,
    street: 0.62,
    sport: 0.64,
    semi_slick: 0.6,
    slick: 0.52,
    drag: 0.55,
    rally: 0.98,
    offroad: 1.02,
    snow: 0.82,
    drift: 0.6,
  },
  snow: {
    stock: 0.45,
    street: 0.48,
    sport: 0.5,
    semi_slick: 0.46,
    slick: 0.4,
    drag: 0.42,
    rally: 0.8,
    offroad: 0.85,
    snow: 1.0,
    drift: 0.5,
  },
};

/** Resolve grip for a compound on a discipline surface ('mixed' averages tarmac+dirt). */
export function tireGrip(compound: TireCompound, surface: Surface): number {
  if (surface === 'mixed') {
    return (TIRE_GRIP.tarmac[compound] + TIRE_GRIP.dirt[compound]) / 2;
  }
  return TIRE_GRIP[surface][compound];
}

// --- Suspension ride frequency (Hz) target per surface -------------------------
export const RIDE_FREQUENCY: Record<Surface, { front: number; rear: number }> = {
  tarmac: { front: 2.2, rear: 2.35 },
  dirt: { front: 1.5, rear: 1.6 },
  snow: { front: 1.4, rear: 1.5 },
  mixed: { front: 1.85, rear: 1.95 },
};

// --- Damping (fraction of the slider range) ------------------------------------
export const DAMPING_REBOUND_FRACTION: Record<Surface, number> = {
  tarmac: 0.6,
  dirt: 0.42,
  snow: 0.36,
  mixed: 0.5,
};
/** Bump damping as a fraction of rebound damping (bump softer than rebound). */
export const BUMP_TO_REBOUND_RATIO = 0.7;

// --- Anti-roll bar base stiffness (fraction of slider range) -------------------
export const ARB_BASE_STIFFNESS: Record<Surface, number> = {
  tarmac: 0.62,
  dirt: 0.36,
  snow: 0.3,
  mixed: 0.5,
};

// --- Tire pressure base (psi, warm target-ish) ---------------------------------
export const TIRE_PRESSURE_BASE: Record<Surface, number> = {
  tarmac: 29.0,
  dirt: 26.0,
  snow: 25.0,
  mixed: 27.0,
};

// --- Physical constants --------------------------------------------------------
export const UNSPRUNG_FRACTION = 0.15;
export const DEFAULT_TIRE_RADIUS_M = 0.33;
export const GRAVITY = 9.80665;

// --- PI delta model coefficients ----------------------------------------------
// PI_est = stockPI + sum of these * (built - stock) metric deltas.
export const PI_COEFF = {
  /** PI points per hp/tonne of power-to-weight delta. */
  powerToWeight: 0.85,
  /** PI points per unit of grip-factor delta. */
  grip: 320,
  /** PI points per kgf of total max downforce potential (front+rear). */
  aeroPerKgf: 0.05,
  /** PI points per unit braking-factor delta. */
  braking: 90,
  /** PI points per unit launch-factor delta. */
  launch: 40,
};
export const PI_UNCERTAINTY_BASE = 6;
export const PI_UNCERTAINTY_SLOPE = 0.12;
export const PI_UNCERTAINTY_CAP = 60;

// --- Objective scoring weights per discipline ---------------------------------
export interface MetricWeights {
  accel: number;
  grip: number;
  braking: number;
  launch: number;
  topSpeed: number;
  /** How well the build's drivetrain suits the discipline (see DRIVETRAIN_FIT). */
  balance: number;
}

// Each row sums to ~1. `balance` scores the drivetrain's fit for the goal — a
// first-order build decision the raw performance metrics miss (drift needs RWD,
// loose-surface and drag reward AWD traction). `launch` is kept low where AWD
// should not be rewarded just for launching (notably drift), so `balance` — not
// launch — drives the drivetrain choice.
export const SCORE_WEIGHTS: Record<Discipline, MetricWeights> = {
  road: { accel: 0.24, grip: 0.33, braking: 0.15, launch: 0.03, topSpeed: 0.18, balance: 0.07 },
  street: { accel: 0.27, grip: 0.29, braking: 0.12, launch: 0.05, topSpeed: 0.2, balance: 0.07 },
  dirt: { accel: 0.23, grip: 0.37, braking: 0.08, launch: 0.13, topSpeed: 0.07, balance: 0.12 },
  rally: { accel: 0.23, grip: 0.35, braking: 0.08, launch: 0.14, topSpeed: 0.08, balance: 0.12 },
  cross_country: {
    accel: 0.2,
    grip: 0.38,
    braking: 0.08,
    launch: 0.14,
    topSpeed: 0.08,
    balance: 0.12,
  },
  drag: { accel: 0.38, grip: 0.05, braking: 0.02, launch: 0.33, topSpeed: 0.12, balance: 0.1 },
  drift: { accel: 0.34, grip: 0.24, braking: 0.04, launch: 0.02, topSpeed: 0.14, balance: 0.22 },
  top_speed: { accel: 0.18, grip: 0.05, braking: 0.0, launch: 0.03, topSpeed: 0.7, balance: 0.04 },
  pr_stunts: {
    accel: 0.28,
    grip: 0.24,
    braking: 0.05,
    launch: 0.13,
    topSpeed: 0.22,
    balance: 0.08,
  },
  custom: { accel: 0.24, grip: 0.31, braking: 0.13, launch: 0.07, topSpeed: 0.18, balance: 0.07 },
};

/**
 * Discipline suitability of each drivetrain (0..1), from FH community consensus.
 * Captures the single biggest build decision the performance metrics can't see:
 * drift strongly wants RWD, loose surfaces and drag reward AWD traction, circuit
 * and top-speed are near-neutral. Feeds the `balance` metric so the optimizer
 * accepts a drivetrain swap only when it fits the goal.
 */
export const DRIVETRAIN_FIT: Record<Discipline, Record<Drivetrain, number>> = {
  road: { AWD: 0.85, RWD: 0.95, FWD: 0.7 },
  street: { AWD: 0.85, RWD: 0.95, FWD: 0.72 },
  dirt: { AWD: 1.0, RWD: 0.6, FWD: 0.55 },
  rally: { AWD: 1.0, RWD: 0.6, FWD: 0.55 },
  cross_country: { AWD: 1.0, RWD: 0.55, FWD: 0.5 },
  drag: { AWD: 1.0, RWD: 0.72, FWD: 0.45 },
  drift: { AWD: 0.4, RWD: 1.0, FWD: 0.1 },
  top_speed: { AWD: 0.9, RWD: 1.0, FWD: 0.85 },
  pr_stunts: { AWD: 1.0, RWD: 0.8, FWD: 0.7 },
  custom: { AWD: 0.9, RWD: 0.9, FWD: 0.8 },
};

/** Strategy tilt applied on top of the discipline weights, then re-normalized. */
export const STRATEGY_TILT: Record<'grip' | 'balanced' | 'speed', Partial<MetricWeights>> = {
  grip: { grip: 0.12, braking: 0.04, topSpeed: -0.1, accel: -0.06 },
  balanced: {},
  speed: { topSpeed: 0.1, accel: 0.08, grip: -0.14, braking: -0.04 },
};
