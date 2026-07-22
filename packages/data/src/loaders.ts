import { piToClass, type UpgradeCategory } from '@fh6/shared';
import { CATEGORY_PHYSICS } from './part-physics.ts';
import { datasetSchema } from './schemas.ts';
import type { Car, CarUpgradeProfile, Dataset, Part, Source, TuneRanges } from './types.ts';

/**
 * Validate a raw dataset (seed or imported) against the schemas AND referential
 * integrity rules. Throws with a clear message on any problem, so bad data is
 * caught at load time rather than surfacing as a wrong tune later.
 */
export function loadDataset(raw: unknown): Dataset {
  const dataset = datasetSchema.parse(raw);
  const problems: string[] = [];

  const sourceIds = new Set(dataset.sources.map((s) => s.id));

  const carIds = new Set<string>();
  for (const car of dataset.cars) {
    if (carIds.has(car.id)) problems.push(`Duplicate car id: ${car.id}`);
    carIds.add(car.id);
    if (!sourceIds.has(car.source))
      problems.push(`Car ${car.id} cites unknown source ${car.source}`);
    if (piToClass(car.stockPI) !== car.stockClass) {
      problems.push(
        `Car ${car.id}: stockPI ${car.stockPI} maps to ${piToClass(car.stockPI)}, not ${car.stockClass}`,
      );
    }
  }

  const partIds = new Set<string>();
  const partCategoryById = new Map<string, UpgradeCategory>();
  for (const part of dataset.parts) {
    if (partIds.has(part.id)) problems.push(`Duplicate part id: ${part.id}`);
    partIds.add(part.id);
    partCategoryById.set(part.id, part.category);
    if (!sourceIds.has(part.source))
      problems.push(`Part ${part.id} cites unknown source ${part.source}`);
    // Guarantee every part is explained: fall back to the category's physics for
    // parts (e.g. imported engine swaps) that don't set their own rationale.
    if (!part.rationale) part.rationale = CATEGORY_PHYSICS[part.category];
  }

  for (const tr of dataset.tuneRanges) {
    if (!sourceIds.has(tr.source))
      problems.push(`TuneRanges ${tr.id} cites unknown source ${tr.source}`);
    if (tr.appliesToCarId && !carIds.has(tr.appliesToCarId))
      problems.push(`TuneRanges ${tr.id} targets unknown car ${tr.appliesToCarId}`);
  }

  const hasDefaultRanges = dataset.tuneRanges.some((tr) => tr.appliesToCarId === null);
  if (!hasDefaultRanges)
    problems.push('No default tune-ranges template (appliesToCarId === null).');

  // Per-car upgrade profiles: one per car, referencing real parts of the right category.
  const profileCarIds = new Set<string>();
  const checkPartRefs = (
    profileCarId: string,
    label: string,
    ids: string[] | undefined,
    expectedCategory?: UpgradeCategory,
  ) => {
    for (const id of ids ?? []) {
      if (!partIds.has(id)) {
        problems.push(
          `Upgrade profile for ${profileCarId}: ${label} references unknown part ${id}`,
        );
      } else if (expectedCategory && partCategoryById.get(id) !== expectedCategory) {
        problems.push(
          `Upgrade profile for ${profileCarId}: ${label} part ${id} is not a ${expectedCategory}`,
        );
      }
    }
  };
  for (const profile of dataset.carUpgradeProfiles) {
    if (!carIds.has(profile.carId))
      problems.push(`Upgrade profile targets unknown car ${profile.carId}`);
    if (profileCarIds.has(profile.carId))
      problems.push(`Duplicate upgrade profile for car ${profile.carId}`);
    profileCarIds.add(profile.carId);
    if (!sourceIds.has(profile.source))
      problems.push(`Upgrade profile for ${profile.carId} cites unknown source ${profile.source}`);
    checkPartRefs(
      profile.carId,
      'availableEngineSwapIds',
      profile.availableEngineSwapIds,
      'engine_swap',
    );
    checkPartRefs(
      profile.carId,
      'availableDrivetrainSwapIds',
      profile.availableDrivetrainSwapIds,
      'drivetrain_swap',
    );
    checkPartRefs(profile.carId, 'restrictedPartIds', profile.restrictedPartIds);
  }

  if (problems.length > 0) {
    throw new Error(`Dataset integrity check failed:\n - ${problems.join('\n - ')}`);
  }

  return dataset;
}

