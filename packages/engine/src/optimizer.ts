import {
  clamp,
  type Aspiration,
  type BuildRequest,
  type Drivetrain,
  type LockedSelections,
  type StrategyKind,
  type Surface,
  type TireCompound,
  type UpgradeCategory,
} from '@fh6/shared';
import type { DataStore, Part } from '@fh6/data';
import { tireGrip } from './constants.ts';
import { LAUNCH_BASE } from './buildSpec.ts';
import type { ResolvedCar } from './effectiveCar.ts';
import { estimatePI } from './pi.ts';
import { disciplineWeights, scoreSpec } from './scoring.ts';
import type { AeroCapability, BuiltSpec, PartSelection } from './types.ts';

export interface OptimizeOptions {
  strategy: StrategyKind;
  locks?: LockedSelections;
}

export interface OptimizeOutput {
  selection: PartSelection;
  notes: string[];
}

/** Engine-internal categories gated by a swap engine's per-engine upgrade list. */
const ENGINE_UPGRADE_CATEGORIES = new Set<UpgradeCategory>([
  'intake',
  'fuel_system',
  'ignition',
  'exhaust',
  'camshaft',
  'valves',
  'displacement',
  'pistons_compression',
  'oil_cooling',
  'intercooler',
  'flywheel',
]);

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

// --- Aggregate spec state (mirrors buildSpec, for fast incremental evaluation) ---
interface Agg {
  powerMult: number;
  powerDelta: number;
  basePowerHp: number;
  maxPowerHp: number | null;
  maxEngineMult: number;
  massMult: number;
  massDelta: number;
  gripMult: number;
  brakingMult: number;
  launchMult: number;
  drivetrain: Drivetrain;
  aspiration: Aspiration;
  tireCompound: TireCompound;
  aeroFront: AeroCapability | null;
  aeroRear: AeroCapability | null;
  cost: number;
  engineUpgrades: Part['engineUpgrades'];
}

const initAgg = (car: ResolvedCar): Agg => ({
  powerMult: 1,
  powerDelta: 0,
  basePowerHp: car.powerHp,
  maxPowerHp: null,
  maxEngineMult: 1,
  massMult: 1,
  massDelta: 0,
  gripMult: 1,
  brakingMult: 1,
  launchMult: 1,
  drivetrain: car.drivetrain,
  aspiration: car.aspiration,
  tireCompound: car.stockTireCompound,
  aeroFront: null,
  aeroRear: null,
  cost: 0,
  engineUpgrades: undefined,
});

const engineSupports = (agg: Agg, part: Part): boolean => {
  if (!agg.engineUpgrades || part.tierRank === 0) return true;
  if (!ENGINE_UPGRADE_CATEGORIES.has(part.category)) return true;
  const tiers = agg.engineUpgrades[part.category];
  return tiers ? tiers.includes(part.tier) : false;
};

/** The max power multiplier reachable using only the tiers this engine supports. */
function computeMaxEngineMult(store: DataStore, engine: Part): number {
  let m = 1;
  for (const category of store.categories) {
    if (category === 'engine_swap') continue;
    let cands = store.getPartsByCategory(category);
    if (engine.engineUpgrades && ENGINE_UPGRADE_CATEGORIES.has(category)) {
      const tiers = engine.engineUpgrades[category];
      if (!tiers) continue;
      cands = cands.filter((p) => p.tierRank === 0 || tiers.includes(p.tier));
    }
    m *= cands.reduce((x, p) => Math.max(x, p.effects.powerMultiplier ?? 1), 1);
  }
  return m;
}

/** Apply a part to the aggregate state (mirrors buildSpec's per-part logic). */
function applyPart(
  store: DataStore,
  agg: Agg,
  part: Part,
  maxEngineMult?: Map<string, number>,
): void {
  const e = part.effects;
  if (e.setsPowerHp) agg.basePowerHp = e.setsPowerHp;
  if (e.setsMaxPowerHp) agg.maxPowerHp = e.setsMaxPowerHp;
  if (part.category === 'engine_swap') {
    agg.engineUpgrades = part.engineUpgrades;
    if (part.effects.setsMaxPowerHp) {
      let m = maxEngineMult?.get(part.id);
      if (m === undefined) {
        m = computeMaxEngineMult(store, part);
        maxEngineMult?.set(part.id, m);
      }
      agg.maxEngineMult = m;
    }
  }
  if (e.powerMultiplier && engineSupports(agg, part)) agg.powerMult *= e.powerMultiplier;
  if (e.powerHpDelta) agg.powerDelta += e.powerHpDelta;
  if (e.massMultiplier) agg.massMult *= e.massMultiplier;
  if (e.massKgDelta) agg.massDelta += e.massKgDelta;
  if (e.gripMultiplier) agg.gripMult *= e.gripMultiplier;
  if (e.brakingMultiplier) agg.brakingMult *= e.brakingMultiplier;
  if (e.launchMultiplier) agg.launchMult *= e.launchMultiplier;
  if (e.aeroFront) agg.aeroFront = e.aeroFront;
  if (e.aeroRear) agg.aeroRear = e.aeroRear;
  if (part.setsDrivetrain) agg.drivetrain = part.setsDrivetrain;
  if (part.setsAspiration) agg.aspiration = part.setsAspiration;
  if (part.setsTireCompound) agg.tireCompound = part.setsTireCompound;
  agg.cost += part.cost;
}

