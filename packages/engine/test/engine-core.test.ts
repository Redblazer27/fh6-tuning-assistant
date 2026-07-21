import { describe, expect, it } from 'vitest';
import { DISCIPLINE_SURFACE } from '@fh6/shared';
import {
  buildSpec,
  computeTune,
  estimatePI,
  generateBuild,
  normalizeMetrics,
  scoreSpec,
  disciplineWeights,
} from '../src/index.ts';
import { assertTuneWithinRanges, makeRequest, store } from './helpers.ts';

describe('PI estimate (stock-anchored)', () => {
  it('a stock build estimates exactly the car stock PI', () => {
    for (const car of store.cars) {
      const spec = buildSpec(store, car, {}, 'tarmac');
      expect(estimatePI(car, spec).pi).toBe(car.stockPI);
    }
  });

  it('adding grip + power raises PI above stock', () => {
    const car = store.getCar('mazda-mx5-nd-2019')!;
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
    const car = store.getCar('bmw-m3-e46-2005')!;
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

    const car = store.getCar('porsche-911-gt3-991-2018')!;
    const spec = buildSpec(store, car, {}, 'tarmac');
    const breakdown = scoreSpec(spec, w);
    const added = breakdown.components.reduce((s, c) => s + c.contribution, 0);
    expect(breakdown.total).toBeCloseTo(added, 1);
  });

  it('normalized metrics stay within 0..1', () => {
    const car = store.getCar('koenigsegg-jesko-2020')!;
    const spec = buildSpec(store, car, {}, 'tarmac');
    const m = normalizeMetrics(spec);
    for (const v of [m.accel, m.grip, m.braking, m.launch, m.topSpeed]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
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
