import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cars as curatedCars } from '../packages/data/src/seed/cars.ts';
import { rosterCars } from '../packages/data/src/seed/roster-cars.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dbArg = process.argv.find((arg) => arg.startsWith('--database='));
const databaseRoot = resolve(
  dbArg?.slice('--database='.length) ?? join(repoRoot, '..', 'FH6-Database'),
);
const exportRoot = join(databaseRoot, 'exports', 'json');
const gameRoot = join(databaseRoot, 'raw_data', 'raw_tables', 'gamedb');
const wrapperPath = join(repoRoot, 'packages', 'data', 'src', 'seed', 'game-database.ts');
const outputPath = join(repoRoot, 'packages', 'data', 'src', 'seed', 'game-database.json');
const checkOnly = process.argv.includes('--check');

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const readExport = (name) => readJson(join(exportRoot, `${name}.json`));
const readGame = (name) => readJson(join(gameRoot, `${name}.json`));
const round = (value, digits = 4) => Number(Number(value).toFixed(digits));
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const slug = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const normalized = (value) =>
  slug(value)
    .replace(/mercedes-(benz|amg)/g, 'mercedes')
    .replace(/chevy/g, 'chevrolet')
    .replace(/aston-martin/g, 'aston')
    .replace(/alfa-romeo/g, 'alfa')
    .replace(/volkswagen/g, 'vw');
const tokens = (value) =>
  new Set(
    normalized(value)
      .split('-')
      .filter((token) => token.length > 1 && !/^\d{2,4}$/.test(token)),
  );
const jaccard = (left, right) => {
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap += 1;
  return overlap / (left.size + right.size - overlap || 1);
};
const classForPi = (pi) =>
  pi <= 400
    ? 'D'
    : pi <= 500
      ? 'C'
      : pi <= 600
        ? 'B'
        : pi <= 700
          ? 'A'
          : pi <= 800
            ? 'S1'
            : pi <= 900
              ? 'S2'
              : 'R';
const drivetrain = (value) => (value === 'FWD' || value === 'AWD' ? value : 'RWD');
const aspiration = (value) => {
  const text = String(value ?? '').toLowerCase();
  if (text.includes('quad')) return 'quad_turbo';
  if (text.includes('twin')) return 'twin_turbo';
  if (text.includes('turbo')) return 'turbo';
  if (text.includes('centrif')) return 'centrifugal';
  if (text.includes('super')) return 'supercharged';
  return 'NA';
};
const cylinderCount = (value) => Number(String(value ?? '').match(/\d+/)?.[0]) || undefined;

const [
  cars,
  rawCars,
  manufacturers,
  engines,
  carEngines,
  motors,
  carMotors,
  physicsSettings,
  drivetrainConversions,
  springRows,
  arbRows,
  torqueCurves,
] = await Promise.all([
  readExport('cars'),
  readGame('Data_Car'),
  readExport('manufacturers'),
  readExport('engines'),
  readExport('car_engines'),
  readExport('motors'),
  readExport('car_motors'),
  readExport('physics_settings'),
  readGame('List_UpgradeDrivetrain'),
  readGame('List_SpringDamperPhysics'),
  readGame('List_AntiSwayPhysics'),
  readGame('List_TorqueCurve'),
]);

const makeById = new Map(manufacturers.map((make) => [make.id, make.name]));
const rawCarById = new Map(rawCars.map((car) => [car.Id, car]));
const engineById = new Map(engines.map((engine) => [engine.id, engine]));
const motorById = new Map(motors.map((motor) => [motor.id, motor]));
const curveById = new Map(torqueCurves.map((curve) => [curve.TorqueCurveID, curve]));
const stockEngineByCar = new Map(
  carEngines.filter((link) => link.stock_engine).map((link) => [link.car_id, link.engine_id]),
);
const stockMotorByCar = new Map(
  carMotors.filter((link) => link.stock_motor).map((link) => [link.car_id, link.motor_id]),
);
const stockCarByEngine = new Map(
  carEngines
    .filter((link) => link.stock_engine)
    .map((link) => [link.engine_id, rawCarById.get(link.car_id)]),
);

