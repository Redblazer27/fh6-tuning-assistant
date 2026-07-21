# Tuning Engine Design

The engine (`packages/engine`) is **pure, deterministic, and framework-free**. Same inputs → same
outputs, always. No LLM or black box is used for any number. This document records every heuristic and
its expected effect. Model constants live in
[`packages/engine/src/constants.ts`](../packages/engine/src/constants.ts); confidence is medium/low and
refined by feedback.

## Pipeline

```
BuildRequest ──▶ optimizeSelection ──▶ PartSelection
                     │                     │
                     ▼                     ▼
              scoreSpec (objective)   buildSpec ──▶ BuiltSpec ──▶ estimatePI ──▶ PiEstimate
                                                        │
                                                        ▼
                                        computeTune (+ TuneRanges) ──▶ TuneSpec
                                                        │
                                                        ▼
                                                  checkLegality ──▶ LegalityResult
```

`generateBuild` runs this for three strategy tilts (grip / balanced / speed), dedupes, and ranks by a
common (balanced) score so the comparison is fair.

## BuiltSpec — deriving the built car (`buildSpec.ts`)

From a car + a part selection:
- **Power** = `stockHp × Π(powerMultiplier) + Σ(powerHpDelta)`.
- **Mass** = `stockKg × Π(massMultiplier) + Σ(massKgDelta)`.
- **Power-to-weight** = `hp / (kg/1000)`.
- **Grip factor** = `tireGrip(compound, surface) × Π(gripMultiplier)`. A **tarmac** grip is also kept so
  PI never depends on the activity.
- **Braking factor** = `Π(brakingMultiplier)`; **Launch factor** = `LAUNCH_BASE[drivetrain] × Π(launchMultiplier)`
  (`AWD 1.2 / RWD 1.0 / FWD 0.85`).
- **Aero capability**, **drivetrain**, **aspiration**, **tire compound** come from the relevant parts.
- **Unlocked tuning** = union of each part's `unlocks` (+ tires always).

Tire grip is surface-dependent (see `TIRE_GRIP`): slicks dominate tarmac, off-road/rally dominate dirt,
snow tires dominate snow; `mixed` averages tarmac+dirt.

## Estimated PI (`pi.ts`)

**Anchored to the car's stock PI plus a modelled delta** — the honest, testable stance (see data policy).

```
Δpi = Kpw·Δ(pw) + Kgrip·Δ(gripTarmac) + Kaero·(aeroMaxKgf) + Kbrake·Δ(braking) + Klaunch·Δ(launch)
PI  = clamp(round(stockPI + Δpi), 100, 999)
```

Coefficients (`PI_COEFF`): `pw 0.85, grip 320, aeroPerKgf 0.05, braking 90, launch 40`. Uncertainty band
grows with the size of the change: `±clamp(6 + 0.12·|Δpi|, 6, 60)`. **Expected effect:** stock → exactly
stockPI; slicks add ~90; full engine work adds tens–hundreds; off-road tires *lower* PI (worse on tarmac).

## Build optimizer (`optimizer.ts`)

Deterministic **coordinate ascent**: start stock, then for each category pick the candidate that
maximizes the strategy-tilted objective while keeping **PI ≤ cap** and **cost ≤ budget**. Repeat until a
full sweep makes no change. Ties break by lower PI → lower cost → part id. Constraints prune candidates
up front (locks, no-swaps, no-aero, stock-looking, budget, preferred drivetrain/engine, allow/deny lists).
**Expected effect:** a strong, legal build that fills the PI budget with the best value parts for the goal.

## Scoring (`scoring.ts`)

Five metrics normalized 0..1 (accel = pw; grip = mechanical grip + aero bonus; braking; launch;
top-speed = power), weighted per discipline (`SCORE_WEIGHTS`) and tilted per strategy (`STRATEGY_TILT`),
re-normalized to sum 1. Total is `Σ normalized·weight·100`. The full breakdown is returned and shown, so
ranking is never a black box.

