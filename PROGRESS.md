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
- **`packages/data`:** Zod schemas for the full versioned model; curated seed (17 cars, part catalog,
  tune-range template, sources, game version) with per-record source + confidence; loader with schema +
  referential-integrity validation; indexed store. Tests: seed loads, integrity failures, store indexing.
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

## Verified (via GitHub Actions CI — green)

- Repo pushed to **github.com/Redblazer27/fh6-tuning-assistant** (private, `main`).
- CI run passes: **lint ✓, typecheck ✓, all 54 tests ✓, web build ✓** (`.github/workflows/ci.yml`).
  This machine has no Node.js, so CI is the source of truth for build/test.
- `format:check` is currently **non-blocking** (no local Prettier pass yet). Run `npm run format` in a
  Codespace/with Node, commit, then flip the CI step back to blocking (remove `continue-on-error`).

## Not yet verified

- The **release packaging** (`scripts/package-release.mjs` → standalone executables via pkg) is
  CI-targeted and unproven until a version tag (`v*`) is pushed to trigger `release.yml`.
- GitHub Pages deploy is manual-only and needs Pages enabled (private-repo constraint).

## Assumed / needs real-world validation

- **Game facts:** FH6 released 2026-05-19; Data Out UDP on 127.0.0.1:20440. Sourced official + community.
- **Estimated PI:** stock-anchored delta model; coefficients are inferred (low confidence), shown ±N.
- **Tuning heuristics:** documented in `docs/tuning-engine-design.md`; validated against community
  consensus, not yet against live in-game telemetry.
- **Seed car/part data:** community-sourced (Fandom), medium/low confidence, per-record labelled.
- **Telemetry packet offsets:** implemented from the documented Dash layout + FH6 additions; validate
  against a real capture for the current game version.

## Next steps

1. Run `npm install && npm run check` (or let CI do it); fix any compile/test failures.
2. Confirm the GitHub repo name, push, verify CI green, and cut a `v0.1.0` release to test packaging.
3. Capture a real FH6 Data Out packet to confirm telemetry offsets; correct if needed.
4. Expand the roster and add per-car tune-range overrides via Admin/Import.

## Known constraints / risks

- Browsers can't read UDP → live telemetry requires the local bridge companion (shipped).
- Exact FH6 PI formula & some tune units are not public → modelled transparently with confidence labels.
- Seed is a curated starter set, not the full 550+ roster.
