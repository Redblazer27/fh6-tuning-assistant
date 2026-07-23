import type { DatasetInput, PartInput } from '../types.ts';
import { fandomUpgradeProfiles } from './car-upgrade-profiles-fandom.ts';
import {
  gameCars,
  gameDatabaseBuild,
  gameEngineUpgradeSpecs,
  gameEngines,
  gameMotors,
  gameParts,
  gamePhysicsSettings,
  gameTuneRanges,
  gameUpgradeProfiles,
} from './game-database.ts';
import { parts } from './parts.ts';
import { sources } from './sources.ts';
import { tuneRanges } from './tune-ranges.ts';
import { gameVersion } from './version.ts';

const exactGameCategories = new Set([
  'engine_swap',
  'drivetrain_swap',
  'intake',
  'intake_manifold',
  'fuel_system',
  'ignition',
  'exhaust',
  'camshaft',
  'valves',
  'displacement',
  'pistons_compression',
  'intercooler',
  'oil_cooling',
  'flywheel',
  'forced_induction',
  'restrictor_plate',
]);
const retainedParts = parts.filter(
  (part) => !exactGameCategories.has(part.category) || part.tierRank === 0,
);
const stockPart = (category: PartInput['category'], name: string): PartInput => ({
  id: `stock-${category.replaceAll('_', '-')}`,
  category,
  name,
  tierRank: 0,
  tier: 'stock',
  effects: {},
  unlocks: [],
  cost: 0,
  source: 'fh6-game-files',
  confidence: 'high',
  dataVersion: gameVersion.dataVersion,
});
const combinedParts: PartInput[] = [...retainedParts, ...gameParts];
for (const [category, name] of [
  ['intake_manifold', 'Stock intake manifold'],
  ['restrictor_plate', 'Stock restrictor plate'],
] as const) {
  if (!combinedParts.some((part) => part.category === category && part.tierRank === 0)) {
    combinedParts.push(stockPart(category, name));
  }
}

const communityProfileByCar = new Map(
  fandomUpgradeProfiles.map((profile) => [profile.carId, profile]),
);
const mergedProfiles = gameUpgradeProfiles.map((profile) => {
  const community = communityProfileByCar.get(profile.carId);
  return {
    ...profile,
    bodyKitOptions: community?.bodyKitOptions ?? [],
    engineSwapOptions: community?.engineSwapOptions ?? [],
    aspirationOptions: community?.aspirationOptions ?? [],
  };
});

/** Game-file-authoritative seed. Community records only fill fields absent from the game DB. */
export const rawSeed: DatasetInput = {
  version: gameVersion,
  sources,
  cars: gameCars,
  parts: combinedParts,
  tuneRanges: [...tuneRanges, ...gameTuneRanges],
  carUpgradeProfiles: mergedProfiles,
  gameEngines,
  gameMotors,
  gamePhysicsSettings,
  gameEngineUpgradeSpecs,
  gameDatabaseBuild,
};

export { DATA_VERSION } from './version.ts';
