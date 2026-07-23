import type { TuneRangesInput } from '../types.ts';
import { DATA_VERSION } from './version.ts';

/**
 * Default tunable-range template (applies when a car has no specific override).
 *
 * These are generous, community-consensus ranges (confidence: medium). Real FH6
 * sliders are per-car and per-installed-part; the engine clamps its computed
 * targets to whichever range applies, and admins can add car-specific overrides.
 * Aero min/max additionally comes from the installed aero part; the aero range
 * here only fixes the unit and step.
 */
export const defaultTuneRanges: TuneRangesInput = {
  id: 'default-template',
  appliesToCarId: null,
  source: 'fh6-game-files',
  confidence: 'high',
  dataVersion: DATA_VERSION,
  notes: 'Global CarTuning bounds from the FH6 game physics settings.',

  tirePressurePsi: { min: 15, max: 55, step: 0.1 },
  finalDrive: { min: 2.2, max: 6.1, step: 0.01 },
  gearRatio: { min: 0.48, max: 6, step: 0.01 },
  camberDeg: { min: -5.0, max: 5.0, step: 0.1 },
  toeDeg: { min: -5.0, max: 5.0, step: 0.1 },
  casterDeg: { min: 1.0, max: 7.0, step: 0.1 },
  arb: { min: 1.0, max: 65.0, step: 0.5 },
  springRate: { min: 100, max: 1500, step: 0.5, unit: 'lbf/in' },
  rideHeight: { min: 5.0, max: 30.0, step: 0.1, unit: 'cm' },
  damping: { min: 1.0, max: 20.0, step: 0.5 },
  aero: { min: 0, max: 500, step: 1, unit: 'kgf' },
  brakeBalancePct: { min: 0, max: 100, step: 1 },
  brakePressurePct: { min: 50, max: 150, step: 1 },
  differentialPct: { min: 0, max: 100, step: 1 },
};

export const tuneRanges: TuneRangesInput[] = [defaultTuneRanges];
