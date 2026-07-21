import type {
  BuildRequest,
  LockedSelections,
  StrategyKind,
  Surface,
  UpgradeCategory,
} from '@fh6/shared';
import type { DataStore, Part } from '@fh6/data';
import { buildSpec } from './buildSpec.ts';
import type { ResolvedCar } from './effectiveCar.ts';
import { estimatePI } from './pi.ts';
import { disciplineWeights, scoreSpec } from './scoring.ts';
import type { PartSelection } from './types.ts';

export interface OptimizeOptions {
  strategy: StrategyKind;
  locks?: LockedSelections;
}

export interface OptimizeOutput {
  selection: PartSelection;
  notes: string[];
}

/** Candidate parts for a category after applying locks and constraints. */
function candidatesFor(
  store: DataStore,
  car: ResolvedCar,
  request: BuildRequest,
  category: UpgradeCategory,
  locks: LockedSelections | undefined,
  notes: string[],
): Part[] {
  const c = request.constraints;
  // Car-aware catalog: applies the car's upgrade profile (locked categories,
  // engine/drivetrain swap allowlists, blocklist) before any user constraints.
  const all = store.getAvailablePartsByCategory(car.id, category);
  const stock = all.find((p) => p.tierRank === 0);
  const onlyStock = (): Part[] => (stock ? [stock] : []);

  const locked = locks?.[category];
  if (locked) {
    const lp = all.find((p) => p.id === locked);
    return lp ? [lp] : onlyStock();
  }

  let list = all.filter((p) => p.tierRank === 0 || !(c.disallowedPartIds?.includes(p.id) ?? false));

  const catBlocked =
    (c.disallowedCategories?.includes(category) ?? false) ||
    (c.allowedCategories &&
      c.allowedCategories.length > 0 &&
      !c.allowedCategories.includes(category));
  if (catBlocked) list = list.filter((p) => p.tierRank === 0);

  if (c.noSwaps && (category === 'engine_swap' || category === 'drivetrain_swap')) {
    list = list.filter((p) => p.tierRank === 0);
  }
  if (category === 'engine_swap') {
    if (c.noSwaps || c.allowEngineSwap === false) {
      list = list.filter((p) => p.tierRank === 0);
    } else if (c.preferredEngineSwapId === null) {
      list = list.filter((p) => p.tierRank === 0);
    } else if (c.preferredEngineSwapId) {
      // An explicit engine-swap choice is forced (over-cap is surfaced as a warning).
      const sw = all.find((p) => p.id === c.preferredEngineSwapId);
      if (sw) list = [sw];
    }
  }
  if (category === 'drivetrain_swap') {
    if (c.allowDrivetrainSwap === false) list = list.filter((p) => p.tierRank === 0);
    if (c.preferredDrivetrain) {
      if (c.preferredDrivetrain === car.drivetrain) {
        list = list.filter((p) => p.tierRank === 0);
      } else {
        const swap = all.find((p) => p.setsDrivetrain === c.preferredDrivetrain);
        if (swap && c.allowDrivetrainSwap !== false) {
          list = [swap];
        } else {
          notes.push(
            `Preferred drivetrain ${c.preferredDrivetrain} could not be applied (no swap available or swaps disallowed).`,
          );
          list = list.filter((p) => p.tierRank === 0);
        }
      }
    }
  }
  if (c.noAero && (category === 'front_aero' || category === 'rear_aero')) {
    list = list.filter((p) => p.tierRank === 0);
  }
  if (c.stockLooking) {
    list = list.filter((p) => !p.cosmeticVisible || p.tierRank === 0);
  }

  if (stock && !list.some((p) => p.tierRank === 0)) list.push(stock);
  return list.length ? list : onlyStock();
}

/**
 * Deterministic build optimizer.
 *
 * Coordinate ascent: starting from a stock build, repeatedly pick, for each
 * category, the candidate part that maximizes the (strategy-tilted) objective
 * while keeping estimated PI ≤ cap and cost ≤ budget. Because every accepted
 * move keeps the build feasible and strictly improves the score, it converges to
 * a strong, legal build. Ties break deterministically (lower PI, then cost, then id).
 */
export function optimizeSelection(
  store: DataStore,
  car: ResolvedCar,
  request: BuildRequest,
  surface: Surface,
  piCap: number | null,
  budget: number | null,
  opts: OptimizeOptions,
): OptimizeOutput {
  const notes: string[] = [];
  const weights = disciplineWeights(request.discipline, opts.strategy);

  const candidates = new Map<UpgradeCategory, Part[]>();
  for (const category of store.categories) {
    candidates.set(category, candidatesFor(store, car, request, category, opts.locks, notes));
  }

  // Start from stock (or the only forced candidate) per category.
  const selection: PartSelection = {};
  for (const [category, list] of candidates) {
    const start = list.find((p) => p.tierRank === 0) ?? list[0];
    if (start) selection[category] = start.id;
  }

  const evaluate = (sel: PartSelection) => {
    const spec = buildSpec(store, car, sel, surface);
    const pi = estimatePI(car, spec);
    const score = scoreSpec(spec, weights).total;
    return { spec, pi: pi.pi, score, cost: spec.totalCost };
  };

  const feasible = (pi: number, cost: number): boolean =>
    (piCap === null || pi <= piCap) && (budget === null || cost <= budget);

  const MAX_SWEEPS = 24;
  for (let sweep = 0; sweep < MAX_SWEEPS; sweep += 1) {
    let changed = false;
    for (const category of store.categories) {
      const list = candidates.get(category)!;
      if (list.length <= 1) continue;
      const currentId = selection[category];

      let bestId = currentId;
      let bestScore = -Infinity;
      let bestPi = Infinity;
      let bestCost = Infinity;
      for (const part of list) {
        const trial: PartSelection = { ...selection, [category]: part.id };
        const r = evaluate(trial);
        if (!feasible(r.pi, r.cost)) continue;
        const better =
          r.score > bestScore + 1e-9 ||
          (Math.abs(r.score - bestScore) <= 1e-9 &&
            (r.pi < bestPi - 1e-9 ||
              (Math.abs(r.pi - bestPi) <= 1e-9 &&
                (r.cost < bestCost - 1e-9 ||
                  (Math.abs(r.cost - bestCost) <= 1e-9 && part.id < (bestId ?? ''))))));
        if (better) {
          bestId = part.id;
          bestScore = r.score;
          bestPi = r.pi;
          bestCost = r.cost;
        }
      }
      if (bestId && bestId !== currentId) {
        selection[category] = bestId;
        changed = true;
      }
    }
    if (!changed) break;
  }

  return { selection, notes };
}
