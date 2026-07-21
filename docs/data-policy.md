# Data & Confidence Policy

This document governs **how we source, label, and use data** in the FH6 Tuning Assistant. It exists so
we never present uncertain data as exact, and so any value can be traced, questioned, and corrected.

## Principles

1. **Everything is versioned.** FH6 is a live game — cars, parts, PI, and balance change with updates
   and DLC. All data is tied to a `dataVersion` (e.g. `fh6-2026.07-seed`) and a `GameVersion`. When the
   game patches, we bump the version and record what changed.
2. **Official first.** Prefer official Forza / Xbox sources for car availability and game facts. Use
   reputable community data only where official data is incomplete — and label it.
3. **Every record carries provenance.** `source`, `confidence`, and `dataVersion` are required on cars,
   parts, and tune ranges. No anonymous numbers.
4. **Never fake precision.** Estimated PI is always shown as `±N` and never called exact. Model-derived
   values (tune numbers, PI deltas) are labelled as heuristics, not measurements.
5. **Correctable by design.** The data model and the in-app Admin/Import tools let anyone fix a value and
   re-cite its source. Feedback refines recommendations without silently changing a baseline tune.

## Confidence levels

| Level    | Meaning                              | Typical source                                        |
| -------- | ------------------------------------ | ----------------------------------------------------- |
| `high`   | Official, authoritative              | forza.net car list, Forza Support Data Out docs       |
| `medium` | Reputable community, cross-checkable | Forza Wiki (Fandom), established tuning guides        |
| `low`    | Inferred / modelled by this app      | our physics & PI model, generic part-effect estimates |

**Overall confidence** shown to the user is the _lowest_ confidence among the inputs that produced a
result (a build using `low`-confidence part estimates is reported as `low`, even if the car is `medium`).

## Sources (seed)

See [`packages/data/src/seed/sources.ts`](../packages/data/src/seed/sources.ts). Summary:

- **forza.net/fh6cars** — official car list (`high`). Authoritative for availability, make/model/year, DLC.
- **Forza Support — Data Out docs** (`high`) — authoritative for telemetry packet layout & enablement.
- **Forza Wiki (Fandom)** (`medium`) — community roster + stats where official data is incomplete.
- **Community tuning guides** (`medium`) — consensus for tunable ranges & part behaviour (sanity checks,
  not exact numbers).
- **Inferred model** (`low`) — values our own PI/physics model estimates.

## What is fact vs. model

- **Game facts (data package):** which cars exist, their make/model/year/DLC, stock drivetrain, stock
  class, and — at medium/low confidence pending in-game verification — stock stats, mass, power, and the
  tunable slider ranges. These live in `packages/data` with provenance.
- **Model parameters (engine):** tire-compound grip indices, ride-frequency targets, damping ratios, PI
  delta coefficients, scoring weights. These are **heuristics**, documented in
  [`tuning-engine-design.md`](tuning-engine-design.md), and live in `packages/engine/src/constants.ts`.
  They are not presented as game facts.

## The estimated-PI stance

FH6's exact PI formula is proprietary. We do **not** guess an absolute PI. Instead we **anchor to the
car's known stock PI** (a data fact) and model only the _delta_ from the parts you add. A stock build
therefore estimates exactly the stock PI; an upgraded build estimates `stockPI + Δ`, always shown with a
`±` band and a confidence label. This is honest, testable, and easy to correct as real data arrives.

## Seed-data limitations (current)

- The roster is the **full official FH6 car list** (~620 cars, imported deterministically from
  forza.net/fh6cars by `scripts/import-forza-roster.mjs`) plus ~17 hand-curated cars with real
  physics. Roster cars carry authoritative identity/class/PI/DLC (high) but **no physics** — mass,
  power, drivetrain, and aspiration are filled with generic class-based defaults at build time, so
  their builds are labelled **low confidence** until real specs are imported. Enrich via Admin/Import.
- Stock stats / PI for seed cars are **estimates** (medium/low). Cross-check against official data and
  correct.
- Part effect magnitudes are generic estimates (`medium`/`low`), not per-car measured values.
- Tunable slider ranges are generous community-consensus templates; add per-car overrides when known.
- Telemetry packet byte offsets are implemented from the official doc and validated against real
  captures; treat as `medium` until a capture is confirmed for your game version.

## Change process

1. Edit data via Admin/Import (or the seed files) with a cited source and confidence.
2. If the game patched, bump `dataVersion` in `packages/data/src/seed/version.ts` and note the change.
3. Re-run the test suite (`npm test`) — integrity checks validate provenance and PI/class consistency.
4. Record what was verified/assumed in [`PROGRESS.md`](../PROGRESS.md).
