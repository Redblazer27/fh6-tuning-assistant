import { piToClass, type UpgradeCategory } from '@fh6/shared';
import { datasetSchema } from './schemas.ts';
import type { Car, Dataset, Part, Source, TuneRanges } from './types.ts';

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
  for (const part of dataset.parts) {
    if (partIds.has(part.id)) problems.push(`Duplicate part id: ${part.id}`);
    partIds.add(part.id);
    if (!sourceIds.has(part.source))
      problems.push(`Part ${part.id} cites unknown source ${part.source}`);
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
  };
}
