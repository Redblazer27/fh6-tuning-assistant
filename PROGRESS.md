# PROGRESS

Living status log. Categories: **Verified** (built + tested/run), **Assumed** (built on stated
heuristics/data, needs real-world validation), **Missing**, **Next**.

Last updated: 2026-07-21

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
