import { describe, expect, it } from 'vitest';
import { summarizeTelemetry } from '@fh6/shared';
import { parsePacket, csvRow, CSV_HEADER } from '../src/parser.ts';

function buildFh6Packet(): Buffer {
  const buf = Buffer.alloc(323);
  buf.writeInt32LE(1, 0); // isRaceOn
  buf.writeUInt32LE(123456, 4); // timestampMs
  buf.writeFloatLE(8000, 8); // maxRpm
  buf.writeFloatLE(800, 12); // idleRpm
  buf.writeFloatLE(5000, 16); // rpm
  [0.1, 0.2, 0.3, 0.4].forEach((v, i) => buf.writeFloatLE(v, 68 + i * 4)); // suspension
  [0.5, 0.6, 0.7, 0.8].forEach((v, i) => buf.writeFloatLE(v, 84 + i * 4)); // slipRatio
  [0.11, 0.22, 0.33, 0.44].forEach((v, i) => buf.writeFloatLE(v, 180 + i * 4)); // combinedSlip
  buf.writeInt32LE(42, 212); // carOrdinal
  buf.writeInt32LE(7, 232); // carGroup (FH6)
  const dash = 244;
  buf.writeFloatLE(50, dash + 12); // speed m/s -> 180 km/h
  buf.writeInt32LE(3, 216); // A class
  buf.writeInt32LE(698, 220); // actual PI
  buf.writeInt32LE(1, 224); // RWD
  buf.writeInt32LE(2, 228); // two rotors/cylinders field
  buf.writeFloatLE(250000, dash + 16); // power W -> 250 kW
  [80, 81, 82, 83].forEach((v, i) => buf.writeFloatLE(v, dash + 24 + i * 4)); // tire temp
  buf.writeUInt8(200, dash + 71); // accel
  buf.writeUInt8(10, dash + 72); // brake
  buf.writeUInt8(4, dash + 75); // gear
  buf.writeInt8(-20, dash + 76); // steer
  return buf;
}

describe('FH6 packet parser', () => {
  it('decodes a full FH6 packet', () => {
    const f = parsePacket(buildFh6Packet())!;
    expect(f).not.toBeNull();
    expect(f.isRaceOn).toBe(true);
    expect(f.timestampMs).toBe(123456);
    expect(f.rpm).toBeCloseTo(5000, 3);
    expect(f.speedKmh).toBeCloseTo(180, 3);
    expect(f.powerKw).toBeCloseTo(250, 3);
    expect(f.gear).toBe(4);
    expect(f.accel).toBe(200);
    expect(f.brake).toBe(10);
    expect(f.steer).toBe(-20);
    expect(f.carGroup).toBe(7);
    expect(f.carOrdinal).toBe(42);
    expect(f.carClass).toBe(3);
    expect(f.carPerformanceIndex).toBe(698);
    expect(f.drivetrainType).toBe(1);
    expect(f.numCylinders).toBe(2);
    expect(f.combinedSlip[0]).toBeCloseTo(0.11, 4);
    expect(f.suspensionTravel[3]).toBeCloseTo(0.4, 4);
  });

  it('carries actual PI, limiter and tire temperature into the summary', () => {
    const summary = summarizeTelemetry([parsePacket(buildFh6Packet())!]);
    expect(summary.carClass).toBe(3);
    expect(summary.carPerformanceIndex).toBe(698);
    expect(summary.engineMaxRpm).toBe(8000);
    expect(summary.nearLimiterPct).toBe(0);
    expect(summary.meanTireTempC).toEqual([80, 81, 82, 83]);
  });
  it('returns null for a too-short packet', () => {
    expect(parsePacket(Buffer.alloc(100))).toBeNull();
  });

  it('parses an FH5-length packet with no CarGroup', () => {
    const buf = Buffer.alloc(311);
    buf.writeInt32LE(1, 0);
    const dash = 232;
    buf.writeFloatLE(30, dash + 12); // 30 m/s -> 108 km/h
    buf.writeUInt8(3, dash + 75); // gear
    const f = parsePacket(buf)!;
    expect(f.carGroup).toBeUndefined();
    expect(f.gear).toBe(3);
    expect(f.speedKmh).toBeCloseTo(108, 3);
  });

  it('csvRow matches the header column count', () => {
    const f = parsePacket(buildFh6Packet())!;
    expect(csvRow(f).split(',').length).toBe(CSV_HEADER.split(',').length);
  });
});
