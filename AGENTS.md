# AGENTS.md — handoff notes for continuing this project

This file exists because work on this project has been moving between AI assistants
(Claude Code, now handing off to Codex due to usage limits). It captures context that
would otherwise only live in Claude's private memory — read it before starting work.
Update it when you finish a chunk of work so the next agent (human or AI) isn't
starting cold. Treat this as living state, not a one-time note.

For the project itself (what it is, how to run it, folder layout), read `README.md`
first, then `PROGRESS.md` (status log) and `docs/tuning-engine-design.md` (the
vehicle-dynamics heuristics). This file is the **narrative** on top of those: why
things are the way they are, what was just done, and what's next.

## Working agreements (carried over — please keep following these)

- **Never push to the remote without the user explicitly asking.** All work so far has
  been committed locally to `main` and left unpushed for the user to review.
- Run `npm run check` (format:check + lint + typecheck + test) before considering any
  change done. It must stay green — 95 tests as of this writing.
- Also run `npm run build` (web) after touching `apps/web` or shared types.
- Don't add scope beyond what's asked. Several backlog items below were deliberately
  **not** "fixed" because the evidence said the existing behavior was already correct
  — don't force a change just because an item is on a list.
- Commit messages: conventional-commit style (`feat(scope): ...`, `fix(scope): ...`),
  body explains _why_, ends with a co-author trailer for whichever assistant made the
  change. Look at `git log` for the exact style.
- This is a solo project (one user, `Redblazer27`), git history is linear on `main`.

## Where things stand (as of 2026-07-23, commit `cf3cebf`)

Recent commits, newest first:

```
cf3cebf fix(engine): gate base rotary/electric engines from piston-only upgrades
05db63e feat(engine,web): expert-calibrated drift model (tune, scoring, metric units)
412bfd3 fix(engine): drift builds pick drift springs/diff; telemetry diagnosis is discipline-aware
8273b4a feat(bridge,web): real telemetry capture — one-command bridge + contextual session export
```

The last several sessions have been driven by **real user feedback**: the user drove a
1992 Mazda RX-7 Type R drift build in-game, sent back a critique, and then had the
assistant study three FH6 drift-tuning YouTube guides to get an expert-grade model of
how drift tuning actually works (rather than guessing). That knowledge is now baked
into the engine. Full detail below so you don't have to re-derive it.

## Domain knowledge: FH6 data model

- **Class bands are FH6-specific, not FH5:** D 100-400, C 401-500, B 501-600,
  A 601-700, S1 701-800, S2 801-900, **R 901-999** (no X class). Lives in
  `packages/shared/src/enums.ts` (`CLASS_LETTERS`, `CLASS_PI_RANGE`). Derived
  empirically from the official 627-car list; zero overlaps.
- **Roster source:** `https://forza.net/fh6cars` is server-rendered (static
  `<table>`), parsed deterministically by `scripts/import-forza-roster.mjs` into
  `packages/data/src/seed/roster-cars.ts` (~620 cars). Gives identity/class/PI/DLC
  only — **no physics**.
- **Physics is optional** on the car schema. Unknown physics is left absent, never
  fabricated. `resolveEffectiveCar` (engine) fills class-based defaults at build time
  and marks such builds low confidence.
- **Fandom wiki (forza.fandom.com) is the authoritative secondary source** (user's
  explicit call — more reliable than forza.net on discrepancies). Reachable via its
  MediaWiki API even though raw page scraping 403s:
  `GET forza.fandom.com/api.php?action=query&prop=revisions&rvslots=main&rvprop=content&titles=A|B|...`
  (batch 50 titles/call), enumerated via
  `list=categorymembers&cmtitle=Category:Cars (FH6)`. `{{CarInfobox}}` has physics;
  `{{CarConversions|eng/drive/asp}}` has the `|fh6 =` line for swap/drivetrain/
  aspiration options. **Infobox `type` = production/race, NOT engine type** — detect
  rotary/electric from the `engine` field text.
- `scripts/import-fh6-data.mjs` is wiki-primary and regenerates:
  `seed/roster-cars.ts` (623 cars, 622 with real physics), `seed/car-upgrade-profiles-fandom.ts`
  (603 profiles), `seed/engines-catalog.ts` (~65 swap engines).
- **Swap engines** are `engine_swap` parts with a `setsPowerHp` effect (replaces base
  power) + `setsAspiration`, opt-in per car via `availableEngineSwapIds` on the car's
  upgrade profile (`getAvailablePartsByCategory` in `packages/data/src/loaders.ts`).
