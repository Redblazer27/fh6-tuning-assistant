import type { GameVersion } from '../types.ts';

/**
 * The data version this seed was authored against. Bump when the game patches
 * change car stats / PI / parts, and record what changed in `notes`.
 */
export const DATA_VERSION = 'fh6-steam-24241019';

export const gameVersion: GameVersion = {
  gameVersion: 'Forza Horizon 6',
  patch: 'Steam build 24241019',
  dataVersion: DATA_VERSION,
  releaseDate: '2026-05-19',
  notes:
    'Game-file-authoritative cars, engines, conversions, upgrade compatibility and physics bounds.',
};
