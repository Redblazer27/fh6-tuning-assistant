import type {
  Aspiration,
  ClassLetter,
  Confidence,
  Discipline,
  Drivetrain,
  ScoreBreakdown,
  StrategyKind,
  TireCompound,
  TuneSpec,
  TuningCategory,
  UpgradeCategory,
} from '@fh6/shared';
import type { Car } from '@fh6/data';

/** A choice of one part per upgrade category. Absent category = stock part. */
export type PartSelection = Partial<Record<UpgradeCategory, string>>;

/** Aero downforce capability (kgf) provided by an installed aero part. */
export interface AeroCapability {
  minKgf: number;
  maxKgf: number;
}

/**
 * The derived spec of a built car — everything the PI and tuning engines need.
 * Produced deterministically from a car + a PartSelection.
 */
export interface BuiltSpec {
  carId: string;
  drivetrain: Drivetrain;
  aspiration: Aspiration;
  tireCompound: TireCompound;
  /** Tier of the chosen springs/dampers and differential (for discipline setup fit). */
  suspensionTier: string;
  diffTier: string;
  massKg: number;
  weightDistFrontPct: number;
  powerHp: number;
  /** hp per tonne. */
  powerToWeight: number;
  /** Dimensionless lateral grip index for the discipline's surface (stock street ≈ 1.0). */
  gripFactor: number;
  /** Surface-neutral (tarmac) grip index — used for PI so PI never depends on activity. */
  gripFactorTarmac: number;
  brakingFactor: number;
  launchFactor: number;
  aeroFront: AeroCapability | null;
  aeroRear: AeroCapability | null;
  hasAero: boolean;
  unlockedTuning: Set<TuningCategory>;
  totalCost: number;
  selection: PartSelection;
}

export interface PiComponent {
  label: string;
  delta: number;
  note?: string;
}

/** Estimated PI, anchored to the car's known stock PI plus a modelled delta. */
export interface PiEstimate {
  pi: number;
  class: ClassLetter;
  /** +/- uncertainty band (points). */
  uncertainty: number;
  stockPI: number;
  deltaFromStock: number;
  components: PiComponent[];
  confidence: Confidence;
}

export interface PartLine {
  category: UpgradeCategory;
  partId: string;
  name: string;
  tier: string;
  cost: number;
  unlocks: TuningCategory[];
  isUpgrade: boolean;
  /** The physics + reason this part helps (or costs), shown in the UI. */
  rationale?: string;
}

export interface TuneResult {
  tune: TuneSpec;
  /** Which tuning sections are actually adjustable given installed parts. */
  tunable: Record<TuningCategory, boolean>;
  /** Short rationale per section for the UI's trade-off explanations. */
  rationale: Partial<Record<TuningCategory, string>>;
}

export interface LegalityResult {
  legal: boolean;
  violations: string[];
  warnings: string[];
}

export interface BuildStrategy {
  id: StrategyKind;
  label: string;
  selection: PartSelection;
  parts: PartLine[];
  totalCost: number;
  builtSpec: BuiltSpec;
  pi: PiEstimate;
  legal: boolean;
  legality: LegalityResult;
  tune: TuneResult;
  score: ScoreBreakdown;
}

export interface GenerateResult {
  car: Car;
  discipline: Discipline;
  piCap: number | null;
  classCap: ClassLetter | null;
  strategies: BuildStrategy[];
  assumptions: string[];
  warnings: string[];
  dataVersion: string;
  overallConfidence: Confidence;
  disclaimer: string;
}
