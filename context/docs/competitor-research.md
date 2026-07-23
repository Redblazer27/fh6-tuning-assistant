# Competitor Research

Research date: 2026-07-21. Game: **Forza Horizon 6** (released 2026-05-19; 550+ cars).

## Landscape

| Tool | Type | Cost | What it does | Key limitations |
| --- | --- | --- | --- | --- |
| [ForzaTune Pro](https://forzatune.com/) | iOS/Android app | Free + ~$6 Pro | Formula-based base tunes (suspension, gearing) from a few inputs; drift/drag/rally/off-road modes; save tunes; gamepad/wheel aware. Updated for FH6; 17M+ tunes made. | Assumes you already built the car — **no parts/PI build optimizer**; mobile-first; tunes are "a good baseline, still need tweaking"; no constraints engine; no feedback/telemetry loop; closed formulas. |
| [QuickTune](https://forzaquicktune.com/legacy/) | App | Freemium | Advanced calculator recommended by top players; fine gearing control. | Same core gap: tunes only, not builds; no PI-legality or constraints; limited transparency. |
| ForzaTuner (web) | Web | Free | Generates setups by class/style; account save; community tune browsing; multi-title. | "Good baseline requiring tweaking"; depends on manual updates for new cars; no build optimizer; no constraint/PI engine. |
| [Forza tuning guides](https://forzatune.com/guide/the-fully-updated-forza-tuning-guide/), forza.guide, sim-racing setups | Guides/DBs | Free | Explain what each setting does; some per-car shared tunes. | Static knowledge, not a solver; no personalization to your car+goal+constraints; no legality checks. |
| In-game "share tune" + creator hubs | In-game/community | Free | Download other players' tunes by share code. | No optimization, no explanation, quality varies, no PI/constraint targeting for *your* build. |

### Sources
- ForzaTune — https://forzatune.com/ , https://forzatune.com/free-calculator-app/
- QuickTune — https://forzaquicktune.com/legacy/
- Roundup — https://simracingsetup.com/forza/best-forza-horizon-5-car-tuning-calculators/
- FH6 tuning guide — https://forzatune.com/guide/the-fully-updated-forza-tuning-guide/ , https://forza.guide/
- Official car list — https://forza.net/fh6cars
- FH6 Data Out (telemetry) — https://support.forza.net/hc/en-us/articles/51744149102611-Forza-Horizon-6-Data-Out-Documentation

## Useful ideas worth adopting

- **Minimal-input base tunes in seconds** (ForzaTune's core strength) — keep our path to a result short.
- **Discipline modes** (road/drift/drag/rally/off-road) with different formulas — we generalize this.
- **Gamepad vs wheel** awareness — we fold this into alignment/brakes and the symptom guidance.
- **Save & share** tunes — we do permanent URLs + JSON export.
- **Good tuning explainers** — we go further with per-setting rationale and symptom-first fixes.

## The gap — where every competitor stops (our opportunities)

1. **Build optimization, not just tuning.** No mainstream tool tells you **which parts to buy** to hit a
   **PI/class cap** for your goal. We optimize the whole build (parts → legal PI) *and* produce the tune.
2. **Constraints engine.** None enforce "no swaps", "no aero", "stock-looking", a **credit budget**,
   preferred engine/drivetrain, or allowed/disallowed parts. We do, as first-class inputs.
3. **Multiple ranked strategies with transparent scoring.** Competitors give one answer. We generate
   grip / balanced / speed builds and **show the score breakdown** so the choice is explainable.
4. **Lock & re-optimize.** Lock the parts you like; we re-optimize the rest around them.
5. **Symptom-first adjustments.** "I understeer on exit" → the **smallest safe change first**, escalating
   only if needed — instead of a wall of theory.
6. **Feedback + live telemetry loop.** Log lap times/symptoms, or stream FH6 **Data Out** UDP telemetry,
   and get *suggested* refinements — without silently changing your baseline.
7. **Versioned data with confidence labels.** We never present uncertain data as exact, and ship
   Admin/Import tools so data can be corrected as the game patches — a trust advantage over black-box apps.
8. **Deterministic, traceable engine.** Every number comes from a documented heuristic, not an opaque
   formula or an LLM. This is auditable and improvable.

## Non-goals (for now)

- Scraping/So mirroring competitors' proprietary formulas.
- Claiming a single "best tune" — we optimize for the stated goal and explain the trade-offs.
- Being a full leaderboard/social platform — we focus on the build+tune+feedback core.