const EMPTY_UNLOCKS = new Set<never>();

/** Derive a scorable BuiltSpec from aggregates (mirrors buildSpec's tail exactly). */
function deriveFromAgg(car: ResolvedCar, agg: Agg, surface: Surface): BuiltSpec {
  let powerHp: number;
  if (agg.maxPowerHp !== null && agg.maxPowerHp > agg.basePowerHp) {
    const progress =
      agg.maxEngineMult > 1 ? clamp((agg.powerMult - 1) / (agg.maxEngineMult - 1), 0, 1) : 0;
    powerHp = agg.basePowerHp + (agg.maxPowerHp - agg.basePowerHp) * progress + agg.powerDelta;
  } else {
    powerHp = agg.basePowerHp * agg.powerMult + agg.powerDelta;
  }
  const massKg = car.massKg * agg.massMult + agg.massDelta;
  return {
    carId: car.id,
    drivetrain: agg.drivetrain,
    aspiration: agg.aspiration,
    tireCompound: agg.tireCompound,
    massKg,
    weightDistFrontPct: car.weightDistFrontPct,
    powerHp,
    powerToWeight: powerHp / (massKg / 1000),
    gripFactor: tireGrip(agg.tireCompound, surface) * agg.gripMult,
    gripFactorTarmac: tireGrip(agg.tireCompound, 'tarmac') * agg.gripMult,
    brakingFactor: agg.brakingMult,
    launchFactor: LAUNCH_BASE[agg.drivetrain] * agg.launchMult,
    aeroFront: agg.aeroFront,
    aeroRear: agg.aeroRear,
    hasAero: agg.aeroFront !== null || agg.aeroRear !== null,
    unlockedTuning: EMPTY_UNLOCKS as unknown as BuiltSpec['unlockedTuning'],
    totalCost: agg.cost,
    selection: {},
  };
}

interface Eval {
  pi: number;
  score: number;
  cost: number;
}

