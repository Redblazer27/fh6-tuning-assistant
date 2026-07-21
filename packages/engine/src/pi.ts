import { clamp, piToClass, round, type Confidence } from '@fh6/shared';
import type { Car } from '@fh6/data';
import { LAUNCH_BASE } from './buildSpec.ts';
import {
  PI_COEFF,
  PI_UNCERTAINTY_BASE,
  PI_UNCERTAINTY_CAP,
  PI_UNCERTAINTY_SLOPE,
  tireGrip,
} from './constants.ts';
import type { BuiltSpec, PiComponent, PiEstimate } from './types.ts';

/**
 * Estimated PI = the car's known stock PI + a modelled delta from the build.
 *
 * Anchoring to the (data-sourced) stock PI means a stock build always estimates
 * exactly stockPI, and only the *change* from upgrades is modelled. This is far
 * more honest and testable than an absolute PI formula. The result is always
 * presented with an uncertainty band and a confidence label — never as exact.
 * See docs/tuning-engine-design.md for the coefficients and their rationale.
 */
export function estimatePI(car: Car, spec: BuiltSpec): PiEstimate {
  // Stock reference metrics (surface-neutral / tarmac).
  const pwStock = car.powerHp / (car.massKg / 1000);
  const gripStock = tireGrip(car.stockTireCompound, 'tarmac');
  const brakingStock = 1;
  const launchStock = LAUNCH_BASE[car.drivetrain];

  const aeroPotential = (spec.aeroFront?.maxKgf ?? 0) + (spec.aeroRear?.maxKgf ?? 0);

  const components: PiComponent[] = [];
  const push = (label: string, delta: number, note?: string) => {
    if (Math.abs(delta) >= 0.5) components.push({ label, delta: round(delta, 1), note });
  };

  const dPW = (spec.powerToWeight - pwStock) * PI_COEFF.powerToWeight;
  const dGrip = (spec.gripFactorTarmac - gripStock) * PI_COEFF.grip;
  const dAero = aeroPotential * PI_COEFF.aeroPerKgf;
  const dBrake = (spec.brakingFactor - brakingStock) * PI_COEFF.braking;
  const dLaunch = (spec.launchFactor - launchStock) * PI_COEFF.launch;

  push('Power-to-weight', dPW);
  push('Grip (tires/suspension)', dGrip);
  push('Aero downforce', dAero);
  push('Braking', dBrake);
  push('Launch / drivetrain', dLaunch);

  const deltaFromStock = dPW + dGrip + dAero + dBrake + dLaunch;
  const pi = clamp(Math.round(car.stockPI + deltaFromStock), 100, 999);
  const uncertainty = Math.round(
    clamp(
      PI_UNCERTAINTY_BASE + PI_UNCERTAINTY_SLOPE * Math.abs(deltaFromStock),
      PI_UNCERTAINTY_BASE,
      PI_UNCERTAINTY_CAP,
    ),
  );

  const confidence: Confidence = Math.abs(deltaFromStock) > 150 ? 'low' : 'medium';

  return {
    pi,
    class: piToClass(pi),
    uncertainty,
    stockPI: car.stockPI,
    deltaFromStock: round(deltaFromStock, 1),
    components,
    confidence,
  };
}
