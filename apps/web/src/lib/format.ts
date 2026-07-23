import {
  cmToIn,
  inToCm,
  kgfPerMmToNPerMm,
  kgfToLbf,
  lbfPerInToNPerMm,
  lbfToKgf,
  nPerMmToLbfPerIn,
  psiToBar,
  type TuneSpec,
  type TuneUnits,
} from '@fh6/shared';
import type { BuildStrategy } from '@fh6/engine';
import type { Car } from '@fh6/data';

export const fmt = (n: number, d = 1): string =>
  Number.isFinite(n) ? n.toFixed(d) : '—';

/**
 * Display unit system. FH6 shows tune values in whichever system the player's game
 * is set to; the app defaults to metric (bar / N/mm / cm) — what FH6 displays for
 * players. Pressure is stored canonically in psi; springs stay in the data-declared
 * unit and are converted here for display only.
 */
export type UnitSystem = 'metric' | 'imperial';

/** Tire pressure is stored in psi; show bar for metric. */
export function pressureText(psi: number, system: UnitSystem): string {
  return system === 'metric' ? `${psiToBar(psi).toFixed(2)} bar` : `${fmt(psi)} psi`;
}

const springToNPerMm = (v: number, unit: TuneUnits['springRate']): number =>
  unit === 'lbf/in' ? lbfPerInToNPerMm(v) : unit === 'kgf/mm' ? kgfPerMmToNPerMm(v) : v;

/** Spring rate is stored in the car's data unit; show N/mm for metric, lbf/in for imperial. */
export function springText(v: number, unit: TuneUnits['springRate'], system: UnitSystem): string {
  const nmm = springToNPerMm(v, unit);
  return system === 'metric'
    ? `${nmm.toFixed(1)} N/mm`
    : `${nPerMmToLbfPerIn(nmm).toFixed(0)} lbf/in`;
}

/** Ride height stored in cm or in; show cm for metric, in for imperial. */
export function rideHeightText(
  v: number,
  unit: TuneUnits['rideHeight'],
  system: UnitSystem,
): string {
  const cm = unit === 'in' ? inToCm(v) : v;
  return system === 'metric' ? `${cm.toFixed(1)} cm` : `${cmToIn(cm).toFixed(1)} in`;
}

/** Downforce stored in kgf or lbf; show kgf for metric, lbf for imperial. */
export function downforceText(v: number, unit: TuneUnits['downforce'], system: UnitSystem): string {
  const kgf = unit === 'lbf' ? lbfToKgf(v) : v;
  return system === 'metric' ? `${Math.round(kgf)} kgf` : `${Math.round(kgfToLbf(kgf))} lbf`;
}

export const credits = (n: number): string => `${Math.round(n).toLocaleString()} cr`;

/** Human label for a differential based on which fields are present. */
export function differentialLines(t: TuneSpec['differential']): [string, string][] {
  const rows: [string, string][] = [];
  if (t.centerBalanceFrontPct !== undefined)
    rows.push(['Center (front %)', `${fmt(t.centerBalanceFrontPct, 0)}%`]);
  if (t.accelFrontPct !== undefined) rows.push(['Front Accel', `${fmt(t.accelFrontPct, 0)}%`]);
  if (t.decelFrontPct !== undefined) rows.push(['Front Decel', `${fmt(t.decelFrontPct, 0)}%`]);
  if (t.accelRearPct !== undefined) rows.push(['Rear Accel', `${fmt(t.accelRearPct, 0)}%`]);
  if (t.decelRearPct !== undefined) rows.push(['Rear Decel', `${fmt(t.decelRearPct, 0)}%`]);
  return rows;
}

/**
 * Render a full tune as copyable plain text in FH6 tuning-menu order.
 * Used for the "copy tune" button and checklists.
 */
export function tuneToText(car: Car, strategy: BuildStrategy, system: UnitSystem = 'metric'): string {
  const t = strategy.tune.tune;
  const u = t.units;
  const L: string[] = [];
  L.push(`# ${car.name} — ${strategy.label} tune`);
  L.push(`# Estimated PI ${strategy.pi.pi} ±${strategy.pi.uncertainty} (${strategy.pi.class})`);
  L.push('');
  L.push('Tires');
  L.push(
    `  Front: ${pressureText(t.tires.frontPsi, system)}   Rear: ${pressureText(t.tires.rearPsi, system)}`,
  );
  L.push('Gearing');
  L.push(`  Final drive: ${fmt(t.gearing.finalDrive, 2)}`);
  t.gearing.gears.forEach((g, i) => L.push(`  ${i + 1}${ordinal(i + 1)}: ${fmt(g, 2)}`));
  L.push('Alignment');
  L.push(`  Camber F/R: ${fmt(t.alignment.camberFrontDeg)}° / ${fmt(t.alignment.camberRearDeg)}°`);
  L.push(`  Toe F/R: ${fmt(t.alignment.toeFrontDeg)}° / ${fmt(t.alignment.toeRearDeg)}°`);
  L.push(`  Caster: ${fmt(t.alignment.casterDeg)}°`);
  L.push('Anti-roll bars');
  L.push(`  Front: ${fmt(t.antiRollBars.front)}   Rear: ${fmt(t.antiRollBars.rear)}`);
  L.push('Springs');
  L.push(
    `  Front: ${springText(t.springs.frontRate, u.springRate, system)}   Rear: ${springText(t.springs.rearRate, u.springRate, system)}`,
  );
  L.push(
    `  Ride height F/R: ${rideHeightText(t.springs.frontRideHeight, u.rideHeight, system)} / ${rideHeightText(t.springs.rearRideHeight, u.rideHeight, system)}`,
  );
  L.push('Damping');
  L.push(`  Rebound F/R: ${fmt(t.damping.reboundFront)} / ${fmt(t.damping.reboundRear)}`);
  L.push(`  Bump F/R: ${fmt(t.damping.bumpFront)} / ${fmt(t.damping.bumpRear)}`);
  L.push('Aero');
  L.push(
    t.aero
      ? `  Front: ${downforceText(t.aero.frontDownforce, u.downforce, system)}   Rear: ${downforceText(t.aero.rearDownforce, u.downforce, system)}`
      : '  (no adjustable aero)',
  );
  L.push('Brakes');
  L.push(`  Balance: ${fmt(t.brakes.balanceFrontPct, 0)}% front   Pressure: ${fmt(t.brakes.pressurePct, 0)}%`);
  L.push('Differential');
  for (const [k, v] of differentialLines(t.differential)) L.push(`  ${k}: ${v}`);
  L.push('');
  L.push('Parts to buy:');
  for (const p of strategy.parts.filter((p) => p.isUpgrade)) {
    L.push(`  - ${categoryLabel(p.category)}: ${p.name} (${credits(p.cost)})`);
  }
  return L.join('\n');
}

function ordinal(n: number): string {
  if (n === 1) return 'st';
  if (n === 2) return 'nd';
  if (n === 3) return 'rd';
  return 'th';
}

export function categoryLabel(category: string): string {
  return category
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace('Arb', 'ARB');
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
