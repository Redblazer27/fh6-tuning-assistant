import { z } from 'zod';
import {
  ASPIRATIONS,
  CLASS_LETTERS,
  CONFIDENCE_LEVELS,
  DRIVETRAINS,
  ENGINE_TYPES,
  SOURCE_TYPES,
  TIRE_COMPOUNDS,
  TUNING_CATEGORIES,
  UPGRADE_CATEGORIES,
} from '@fh6/shared';

/**
 * Runtime schemas for all versioned data records. These are the single validation
 * authority: seed data, admin imports, and community imports all pass through here.
 * Types are inferred from the schemas (see types.ts) so the code and validation
 * can never drift apart.
 */

/** Build a Zod enum from a shared readonly const array while preserving its union type. */
const enumOf = <T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values as unknown as [T[number], ...T[number][]]);

export const drivetrainSchema = enumOf(DRIVETRAINS);
export const aspirationSchema = enumOf(ASPIRATIONS);
export const tireCompoundSchema = enumOf(TIRE_COMPOUNDS);
export const classLetterSchema = enumOf(CLASS_LETTERS);
export const confidenceSchema = enumOf(CONFIDENCE_LEVELS);
export const sourceTypeSchema = enumOf(SOURCE_TYPES);
export const upgradeCategorySchema = enumOf(UPGRADE_CATEGORIES);
export const tuningCategorySchema = enumOf(TUNING_CATEGORIES);
export const engineTypeSchema = enumOf(ENGINE_TYPES);

// --- Provenance shared by most records ---------------------------------------
export const provenanceSchema = z.object({
  /** Source record id (see sources.ts). */
  source: z.string().min(1),
  confidence: confidenceSchema,
  /** Data version this record was authored/verified against. */
  dataVersion: z.string().min(1),
  notes: z.string().optional(),
});

// --- Game / data version ------------------------------------------------------
export const gameVersionSchema = z.object({
  gameVersion: z.string().min(1),
  patch: z.string().optional(),
  dataVersion: z.string().min(1),
  releaseDate: z.string().min(1),
  notes: z.string().optional(),
});

// --- Sources ------------------------------------------------------------------
export const sourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  url: z.string().url().optional(),
  type: sourceTypeSchema,
  /** Default confidence for records that cite this source without their own. */
  defaultConfidence: confidenceSchema,
  notes: z.string().optional(),
});

// --- Cars ---------------------------------------------------------------------
export const carStatsSchema = z.object({
  /** FH-style 0..10 star ratings (as shown on the stock car card). */
  speed: z.number().min(0).max(10),
  handling: z.number().min(0).max(10),
  acceleration: z.number().min(0).max(10),
  launch: z.number().min(0).max(10),
  braking: z.number().min(0).max(10),
});

export const carSchema = provenanceSchema.extend({
  id: z.string().min(1),
  // Upper bound is generous: FH6 includes fictional/future vehicles (e.g. the
  // Halo "Warthog", model year 2554).
  year: z.number().int().min(1900).max(3000),
  make: z.string().min(1),
  model: z.string().min(1),
  /** Full display name, e.g. "1998 Toyota Supra RZ". */
  name: z.string().min(1),
  /** How the player obtains it: base game, or a DLC/car-pack name. */
  ownership: z.string().min(1),
  isBaseGame: z.boolean(),
  stockClass: classLetterSchema,
  stockPI: z.number().int().min(100).max(999),
  // Physics fields are OPTIONAL: the official roster provides authoritative
  // identity/class/PI/DLC but not mass/power/drivetrain/aspiration. When absent,
  // the engine fills transparent class-based defaults and labels the build's
  // confidence accordingly (see resolveEffectiveCar). Never fabricate: leave
  // genuinely-unknown physics undefined rather than storing a guessed number.
  drivetrain: drivetrainSchema.optional(),
  massKg: z.number().positive().optional(),
  /** Static front weight distribution, percent (e.g. 53 = 53% front). */
  weightDistFrontPct: z.number().min(20).max(80).optional(),
  powerHp: z.number().positive().optional(),
  torqueNm: z.number().positive().optional(),
  aspiration: aspirationSchema.optional(),
  engineName: z.string().optional(),
  displacementL: z.number().positive().optional(),
  cylinders: z.number().int().positive().optional(),
  stockTireCompound: tireCompoundSchema.optional(),
  stats: carStatsSchema.optional(),
  /** Optional physical hints; sensible defaults are used when absent. */
  wheelbaseMm: z.number().positive().optional(),
  redlineRpm: z.number().positive().optional(),
  powerPeakRpm: z.number().positive().optional(),
  stockTopSpeedKmh: z.number().positive().optional(),
});

// --- Parts (upgrades you buy) -------------------------------------------------
export const aeroCapabilitySchema = z.object({
  /** Downforce capability the installed aero part provides, in kgf. */
  minKgf: z.number().min(0),
  maxKgf: z.number().min(0),
});

export const partEffectsSchema = z.object({
  powerMultiplier: z.number().positive().optional(),
  powerHpDelta: z.number().optional(),
  /** Absolute base power (hp) an engine swap installs, replacing the stock engine's. */
  setsPowerHp: z.number().positive().optional(),
  massKgDelta: z.number().optional(),
  massMultiplier: z.number().positive().optional(),
  /** Mechanical grip multiplier (tires, width, compound). */
  gripMultiplier: z.number().positive().optional(),
  brakingMultiplier: z.number().positive().optional(),
  launchMultiplier: z.number().positive().optional(),
  /** Adjustable aero capability unlocked by this part. */
  aeroFront: aeroCapabilitySchema.optional(),
  aeroRear: aeroCapabilitySchema.optional(),
});

