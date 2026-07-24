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

Coefficients (`PI_COEFF`): `pw 0.65, grip 80, aeroPerKgf 0.05, braking 50, launch 20`.
These were recalibrated against the first real RX-7 build (predicted S1 781, actual A; corrected
estimate A 692). The class-only observation makes this provisional, so the uncertainty band remains
visible and grows with the change: `±clamp(6 + 0.12·|Δpi|, 6, 60)`. Stock still estimates exactly its
known stock PI; engine work dominates the delta while tire/chassis changes contribute more modestly.

## Build optimizer (`optimizer.ts`)

Deterministic **coordinate ascent**: start stock, then for each category pick the candidate that
maximizes the strategy-tilted objective while keeping **PI ≤ cap** and **cost ≤ budget**. Repeat until a
full sweep makes no change. Ties break by lower PI → lower cost → part id. Constraints prune candidates
up front (locks, no-swaps, no-aero, stock-looking, budget, preferred drivetrain/engine, allow/deny lists).
**Expected effect:** a strong, legal build that fills the PI budget with the best value parts for the goal.

## Scoring (`scoring.ts`)

Eight metrics are normalized 0..1 (accel, grip, braking, launch, top speed, drivetrain **balance**,
**setupFit**, and drift-only **powerFit**), weighted per discipline (`SCORE_WEIGHTS`) and tilted per
strategy (`STRATEGY_TILT`). `setupFit` blends tire, suspension, differential and transmission suitability.
For drift it also scores **engine control**: maximum flywheel, camshaft and forced-induction tiers lose
points because a broad, predictable powerband is more controllable than maximum peak power. Street tires
remain the authority-guide baseline, while drift tires still outrank slicks for controllable sliding.
`powerFit` rewards the documented mid-power drift band instead of blindly maximizing horsepower.

Road and street builds strongly reject the post-Series-2 drag-tire exploit and favor road compounds;
loose modes favor rally/off-road hardware. Race transmission value includes its gearing unlock. Every
metric contribution is returned to the UI, so the ranking remains inspectable rather than a black box.

## Car comparison (`compare.ts`)

`compareCars(store, carIds, request)` ranks several cars for one goal: it builds each car for the same
request and ranks by its goal-fit score (drivetrain + tire fit already included). On top it adds a small,
bounded **weight-distribution** term — `chassisBalanceFit(frontPct, discipline)` against
`WEIGHT_BALANCE_IDEAL` (e.g. drag rewards a nose-light car, drift a ~53% front balance). No upgrade changes
a car's weight balance, so this term never affects a _single_ car's build — it only breaks ties **between**
cars (bounded to ±`CHASSIS_COMPARE_SWING` points), which is exactly where a car's fixed layout earns its
place. Low confidence, and disclosed as such (cars without balance data fall back to a neutral 50/50).

## Tuning heuristics (`tuning.ts`)

Every value is clamped/snapped to the car's legal `TuneRanges`, so output is always in-game-valid.

| Section                   | Heuristic                                                                                                                                                                                                                                                  | Expected effect                                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Tire pressure**         | Cold-menu baseline by surface and compound, then a small axle-load correction. Drag lowers the **driven** axle and raises the free axle (RWD/FWD/AWD aware); drift keeps the tested ~2.5 bar front / ~1.5 bar rear baseline.                               | Correct construction/surface starting point; launch footprint and drift side bite without one universal pressure.   |
| **Gearing**               | Every non-drift mode scales from the car's stock speed, built power, limiter and power peak. Dirt/rally/cross-country no longer chase fixed speeds. Drift anchors 3rd/4th with wheelspin reserve.                                                          | Post-shift RPM stays in the useful band; telemetry limiter share supplies the correction.                           |
| **Alignment**             | Low camber, near-zero toe and about 6.5–7° caster for grip modes; almost zero camber for drag/top speed. Drift retains -2.5°/-0.3°, -1.0°/+0.5° and maximum caster.                                                                                        | Avoids scrub and exaggerated FH6 camber loss while preserving wheel self-centering.                                 |
| **Anti-roll bars**        | Moderate tarmac baseline; very soft loose-surface bars; axle-load, drivetrain and style balance corrections. Drag uses driven-axle load-transfer profiles; drift remains very soft with front slightly stiffer.                                            | Keeps independent travel on rough surfaces and changes balance without defaulting to unstable competitive extremes. |
| **Springs + ride height** | `k = (2πf)²·m_cornerSprung` with discipline-specific frequency. Road is controlled, rally is softer/higher, cross-country has maximum travel, drag follows driven-axle transfer, and drift targets roughly the tested 62/50 N/mm relationship on the RX-7. | Uses real mass and legal per-car ranges; prevents both impossible values and generic one-height setups.             |
| **Damping**               | Rebound controls chassis motion; bump is substantially softer. Loose modes use especially low bump and slightly softer rear rebound. Drag is drivetrain-specific; drift retains high rebound/low bump.                                                     | Lets the tire follow the road while controlling weight transfer instead of making rough-surface cars harsh.         |
| **Aero**                  | Road/street use front-biased downforce and only enough rear for stability; loose modes use less; drag/top speed start at minimum.                                                                                                                          | Front grip without excessive rear-induced understeer or unnecessary drag.                                           |
| **Brakes**                | Grip modes start around the FH6 48–50% neutral region, with lower pressure on loose surfaces. Drift keeps ~75% front / ~55% force.                                                                                                                         | Stable threshold braking and discipline-appropriate wheel control.                                                  |
| **Differential**          | Explicit FWD/RWD/AWD tables for every discipline. Road uses moderate accel/low coast, loose modes stronger lock, drag high accel/low coast, drift 95/85 rear with rear-biased AWD.                                                                         | Correct driven-axle behavior instead of applying an RWD assumption to every car.                                    |

