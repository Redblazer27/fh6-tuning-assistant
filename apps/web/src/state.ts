import {
  BUILD_SCHEMA_VERSION,
  decodeBuildFromParam,
  encodeBuildToParam,
  type BuildRequest,
  type LockedSelections,
  type SavedBuild,
} from '@fh6/shared';

export function defaultRequest(carId: string): BuildRequest {
  return {
    carId,
    discipline: 'road',
    targetPI: null,
    targetClass: 'A',
    input: 'controller',
    drivingStyle: 'balanced',
    constraints: {},
  };
}

export function toSavedBuild(
  request: BuildRequest,
  strategyId: string,
  locks: LockedSelections,
  dataVersion: string,
  label?: string,
): SavedBuild {
  return {
    schemaVersion: BUILD_SCHEMA_VERSION,
    request,
    strategyId,
    lockedParts: Object.keys(locks).length ? locks : undefined,
    dataVersion,
    label,
  };
}

const HASH_PREFIX = '#b=';

export function encodeToHash(saved: SavedBuild): string {
  return HASH_PREFIX + encodeBuildToParam(saved);
}

export function decodeFromHash(hash: string): SavedBuild | null {
  if (!hash.startsWith(HASH_PREFIX)) return null;
  return decodeBuildFromParam(hash.slice(HASH_PREFIX.length));
}

export function shareUrl(saved: SavedBuild): string {
  const base = `${location.origin}${location.pathname}`;
  return base + encodeToHash(saved);
}
