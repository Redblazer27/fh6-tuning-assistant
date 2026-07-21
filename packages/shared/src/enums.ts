/**
 * Canonical enumerations for the FH6 domain.
 *
 * These `as const` arrays are the single source of truth for allowed values.
 * The data layer builds Zod schemas from them (`z.enum(DRIVETRAINS)`), and the
 * engine / UI use the derived union types. Keep values in sync here only.
 */

// --- Drivetrain ---------------------------------------------------------------
export const DRIVETRAINS = ['FWD', 'RWD', 'AWD'] as const;
export type Drivetrain = (typeof DRIVETRAINS)[number];

// --- Aspiration ---------------------------------------------------------------
export const ASPIRATIONS = [
  'NA', // naturally aspirated
  'turbo',
  'twin_turbo',
  'supercharged',
  'centrifugal',
] as const;
export type Aspiration = (typeof ASPIRATIONS)[number];

// --- Engine type --------------------------------------------------------------
// Drives which swap/part sets a car can use. Rotary and electric platforms have
// materially different upgrade paths (and swap options) than piston engines.
export const ENGINE_TYPES = ['piston', 'rotary', 'electric', 'hybrid'] as const;
export type EngineType = (typeof ENGINE_TYPES)[number];

// --- Activity / discipline ----------------------------------------------------
export const DISCIPLINES = [
  'road',
  'street',
  'dirt',
  'rally',
  'cross_country',
  'drag',
  'drift',
  'top_speed',
  'pr_stunts',
  'custom',
] as const;
export type Discipline = (typeof DISCIPLINES)[number];

export const DISCIPLINE_LABELS: Record<Discipline, string> = {
  road: 'Road Racing',
  street: 'Street Racing',
  dirt: 'Dirt Racing',
  rally: 'Rally / Cross-Country',
  cross_country: 'Cross Country',
  drag: 'Drag',
  drift: 'Drift',
  top_speed: 'Top Speed',
  pr_stunts: 'PR Stunts',
  custom: 'Custom Route',
};

/** Dominant surface for a discipline — drives suspension compliance & tire choices. */
export const SURFACES = ['tarmac', 'dirt', 'snow', 'mixed'] as const;
export type Surface = (typeof SURFACES)[number];

export const DISCIPLINE_SURFACE: Record<Discipline, Surface> = {
  road: 'tarmac',
  street: 'tarmac',
  dirt: 'dirt',
  rally: 'mixed',
  cross_country: 'dirt',
  drag: 'tarmac',
  drift: 'tarmac',
  top_speed: 'tarmac',
  pr_stunts: 'tarmac',
  custom: 'mixed',
};

// --- Tire compounds -----------------------------------------------------------
export const TIRE_COMPOUNDS = [
  'stock',
  'street',
  'sport',
  'semi_slick',
  'slick',
  'drag',
  'rally',
  'offroad',
  'snow',
  'drift',
] as const;
export type TireCompound = (typeof TIRE_COMPOUNDS)[number];

// --- PI classes ---------------------------------------------------------------
// FH6 class letters and PI bands, derived empirically from the official car list
// (forza.net/fh6cars, 627 cars, zero overlaps). NOTE: FH6 shifted every band down
// ~100 from the FH5 convention and renamed the top class X → R.
export const CLASS_LETTERS = ['D', 'C', 'B', 'A', 'S1', 'S2', 'R'] as const;
export type ClassLetter = (typeof CLASS_LETTERS)[number];

/** Inclusive PI ranges per class (FH6, from official data). Admin-correctable. */
export const CLASS_PI_RANGE: Record<ClassLetter, readonly [number, number]> = {
  D: [100, 400],
  C: [401, 500],
  B: [501, 600],
  A: [601, 700],
  S1: [701, 800],
  S2: [801, 900],
  R: [901, 999],
};

export const PI_MIN = 100;
export const PI_MAX = 999;

/** Map a PI value to its class letter. */
export function piToClass(pi: number): ClassLetter {
  for (const letter of CLASS_LETTERS) {
    const [min, max] = CLASS_PI_RANGE[letter];
    if (pi >= min && pi <= max) return letter;
  }
  return pi < PI_MIN ? 'D' : 'R';
}

/** The maximum legal PI for a target class (its upper bound). */
export function classMaxPi(letter: ClassLetter): number {
  return CLASS_PI_RANGE[letter][1];
}

/** The minimum PI for a target class (its lower bound). */
export function classMinPi(letter: ClassLetter): number {
  return CLASS_PI_RANGE[letter][0];
}

// --- Confidence & sources -----------------------------------------------------
export const CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export const SOURCE_TYPES = ['official', 'community', 'inferred'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

// --- Player setup -------------------------------------------------------------
export const INPUT_DEVICES = ['controller', 'wheel'] as const;
export type InputDevice = (typeof INPUT_DEVICES)[number];

export const DRIVING_STYLES = ['smooth', 'balanced', 'aggressive'] as const;
export type DrivingStyle = (typeof DRIVING_STYLES)[number];

// --- Upgrade categories (parts you buy in the Upgrades menu) ------------------
export const UPGRADE_CATEGORIES = [
  // Conversions
  'engine_swap',
  'drivetrain_swap',
  'aspiration',
  // Engine (power)
  'intake',
  'fuel_system',
  'ignition',
  'exhaust',
  'camshaft',
  'valves',
  'displacement',
  'pistons_compression',
  'intercooler',
  'oil_cooling',
  'flywheel',
  'forced_induction', // turbo/super install & upgrade
  // Platform & handling
  'brakes',
  'springs_dampers',
  'front_arb',
  'rear_arb',
  'chassis_reinforcement',
  'weight_reduction',
  // Drivetrain
  'clutch',
  'transmission',
  'driveline',
  'differential',
  // Tires & rims
  'tire_compound',
  'front_tire_width',
  'rear_tire_width',
  'rim_style',
  'rim_size',
  // Aero & appearance
  'front_aero',
  'rear_aero',
] as const;
export type UpgradeCategory = (typeof UPGRADE_CATEGORIES)[number];

/** The tunable sections in the FH6 tuning menu (in menu order). */
export const TUNING_CATEGORIES = [
  'tires',
  'gearing',
  'alignment',
  'antiroll_bars',
  'springs',
  'damping',
  'aero',
  'brakes',
  'differential',
] as const;
export type TuningCategory = (typeof TUNING_CATEGORIES)[number];
