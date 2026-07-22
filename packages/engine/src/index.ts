export * from './types.ts';
export { DISCLAIMER, SCORE_WEIGHTS, STRATEGY_TILT, tireGrip } from './constants.ts';
export { buildSpec, resolvePart, LAUNCH_BASE } from './buildSpec.ts';
export { resolveEffectiveCar, type ResolvedCar, type EffectiveCar } from './effectiveCar.ts';
export { estimatePI } from './pi.ts';
export { checkLegality, resolvePiCap } from './rules.ts';
export { normalizeMetrics, disciplineWeights, scoreSpec } from './scoring.ts';
export { computeTune } from './tuning.ts';
export { optimizeSelection, type OptimizeOptions, type OptimizeOutput } from './optimizer.ts';
export {
  SYMPTOMS,
  CONDITION_MODIFIERS,
  type Symptom,
  type SymptomAdjustment,
  type SymptomGroup,
  type ConditionModifier,
} from './symptoms.ts';
export {
  generateBuild,
  computeTuneForSelection,
  applyTuneOverrides,
  partLines,
} from './generate.ts';
export {
  compareCars,
  chassisBalanceFit,
  type CarComparisonRow,
  type CompareResult,
} from './compare.ts';
export { diagnoseTelemetry, type TelemetryFinding, type TelemetryDiagnosis } from './diagnose.ts';
