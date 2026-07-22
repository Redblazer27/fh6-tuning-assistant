import type { TelemetrySummary } from '@fh6/shared';
import { TELEMETRY_DIAGNOSIS } from './constants.ts';
import { SYMPTOMS, type SymptomAdjustment } from './symptoms.ts';

/**
 * Close the loop: turn a recorded telemetry session into a handling diagnosis and
 * the concrete tune fixes for it.
 *
 * The generator produces a baseline tune from a model; this reads what the car
 * ACTUALLY did (measured slip balance and grip usage) and points at the matching
 * symptom + its smallest-safe-first adjustments — the same `SYMPTOMS` a user can
 * pick by hand, now driven by real data instead of a guess. Deterministic and
 * pure. Findings are heuristic/low-confidence (see TELEMETRY_DIAGNOSIS) and never
 * change a tune on their own — they are advice the user chooses to apply.
 */

export interface TelemetryFinding {
  /** Links to a Symptom in SYMPTOMS. */
  symptomId: string;
  label: string;
  severity: 'mild' | 'strong';
  /** The measured evidence, e.g. "understeer index +0.18 (front slides more than rear)". */
  evidence: string;
  /** The fix — the matching symptom's adjustments (smallest-safe-first). */
  adjustments: SymptomAdjustment[];
}

export interface TelemetryDiagnosis {
  findings: TelemetryFinding[];
  /** Why there are no/limited findings (e.g. session too short, car felt balanced). */
  notes: string[];
}

const symptomById = new Map(SYMPTOMS.map((s) => [s.id, s]));

function finding(
  symptomId: string,
  severity: 'mild' | 'strong',
  evidence: string,
): TelemetryFinding {
  const s = symptomById.get(symptomId);
  return {
    symptomId,
    label: s?.label ?? symptomId,
    severity,
    evidence,
    adjustments: s?.adjustments ?? [],
  };
}

/** Diagnose handling issues from a recorded session summary. */
export function diagnoseTelemetry(summary: TelemetrySummary): TelemetryDiagnosis {
  const t = TELEMETRY_DIAGNOSIS;
  const findings: TelemetryFinding[] = [];
  const notes: string[] = [];

  if (summary.frames < t.minFrames) {
    notes.push(
      `Only ${summary.frames} frames recorded — drive a few corners under load, then record again for a diagnosis.`,
    );
    return { findings, notes };
  }

  // Balance: understeerIndex > 0 = front slides more (understeer); < 0 = oversteer.
  const ui = summary.understeerIndex;
  const absUi = Math.abs(ui);
  if (absUi >= t.balanceMild) {
    const severity = absUi >= t.balanceStrong ? 'strong' : 'mild';
    if (ui > 0) {
      findings.push(
        finding(
          'understeer-entry',
          severity,
          `Understeer index +${ui.toFixed(3)} — the front tires slide more than the rear.`,
        ),
      );
    } else {
      findings.push(
        finding(
          'oversteer-exit',
          severity,
          `Understeer index ${ui.toFixed(3)} — the rear tires slide more than the front.`,
        ),
      );
    }
  }

  // Traction: drive-axle (rear) mean slip well above the limit reads as wheelspin.
  const [, , rl, rr] = summary.meanCombinedSlip;
  const rearSlip = (rl + rr) / 2;
  if (rearSlip >= t.wheelspinSlip) {
    findings.push(
      finding(
        'poor-launch',
        rearSlip >= t.wheelspinSlip * 1.3 ? 'strong' : 'mild',
        `Rear tires average ${rearSlip.toFixed(2)} combined slip — they're spinning up / past the grip limit.`,
      ),
    );
  }

  if (findings.length === 0) {
    notes.push(
      'No clear understeer, oversteer or traction issue in this session — the car looks balanced.',
    );
  }

  return { findings, notes };
}
