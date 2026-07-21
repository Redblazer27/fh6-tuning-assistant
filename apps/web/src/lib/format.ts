import type { TuneSpec } from '@fh6/shared';
import type { BuildStrategy } from '@fh6/engine';
import type { Car } from '@fh6/data';

export const fmt = (n: number, d = 1): string =>
  Number.isFinite(n) ? n.toFixed(d) : '—';

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
export function tuneToText(car: Car, strategy: BuildStrategy): string {
  const t = strategy.tune.tune;
  const u = t.units;
  const L: string[] = [];
  L.push(`# ${car.name} — ${strategy.label} tune`);
  L.push(`# Estimated PI ${strategy.pi.pi} ±${strategy.pi.uncertainty} (${strategy.pi.class})`);
  L.push('');
  L.push('Tires');
  L.push(`  Front: ${fmt(t.tires.frontPsi)} psi   Rear: ${fmt(t.tires.rearPsi)} psi`);
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
  L.push(`  Front: ${fmt(t.springs.frontRate)} ${u.springRate}   Rear: ${fmt(t.springs.rearRate)} ${u.springRate}`);
  L.push(`  Ride height F/R: ${fmt(t.springs.frontRideHeight)} / ${fmt(t.springs.rearRideHeight)} ${u.rideHeight}`);
  L.push('Damping');
  L.push(`  Rebound F/R: ${fmt(t.damping.reboundFront)} / ${fmt(t.damping.reboundRear)}`);
  L.push(`  Bump F/R: ${fmt(t.damping.bumpFront)} / ${fmt(t.damping.bumpRear)}`);
  L.push('Aero');
  L.push(
    t.aero
      ? `  Front: ${fmt(t.aero.frontDownforce, 0)} ${u.downforce}   Rear: ${fmt(t.aero.rearDownforce, 0)} ${u.downforce}`
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
