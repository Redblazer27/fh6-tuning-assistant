# Product Specification

## Purpose

Help a Forza Horizon 6 player go from **car + goal + constraints** to **the exact parts to buy, a legal
build at/under a PI cap, a complete in-game tune, and clear guidance** — with honest confidence and a way
to report real results. A real optimization system, not a generic "AI tune" page.

## Users

- **Casual players** who want a fast, trustworthy base build + tune for an event.
- **Tuners/competitors** who want constraint-aware optimization, transparent scoring, lock & re-optimize,
  and a feedback/telemetry loop.

## Platform

Responsive **web app / installable PWA**. Deterministic engine runs client-side (works offline). Permanent
share links are URL-encoded (no server). Distributed as **downloadable self-contained releases** (bundled
with a local telemetry bridge, no Node required to run) and, optionally, a hosted GitHub Pages build. See
the repo [README](../README.md).

## Feature requirements → where they live

| Requirement | Implementation |
| --- | --- |
| Car picker (year/make/model, DLC, class, drivetrain, stats) | `apps/web` car picker over `@fh6/data` |
| Goal wizard (10 disciplines, target class/PI, controller/wheel, constraints) | `apps/web` wizard → `BuildRequest` |
| Constraints: no swaps, preferred engine/drivetrain, budget, stock-looking, no aero, allow/deny parts | `BuildConstraints` → optimizer + rules engine |
| Exact parts to buy across all categories | `partLines()` per strategy |
| Legal build at/under PI cap | optimizer + `checkLegality` + estimated PI |
| Full tune in FH6 menu order, copyable/checklist | `computeTune` → tune panel |
| Multiple ranked strategies, transparent scoring | `generateBuild` (grip/balanced/speed) + `ScoreBreakdown` |
| Lock choices & re-optimize | `locks` argument to `generateBuild` |
| Symptom-based adjustments (smallest safe first) | `SYMPTOMS` + condition modifiers |
| Feedback: lap times, event/route, symptoms, telemetry — refine without changing baseline | feedback panel + `Feedback` schema; suggestions only |
| Save/share (permanent URL) + JSON export | `codec.ts` (URL) + `BuildExport` |
| Confidence, assumptions, game/data version, disclaimer | `GenerateResult` trust surface on every result |
| Admin/import to expand & correct data | `loadDataset` + import UI (validated by Zod) |
| Live FH6 telemetry | `apps/bridge` UDP→WS + in-app visualization |

## Data model (versioned; per-record `source` + `confidence` + `dataVersion`)

`GameVersion`, `Source`, `Car`, `Part` (+ `PartEffects`), `TuneRanges`, `Feedback`, assembled into a
validated `Dataset`. See [`packages/data/src/schemas.ts`](../packages/data/src/schemas.ts) and the
[data policy](data-policy.md).

## Architecture

- `packages/shared` — enums, units, tune/build types, share/export codec.
- `packages/data` — Zod schemas + versioned seed + validated, indexed store.
- `packages/engine` — pure deterministic PI/rules/optimizer/tuning/symptoms.
- `apps/web` — React + Vite PWA (UI only; all math delegated to the engine).
- `apps/bridge` — Node UDP→WebSocket telemetry companion + local static server.

The **engine is fully separated from the UI** and has no framework imports. AI may *explain* results in
the UI, but never produces the numbers.

## UX flow

1. Pick a car. 2. Goal wizard (discipline → target class/PI → input → constraints). 3. Review ranked
strategies (parts + PI + score + cost). 4. Open a strategy: parts checklist + tune in FH6 order (copyable).
5. Adjust via symptoms. 6. Save/share/export. 7. Optionally connect telemetry / log feedback.

## Non-goals (MVP)

- Full 550-car dataset (curated seed + import instead).
- Hosted accounts/backend (stateless share links + local storage instead).
- Claiming a single universally "best" tune (optimize for the stated goal; explain trade-offs).

## Roadmap after MVP

Per-car tune-range overrides; richer part catalog with per-car effects; feedback-driven coefficient
calibration; larger telemetry analytics; optional hosted backend for shared feedback aggregation.
