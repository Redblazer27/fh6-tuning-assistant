import { describe, expect, it } from 'vitest';
import { DISCIPLINE_SURFACE, piToClass, type Discipline } from '@fh6/shared';
import { defaultDataset, defaultStore } from '@fh6/data';
import {
  buildSpec,
  computeTune,
  estimatePI,
  generateBuild,
  resolveEffectiveCar,
} from '../src/index.ts';
import { assertTuneWithinRanges, makeRequest } from './helpers.ts';

/**
 * Whole-roster audit. Cheap invariants run over EVERY car (data sanity + tune
 * legality at the extremes of the build space, which is what the optimizer picks
 * between); the expensive end-to-end optimizer runs over a diverse sample. The
 * goal is to catch a single bad car (NaN physics, out-of-range tune, an
 * unavailable part sneaking into a build) before it reaches a user.
 */

const store = defaultStore;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

describe('roster audit · data sanity (every car)', () => {
  it('every car has finite physics, a class-consistent PI, and stock-anchored PI', () => {
    const bad: string[] = [];
    for (const car of store.cars) {
      if (piToClass(car.stockPI) !== car.stockClass) {
        bad.push(`${car.id}: stockPI ${car.stockPI} is not class ${car.stockClass}`);
      }
      const { car: rc } = resolveEffectiveCar(car);
      if (!(finite(rc.massKg) && rc.massKg > 0)) bad.push(`${car.id}: mass ${rc.massKg}`);
      if (!(finite(rc.powerHp) && rc.powerHp > 0)) bad.push(`${car.id}: power ${rc.powerHp}`);
      if (!(finite(rc.weightDistFrontPct) && rc.weightDistFrontPct > 0))
        bad.push(`${car.id}: weightDist ${rc.weightDistFrontPct}`);
      // A stock build must estimate exactly the (authoritative) stock PI.
      const stock = buildSpec(store, rc, {}, 'tarmac');
      if (estimatePI(rc, stock).pi !== car.stockPI)
        bad.push(`${car.id}: stock PI drifted from ${car.stockPI}`);
    }
    expect(bad.slice(0, 15), `${bad.length} cars failed data sanity`).toEqual([]);
  });
});

describe('roster audit · tune legality at build extremes (every car)', () => {
  // The optimizer only ever selects between "stock" and "everything maxed"; if
  // computeTune stays legal at both extremes across disciplines, it stays legal
  // for anything in between — checkable for all cars without the optimizer.
  const maxedSelection = (carId: string): Record<string, string> => {
    const sel: Record<string, string> = {};
    for (const cat of store.categories) {
      const parts = store.getAvailablePartsByCategory(carId, cat);
      const top = parts.reduce((a, b) => (b.tierRank > a.tierRank ? b : a), parts[0]!);
      if (top && top.tierRank > 0) sel[cat] = top.id;
    }
    return sel;
  };

  it('computeTune stays within ranges for stock and maxed builds, every car × key disciplines', () => {
    const disciplines: Discipline[] = ['road', 'dirt', 'drift', 'drag', 'top_speed'];
    const bad: string[] = [];
    for (const car of store.cars) {
      const { car: rc } = resolveEffectiveCar(car);
      const ranges = store.getTuneRanges(car.id);
      const maxed = maxedSelection(car.id);
      for (const discipline of disciplines) {
        const surface = DISCIPLINE_SURFACE[discipline];
        for (const [tag, sel] of [
          ['stock', {}],
          ['maxed', maxed],
        ] as const) {
          try {
            const spec = buildSpec(store, rc, sel, surface);
            const tune = computeTune(rc, spec, ranges, makeRequest({ carId: car.id, discipline }));
            assertTuneWithinRanges(tune.tune, ranges);
          } catch (e) {
            bad.push(`${car.id} · ${discipline} · ${tag}: ${(e as Error).message.split('\n')[0]}`);
          }
        }
      }
    }
    expect(bad.slice(0, 15), `${bad.length} car/discipline tunes out of range`).toEqual([]);
  }, 15_000);
});

