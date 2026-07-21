# FH6 Tuning Assistant

A **real optimization and tuning system** for **Forza Horizon 6** — not a generic "AI-generated tune" page.

Pick a car, an activity (road, street, dirt, rally, cross-country, drag, drift, top speed, PR stunts,
custom route), a target class/PI, and your constraints. The app returns:

1. **The exact parts to buy** across every upgrade category.
2. **A legal build** that lands at or below your requested PI/class.
3. **A complete in-game tune** in FH6 menu order (tires, gearing, alignment, ARBs, springs, damping,
   aero, brakes, differential).
4. **Trade-off explanations** and **symptom-based adjustments** ("I understeer on corner exit", "rear
   steps out under braking") that recommend the smallest safe change first.
5. **Confidence, assumptions, game/data version**, and a way to report real in-game results.

It is powered by a **deterministic vehicle-dynamics engine** (documented heuristics, fully unit-tested),
a **build optimizer + PI/rules engine**, and **versioned data with per-record source & confidence**.
An optional **local telemetry bridge** ingests FH6's "Data Out" UDP feed.

> **Disclaimer.** In-game handling depends on game updates, DLC, balance patches, difficulty/assists,
> your controller or wheel setup, route/surface/weather conditions, and driver technique. Estimated PI
> is an approximation (shown as `±N`), never an exact figure. See [`docs/data-policy.md`](docs/data-policy.md).

---

## Three ways to use it

### 1. Download a release (no install, no Node required) — recommended for players

Grab the latest build from the repository's **Releases** page, unzip the file for your OS, and run the
`fh6-bridge` executable. It starts a small local server (and the FH6 telemetry listener) and prints a
`http://localhost:...` URL — open it in your browser for the full app **plus live telemetry**.

### 2. Open the hosted web build (zero download) — browser only

The app is also published to **GitHub Pages** (see the repo's Pages URL). This gives you the full tuning
assistant in the browser; live telemetry is only available with the downloadable bridge (option 1).

### 3. Develop it — Codespaces or local

- **GitHub Codespaces:** open the repo in a Codespace (Node is preinstalled). Run `npm run dev`.
- **Local:** install **Node.js 20 LTS** (<https://nodejs.org>), then:
  ```bash
  npm install
  npm run dev        # web app at http://localhost:5173
  npm run bridge     # optional: telemetry bridge + local app server
  ```

---

## Enabling FH6 telemetry ("Data Out")

In Forza Horizon 6: **Settings → HUD and Gameplay → DATA OUT**

- Data Out: **On**
- Data Out IP Address: **127.0.0.1**
- Data Out IP Port: **20440**

Then run the bridge (option 1 or `npm run bridge`). Data begins sending as soon as you start driving.
The feed is one-way UDP (the game only sends; it never receives), so this cannot affect your game.

---

## Project structure

```
packages/
  shared/   Types, units, build-state URL encode/decode, JSON export schema
  data/     Zod schemas + versioned seed data (cars, parts, tune ranges, sources, game version)
  engine/   PURE deterministic engine: PI/rules, build optimizer, tuning engine, symptom rules
apps/
  web/      React + Vite PWA (car picker, goal wizard, strategies, tune output, telemetry, share)
  bridge/   Node UDP->WebSocket telemetry companion + FH6 packet parser + CSV recorder + local server
docs/       Product spec, competitor research, data policy, tuning-engine design
```

The **engine is completely separated from the UI** and has no framework dependencies. It is deterministic:
the same inputs always produce the same build and tune. All calculations are traceable — no black-box LLM
is used as a numerical authority.

## Scripts

| Command                   | What it does                                                         |
| ------------------------- | -------------------------------------------------------------------- |
| `npm run dev`             | Start the web app (Vite dev server)                                  |
| `npm run build`           | Build the web PWA to `apps/web/dist`                                 |
| `npm run bridge`          | Run the telemetry bridge + local app server                          |
| `npm test`                | Run the full Vitest suite                                            |
| `npm run coverage`        | Tests with coverage                                                  |
| `npm run lint`            | ESLint                                                               |
| `npm run typecheck`       | TypeScript type check (no emit)                                      |
| `npm run format`          | Prettier write                                                       |
| `npm run check`           | format check + lint + typecheck + test                               |
| `npm run package:release` | Build downloadable standalone bundles (used by the release workflow) |

## Data & accuracy

FH6 is a live game; cars, parts, and PI change with updates and DLC. This project treats all of that as
**versioned data**. Every record carries a **source** and a **confidence** level (`high` = official,
`medium` = reputable community, `low` = inferred). Seed data is a small, clearly-labelled starter set;
use the in-app **Admin / Import** tools to expand and correct it. See
[`docs/data-policy.md`](docs/data-policy.md).

## Reporting in-game results

Use the **Feedback** panel to log lap times, event/route, surface, handling symptoms, and telemetry
observations against a saved build. Feedback is used to _suggest_ refinements — it never silently changes
your baseline tune. Exports are portable JSON.

## License

TBD by the repository owner.
