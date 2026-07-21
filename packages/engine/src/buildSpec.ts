import type { Drivetrain, Surface, TuningCategory } from '@fh6/shared';
import type { DataStore, Part } from '@fh6/data';
import { tireGrip } from './constants.ts';
import type { ResolvedCar } from './effectiveCar.ts';
import type { AeroCapability, BuiltSpec, PartSelection } from './types.ts';

export const LAUNCH_BASE: Record<Drivetrain, number> = { AWD: 1.2, RWD: 1.0, FWD: 0.85 };

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
  let powerMult = 1;
  let powerDelta = 0;
  let basePowerHp = car.powerHp; // replaced wholesale by an engine swap's setsPowerHp
  let massMult = 1;
  let massDelta = 0;
  let gripMult = 1;
  let brakingMult = 1;
  let launchMult = 1;
  let totalCost = 0;

  let drivetrain: Drivetrain = car.drivetrain;
  let aspiration = car.aspiration;
  let tireCompound = car.stockTireCompound;
  let aeroFront: AeroCapability | null = null;
  let aeroRear: AeroCapability | null = null;
  const unlockedTuning = new Set<TuningCategory>(['tires']);

  const resolvedSelection: PartSelection = {};

  for (const category of store.categories) {
    const part = resolvePart(store, category, selection);
    if (!part) continue;
    resolvedSelection[category] = part.id;

    const e = part.effects;
    if (e.setsPowerHp) basePowerHp = e.setsPowerHp;
    if (e.powerMultiplier) powerMult *= e.powerMultiplier;
    if (e.powerHpDelta) powerDelta += e.powerHpDelta;
    if (e.massMultiplier) massMult *= e.massMultiplier;
    if (e.massKgDelta) massDelta += e.massKgDelta;
    if (e.gripMultiplier) gripMult *= e.gripMultiplier;
    if (e.brakingMultiplier) brakingMult *= e.brakingMultiplier;
    if (e.launchMultiplier) launchMult *= e.launchMultiplier;
    if (e.aeroFront) aeroFront = e.aeroFront;
    if (e.aeroRear) aeroRear = e.aeroRear;

    if (part.setsDrivetrain) drivetrain = part.setsDrivetrain;
    if (part.setsAspiration) aspiration = part.setsAspiration;
    if (part.setsTireCompound) tireCompound = part.setsTireCompound;

    for (const u of part.unlocks) unlockedTuning.add(u);
    totalCost += part.cost;
  }

  const powerHp = basePowerHp * powerMult + powerDelta;
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
    massKg,
    weightDistFrontPct: car.weightDistFrontPct,
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