describe('roster audit · end-to-end builds (diverse sample)', () => {
  // A deterministic, diverse slice: one car per class, per drivetrain, plus
  // physics-less, rotary, engine-swap, body-kit, and PI-extreme edge cases.
  const sample = (): string[] => {
    const ids = new Set<string>();
    const take = (car: { id: string } | undefined) => car && ids.add(car.id);

    for (const cls of ['D', 'C', 'B', 'A', 'S1', 'S2', 'R'] as const) {
      take(store.cars.find((c) => c.stockClass === cls));
    }
    for (const dt of ['FWD', 'RWD', 'AWD'] as const) {
      take(store.cars.find((c) => c.drivetrain === dt));
    }
    // Physics-less cars (rely on class-based defaults).
    store.cars
      .filter((c) => !c.drivetrain || !c.massKg || !c.powerHp)
      .slice(0, 3)
      .forEach(take);
    // Profile edge cases.
    const profiles = defaultDataset.carUpgradeProfiles;
    take(store.getCar(profiles.find((p) => p.engineType === 'rotary')?.carId ?? ''));
    take(
      store.getCar(profiles.find((p) => (p.availableEngineSwapIds?.length ?? 0) > 0)?.carId ?? ''),
    );
    take(store.getCar(profiles.find((p) => p.bodyKitOptions.length > 0)?.carId ?? ''));
    take(store.getCar(profiles.find((p) => p.lockedCategories.length > 0)?.carId ?? ''));
    // PI extremes.
    const byPi = [...store.cars].sort((a, b) => a.stockPI - b.stockPI);
    take(byPi[0]);
    take(byPi[byPi.length - 1]);
    // A deterministic spread across the roster.
    for (let i = 0; i < store.cars.length; i += 90) take(store.cars[i]);

    return [...ids];
  };

  it('builds a legal, sane strategy for every sampled car, using only available parts', () => {
    const bad: string[] = [];
    for (const carId of sample()) {
      const car = store.getCar(carId)!;
      const targetClass = car.stockClass;
      let result;
      try {
        result = generateBuild(store, makeRequest({ carId, discipline: 'road', targetClass }));
      } catch (e) {
        bad.push(`${carId}: threw ${(e as Error).message}`);
        continue;
      }
      if (result.strategies.length === 0) {
        bad.push(`${carId}: produced no strategies`);
        continue;
      }
      const cap = result.piCap;
      for (const s of result.strategies) {
        if (!(finite(s.score.total) && s.score.total >= 0 && s.score.total <= 100))
          bad.push(`${carId}/${s.id}: score ${s.score.total}`);
        if (!(finite(s.pi.pi) && s.pi.pi >= 100 && s.pi.pi <= 999))
          bad.push(`${carId}/${s.id}: pi ${s.pi.pi}`);
        if (cap !== null && s.legal && s.pi.pi > cap)
          bad.push(`${carId}/${s.id}: legal but pi ${s.pi.pi} > cap ${cap}`);
        // Every selected part must actually be available for this car.
        const selectedEngine = s.selection.engine_swap
          ? store.getPart(s.selection.engine_swap)?.gameEngineId
          : undefined;
        for (const cat of store.categories) {
          const id = s.selection[cat];
          if (!id) continue;
          const avail = store.getAvailablePartsByCategory(carId, cat, selectedEngine);
          if (!avail.some((p) => p.id === id))
            bad.push(`${carId}/${s.id}: ${cat}=${id} not available for this car`);
        }
        try {
          assertTuneWithinRanges(s.tune.tune, store.getTuneRanges(carId));
        } catch (e) {
          bad.push(`${carId}/${s.id}: tune ${(e as Error).message.split('\n')[0]}`);
        }
      }
    }
    expect(bad.slice(0, 20), `${bad.length} problems across the sample`).toEqual([]);
  }, 60000);
});
