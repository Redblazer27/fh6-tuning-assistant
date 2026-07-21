import { clamp, round, type Discipline, type ScoreBreakdown } from '@fh6/shared';
import { SCORE_WEIGHTS, STRATEGY_TILT, type MetricWeights } from './constants.ts';
import type { BuiltSpec } from './types.ts';

/**
 * Transparent build scoring. Each metric is normalized to 0..1, weighted by the
 * discipline, and contributes `normalized * weight` to a 0..100 total. Nothing is
 * hidden — the returned breakdown is shown to the user so they can see exactly
 * why a strategy ranked where it did.
 */

const aeroPotential = (spec: BuiltSpec): number =>
  (spec.aeroFront?.maxKgf ?? 0) + (spec.aeroRear?.maxKgf ?? 0);

interface NormalizedMetrics {
  accel: number;
  grip: number;
  braking: number;
  launch: number;
  topSpeed: number;
  raw: { accel: number; grip: number; braking: number; launch: number; topSpeed: number };
}

export function normalizeMetrics(spec: BuiltSpec): NormalizedMetrics {
  const aeroN = clamp(aeroPotential(spec) / 600, 0, 1);
  const accel = clamp((spec.powerToWeight - 80) / 420, 0, 1);
  const grip = clamp(clamp((spec.gripFactor - 0.5) / 1.0, 0, 1) + aeroN * 0.15, 0, 1);
  const braking = clamp(clamp((spec.brakingFactor - 1.0) / 0.15, 0, 1) * 0.85 + aeroN * 0.15, 0, 1);
  const launch = clamp((spec.launchFactor - 0.8) / 0.6, 0, 1);
  const topSpeed = clamp((spec.powerHp - 150) / 1250, 0, 1);
  return {
    accel,
    grip,
    braking,
    launch,
    topSpeed,
    raw: {
      accel: spec.powerToWeight,
      grip: spec.gripFactor,
      braking: spec.brakingFactor,
      launch: spec.launchFactor,
      topSpeed: spec.powerHp,
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
  };
  const sum = raw.accel + raw.grip + raw.braking + raw.launch + raw.topSpeed || 1;
  return {
    accel: raw.accel / sum,
    grip: raw.grip / sum,
    braking: raw.braking / sum,
    launch: raw.launch / sum,
    topSpeed: raw.topSpeed / sum,
  };
}

const METRIC_LABELS: Record<keyof MetricWeights, string> = {
  accel: 'Acceleration (power-to-weight)',
  grip: 'Cornering grip',
  braking: 'Braking',
  launch: 'Launch / traction',
  topSpeed: 'Top-end speed',
};

/** Score a built spec under a set of weights, returning a full breakdown. */
export function scoreSpec(spec: BuiltSpec, weights: MetricWeights): ScoreBreakdown {
  const m = normalizeMetrics(spec);
  const norm: Record<keyof MetricWeights, number> = {
    accel: m.accel,
    grip: m.grip,
    braking: m.braking,
    launch: m.launch,
    topSpeed: m.topSpeed,
  };
  const rawByKey: Record<keyof MetricWeights, number> = {
    accel: m.raw.accel,
    grip: m.raw.grip,
    braking: m.raw.braking,
    launch: m.raw.launch,
    topSpeed: m.raw.topSpeed,
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
