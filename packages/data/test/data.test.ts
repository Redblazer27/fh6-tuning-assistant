import { describe, expect, it } from 'vitest';
import { piToClass } from '@fh6/shared';
import {
  createDataStore,
  defaultDataset,
  defaultStore,
  loadDataset,
  rawSeed,
} from '../src/index.ts';

describe('seed dataset', () => {
  it('loads and passes integrity checks', () => {
    expect(() => loadDataset(rawSeed)).not.toThrow();
    expect(defaultDataset.cars.length).toBeGreaterThanOrEqual(15);
  });

  it('every car stockPI matches its stockClass', () => {
    for (const car of defaultDataset.cars) {
      expect(piToClass(car.stockPI)).toBe(car.stockClass);
    }
  });

  it('covers all three drivetrains', () => {
    const dts = new Set(defaultDataset.cars.map((c) => c.drivetrain));
    expect(dts).toContain('FWD');
    expect(dts).toContain('RWD');
    expect(dts).toContain('AWD');
  });

  it('has a stock option for every upgrade category present', () => {
    for (const category of defaultStore.categories) {
      expect(defaultStore.getStockPart(category)).toBeDefined();
    }
  });

  it('tire_compound parts set a compound', () => {
    const tires = defaultStore.getPartsByCategory('tire_compound').filter((p) => p.tierRank > 0);
    expect(tires.length).toBeGreaterThan(0);
    for (const t of tires) expect(t.setsTireCompound).toBeTruthy();
  });

  it('race suspension unlocks springs & damping', () => {
    const race = defaultStore.getPart('susp-race');
    expect(race?.unlocks).toContain('springs');
    expect(race?.unlocks).toContain('damping');
  });
});

describe('data store', () => {
  it('falls back to the default tune-range template for unknown cars', () => {
    const ranges = defaultStore.getTuneRanges('nonexistent-car');
    expect(ranges.appliesToCarId).toBeNull();
    expect(ranges.arb.max).toBe(65);
  });

  it('orders parts within a category by tier rank', () => {
    const tires = defaultStore.getPartsByCategory('tire_compound');
    for (let i = 1; i < tires.length; i += 1) {
      expect(tires[i]!.tierRank).toBeGreaterThanOrEqual(tires[i - 1]!.tierRank);
    }
  });
});

describe('integrity failures', () => {
  it('throws when a car cites an unknown source', () => {
    const broken = structuredClone(rawSeed);
    broken.cars[0]!.source = 'does-not-exist';
    expect(() => loadDataset(broken)).toThrow(/unknown source/);
  });

  it('throws when stockPI does not match stockClass', () => {
    const broken = structuredClone(rawSeed);
    broken.cars[0]!.stockPI = 950; // no longer class D
    expect(() => loadDataset(broken)).toThrow(/maps to/);
  });

  it('creates an independent store per dataset', () => {
    const store = createDataStore(defaultDataset);
    expect(store.getCar('mazda-mx5-nd-2019')).toBeDefined();
  });
});
