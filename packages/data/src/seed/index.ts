import type { DatasetInput } from '../types.ts';
import { cars } from './cars.ts';
import { parts } from './parts.ts';
import { sources } from './sources.ts';
import { tuneRanges } from './tune-ranges.ts';
import { gameVersion } from './version.ts';

/** The raw (pre-validation) seed dataset. Validated by loadDataset(). */
export const rawSeed: DatasetInput = {
  version: gameVersion,
  sources,
  cars,
  parts,
  tuneRanges,
};

export { DATA_VERSION } from './version.ts';
