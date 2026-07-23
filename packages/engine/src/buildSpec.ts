import type { EngineType, Drivetrain, Surface, TuningCategory, UpgradeCategory } from '@fh6/shared';
import type { DataStore, Part, PartEffects } from '@fh6/data';
import { tireGrip } from './constants.ts';
import type { ResolvedCar } from './effectiveCar.ts';
import type { AeroCapability, BuiltSpec, PartSelection } from './types.ts';

export const LAUNCH_BASE: Record<Drivetrain, number> = { AWD: 1.2, RWD: 1.0, FWD: 0.85 };

/** Engine-internal upgrade categories gated by a swap engine's per-engine upgrade list. */
export const ENGINE_UPGRADE_CATEGORIES = new Set<UpgradeCategory>([
  'intake',
  'intake_manifold',
  'fuel_system',
  'ignition',
  'exhaust',
  'camshaft',
  'valves',
  'displacement',
  'pistons_compression',
  'oil_cooling',
  'intercooler',
  'forced_induction',
  'restrictor_plate',
  'aspiration',
  'flywheel',
]);

/** A rotary has no camshaft, valves, pistons or fixed displacement to upgrade. */
const ROTARY_UNSUPPORTED = new Set<UpgradeCategory>([
  'camshaft',
  'valves',
  'pistons_compression',
  'displacement',
]);
/** An electric motor has none of the combustion-engine (or forced-induction) upgrades. */
const ELECTRIC_UNSUPPORTED = new Set<UpgradeCategory>([
  ...ENGINE_UPGRADE_CATEGORIES,
  'forced_induction',
  'aspiration',
]);

/**
 * Whether a car's BASE engine (when no engine swap is fitted) can take this upgrade.
 * A swapped engine is instead gated by its own per-engine upgrade list, so this only
 * limits the stock engine: a rotary/electric platform doesn't have piston internals,
 * so those parts add no power (and the optimizer won't pay for them). Fixes over-
 * modelling a rotary swap/engine as if it took the full piston upgrade suite.
 */
export function baseEngineAllows(
  engineType: EngineType,
  hasRealSwap: boolean,
  part: Part,
): boolean {
  if (hasRealSwap || part.tierRank === 0) return true;
  if (engineType === 'rotary') return !ROTARY_UNSUPPORTED.has(part.category);
  if (engineType === 'electric') return !ELECTRIC_UNSUPPORTED.has(part.category);
  return true;
}

export interface ResolvedPartData {
  effects: PartEffects;
  cost: number;
  supported: boolean;
}

/** Apply game-file engine compatibility and per-car conversion overrides to a catalog part. */
export function resolvePartData(
  store: DataStore,
  carId: string,
  activeGameEngineId: number | undefined,
  part: Part,
): ResolvedPartData {
  const profile = store.getUpgradeProfile(carId);
  let effects = part.effects;
  let cost = part.cost;
  let supported = true;
  const override = store.getPartOverride(carId, part.id);
  if (override) {
    effects = { ...effects, ...override.effects };
    cost = override.cost ?? cost;
  }
  if (
    profile?.stockGameEngineId !== undefined &&
    part.tierRank > 0 &&
    ENGINE_UPGRADE_CATEGORIES.has(part.category)
  ) {
    const spec = activeGameEngineId
      ? store.getGameEngineUpgradeSpec(activeGameEngineId, part.id)
      : undefined;
    supported = spec !== undefined;
    if (spec) {
      effects = { ...effects, ...spec.effects };
      cost = spec.cost;
    }
  }
  return { effects, cost, supported };
}
/** Resolve the concrete part chosen for a category (falls back to the stock part). */
export function resolvePart(
  store: DataStore,
  category: Part['category'],
  selection: PartSelection,
): Part | undefined {
  const chosenId = selection[category];
  if (chosenId) {
    const p = store.getPart(chosenId);
    if (p && p.category === category) return p;
  }
  return store.getStockPart(category);
}

