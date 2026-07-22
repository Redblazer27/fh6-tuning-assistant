import {
  DISCIPLINE_SURFACE,
  STRATEGY_KINDS,
  STRATEGY_LABELS,
  type BuildRequest,
  type Confidence,
  type LockedSelections,
  type StrategyKind,
  type TuneOverrides,
  type TuneSpec,
  type UpgradeCategory,
} from '@fh6/shared';
import type { Car, DataStore } from '@fh6/data';
import { buildSpec } from './buildSpec.ts';
import { DISCLAIMER } from './constants.ts';
import { resolveEffectiveCar, type ResolvedCar } from './effectiveCar.ts';
import { estimatePI } from './pi.ts';
import { checkLegality, resolvePiCap } from './rules.ts';
import { disciplineWeights, scoreSpec } from './scoring.ts';
import { computeTune } from './tuning.ts';
import { optimizeSelection } from './optimizer.ts';
import type { BuildStrategy, GenerateResult, PartLine, PartSelection } from './types.ts';

const CONFIDENCE_RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };
const lowerConfidence = (a: Confidence, b: Confidence): Confidence =>
  CONFIDENCE_RANK[a] <= CONFIDENCE_RANK[b] ? a : b;

/** Build the ordered part list (all categories; UI can filter to upgrades). */
export function partLines(store: DataStore, selection: PartSelection): PartLine[] {
  const lines: PartLine[] = [];
  for (const category of store.categories) {
    const partId = selection[category] ?? store.getStockPart(category)?.id;
    if (!partId) continue;
    const part = store.getPart(partId);
    if (!part) continue;
    lines.push({
      category,
      partId: part.id,
      name: part.name,
      tier: part.tier,
      cost: part.cost,
      unlocks: part.unlocks,
      isUpgrade: part.tierRank > 0,
    });
  }
  return lines;
}

/** Compute a full tune for an explicit selection (used when locks/overrides change). */
export function computeTuneForSelection(
  store: DataStore,
  car: Car,
  request: BuildRequest,
  selection: PartSelection,
) {
  const { car: ecar } = resolveEffectiveCar(car);
  const surface = DISCIPLINE_SURFACE[request.discipline];
  const spec = buildSpec(store, ecar, selection, surface);
  const ranges = store.getTuneRanges(ecar.id);
  return computeTune(ecar, spec, ranges, request);
}

function makeStrategy(
  store: DataStore,
  car: ResolvedCar,
  request: BuildRequest,
  piCap: number | null,
  budget: number | null,
  kind: StrategyKind,
  locks: LockedSelections | undefined,
): { strategy: BuildStrategy; notes: string[] } {
  const surface = DISCIPLINE_SURFACE[request.discipline];
  const { selection, notes } = optimizeSelection(store, car, request, surface, piCap, budget, {
    strategy: kind,
    locks,
  });
  const spec = buildSpec(store, car, selection, surface);
  const pi = estimatePI(car, spec);
  const ranges = store.getTuneRanges(car.id);
  const tune = computeTune(car, spec, ranges, request);
  const legality = checkLegality(store, car, request, spec, pi, piCap);
  // Score all strategies with a common (balanced) lens so ranking is fair.
  const score = scoreSpec(
    spec,
    disciplineWeights(request.discipline, 'balanced'),
    request.discipline,
  );

  return {
    strategy: {
      id: kind,
      label: STRATEGY_LABELS[kind],
      selection,
      parts: partLines(store, selection),
      totalCost: spec.totalCost,
      builtSpec: spec,
      pi,
      legal: legality.legal,
      legality,
      tune,
      score,
    },
    notes,
  };
}

/**
 * Top-level entry point: from a BuildRequest, produce ranked build strategies,
 * each with its parts, estimated PI, legality, full tune, and transparent score.
 * Deterministic. Locks (category → partId) are honored across re-optimization.
 */
export function generateBuild(
  store: DataStore,
  request: BuildRequest,
  options: { locks?: LockedSelections } = {},
): GenerateResult {
  const car = store.getCar(request.carId);
  if (!car) throw new Error(`Unknown car: ${request.carId}`);
  const { car: ecar, estimatedFields } = resolveEffectiveCar(car);
  const physicsEstimated = estimatedFields.length > 0;

  const piCap = resolvePiCap(request);
  const budget =
    typeof request.constraints.budgetCredits === 'number'
      ? request.constraints.budgetCredits
      : null;

  const warnings: string[] = [];
  const seen = new Set<string>();
  const strategies: BuildStrategy[] = [];

  for (const kind of STRATEGY_KINDS) {
    const { strategy, notes } = makeStrategy(
      store,
      ecar,
      request,
      piCap,
      budget,
      kind,
      options.locks,
    );
    for (const n of notes) if (!warnings.includes(n)) warnings.push(n);
    const sig = signature(strategy.selection, store.categories);
    if (seen.has(sig)) continue;
    seen.add(sig);
    strategies.push(strategy);
  }

  strategies.sort((a, b) => b.score.total - a.score.total || a.id.localeCompare(b.id));

  if (piCap !== null && car.stockPI > piCap) {
    warnings.unshift(
      `This car's stock PI (${car.stockPI}) already exceeds the ${piCap} cap. Legalizing it would mean ` +
        `de-tuning (e.g. worse tires) rather than building for the goal — pick a higher class/PI, or a different car.`,
    );
  }

  const overallConfidence = strategies.reduce<Confidence>(
    (acc, s) => lowerConfidence(acc, s.pi.confidence),
    lowerConfidence(physicsEstimated ? 'low' : 'high', car.confidence),
  );

  const assumptions = [
    `Estimated PI is modelled and anchored to the car's stock PI (${car.stockPI}); shown with a ± band.`,
    'Tune values come from documented vehicle-dynamics heuristics and are clamped to typical FH6 ranges.',
    `Stock data for ${car.name} is ${car.confidence} confidence (source: ${car.source}).`,
    `Data version: ${store.dataset.version.dataVersion} (${store.dataset.version.gameVersion}).`,
  ];
  if (physicsEstimated) {
    assumptions.push(
      `Physics not in the data for this car (${estimatedFields.join(', ')}) were filled with generic ` +
        `class-based defaults — this build is low confidence until real specs are imported.`,
    );
  }

  return {
    car,
    discipline: request.discipline,
    piCap,
    classCap: request.targetClass ?? null,
    strategies,
    assumptions,
    warnings,
    dataVersion: store.dataset.version.dataVersion,
    overallConfidence,
    disclaimer: DISCLAIMER,
  };
}

function signature(selection: PartSelection, categories: UpgradeCategory[]): string {
  return categories.map((c) => `${c}=${selection[c] ?? ''}`).join('|');
}

// --- Manual tune overrides -----------------------------------------------------
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Deep-merge user overrides onto a generated tune (arrays are replaced wholesale). */
export function applyTuneOverrides(tune: TuneSpec, overrides?: TuneOverrides): TuneSpec {
  if (!overrides) return tune;
  const merge = (base: unknown, over: unknown): unknown => {
    if (over === undefined) return base;
    if (isPlainObject(base) && isPlainObject(over)) {
      const out: Record<string, unknown> = { ...base };
      for (const key of Object.keys(over)) out[key] = merge(base[key], over[key]);
      return out;
    }
    return over;
  };
  return merge(tune, overrides) as TuneSpec;
}