const oldCars = [
  ...curatedCars.map((car) => ({ ...car, curated: true })),
  ...rosterCars.map((car) => ({ ...car, curated: false })),
];
const pairs = [];
for (const gameCar of cars) {
  const make = makeById.get(gameCar.manufacturer_id) ?? gameCar.make_code;
  for (const old of oldCars) {
    const yearDistance = Math.abs(old.year - gameCar.year);
    if (yearDistance > 2) continue;
    const makeMatch = normalized(old.make) === normalized(make) ? 1 : 0;
    const modelScore = Math.max(
      jaccard(tokens(old.model), tokens(gameCar.model)),
      jaccard(tokens(old.name), tokens(gameCar.model_short)),
    );
    if (!makeMatch && modelScore < 0.5) continue;
    const piDistance = Math.abs(old.stockPI - gameCar.performance_index);
    const score =
      (yearDistance === 0 ? 8 : 5 - yearDistance) +
      makeMatch * 5 +
      modelScore * 8 +
      Math.max(0, 3 - piDistance / 20) +
      (old.curated ? 100 : 0);
    pairs.push({ score, gameId: gameCar.id, oldId: old.id, old });
  }
}
pairs.sort((a, b) => b.score - a.score || a.gameId - b.gameId || a.oldId.localeCompare(b.oldId));
const oldByGameId = new Map();
const usedOldIds = new Set();
for (const pair of pairs) {
  if (oldByGameId.has(pair.gameId) || usedOldIds.has(pair.oldId)) continue;
  oldByGameId.set(pair.gameId, pair.old);
  usedOldIds.add(pair.oldId);
}

const curveStats = (curveId, redline) => {
  const curve = curveById.get(curveId);
  if (!curve) return {};
  let peakPowerHp = 0;
  let peakPowerRpm = 0;
  let peakTorqueNm = 0;
  const bandTorques = [];
  const count = Math.min(curve.NumTorqueValues ?? 0, 246);
  for (let index = 0; index < count; index += 1) {
    const torque = Number(curve[`v${index}`]) * Number(curve.TorqueScale);
    const rpm = index * 100;
    if (!Number.isFinite(torque) || torque < 0) continue;
    const power = (torque * rpm) / 7127;
    if (power > peakPowerHp) {
      peakPowerHp = power;
      peakPowerRpm = rpm;
    }
    peakTorqueNm = Math.max(peakTorqueNm, torque);
    if (rpm >= redline * 0.4 && rpm <= redline * 0.9) bandTorques.push(torque);
  }
  const mean = bandTorques.reduce((sum, value) => sum + value, 0) / (bandTorques.length || 1);
  const variance =
    bandTorques.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (bandTorques.length || 1);
  return {
    powerHp: round(peakPowerHp, 2),
    powerPeakRpm: peakPowerRpm,
    torqueNm: round(peakTorqueNm, 2),
    smoothness: round(clamp(1 - Math.sqrt(variance) / (mean || 1), 0, 1), 4),
  };
};

