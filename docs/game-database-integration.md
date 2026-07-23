# FH6 game-database integration

The tuner’s primary data source is the locally extracted FH6 database at Steam build `24241019`. The source database contains already-parsed game tables; this project does not decrypt assets or extract keys.

## Regenerating

Place the database beside this repository as `../FH6-Database`, then run:

```powershell
npm run data:import-game
```

A different location can be supplied directly:

```powershell
node --experimental-strip-types scripts/import-game-database.mjs --database=C:\path\to\FH6-Database
```

Use `--check` to read and report counts without rewriting generated data. The importer writes the compact generated artifact `packages/data/src/seed/game-database.json` and its typed wrapper. Generated data is committed so the web app remains standalone and offline-capable.

## Imported coverage

- 651 drivable game cars with exact PI, drivetrain, mass, front weight distribution, power, torque, redline, ratings, tire dimensions, ride height, gearing count and top speed where populated.
- 660 combustion engines and 19 motors.
- 151 engine-swap definitions and exact per-car swap allowlists, prices and mass changes.
- Exact drivetrain conversions from `List_UpgradeDrivetrain`; `PowertrainId` directly determines FWD/RWD/AWD placement families.
- 14,912 purchasable per-engine upgrade rows across intake, manifold, fuel, ignition, exhaust, camshaft, valves, displacement, pistons/compression, intercooler, oil cooling, flywheel, restrictor plates, turbo families and superchargers.
- Forced-induction family, progression tier and anti-lag (`OffThrottleMomentInertia > 0`) are represented separately.
- 1,390 physics settings and 651 per-car spring/damper/anti-roll range envelopes.

Power scalars come from the game row itself. Camshaft power/redline/peak RPM and power-delivery smoothness are derived from the referenced full-throttle torque curve. An engine option absent from the active engine’s menu is treated as unavailable, including after a swap.

## Merge precedence

Game-file values always win. Existing official/community records only fill fields absent from the game data, currently ownership/DLC labels, stock tire-compound labels, wheelbase hints and descriptive body-kit names. The generated car matcher strongly preserves the tuner’s curated stable IDs; unmatched special/non-removable game cars receive deterministic game-derived IDs.

The optimizer uses the stock engine’s exact menu normally and switches to a selected swap engine’s exact menu when a swap is explicitly chosen. Generated builds are sanitized through `buildSpec`, so an unsupported candidate can never appear in the final parts list.