- **Per-car upgrade variation** = `carUpgradeProfileSchema`: `engineType`
  (piston/rotary/electric/hybrid), swap allowlists, locked categories, restricted
  parts. The ~17 hand-authored cars (`cars.ts`) get profiles via a hand-verified
  `CURATED_PROFILES` id map in the importer (fuzzy matching alone picks wrong car
  generations).
- **Parts catalog** (`packages/data/src/seed/parts.ts`): 32 upgrade categories, every
  part has a `rationale` string (physics + reason, shown in the UI under each part;
  per-part override or a category default in `packages/data/src/part-physics.ts`).
- **Telemetry diagnosis loop** (`packages/engine/src/diagnose.ts`): reads a recorded
  session's `TelemetrySummary` and maps it to a `SYMPTOMS` entry via
  `TELEMETRY_DIAGNOSIS` thresholds (heuristic/low-confidence — FH6 slip units aren't
  documented; this is the prime calibration target if more real telemetry comes in).
  Advice only, never auto-changes a tune.

## Domain knowledge: optimizer + scoring model

`packages/engine/src/optimizer.ts` is a **hybrid**:

- **Exact path** when the product of multi-candidate category counts ≤
  `EXACT_THRESHOLD` (150k): enumerates every legal combination, returns the certified
  optimum. Common case for a constrained goal (target class, locked categories).
- **Heuristic path** otherwise: multi-start (stock / max-all / one engine-swap start)
  coordinate ascent + 2-opt.
- `bruteForceOptimize` is an exported oracle; `optimizeSelection` is tested to match
  it exactly on small spaces. Fast eval via an `Agg` state that **must mirror
  `buildSpec.ts`'s per-part logic exactly** — any new field added to `BuiltSpec` needs
  a matching field threaded through `Agg`/`initAgg`/`applyPart`/`deriveFromAgg` in
  `optimizer.ts`, or the fast path silently diverges from the real one. This has bitten
  us before; check it whenever you touch `buildSpec.ts`.

Scoring (`packages/engine/src/scoring.ts` + `constants.ts`) has **8 metrics**: accel,
grip, braking, launch, topSpeed, `balance` (`DRIVETRAIN_FIT[discipline][drivetrain]`),
`setupFit` = `0.4·TIRE_FIT + 0.2·SUSPENSION_FIT + 0.2·DIFF_FIT + 0.2·TRANSMISSION_FIT`,
and `powerFit` (drift-only power-band plateau, see below). `BuiltSpec` carries
`suspensionTier`/`diffTier`/`transmissionTier`/`tireCompound` so these can be scored.
Weights per discipline sum to ~1 (`SCORE_WEIGHTS` in `constants.ts`).

Car comparison (`packages/engine/src/compare.ts`, `compareCars`): ranks multiple cars
for one goal by building each and scoring it, plus a bounded weight-distribution term
(`chassisBalanceFit` vs `WEIGHT_BALANCE_IDEAL`) and, for drift specifically, a
wheelbase term (`wheelbaseDriftFit`, only active when `car.wheelbaseMm` is present —
which is rare right now; see the nerdyderg section, this is NOT currently backed by
real per-car data for most cars).

## Domain knowledge: how FH6 drift tuning actually works

This is ground truth distilled from three FH6 drift-tuning YouTube guides the user
had studied specifically to calibrate the drift model (previously the tuning engine
was guessing). **If you need to touch drift tuning, read this before changing
anything — it's hard-won and the current code already reflects it.**

- Video 1 = "How To Build A Drift Car In FH6 – Step By Step" (Audi RS4 Avant style,
  high power, drift-tire philosophy).
- **Video 2 = "The Only FH6 DRIFT TUNING Guide…" — this is the designated authority.**
  Wheel-focused, mid-power (400-600hp), "grip = control" philosophy (JZX100 Chaser).
- Video 3 = "Your FH6 Drift Tunes Are Holding You Back" — smooth/tandem style, fills
  gaps video 2 didn't cover well (R33).

Where the three disagree, **video 2 wins**; videos 1 and 3 only fill in what video 2
didn't cover (this was an explicit user instruction — don't silently re-weight this).

**The app is wheel-only.** Controller-specific tuning branches were deliberately
removed (`input` defaults to `'wheel'` everywhere) per explicit user instruction
("we're not going to need controller parts, I play on wheel").

