import { classMaxPi, type BuildRequest, type UpgradeCategory } from '@fh6/shared';
import type { DataStore } from '@fh6/data';
import type { ResolvedCar } from './effectiveCar.ts';
import type { BuiltSpec, LegalityResult, PiEstimate } from './types.ts';

/** Resolve the effective upper PI cap from the request (min of explicit PI and class cap). */
export function resolvePiCap(request: BuildRequest): number | null {
  const caps: number[] = [];
  if (typeof request.targetPI === 'number') caps.push(request.targetPI);
  if (request.targetClass) caps.push(classMaxPi(request.targetClass));
  return caps.length ? Math.min(...caps) : null;
}

/** Categories that are pure conversions/swaps. */
const SWAP_CATEGORIES: UpgradeCategory[] = ['engine_swap', 'drivetrain_swap'];

/**
 * Validate a built car against the PI cap and every declared constraint.
 * Pure and deterministic: returns all violations (hard) and warnings (soft).
 */
export function checkLegality(
  store: DataStore,
  car: ResolvedCar,
  request: BuildRequest,
  spec: BuiltSpec,
  pi: PiEstimate,
  piCap: number | null,
): LegalityResult {
  const violations: string[] = [];
  const warnings: string[] = [];
  const c = request.constraints;

  const upgradedCategories: UpgradeCategory[] = [];
  for (const [category, partId] of Object.entries(spec.selection) as [UpgradeCategory, string][]) {
    const part = store.getPart(partId);
    if (part && part.tierRank > 0) upgradedCategories.push(category);
  }
  const selectedParts = Object.values(spec.selection)
    .map((id) => (id ? store.getPart(id) : undefined))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  // --- PI cap ---
  if (piCap !== null) {
    if (pi.pi > piCap) {
      violations.push(
        `Estimated PI ${pi.pi} exceeds the ${piCap} cap by ${pi.pi - piCap} (likely over class).`,
      );
    } else if (pi.pi + pi.uncertainty > piCap) {
      warnings.push(
        `Estimated PI ${pi.pi} is within ${piCap} but the ±${pi.uncertainty} band reaches ${
          pi.pi + pi.uncertainty
        }. Verify in-game; shed a minor part if it lands over.`,
      );
    }
  }

  // --- Swaps ---
  const usesEngineSwap = upgradedCategories.includes('engine_swap');
  const usesDrivetrainSwap = spec.drivetrain !== car.drivetrain;
  if (c.noSwaps) {
    for (const cat of SWAP_CATEGORIES) {
      if (upgradedCategories.includes(cat)) violations.push(`"No swaps" set but ${cat} was used.`);
    }
  }
  if (c.allowEngineSwap === false && usesEngineSwap) {
    violations.push('Engine swap used but engine swaps are disallowed.');
  }
  if (c.allowDrivetrainSwap === false && usesDrivetrainSwap) {
    violations.push('Drivetrain differs from stock but drivetrain swaps are disallowed.');
  }
  if (c.preferredDrivetrain && spec.drivetrain !== c.preferredDrivetrain) {
    violations.push(
      `Preferred drivetrain ${c.preferredDrivetrain} not met (build is ${spec.drivetrain}).`,
    );
  }

  // --- Aero ---
  if (c.noAero) {
    const aeroParts = selectedParts.filter((p) => p.isAeroPart);
    if (aeroParts.length) {
      violations.push(`"No aero" set but installed: ${aeroParts.map((p) => p.name).join(', ')}.`);
    }
  }

  // --- Stock-looking ---
  if (c.stockLooking) {
    const visible = selectedParts.filter((p) => p.cosmeticVisible);
    if (visible.length) {
      violations.push(
        `"Stock-looking" set but visible parts installed: ${visible.map((p) => p.name).join(', ')}.`,
      );
    }
  }

  // --- Budget ---
  if (typeof c.budgetCredits === 'number' && spec.totalCost > c.budgetCredits) {
    violations.push(
      `Parts cost ${spec.totalCost.toLocaleString()} exceeds budget ${c.budgetCredits.toLocaleString()} cr.`,
    );
  }

  // --- Allowed / disallowed ---
  if (c.allowedCategories && c.allowedCategories.length) {
    const allowed = new Set(c.allowedCategories);
    for (const cat of upgradedCategories) {
      if (!allowed.has(cat)) violations.push(`Category ${cat} used but not in the allowed list.`);
    }
  }
  if (c.disallowedCategories && c.disallowedCategories.length) {
    const disallowed = new Set(c.disallowedCategories);
    for (const cat of upgradedCategories) {
      if (disallowed.has(cat)) violations.push(`Disallowed category ${cat} was used.`);
    }
  }
  if (c.disallowedPartIds && c.disallowedPartIds.length) {
    const banned = new Set(c.disallowedPartIds);
    for (const p of selectedParts) {
      if (banned.has(p.id)) violations.push(`Disallowed part ${p.name} was used.`);
    }
  }

  return { legal: violations.length === 0, violations, warnings };
}
