#!/usr/bin/env node
/**
 * Generate the FH6 car roster + per-car upgrade profiles from two live sources:
 *
 *  - forza.net/fh6cars  (official): authoritative identity/class/PI/DLC (high). Server-
 *    rendered <table>, parsed deterministically.
 *  - forza.fandom.com   (community wiki, via the MediaWiki API): physics (mass, power,
 *    drivetrain, aspiration, engine) and FH6 conversion options (engine/drivetrain/
 *    aspiration swaps) (medium). No LLM in the data path.
 *
 * Emits (do not hand-edit):
 *  - packages/data/src/seed/roster-cars.ts             (identity + enriched physics)
 *  - packages/data/src/seed/car-upgrade-profiles-fandom.ts (per-car FH6 conversions)
 *
 * Re-run:  node scripts/import-fh6-data.mjs
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const SEED = path.join(process.cwd(), 'packages', 'data', 'src', 'seed');
const UA = 'fh6-tuning-assistant/0.1 (personal project; github Redblazer27)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BANDS = [
  ['D', 100, 400],
  ['C', 401, 500],
  ['B', 501, 600],
  ['A', 601, 700],
  ['S1', 701, 800],
  ['S2', 801, 900],
  ['R', 901, 999],
];
const piToClass = (pi) =>
  BANDS.find(([, lo, hi]) => pi >= lo && pi <= hi)?.[0] ?? (pi < 100 ? 'D' : 'R');

const CURATED = [
  ['Mazda', 'MX-5 (ND)', 2019],
  ['Toyota', 'Supra RZ (A80)', 1998],
  ['Volkswagen', 'Golf GTI', 2021],
  ['Ford', 'Fiesta ST', 2019],
  ['Honda', 'Civic Type R (FK8)', 2018],
  ['Subaru', 'WRX STI', 2019],
  ['Nissan', 'Skyline GT-R V-Spec (R34)', 1999],
  ['Nissan', 'Silvia Spec-R (S15)', 1999],
  ['BMW', 'M3 (E46)', 2005],
  ['Ford', 'Mustang GT', 2018],
  ['Chevrolet', 'Corvette Z06 (C7)', 2015],
  ['Porsche', '911 GT3 (991.2)', 2018],
  ['Lamborghini', 'Huracán LP 610-4', 2014],
  ['Audi', 'Sport quattro', 1984],
  ['Ford', 'F-150 Raptor', 2017],
  ['Ford', 'RS200 Evolution', 1986],
  ['Koenigsegg', 'Jesko', 2020],
];

const norm = (s) =>
  (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const slug = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
const key = (mk, md, yr) => `${norm(mk)}|${norm(md)}|${yr}`;
const keyNY = (mk, md) => `${norm(mk)}|${norm(md)}`;
const stripTags = (s) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .trim();

// --- forza.net (official identity) ------------------------------------------
async function fetchForza() {
  const res = await fetch('https://forza.net/fh6cars', { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`forza.net -> ${res.status}`);
  const html = await res.text();
  const tbody = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] ?? html;
  const out = [];
  for (const row of tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => stripTags(m[1]));
    if (cells.length < 4) continue;
    const [make, name, carType, carClass, , collection, addOns] = cells;
    if (!make || !name) continue;
    const cm = carClass.match(/(\d{2,3})\s*[A-Z][0-9]?/);
    const ym = name.match(/^(\d{4})\s+(.*)$/);
    if (!cm || !ym) continue;
    let model = ym[2];
    if (model.toLowerCase().startsWith(make.toLowerCase() + ' '))
      model = model.slice(make.length + 1).trim();
    out.push({
      make,
      name,
      model,
      year: Number(ym[1]),
      pi: Number(cm[1]),
      carType,
      collection,
      addOns,
    });
  }
  return out;
}

// --- Fandom (physics + conversions) -----------------------------------------
function extractTemplate(wt, name) {
  const start = wt.indexOf(`{{${name}`);
  if (start === -1) return null;
  let i = start + 2,
    depth = 1;
  while (i < wt.length && depth > 0) {
    if (wt[i] === '{' && wt[i + 1] === '{') {
      depth++;
      i += 2;
      continue;
    }
    if (wt[i] === '}' && wt[i + 1] === '}') {
      depth--;
      i += 2;
      continue;
    }
    i++;
  }
  return wt.slice(start, i);
}
function parseParams(block) {
  const out = {};
  const parts = [];
  let depth = 0,
    cur = '';
  for (let i = 2; i < block.length - 2; i++) {
    const c = block[i],
      c2 = block[i + 1];
    if ((c === '{' && c2 === '{') || (c === '[' && c2 === '[')) {
      depth++;
      cur += c + c2;
      i++;
      continue;
    }
    if ((c === '}' && c2 === '}') || (c === ']' && c2 === ']')) {
      depth--;
      cur += c + c2;
      i++;
      continue;
    }
    if (c === '|' && depth === 0) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  parts.push(cur);
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq === -1) continue;
    const k = p.slice(0, eq).trim();
    if (k) out[k] = p.slice(eq + 1).trim();
  }
  return out;
}
const linkTargets = (s) =>
  [...s.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)].map((m) => m[1].trim());
const layoutDt = (l) => {
  if (!l) return undefined;
  l = l.toLowerCase();
  if (l.includes('4') || l === 'awd') return 'AWD';
  if (l === 'ff') return 'FWD';
  return 'RWD';
};
const engineFamily = (e, asp) => {
  e = (e || '').toLowerCase();
  if (/rotary|rotor/.test(e) || /^r\d/.test(e)) return 'rotary';
  if (/electric|motor/.test(e) || (asp || '').toLowerCase() === 'electric') return 'electric';
  if (/hybrid/.test(e)) return 'hybrid';
  return e ? 'piston' : undefined;
};
const cyl = (e) => {
  const m = (e || '').match(/[IVWHB]?(\d{1,2})/i);
  return m ? Number(m[1]) : undefined;
};
const aspMap = (a) => {
  a = (a || '').toLowerCase();
  if (a.includes('twin')) return 'twin_turbo';
  if (a.includes('turbo')) return 'turbo';
  if (a.includes('centrifugal')) return 'centrifugal';
  if (a.includes('super')) return 'supercharged';
  if (a === 'na' || a.includes('natural')) return 'NA';
  return undefined;
};

function parseCar(title, wt) {
  const info = extractTemplate(wt, 'CarInfobox')
    ? parseParams(extractTemplate(wt, 'CarInfobox'))
    : {};
  const conv = {};
  for (const kind of ['eng', 'drive', 'asp']) {
    const b = extractTemplate(wt, `CarConversions|${kind}`);
    conv[kind] = b ? (parseParams(b).fh6 ?? null) : null;
  }
  const wLbs = info.weight ? Number(String(info.weight).replace(/[^0-9.]/g, '')) : undefined;
  const num = (v) => (v ? Number(String(v).replace(/[^0-9.]/g, '')) : undefined);
  return {
    make: info.manufacturer,
    model: info.model,
    year: info.year ? Number(info.year) : undefined,
    aspiration: aspMap(info.aspiration),
    drivetrain: layoutDt(info.layout),
    engineType: engineFamily(info.engine, info.aspiration),
    engineRaw: info.engine,
    cylinders: cyl(info.engine),
    displacementL: info.disp ? Number(info.disp) : undefined,
    powerHp: num(info.power),
    torqueNm: info.torque ? Math.round(num(info.torque) * 1.35582) : undefined,
    massKg: wLbs ? Math.round(wLbs * 0.453592) : undefined,
    weightDistFrontPct: info.front ? Number(info.front) : undefined,
    engineSwaps: conv.eng ? linkTargets(conv.eng) : [],
    drivetrainSwaps: conv.drive
      ? [
          ...new Set(
            conv.drive
              .replace(/Drivetrain/gi, '')
              .split(',')
              .map((s) => s.trim().toUpperCase())
              .filter((s) => ['RWD', 'AWD', 'FWD'].includes(s)),
          ),
        ]
      : [],
    aspirationSwaps: conv.asp
      ? conv.asp
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
  };
}
async function fetchFandom() {
  const api = 'https://forza.fandom.com/api.php';
  const titles = [];
  let cont = '';
  do {
    const r = await fetch(
      `${api}?action=query&list=categorymembers&cmtitle=${encodeURIComponent('Category:Cars (FH6)')}&cmlimit=max&cmtype=page&format=json&formatversion=2${cont}`,
      { headers: { 'User-Agent': UA } },
    );
    const j = await r.json();
    titles.push(...j.query.categorymembers.map((m) => m.title));
    cont = j.continue ? `&cmcontinue=${encodeURIComponent(j.continue.cmcontinue)}` : '';
    await sleep(150);
  } while (cont);

  const cars = [];
  for (let i = 0; i < titles.length; i += 50) {
    const chunk = titles.slice(i, i + 50);
    const url = `${api}?action=query&prop=revisions&rvslots=main&rvprop=content&format=json&formatversion=2&titles=${encodeURIComponent(chunk.join('|'))}`;
    for (let a = 0; a < 3; a++) {
      try {
        const r = await fetch(url, { headers: { 'User-Agent': UA } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        for (const page of j.query.pages) {
          const wt = page.revisions?.[0]?.slots?.main?.content;
          if (wt) cars.push(parseCar(page.title, wt));
        }
        break;
      } catch (e) {
        if (a === 2) throw e;
        await sleep(1500);
      }
    }
    process.stdout.write(`\r  fandom ${Math.min(i + 50, titles.length)}/${titles.length}`);
    await sleep(200);
  }
  process.stdout.write('\n');
  return cars.filter((c) => c.make && c.model);
}

// --- emit helpers ------------------------------------------------------------
const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const arr = (a) => `[${a.map(q).join(', ')}]`;

async function main() {
  console.log('Fetching official roster (forza.net)…');
  const forza = await fetchForza();
  console.log(`  ${forza.length} cars.`);
  console.log('Fetching physics + conversions (forza.fandom.com)…');
  const fandom = await fetchFandom();
  console.log(`  ${fandom.length} cars.`);

  const fByKey = new Map(),
    fByNY = new Map();
  for (const c of fandom) {
    fByKey.set(key(c.make, c.model, c.year), c);
    if (!fByNY.has(keyNY(c.make, c.model))) fByNY.set(keyNY(c.make, c.model), c);
  }
  const match = (c) =>
    fByKey.get(key(c.make, c.model, c.year)) ?? fByNY.get(keyNY(c.make, c.model));
  const curatedKeys = new Set(CURATED.map(([mk, md, yr]) => key(mk, md, yr)));
  const DT = { AWD: 'dt-swap-awd', RWD: 'dt-swap-rwd', FWD: 'dt-swap-fwd' };

  const cars = [],
    profiles = [],
    usedIds = new Set();
  let matched = 0;
  for (const c of forza) {
    if (curatedKeys.has(key(c.make, c.model, c.year))) continue;
    let id = slug(`${c.year}-${c.make}-${c.model}`),
      n = 2;
    while (usedIds.has(id)) id = `${slug(`${c.year}-${c.make}-${c.model}`)}-${n++}`;
    usedIds.add(id);
    const dlc =
      c.addOns && c.addOns.trim() ? c.addOns.trim() : /DLC/i.test(c.collection) ? c.collection : '';
    const car = {
      id,
      year: c.year,
      make: c.make,
      model: c.model,
      name: c.name,
      ownership: dlc || 'Base game',
      isBaseGame: !dlc,
      stockClass: piToClass(c.pi),
      stockPI: c.pi,
    };
    const f = match(c);
    if (f) {
      matched++;
      if (f.drivetrain) car.drivetrain = f.drivetrain;
      if (f.aspiration) car.aspiration = f.aspiration;
      if (f.massKg > 0) car.massKg = f.massKg;
      if (f.weightDistFrontPct >= 20 && f.weightDistFrontPct <= 80)
        car.weightDistFrontPct = f.weightDistFrontPct;
      if (f.powerHp > 0) car.powerHp = f.powerHp;
      if (f.torqueNm > 0) car.torqueNm = f.torqueNm;
      if (f.displacementL > 0) car.displacementL = f.displacementL;
      if (f.cylinders > 0) car.cylinders = f.cylinders;
      if (f.engineRaw)
        car.engineName = f.displacementL ? `${f.displacementL}L ${f.engineRaw}` : f.engineRaw;
      car.confidence = 'medium';
      car.notes = 'Identity/class/PI: official list (high). Physics: community wiki (medium).';
    } else {
      car.confidence = 'low';
      car.notes = `Identity/class/PI from the official list (high); physics estimated${c.carType ? ` — theme: ${c.carType}` : ''}.`;
    }
    cars.push(car);
    if (
      f &&
      (f.engineType || f.engineSwaps.length || f.drivetrainSwaps.length || f.aspirationSwaps.length)
    ) {
      const dtIds = [...new Set(f.drivetrainSwaps.map((d) => DT[d]).filter(Boolean))].filter(
        (p) => p !== DT[f.drivetrain],
      );
      profiles.push({
        carId: id,
        engineType: f.engineType && f.engineType !== 'piston' ? f.engineType : null,
        dtIds,
        eng: f.engineSwaps,
        asp: f.aspirationSwaps,
      });
    }
  }

  const carLit = (c) => {
    const L = [
      `    id: ${q(c.id)},`,
      `    year: ${c.year},`,
      `    make: ${q(c.make)},`,
      `    model: ${q(c.model)},`,
      `    name: ${q(c.name)},`,
      `    ownership: ${q(c.ownership)},`,
      `    isBaseGame: ${c.isBaseGame},`,
      `    stockClass: ${q(c.stockClass)},`,
      `    stockPI: ${c.stockPI},`,
    ];
    for (const k of [
      'drivetrain',
      'aspiration',
      'massKg',
      'weightDistFrontPct',
      'powerHp',
      'torqueNm',
      'displacementL',
      'cylinders',
      'engineName',
    ])
      if (c[k] !== undefined) L.push(`    ${k}: ${typeof c[k] === 'number' ? c[k] : q(c[k])},`);
    L.push(
      `    source: 'forza-official-cars',`,
      `    confidence: ${q(c.confidence)},`,
      `    dataVersion: DATA_VERSION,`,
      `    notes: ${q(c.notes)},`,
    );
    return `  {\n${L.join('\n')}\n  }`;
  };
  writeFileSync(
    path.join(SEED, 'roster-cars.ts'),
    `// AUTO-GENERATED by scripts/import-fh6-data.mjs — do not edit by hand.
// Identity/class/PI/DLC: official list (forza.net/fh6cars, high). Physics: community
// wiki (forza.fandom.com, medium) where a car matched; otherwise physics is absent and
// the engine fills class-based defaults (low confidence). ${cars.length} cars, ${matched} enriched.
import type { CarInput } from '../types.ts';
import { DATA_VERSION } from './version.ts';

export const rosterCars: CarInput[] = [
${cars.map(carLit).join(',\n')},
];
`,
  );

  const profLit = (p) => {
    const L = [`    carId: ${q(p.carId)},`];
    if (p.engineType) L.push(`    engineType: ${q(p.engineType)},`);
    if (p.dtIds.length) L.push(`    availableDrivetrainSwapIds: ${arr(p.dtIds)},`);
    if (p.eng.length) L.push(`    engineSwapOptions: ${arr(p.eng)},`);
    if (p.asp.length) L.push(`    aspirationOptions: ${arr(p.asp)},`);
    L.push(
      `    source: 'fandom-fh6-cars',`,
      `    confidence: 'medium',`,
      `    dataVersion: DATA_VERSION,`,
    );
    return `  {\n${L.join('\n')}\n  }`;
  };
  writeFileSync(
    path.join(SEED, 'car-upgrade-profiles-fandom.ts'),
    `// AUTO-GENERATED by scripts/import-fh6-data.mjs — do not edit by hand.
// Per-car FH6 conversion options (engine swaps, drivetrain swaps, aspiration) from the
// community wiki (forza.fandom.com, medium confidence). ${profiles.length} profiles.
import type { CarUpgradeProfileInput } from '../types.ts';
import { DATA_VERSION } from './version.ts';

export const fandomUpgradeProfiles: CarUpgradeProfileInput[] = [
${profiles.map(profLit).join(',\n')},
];
`,
  );

  console.log(`\nroster-cars.ts: ${cars.length} cars (${matched} enriched with real physics)`);
  console.log(`car-upgrade-profiles-fandom.ts: ${profiles.length} profiles`);
  console.log(
    `  engine swaps: ${profiles.filter((p) => p.eng.length).length}, drivetrain: ${profiles.filter((p) => p.dtIds.length).length}, rotary: ${profiles.filter((p) => p.engineType === 'rotary').length}`,
  );
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
