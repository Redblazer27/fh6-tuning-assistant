import type { TelemetryFrame, Wheels } from '@fh6/shared';

/**
 * FH6 "Data Out" packet parser.
 *
 * Layout = the Forza "Dash" sled (bytes 0..231) followed by the dash block. FH6
 * inserts three fields (CarGroup, SmashableVelDiff, SmashableMass) after the sled
 * and before PositionX, and omits TireWear/TrackOrdinal. We detect the dash base
 * from the packet length so FH5 (311 bytes, no CarGroup) and FH6 (323 bytes) both
 * parse. Per-wheel order is [FL, FR, RL, RR]. All values little-endian.
 *
 * Offsets are implemented from the official Data Out documentation and validated
 * against real captures; treat as medium confidence until confirmed for your build.
 */

// Sled offsets (shared by FH5/FH6).
const O = {
  isRaceOn: 0,
  timestampMs: 4,
  maxRpm: 8,
  idleRpm: 12,
  rpm: 16,
  suspensionTravelNorm: 68, // FL..RR every 4
  slipRatio: 84,
  slipAngle: 164,
  combinedSlip: 180,
  carOrdinal: 212,
  carClass: 216,
  carPerformanceIndex: 220,
  drivetrainType: 224,
  numCylinders: 228,
  carGroupFh6: 232, // present only when the packet includes the FH6 fields
};

// Dash offsets are relative to the dash base (PositionX).
const D = {
  speedMps: 12,
  powerW: 16,
  tireTempC: 24, // FL..RR every 4
  accel: 71,
  brake: 72,
  clutch: 73,
  handbrake: 74,
  gear: 75,
  steer: 76,
};

const SLED_LEN = 232;
const DASH_LEN = 79;
const FH6_DASH_BASE = 244; // 232 sled + 12 (CarGroup + SmashableVelDiff + SmashableMass)
const FH5_DASH_BASE = 232;

const wheels4 = (read: (o: number) => number, base: number): Wheels => [
  read(base),
  read(base + 4),
  read(base + 8),
  read(base + 12),
];

/** Parse a raw UDP datagram into a TelemetryFrame, or null if too short/invalid. */
export function parsePacket(buf: Buffer): TelemetryFrame | null {
  if (buf.length < SLED_LEN) return null;

  const hasFh6Fields = buf.length >= FH6_DASH_BASE + DASH_LEN;
  const dashBase = hasFh6Fields ? FH6_DASH_BASE : FH5_DASH_BASE;
  const hasDash = buf.length >= dashBase + DASH_LEN;

  const f32 = (o: number) => buf.readFloatLE(o);
  const s32 = (o: number) => buf.readInt32LE(o);
  const u32 = (o: number) => buf.readUInt32LE(o);
  const u8 = (o: number) => buf.readUInt8(o);
  const s8 = (o: number) => buf.readInt8(o);

  const frame: TelemetryFrame = {
    t: Date.now(),
    isRaceOn: s32(O.isRaceOn) === 1,
    timestampMs: u32(O.timestampMs),
    maxRpm: f32(O.maxRpm),
    idleRpm: f32(O.idleRpm),
    rpm: f32(O.rpm),
    gear: hasDash ? u8(dashBase + D.gear) : 0,
    speedKmh: hasDash ? f32(dashBase + D.speedMps) * 3.6 : 0,
    powerKw: hasDash ? f32(dashBase + D.powerW) / 1000 : 0,
    accel: hasDash ? u8(dashBase + D.accel) : 0,
    brake: hasDash ? u8(dashBase + D.brake) : 0,
    clutch: hasDash ? u8(dashBase + D.clutch) : 0,
    handbrake: hasDash ? u8(dashBase + D.handbrake) : 0,
    steer: hasDash ? s8(dashBase + D.steer) : 0,
    slipRatio: wheels4(f32, O.slipRatio),
    slipAngle: wheels4(f32, O.slipAngle),
    combinedSlip: wheels4(f32, O.combinedSlip),
    tireTempC: hasDash ? wheels4(f32, dashBase + D.tireTempC) : [0, 0, 0, 0],
    suspensionTravel: wheels4(f32, O.suspensionTravelNorm),
    carOrdinal: s32(O.carOrdinal),
    carClass: s32(O.carClass),
    carPerformanceIndex: s32(O.carPerformanceIndex),
    drivetrainType: s32(O.drivetrainType),
    numCylinders: s32(O.numCylinders),
    carGroup: hasFh6Fields ? s32(O.carGroupFh6) : undefined,
  };
  return frame;
}

/** CSV header matching csvRow(). */
export const CSV_HEADER = [
  't',
  'isRaceOn',
  'timestampMs',
  'rpm',
  'gear',
  'speedKmh',
  'powerKw',
  'accel',
  'brake',
  'steer',
  'slipFL',
  'slipFR',
  'slipRL',
  'slipRR',
  'combinedFL',
  'combinedFR',
  'combinedRL',
  'combinedRR',
  'suspFL',
  'suspFR',
  'suspRL',
  'suspRR',
].join(',');

export function csvRow(f: TelemetryFrame): string {
  return [
    f.t,
    f.isRaceOn ? 1 : 0,
    f.timestampMs,
    f.rpm.toFixed(0),
    f.gear,
    f.speedKmh.toFixed(2),
    f.powerKw.toFixed(2),
    f.accel,
    f.brake,
    f.steer,
    ...f.slipRatio.map((v) => v.toFixed(4)),
    ...f.combinedSlip.map((v) => v.toFixed(4)),
    ...f.suspensionTravel.map((v) => v.toFixed(4)),
  ].join(',');
}