const tableDefinitions = [
  ['List_UpgradeEngineCamshaft', 'camshaft'],
  ['List_UpgradeEngineCSC', 'forced_induction', 'centrifugal'],
  ['List_UpgradeEngineDisplacement', 'displacement'],
  ['List_UpgradeEngineDSC', 'forced_induction', 'supercharged'],
  ['List_UpgradeEngineExhaust', 'exhaust'],
  ['List_UpgradeEngineFlywheel', 'flywheel'],
  ['List_UpgradeEngineFuelSystem', 'fuel_system'],
  ['List_UpgradeEngineIgnition', 'ignition'],
  ['List_UpgradeEngineIntake', 'intake'],
  ['List_UpgradeEngineIntercooler', 'intercooler'],
  ['List_UpgradeEngineManifold', 'intake_manifold'],
  ['List_UpgradeEngineOilCooling', 'oil_cooling'],
  ['List_UpgradeEnginePistonsCompression', 'pistons_compression'],
  ['List_UpgradeEngineRestrictorPlate', 'restrictor_plate'],
  ['List_UpgradeEngineTurboQuad', 'forced_induction', 'quad_turbo'],
  ['List_UpgradeEngineTurboSingle', 'forced_induction', 'turbo'],
  ['List_UpgradeEngineTurboTwin', 'forced_induction', 'twin_turbo'],
  ['List_UpgradeEngineValves', 'valves'],
];
const tableData = new Map();
for (const [table] of tableDefinitions) tableData.set(table, await readGame(table));

const stockCamByEngine = new Map(
  tableData
    .get('List_UpgradeEngineCamshaft')
    .filter((row) => row.IsStock)
    .map((row) => [row.EngineID, row]),
);
const engineBaseStats = new Map();
for (const engine of engines) {
  const stockCar = stockCarByEngine.get(engine.id);
  const stockCam = stockCamByEngine.get(engine.id);
  const curve = stockCam ? curveStats(stockCam.TorqueCurveFullThrottleID, stockCam.RedlineRPM) : {};
  engineBaseStats.set(engine.id, {
    powerHp: stockCar ? round((stockCar.SimPeakPower * 0.1) / 0.745699872, 2) : curve.powerHp,
    torqueNm: stockCar ? round(stockCar.SimPeakTorque * 100, 2) : curve.torqueNm,
    redlineRpm: stockCam?.RedlineRPM ?? engine.redline,
    powerPeakRpm: stockCar ? round(stockCar.SimPeakAngVel * 9.549296596, 0) : curve.powerPeakRpm,
    smoothness: curve.smoothness,
  });
}

const tierForLevel = (level, antiLag) =>
  antiLag ? 'race_anti_lag' : level <= 1 ? 'street' : level === 2 ? 'sport' : 'race';
const genericPartsById = new Map();
const specsByEngine = new Map();
const addSpec = (engineId, spec) => {
  const list = specsByEngine.get(engineId) ?? [];
  if (!list.some((item) => item.partId === spec.partId)) list.push(spec);
  specsByEngine.set(engineId, list);
};
for (const [table, category, forcedAspiration] of tableDefinitions) {
  const rows = tableData.get(table);
  const stockByEngine = new Map(
    rows.filter((row) => row.IsStock).map((row) => [row.EngineID, row]),
  );
  for (const row of rows.filter((item) => !item.IsStock)) {
    const antiLag = Number(row.OffThrottleMomentInertia) > 0;
    const variant = forcedAspiration ? `-${forcedAspiration}` : '';
    const partId = `game-${slug(table.replace('List_UpgradeEngine', ''))}${variant}-l${row.Level}${antiLag ? '-anti-lag' : ''}`;
    const tier = tierForLevel(row.Level, antiLag);
    genericPartsById.set(partId, {
      id: partId,
      category,
      name: `${tier.replaceAll('_', ' ')} ${table
        .replace('List_UpgradeEngine', '')
        .replace(/([A-Z])/g, ' $1')
        .trim()}`,
      tierRank: Math.max(1, row.Level),
      tier,
      effects: {},
      unlocks: [],
      setsAspiration: forcedAspiration,
      cost: 0,
      source: 'fh6-game-files',
      confidence: 'high',
      dataVersion: 'fh6-steam-24241019',
      rationale: `Exact ${table} option; effects and price are selected from the active engine row.`,
    });
    const stock = stockByEngine.get(row.EngineID);
    const effects = {};
    const scalar = row.TorqueScale ?? row.MaxScaleScale;
    const stockScalar = stock?.TorqueScale ?? stock?.MaxScaleScale ?? 1;
    if (Number.isFinite(scalar) && scalar > 0)
      effects.powerMultiplier = round(scalar / stockScalar, 6);
    if (category === 'forced_induction' && Number.isFinite(row.MaxScale)) {
      const allStockForced = tableDefinitions
        .filter((definition) => definition[1] === 'forced_induction')
        .flatMap((definition) => tableData.get(definition[0]))
        .find((candidate) => candidate.EngineID === row.EngineID && candidate.IsStock);
      effects.powerMultiplier = round(row.MaxScale / (allStockForced?.MaxScale ?? 1), 6);
    }
    if (table === 'List_UpgradeEngineCamshaft') {
      const candidate = curveStats(row.TorqueCurveFullThrottleID, row.RedlineRPM);
      const baseline = stock
        ? curveStats(stock.TorqueCurveFullThrottleID, stock.RedlineRPM)
        : engineBaseStats.get(row.EngineID);
      if (candidate.powerHp && baseline?.powerHp)
        effects.powerMultiplier = round(candidate.powerHp / baseline.powerHp, 6);
      if (row.RedlineRPM) effects.setsRedlineRpm = row.RedlineRPM;
      if (candidate.powerPeakRpm) effects.setsPowerPeakRpm = candidate.powerPeakRpm;
      if (candidate.smoothness !== undefined)
        effects.setsPowerDeliverySmoothness = candidate.smoothness;
    }
    if (row.MassDiff) effects.massKgDelta = round(row.MassDiff, 4);
    if (row.WeightDistDiff) effects.weightDistFrontPctDelta = round(row.WeightDistDiff * 100, 5);
    addSpec(row.EngineID, { partId, level: row.Level, cost: row.Price ?? 0, effects });
  }
}

