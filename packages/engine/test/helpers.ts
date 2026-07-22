import { expect } from 'vitest';
import type { BuildRequest, Discipline, TuneSpec } from '@fh6/shared';
import { defaultStore, type TuneRanges } from '@fh6/data';
import { resolveEffectiveCar } from '../src/index.ts';

export const store = defaultStore;

/** A seed car resolved to full physics — for tests that call engine fns directly. */
export const rcar = (id: string) => resolveEffectiveCar(store.getCar(id)!).car;
/** All seed cars, resolved. */
export const resolvedCars = () => store.cars.map((c) => resolveEffectiveCar(c).car);

export function makeRequest(overrides: Partial<BuildRequest> = {}): BuildRequest {
  return {
    carId: 'mazda-mx5-nd-2019',
    discipline: 'road' as Discipline,
    targetPI: null,
    targetClass: null,
    input: 'wheel',
    drivingStyle: 'balanced',
    constraints: {},
    ...overrides,
  };
}

const inRange = (v: number, r: { min: number; max: number }) =>
  v >= r.min - 1e-6 && v <= r.max + 1e-6;

/** Assert every dimensioned tune value sits within the car's legal ranges. */
export function assertTuneWithinRanges(tune: TuneSpec, ranges: TuneRanges): void {
  expect(inRange(tune.tires.frontPsi, ranges.tirePressurePsi)).toBe(true);
  expect(inRange(tune.tires.rearPsi, ranges.tirePressurePsi)).toBe(true);
  expect(inRange(tune.gearing.finalDrive, ranges.finalDrive)).toBe(true);
  for (const g of tune.gearing.gears) expect(inRange(g, ranges.gearRatio)).toBe(true);
  expect(inRange(tune.alignment.camberFrontDeg, ranges.camberDeg)).toBe(true);
  expect(inRange(tune.alignment.camberRearDeg, ranges.camberDeg)).toBe(true);
  expect(inRange(tune.alignment.toeFrontDeg, ranges.toeDeg)).toBe(true);
  expect(inRange(tune.alignment.toeRearDeg, ranges.toeDeg)).toBe(true);
  expect(inRange(tune.alignment.casterDeg, ranges.casterDeg)).toBe(true);
  expect(inRange(tune.antiRollBars.front, ranges.arb)).toBe(true);
  expect(inRange(tune.antiRollBars.rear, ranges.arb)).toBe(true);
  expect(inRange(tune.springs.frontRate, ranges.springRate)).toBe(true);
  expect(inRange(tune.springs.rearRate, ranges.springRate)).toBe(true);
  expect(inRange(tune.springs.frontRideHeight, ranges.rideHeight)).toBe(true);
  expect(inRange(tune.springs.rearRideHeight, ranges.rideHeight)).toBe(true);
  expect(inRange(tune.damping.reboundFront, ranges.damping)).toBe(true);
  expect(inRange(tune.damping.reboundRear, ranges.damping)).toBe(true);
  expect(inRange(tune.damping.bumpFront, ranges.damping)).toBe(true);
  expect(inRange(tune.damping.bumpRear, ranges.damping)).toBe(true);
  if (tune.aero) {
    expect(inRange(tune.aero.frontDownforce, ranges.aero)).toBe(true);
    expect(inRange(tune.aero.rearDownforce, ranges.aero)).toBe(true);
  }
  expect(inRange(tune.brakes.balanceFrontPct, ranges.brakeBalancePct)).toBe(true);
  expect(inRange(tune.brakes.pressurePct, ranges.brakePressurePct)).toBe(true);
  const d = tune.differential;
  for (const v of [
    d.accelFrontPct,
    d.accelRearPct,
    d.decelFrontPct,
    d.decelRearPct,
    d.centerBalanceFrontPct,
  ]) {
    if (typeof v === 'number') expect(inRange(v, ranges.differentialPct)).toBe(true);
  }
}
