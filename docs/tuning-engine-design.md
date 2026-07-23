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

Seven metrics normalized 0..1 (accel = pw; grip = mechanical grip + aero bonus; braking; launch;
top-speed = power; **balance** = the drivetrain's fit for the goal, `DRIVETRAIN_FIT[discipline][drivetrain]`;
**setupFit** = how well the discipline-variant parts fit the goal), weighted per discipline (`SCORE_WEIGHTS`)
and tilted per strategy (`STRATEGY_TILT`), re-normalized to sum 1. Total is `Σ normalized·weight·100`.
`setupFit` blends three part choices — tire compound (`TIRE_FIT`, half), springs/dampers (`SUSPENSION_FIT`,
a quarter) and differential (`DIFF_FIT`, a quarter) — so a **drift** build scores well only with drift
tires, drift springs **and** a drift diff, even though a race setup grips harder in the raw metrics; loose
surfaces likewise pull rally/off-road parts. `balance` and `setupFit` encode the decisions the raw numbers
miss or get wrong, so the optimizer only takes a drivetrain swap or a non-grippiest variant part when it
suits the goal (`launch` is kept low where AWD shouldn't be rewarded just for launching, and `grip` is
trimmed where `setupFit` must pull parts off the grippiest race options). On tarmac the race parts win on
both grip and fit, so `setupFit` just reinforces. The full breakdown is returned and shown, so ranking is
never a black box.

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

| Section                   | Heuristic                                                                                                                                                                                                          | Expected effect                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| **Tire pressure**         | Warm-target base per surface (tarmac 29 psi, dirt 26, snow 25); ± small bias to the heavier axle; drag lowers front/raises rear; drift uses about 2.5 bar front / 1.5 bar rear; top-speed raises both.             | Grip near target temp; compliance on loose surfaces; launch/stability tilt per discipline. |
| **Gearing**               | Non-drift builds use the top-speed/redline model. Drift uses the game-file limiter RPM and targets 3rd/4th wheel speeds with explicit wheelspin reserve; it never chases a fixed top speed.                        | Keeps 3rd/4th in the powerband without limiter bounce; requires race transmission.         |
| **Alignment**             | Camber negative by surface (less for drag/top-speed, more for slicks); small front toe-out for turn-in, rear toe-in for stability; wheel drift uses about -2.5°/-0.3° camber, -1.0°/+0.5° toe, and maximum caster. | Cornering contact & responsive but stable steering.                                        |
| **Anti-roll bars**        | Base stiffness fraction per surface, scaled to axle weight, then biased for balance (FWD stiffen rear, RWD stiffen front, style shifts rotation); drift is very soft at roughly 7.5 front / 5 rear.                | Primary handling-balance tool; stiffer rear = more rotation.                               |
| **Springs + ride height** | Rate from **ride frequency**: `k = (2πf)²·m_cornerSprung` (tarmac ~2.2/2.35 Hz F/R, dirt ~1.5, drift stiffer front); ride height low for grip/aero, high for dirt, slight rake.                                    | Balanced body control tuned to each corner's sprung mass.                                  |
| **Damping**               | From a target **damping ratio** as a fraction of the slider range (tarmac rebound 0.6, dirt 0.42); bump = 0.7×rebound; rear ~5% firmer.                                                                            | Controlled, planted body motion; softer on loose surfaces.                                 |
| **Aero**                  | Downforce level per discipline (road high, drag/top-speed zero); front balanced to weight distribution, slightly less to avoid understeer; clamped to the installed wing's capability.                             | More grip vs. more drag trade-off; `null` when no aero.                                    |
| **Brakes**                | Balance ~50% ± weight-distribution bias; pressure follows the discipline; drift uses about 75% front bias / 55% pressure.                                                                                          | Stable braking, fewer lock-ups on a pad.                                                   |
| **Differential**          | Per drivetrain: RWD accel 40 (road)→95 (drift), decel 15–40; FWD low accel to cut understeer; AWD center 20–40% front + per-axle accel/decel; style shifts accel ±5.                                               | Corner-exit traction & braking stability tuned to the goal.                                |

### Simplifications (documented, for honesty)

- Tuning-category unlocks are coarse (e.g., any race transmission unlocks full gearing; sport-vs-race
  final-drive-only granularity is not modelled).
- Different race/rally/drift differentials are treated equivalently for the _tune_; the discipline drives
  the diff values, not which diff part.
- Tire radius uses a default (0.33 m) unless a car provides more detail; gearing is the least precise
  area and a prime candidate for feedback-driven refinement. The first RX-7 capture now anchors the wheelspin reserve.

## Symptom-based adjustments (`symptoms.ts`)

A curated table maps a handling complaint → an **ordered, smallest-safe-first** list of changes with a
one-line rationale (e.g., understeer-on-exit → reduce diff accel lock, then soften front ARB, then trim
front aero). Condition modifiers (controller / wheel / wet) add global notes. These are guidance layered
on the baseline — applying one is the user's choice and never rewrites the baseline tune.

## Telemetry diagnosis — closing the loop (`diagnose.ts`)

`diagnoseTelemetry(summary)` turns a **recorded session** into a diagnosis: it reads what the car actually
did — the mean front-vs-rear slip balance (`understeerIndex`) and per-wheel combined slip — and maps it to
the matching `SYMPTOMS` entry, surfacing that symptom's smallest-safe-first fixes. So the loop runs
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
