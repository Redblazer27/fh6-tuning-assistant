import { describe, expect, it } from 'vitest';
import { TUNING_CATEGORIES } from '@fh6/shared';
import { CONDITION_MODIFIERS, SYMPTOMS, generateBuild } from '../src/index.ts';
import { makeRequest, store } from './helpers.ts';

const topOf = (
  req: Parameters<typeof generateBuild>[1],
  opts?: Parameters<typeof generateBuild>[2],
) => generateBuild(store, req, opts).strategies[0]!;

describe('PI cap boundary', () => {
  it('lands at or below the requested PI and is legal', () => {
    const result = generateBuild(store, makeRequest({ discipline: 'road', targetClass: 'B' }));
    for (const s of result.strategies) {
      expect(s.pi.pi).toBeLessThanOrEqual(700);
    }
    expect(result.strategies[0]!.legal).toBe(true);
    expect(result.strategies[0]!.pi.pi).toBeGreaterThan(400); // it upgraded from stock
  });

  it('ranks strategies by score (descending)', () => {
    const result = generateBuild(store, makeRequest({ discipline: 'road', targetClass: 'A' }));
    for (let i = 1; i < result.strategies.length; i += 1) {
      expect(result.strategies[i - 1]!.score.total).toBeGreaterThanOrEqual(
        result.strategies[i]!.score.total,
      );
    }
  });
});

describe('stock over cap (infeasible)', () => {
  it('flags a car whose stock PI is too far over the cap to legalize', () => {
    // Corvette Z06 (830) vs a C cap (600): even de-tuning (worse tires) can't reach it.
    const result = generateBuild(
      store,
      makeRequest({ carId: 'chevrolet-corvette-z06-2015', discipline: 'road', targetClass: 'C' }),
    );
    expect(result.warnings[0]).toMatch(/already exceeds/i);
    expect(result.strategies.every((s) => !s.legal)).toBe(true);
  });
});

describe('constraints', () => {
  it('respects disallowed categories (unavailable upgrades)', () => {
    const s = topOf(
      makeRequest({
        discipline: 'road',
        targetClass: 'S1',
        constraints: { disallowedCategories: ['tire_compound'] },
      }),
    );
    const stockTireId = store.getStockPart('tire_compound')!.id;
    expect(s.selection.tire_compound).toBe(stockTireId);
    expect(s.builtSpec.tireCompound).toBe('stock');
  });

  it('performs an AWD conversion when preferred', () => {
    const s = topOf(
      makeRequest({
        carId: 'mazda-mx5-nd-2019',
        discipline: 'rally',
        targetClass: 'A',
        constraints: { preferredDrivetrain: 'AWD' },
      }),
    );
    expect(s.builtSpec.drivetrain).toBe('AWD');
    expect(s.selection.drivetrain_swap).toBe('dt-swap-awd');
  });

  it('uses a preferred engine swap', () => {
    const s = topOf(
      makeRequest({
        carId: 'mazda-mx5-nd-2019',
        discipline: 'top_speed',
        constraints: { preferredEngineSwapId: 'engine-swap-highperf', allowEngineSwap: true },
      }),
    );
    expect(s.selection.engine_swap).toBe('engine-swap-highperf');
  });

  it("a car's locked-swap profile overrides an explicit engine-swap request", () => {
    // The Jesko's upgrade profile forbids engine swaps, so even an explicit
    // preferred swap cannot be applied — the car simply can't do it.
    const s = topOf(
      makeRequest({
        carId: 'koenigsegg-jesko-2020',
        discipline: 'top_speed',
        targetClass: 'X',
        constraints: { preferredEngineSwapId: 'engine-swap-highperf', allowEngineSwap: true },
      }),
    );
    expect(s.selection.engine_swap).toBe(store.getStockPart('engine_swap')!.id);
    expect(s.selection.drivetrain_swap).toBe(store.getStockPart('drivetrain_swap')!.id);
  });

  it('honors the no-aero constraint', () => {
    const s = topOf(
      makeRequest({
        carId: 'porsche-911-gt3-991-2018',
        discipline: 'road',
        targetClass: 'S2',
        constraints: { noAero: true },
      }),
    );
    expect(s.tune.tune.aero).toBeNull();
    expect(s.selection.front_aero).toBe(store.getStockPart('front_aero')!.id);
    expect(s.selection.rear_aero).toBe(store.getStockPart('rear_aero')!.id);
    expect(s.legal).toBe(true);
  });

  it('stays within a credit budget', () => {
    const result = generateBuild(
      store,
      makeRequest({ discipline: 'road', targetClass: 'A', constraints: { budgetCredits: 20000 } }),
    );
    for (const s of result.strategies) expect(s.totalCost).toBeLessThanOrEqual(20000);
  });

  it('keeps user-locked parts across optimization', () => {
    const result = generateBuild(store, makeRequest({ discipline: 'road', targetClass: 'S1' }), {
      locks: { tire_compound: 'tire-street' },
    });
    for (const s of result.strategies) expect(s.selection.tire_compound).toBe('tire-street');
  });
});

describe('discipline-specific builds', () => {
  it('drag build locks up the rear differential', () => {
    const s = topOf(
      makeRequest({ carId: 'ford-mustang-gt-2018', discipline: 'drag', targetClass: 'S2' }),
    );
    expect(s.tune.tune.differential.accelRearPct ?? 0).toBeGreaterThanOrEqual(55);
  });

  it('drift build runs a much stiffer rear ARB than front', () => {
    const s = topOf(
      makeRequest({ carId: 'nissan-silvia-s15-1999', discipline: 'drift', targetClass: 'A' }),
    );
    expect(s.tune.tune.antiRollBars.rear).toBeGreaterThan(s.tune.tune.antiRollBars.front);
    expect(s.tune.tune.differential.accelRearPct ?? 0).toBeGreaterThanOrEqual(90);
  });

  it('dirt build chooses a loose-surface tire compound', () => {
    const s = topOf(
      makeRequest({ carId: 'subaru-wrx-sti-2019', discipline: 'dirt', targetClass: 'S1' }),
    );
    expect(['rally', 'offroad']).toContain(s.builtSpec.tireCompound);
  });
});

describe('symptom guidance', () => {
  it('exposes symptoms with valid, ordered adjustments', () => {
    expect(SYMPTOMS.length).toBeGreaterThanOrEqual(8);
    const validAreas = new Set<string>([...TUNING_CATEGORIES, 'general']);
    for (const symptom of SYMPTOMS) {
      expect(symptom.adjustments.length).toBeGreaterThan(0);
      for (const adj of symptom.adjustments) expect(validAreas.has(adj.area)).toBe(true);
    }
    expect(CONDITION_MODIFIERS.map((m) => m.id)).toContain('wet');
  });
});
