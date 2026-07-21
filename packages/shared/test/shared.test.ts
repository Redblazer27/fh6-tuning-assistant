import { describe, expect, it } from 'vitest';
import {
  classMaxPi,
  decodeBuildFromParam,
  encodeBuildToParam,
  kgToLb,
  parseBuildExport,
  piToClass,
  psiToBar,
  snapToStep,
  toBuildExport,
  type SavedBuild,
} from '../src/index.ts';

const sampleBuild: SavedBuild = {
  schemaVersion: 1,
  request: {
    carId: 'toyota-supra-mk4-1998',
    discipline: 'road',
    targetPI: 800,
    targetClass: 'A',
    input: 'controller',
    drivingStyle: 'balanced',
    constraints: { noAero: false, noSwaps: false },
  },
  strategyId: 'balanced',
  lockedParts: { tire_compound: 'sport-tires' },
  dataVersion: 'fh6-2026.07-seed',
};

describe('PI class mapping', () => {
  it('maps PI values to the right class', () => {
    expect(piToClass(500)).toBe('D');
    expect(piToClass(650)).toBe('B');
    expect(piToClass(800)).toBe('A');
    expect(piToClass(901)).toBe('S2');
    expect(piToClass(999)).toBe('X');
  });

  it('returns the class upper bound', () => {
    expect(classMaxPi('A')).toBe(800);
    expect(classMaxPi('S1')).toBe(900);
  });
});

describe('unit conversions', () => {
  it('converts kg to lb', () => {
    expect(kgToLb(1000)).toBeCloseTo(2204.62, 1);
  });
  it('converts psi to bar', () => {
    expect(psiToBar(29.0)).toBeCloseTo(2.0, 1);
  });
});

describe('snapToStep', () => {
  it('snaps onto the grid and clamps', () => {
    expect(snapToStep(31.4, 15, 55, 0.5)).toBe(31.5);
    expect(snapToStep(100, 15, 55, 0.5)).toBe(55);
    expect(snapToStep(-5, 15, 55, 0.5)).toBe(15);
  });
});

describe('build codec', () => {
  it('round-trips a build through the URL param', () => {
    const param = encodeBuildToParam(sampleBuild);
    expect(param).not.toContain('=');
    expect(param).not.toContain('/');
    const decoded = decodeBuildFromParam(param);
    expect(decoded).toEqual(sampleBuild);
  });

  it('returns null for malformed params', () => {
    expect(decodeBuildFromParam('%%%not-base64%%%')).toBeNull();
    expect(decodeBuildFromParam('')).toBeNull();
  });

  it('round-trips through JSON export', () => {
    const exported = toBuildExport(sampleBuild);
    const text = JSON.stringify(exported);
    const back = parseBuildExport(text);
    expect(back).toEqual(sampleBuild);
  });

  it('rejects foreign JSON', () => {
    expect(parseBuildExport('{"hello":"world"}')).toBeNull();
  });
});
