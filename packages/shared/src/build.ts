import type {
  ClassLetter,
  Discipline,
  Drivetrain,
  DrivingStyle,
  InputDevice,
  UpgradeCategory,
} from './enums.ts';
import type { TuneOverrides } from './tune.ts';

/** Player-declared constraints on how the car may be built. */
export interface BuildConstraints {
  /** Forbid engine AND drivetrain swaps (keep the car's original layout). */
  noSwaps?: boolean;
  /** Force / prefer a specific drivetrain (may require a swap unless it is stock). */
  preferredDrivetrain?: Drivetrain | null;
  allowDrivetrainSwap?: boolean;
  /** Preferred engine swap part id (null = keep stock engine). */
  preferredEngineSwapId?: string | null;
  allowEngineSwap?: boolean;
  /** Credit budget for parts; null = unlimited. */
  budgetCredits?: number | null;
  /** Avoid visible body/rim/aero changes. */
  stockLooking?: boolean;
  /** Do not add or tune wings/splitters. */
  noAero?: boolean;
  /** If set, ONLY these upgrade categories may be used. */
  allowedCategories?: UpgradeCategory[];
  /** These upgrade categories may never be used. */
  disallowedCategories?: UpgradeCategory[];
  /** Specific part ids that may never be used. */
  disallowedPartIds?: string[];
}

/** The user's goal + inputs — everything the optimizer needs. */
export interface BuildRequest {
  carId: string;
  discipline: Discipline;
  /** Explicit PI cap. If null, `targetClass` (upper bound) is used. */
  targetPI?: number | null;
  targetClass?: ClassLetter | null;
  input: InputDevice;
  drivingStyle: DrivingStyle;
  constraints: BuildConstraints;
}

/** A part the user has locked (category -> chosen part id). Re-optimization keeps these. */
export type LockedSelections = Partial<Record<UpgradeCategory, string>>;

/** The current schema version of a shared / exported build. Bump on breaking changes. */
export const BUILD_SCHEMA_VERSION = 1;

/** A fully saved/shareable/exportable build. */
export interface SavedBuild {
  schemaVersion: number;
  request: BuildRequest;
  /** Which generated strategy the user selected. */
  strategyId: string;
  lockedParts?: LockedSelections;
  /** User's manual edits to the generated tune (never silently applied to baseline). */
  tuneOverrides?: TuneOverrides;
  /** The data version the build was generated against. */
  dataVersion: string;
  createdAt?: string;
  /** Optional user-supplied label. */
  label?: string;
}

/** Wrapper used for JSON file export/import. */
export const EXPORT_MAGIC = 'fh6-tuning-assistant';

export interface BuildExport {
  app: typeof EXPORT_MAGIC;
  schemaVersion: number;
  exportedAt: string;
  build: SavedBuild;
}
