/**
 * FH6 "Data Out" telemetry — the decoded frame shared by the bridge (producer)
 * and the web app (consumer). Per-wheel arrays are ordered [FL, FR, RL, RR].
 *
 * The bridge parses the raw UDP packet (Forza "Dash"-style layout with the FH6
 * additions CarGroup/SmashableVelDiff/SmashableMass) into this shape and forwards
 * it as JSON over WebSocket. See apps/bridge and docs for the packet mapping.
 */

export type Wheels = [number, number, number, number];

export interface TelemetryFrame {
  /** Client receive time (ms since epoch). */
  t: number;
  isRaceOn: boolean;
  timestampMs: number;
  rpm: number;
  idleRpm: number;
  maxRpm: number;
  gear: number;
  speedKmh: number;
  /** Engine power (kW). */
  powerKw: number;
  accel: number; // 0..255
  brake: number; // 0..255
  clutch: number;
  handbrake: number;
  steer: number; // -127..127
  slipRatio: Wheels;
  slipAngle: Wheels;
  combinedSlip: Wheels;
  tireTempC: Wheels;
  /** Normalized suspension travel 0..1. */
  suspensionTravel: Wheels;
  /** FH6-specific fields. */
  carGroup?: number;
  carOrdinal?: number;
  carClass?: number;
  carPerformanceIndex?: number;
  drivetrainType?: number;
  numCylinders?: number;
}

export interface TelemetrySummary {
  frames: number;
  durationSec: number;
  topSpeedKmh: number;
  maxRpm: number;
  /** EngineMaxRpm reported by the game, distinct from highest RPM observed. */
  engineMaxRpm?: number;
  /** Actual in-game class code and PI carried in the FH6 packet. */
  carClass?: number;
  carPerformanceIndex?: number;
  /** Share of moving frames at or above 90% of the reported engine maximum. */
  nearLimiterPct?: number;
  meanTireTempC?: Wheels;
  /** Mean absolute combined slip per wheel (grip usage signature). */
  meanCombinedSlip: Wheels;
  /** Mean absolute front vs rear slip angle — >0 front means understeer tendency. */
  understeerIndex: number;
  meanSuspensionTravel: Wheels;
}

const zeroWheels = (): Wheels => [0, 0, 0, 0];

/** Summarize a session's frames into feedback signals (deterministic). */
export function summarizeTelemetry(frames: TelemetryFrame[]): TelemetrySummary {
  const racing = frames.filter((f) => f.isRaceOn);
  const n = racing.length;
  if (n === 0) {
    return {
      frames: 0,
      durationSec: 0,
      topSpeedKmh: 0,
      maxRpm: 0,
      meanCombinedSlip: zeroWheels(),
      understeerIndex: 0,
      meanSuspensionTravel: zeroWheels(),
    };
  }

  let topSpeed = 0;
  let maxRpm = 0;
  const slipSum: Wheels = [0, 0, 0, 0];
  const travelSum: Wheels = [0, 0, 0, 0];
  let engineMaxRpm = 0;
  let carClass: number | undefined;
  let carPerformanceIndex: number | undefined;
  let activeFrames = 0;
  let nearLimiterFrames = 0;
  const tempSum: Wheels = [0, 0, 0, 0];
  let frontAngle = 0;
  let rearAngle = 0;

  for (const f of racing) {
    topSpeed = Math.max(topSpeed, f.speedKmh);
    maxRpm = Math.max(maxRpm, f.rpm);
    slipSum[0] += Math.abs(f.combinedSlip[0]);
    slipSum[1] += Math.abs(f.combinedSlip[1]);
    slipSum[2] += Math.abs(f.combinedSlip[2]);
    engineMaxRpm = Math.max(engineMaxRpm, f.maxRpm);
    if (f.carClass !== undefined) carClass = f.carClass;
    if (f.carPerformanceIndex !== undefined && f.carPerformanceIndex > 0)
      carPerformanceIndex = f.carPerformanceIndex;
    if (f.speedKmh > 5 && f.maxRpm > 0) {
      activeFrames += 1;
      if (f.rpm >= f.maxRpm * 0.9) nearLimiterFrames += 1;
    }
    tempSum[0] += f.tireTempC[0];
    tempSum[1] += f.tireTempC[1];
    tempSum[2] += f.tireTempC[2];
    tempSum[3] += f.tireTempC[3];
    slipSum[3] += Math.abs(f.combinedSlip[3]);
    travelSum[0] += f.suspensionTravel[0];
    travelSum[1] += f.suspensionTravel[1];
    travelSum[2] += f.suspensionTravel[2];
    travelSum[3] += f.suspensionTravel[3];
    frontAngle += (Math.abs(f.slipAngle[0]) + Math.abs(f.slipAngle[1])) / 2;
    rearAngle += (Math.abs(f.slipAngle[2]) + Math.abs(f.slipAngle[3])) / 2;
  }

  const mean = (s: Wheels): Wheels => [s[0] / n, s[1] / n, s[2] / n, s[3] / n];
  const timeSpan =
    racing.length > 1 ? (racing[n - 1]!.timestampMs - racing[0]!.timestampMs) / 1000 : 0;

  return {
    frames: n,
    durationSec: Math.max(0, timeSpan),
    topSpeedKmh: topSpeed,
    maxRpm,
    meanCombinedSlip: mean(slipSum),
    understeerIndex: (frontAngle - rearAngle) / n,
    engineMaxRpm,
    carClass,
    carPerformanceIndex,
    nearLimiterPct: activeFrames > 0 ? (nearLimiterFrames / activeFrames) * 100 : 0,
    meanTireTempC: mean(tempSum),
    meanSuspensionTravel: mean(travelSum),
  };
}
