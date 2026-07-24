import { clamp, round, type Discipline, type ScoreBreakdown } from '@fh6/shared';
import {
  DIFF_FIT,
  DRIFT_POWER_BAND,
  DRIVETRAIN_FIT,
  SCORE_WEIGHTS,
  STRATEGY_TILT,
  SUSPENSION_FIT,
  TIRE_FIT,
  TRANSMISSION_FIT,
  type MetricWeights,
} from './constants.ts';
import type { BuiltSpec } from './types.ts';

/**
 * Drift power-fit: 1.0 across the sweet-spot band, falling linearly to 0 at the
 * floor below and the ceiling above. For non-drift disciplines power is already
 * rewarded monotonically by `accel`/`topSpeed`, so this returns a neutral 1.
 */
function powerFitFor(discipline: Discipline, powerHp: number): number {
  if (discipline !== 'drift') return 1;
  const { idealMin, idealMax, floor, ceil } = DRIFT_POWER_BAND;
  if (powerHp >= idealMin && powerHp <= idealMax) return 1;
  if (powerHp < idealMin) return clamp((powerHp - floor) / (idealMin - floor), 0, 1);
  return clamp((ceil - powerHp) / (ceil - idealMax), 0, 1);
}

/**
 * Transparent build scoring. Each metric is normalized to 0..1, weighted by the
 * discipline, and contributes `normalized * weight` to a 0..100 total. Nothing is
 * hidden — the returned breakdown is shown to the user so they can see exactly
 * why a strategy ranked where it did.
 */

const aeroPotential = (spec: BuiltSpec): number =>
  (spec.aeroFront?.maxKgf ?? 0) + (spec.aeroRear?.maxKgf ?? 0);

/**
 * Video-2 drift philosophy: retain engine inertia and a broad, controllable
 * powerband. Big flywheel/cam/boost upgrades remain legal, but they are no
 * longer free score when a calmer stock-tier choice reaches the power target.
 */
function driftEngineControlFit(spec: BuiltSpec): number {
  const aggression = (partId: string | undefined): number => {
    if (!partId || /stock/i.test(partId)) return 0;
    if (/anti-lag|l4|race/i.test(partId)) return 4;
    if (/l3/i.test(partId)) return 3;
    if (/l2|sport/i.test(partId)) return 2;
    return 1;
  };

  const flywheel = aggression(spec.selection.flywheel);
  const camshaft = aggression(spec.selection.camshaft);
  const boost = aggression(spec.selection.forced_induction);
  const smoothnessBonus = clamp((spec.powerDeliverySmoothness - 0.85) * 0.4, 0, 0.06);
  return clamp(1 + smoothnessBonus - flywheel * 0.12 - camshaft * 0.06 - boost * 0.04, 0.35, 1);
}

interface NormalizedMetrics {
  accel: number;
  grip: number;
  braking: number;
  launch: number;
  topSpeed: number;
  balance: number;
  setupFit: number;
  powerFit: number;
  raw: {
    accel: number;
    grip: number;
    braking: number;
    launch: number;
    topSpeed: number;
    balance: number;
    setupFit: number;
    powerFit: number;
  };
}

/**
 * Normalize a spec's metrics to 0..1. All are discipline-agnostic except
 * `balance` (drivetrain fit), which depends on the goal — pass `discipline` to
 * score it; without one it falls back to the neutral `custom` profile.
 */
export function normalizeMetrics(
  spec: BuiltSpec,
  discipline: Discipline = 'custom',
): NormalizedMetrics {
  const aeroN = clamp(aeroPotential(spec) / 600, 0, 1);
  const accel = clamp((spec.powerToWeight - 80) / 420, 0, 1);
  const grip = clamp(clamp((spec.gripFactor - 0.5) / 1.0, 0, 1) + aeroN * 0.15, 0, 1);
  const braking = clamp(clamp((spec.brakingFactor - 1.0) / 0.15, 0, 1) * 0.85 + aeroN * 0.15, 0, 1);
  const launch = clamp((spec.launchFactor - 0.8) / 0.6, 0, 1);
  const topSpeed = clamp((spec.powerHp - 150) / 1250, 0, 1);
  const balance = DRIVETRAIN_FIT[discipline][spec.drivetrain];
  // Setup fit blends the discipline-variant parts. Drift additionally scores
  // controllable engine character: retaining flywheel inertia and avoiding
  // unnecessary max cam/boost tiers once the power sweet-spot is reached.
  const tireTable = TIRE_FIT[discipline];
  const tireFit = tireTable[spec.tireCompound] ?? tireTable.default;
  const suspTable = SUSPENSION_FIT[discipline];
  const suspFit = suspTable[spec.suspensionTier] ?? suspTable.default;
  const diffTable = DIFF_FIT[discipline];
  const diffFit = diffTable[spec.diffTier] ?? diffTable.default;
  const transTable = TRANSMISSION_FIT[discipline];
  const transFit = transTable[spec.transmissionTier] ?? transTable.default;
  const setupFit =
    discipline === 'drift'
      ? 0.3 * tireFit +
        0.17 * suspFit +
        0.16 * diffFit +
        0.17 * transFit +
        0.2 * driftEngineControlFit(spec)
      : 0.4 * tireFit + 0.2 * suspFit + 0.2 * diffFit + 0.2 * transFit;
  const powerFit = powerFitFor(discipline, spec.powerHp);
  return {
    accel,
    grip,
    braking,
    launch,
    topSpeed,
    balance,
    setupFit,
    powerFit,
    raw: {
      accel: spec.powerToWeight,
      grip: spec.gripFactor,
      braking: spec.brakingFactor,
      launch: spec.launchFactor,
      topSpeed: spec.powerHp,
      balance,
      setupFit,
      powerFit,
    },
  };
}