export const partSchema = provenanceSchema.extend({
  id: z.string().min(1),
  category: upgradeCategorySchema,
  name: z.string().min(1),
  /** Progression rank within a category (0 = stock). Higher = more upgraded. */
  tierRank: z.number().int().min(0),
  /** Short tier label, e.g. 'stock' | 'street' | 'sport' | 'race' | 'rally' | 'drift'. */
  tier: z.string().min(1),
  effects: partEffectsSchema.default({}),
  /** Tuning menu sections this part unlocks. */
  unlocks: z.array(tuningCategorySchema).default([]),
  /** Conversion outcomes. */
  setsDrivetrain: drivetrainSchema.optional(),
  setsAspiration: aspirationSchema.optional(),
  setsTireCompound: tireCompoundSchema.optional(),
  /** Estimated credit cost. */
  cost: z.number().min(0).default(0),
  /** Whether this is a visible/body change (affects the "stock-looking" constraint). */
  cosmeticVisible: z.boolean().default(false),
  /** If true, this part is a wing/splitter subject to the "no aero" constraint. */
  isAeroPart: z.boolean().default(false),
});

// --- Per-car upgrade profile --------------------------------------------------
// Which conversions and parts a *specific* car allows. This is what lets rotary
// cars, hypercars with locked upgrade paths, and cars with limited swap options
// differ from the global catalog. Every field is optional/defaulted so that a car
// WITHOUT a profile behaves exactly as before (full global catalog available).
export const carUpgradeProfileSchema = provenanceSchema.extend({
  /** The car this profile applies to. */
  carId: z.string().min(1),
  /** Engine family; rotary/electric platforms use different swap & part sets. */
  engineType: engineTypeSchema.default('piston'),
  /**
   * Engine-swap part ids available for this car (a subset of the global
   * `engine_swap` catalog). Omit = all catalog swaps allowed (default). An empty
   * array = swaps are locked (the in-game Engine Swap tab does not appear).
   */
  availableEngineSwapIds: z.array(z.string().min(1)).optional(),
  /** Drivetrain-swap part ids available. Omit = all allowed; empty = none. */
  availableDrivetrainSwapIds: z.array(z.string().min(1)).optional(),
  /** Upgrade categories this car cannot modify at all (stock part only). */
  lockedCategories: z.array(upgradeCategorySchema).default([]),
  /** Specific part ids this car cannot use (blocklist; stock is always allowed). */
  restrictedPartIds: z.array(z.string().min(1)).default([]),
  /**
   * Real FH6 conversion options for this car, by display name (from the community
   * wiki). Descriptive: they record what the game actually offers so the app can
   * show a car's true engine-swap / forced-induction choices, even where the
   * optimizer still models a swap generically.
   */
  engineSwapOptions: z.array(z.string().min(1)).default([]),
  aspirationOptions: z.array(z.string().min(1)).default([]),
});

// --- Tunable ranges -----------------------------------------------------------
const rangeSchema = z.object({
  min: z.number(),
  max: z.number(),
  step: z.number().positive(),
});

export const tuneRangesSchema = provenanceSchema.extend({
  /** null id = the default template; otherwise a car id override. */
  id: z.string().min(1),
  appliesToCarId: z.string().nullable().default(null),
  tirePressurePsi: rangeSchema,
  finalDrive: rangeSchema,
  gearRatio: rangeSchema,
  camberDeg: rangeSchema,
  toeDeg: rangeSchema,
  casterDeg: rangeSchema,
  arb: rangeSchema,
  springRate: rangeSchema.extend({ unit: z.enum(['kgf/mm', 'lbf/in', 'N/mm']) }),
  rideHeight: rangeSchema.extend({ unit: z.enum(['cm', 'in']) }),
  damping: rangeSchema,
  aero: rangeSchema.extend({ unit: z.enum(['kgf', 'lbf']) }),
  brakeBalancePct: rangeSchema,
  brakePressurePct: rangeSchema,
  differentialPct: rangeSchema,
});

// --- Feedback (user-reported results; stored client-side) ---------------------
export const feedbackSymptomSchema = z.string().min(1);

export const feedbackSchema = z.object({
  buildId: z.string().min(1),
  createdAt: z.string().min(1),
  lapTimeSec: z.number().positive().optional(),
  event: z.string().optional(),
  route: z.string().optional(),
  surface: z.string().optional(),
  symptoms: z.array(feedbackSymptomSchema).default([]),
  notes: z.string().optional(),
  /** Optional summarized telemetry signals (from the bridge / CSV import). */
  telemetrySummary: z.record(z.string(), z.number()).optional(),
});

// --- The complete versioned dataset ------------------------------------------
export const datasetSchema = z.object({
  version: gameVersionSchema,
  sources: z.array(sourceSchema).min(1),
  cars: z.array(carSchema).min(1),
  parts: z.array(partSchema).min(1),
  tuneRanges: z.array(tuneRangesSchema).min(1),
  /** Per-car upgrade profiles. Optional — cars without one use the full catalog. */
  carUpgradeProfiles: z.array(carUpgradeProfileSchema).default([]),
});
