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
    expect(defaultDataset.cars).toHaveLength(651);
    expect(defaultDataset.gameDatabaseBuild).toBe('Steam build 24241019');
  });

  it('loads all game cars with authoritative physics', () => {
    const roster = defaultDataset.cars.filter((c) => c.source === 'fh6-game-files');
    expect(roster).toHaveLength(651);
    expect(roster.every((c) => c.gameId && c.drivetrain && c.massKg && c.powerHp)).toBe(true);
    expect(roster.every((c) => c.confidence === 'high')).toBe(true);
  });

  it('has per-car FH6 upgrade profiles (engine swaps, drivetrain, rotary)', () => {
    const profiles = defaultDataset.carUpgradeProfiles.filter((p) => p.source === 'fh6-game-files');
    expect(profiles).toHaveLength(651);
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

  it('tire_compound parts set a compound, including drag tires', () => {
    const tires = defaultStore.getPartsByCategory('tire_compound').filter((p) => p.tierRank > 0);
    expect(tires.length).toBeGreaterThan(0);
    for (const t of tires) expect(t.setsTireCompound).toBeTruthy();
    // FH6 has drag tires — a dedicated straight-line compound.
    const drag = tires.find((t) => t.setsTireCompound === 'drag');
    expect(drag).toBeDefined();
  });

  it('every upgrade part explains its physics (rationale)', () => {
    for (const category of defaultStore.categories) {
      for (const part of defaultStore.getPartsByCategory(category)) {
        expect(part.rationale, `${part.id} needs a rationale`).toBeTruthy();
        expect(part.rationale!.length).toBeGreaterThan(10);
      }
    }
  });

  it('race suspension unlocks springs & damping', () => {
    const race = defaultStore.getPart('susp-race');
    expect(race?.unlocks).toContain('springs');
    expect(race?.unlocks).toContain('damping');
  });

  it('retains complete game engine, motor, physics and per-car range catalogs', () => {
    expect(defaultDataset.gameEngines).toHaveLength(660);
    expect(defaultDataset.gameMotors).toHaveLength(19);
    expect(defaultDataset.gamePhysicsSettings).toHaveLength(1390);
    expect(Object.values(defaultDataset.gameEngineUpgradeSpecs).flat()).toHaveLength(14912);
    expect(defaultDataset.tuneRanges.filter((range) => range.appliesToCarId !== null)).toHaveLength(
      651,
    );
  });

  it('models the RX-7 forced-induction tiers including anti-lag from game rows', () => {
    const rx7 = defaultDataset.cars.find((car) => car.gameId === 4144)!;
    expect(rx7).toBeDefined();
    const profile = defaultStore.getUpgradeProfile(rx7.id)!;
    expect(profile.engineType).toBe('rotary');
    const forced = defaultStore
      .getGameEngineUpgradeSpecs(profile.stockGameEngineId!)
      .map((spec) => defaultStore.getPart(spec.partId)!)
      .filter((part) => part.category === 'forced_induction');
    expect(forced.some((part) => part.tier === 'sport')).toBe(true);
    expect(forced.some((part) => part.tier === 'race')).toBe(true);
    expect(forced.some((part) => part.tier === 'race_anti_lag')).toBe(true);
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
  const NO_PROFILE = 'ford-mustang-gt-2018';
  const LOCK_CAR = 'porsche-911-gt3-991-2018';
  const withProfile = (carId: string, profile: Record<string, unknown>) => {
    const raw = structuredClone(rawSeed);
    const index = raw.carUpgradeProfiles!.findIndex((item) => item.carId === carId);
    const current = raw.carUpgradeProfiles![index]!;
    raw.carUpgradeProfiles![index] = {
      ...current,
      source: 'community-tuning-consensus',
      confidence: 'low',
      dataVersion: raw.version.dataVersion,
      ...profile,
    };
    return createDataStore(loadDataset(raw));
  };

  it('locks engine & drivetrain swaps for a car whose profile forbids them', () => {
    const store = withProfile(LOCK_CAR, {
      availableEngineSwapIds: [],
      availableDrivetrainSwapIds: [],
    });
    const swaps = store.getAvailablePartsByCategory(LOCK_CAR, 'engine_swap');
    expect(swaps).toHaveLength(1);
    expect(swaps[0]!.tierRank).toBe(0);
    const dt = store.getAvailablePartsByCategory(LOCK_CAR, 'drivetrain_swap');
    expect(dt.every((p) => p.tierRank === 0)).toBe(true);
  });

  it('uses the exact stock-engine menu for every game car', () => {
    const profile = defaultStore.getUpgradeProfile(NO_PROFILE)!;
    expect(profile.stockGameEngineId).toBeDefined();
    const intakeForCar = defaultStore.getAvailablePartsByCategory(NO_PROFILE, 'intake');
    expect(
      intakeForCar.every(
        (part) =>
          part.tierRank === 0 || profile.availablePartIdsByCategory?.intake?.includes(part.id),
      ),
    ).toBe(true);
  });

  it('a car whose profile allowlists real engines can use them (with real power)', () => {
    const profiled = defaultDataset.carUpgradeProfiles.find(
      (p) => (p.availableEngineSwapIds?.length ?? 0) > 0,
    )!;
    const swaps = defaultStore.getAvailablePartsByCategory(profiled.carId, 'engine_swap');
    const realEngines = swaps.filter((p) => p.id.startsWith('game-engine-'));
    expect(realEngines.length).toBeGreaterThan(0);
    expect(realEngines.every((e) => (e.effects.setsPowerHp ?? 0) > 0)).toBe(true);
  });

  it('exposes real per-car conversion data (rotary type, body kits)', () => {
    const profiles = defaultDataset.carUpgradeProfiles;
    expect(profiles.some((p) => p.engineType === 'rotary')).toBe(true);
    expect(profiles.some((p) => p.bodyKitOptions.length > 0)).toBe(true);
  });

  it('offers a widebody kit only to cars that actually have one', () => {
    // A car whose profile lists body kits can fit the widebody part…
    const withKit = withProfile('ford-mustang-gt-2018', {
      bodyKitOptions: ['Liberty Walk - Widebody Kit'],
    });
    const kitParts = withKit.getAvailablePartsByCategory('ford-mustang-gt-2018', 'body_kit');
    expect(kitParts.some((p) => p.id === 'body-widebody')).toBe(true);

    // …a car with no body-kit data gets stock body only.
    const noKit = withProfile('ford-mustang-gt-2018', { bodyKitOptions: [] });
    const noKitParts = noKit.getAvailablePartsByCategory('ford-mustang-gt-2018', 'body_kit');
    expect(noKitParts.every((p) => p.tierRank === 0)).toBe(true);

    // A car with no profile at all also gets stock only (no kit data).
    const bare = defaultStore.getAvailablePartsByCategory('ford-mustang-gt-2018', 'body_kit');
    expect(bare.every((p) => p.tierRank === 0)).toBe(true);
  });

  it('restricts swaps to an allowlist, blocklists parts, and locks categories', () => {
    const allowedSwap = defaultStore.getUpgradeProfile(NO_PROFILE)!.availableEngineSwapIds![0]!;
    const blockedExhaust = defaultStore
      .getAvailablePartsByCategory(NO_PROFILE, 'exhaust')
      .find((part) => part.tierRank > 0)!.id;
    const store = withProfile(NO_PROFILE, {
      availableEngineSwapIds: [allowedSwap],
      lockedCategories: ['intake'],
      restrictedPartIds: [blockedExhaust],
    });
    const swaps = store.getAvailablePartsByCategory(NO_PROFILE, 'engine_swap');
    expect(swaps.some((part) => part.id === allowedSwap)).toBe(true);

    const intake = store.getAvailablePartsByCategory(NO_PROFILE, 'intake');
    expect(intake.every((p) => p.tierRank === 0)).toBe(true);

    const exhaust = store.getAvailablePartsByCategory(NO_PROFILE, 'exhaust');
    expect(exhaust.some((p) => p.id === blockedExhaust)).toBe(false);
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
    const unknownIndex = unknown.carUpgradeProfiles!.findIndex(
      (p) => p.carId === 'mazda-mx5-nd-2019',
    );
    const unknownCurrent = unknown.carUpgradeProfiles![unknownIndex]!;
    unknown.carUpgradeProfiles![unknownIndex] = {
      ...unknownCurrent,
      availableEngineSwapIds: ['not-a-real-part'],
    };
    expect(() => loadDataset(unknown)).toThrow(/unknown part/);

    const wrongCat = structuredClone(rawSeed);
    const wrongIndex = wrongCat.carUpgradeProfiles!.findIndex(
      (p) => p.carId === 'mazda-mx5-nd-2019',
    );
    const wrongCurrent = wrongCat.carUpgradeProfiles![wrongIndex]!;
    wrongCat.carUpgradeProfiles![wrongIndex] = {
      ...wrongCurrent,
      availableEngineSwapIds: ['susp-race'],
    };
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
