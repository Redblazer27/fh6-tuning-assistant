import {
  clamp,
  round,
  type BuildRequest,
  type ClassLetter,
  type Confidence,
  type Discipline,
  type Drivetrain,
} from '@fh6/shared';
import type { Car, DataStore } from '@fh6/data';
import { CHASSIS_COMPARE_SWING, DISCLAIMER, WEIGHT_BALANCE_IDEAL } from './constants.ts';
import { generateBuild } from './generate.ts';
import type { BuildStrategy } from './types.ts';

/**
 * Car comparison: which car is best for a goal.
 *
 * For each candidate car we build the best build for the same request (discipline,
 * class/PI, constraints) and rank by its goal-fit score — the same transparent
 * score shown per build, already reflecting drivetrain and tire fit. On top we add
 * a small weight-distribution ("chassis balance") term: no upgrade changes a car's
 * weight balance, so it can't affect a single car's build, but *across cars* a
 * layout that suits the goal (mid/rear balance for drift, nose-light for launch)
 * earns a few points. It is low confidence and deliberately bounded so it only
 * breaks ties between otherwise-similar cars.
 */

/** How well a car's static front-weight % suits a discipline (0..1). */
export function chassisBalanceFit(frontPct: number, discipline: Discipline): number {
  const { front, spread } = WEIGHT_BALANCE_IDEAL[discipline];
  return clamp(1 - Math.abs(frontPct - front) / spread, 0, 1);
}

export interface CarComparisonRow {
  carId: string;
  car: Car;
  drivetrain: Drivetrain;
  stockPI: number;
  /** The best build found for this car under the goal. */
  bestStrategy: BuildStrategy;
  /** The build's goal-fit score (0..100) — drivetrain and tire fit included. */
  goalFitScore: number;
  /** Weight-distribution fit for the goal (0..1). */
  chassisFit: number;
  weightDistFrontPct: number;
  /** True when the car has no real weight-distribution data (neutral default used). */
  weightDistEstimated: boolean;
  /** goalFitScore nudged by weight-balance fit — the ranking key. */
  comparisonScore: number;
  pi: number;
  legal: boolean;
  confidence: Confidence;
}

export interface CompareResult {
  discipline: Discipline;
  piCap: number | null;
  classCap: ClassLetter | null;
  /** Cars ranked best-first for the goal. */
  rows: CarComparisonRow[];
  dataVersion: string;
  disclaimer: string;
  notes: string[];
}

/**
 * Rank `carIds` for the `request`'s goal. Each car is built with the same request
 * (only the carId changes). Deterministic; duplicate and unknown car ids are skipped.
 */
export function compareCars(
  store: DataStore,
  carIds: string[],
  request: BuildRequest,
): CompareResult {
  const rows: CarComparisonRow[] = [];
  const seen = new Set<string>();
  let piCap: number | null = null;

  for (const carId of carIds) {
    if (seen.has(carId)) continue;
    seen.add(carId);
    const car = store.getCar(carId);
    if (!car) continue;

    const res = generateBuild(store, { ...request, carId });
    const best = res.strategies[0];
    if (!best) continue;
    piCap = res.piCap;

    const frontPct = best.builtSpec.weightDistFrontPct;
    const chassisFit = chassisBalanceFit(frontPct, request.discipline);
    const goalFitScore = best.score.total;
    const comparisonScore = round(goalFitScore + (chassisFit - 0.5) * CHASSIS_COMPARE_SWING, 2);

    rows.push({
      carId,
      car,
      drivetrain: best.builtSpec.drivetrain,
      stockPI: car.stockPI,
      bestStrategy: best,
      goalFitScore: round(goalFitScore, 2),
      chassisFit: round(chassisFit, 3),
      weightDistFrontPct: frontPct,
      weightDistEstimated: car.weightDistFrontPct === undefined,
      comparisonScore,
      pi: best.pi.pi,
      legal: best.legal,
      confidence: res.overallConfidence,
    });
  }

  // Best first: comparison score, then raw goal-fit, then id (determinism).
  rows.sort(
    (a, b) =>
      b.comparisonScore - a.comparisonScore ||
      b.goalFitScore - a.goalFitScore ||
      a.carId.localeCompare(b.carId),
  );

  const notes: string[] = [];
  if (rows.some((r) => r.weightDistEstimated)) {
    notes.push(
      'Cars marked (est. balance) have no weight-distribution data, so their chassis-balance fit uses a neutral 50/50 default.',
    );
  }
  if (rows.some((r) => !r.legal)) {
    notes.push('Cars marked illegal cannot be brought under the goal’s PI cap without de-tuning.');
  }

  return {
    discipline: request.discipline,
    piCap,
    classCap: request.targetClass ?? null,
    rows,
    dataVersion: store.dataset.version.dataVersion,
    disclaimer: DISCLAIMER,
    notes,
  };
}