/**
 * Deterministically derive a BuiltSpec from a car + a part selection.
 *
 * Power and mass use multiplicative part effects first, then additive deltas.
 * Grip is (tire-compound base grip on the relevant surface) × mechanical grip
 * multipliers (suspension, chassis, tire width, rims). The result feeds both the
 * PI estimate (via the tarmac grip) and the tuning engine (via the surface grip).
 */
export function buildSpec(
  store: DataStore,
  car: ResolvedCar,
  selection: PartSelection,
  surface: Surface,
): BuiltSpec {
  let powerScaleDelta = 0;
  let powerMult = 1;
  let powerDelta = 0;
  let basePowerHp = car.powerHp; // replaced wholesale by an engine swap's setsPowerHp
  let maxPowerHp: number | null = null; // a swap engine's fully-upgraded power, if known
  let massMult = 1;
  let massDelta = 0;
  let gripMult = 1;
  let brakingMult = 1;
  let launchMult = 1;
  let totalCost = 0;
  let weightDistFrontPct = car.weightDistFrontPct;
  let redlineRpm = car.redlineRpm ?? 7000;
  let powerPeakRpm = car.powerPeakRpm ?? redlineRpm * 0.8;
  let powerDeliverySmoothness = car.powerDeliverySmoothness ?? 0.75;
  let torqueNm = car.torqueNm;

  let drivetrain: Drivetrain = car.drivetrain;
  let aspiration = car.aspiration;
  let tireCompound = car.stockTireCompound;
  let suspensionTier = 'stock';
  let diffTier = 'stock';
  let transmissionTier = 'stock';
  let aeroFront: AeroCapability | null = null;
  let aeroRear: AeroCapability | null = null;
  const unlockedTuning = new Set<TuningCategory>(['tires']);

  const resolvedSelection: PartSelection = {};

  // A swapped engine only supports the upgrade tiers the wiki lists for it; parts it
  // can't take add no power (and so the optimizer won't pay for them).
  const profile = store.getUpgradeProfile(car.id);
  const selectedEngineSwap = resolvePart(store, 'engine_swap', selection);
  const engineUpgrades = selectedEngineSwap?.engineUpgrades;
  const activeGameEngineId = selectedEngineSwap?.gameEngineId ?? profile?.stockGameEngineId;
  const hasExactEngineData = profile?.stockGameEngineId !== undefined;
  const engineSupports = (part: Part): boolean => {
    if (!engineUpgrades || part.tierRank === 0) return true;
    if (!ENGINE_UPGRADE_CATEGORIES.has(part.category)) return true;
    const tiers = engineUpgrades[part.category];
    return tiers ? tiers.includes(part.tier) : false;
  };
  // Base-engine platform gate: a stock rotary/electric can't take piston internals.
  const baseEngineType: EngineType = profile?.engineType ?? 'piston';
  const hasRealSwap = engineUpgrades !== undefined;

  for (const category of store.categories) {
    const part = resolvePart(store, category, selection);
    if (!part) continue;
    const resolved = resolvePartData(store, car.id, activeGameEngineId, part);
    if (!resolved.supported) continue;
    resolvedSelection[category] = part.id;

    const e = resolved.effects;
    if (e.setsPowerHp) basePowerHp = e.setsPowerHp;
    if (e.setsMaxPowerHp) maxPowerHp = e.setsMaxPowerHp;
    if (e.setsTorqueNm) torqueNm = e.setsTorqueNm;
    if (e.setsRedlineRpm) redlineRpm = e.setsRedlineRpm;
    if (e.setsPowerPeakRpm) powerPeakRpm = e.setsPowerPeakRpm;
    if (e.setsPowerDeliverySmoothness !== undefined) {
      powerDeliverySmoothness = e.setsPowerDeliverySmoothness;
    }
    if (
      e.powerMultiplier &&
      engineSupports(part) &&
      (hasExactEngineData || baseEngineAllows(baseEngineType, hasRealSwap, part))
    )
      powerMult *= e.powerMultiplier;
    if (e.powerHpDelta) powerDelta += e.powerHpDelta;
    if (
      e.powerScaleDelta &&
      engineSupports(part) &&
      (hasExactEngineData || baseEngineAllows(baseEngineType, hasRealSwap, part))
    )
      powerScaleDelta += e.powerScaleDelta;
    if (e.massMultiplier) massMult *= e.massMultiplier;
    if (e.massKgDelta) massDelta += e.massKgDelta;
    if (e.weightDistFrontPctDelta) weightDistFrontPct += e.weightDistFrontPctDelta;
    if (e.gripMultiplier) gripMult *= e.gripMultiplier;
    if (e.brakingMultiplier) brakingMult *= e.brakingMultiplier;
    if (e.launchMultiplier) launchMult *= e.launchMultiplier;
    if (e.aeroFront) aeroFront = e.aeroFront;
    if (e.aeroRear) aeroRear = e.aeroRear;

    if (part.setsDrivetrain) drivetrain = part.setsDrivetrain;
    if (part.setsAspiration) aspiration = part.setsAspiration;
    if (part.setsTireCompound) tireCompound = part.setsTireCompound;
    if (category === 'springs_dampers') suspensionTier = part.tier;
    if (category === 'differential') diffTier = part.tier;
    if (category === 'transmission') transmissionTier = part.tier;

    for (const u of part.unlocks) unlockedTuning.add(u);
    totalCost += resolved.cost;
  }

  // A swap engine with a known max power interpolates stock→max by how far the
  // engine-power upgrades have progressed (0 = stock, 1 = every power part maxed),
  // so a fully-built swap lands on its real max. Otherwise, the multiplier model.
  let powerHp: number;
  if (!hasExactEngineData && maxPowerHp !== null && maxPowerHp > basePowerHp) {
    let maxMult = 1;
    for (const category of store.categories) {
      // The swap itself sets base power (not a multiplier), so exclude its category.
      if (category === 'engine_swap') continue;
      let candidates = store.getPartsByCategory(category);
      // Restrict engine-internal categories to the tiers this engine actually supports.
      if (engineUpgrades && ENGINE_UPGRADE_CATEGORIES.has(category)) {
        const tiers = engineUpgrades[category];
        if (!tiers) continue; // engine doesn't offer this upgrade at all
        candidates = candidates.filter((p) => p.tierRank === 0 || tiers.includes(p.tier));
      }
      const best = candidates.reduce((m, p) => Math.max(m, p.effects.powerMultiplier ?? 1), 1);
      maxMult *= best;
    }
    const progress = maxMult > 1 ? Math.min(Math.max((powerMult - 1) / (maxMult - 1), 0), 1) : 0;
    powerHp = basePowerHp + (maxPowerHp - basePowerHp) * progress + powerDelta;
  } else {
    powerHp = basePowerHp * powerMult * (1 + powerScaleDelta) + powerDelta;
  }
  const massKg = car.massKg * massMult + massDelta;
  const powerToWeight = powerHp / (massKg / 1000);

  const gripFactor = tireGrip(tireCompound, surface) * gripMult;
  const gripFactorTarmac = tireGrip(tireCompound, 'tarmac') * gripMult;
  const brakingFactor = brakingMult;
  const launchFactor = LAUNCH_BASE[drivetrain] * launchMult;

  return {
    carId: car.id,
    drivetrain,
    aspiration,
    tireCompound,
    suspensionTier,
    diffTier,
    transmissionTier,
    massKg,
    weightDistFrontPct,
    torqueNm,
    redlineRpm,
    powerPeakRpm,
    powerDeliverySmoothness,
    powerHp,
    powerToWeight,
    gripFactor,
    gripFactorTarmac,
    brakingFactor,
    launchFactor,
    aeroFront,
    aeroRear,
    hasAero: aeroFront !== null || aeroRear !== null,
    unlockedTuning,
    totalCost,
    selection: resolvedSelection,
  };
}