## Tuning heuristics (`tuning.ts`)

Every value is clamped/snapped to the car's legal `TuneRanges`, so output is always in-game-valid.

| Section | Heuristic | Expected effect |
| --- | --- | --- |
| **Tire pressure** | Warm-target base per surface (tarmac 29 psi, dirt 26, snow 25); ± small bias to the heavier axle; drag lowers front/raises rear; drift raises rear; top-speed raises both. | Grip near target temp; compliance on loose surfaces; launch/stability tilt per discipline. |
| **Gearing** | Final drive set so redline in top gear reaches a discipline top-speed target (`vmax = stockTop·∛(power/stockPower)`); gears spaced **geometrically** from a discipline 1st gear to an overdrive top gear. | Shifts land near peak power; short for dirt/technical, tall for top-speed. Requires race transmission to tune. |
| **Alignment** | Camber negative by surface (less for drag/top-speed, more for slicks); small front toe-out for turn-in, rear toe-in for stability; caster ~5.5° (higher for drift, +0.3 on controller). | Cornering contact & responsive but stable steering. |
| **Anti-roll bars** | Base stiffness fraction per surface, scaled to axle weight, then biased for balance (FWD stiffen rear, RWD stiffen front, style shifts rotation); drift = soft front / very stiff rear. | Primary handling-balance tool; stiffer rear = more rotation. |
| **Springs + ride height** | Rate from **ride frequency**: `k = (2πf)²·m_cornerSprung` (tarmac ~2.2/2.35 Hz F/R, dirt ~1.5, drift stiffer front); ride height low for grip/aero, high for dirt, slight rake. | Balanced body control tuned to each corner's sprung mass. |
| **Damping** | From a target **damping ratio** as a fraction of the slider range (tarmac rebound 0.6, dirt 0.42); bump = 0.7×rebound; rear ~5% firmer. | Controlled, planted body motion; softer on loose surfaces. |
| **Aero** | Downforce level per discipline (road high, drag/top-speed zero); front balanced to weight distribution, slightly less to avoid understeer; clamped to the installed wing's capability. | More grip vs. more drag trade-off; `null` when no aero. |
| **Brakes** | Balance ~50% ± weight-distribution bias; pressure 100% (−4 on controller, −2 smooth). | Stable braking, fewer lock-ups on a pad. |
| **Differential** | Per drivetrain: RWD accel 40 (road)→95 (drift), decel 15–40; FWD low accel to cut understeer; AWD center 20–40% front + per-axle accel/decel; style shifts accel ±5. | Corner-exit traction & braking stability tuned to the goal. |

### Simplifications (documented, for honesty)
- Tuning-category unlocks are coarse (e.g., any race transmission unlocks full gearing; sport-vs-race
  final-drive-only granularity is not modelled).
- Different race/rally/drift differentials are treated equivalently for the *tune*; the discipline drives
  the diff values, not which diff part.
- Tire radius uses a default (0.33 m) unless a car provides more detail; gearing is the least precise
  area and a prime candidate for feedback-driven refinement.

## Symptom-based adjustments (`symptoms.ts`)

A curated table maps a handling complaint → an **ordered, smallest-safe-first** list of changes with a
one-line rationale (e.g., understeer-on-exit → reduce diff accel lock, then soften front ARB, then trim
front aero). Condition modifiers (controller / wheel / wet) add global notes. These are guidance layered
on the baseline — applying one is the user's choice and never rewrites the baseline tune.

## Determinism & tests

- Pure functions, integer/float math only, no time/random.
- `packages/engine/test` covers: stock-PI anchoring, range-legality across disciplines, determinism, PI
  cap boundary, stock-over-cap infeasibility, disallowed categories, AWD conversion, engine swap, no-aero,
  budget, locked parts, and drag/drift/dirt discipline behaviour.