/** Apply a strategy tilt to the discipline weights and re-normalize to sum 1. */
export function disciplineWeights(
  discipline: Discipline,
  tilt: keyof typeof STRATEGY_TILT = 'balanced',
): MetricWeights {
  const base = SCORE_WEIGHTS[discipline];
  const t = STRATEGY_TILT[tilt];
  const raw: MetricWeights = {
    accel: Math.max(0, base.accel + (t.accel ?? 0)),
    grip: Math.max(0, base.grip + (t.grip ?? 0)),
    braking: Math.max(0, base.braking + (t.braking ?? 0)),
    launch: Math.max(0, base.launch + (t.launch ?? 0)),
    topSpeed: Math.max(0, base.topSpeed + (t.topSpeed ?? 0)),
    balance: Math.max(0, base.balance + (t.balance ?? 0)),
    setupFit: Math.max(0, base.setupFit + (t.setupFit ?? 0)),
    powerFit: Math.max(0, base.powerFit + (t.powerFit ?? 0)),
  };
  const sum =
    raw.accel +
      raw.grip +
      raw.braking +
      raw.launch +
      raw.topSpeed +
      raw.balance +
      raw.setupFit +
      raw.powerFit || 1;
  return {
    accel: raw.accel / sum,
    grip: raw.grip / sum,
    braking: raw.braking / sum,
    launch: raw.launch / sum,
    topSpeed: raw.topSpeed / sum,
    balance: raw.balance / sum,
    setupFit: raw.setupFit / sum,
    powerFit: raw.powerFit / sum,
  };
}

const METRIC_LABELS: Record<keyof MetricWeights, string> = {
  accel: 'Acceleration (power-to-weight)',
  grip: 'Cornering grip',
  braking: 'Braking',
  launch: 'Launch / traction',
  topSpeed: 'Top-end speed',
  balance: 'Drivetrain fit for the goal',
  setupFit: 'Setup fit (tires, suspension, diff, transmission, engine control)',
  powerFit: 'Power in the drift sweet-spot',
};

/**
 * Score a built spec under a set of weights, returning a full breakdown. Pass the
 * `discipline` so the drivetrain-fit (`balance`) metric is scored for the goal;
 * omitting it uses the neutral profile (fine for discipline-agnostic ranking).
 */
export function scoreSpec(
  spec: BuiltSpec,
  weights: MetricWeights,
  discipline?: Discipline,
): ScoreBreakdown {
  const m = normalizeMetrics(spec, discipline);
  const norm: Record<keyof MetricWeights, number> = {
    accel: m.accel,
    grip: m.grip,
    braking: m.braking,
    launch: m.launch,
    topSpeed: m.topSpeed,
    balance: m.balance,
    setupFit: m.setupFit,
    powerFit: m.powerFit,
  };
  const rawByKey: Record<keyof MetricWeights, number> = {
    accel: m.raw.accel,
    grip: m.raw.grip,
    braking: m.raw.braking,
    launch: m.raw.launch,
    topSpeed: m.raw.topSpeed,
    balance: m.raw.balance,
    setupFit: m.raw.setupFit,
    powerFit: m.raw.powerFit,
  };

  const components = (Object.keys(weights) as (keyof MetricWeights)[]).map((key) => {
    const contribution = norm[key] * weights[key] * 100;
    return {
      label: METRIC_LABELS[key],
      value: round(rawByKey[key], 2),
      normalized: round(norm[key], 3),
      weight: round(weights[key], 3),
      contribution: round(contribution, 2),
    };
  });

  const total = round(
    components.reduce((s, c) => s + c.contribution, 0),
    2,
  );
  return { total, components };
}
