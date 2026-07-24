# PROGRESS

Living status log. Categories: **Verified** (built + tested/run), **Assumed** (built on stated
heuristics/data, needs real-world validation), **Missing**, **Next**.

Last updated: 2026-07-24

---

## Built (code complete)

- **Monorepo + tooling:** npm workspaces, strict TS, ESLint (flat) + Prettier, Vitest, devcontainer,
  GitHub Actions (CI, Pages deploy, downloadable Release), README, `.gitignore`, git initialized.
- **`packages/shared`:** enums/units, tune & build types, transparent scoring types, isomorphic
  share/export codec, telemetry frame + session summary. Tests: codec round-trip, class mapping, units.
- **`packages/data`:** Zod schemas for the full versioned model; loader with schema +
  referential-integrity validation; indexed store. Tests: seed loads, integrity failures, store indexing.
  - **Roster:** the **full official FH6 car list (~620 cars)** imported deterministically from
    forza.net/fh6cars (`scripts/import-forza-roster.mjs`, `seed/roster-cars.ts`) plus ~17 hand-curated
    cars with real physics. Roster cars carry official identity/class/PI/DLC only.
  - **Per-car upgrade profiles** (`carUpgradeProfileSchema`): engine type, engine/drivetrain swap
    allowlists, locked categories, restricted parts — so rotary/hypercar/limited-swap cars differ from
    the global catalog. The optimizer draws candidates from the car-aware catalog.
  - **Optional physics:** cars may omit mass/power/drivetrain/aspiration; the engine's
    `resolveEffectiveCar` fills class-based defaults at build time and labels those builds low
    confidence. FH6 class bands corrected to D..R (were FH5-era D..X).
- **`packages/engine` (pure, deterministic):** buildSpec, stock-anchored estimated PI, constraints/rules
  engine, coordinate-ascent build optimizer, full vehicle-dynamics tuning engine, symptom rules,
  transparent scoring, `generateBuild` orchestration. Tests: PI anchoring, range-legality, determinism,
  PI-cap boundary, stock-over-cap, disallowed categories, AWD conversion, engine swap, no-aero, budget,
  locked parts, drag/drift/dirt behaviour, and 8 end-to-end journeys.
- **`apps/web` (React + Vite PWA):** car picker, goal wizard (10 disciplines + constraints), ranked
  strategies, parts editor with lock & re-optimize, tune panel in FH6 order (copyable) with rationale +
  unlock state, symptom guidance, feedback log, live telemetry tab, admin import/export, trust surface,
  permanent share URL + JSON export, localStorage persistence.
- **`apps/bridge` (Node):** UDP→WebSocket telemetry bridge with FH6 packet parser (FH5 fallback), CSV
  recorder, and a local static server that hosts the web app. Test: packet parser against synthetic
  FH6/FH5 packets.
- **Release packaging:** `scripts/package-release.mjs` compiles the bridge to standalone executables
  (win/mac/linux) bundled with the web app.
- **Docs:** data-policy, competitor-research, product-spec, tuning-engine-design.

## Verified

- Repo pushed to **github.com/Redblazer27/fh6-tuning-assistant** (private, `main`).
- CI run passes: **lint ✓, typecheck ✓, all 54 tests ✓, web build ✓** (`.github/workflows/ci.yml`).
- **Local (Node 24 now installed on this machine):** `npm install` + full `npm run check`
  (format ✓, lint ✓, typecheck ✓, 54 tests ✓) pass; `npm run build` (web PWA) and the bridge esbuild
  bundle both build. A real Prettier pass was applied and committed.
- `format:check` is now **blocking** in CI (`continue-on-error` removed). Distribution artifacts
  (`web/`, `context/`, `RUN.txt`) are excluded via `.prettierignore` + eslint `ignores`.
- **Bridge runtime verified end-to-end:** ran the bundle and the standalone exe; HTTP serves the app
  (`/`, assets, SPA fallback, `/health`); a synthetic FH6 UDP packet flows UDP → parser → WebSocket to
  a client with all fields correct (`frames` 0→1). See scratchpad `e2e-telemetry.mjs`.
