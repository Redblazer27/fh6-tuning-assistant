import { describe, expect, it } from 'vitest';
import { DISCIPLINE_SURFACE } from '@fh6/shared';
import { createDataStore, type Car } from '@fh6/data';
import {
  buildSpec,
  computeTune,
  estimatePI,
  generateBuild,
  normalizeMetrics,
  resolveEffectiveCar,
  scoreSpec,
  disciplineWeights,
} from '../src/index.ts';
import { assertTuneWithinRanges, makeRequest, rcar, resolvedCars, store } from './helpers.ts';

describe('PI estimate (stock-anchored)', () => {
  it('a stock build estimates exactly the car stock PI', () => {
    for (const car of resolvedCars()) {
      const spec = buildSpec(store, car, {}, 'tarmac');
      expect(estimatePI(car, spec).pi).toBe(car.stockPI);
    }
  });

  it('adding grip + power raises PI above stock', () => {
    const car = rcar('mazda-mx5-nd-2019');
    const spec = buildSpec(
      store,
      car,
      { tire_compound: 'tire-slick', intake: 'intake-race' },
      'tarmac',
    );
    const pi = estimatePI(car, spec);
    expect(pi.pi).toBeGreaterThan(car.stockPI);
    expect(pi.uncertainty).toBeGreaterThan(0);
    expect(pi.components.length).toBeGreaterThan(0);
  });
});

describe('tuning output legality', () => {
  it('every generated strategy tune sits within the car ranges', () => {
    const disciplines = ['road', 'dirt', 'drift', 'drag', 'top_speed'] as const;
    const ranges = store.getTuneRanges('mazda-mx5-nd-2019');
    for (const discipline of disciplines) {
      const result = generateBuild(store, makeRequest({ discipline, targetClass: 'S1' }));
      for (const s of result.strategies) assertTuneWithinRanges(s.tune.tune, ranges);
    }
  });

  it('produces gears in strictly descending order', () => {
    const car = rcar('bmw-m3-e46-2005');
    const spec = buildSpec(store, car, { transmission: 'trans-race' }, DISCIPLINE_SURFACE.road);
    const tune = computeTune(
      car,
      spec,
      store.getTuneRanges(car.id),
      makeRequest({ carId: car.id }),
    );
    const g = tune.tune.gearing.gears;
    for (let i = 1; i < g.length; i += 1) expect(g[i]!).toBeLessThanOrEqual(g[i - 1]!);
  });
});

describe('determinism', () => {
  it('produces identical output for identical input', () => {
    const req = makeRequest({
      carId: 'subaru-wrx-sti-2019',
      discipline: 'rally',
      targetClass: 'A',
    });
    const a = generateBuild(store, req);
    const b = generateBuild(store, req);
    expect(JSON.stringify(serialize(a))).toBe(JSON.stringify(serialize(b)));
  });
});

