import { describe, expect, it } from 'vitest';
import { TUNING_CATEGORIES } from '@fh6/shared';
import { createDataStore, loadDataset, rawSeed } from '@fh6/data';
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
    expect(s.selection.drivetrain_swap).not.toBe(store.getStockPart('drivetrain_swap')!.id);
  });

  it('uses a preferred engine swap', () => {
    const swapId = store.getUpgradeProfile('ford-mustang-gt-2018')!.availableEngineSwapIds![0]!;
    const s = topOf(
      makeRequest({
        carId: 'ford-mustang-gt-2018',
        discipline: 'top_speed',
        constraints: { preferredEngineSwapId: swapId, allowEngineSwap: true },
      }),
    );
    expect(s.selection.engine_swap).toBe(swapId);
  });

  it('a locked-swap profile overrides an explicit engine-swap request', () => {
    const swapId = store.getUpgradeProfile('ford-mustang-gt-2018')!.availableEngineSwapIds![0]!;
    const raw = structuredClone(rawSeed);
    const index = raw.carUpgradeProfiles!.findIndex((p) => p.carId === 'ford-mustang-gt-2018');
    const current = raw.carUpgradeProfiles![index]!;
    raw.carUpgradeProfiles![index] = {
      ...current,
      availableEngineSwapIds: [],
      availableDrivetrainSwapIds: [],
    };
    const locked = createDataStore(loadDataset(raw));
    const s = generateBuild(
      locked,
      makeRequest({
        carId: 'ford-mustang-gt-2018',
        discipline: 'top_speed',
        targetClass: 'R',
        constraints: { preferredEngineSwapId: swapId, allowEngineSwap: true },
      }),
    ).strategies[0]!;
    expect(s.selection.engine_swap).toBe(locked.getStockPart('engine_swap')!.id);
    expect(s.selection.drivetrain_swap).toBe(locked.getStockPart('drivetrain_swap')!.id);
  });

  it('honors the no-aero constraint', () => {
    const s = topOf(
      makeRequest({
        carId: 'porsche-911-gt3-991-2018',
        discipline: 'road',
        targetClass: 'R',
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
      locks: { tire_compound: 'tire-slick' },
    });
    for (const s of result.strategies) expect(s.selection.tire_compound).toBe('tire-slick');
  });
});

describe('discipline-specific builds', () => {
  it('drag build locks up the rear differential', () => {
    const s = topOf(
      makeRequest({ carId: 'ford-mustang-gt-2018', discipline: 'drag', targetClass: 'S2' }),
    );
    expect(s.tune.tune.differential.accelRearPct ?? 0).toBeGreaterThanOrEqual(55);
  });

  it('drift build runs soft bars, front stiffer than rear, near-locked rear diff', () => {
    const s = topOf(
      makeRequest({ carId: 'nissan-silvia-s15-1999', discipline: 'drift', targetClass: 'A' }),
    );
    const arb = s.tune.tune.antiRollBars;
    // Expert model: bars on the soft side, FRONT slightly stiffer than rear
    // (sharper turn-in + a soft, grippy rear you drive the slide through).
    expect(arb.front).toBeGreaterThan(arb.rear);
    expect(arb.front).toBeLessThan(30); // soft, not the old max-stiff
    // Front toe-OUT (negative), rear toe-IN (positive), caster maxed.
    expect(s.tune.tune.alignment.toeFrontDeg).toBeLessThan(0);
    expect(s.tune.tune.alignment.toeRearDeg).toBeGreaterThan(0);
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