const maxPowerByEngine = new Map();
for (const engine of engines) {
  const base = engineBaseStats.get(engine.id)?.powerHp;
  if (!base) continue;
  const bestByCategory = new Map();
  for (const spec of specsByEngine.get(engine.id) ?? []) {
    const category = genericPartsById.get(spec.partId)?.category;
    if (!category) continue;
    const multiplier = spec.effects.powerMultiplier ?? 1;
    bestByCategory.set(category, Math.max(bestByCategory.get(category) ?? 1, multiplier));
  }
  let multiplier = 1;
  for (const value of bestByCategory.values()) multiplier *= value;
  maxPowerByEngine.set(engine.id, round(base * multiplier, 2));
}

const swapEngineIds = new Set(
  carEngines.filter((link) => link.swap_available).map((link) => link.engine_id),
);
const swapParts = [...swapEngineIds].map((engineId) => {
  const engine = engineById.get(engineId);
  const stats = engineBaseStats.get(engineId) ?? {};
  return {
    id: `game-engine-${engineId}`,
    category: 'engine_swap',
    name: engine?.name ?? `Game engine ${engineId}`,
    tierRank: 1,
    tier: 'swap',
    effects: {
      setsPowerHp: stats.powerHp,
      setsTorqueNm: stats.torqueNm,
      setsRedlineRpm: stats.redlineRpm,
      setsPowerPeakRpm: stats.powerPeakRpm,
      setsPowerDeliverySmoothness: stats.smoothness,
    },
    unlocks: [],
    setsAspiration: aspiration(engine?.aspiration),
    gameEngineId: engineId,
    cost: 0,
    source: 'fh6-game-files',
    confidence: 'high',
    dataVersion: 'fh6-steam-24241019',
    rationale: `Exact engine conversion from game row ${engineId}; per-car price and mass are applied as overrides.`,
  };
});