/** Indexed, read-only access to a validated dataset. */
export interface DataStore {
  dataset: Dataset;
  cars: Car[];
  getCar(id: string): Car | undefined;
  getSource(id: string): Source | undefined;
  getPart(id: string): Part | undefined;
  getPartsByCategory(category: UpgradeCategory): Part[];
  /** Categories present in the dataset, in enum order. */
  categories: UpgradeCategory[];
  /** Stock (tierRank 0) part for a category, if defined. */
  getStockPart(category: UpgradeCategory): Part | undefined;
  /** Tune ranges for a car: car-specific override if present, else the default template. */
  getTuneRanges(carId: string): TuneRanges;
  /** Per-car upgrade profile, if one is defined for this car. */
  getUpgradeProfile(carId: string): CarUpgradeProfile | undefined;
  /**
   * Parts available in a category *for a specific car*, applying its upgrade
   * profile (locked categories, engine/drivetrain swap allowlists, blocklist).
   * Stock is always retained. Cars without a profile get the full catalog.
   */
  getAvailablePartsByCategory(carId: string, category: UpgradeCategory): Part[];
}

export function createDataStore(dataset: Dataset): DataStore {
  const carsById = new Map(dataset.cars.map((c) => [c.id, c]));
  const sourcesById = new Map(dataset.sources.map((s) => [s.id, s]));
  const partsById = new Map(dataset.parts.map((p) => [p.id, p]));

  const partsByCategory = new Map<UpgradeCategory, Part[]>();
  for (const part of dataset.parts) {
    const list = partsByCategory.get(part.category) ?? [];
    list.push(part);
    partsByCategory.set(part.category, list);
  }
  // Deterministic ordering within a category: by tierRank then id.
  for (const list of partsByCategory.values()) {
    list.sort((a, b) => a.tierRank - b.tierRank || a.id.localeCompare(b.id));
  }

  const defaultRanges = dataset.tuneRanges.find((tr) => tr.appliesToCarId === null)!;
  const rangesByCar = new Map(
    dataset.tuneRanges.filter((tr) => tr.appliesToCarId).map((tr) => [tr.appliesToCarId!, tr]),
  );
  const profilesByCar = new Map(dataset.carUpgradeProfiles.map((p) => [p.carId, p]));

  // Concrete swap engines (id prefix `eng-`) are opt-in: a car only gets them
  // when its profile explicitly allowlists them, never by default. This keeps a
  // car with no documented swaps from being offered all ~130 real engines.
  const isRealEngine = (p: Part) => p.category === 'engine_swap' && p.id.startsWith('eng-');

  const getAvailablePartsByCategory = (carId: string, category: UpgradeCategory): Part[] => {
    const all = partsByCategory.get(category) ?? [];
    const profile = profilesByCar.get(carId);

    // Body kits are per-car: only a car with a documented kit (bodyKitOptions)
    // can fit one — everyone else gets stock only, regardless of profile.
    if (category === 'body_kit') {
      const locked = profile?.lockedCategories.includes('body_kit') ?? false;
      const hasKit = (profile?.bodyKitOptions.length ?? 0) > 0;
      return hasKit && !locked ? all : all.filter((p) => p.tierRank === 0);
    }

    if (!profile) return all.filter((p) => !isRealEngine(p));

    if (profile.lockedCategories.includes(category)) {
      return all.filter((p) => p.tierRank === 0);
    }
    let list = all;
    if (category === 'engine_swap') {
      if (profile.availableEngineSwapIds !== undefined) {
        const allow = new Set(profile.availableEngineSwapIds);
        list = list.filter((p) => p.tierRank === 0 || allow.has(p.id));
      } else {
        // No allowlist → keep generic swaps only, not the concrete real engines.
        list = list.filter((p) => !isRealEngine(p));
      }
    }
    if (category === 'drivetrain_swap' && profile.availableDrivetrainSwapIds !== undefined) {
      const allow = new Set(profile.availableDrivetrainSwapIds);
      list = list.filter((p) => p.tierRank === 0 || allow.has(p.id));
    }
    if (profile.restrictedPartIds.length > 0) {
      const blocked = new Set(profile.restrictedPartIds);
      list = list.filter((p) => p.tierRank === 0 || !blocked.has(p.id));
    }
    return list;
  };

  return {
    dataset,
    cars: dataset.cars,
    categories: [...partsByCategory.keys()],
    getCar: (id) => carsById.get(id),
    getSource: (id) => sourcesById.get(id),
    getPart: (id) => partsById.get(id),
    getPartsByCategory: (category) => partsByCategory.get(category) ?? [],
    getStockPart: (category) => (partsByCategory.get(category) ?? []).find((p) => p.tierRank === 0),
    getTuneRanges: (carId) => rangesByCar.get(carId) ?? defaultRanges,
    getUpgradeProfile: (carId) => profilesByCar.get(carId),
    getAvailablePartsByCategory,
  };
}