Two unchangeable **car-choice** stats that matter most for drift (this is why the
nerdyderg data below is valuable — most cars don't have real values for these yet):

- **Weight distribution (front %):** lower = grippier + snappier. Sweet spot 50-56%
  front. >56% = slidey; mid-engine (~42%) becomes an over-rotating pendulum.
- **Wheelbase:** long = slower/smoother/easier; short (AE86, BRZ-style) = snappy, fast
  transitions. **Not modeled with real data for most cars** — `wheelbaseMm` is on the
  car schema but rarely populated.

**Build consensus:** front-engine RWD (AWD is only for drift-zone _points_, not real
drifting) · race brakes (unlocks tuning) · drift suspension (steering lock) · race
6-speed transmission (unlocks gear tuning — 3rd/4th become the drift gears, 5th/6th
stay for cruising) · minimal/no aero · skip chassis reinforcement to stay light.
Differential: video 2 prefers **rally** diff (~95/85, smoother grip loss) over a fully
locked drift diff.

**Engine philosophy — "max everything" is only one valid style, and it's the wrong
one for drift control:** video 2 explicitly avoids big turbos (laggy, sudden grip
loss — small turbo is better), avoids cams (unrealistic 10k rpm), and **keeps the
stock flywheel** (holds RPM/boost through clutch/handbrake/braking — counterintuitive
but deliberate). Mid power (400-600hp) beats max power for drift. This is why the
engine has a `powerFit` metric (`DRIFT_POWER_BAND` 350-650hp) that penalizes
over-powering a drift build instead of just maximizing accel/topSpeed.

**Tires:** video 2 uses **street tires** as the drift baseline (not drift-compound
tires!) — tune the grip in elsewhere. Realistic width 225-235 front / 245-265 rear.
Smaller rims (17-18") give more sidewall deformation = more "side bite" (grip while
sliding, which FH6 actually models).

**Slider-by-slider (video 2's model, implemented in `packages/engine/src/tuning.ts`,
`computeTune` and its per-section helpers, all gated on `discipline === 'drift'`):**

- Tire pressure: front ~2.5 bar, rear ~1.5 bar (lower rear = more grip/side bite —
  this is the main grip knob).
- Camber: front ~-2.5°, rear ~-0.3° (FH6 over-exaggerates camber ~4x; near-zero rear
  is what gives rear grip, not more negative).
- Toe: front OUT ~-1° (fakes the positive Ackermann FH6 doesn't model, for stability),
  rear IN ~+0.5° (forward bite/drive).
- Caster: maxed (self-steer + grip, no downside on a wheel).
- ARBs: very soft (~7.5 front / ~5 rear — front a touch stiffer for turn-in, soft rear
  for grip). This was corrected downward once already (video 3 + video 2's own
  numbers both wanted ~5-7, not the ~15 first shipped) — if you're tempted to stiffen
  these for a wheel, don't, that was already tried and reverted.
- Springs: front stiffer than rear, realistic values, ride-height **rake with the rear
  LOWER than the front** (loads/settles the rear for grip — opposite of most other
  disciplines' rake).
- Damping: high rebound (front ~11, rear ~17 — counterintuitively, stiff rebound
  _feels_ softer because it slows extension), low bump (front ~7, rear ~4).
- Brakes: ~75% front bias, ~55% force (also corrected downward once — first shipped at
  68%/95%, too strong; both later videos wanted less force).
- Differential: ~95% accel / ~85% decel lock.
- **Gearing: does NOT target a fixed top speed for drift.** It raises the final drive
  and anchors 4th gear's redline speed to a power-scaled drift speed (`vDrift4` in
  `computeGearing`) so 3rd/4th sit in the powerband at drift speeds and never bounce
  off the rev limiter mid-slide. This was the single biggest fix — the original
  RX-7 feedback was "rev-limiter at ~109 km/h" because gearing was chasing an
  unrelated top-speed target.

Metric units: the web app now defaults to metric display (bar / kgf·mm / cm), with a
toggle persisted to `localStorage['fh6-units']`. This is display-layer only
(`apps/web/src/lib/format.ts`), not engine — the engine still computes internally in
whatever unit the car's `TuneRanges` declare.

**Backlog status (original 7-item user critique + follow-ons found while implementing):**

1. ✅ Fixed — rotary/electric base-engine gate (see next section, this was the very
   last commit).
2. Not modeled as literal FI tiers (Sport/Race/Anti-lag) — deliberately, because
   video 2's own reference car (Chaser) is turbo, so penalizing turbo _aspiration_
   would contradict the authority video. The drift-harmful case (over-powering via a
   huge turbo) is instead caught by `powerFit`. If real FI tiers are wanted later,
   that's a data-catalog expansion, not a drift-correctness fix.
3. ✅ Fixed — `TRANSMISSION_FIT` in `constants.ts`, drift strongly prefers race trans.
4. Deliberately not forced — videos 2 _and_ 3 both say tire width barely matters for
   drift ("don't max it out"). Left grip-driven. Could add a widebody→wider-rear
   coupling on request, but it's not backed by the guides.
5. ✅ Fixed — metric unit toggle (see above).
6. Investigated, not a real bug — chassis reinforcement and weight reduction aren't
   contradictory (you can stiffen and lighten independently), and the guides disagree
   on ideal weight (video 1 wants light, video 3 wants heavy = smooth), so no rule was
   added. Verified generated drift builds pick moderate options either way.
7. ✅ Fixed — full tune rewrite (all bullets above).

## Domain knowledge: rotary/electric engine gate (the fix in `cf3cebf`)

A stock **rotary** engine (e.g. the RX-7's 13B) has no camshaft, valves, pistons, or
adjustable displacement — but the engine was previously letting those piston-only
upgrade parts add power anyway, over-modeling the car. Fixed via
`baseEngineAllows(engineType, hasRealSwap, part)` in `packages/engine/src/buildSpec.ts`:
blocks `camshaft`/`valves`/`pistons_compression`/`displacement` on a rotary, and all
combustion + forced-induction/aspiration parts on an electric motor — but **only when
no real engine swap is fitted** (a swap keeps its own separate `engineUpgrades` gate,
unaffected). Mirrored in the optimizer's `Agg` fast-eval path (`baseEngineType` field)
— remember the mirroring rule above. `engineType` is read from
`store.getUpgradeProfile(car.id)?.engineType`, defaulting to `'piston'`.

Tested in `packages/engine/test/engine-core.test.ts` (`describe('base-engine
platform gate (rotary)')`) against `1990-mazda-savanna-rx-7` (a curated rotary car)
plus a piston control car, to make sure the gate is engine-type-specific and doesn't
accidentally block piston cars.

## Active thread: forza.nerdyderg.com data (NOT YET INTEGRATED — likely next task)

The user found **https://forza.nerdyderg.com/** ("Nova's Autoshow", a fan-made,
wiki-sourced, manually-curated FH6 car database) and asked for it to be scraped and
studied. That's done (see below); **wiring it into the app's data has not been done
yet** — this is very likely what the user wants next.

**How to get the data:** every page on the site (`index.html`, `swaps.html`,
`map.html` — the "Engine Map" bipartite engine↔car graph) loads one JSON file:
`https://forza.nerdyderg.com/cars.json` (~2.1 MB, not behind auth/JS-rendering, just
`fetch` it — no scraping tricks needed). Only other endpoints are
`/api/announcement` and `/api/analytics` (irrelevant).

**Top-level shape:** `{ cars: [...619], engine_swaps: {...151 engines}, car_types:
{...63}, skill_perks: {...175}, make_countries: {...88}, seasonal_series: {...3} }`.

**Per-car fields worth importing** (all 619 cars have these): `id`, `year`, `make`,
`model`, `pi`, `drivetrain`, **`weight_dist_front`** (front weight %, present for
ALL 619 cars, range 33-66 avg 51.1 — **this is the single most valuable field**, see
why below), `displacement`/`max_displacement`, `power_hp`/`max_power_hp`,
`torque_ftlb`/`max_torque_ftlb`, `weight_lb`, `engine_name`, `stock_engine_id` (126
cars), `engine_swaps` (list of available swap-engine ids, 568 cars),
`tire_width_{front,rear}_{min,max}` (104 cars), `body_kits` (36 cars),
`has_forza_aero`/`has_removable_wing` (61 cars).

**Per-engine fields** (151 engines, keyed by ids like `1_3l_r2_tt`): `game_name`
(e.g. "1.3L R2-TT" — **use this field, not `real_name`, to detect engine type** —
`real_name` is the real-world engine name and can contain misleading substrings like
"R4" meaning German inline-4, not rotary), `real_name` (e.g. "13B-REW"),
`donor_car_name`/`donor_car_id`, `in_game` (current|legacy), `power_hp`/
`max_power_hp`, `displacement`/`max_displacement`, `not_upgradeable`.

**Engine type breakdown** (detected via `game_name` matching `/rotor/i` or `\bR[234]\b`
for rotary, `hybrid` for hybrid, null displacement + "motor/bhp" wording for electric):
140 piston, 5 rotary, 3 electric, 3 hybrid.

- Rotary: `1_3l_r2_tt` (13B-REW), `1_3l_2_rotor` (13B-MSP), `2_0l_r3` (R20B RENESIS),
  `2_0_r3_t` (20B), `2_6l_4rotor_787b` (R26B). **Every single one has
  `max_displacement == displacement`** — i.e. real-world confirmation that rotaries
  can't be bored out, which is exactly the assumption the rotary gate (`cf3cebf`,
  above) is built on. Good validation, worth citing if you extend that gate.
- Electric: `1893bhp_motor`, `235bhp_motor`, `670bhp_race_motor` (displacement null).
- Hybrid: `6_3l_v12_hybrid` (Ferrari F140 FE), `3_5l_tt_hybrid` (NSX JNC1),
  `4_6l_v8_hybrid` (Porsche 918 M18.00).
- Cars with a rotary stock engine (5): the FD RX-8 (`#399 Formula Drift`), the 1991
  787B, the Furai concept, the **1992 RX-7 Type R** (this is the exact car the whole
  drift-tuning investigation started from), and the 2011 RX-8 R3.
- Cars with an electric stock engine (2): Rimac Nevera, Porsche Mission R.

**Why this data matters — concrete integration ideas, none implemented yet:**

1. **`weight_dist_front` for all 619 cars.** The app currently only has real weight
   distribution for a handful of hand-curated cars; everything else falls back to a
   neutral 50% default in `resolveEffectiveCar` (`packages/engine/src/effectiveCar.ts`).
   Per the drift-tuning knowledge above, weight distribution is one of the two most
   important _car-choice_ stats for drift, and it's currently invisible for ~600 of
   619 cars. Importing this field would make `chassisBalanceFit`/car-comparison and
   the drift `WEIGHT_BALANCE_IDEAL` scoring meaningfully more accurate instead of
   mostly running on the neutral default.
2. **Authoritative rotary/electric/hybrid tagging** for `engineType` on car upgrade
   profiles — more complete than what's currently inferred from the Fandom wiki
   import (see `fh6-data-model` knowledge above; ~110 cars there have no
   `CarConversions` data at all).
3. **`max_power_hp`/`max_displacement`** (both per-car and per-engine) as real
   upgrade ceilings, instead of the current generic multiplier-based power model.
4. **`engine_swaps` per car** might be a more complete/accurate source of which swaps
   a car can take than the current Fandom-derived `availableEngineSwapIds`.
5. **`tire_width` ranges** (104 cars) and **`body_kits`** (36 cars) for the
   widebody/tire-width modeling mentioned in backlog item #4 above (currently
   deliberately not forced, but if it's revisited, this data would back it).

**The hard part: matching car identities.** nerdyderg ids look like
`1992_mazda_rx_7_type_r` (underscores); the app's ids look like
`1990-mazda-savanna-rx-7` (hyphens, and sometimes a materially different name/year
for what's arguably "the same car" — note the year mismatch in that exact example).
A robust matcher will need to normalize punctuation and fuzzy-match on
make/model/year, similar to what `scripts/import-fh6-data.mjs`'s `CURATED_PROFILES`
map already does by hand for the ~17 core cars (see `fh6-data-model` knowledge
above) — don't assume a naive slug transform will line them up 1:1. Given this is
**community data** (unlike the official forza.net roster or even the Fandom wiki),
treat any imported field as `confidence: 'medium'` at best, sourced accordingly in
`packages/data/src/seed/sources.ts` conventions.

**Suggested approach if you pick this up:** write a new `scripts/import-nerdyderg-data.mjs`
following the pattern of the existing `scripts/import-fh6-data.mjs` /
`scripts/import-forza-roster.mjs` (fetch → parse → match to existing car ids → merge
in as a supplementary source, don't overwrite fields that already have `high`
confidence from the official roster). Start with just `weight_dist_front` (item 1
above) since it's the highest-value, lowest-risk field — it only fills gaps, never
contradicts an existing high-confidence value.

## Dev environment notes

- Windows machine. Node 22 (see `.nvmrc`)/npm workspaces. `git`, `gh` (authenticated)
  available. PowerShell is more reliable than the bundled bash on this machine (bash
  has intermittent `fork: retry: Resource temporarily unavailable` failures unrelated
  to the project — if you hit that, prefer PowerShell or Node scripts directly).
- Root scripts (`npm run <name>`, see `package.json`): `dev`, `build`, `build:bridge`,
  `bridge`, `test`, `test:watch`, `coverage`, `lint`, `lint:fix`, `format`,
  `format:check`, `typecheck`, `check` (the full gate), `package:release`.
- The repo root has some **untracked** (not gitignored, just never `git add`ed)
  distribution artifacts: `RUN.txt`, `context/`, `web/` (a packaged release bundle —
  built PWA + docs), and `fh6-bridge.exe` (this one IS gitignored, via the `*.exe`
  rule). They show up in every `git status`; leave them alone unless asked — they
  aren't source and aren't meant to be committed, but they're also not cleanup debt
  to worry about.