const driveTypeForPowertrain = (powertrainId) => {
  if (powertrainId === 0) return 'FWD';
  return powertrainId >= 4 && powertrainId <= 6 ? 'AWD' : 'RWD';
};
const drivetrainParts = [
  ...new Set(drivetrainConversions.filter((row) => !row.IsStock).map((row) => row.PowertrainId)),
].map((powertrainId) => ({
  id: `game-drivetrain-${powertrainId}`,
  category: 'drivetrain_swap',
  name: `${driveTypeForPowertrain(powertrainId)} conversion`,
  tierRank: 1,
  tier: 'swap',
  effects: {},
  unlocks: [],
  setsDrivetrain: driveTypeForPowertrain(powertrainId),
  cost: 0,
  source: 'fh6-game-files',
  confidence: 'high',
  dataVersion: 'fh6-steam-24241019',
  rationale: `Exact drivetrain conversion from game PowertrainId ${powertrainId}.`,
}));

const suspensionByCar = new Map();
for (const row of springRows) {
  const value = suspensionByCar.get(row.Ordinal) ?? {
    springMin: Infinity,
    springMax: -Infinity,
    heightMin: Infinity,
    heightMax: -Infinity,
    dampingMin: Infinity,
    dampingMax: -Infinity,
  };
  value.springMin = Math.min(value.springMin, row.MinSpringRate);
  value.springMax = Math.max(value.springMax, row.MaxSpringRate);
  value.heightMin = Math.min(value.heightMin, row.MinRideHeight);
  value.heightMax = Math.max(value.heightMax, row.MaxRideHeight);
  value.dampingMin = Math.min(value.dampingMin, row.MinDampenBumpRate, row.MinDampenReboundRate);
  value.dampingMax = Math.max(value.dampingMax, row.MaxDampenBumpRate, row.MaxDampenReboundRate);
  suspensionByCar.set(row.Ordinal, value);
}
for (const row of arbRows) {
  const value = suspensionByCar.get(row.Ordinal) ?? {};
  value.arbMin = Math.min(value.arbMin ?? Infinity, row.MinSwaybarStiffness);
  value.arbMax = Math.max(value.arbMax ?? -Infinity, row.MaxSwaybarStiffness);
  suspensionByCar.set(row.Ordinal, value);
}