describe('scoring transparency', () => {
  it('weights sum to ~1 and contributions add up to the total', () => {
    const w = disciplineWeights('road', 'balanced');
    const sum = w.accel + w.grip + w.braking + w.launch + w.topSpeed;
    expect(sum).toBeCloseTo(1, 5);

    const car = rcar('porsche-911-gt3-991-2018');
    const spec = buildSpec(store, car, {}, 'tarmac');
    const breakdown = scoreSpec(spec, w);
    const added = breakdown.components.reduce((s, c) => s + c.contribution, 0);
    expect(breakdown.total).toBeCloseTo(added, 1);
  });

  it('normalized metrics stay within 0..1', () => {
    const car = rcar('koenigsegg-jesko-2020');
    const spec = buildSpec(store, car, {}, 'tarmac');
    const m = normalizeMetrics(spec);
    for (const v of [m.accel, m.grip, m.braking, m.launch, m.topSpeed]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('swap-engine power interpolation', () => {
  it('goes from the engine stock power to its real max as power parts are added', () => {
    const engine = store.getPartsByCategory('engine_swap').find((p) => p.effects.setsMaxPowerHp)!;
    expect(engine).toBeDefined();
    const car = rcar('bmw-m3-e46-2005');

    // Swap only (no engine upgrades) → the engine's stock power.
    const stock = buildSpec(store, car, { engine_swap: engine.id }, 'tarmac');
    expect(stock.powerHp).toBeCloseTo(engine.effects.setsPowerHp!, 0);

    // The best power part this engine supports in every category → its real max.
    const engineCats = new Set([
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
    const sel: Record<string, string> = { engine_swap: engine.id };
    for (const cat of store.categories) {
      if (cat === 'engine_swap') continue;
      const gated = engine.engineUpgrades && engineCats.has(cat);
      const tiers = gated ? engine.engineUpgrades![cat] : undefined;
      if (gated && !tiers) continue; // engine doesn't offer this category
      let best: string | undefined;
      let bestMult = 1;
      for (const p of store.getPartsByCategory(cat)) {
        if (p.tierRank === 0) continue;
        if (gated && tiers && !tiers.includes(p.tier)) continue;
        const m = p.effects.powerMultiplier ?? 1;
        if (m > bestMult) {
          bestMult = m;
          best = p.id;
        }
      }
      if (best) sel[cat] = best;
    }
    const maxed = buildSpec(store, car, sel, 'tarmac');
    expect(maxed.powerHp).toBeGreaterThan(stock.powerHp);
    expect(maxed.powerHp).toBeCloseTo(engine.effects.setsMaxPowerHp!, -1); // within ~5 hp
  });

  it('an upgrade the engine does not support adds no power', () => {
    const engine = store
      .getPartsByCategory('engine_swap')
      .find((p) => p.engineUpgrades && Object.keys(p.engineUpgrades).length < 8);
    if (!engine) return; // no restricted engine in the data
    const car = rcar('bmw-m3-e46-2005');
    // Find an engine-internal category this engine does NOT list.
    const unsupported = (['camshaft', 'valves', 'intake', 'exhaust'] as const).find(
      (c) => !engine.engineUpgrades![c],
    );
    if (!unsupported) return;
    const race = store.getPartsByCategory(unsupported).find((p) => p.tierRank > 0)!;
    const base = buildSpec(store, car, { engine_swap: engine.id }, 'tarmac');
    const withUnsupported = buildSpec(
      store,
      car,
      { engine_swap: engine.id, [unsupported]: race.id },
      'tarmac',
    );
    expect(withUnsupported.powerHp).toBeCloseTo(base.powerHp, 3);
  });
});

describe('effective car (physics fallback)', () => {
  const bare: Car = {
    id: 'roster-test',
    year: 2020,
    make: 'Test',
    model: 'T',
    name: '2020 Test T',
    ownership: 'Base game',
    isBaseGame: true,
    stockClass: 'A',
    stockPI: 650,
    source: 'forza-official-cars',
    confidence: 'low',
    dataVersion: 'test',
  };

  it('fills class-based defaults for a car with no physics and flags them', () => {
    const { car, estimatedFields } = resolveEffectiveCar(bare);
    expect(car.drivetrain).toBe('RWD');
    expect(car.aspiration).toBe('NA');
    expect(car.massKg).toBeGreaterThan(0);
    expect(car.powerHp).toBeGreaterThan(0);
    expect(estimatedFields).toContain('drivetrain');
    expect(estimatedFields).toContain('powerHp');
    expect(estimatedFields).toHaveLength(6);
  });

  it('passes a fully-specified car through unchanged', () => {
    const { car, estimatedFields } = resolveEffectiveCar(store.getCar('mazda-mx5-nd-2019')!);
    expect(estimatedFields).toHaveLength(0);
    expect(car.massKg).toBe(1058);
  });

  it('builds for a physics-less car and marks it low confidence with disclosure', () => {
    const dataset = structuredClone(store.dataset);
    dataset.cars.push(bare);
    const testStore = createDataStore(dataset);
    const result = generateBuild(
      testStore,
      makeRequest({ carId: 'roster-test', targetClass: 'S1' }),
    );
    expect(result.strategies.length).toBeGreaterThan(0);
    expect(result.overallConfidence).toBe('low');
    expect(result.assumptions.some((a) => /generic class-based defaults/i.test(a))).toBe(true);
  });
});

// Strip Sets so the result JSON-serializes for deep comparison.
function serialize(result: ReturnType<typeof generateBuild>) {
  return {
    ...result,
    strategies: result.strategies.map((s) => ({
      id: s.id,
      selection: s.selection,
      pi: s.pi,
      tune: s.tune.tune,
      score: s.score,
      totalCost: s.totalCost,
    })),
    car: { id: result.car.id },
  };
}
