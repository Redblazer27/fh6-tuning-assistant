/**
 * Unit conversions used by the tuning engine (which computes in SI where it can)
 * and the UI (which labels values in the units FH6 shows).
 */

// Mass
export const LB_PER_KG = 2.2046226218;
export const kgToLb = (kg: number): number => kg * LB_PER_KG;
export const lbToKg = (lb: number): number => lb / LB_PER_KG;

// Pressure
export const PSI_PER_BAR = 14.503773773;
export const barToPsi = (bar: number): number => bar * PSI_PER_BAR;
export const psiToBar = (psi: number): number => psi / PSI_PER_BAR;

// Length
export const CM_PER_IN = 2.54;
export const inToCm = (inches: number): number => inches * CM_PER_IN;
export const cmToIn = (cm: number): number => cm / CM_PER_IN;

// Power
export const KW_PER_HP = 0.745699872;
export const hpToKw = (hp: number): number => hp * KW_PER_HP;
export const kwToHp = (kw: number): number => kw / KW_PER_HP;

// Speed
export const KMH_PER_MPH = 1.609344;
export const mphToKmh = (mph: number): number => mph * KMH_PER_MPH;
export const kmhToMph = (kmh: number): number => kmh / KMH_PER_MPH;

// Force (downforce)
export const N_PER_KGF = 9.80665;
export const kgfToN = (kgf: number): number => kgf * N_PER_KGF;
export const nToKgf = (n: number): number => n / N_PER_KGF;
export const LBF_PER_KGF = 2.2046226218;
export const kgfToLbf = (kgf: number): number => kgf * LBF_PER_KGF;
export const lbfToKgf = (lbf: number): number => lbf / LBF_PER_KGF;

/**
 * Spring rate conversions.
 * Forza displays spring rate in kgf/mm (metric) or lbf/in (imperial).
 * SI is N/mm. 1 kgf/mm = 9.80665 N/mm ; 1 lbf/in = 0.17513 N/mm.
 */
export const N_PER_MM_PER_KGF_PER_MM = 9.80665;
export const N_PER_MM_PER_LBF_PER_IN = 0.1751268;
export const kgfPerMmToNPerMm = (v: number): number => v * N_PER_MM_PER_KGF_PER_MM;
export const nPerMmToKgfPerMm = (v: number): number => v / N_PER_MM_PER_KGF_PER_MM;
export const lbfPerInToNPerMm = (v: number): number => v * N_PER_MM_PER_LBF_PER_IN;
export const nPerMmToLbfPerIn = (v: number): number => v / N_PER_MM_PER_LBF_PER_IN;

// Generic helpers
export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Round to N decimal places (deterministic). */
export const round = (value: number, decimals = 0): number => {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
};

/** Snap a value onto a min/max/step grid, then clamp to [min, max]. */
export function snapToStep(value: number, min: number, max: number, step: number): number {
  if (step <= 0) return clamp(value, min, max);
  const snapped = min + Math.round((value - min) / step) * step;
  // Guard floating point drift by rounding to the step's precision.
  const decimals = decimalsForStep(step);
  return clamp(round(snapped, decimals), min, max);
}

function decimalsForStep(step: number): number {
  if (Number.isInteger(step)) return 0;
  const s = step.toString();
  const dot = s.indexOf('.');
  return dot === -1 ? 0 : s.length - dot - 1;
}
