import type { GameVersion } from '../types.ts';

/**
 * The data version this seed was authored against. Bump when the game patches
 * change car stats / PI / parts, and record what changed in `notes`.
 */
export const DATA_VERSION = 'fh6-2026.07-seed';

export const gameVersion: GameVersion = {
  gameVersion: 'Forza Horizon 6',
  patch: 'launch',
  dataVersion: DATA_VERSION,
  releaseDate: '2026-05-19',
  notes:
    'Initial seed. Curated starter roster; stock stats are community-sourced (medium confidence) ' +
    'pending cross-check with official forza.net data. Estimated PI is modelled, not exact.',
};
