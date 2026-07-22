import type { Discipline, TelemetrySummary } from '@fh6/shared';
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

/**
 * Diagnose handling issues from a recorded session summary. Pass the `discipline`
 * so the read is judged against the goal — most importantly for drift, where a
 * sliding, spinning rear is the POINT, not a fault to correct.
 */
export function diagnoseTelemetry(
  summary: TelemetrySummary,
  discipline?: Discipline,
): TelemetryDiagnosis {
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
  const [fl, fr, rl, rr] = summary.meanCombinedSlip;
  const rearSlip = (rl + rr) / 2;
  const frontSlip = (fl + fr) / 2;

  if (discipline === 'drift') {
    // For drift the rear SHOULD slide and spin; the only balance fault is the
    // opposite — the front sliding more than the rear (can't take/hold angle).
    if (ui >= t.balanceMild) {
      findings.push(
        finding(
          'understeer-entry',
          ui >= t.balanceStrong ? 'strong' : 'mild',
          `Understeer index +${ui.toFixed(2)} — the front is sliding more than the rear, so the car resists taking and holding angle. (For drift you want the rear to lead.)`,
        ),
      );
    } else {
      notes.push(
        `Drift session: the rear leads the slide (balance index ${ui.toFixed(2)}) and averages ${rearSlip.toFixed(1)} slip vs ${frontSlip.toFixed(1)} front — that's the goal. Judge it on holding and transitioning angle; if the rear snaps or spins uncontrollably, reduce differential accel lock and soften the rear.`,
      );
    }
    return { findings, notes };
  }

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