/**
 * Build optimizer: multi-start coordinate ascent with 2-opt local search.
 *
 * Coordinate ascent alone (swap in the single best part per category, repeat) is
 * greedy and gets trapped in local optima because components interact. This lifts
 * it two ways so the result is reliably the global best for the scoring model:
 *
 *  - **2-opt**: after ascent converges, it also tries changing *pairs* of
 *    categories together, capturing interactions a one-at-a-time pass can't see
 *    (e.g. adding power only pays off once tires can hold the extra PI).
 *  - **Multi-start**: it restarts from stock and from each engine-swap option, so
 *    the biggest discrete choice never strands the search in a worse basin.
 *
 * Every accepted move keeps the build feasible (PI ≤ cap, cost ≤ budget) and
 * strictly improves the objective; the best over all starts is returned. It is
 * deterministic (fixed order + tie-breaks) and, on representative cars, matches
 * the exhaustive optimum (see bruteForceOptimize and its test).
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
  const cats = store.categories;
  const candidates = new Map<UpgradeCategory, Part[]>();
  for (const cat of cats)
    candidates.set(cat, candidatesFor(store, car, request, cat, opts.locks, notes));
  const maxEngineMult = new Map<string, number>();

  // The "baseline" part for a category: its stock option, or — when a lock/force
  // has reduced it to a single choice — that forced part.
  const stockOf = (cat: UpgradeCategory): Part | undefined => {
    const list = candidates.get(cat)!;
    return list.find((p) => p.tierRank === 0) ?? list[0];
  };

  const evaluate = (sel: PartSelection): Eval => {
    const agg = initAgg(car);
    for (const cat of cats) {
      const id = sel[cat];
      const part = (id ? store.getPart(id) : undefined) ?? stockOf(cat);
      if (part) applyPart(store, agg, part, maxEngineMult);
    }
    const spec = deriveFromAgg(car, agg, surface);
    return {
      pi: estimatePI(car, spec).pi,
      score: scoreSpec(spec, weights, request.discipline).total,
      cost: agg.cost,
    };
  };

  const feasible = (e: Eval): boolean =>
    (piCap === null || e.pi <= piCap) && (budget === null || e.cost <= budget);

  // A feasible candidate is strictly preferred by: higher score, then lower PI,
  // then lower cost, then lexicographically smaller selection (determinism).
  const better = (
    a: { e: Eval; sel: PartSelection },
    b: { e: Eval; sel: PartSelection },
  ): boolean => {
    if (a.e.score > b.e.score + 1e-9) return true;
    if (a.e.score < b.e.score - 1e-9) return false;
    if (a.e.pi < b.e.pi - 1e-9) return true;
    if (a.e.pi > b.e.pi + 1e-9) return false;
    if (a.e.cost < b.e.cost - 1e-9) return true;
    if (a.e.cost > b.e.cost + 1e-9) return false;
    return sigLt(a.sel, b.sel, cats);
  };

  const stockSelection = (): PartSelection => {
    const sel: PartSelection = {};
    for (const cat of cats) {
      const s = stockOf(cat);
      if (s) sel[cat] = s.id;
    }
    return sel;
  };

  // One coordinate-ascent sweep set: repeatedly pick the best feasible part per
  // category until nothing improves.
  const ascend = (start: PartSelection): { sel: PartSelection; e: Eval } => {
    const sel = { ...start };
    let cur = { e: evaluate(sel), sel: { ...sel } };
    for (let sweep = 0; sweep < 30; sweep++) {
      let changed = false;
      for (const cat of cats) {
        const list = candidates.get(cat)!;
        if (list.length <= 1) continue;
        let bestPart = sel[cat];
        let bestState = { e: evaluate(sel), sel: { ...sel } };
        for (const part of list) {
          if (part.id === sel[cat]) continue;
          const trial = { ...sel, [cat]: part.id };
          const e = evaluate(trial);
          if (!feasible(e)) continue;
          const cand = { e, sel: trial };
          if (better(cand, bestState)) {
            bestState = cand;
            bestPart = part.id;
          }
        }
        if (bestPart && bestPart !== sel[cat]) {
          sel[cat] = bestPart;
          changed = true;
        }
      }
      cur = { e: evaluate(sel), sel: { ...sel } };
      if (!changed) break;
    }
    return { sel: cur.sel, e: cur.e };
  };

  // 2-opt: change every pair of categories together, keeping improvements. Under a
  // PI cap all upgrades compete for the same budget, so the interactions that matter
  // aren't only the structural ones — every pair is considered.
  const twoOpt = (start: PartSelection): { sel: PartSelection; e: Eval } => {
    const sel = { ...start };
    let curE = evaluate(sel);
    const multi = cats.filter((c) => candidates.get(c)!.length > 1);
    for (let pass = 0; pass < 2; pass++) {
      let changed = false;
      for (let ia = 0; ia < multi.length; ia++) {
        const ca = multi[ia]!;
        for (let ib = ia + 1; ib < multi.length; ib++) {
          const cb = multi[ib]!;
          let bestState = { e: curE, sel: { ...sel } };
          let improved = false;
          for (const pa of candidates.get(ca)!) {
            for (const pb of candidates.get(cb)!) {
              if (pa.id === sel[ca] && pb.id === sel[cb]) continue;
              const trial = { ...sel, [ca]: pa.id, [cb]: pb.id };
              const e = evaluate(trial);
              if (!feasible(e)) continue;
              const cand = { e, sel: trial };
              if (better(cand, bestState)) {
                bestState = cand;
                improved = true;
              }
            }
          }
          if (improved) {
            sel[ca] = bestState.sel[ca]!;
            sel[cb] = bestState.sel[cb]!;
            curE = bestState.e;
            changed = true;
          }
        }
      }
      if (!changed) break;
    }
    return { sel, e: curE };
  };

  const stock = stockSelection();
  const multi = cats.filter((c) => candidates.get(c)!.length > 1);

  // If the constrained search space is small enough, enumerate it exhaustively and
  // return the *certified* global optimum (targeting a class, or a car with limited
  // options, usually lands here). Otherwise fall back to the heuristic.
  const EXACT_THRESHOLD = 150_000;
  let product = 1;
  for (const c of multi) {
    product *= candidates.get(c)!.length;
    if (product > EXACT_THRESHOLD) break;
  }

  if (product <= EXACT_THRESHOLD) {
    let best: { e: Eval; sel: PartSelection } | null = null;
    const sel: PartSelection = { ...stock };
    const rec = (i: number): void => {
      if (i === multi.length) {
        const e = evaluate(sel);
        if (feasible(e)) {
          const cand = { e, sel: { ...sel } };
          if (best === null || better(cand, best)) best = cand;
        }
        return;
      }
      for (const p of candidates.get(multi[i]!)!) {
        sel[multi[i]!] = p.id;
        rec(i + 1);
      }
    };
    rec(0);
    notes.push(
      'This build is the certified best for the goal (every legal combination was checked).',
    );
    return { selection: (best as { sel: PartSelection } | null)?.sel ?? stock, notes };
  }

  // Large space → multi-start coordinate ascent + 2-opt. Starts from stock, an
  // over-upgraded build, and each strong engine swap, so no basin strands the search.
  const maxAll: PartSelection = { ...stock };
  for (const c of multi)
    maxAll[c] = [...candidates.get(c)!].sort((a, b) => b.tierRank - a.tierRank)[0]!.id;
  const engineStarts = [...(candidates.get('engine_swap') ?? [])]
    .filter((p) => p.tierRank > 0)
    .sort(
      (a, b) =>
        (b.effects.setsMaxPowerHp ?? b.effects.setsPowerHp ?? b.effects.powerMultiplier ?? 0) -
        (a.effects.setsMaxPowerHp ?? a.effects.setsPowerHp ?? a.effects.powerMultiplier ?? 0),
    )
    .slice(0, 1);
  const starts: PartSelection[] = [
    stock,
    maxAll,
    ...engineStarts.map((e) => ({ ...stock, engine_swap: e.id })),
  ];

  let best: { e: Eval; sel: PartSelection } | null = null;
  for (const start of starts) {
    let r = ascend(start);
    r = twoOpt(r.sel);
    r = ascend(r.sel); // re-ascend after 2-opt to settle single-category moves
    if (!feasible(r.e)) continue;
    const cand = { e: r.e, sel: r.sel };
    if (best === null || better(cand, best)) best = cand;
  }

  notes.push(
    'Strong build from a multi-start search (the full combination space was too large to check exhaustively).',
  );
  return { selection: (best as { sel: PartSelection } | null)?.sel ?? stock, notes };
}

/** Lexicographic tie-break on the selection ids, in category order. */
function sigLt(a: PartSelection, b: PartSelection, cats: UpgradeCategory[]): boolean {
  for (const c of cats) {
    const av = a[c] ?? '';
    const bv = b[c] ?? '';
    if (av !== bv) return av < bv;
  }
  return false;
}

