import { describe, expect, it } from 'vitest';
import { DISCIPLINE_SURFACE, classMaxPi, type Discipline, type UpgradeCategory } from '@fh6/shared';
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
import { bruteForceOptimize, optimizeSelection } from '../src/optimizer.ts';
import { chassisBalanceFit, compareCars } from '../src/compare.ts';
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
  // Heavy stress test: 5 disciplines × 3 strategies = 15 full optimizations of a
  // fully-unconstrained S1 build. Generous timeout so it doesn't flake under load.
  it('every generated strategy tune sits within the car ranges', () => {
    const disciplines = ['road', 'dirt', 'drift', 'drag', 'top_speed'] as const;
    const ranges = store.getTuneRanges('mazda-mx5-nd-2019');
    for (const discipline of disciplines) {
      const result = generateBuild(store, makeRequest({ discipline, targetClass: 'S1' }));
      for (const s of result.strategies) assertTuneWithinRanges(s.tune.tune, ranges);
    }
  }, 20000);

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

describe('optimizer optimality', () => {
  // On a search space small enough to enumerate exhaustively, the heuristic must
  // return a build whose score equals the true (brute-force) optimum.
  const cases: {
    car: string;
    discipline: Discipline;
    cls: 'B' | 'A' | 'S1';
    free: UpgradeCategory[];
  }[] = [
    {
      car: 'bmw-m3-e46-2005',
      discipline: 'road',
      cls: 'S1',
      free: ['tire_compound', 'brakes', 'intake', 'weight_reduction', 'springs_dampers'],
    },
    {
      car: 'subaru-wrx-sti-2019',
      discipline: 'rally',
      cls: 'A',
      free: ['tire_compound', 'drivetrain_swap', 'weight_reduction', 'differential'],
    },
    {
      car: 'ford-mustang-gt-2018',
      discipline: 'drag',
      cls: 'S1',
      free: ['tire_compound', 'intake', 'exhaust', 'weight_reduction', 'transmission'],
    },
  ];

  for (const tc of cases) {
    it(`matches the exhaustive optimum: ${tc.car} · ${tc.discipline} · ${tc.cls}`, () => {
      const car = rcar(tc.car);
      const surface = DISCIPLINE_SURFACE[tc.discipline];
      const cap = classMaxPi(tc.cls);
      const req = makeRequest({
        carId: tc.car,
        discipline: tc.discipline,
        targetClass: tc.cls,
        constraints: { allowedCategories: tc.free },
      });
      const opts = { strategy: 'balanced' as const };
      const weights = disciplineWeights(tc.discipline, 'balanced');
      const scoreOf = (sel: Record<string, string>) =>
        scoreSpec(buildSpec(store, car, sel, surface), weights, tc.discipline).total;

      const heuristic = optimizeSelection(store, car, req, surface, cap, null, opts);
      const exhaustive = bruteForceOptimize(store, car, req, surface, cap, null, opts);

      // Both feasible, and the heuristic's score equals the true optimum.
      expect(
        estimatePI(car, buildSpec(store, car, heuristic.selection, surface)).pi,
      ).toBeLessThanOrEqual(cap);
      expect(scoreOf(heuristic.selection)).toBeCloseTo(scoreOf(exhaustive.selection), 4);
    });
  }
});

