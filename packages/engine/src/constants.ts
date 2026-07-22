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
  /**
   * How well the discipline-variant parts fit the goal — a blend of tire compound
   * (TIRE_FIT), springs/dampers (SUSPENSION_FIT) and differential (DIFF_FIT). This
   * is what makes a drift build pick drift tires, drift springs and a drift diff
   * even though a race setup grips harder in the raw metrics.
   */
  setupFit: number;
}

// Each row sums to ~1. `balance` scores the drivetrain's fit for the goal and
// `setupFit` the discipline-variant parts (tires + springs + diff) — first-order
// build decisions the raw metrics miss or get wrong (drift needs RWD + drift
// tires/springs/diff despite their lower raw grip; loose surfaces want rally/
// off-road parts). `launch` is kept low where AWD should not be rewarded just for
// launching (notably drift), and `grip` is trimmed where `setupFit` must pull the
// parts off the grippiest (race) options — the fit metrics, not raw grip, drive
// those choices. `setupFit` is weighted heavily only where variant parts matter
// (drift, dirt, rally); on tarmac the race parts win on both, so it just reinforces.
export const SCORE_WEIGHTS: Record<Discipline, MetricWeights> = {
  road: { accel: 0.24, grip: 0.28, braking: 0.15, launch: 0.03, topSpeed: 0.18, balance: 0.07, setupFit: 0.05 }, // prettier-ignore
  street: { accel: 0.27, grip: 0.24, braking: 0.12, launch: 0.05, topSpeed: 0.2, balance: 0.07, setupFit: 0.05 }, // prettier-ignore
  dirt: { accel: 0.23, grip: 0.21, braking: 0.08, launch: 0.13, topSpeed: 0.07, balance: 0.12, setupFit: 0.16 }, // prettier-ignore
  rally: { accel: 0.23, grip: 0.19, braking: 0.08, launch: 0.14, topSpeed: 0.08, balance: 0.12, setupFit: 0.16 }, // prettier-ignore
  cross_country: { accel: 0.2, grip: 0.22, braking: 0.08, launch: 0.14, topSpeed: 0.08, balance: 0.12, setupFit: 0.16 }, // prettier-ignore
  drag: { accel: 0.34, grip: 0.05, braking: 0.02, launch: 0.33, topSpeed: 0.12, balance: 0.1, setupFit: 0.04 }, // prettier-ignore
  drift: { accel: 0.28, grip: 0.12, braking: 0.03, launch: 0.02, topSpeed: 0.06, balance: 0.19, setupFit: 0.3 }, // prettier-ignore
  top_speed: { accel: 0.18, grip: 0.05, braking: 0.0, launch: 0.03, topSpeed: 0.67, balance: 0.04, setupFit: 0.03 }, // prettier-ignore
  pr_stunts: { accel: 0.28, grip: 0.19, braking: 0.05, launch: 0.13, topSpeed: 0.22, balance: 0.08, setupFit: 0.05 }, // prettier-ignore
  custom: { accel: 0.24, grip: 0.26, braking: 0.13, launch: 0.07, topSpeed: 0.18, balance: 0.07, setupFit: 0.05 }, // prettier-ignore
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

/**
 * Discipline suitability of each tire compound (0..1). Unlike the raw `grip`
 * metric — which always favours the highest-grip compound for the surface —
 * this captures *purpose*: drift tires are the right choice for drift even
 * though slicks grip harder, and loose surfaces want rally/off-road rubber.
 * For grip disciplines it simply tracks grip (slicks on top), so it reinforces
 * rather than fights that metric; only where purpose and raw grip diverge
 * (notably drift, and drag) does it flip the choice. Compounds not listed use
 * `default`.
 */
export const TIRE_FIT: Record<
  Discipline,
  { default: number } & Partial<Record<TireCompound, number>>
> = {
  road: { default: 0.5, slick: 1.0, semi_slick: 0.92, sport: 0.75, street: 0.6, drag: 0.7 },
  street: { default: 0.5, slick: 1.0, semi_slick: 0.95, sport: 0.85, street: 0.72, drag: 0.7 },
  dirt: { default: 0.4, offroad: 1.0, rally: 0.96, snow: 0.6, sport: 0.5, street: 0.45 },
  rally: { default: 0.4, rally: 1.0, offroad: 0.9, snow: 0.6, sport: 0.5, street: 0.45 },
  cross_country: { default: 0.4, offroad: 1.0, rally: 0.85, snow: 0.6, sport: 0.5 },
  drag: { default: 0.5, drag: 1.0, slick: 0.85, semi_slick: 0.78, sport: 0.6, street: 0.5 },
  drift: { default: 0.45, drift: 1.0, slick: 0.6, semi_slick: 0.58, sport: 0.55, street: 0.5 },
  top_speed: { default: 0.6, slick: 1.0, semi_slick: 0.92, drag: 0.9, sport: 0.85, street: 0.75 },
  pr_stunts: {
    default: 0.55,
    slick: 0.95,
    semi_slick: 0.92,
    sport: 0.85,
    offroad: 0.7,
    rally: 0.7,
  },
  custom: { default: 0.7, slick: 0.85, semi_slick: 0.82, sport: 0.78 },
};

/**
 * Discipline suitability of the springs/dampers tier (0..1), keyed by the part's
 * `tier` (stock | sport | race | rally | drift). Race is the grippiest on tarmac
 * and wins there; drift and loose surfaces want their purpose-built variant even
 * though it grips a little less. Feeds `setupFit`. Tiers not listed use `default`.
 */
export const SUSPENSION_FIT: Record<Discipline, { default: number } & Record<string, number>> = {
  road: { default: 0.5, race: 1.0, sport: 0.72, rally: 0.45, drift: 0.5, stock: 0.35 },
  street: { default: 0.5, race: 1.0, sport: 0.78, rally: 0.45, drift: 0.5, stock: 0.35 },
  dirt: { default: 0.45, rally: 1.0, race: 0.6, drift: 0.4, sport: 0.5, stock: 0.35 },
  rally: { default: 0.45, rally: 1.0, race: 0.6, drift: 0.4, sport: 0.5, stock: 0.35 },
  cross_country: { default: 0.45, rally: 1.0, race: 0.55, drift: 0.4, sport: 0.5, stock: 0.35 },
  drag: { default: 0.5, race: 1.0, sport: 0.75, drift: 0.5, rally: 0.4, stock: 0.4 },
  drift: { default: 0.45, drift: 1.0, race: 0.55, rally: 0.5, sport: 0.5, stock: 0.4 },
  top_speed: { default: 0.5, race: 1.0, sport: 0.8, drift: 0.5, rally: 0.4, stock: 0.4 },
  pr_stunts: { default: 0.5, race: 1.0, rally: 0.7, sport: 0.6, drift: 0.5, stock: 0.4 },
  custom: { default: 0.7, race: 0.9, sport: 0.75, rally: 0.7, drift: 0.7, stock: 0.5 },
};

/**
 * Discipline suitability of the differential tier (0..1), keyed by the part's
 * `tier` (stock | sport | race | rally | drift | offroad). A tunable race diff is
 * the default best; drift wants a drift diff (near-locked rear), loose surfaces a
 * rally/off-road diff. Feeds `setupFit`. Tiers not listed use `default`.
 */
export const DIFF_FIT: Record<Discipline, { default: number } & Record<string, number>> = {
  road: { default: 0.5, race: 1.0, sport: 0.72, drift: 0.5, rally: 0.5, offroad: 0.4, stock: 0.35 },
  street: {
    default: 0.5,
    race: 1.0,
    sport: 0.75,
    drift: 0.5,
    rally: 0.5,
    offroad: 0.4,
    stock: 0.35,
  },
  dirt: {
    default: 0.45,
    offroad: 1.0,
    rally: 0.95,
    race: 0.6,
    sport: 0.5,
    drift: 0.4,
    stock: 0.35,
  },
  rally: {
    default: 0.45,
    rally: 1.0,
    offroad: 0.9,
    race: 0.6,
    sport: 0.5,
    drift: 0.4,
    stock: 0.35,
  },
  cross_country: { default: 0.45, offroad: 1.0, rally: 0.9, race: 0.55, sport: 0.5, stock: 0.35 },
  drag: { default: 0.5, race: 1.0, sport: 0.72, drift: 0.5, rally: 0.45, stock: 0.4 },
  drift: {
    default: 0.45,
    drift: 1.0,
    race: 0.6,
    sport: 0.55,
    rally: 0.55,
    offroad: 0.5,
    stock: 0.4,
  },
  top_speed: { default: 0.5, race: 1.0, sport: 0.75, stock: 0.5 },
  pr_stunts: { default: 0.5, race: 1.0, rally: 0.7, offroad: 0.65, sport: 0.6, stock: 0.4 },
  custom: {
    default: 0.7,
    race: 0.9,
    sport: 0.75,
    rally: 0.7,
    drift: 0.7,
    offroad: 0.7,
    stock: 0.5,
  },
};

/** Strategy tilt applied on top of the discipline weights, then re-normalized. */
export const STRATEGY_TILT: Record<'grip' | 'balanced' | 'speed', Partial<MetricWeights>> = {
  grip: { grip: 0.12, braking: 0.04, topSpeed: -0.1, accel: -0.06 },
  balanced: {},
  speed: { topSpeed: 0.1, accel: 0.08, grip: -0.14, braking: -0.04 },
};

// --- Weight-distribution fit (car comparison only) -----------------------------
// Ideal static front weight %, and how fast fit falls off, per discipline. This
// is a LOW-confidence, secondary factor: no upgrade changes a car's weight
// distribution, so it never affects a single car's build. It is used only to
// rank *different cars* against each other for a goal — where a mid/rear-engine
// balance genuinely suits drift or a nose-light layout suits a loose surface.
export const WEIGHT_BALANCE_IDEAL: Record<Discipline, { front: number; spread: number }> = {
  road: { front: 49, spread: 14 },
  street: { front: 49, spread: 14 },
  dirt: { front: 50, spread: 16 },
  rally: { front: 50, spread: 16 },
  cross_country: { front: 50, spread: 16 },
  drag: { front: 45, spread: 16 }, // rear weight helps RWD launch
  drift: { front: 53, spread: 14 }, // front-engine RWD balance
  top_speed: { front: 50, spread: 18 },
  pr_stunts: { front: 50, spread: 16 },
  custom: { front: 50, spread: 16 },
};

/** Max ± points the weight-balance fit can move a car's comparison score. */
export const CHASSIS_COMPARE_SWING = 5;

// --- Telemetry diagnosis thresholds -------------------------------------------
// Turn a recorded session's summary into a handling diagnosis. These thresholds
// are HEURISTIC and LOW CONFIDENCE — FH6 slip-angle units aren't documented, so
// they should be calibrated against real captures. `understeerIndex` is the mean
// front-minus-rear slip angle (>0 = understeer, <0 = oversteer); slip values are
// mean combined slip per wheel (≈1 = at the limit, >1 = sliding).
export const TELEMETRY_DIAGNOSIS = {
  /** Below this many racing frames, a session is too short to diagnose. */
  minFrames: 60,
  /** |understeerIndex| for a mild / strong balance finding. */
  balanceMild: 0.05,
  balanceStrong: 0.12,
  /** Drive-axle mean slip above this reads as wheelspin / traction-limited. */
  wheelspinSlip: 1.15,
};
