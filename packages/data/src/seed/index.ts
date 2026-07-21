import type { DatasetInput } from '../types.ts';
import { cars } from './cars.ts';
import { carUpgradeProfiles } from './car-upgrade-profiles.ts';
import { parts } from './parts.ts';
import { rosterCars } from './roster-cars.ts';
import { sources } from './sources.ts';
import { tuneRanges } from './tune-ranges.ts';
import { gameVersion } from './version.ts';

/**
 * The raw (pre-validation) seed dataset. Validated by loadDataset().
 *
 * Cars = the hand-curated set (with real physics, medium/low confidence) followed
 * by the full official roster (identity/class/PI/DLC only; physics filled by the
 * engine at build time). See docs/data-policy.md.
 */
export const rawSeed: DatasetInput = {
  version: gameVersion,
  sources,
  cars: [...cars, ...rosterCars],
  parts,
  tuneRanges,
  carUpgradeProfiles,
};

export { DATA_VERSION } from './version.ts';
