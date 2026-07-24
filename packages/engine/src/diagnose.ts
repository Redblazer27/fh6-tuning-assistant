import type { Discipline, Drivetrain, TelemetrySummary } from '@fh6/shared';
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
  drivetrain: Drivetrain = 'RWD',
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

  const ui = summary.understeerIndex;
  const absUi = Math.abs(ui);
  const [fl, fr, rl, rr] = summary.meanCombinedSlip;
  const rearSlip = (rl + rr) / 2;
  const frontSlip = (fl + fr) / 2;
  const driveSlip =
    drivetrain === 'FWD' ? frontSlip : drivetrain === 'AWD' ? (frontSlip + rearSlip) / 2 : rearSlip;
  const driveLabel =
    drivetrain === 'FWD'
      ? 'Front driven tires'
      : drivetrain === 'AWD'
        ? 'Driven tires'
        : 'Rear driven tires';

  if (discipline === 'drift') {
    if (ui >= t.balanceMild) {
      findings.push(
        finding(
          'understeer-entry',
          ui >= t.balanceStrong ? 'strong' : 'mild',
          `Understeer index +${ui.toFixed(2)} — the front is sliding more than the rear, so the car resists taking and holding angle.`,
        ),
      );
    } else {
      notes.push(
        `Drift session: rear slip leads (${rearSlip.toFixed(1)} vs ${frontSlip.toFixed(1)} front; balance ${ui.toFixed(2)}), which is expected. Judge whether angle is controllable rather than treating rear slip as a road-racing fault.`,
      );
    }
    if ((summary.nearLimiterPct ?? 0) >= 10) {
      findings.push(
        finding(
          'gearing-too-short',
          summary.nearLimiterPct! >= 25 ? 'strong' : 'mild',
          `${summary.nearLimiterPct!.toFixed(1)}% of moving frames were near the limiter — the active drift gear needs more wheel-speed reserve.`,
        ),
      );
    }
    if (summary.meanTireTempC) {
      const frontTemp = (summary.meanTireTempC[0] + summary.meanTireTempC[1]) / 2;
      const rearTemp = (summary.meanTireTempC[2] + summary.meanTireTempC[3]) / 2;
      if (rearTemp >= 160 || rearTemp - frontTemp >= 40) {
        notes.push(
          `Rear tires averaged ${rearTemp.toFixed(0)}°C vs ${frontTemp.toFixed(0)}°C front — sustained wheelspin is overheating them; try the longer active gear and smoother throttle before removing rear grip.`,
        );
      }
    }
    return { findings, notes };
  }

  if (absUi >= t.balanceMild) {
    const severity = absUi >= t.balanceStrong ? 'strong' : 'mild';
    findings.push(
      ui > 0
        ? finding(
            'understeer-entry',
            severity,
            `Understeer index +${ui.toFixed(3)} — the front tires slide more than the rear.`,
          )
        : finding(
            'oversteer-exit',
            severity,
            `Understeer index ${ui.toFixed(3)} — the rear tires slide more than the front.`,
          ),
    );
  }

  if (driveSlip >= t.wheelspinSlip) {
    findings.push(
      finding(
        'poor-launch',
        driveSlip >= t.wheelspinSlip * 1.3 ? 'strong' : 'mild',
        `${driveLabel} average ${driveSlip.toFixed(2)} combined slip — they are spinning beyond the useful grip region.`,
      ),
    );
  }

  if ((summary.nearLimiterPct ?? 0) >= 20) {
    findings.push(
      finding(
        'gearing-too-short',
        summary.nearLimiterPct! >= 35 ? 'strong' : 'mild',
        `${summary.nearLimiterPct!.toFixed(1)}% of moving frames were near the limiter — verify the route has enough straight-line time, then lengthen the active gear or final drive.`,
      ),
    );
  }

  const maxTravel = Math.max(...summary.meanSuspensionTravel.map(Math.abs));
  if (maxTravel >= 0.85) {
    findings.push(
      finding(
        'bottoming-dirt',
        maxTravel >= 0.95 ? 'strong' : 'mild',
        `Mean normalized suspension travel reached ${maxTravel.toFixed(2)} on the most-loaded corner — inspect peak travel for bottoming.`,
      ),
    );
  }

  if (summary.meanTireTempC) {
    const hottest = Math.max(...summary.meanTireTempC);
    const coolest = Math.min(...summary.meanTireTempC);
    if (hottest >= 130)
      notes.push(
        `The hottest tire averaged ${hottest.toFixed(0)}°C — reduce sustained slip and re-check pressure/camber after a clean lap.`,
      );
    if (hottest - coolest >= 35)
      notes.push(
        `Tire temperatures span ${(hottest - coolest).toFixed(0)}°C across the car — inspect axle balance before changing spring or differential settings.`,
      );
  }

  if (findings.length === 0) {
    notes.push(
      'No clear understeer, oversteer, traction, limiter or suspension-travel issue in this session — the car looks balanced.',
    );
  }

  return { findings, notes };
}
