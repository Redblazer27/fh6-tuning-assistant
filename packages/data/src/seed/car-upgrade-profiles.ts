import type { CarUpgradeProfileInput } from '../types.ts';
import { DATA_VERSION } from './version.ts';

/**
 * Per-car upgrade profiles (seed / starter set).
 *
 * A profile records which conversions and parts a *specific* car allows, so the
 * optimizer never proposes an upgrade the game wouldn't offer for that car
 * (e.g. an engine swap on a hypercar with a locked upgrade path, or a
 * rotary-only swap set). Cars WITHOUT a profile fall back to the full global
 * catalog — so this file is purely additive and correctable.
 *
 * IMPORTANT (docs/data-policy.md): per-car swap/upgrade availability is community
 * knowledge, not official data, and is the least-documented part of the roster.
 * These starter entries are labelled `low` confidence and should be verified
 * in-game (the Upgrades → Conversion menu is the source of truth per car).
 */
const base = {
  source: 'community-tuning-consensus',
  confidence: 'low',
  dataVersion: DATA_VERSION,
} as const;

export const carUpgradeProfiles: CarUpgradeProfileInput[] = [
  {
    ...base,
    carId: 'koenigsegg-jesko-2020',
    engineType: 'piston',
    // Hypercars in the Horizon series generally have locked conversion paths:
    // no engine swap and no drivetrain swap (the tabs do not appear).
    availableEngineSwapIds: [],
    availableDrivetrainSwapIds: [],
    notes:
      'Hypercar: engine/drivetrain conversions locked. Illustrative (low confidence) — verify in-game.',
  },
];
