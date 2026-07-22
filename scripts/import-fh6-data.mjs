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

// Curated-car id -> its exact FH6 wiki page title (hand-verified to the right
// generation). Cars with no clean FH6 page (S550 Mustang GT, 991.2 GT3, 2017
// Raptor) are omitted rather than matched to the wrong generation.
const CURATED_PROFILES = [
  ['mazda-mx5-nd-2019', 'Mazda MX-5 (2016)'],
  ['toyota-supra-rz-1998', 'Toyota Supra RZ'],
  ['vw-golf-gti-2021', 'Volkswagen Golf GTI'],
  ['ford-fiesta-st-2019', 'Ford Fiesta ST (2023)'],
  ['honda-civic-type-r-2018', 'Honda Civic Type R (2018)'],
  ['subaru-wrx-sti-2019', 'Subaru WRX STI (2015)'],
  ['nissan-skyline-gtr-r34-1999', 'Nissan Skyline GT-R V-spec II (2000)'],
  ['nissan-silvia-s15-1999', 'Nissan Silvia Spec-R (2002)'],
  ['bmw-m3-e46-2005', 'BMW M3 (2005)'],
  ['chevrolet-corvette-z06-2015', 'Chevrolet Corvette Z06 (2015)'],
  ['lamborghini-huracan-2014', 'Lamborghini Huracán LP 610-4'],
  ['audi-sport-quattro-1984', 'Audi Sport quattro'],
  ['ford-rs200-evolution-1986', 'Ford RS200 Evolution'],
  ['koenigsegg-jesko-2020', 'Koenigsegg Jesko'],
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
// Aspiration inferred from an engine's name (for engines with no wiki page).
const aspFromName = (n) => {
  if (/-TT|twin[\s-]?turbo/i.test(n)) return 'twin_turbo';
  if (/-T\b|(?<![a-z])turbo/i.test(n)) return 'turbo';
  if (/supercharg/i.test(n)) return 'supercharged';
  return undefined;
};

function parseCar(title, wt) {
  const info = extractTemplate(wt, 'CarInfobox')
    ? parseParams(extractTemplate(wt, 'CarInfobox'))
    : {};
  // Conversions: prefer the FH6 line; if the wiki hasn't filled it in yet, fall back
  // to the most recent prior Horizon title as a (labelled) proxy.
  const conv = {};
  let convProxy = false;
  const FH_ORDER = ['fh6', 'fh5', 'fh4', 'fh3', 'fh2'];
  for (const kind of ['eng', 'drive', 'asp', 'body']) {
    const b = extractTemplate(wt, `CarConversions|${kind}`);
    if (!b) {
      conv[kind] = null;
      continue;
    }
    const params = parseParams(b);
    let val = null;
    for (const g of FH_ORDER) {
      if (params[g]) {
        val = params[g];
        if (g !== 'fh6') convProxy = true;
        break;
      }
    }
    conv[kind] = val;
  }
  const wLbs = info.weight ? Number(String(info.weight).replace(/[^0-9.]/g, '')) : undefined;
  const num = (v) => (v ? Number(String(v).replace(/[^0-9.]/g, '')) : undefined);
  // FH6 PI from the CarStats|fh6 block: the integer 100..999 among the positional args.
  const statsBlock = extractTemplate(wt, 'CarStats|fh6');
  let pi;
  if (statsBlock) {
    const nums = [...statsBlock.matchAll(/\|\s*(\d{2,3}(?:\.\d+)?)\b/g)].map((m) => Number(m[1]));
    pi = nums.find((n) => Number.isInteger(n) && n >= 100 && n <= 999);
  }
  return {
    title,
    pi,
    convProxy,
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
    bodyKits: conv.body
      ? conv.body
          .split(',')
          .map((s) =>
            s
              .replace(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, '$1')
              .replace(/[[\]']/g, '')
              .trim(),
          )
          .filter(Boolean)
      : [],
  };
}
// Parse an engine-swap page's {{EngineSwapInfobox}} (real specs for a swap engine).
function parseEngine(title, wt) {
  const b = extractTemplate(wt, 'EngineSwapInfobox');
  if (!b) return null;
  const p = parseParams(b);
  const num = (v) => (v ? Number(String(v).replace(/[^0-9.]/g, '')) : undefined);
  const power = num(p.power); // Horizon stock power (hp)
  if (!power) return null;
  return {
    title,
    power,
    maxPower: num(p['max power']),
    aspiration: aspMap(p.aspiration),
    configuration: p.configuration,
    displacementCc: num(p.displacement),
  };
}

// Fetch wikitext for many titles (batched 50/req) and map through `parse`.
async function fetchWikitext(titles, parse, label) {
  const api = 'https://forza.fandom.com/api.php';
  const out = [];
  for (let i = 0; i < titles.length; i += 50) {
    const chunk = titles.slice(i, i + 50);
    const url = `${api}?action=query&prop=revisions&rvslots=main&rvprop=content&redirects=1&format=json&formatversion=2&titles=${encodeURIComponent(chunk.join('|'))}`;
    for (let a = 0; a < 3; a++) {
      try {
        const r = await fetch(url, { headers: { 'User-Agent': UA } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        // Map each resolved page back to every alias (redirect/normalized) that
        // requested it, so a link target like "2.0L I4" resolves to its real page.
        const aliases = new Map(); // resolved title -> [requested names]
        for (const x of [...(j.query.redirects ?? []), ...(j.query.normalized ?? [])]) {
          if (!aliases.has(x.to)) aliases.set(x.to, []);
          aliases.get(x.to).push(x.from);
        }
        for (const page of j.query.pages) {
          const wt = page.revisions?.[0]?.slots?.main?.content;
          if (wt) {
            const v = parse(page.title, wt);
            if (v) {
              out.push(v);
              for (const from of aliases.get(page.title) ?? [])
                if (from !== page.title) out.push({ ...v, title: from });
            }
          }
        }
        break;
      } catch (e) {
        if (a === 2) throw e;
        await sleep(1500);
      }
    }
    process.stdout.write(`\r  ${label} ${Math.min(i + 50, titles.length)}/${titles.length}`);
    await sleep(200);
  }
  process.stdout.write('\n');
  return out;
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
  // forza.net is consulted only for ownership/DLC. The wiki (Fandom) is authoritative
  // for identity/class/PI/physics/conversions — on any discrepancy, the wiki wins.
  console.log('Fetching ownership (forza.net)…');
  const forza = await fetchForza();
  console.log(`  ${forza.length} cars.`);
  console.log('Fetching cars from the wiki (forza.fandom.com)…');
  const fandom = await fetchFandom();
  console.log(`  ${fandom.length} pages.`);

  const ownByKey = new Map();
  for (const c of forza) {
    const dlc =
      c.addOns && c.addOns.trim() ? c.addOns.trim() : /DLC/i.test(c.collection) ? c.collection : '';
    ownByKey.set(key(c.make, c.model, c.year), { ownership: dlc || 'Base game', isBaseGame: !dlc });
  }
  const curatedKeys = new Set(CURATED.map(([mk, md, yr]) => key(mk, md, yr)));
  const DT = { AWD: 'dt-swap-awd', RWD: 'dt-swap-rwd', FWD: 'dt-swap-fwd' };

  // Build a per-car upgrade profile from a parsed Fandom car, or null if it has none.
  const makeProfile = (carId, f) => {
    if (!(
      f.engineType ||
      f.engineSwaps.length ||
      f.drivetrainSwaps.length ||
      f.aspirationSwaps.length ||
      f.bodyKits.length
    ))
      return null;
    const dtIds = [...new Set(f.drivetrainSwaps.map((d) => DT[d]).filter(Boolean))].filter(
      (p) => p !== DT[f.drivetrain],
    );
    return {
      carId,
      engineType: f.engineType && f.engineType !== 'piston' ? f.engineType : null,
      dtIds,
      eng: f.engineSwaps,
      asp: f.aspirationSwaps,
      body: f.bodyKits,
      proxy: f.convProxy,
    };
  };

  // Real, tunable cars only: exclude traffic/null/special variants (no PI).
  const real = fandom.filter((c) => c.make && c.model && c.year && c.pi);
  console.log(
    `  ${real.length} real cars with a PI (excluded ${fandom.length - real.length} traffic/special).`,
  );

  const cars = [],
    profiles = [],
    usedIds = new Set();
  let enriched = 0;
  for (const f of real) {
    if (curatedKeys.has(key(f.make, f.model, f.year))) continue;
    let id = slug(`${f.year}-${f.make}-${f.model}`),
      n = 2;
    while (usedIds.has(id)) id = `${slug(`${f.year}-${f.make}-${f.model}`)}-${n++}`;
    usedIds.add(id);
    const own = ownByKey.get(key(f.make, f.model, f.year)) ?? {
      ownership: 'Base game',
      isBaseGame: true,
    };
    const car = {
      id,
      year: f.year,
      make: f.make,
      model: f.model,
      name: `${f.year} ${f.title.replace(/\s*\([^)]*\)\s*$/, '')}`,
      ownership: own.ownership,
      isBaseGame: own.isBaseGame,
      stockClass: piToClass(f.pi),
      stockPI: f.pi,
    };
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
    const hasPhysics = f.drivetrain && f.powerHp > 0 && f.massKg > 0;
    if (hasPhysics) enriched++;
    car.confidence = hasPhysics ? 'medium' : 'low';
    car.notes =
      'Car data from the community wiki (medium); ownership cross-checked with the official list.';
    cars.push(car);

    const prof = makeProfile(id, f);
    if (prof) profiles.push(prof);
  }
  const matched = enriched;

  // Curated cars (hand-authored, with real physics): attach profiles from their
  // exact FH6 wiki page. Titles are hand-verified to avoid wrong-generation matches.
  const fandomByTitle = new Map(fandom.map((c) => [c.title, c]));
  let curatedProfiles = 0;
  for (const [carId, title] of CURATED_PROFILES) {
    const f = fandomByTitle.get(title);
    if (!f) {
      console.warn(`  ! curated profile: no wiki page "${title}" for ${carId}`);
      continue;
    }
    const prof = makeProfile(carId, f);
    if (prof) {
      profiles.push(prof);
      curatedProfiles++;
    }
  }
  console.log(`  ${curatedProfiles} curated-car profiles.`);

  // Concrete swap engines: fetch specs for every referenced engine, emit a catalog,
  // and allowlist the real engine ids on each car's profile so builds simulate them.
  const engineNames = [...new Set(profiles.flatMap((p) => p.eng))];
  console.log(`Fetching ${engineNames.length} swap-engine spec pages…`);
  const engines = await fetchWikitext(engineNames, parseEngine, 'engines');
  const engById = new Map();
  for (const e of engines) if (e.power > 0 && !engById.has(e.title)) engById.set(e.title, e);
  // Fallback: engines with no wiki page but whose name encodes the power, e.g.
  // "2.0L I4-T (315 hp)". Aspiration inferred from the name.
  let fromName = 0;
  for (const name of engineNames) {
    if (engById.has(name)) continue;
    const hp = name.match(/\((\d{2,4})\s*hp\)/i);
    if (hp) {
      engById.set(name, { title: name, power: Number(hp[1]), aspiration: aspFromName(name) });
      fromName++;
    }
  }
  const engIdOf = (name) => `eng-${slug(name)}`;
  for (const p of profiles)
    p.engIds = [...new Set(p.eng.filter((n) => engById.has(n)).map(engIdOf))];
  console.log(
    `  ${engById.size} engines with specs (${fromName} from name); wired to ${profiles.filter((p) => p.engIds.length).length} cars.`,
  );

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
// Wiki-primary: identity/class/PI/physics from the Forza Wiki (forza.fandom.com,
// medium — authoritative on any discrepancy); ownership/DLC cross-checked with the
// official list (forza.net/fh6cars). ${cars.length} cars, ${matched} with real physics.
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
    if (p.engIds.length) L.push(`    availableEngineSwapIds: ${arr(p.engIds)},`);
    if (p.dtIds.length) L.push(`    availableDrivetrainSwapIds: ${arr(p.dtIds)},`);
    if (p.eng.length) L.push(`    engineSwapOptions: ${arr(p.eng)},`);
    if (p.asp.length) L.push(`    aspirationOptions: ${arr(p.asp)},`);
    if (p.body.length) L.push(`    bodyKitOptions: ${arr(p.body)},`);
    L.push(
      `    source: 'fandom-fh6-cars',`,
      `    confidence: ${p.proxy ? "'low'" : "'medium'"},`,
      `    dataVersion: DATA_VERSION,`,
    );
    if (p.proxy)
      L.push(
        `    notes: 'Conversions from a prior Forza Horizon title; the FH6 line is not yet on the wiki.',`,
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

  // Engines catalog: each real swap engine as an engine_swap part with real base power.
  const uniqEng = [];
  const seenEng = new Set();
  for (const e of engById.values()) {
    const id = engIdOf(e.title);
    if (seenEng.has(id)) continue;
    seenEng.add(id);
    uniqEng.push({ id, ...e });
  }
  const engLit = (e) => {
    const L = [
      `    id: ${q(e.id)},`,
      `    category: 'engine_swap',`,
      `    name: ${q(e.title)},`,
      `    tierRank: 1,`,
      `    tier: 'swap',`,
      e.maxPower > e.power
        ? `    effects: { setsPowerHp: ${e.power}, setsMaxPowerHp: ${e.maxPower} },`
        : `    effects: { setsPowerHp: ${e.power} },`,
    ];
    if (e.aspiration) L.push(`    setsAspiration: ${q(e.aspiration)},`);
    L.push(
      `    cost: ${Math.round(Math.min(90000, Math.max(8000, e.power * 40)))},`,
      `    source: 'fandom-fh6-cars',`,
      `    confidence: 'medium',`,
      `    dataVersion: DATA_VERSION,`,
    );
    return `  {\n${L.join('\n')}\n  }`;
  };
  writeFileSync(
    path.join(SEED, 'engines-catalog.ts'),
    `// AUTO-GENERATED by scripts/import-fh6-data.mjs — do not edit by hand.
// Real FH6 swap engines (from the wiki's EngineSwapInfobox, medium confidence),
// modelled as engine_swap parts whose setsPowerHp installs the engine's base power.
// Opt-in only: a car gets these via its profile's availableEngineSwapIds. ${uniqEng.length} engines.
import type { PartInput } from '../types.ts';
import { DATA_VERSION } from './version.ts';

export const swapEngines: PartInput[] = [
${uniqEng.map(engLit).join(',\n')},
];
`,
  );

  console.log(`\nroster-cars.ts: ${cars.length} cars (${matched} enriched with real physics)`);
  console.log(`car-upgrade-profiles-fandom.ts: ${profiles.length} profiles`);
  console.log(`engines-catalog.ts: ${uniqEng.length} swap engines with real specs`);
  console.log(
    `  engine swaps: ${profiles.filter((p) => p.eng.length).length}, drivetrain: ${profiles.filter((p) => p.dtIds.length).length}, rotary: ${profiles.filter((p) => p.engineType === 'rotary').length}`,
  );
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
