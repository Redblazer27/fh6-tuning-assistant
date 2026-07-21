export * from './schemas.ts';
export * from './types.ts';
export * from './loaders.ts';
export { rawSeed, DATA_VERSION } from './seed/index.ts';

import { rawSeed } from './seed/index.ts';
import { createDataStore, loadDataset } from './loaders.ts';

/** The validated seed dataset. */
export const defaultDataset = loadDataset(rawSeed);

/** A ready-to-use indexed store over the seed dataset. */
export const defaultStore = createDataStore(defaultDataset);
