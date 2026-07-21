import {
  BUILD_SCHEMA_VERSION,
  EXPORT_MAGIC,
  type BuildExport,
  type SavedBuild,
} from './build.ts';

/**
 * Isomorphic build-state codec.
 *
 * A SavedBuild is small (car id, goal, constraints, locks, tune overrides), so we
 * encode it as URL-safe base64 of its JSON. This yields a *permanent* share link
 * with no server: the entire build lives in the URL. Exports use the same JSON
 * wrapped with a magic header for file import/versioning.
 *
 * `btoa`/`atob` and `TextEncoder`/`TextDecoder` are available in browsers and in
 * Node >= 18, so this module works in both the app and the test runner.
 */

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Encode a SavedBuild into a compact URL-safe string. */
export function encodeBuildToParam(build: SavedBuild): string {
  const json = JSON.stringify(build);
  const bytes = new TextEncoder().encode(json);
  return bytesToBase64Url(bytes);
}

/**
 * Decode a SavedBuild from a share param. Returns null on malformed input.
 * Shape validation (fields, enums) is the data layer's responsibility.
 */
export function decodeBuildFromParam(param: string): SavedBuild | null {
  try {
    const bytes = base64UrlToBytes(param.trim());
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json) as SavedBuild;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.request !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Wrap a SavedBuild for JSON file export. */
export function toBuildExport(build: SavedBuild): BuildExport {
  return {
    app: EXPORT_MAGIC,
    schemaVersion: build.schemaVersion || BUILD_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    build,
  };
}

/** Parse a JSON export file back into a SavedBuild. Returns null if not our format. */
export function parseBuildExport(jsonText: string): SavedBuild | null {
  try {
    const parsed = JSON.parse(jsonText) as Partial<BuildExport>;
    if (parsed && parsed.app === EXPORT_MAGIC && parsed.build && parsed.build.request) {
      return parsed.build;
    }
    // Tolerate a bare SavedBuild too.
    const bare = JSON.parse(jsonText) as Partial<SavedBuild>;
    if (bare && bare.request && typeof bare.strategyId === 'string') {
      return bare as SavedBuild;
    }
    return null;
  } catch {
    return null;
  }
}