const gameCars = [];
const gameProfiles = [];
const gameTuneRanges = [];
const usedIds = new Set();
for (const gameCar of cars) {
  const raw = rawCarById.get(gameCar.id);
  const old = oldByGameId.get(gameCar.id);
  const make = makeById.get(gameCar.manufacturer_id) ?? gameCar.make_code ?? 'Unknown';
  const preferredId =
    old?.id ?? `${gameCar.year}-${slug(make)}-${slug(gameCar.model)}-${gameCar.id}`;
  const id = usedIds.has(preferredId) ? `${preferredId}-${gameCar.id}` : preferredId;
  usedIds.add(id);
  const engineId = stockEngineByCar.get(gameCar.id);
  const motorId = stockMotorByCar.get(gameCar.id);
  const engine = engineById.get(engineId);
  const motor = motorById.get(motorId);
  const stats = engineId ? engineBaseStats.get(engineId) : undefined;
  const isHybrid = Boolean(engineId && motorId);
  gameCars.push({
    id,
    gameId: gameCar.id,
    year: gameCar.year,
    make,
    model: gameCar.model,
    name: `${gameCar.year} ${make} ${gameCar.model}`,
    ownership: old?.ownership ?? 'Game database (special/non-removable vehicle)',
    isBaseGame: old?.isBaseGame ?? null,
    stockClass: classForPi(gameCar.performance_index),
    stockPI: gameCar.performance_index,
    drivetrain: drivetrain(gameCar.drivetrain),
    massKg: round(gameCar.weight, 3),
    weightDistFrontPct: round(gameCar.weight_distribution * 100, 3),
    powerHp: motor ? round((motor.max_power ?? 0) / 0.745699872, 2) : stats?.powerHp,
    torqueNm: motor?.max_torque ?? stats?.torqueNm,
    aspiration: motor && !engine ? 'NA' : aspiration(engine?.aspiration ?? gameCar.aspiration),
    engineName: motor && !engine ? (motor.name ?? 'Electric motor') : engine?.name,
    displacementL: engine?.displacement,
    cylinders: cylinderCount(engine?.cylinders ?? gameCar.cylinders),
    redlineRpm: motor?.redline ?? stats?.redlineRpm,
    powerPeakRpm: stats?.powerPeakRpm,
    powerDeliverySmoothness: motor ? 1 : stats?.smoothness,
    stockTopSpeedKmh:
      gameCar.top_speed_mph > 0 ? round(gameCar.top_speed_mph * 1.609344, 2) : undefined,
    variant: gameCar.variant,
    bodyStyle: gameCar.body_style,
    enginePlacement: gameCar.engine_placement,
    numGears: gameCar.num_gears,
    baseCost: gameCar.base_cost,
    frontTireWidthMm: gameCar.front_tire_width_mm,
    rearTireWidthMm: gameCar.rear_tire_width_mm,
    frontRideHeightM: gameCar.front_ride_height,
    rearRideHeightM: gameCar.rear_ride_height,
    gameBundle: gameCar.bundle,
    stockGameEngineId: engineId,
    stockTireCompound: old?.stockTireCompound,
    wheelbaseMm: old?.wheelbaseMm,
    stockGameMotorId: motorId,
    stats: raw
      ? {
          speed: raw.SpeedRating,
          handling: raw.HandlingRating,
          acceleration: raw.AccelerationRating,
          launch: raw.LaunchRating,
          braking: raw.BrakingRating,
          offroad: raw.OffroadRating,
        }
      : undefined,
    source: 'fh6-game-files',
    confidence: 'high',
    dataVersion: 'fh6-steam-24241019',
    notes: `Authoritative game row ${gameCar.id}${isHybrid ? '; hybrid engine plus motor' : ''}. Community ownership retained only because game ownership packaging is not resolved.`,
  });
  const engineLinks = carEngines.filter(
    (link) => link.car_id === gameCar.id && link.swap_available,
  );
  const driveLinks = drivetrainConversions.filter(
    (row) => row.Ordinal === gameCar.id && !row.IsStock,
  );
  const activeEngineIds = [engineId].filter(Boolean);
  const availableByCategory = {};
  for (const activeEngineId of activeEngineIds) {
    for (const spec of specsByEngine.get(activeEngineId) ?? []) {
      const category = genericPartsById.get(spec.partId)?.category;
      if (!category) continue;
      availableByCategory[category] ??= [];
      if (!availableByCategory[category].includes(spec.partId))
        availableByCategory[category].push(spec.partId);
    }
  }
  const engineType =
    motorId && !engineId
      ? 'electric'
      : isHybrid
        ? 'hybrid'
        : engine?.is_rotary
          ? 'rotary'
          : 'piston';
  gameProfiles.push({
    carId: id,
    engineType,
    stockGameEngineId: engineId,
    stockGameMotorId: motorId,
    availableEngineSwapIds: engineLinks.map((link) => `game-engine-${link.engine_id}`),
    availableDrivetrainSwapIds: driveLinks.map((row) => `game-drivetrain-${row.PowertrainId}`),
    availablePartIdsByCategory: availableByCategory,
    partOverrides: [
      ...engineLinks.map((link) => ({
        partId: `game-engine-${link.engine_id}`,
        cost: link.price,
        effects: { massKgDelta: link.mass_diff_kg },
      })),
      ...driveLinks.map((row) => ({
        partId: `game-drivetrain-${row.PowertrainId}`,
        cost: row.Price,
        effects: { massKgDelta: row.MassDiff, weightDistFrontPctDelta: row.WeightDistDiff * 100 },
      })),
    ],
    source: 'fh6-game-files',
    confidence: 'high',
    dataVersion: 'fh6-steam-24241019',
  });
  const suspension = suspensionByCar.get(gameCar.id);
  if (suspension && suspension.springMax > suspension.springMin) {
    gameTuneRanges.push({
      id: `game-ranges-${gameCar.id}`,
      appliesToCarId: id,
      tirePressurePsi: { min: 15, max: 55, step: 0.1 },
      finalDrive: { min: 2.2, max: 6.1, step: 0.01 },
      gearRatio: { min: 0.48, max: 6, step: 0.01 },
      camberDeg: { min: -5, max: 5, step: 0.1 },
      toeDeg: { min: -5, max: 5, step: 0.1 },
      casterDeg: { min: 1, max: 7, step: 0.1 },
      arb: {
        min: round(suspension.arbMin ?? 1, 3),
        max: round(suspension.arbMax ?? 65, 3),
        step: 0.1,
      },
      springRate: {
        min: round(suspension.springMin, 3),
        max: round(suspension.springMax, 3),
        step: 0.1,
        unit: 'N/mm',
      },
      rideHeight: {
        min: round(suspension.heightMin * 100, 3),
        max: round(suspension.heightMax * 100, 3),
        step: 0.1,
        unit: 'cm',
      },
      damping: {
        min: round(suspension.dampingMin, 3),
        max: round(suspension.dampingMax, 3),
        step: 0.1,
      },
      aero: { min: 0, max: 500, step: 1, unit: 'kgf' },
      brakeBalancePct: { min: 0, max: 100, step: 1 },
      brakePressurePct: { min: 0, max: 1000, step: 1 },
      differentialPct: { min: 0, max: 100, step: 1 },
      source: 'fh6-game-files',
      confidence: 'high',
      dataVersion: 'fh6-steam-24241019',
      notes: `Range envelope from game spring/damper and anti-sway physics rows for car ${gameCar.id}.`,
    });
  }
}