describe('car comparison', () => {
  it('chassis-balance fit peaks at the discipline ideal and stays in 0..1', () => {
    // Drag rewards a rear-biased (nose-light) car; drift a ~53% front balance.
    expect(chassisBalanceFit(45, 'drag')).toBeGreaterThan(chassisBalanceFit(55, 'drag'));
    expect(chassisBalanceFit(53, 'drift')).toBeGreaterThan(chassisBalanceFit(40, 'drift'));
    for (const f of [30, 45, 50, 55, 70]) {
      const v = chassisBalanceFit(f, 'road');
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('ranks cars, skipping unknown and duplicate ids', () => {
    const req = makeRequest({ discipline: 'road', targetClass: 'S1' });
    const result = compareCars(
      store,
      ['mazda-mx5-nd-2019', 'bmw-m3-e46-2005', 'mazda-mx5-nd-2019', 'ghost-car'],
      req,
    );
    expect(result.rows).toHaveLength(2); // dupe + unknown dropped
    for (let i = 1; i < result.rows.length; i += 1) {
      expect(result.rows[i - 1]!.comparisonScore).toBeGreaterThanOrEqual(
        result.rows[i]!.comparisonScore,
      );
    }
    // Deterministic.
    const again = compareCars(store, ['mazda-mx5-nd-2019', 'bmw-m3-e46-2005'], req);
    expect(again.rows.map((r) => r.carId)).toEqual(
      result.rows.map((r) => r.carId).filter((id) => id !== undefined),
    );
  });

  it('weight distribution breaks ties between otherwise-identical cars', () => {
    // Two cars identical except weight balance; for drift the ~53%-front one wins.
    const dataset = structuredClone(store.dataset);
    const base: Car = {
      id: '',
      year: 2020,
      make: 'Test',
      model: 'T',
      name: '2020 Test T',
      ownership: 'Base game',
      isBaseGame: true,
      stockClass: 'A',
      stockPI: 650,
      drivetrain: 'RWD',
      massKg: 1300,
      powerHp: 400,
      aspiration: 'NA',
      stockTireCompound: 'stock',
      source: 'forza-official-cars',
      confidence: 'medium',
      dataVersion: 'test',
    };
    dataset.cars.push(
      { ...base, id: 'balance-good', weightDistFrontPct: 53 },
      { ...base, id: 'balance-bad', weightDistFrontPct: 40 },
    );
    const testStore = createDataStore(dataset);
    const result = compareCars(
      testStore,
      ['balance-bad', 'balance-good'],
      makeRequest({ discipline: 'drift', targetClass: 'A' }),
    );
    expect(result.rows[0]!.carId).toBe('balance-good');
    expect(result.rows[0]!.goalFitScore).toBeCloseTo(result.rows[1]!.goalFitScore, 4);
    expect(result.rows[0]!.chassisFit).toBeGreaterThan(result.rows[1]!.chassisFit);
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
    const sum =
      w.accel + w.grip + w.braking + w.launch + w.topSpeed + w.balance + w.setupFit + w.powerFit;
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
    const m = normalizeMetrics(spec, 'drift');
    for (const v of [
      m.accel,
      m.grip,
      m.braking,
      m.launch,
      m.topSpeed,
      m.balance,
      m.setupFit,
      m.powerFit,
    ]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('drivetrain fit steers the goal', () => {
  // Same build, only the drivetrain differs. The drivetrain-fit metric must flip
  // the ranking by discipline: drift wants RWD, rally wants AWD — even though AWD
  // always has the higher raw launch factor.
  const car = rcar('bmw-m3-e46-2005');
  const base = buildSpec(store, car, {}, 'tarmac');
  const asRWD = { ...base, drivetrain: 'RWD' as const, launchFactor: 1.0 };
  const asAWD = { ...base, drivetrain: 'AWD' as const, launchFactor: 1.2 };
  const scoreFor = (spec: typeof base, d: Discipline) =>
    scoreSpec(spec, disciplineWeights(d, 'balanced'), d).total;

  it('prefers RWD for drift', () => {
    expect(scoreFor(asRWD, 'drift')).toBeGreaterThan(scoreFor(asAWD, 'drift'));
  });

  it('prefers AWD for rally', () => {
    expect(scoreFor(asAWD, 'rally')).toBeGreaterThan(scoreFor(asRWD, 'rally'));
  });
});

describe('tire choice fits the goal', () => {
  // Drift tires grip less than slicks in raw terms, so a grip-only model would
  // always pick slicks. The tire-fit metric must flip a drift build to drift
  // tires — while a road build must still prefer slicks.
  const car = rcar('mazda-mx5-nd-2019');

  it('drift prefers drift tires over slicks', () => {
    const surface = DISCIPLINE_SURFACE.drift;
    const onSlicks = buildSpec(store, car, { tire_compound: 'tire-slick' }, surface);
    const onDrift = buildSpec(store, car, { tire_compound: 'tire-drift' }, surface);
    const w = disciplineWeights('drift', 'balanced');
    expect(scoreSpec(onDrift, w, 'drift').total).toBeGreaterThan(
      scoreSpec(onSlicks, w, 'drift').total,
    );
  });

  it('road still prefers slicks over drift tires', () => {
    const surface = DISCIPLINE_SURFACE.road;
    const onSlicks = buildSpec(store, car, { tire_compound: 'tire-slick' }, surface);
    const onDrift = buildSpec(store, car, { tire_compound: 'tire-drift' }, surface);
    const w = disciplineWeights('road', 'balanced');
    expect(scoreSpec(onSlicks, w, 'road').total).toBeGreaterThan(
      scoreSpec(onDrift, w, 'road').total,
    );
  });

  it('a generated drift build selects the drift/street setup the expert model prefers', () => {
    // Real-feedback regression, updated to the expert (video-2) model: drift springs
    // for the extra lock, a RALLY diff (smoother grip loss than a locked drift diff),
    // STREET tires (grip is control — you tune slip in elsewhere), and a RACE
    // transmission for the gear-ratio unlock the drift gears need.
    const result = generateBuild(
      store,
      makeRequest({ carId: car.id, discipline: 'drift', targetClass: 'S1' }),
    );
    const top = result.strategies[0]!;
    expect(top.selection.springs_dampers).toBe('susp-drift');
    expect(top.selection.differential).toBe('diff-rally');
    expect(top.selection.tire_compound).toBe('tire-street');
    expect(top.selection.transmission).toBe('trans-race');
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

describe('base-engine platform gate (rotary)', () => {
  it('a rotary car gains no power from piston-only upgrades, but does from valid ones', () => {
    const rec = store.getCar('1990-mazda-savanna-rx-7');
    expect(rec, 'expected a rotary seed car to exist').toBeDefined();
    const car = resolveEffectiveCar(rec!).car;
    const stock = buildSpec(store, car, {}, 'tarmac');

    // Camshaft is a piston-only internal — a rotary has none, so it adds no power.
    const cam = store.getPartsByCategory('camshaft').find((p) => p.effects.powerMultiplier)!;
    const withCam = buildSpec(store, car, { camshaft: cam.id }, 'tarmac');
    expect(withCam.powerHp).toBeCloseTo(stock.powerHp, 3);

    // Intake is valid on a rotary — it still adds power.
    const intake = store.getPartsByCategory('intake').find((p) => p.effects.powerMultiplier)!;
    const withIntake = buildSpec(store, car, { intake: intake.id }, 'tarmac');
    expect(withIntake.powerHp).toBeGreaterThan(stock.powerHp);
  });

  it('a piston car still gains power from a camshaft (gate is engine-type specific)', () => {
    const car = rcar('bmw-m3-e46-2005');
    const stock = buildSpec(store, car, {}, 'tarmac');
    const cam = store.getPartsByCategory('camshaft').find((p) => p.effects.powerMultiplier)!;
    const withCam = buildSpec(store, car, { camshaft: cam.id }, 'tarmac');
    expect(withCam.powerHp).toBeGreaterThan(stock.powerHp);
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
