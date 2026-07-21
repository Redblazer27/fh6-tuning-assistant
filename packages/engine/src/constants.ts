import type { Discipline, Surface, TireCompound } from '@fh6/shared';

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
}

export const SCORE_WEIGHTS: Record<Discipline, MetricWeights> = {
  road: { accel: 0.25, grip: 0.35, braking: 0.15, launch: 0.05, topSpeed: 0.2 },
  street: { accel: 0.28, grip: 0.3, braking: 0.12, launch: 0.08, topSpeed: 0.22 },
  dirt: { accel: 0.25, grip: 0.4, braking: 0.1, launch: 0.15, topSpeed: 0.1 },
  rally: { accel: 0.25, grip: 0.38, braking: 0.1, launch: 0.17, topSpeed: 0.1 },
  cross_country: { accel: 0.22, grip: 0.42, braking: 0.1, launch: 0.16, topSpeed: 0.1 },
  drag: { accel: 0.4, grip: 0.08, braking: 0.02, launch: 0.35, topSpeed: 0.15 },
  drift: { accel: 0.35, grip: 0.3, braking: 0.05, launch: 0.05, topSpeed: 0.25 },
  top_speed: { accel: 0.2, grip: 0.05, braking: 0.0, launch: 0.05, topSpeed: 0.7 },
  pr_stunts: { accel: 0.3, grip: 0.25, braking: 0.05, launch: 0.15, topSpeed: 0.25 },
  custom: { accel: 0.25, grip: 0.33, braking: 0.14, launch: 0.08, topSpeed: 0.2 },
};

/** Strategy tilt applied on top of the discipline weights, then re-normalized. */
export const STRATEGY_TILT: Record<'grip' | 'balanced' | 'speed', Partial<MetricWeights>> = {
  grip: { grip: 0.12, braking: 0.04, topSpeed: -0.1, accel: -0.06 },
  balanced: {},
  speed: { topSpeed: 0.1, accel: 0.08, grip: -0.14, braking: -0.04 },
};
