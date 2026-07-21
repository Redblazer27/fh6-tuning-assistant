/**
 * Transparent scoring types. Every strategy exposes exactly why it ranked where
 * it did — no hidden weighting. `contribution = normalizedValue * weight`.
 */

export interface ScoreComponent {
  /** Human-readable label, e.g. "Cornering grip". */
  label: string;
  /** The raw metric value (units vary; documented per component). */
  value: number;
  /** Normalized 0..1 value used for scoring. */
  normalized: number;
  /** Weight applied for this discipline (0..1, weights across components sum ~1). */
  weight: number;
  /** normalized * weight — the actual points this component added. */
  contribution: number;
  note?: string;
}

export interface ScoreBreakdown {
  /** Weighted total, 0..100. */
  total: number;
  components: ScoreComponent[];
}

/** Named build strategies the optimizer can produce. */
export const STRATEGY_KINDS = ['grip', 'balanced', 'speed'] as const;
export type StrategyKind = (typeof STRATEGY_KINDS)[number];

export const STRATEGY_LABELS: Record<StrategyKind, string> = {
  grip: 'Grip-focused',
  balanced: 'Balanced',
  speed: 'Speed-focused',
};