const gameData = {
  gameCars,
  gameParts: [...genericPartsById.values(), ...swapParts, ...drivetrainParts],
  gameUpgradeProfiles: gameProfiles,
  gameTuneRanges,
  gameEngines: engines,
  gameMotors: motors,
  gamePhysicsSettings: physicsSettings,
  gameEngineUpgradeSpecs: Object.fromEntries(
    [...specsByEngine].map(([key, value]) => [String(key), value]),
  ),
  gameDatabaseBuild: 'Steam build 24241019',
};
const compactOutput = JSON.stringify(gameData, (_key, item) => (item === null ? undefined : item));
const wrapper = `// AUTO-GENERATED by scripts/import-game-database.mjs — do not edit.\nimport gameData from './game-database.json';\nimport type { CarInput, CarUpgradeProfileInput, PartInput, TuneRangesInput } from '../types.ts';\n\nexport const gameCars = gameData.gameCars as CarInput[];\nexport const gameParts = gameData.gameParts as PartInput[];\nexport const gameUpgradeProfiles = gameData.gameUpgradeProfiles as CarUpgradeProfileInput[];\nexport const gameTuneRanges = gameData.gameTuneRanges as TuneRangesInput[];\nexport const gameEngines = gameData.gameEngines;\nexport const gameMotors = gameData.gameMotors;\nexport const gamePhysicsSettings = gameData.gamePhysicsSettings;\nexport const gameEngineUpgradeSpecs = gameData.gameEngineUpgradeSpecs;\nexport const gameDatabaseBuild = gameData.gameDatabaseBuild;\n`;

const report = {
  cars: gameCars.length,
  preservedIds: oldByGameId.size,
  gameOnlyCars: gameCars.length - oldByGameId.size,
  engines: engines.length,
  motors: motors.length,
  engineUpgradeSpecs: [...specsByEngine.values()].reduce((sum, list) => sum + list.length, 0),
  generatedEnginePartChoices: genericPartsById.size,
  engineSwaps: swapParts.length,
  drivetrainConversions: drivetrainParts.length,
  perCarTuneRanges: gameTuneRanges.length,
};
console.log(JSON.stringify(report, null, 2));
if (!checkOnly) {
  await writeFile(outputPath, compactOutput, 'utf8');
  await writeFile(wrapperPath, wrapper, 'utf8');
}
