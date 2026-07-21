import { clamp, type Aspiration, type Drivetrain, type TireCompound } from '@fh6/shared';
import type { Car } from '@fh6/data';

/**
 * A car with all engine-critical physics present. Produced by resolveEffectiveCar,
 * which fills documented class-based defaults for any field the data omits (the
 * official roster carries authoritative identity/class/PI but not physics).
 */
export type ResolvedCar = Car & {
  drivetrain: Drivetrain;
  aspiration: Aspiration;
  stockTireCompound: TireCompound;
  massKg: number;
  weightDistFrontPct: number;
  powerHp: number;
};

export interface EffectiveCar {
  car: ResolvedCar;
  /** Physics fields that were absent and filled with a generic default. */
  estimatedFields: string[];
}

/**
 * Rough stock power from the (authoritative) stock PI. Power-to-weight is anchored
 * to stockPI by the PI model, so only the added-part delta really depends on this;
 * a class-typical placeholder keeps that delta sane. Deliberately generic.
 */
function defaultPowerHp(stockPI: number): number {
  return Math.round(clamp(90 + (stockPI - 100) * 1.1, 90, 1500));
}

/** Generic placeholders used only when the real value is unknown. Documented + low-confidence. */
const DEFAULTS = {
  drivetrain: 'RWD' as Drivetrain, // most common FH6 layout; the single most impactful guess
  aspiration: 'NA' as Aspiration,
  stockTireCompound: 'stock' as TireCompound,
  massKg: 1400, // generic passenger-car mass; mass does not track PI cleanly
  weightDistFrontPct: 50, // neutral
};

/**
 * Fill any absent engine-critical physics with transparent defaults, returning the
 * completed car plus the list of fields that were estimated (so the caller can lower
 * confidence and disclose it). Cars that already carry full physics pass through with
 * an empty estimatedFields list.
 */
export function resolveEffectiveCar(car: Car): EffectiveCar {
  const estimatedFields: string[] = [];
  const fill = <T>(present: T | undefined, fallback: T, name: string): T => {
    if (present === undefined) {
      estimatedFields.push(name);
      return fallback;
    }
    return present;
  };

  const resolved: ResolvedCar = {
    ...car,
    drivetrain: fill(car.drivetrain, DEFAULTS.drivetrain, 'drivetrain'),
    aspiration: fill(car.aspiration, DEFAULTS.aspiration, 'aspiration'),
    stockTireCompound: fill(car.stockTireCompound, DEFAULTS.stockTireCompound, 'stockTireCompound'),
    massKg: fill(car.massKg, DEFAULTS.massKg, 'massKg'),
    weightDistFrontPct: fill(
      car.weightDistFrontPct,
      DEFAULTS.weightDistFrontPct,
      'weightDistFrontPct',
    ),
    powerHp: fill(car.powerHp, defaultPowerHp(car.stockPI), 'powerHp'),
  };

  return { car: resolved, estimatedFields };
}
