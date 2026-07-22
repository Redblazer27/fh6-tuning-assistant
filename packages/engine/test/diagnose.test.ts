import { describe, expect, it } from 'vitest';
import type { TelemetrySummary } from '@fh6/shared';
import { diagnoseTelemetry } from '../src/diagnose.ts';

const summary = (over: Partial<TelemetrySummary> = {}): TelemetrySummary => ({
  frames: 600,
  durationSec: 60,
  topSpeedKmh: 200,
  maxRpm: 7000,
  meanCombinedSlip: [0.6, 0.6, 0.6, 0.6],
  understeerIndex: 0,
  meanSuspensionTravel: [0, 0, 0, 0],
  ...over,
});

describe('telemetry diagnosis (closing the loop)', () => {
  it('flags a too-short session instead of guessing', () => {
    const d = diagnoseTelemetry(summary({ frames: 10 }));
    expect(d.findings).toHaveLength(0);
    expect(d.notes.join(' ')).toMatch(/too short|drive a few corners|frames recorded/i);
  });

  it('diagnoses understeer and returns front-freeing fixes', () => {
    const d = diagnoseTelemetry(summary({ understeerIndex: 0.2 }));
    const f = d.findings.find((x) => x.symptomId === 'understeer-entry');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('strong');
    expect(f!.adjustments.length).toBeGreaterThan(0);
    // The fix targets front balance (ARB / toe / camber).
    expect(f!.adjustments.some((a) => /front/i.test(a.change))).toBe(true);
  });

  it('diagnoses oversteer from a negative balance index', () => {
    const d = diagnoseTelemetry(summary({ understeerIndex: -0.08 }));
    const f = d.findings.find((x) => x.symptomId === 'oversteer-exit');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('mild');
  });

  it('flags rear wheelspin from drive-axle slip', () => {
    const d = diagnoseTelemetry(summary({ meanCombinedSlip: [0.7, 0.7, 1.4, 1.4] }));
    expect(d.findings.some((x) => x.symptomId === 'poor-launch')).toBe(true);
  });

  it('reports a balanced car with no findings', () => {
    const d = diagnoseTelemetry(
      summary({ understeerIndex: 0.01, meanCombinedSlip: [0.6, 0.6, 0.6, 0.6] }),
    );
    expect(d.findings).toHaveLength(0);
    expect(d.notes.join(' ')).toMatch(/balanced/i);
  });
});