### Simplifications (documented, for honesty)

- Tuning-category unlocks are coarse (e.g., any race transmission unlocks full gearing; sport-vs-race
  final-drive-only granularity is not modelled).
- Different race/rally/drift differentials are treated equivalently for the _tune_; the discipline drives
  the diff values, not which diff part.
- Tire radius uses a default (0.33 m) unless a car provides more detail; gearing is the least precise
  area and a prime candidate for feedback-driven refinement. The first RX-7 capture now anchors the wheelspin reserve.

## Symptom-based adjustments (`symptoms.ts`)

A curated table maps a handling complaint → an **ordered, smallest-safe-first** list of changes with a
one-line rationale (e.g., understeer-on-exit → reduce diff accel lock, then soften front ARB, then add front aero
(or reduce rear aero)). Condition modifiers (controller / wheel / wet) add global notes. These are guidance layered
on the baseline — applying one is the user's choice and never rewrites the baseline tune.

## Telemetry diagnosis — closing the loop (`diagnose.ts`)

`diagnoseTelemetry(summary, discipline, drivetrain)` turns a **recorded session** into a diagnosis: it reads what the car actually
did — the mean front-vs-rear slip balance (`understeerIndex`), per-wheel combined slip, limiter time, tire temperatures and suspension travel — and maps it to
the matching `SYMPTOMS` entry. Driven-wheel slip follows FWD/RWD/AWD instead of assuming the rear axle; it then surfaces that symptom's smallest-safe-first fixes. So the loop runs
model → drive → measure → concrete tune fix, instead of the user guessing which complaint applies.
Thresholds live in `TELEMETRY_DIAGNOSIS` and are **heuristic / low confidence** (FH6's slip units aren't
documented) — flagged as such in the UI, and a prime target for calibration once real captures are
gathered. Like symptoms, findings are advice: they never change a tune on their own.

**Capture pipeline.** `npm run capture` builds the web app and runs the bridge (`apps/bridge`), which
listens for FH6 Data Out UDP (127.0.0.1:20440, **Car Dash** = 324 B) and streams decoded frames to the
served app over WebSocket. The parser (`apps/bridge/src/parser.ts`) handles the FH6 layout — CarGroup /
Smashable fields shift the dash base to 244, so driver inputs land at bytes 315/316/319 — and falls back
to FH5 / Sled. In the Telemetry panel, **Record → Stop & summarize → Export session** downloads a
self-describing `fh6-session` JSON: the build (car, discipline, parts, tune, estimated PI, score) plus the
measured summary, diagnosis and downsampled frames. That paired _(build → measured behaviour)_ record is
exactly what's needed to calibrate the low-confidence heuristics against reality.

## Determinism & tests

- Pure functions, integer/float math only, no time/random.
- `packages/engine/test` covers: stock-PI anchoring, range-legality across disciplines, determinism, PI
  cap boundary, stock-over-cap infeasibility, disallowed categories, AWD conversion, engine swap, no-aero,
  budget, locked parts, and drag/drift/dirt discipline behaviour.