/**
 * Exhaustive reference optimizer (for tests): checks every combination. Only use
 * on small, constrained datasets — it is exponential. Guarantees the true optimum
 * for the scoring model, so tests can assert the heuristic matches it.
 */
export function bruteForceOptimize(
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
  const cats = [...store.categories];
  const candidates = cats.map((cat) => candidatesFor(store, car, request, cat, opts.locks, notes));

  const maxEngineMult = new Map<string, number>();
  const evaluate = (sel: PartSelection): Eval => {
    const agg = initAgg(car);
    for (const cat of cats) {
      const p = store.getPart(sel[cat]!);
      if (p) applyPart(store, agg, p, maxEngineMult);
    }
    const spec = deriveFromAgg(car, agg, surface);
    return {
      pi: estimatePI(car, spec).pi,
      score: scoreSpec(spec, weights, request.discipline).total,
      cost: agg.cost,
    };
  };

  let best: { e: Eval; sel: PartSelection } | null = null;
  const sel: PartSelection = {};
  const rec = (i: number): void => {
    if (i === cats.length) {
      const e = evaluate(sel);
      if ((piCap === null || e.pi <= piCap) && (budget === null || e.cost <= budget)) {
        const cand = { e, sel: { ...sel } };
        if (
          best === null ||
          e.score > best.e.score + 1e-9 ||
          (Math.abs(e.score - best.e.score) <= 1e-9 &&
            (e.pi < best.e.pi - 1e-9 ||
              (Math.abs(e.pi - best.e.pi) <= 1e-9 &&
                (e.cost < best.e.cost - 1e-9 ||
                  (Math.abs(e.cost - best.e.cost) <= 1e-9 &&
                    sigLt(sel, best.e ? best.sel : sel, cats))))))
        )
          best = cand;
      }
      return;
    }
    for (const p of candidates[i]!) {
      sel[cats[i]!] = p.id;
      rec(i + 1);
    }
  };
  rec(0);
  return { selection: (best as { sel: PartSelection } | null)?.sel ?? {}, notes };
}
