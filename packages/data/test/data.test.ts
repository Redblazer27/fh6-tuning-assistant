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
    // Curated set + the full official roster.
    expect(defaultDataset.cars.length).toBeGreaterThanOrEqual(600);
  });

  it('includes the official roster, most cars enriched with real physics', () => {
    const roster = defaultDataset.cars.filter((c) => c.source === 'forza-official-cars');
    expect(roster.length).toBeGreaterThanOrEqual(500);
    // Most roster cars are enriched from the community wiki (real physics, medium).
    const enriched = roster.filter((c) => c.drivetrain && c.massKg && c.powerHp);
    expect(enriched.length).toBeGreaterThanOrEqual(400);
    expect(enriched[0]!.confidence).toBe('medium');
  });

  it('has per-car FH6 upgrade profiles (engine swaps, drivetrain, rotary)', () => {
    const profiles = defaultDataset.carUpgradeProfiles.filter(
      (p) => p.source === 'fandom-fh6-cars',
    );
    expect(profiles.length).toBeGreaterThanOrEqual(300);
    expect(profiles.some((p) => p.engineSwapOptions.length > 0)).toBe(true);
    expect(profiles.some((p) => (p.availableDrivetrainSwapIds?.length ?? 0) > 0)).toBe(true);
    expect(profiles.some((p) => p.engineType === 'rotary')).toBe(true);
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

describe('per-car upgrade profiles', () => {
  const JESKO = 'koenigsegg-jesko-2020';

  it('locks engine & drivetrain swaps for a car whose profile forbids them', () => {
    const swaps = defaultStore.getAvailablePartsByCategory(JESKO, 'engine_swap');
    expect(swaps).toHaveLength(1);
    expect(swaps[0]!.tierRank).toBe(0);
    const dt = defaultStore.getAvailablePartsByCategory(JESKO, 'drivetrain_swap');
    expect(dt.every((p) => p.tierRank === 0)).toBe(true);
  });

  it('a car without a profile gets the full catalog except opt-in real engines', () => {
    expect(defaultStore.getUpgradeProfile('mazda-mx5-nd-2019')).toBeUndefined();
    // Non-swap categories are identical to the global catalog (backward compatible).
    const intakeAll = defaultStore.getPartsByCategory('intake');
    const intakeForCar = defaultStore.getAvailablePartsByCategory('mazda-mx5-nd-2019', 'intake');
    expect(intakeForCar).toEqual(intakeAll);
    // Engine swaps: the generic swap is offered, but concrete real engines are opt-in only.
    const swaps = defaultStore.getAvailablePartsByCategory('mazda-mx5-nd-2019', 'engine_swap');
    expect(swaps.some((p) => p.id === 'engine-swap-highperf')).toBe(true);
    expect(swaps.some((p) => p.id.startsWith('eng-'))).toBe(false);
  });

  it('a car whose profile allowlists real engines can use them (with real power)', () => {
    const profiled = defaultDataset.carUpgradeProfiles.find(
      (p) => (p.availableEngineSwapIds?.length ?? 0) > 0,
    )!;
    const swaps = defaultStore.getAvailablePartsByCategory(profiled.carId, 'engine_swap');
    const realEngines = swaps.filter((p) => p.id.startsWith('eng-'));
    expect(realEngines.length).toBeGreaterThan(0);
    expect(realEngines.every((e) => (e.effects.setsPowerHp ?? 0) > 0)).toBe(true);
  });

  it('exposes the profile and its engine type', () => {
    expect(defaultStore.getUpgradeProfile(JESKO)?.engineType).toBe('piston');
  });

  it('restricts swaps to an allowlist, blocklists parts, and locks categories', () => {
    const raw = structuredClone(rawSeed);
    raw.carUpgradeProfiles!.push({
      source: 'community-tuning-consensus',
      confidence: 'low',
      dataVersion: raw.version.dataVersion,
      carId: 'toyota-supra-rz-1998',
      availableEngineSwapIds: ['engine-swap-highperf'],
      lockedCategories: ['intake'],
      restrictedPartIds: ['exhaust-race'],
    });
    const store = createDataStore(loadDataset(raw));

    const swaps = store.getAvailablePartsByCategory('toyota-supra-rz-1998', 'engine_swap');
    expect(swaps.map((p) => p.id).sort()).toEqual(['engine-swap-highperf', 'engine_swap-stock']);

    const intake = store.getAvailablePartsByCategory('toyota-supra-rz-1998', 'intake');
    expect(intake.every((p) => p.tierRank === 0)).toBe(true);

    const exhaust = store.getAvailablePartsByCategory('toyota-supra-rz-1998', 'exhaust');
    expect(exhaust.some((p) => p.id === 'exhaust-race')).toBe(false);
    expect(exhaust.some((p) => p.tierRank === 0)).toBe(true);
  });
});

describe('integrity failures', () => {
  it('throws when a car cites an unknown source', () => {
    const broken = structuredClone(rawSeed);
    broken.cars[0]!.source = 'does-not-exist';
    expect(() => loadDataset(broken)).toThrow(/unknown source/);
  });

  it('throws when an upgrade profile targets an unknown car', () => {
    const broken = structuredClone(rawSeed);
    broken.carUpgradeProfiles!.push({
      source: 'community-tuning-consensus',
      confidence: 'low',
      dataVersion: broken.version.dataVersion,
      carId: 'ghost-car',
    });
    expect(() => loadDataset(broken)).toThrow(/unknown car/);
  });

  it('throws when a profile references an unknown or wrong-category swap part', () => {
    const unknown = structuredClone(rawSeed);
    unknown.carUpgradeProfiles!.push({
      source: 'community-tuning-consensus',
      confidence: 'low',
      dataVersion: unknown.version.dataVersion,
      carId: 'mazda-mx5-nd-2019',
      availableEngineSwapIds: ['not-a-real-part'],
    });
    expect(() => loadDataset(unknown)).toThrow(/unknown part/);

    const wrongCat = structuredClone(rawSeed);
    wrongCat.carUpgradeProfiles!.push({
      source: 'community-tuning-consensus',
      confidence: 'low',
      dataVersion: wrongCat.version.dataVersion,
      carId: 'mazda-mx5-nd-2019',
      availableEngineSwapIds: ['intake-sport'], // exists, but wrong category
    });
    expect(() => loadDataset(wrongCat)).toThrow(/not a engine_swap/);
  });

  it('throws on duplicate profiles for the same car', () => {
    const broken = structuredClone(rawSeed);
    const dup = {
      source: 'community-tuning-consensus',
      confidence: 'low' as const,
      dataVersion: broken.version.dataVersion,
      carId: 'mazda-mx5-nd-2019',
    };
    broken.carUpgradeProfiles!.push(dup, structuredClone(dup));
    expect(() => loadDataset(broken)).toThrow(/Duplicate upgrade profile/);
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