- **Release packaging verified locally & fixed:** `@yao-pkg/pkg-fetch` (v3.6+) dropped Node 20 prebuilt
  bases, so the old `node20-*` pkg targets 404 and fall back to an impossible cross-platform source
  build — this would have broken `release.yml`. Switched targets to **`node22-*`**; pkg now fetches
  prebuilt bases and produces working **win / linux / macos** executables (win exe run & re-passed the
  e2e telemetry test). The `zip` step remains CI-only (present on GitHub's ubuntu runners).

## Not yet verified

- The **release packaging** now works locally (see Verified), but a full `release.yml` run — including
  the `zip` step and GitHub Release upload — is unproven until a version tag (`v*`) is pushed.
- GitHub Pages deploy is manual-only and needs Pages enabled (private-repo constraint).
- No committed `package-lock.json` yet, so CI still uses `npm install` (not `npm ci`) and no npm cache.

## Assumed / needs real-world validation

- **Game facts:** FH6 released 2026-05-19; Data Out UDP on 127.0.0.1:20440. Sourced official + community.
- **Estimated PI:** stock-anchored delta model; coefficients are inferred (low confidence), shown ±N.
- **Tuning heuristics:** documented in `docs/tuning-engine-design.md`; validated against community
  consensus, not yet against live in-game telemetry.
- **Seed car/part data:** community-sourced (Fandom), medium/low confidence, per-record labelled.
- **Telemetry packet offsets:** implemented from the documented Dash layout + FH6 additions; validate
  against a real capture for the current game version.

## Next steps

1. ~~Run `npm install && npm run check`~~ — done locally, green. Commit the fixes (prettier pass,
   eslint/prettier ignores, `node22` pkg targets, blocking `format:check`) and push.
2. Cut a `v0.1.0` tag to trigger `release.yml` and confirm the full CI packaging + Release upload
   (the `zip` + GitHub Release steps are the only unproven part now).
3. Capture a real FH6 Data Out packet to confirm telemetry offsets; correct if needed.
4. Expand the roster and add per-car tune-range overrides via Admin/Import.
5. (Optional) Commit `package-lock.json` and switch CI to `npm ci` + npm cache for reproducible builds.

## Known constraints / risks

- Browsers can't read UDP → live telemetry requires the local bridge companion (shipped).
- Exact FH6 PI formula & some tune units are not public → modelled transparently with confidence labels.
- Roster is complete (~637 cars) but **physics for the ~620 official cars is estimated** (class-based
  defaults, low confidence) — real mass/power/drivetrain/aspiration and per-car upgrade/swap data are
  not bulk-available (Fandom blocks scraping; community DBs are JS-rendered). Enrich via Admin/Import,
  community sources, or in-game capture. A few official cars may near-duplicate curated ones.

## 2026-07-23 — authoritative game database integrated

- Replaced the community/wiki-primary runtime seed with a deterministic import from the extracted FH6 game database, Steam build `24241019`. Game data now wins every conflict; community data only fills ownership, tire-compound, wheelbase and descriptive body-kit gaps.
- Runtime coverage: 651 cars, 660 engines, 19 motors, 151 swap engines, 6 drivetrain-conversion families, 14,912 purchasable engine-option rows, 1,390 physics settings and 651 per-car suspension range envelopes.
- Added exact active-engine compatibility and effects. Camshaft torque curves provide power/redline/peak RPM/smoothness; FI rows preserve single/twin/quad/supercharger family, progression and anti-lag. Explicit engine/drivetrain choices are now actually forced.
- Removed the inaccurate broad rotary gate from game-backed cars. The game rows prove rotary camshaft upgrades exist; each rotary now follows its own menu.
- The optimizer uses stock-engine candidates by default and a chosen swap engine’s menu when explicitly selected. Final selections are sanitized by `buildSpec` so unsupported parts cannot leak into recommendations.
- Added `npm run data:import-game`, compact generated JSON, source documentation and PWA precache support for the offline database.
- Verification: format, ESLint, TypeScript and 97 tests pass; production PWA build passes. The bundle is intentionally ~4.82 MB uncompressed (~435 KB gzip) because the full offline engine-option database is included.

The old “community-sourced seed / estimated physics for ~620 cars” notes above are historical and superseded by this section. Remaining inferred areas are the PI delta model and tuning heuristics themselves, not the underlying stock car/engine/compatibility data.

## 2026-07-23 — first real RX-7 drift session calibrated

- Replayed the user's 5,968-frame 1992 RX-7 session. The old setup reached the 10,000-rpm limiter around 102 km/h in 3rd and 109 km/h in 4th, with rear slip/temperature far above the front.
- Fixed game engine composition: non-cam torque scalars combine additively around the cam torque curve. The exact installed build now predicts 327.95 kW and 1,133.2 kg versus the measured 331 kW and 1,126 kg.
- Imported exact per-car platform compatibility, mass changes, and prices for brakes, suspension, ARBs, weight reduction, tires, clutch, transmission, driveline, differential and rim size.
- Corrected metric springs from an erroneous kgf/mm display to FH6's N/mm. The RX-7 baseline is now shown as about 58/47 N/mm, not 5.8/4.7.
- Drift gearing now uses `TorqueCurveMaxRPM` (the packet-confirmed 10,000-rpm limiter) and wheelspin reserve. The tested setup changed from final/3rd/4th `4.89/2.16/1.73` to `4.11/2.09/1.64`, roughly 20% taller overall.
- Drift builds now enforce the authority-guide hardware baseline where available: race brakes/transmission/ARBs/driveline, drift suspension, rally diff, street tires, stock flywheel/chassis/aero/body.
- FH6 packet parsing now captures actual class/PI, drivetrain and cylinder/rotor fields. Session summaries include limiter share and tire temperatures; drift diagnosis flags gearing-limiter and rear-overheat evidence.
- Recalibrated the still-inferred PI delta coefficients from the observed A-class result: the exact build estimates A 692 instead of S1 781. This is provisional until exact PI from a new capture is available.

## 2026-07-24 — tuning research applied across every discipline

- Reworked the full tune generator, not only drift: cold tire pressures now account for surface, compound and drivetrain; drag pressure/load-transfer settings follow the actual driven axle.
- Removed fixed rally/dirt/cross-country speed targets. Gearing now uses each car's game-file limiter and power peak, built power and stock-speed baseline; telemetry can report a concrete too-short-gearing symptom.
- Added discipline-specific alignment, ARB, spring/ride-height, damping, aero, brake and FWD/RWD/AWD differential profiles. Loose modes gain compliant low-bump suspension and travel; road modes use modest camber, near-zero toe, 6.5–7° caster and front-biased aero.
- Applied the Series-2 drag-tire correction: drag tires keep launch benefit but lose road-cornering value, and road/street scoring strongly rejects them.
- Drift scoring now includes engine controllability, penalizing maximum flywheel/camshaft/boost tiers; its tested pressure/alignment/diff/gearing behavior remains intact and the RX-7 spring baseline is back near the measured 62/50 N/mm relationship.
- Corrected inverted symptom advice (aero, rear pressure, coast lock, bottoming) and made telemetry drive-axle aware, with limiter, temperature and suspension-travel evidence.
- Added cross-discipline and telemetry regression coverage. Current suite: 110 tests.
