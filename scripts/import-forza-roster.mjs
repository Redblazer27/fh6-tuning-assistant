#!/usr/bin/env node
/**
 * Generate packages/data/src/seed/roster-cars.ts from the official FH6 car list.
 *
 * Source: https://forza.net/fh6cars (server-rendered <table>, parsed deterministically —
 * no LLM in the data path). This carries authoritative identity/class/PI/DLC only; it
 * does NOT include physics (mass/power/drivetrain/aspiration), so those fields are left
 * absent (the engine fills transparent class-based defaults and marks such builds low
 * confidence — see resolveEffectiveCar). Cars already covered by the hand-curated seed
 * (with real physics) are skipped so they aren't duplicated.
 *
 * Re-run:  node scripts/import-forza-roster.mjs
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const SOURCE_URL = 'https://forza.net/fh6cars';
const OUT = path.join(process.cwd(), 'packages', 'data', 'src', 'seed', 'roster-cars.ts');

// FH6 class bands (must match packages/shared/src/enums.ts CLASS_PI_RANGE).
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

// (make, model, year) of the hand-curated cars, so we don't duplicate them.
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

// Normalize for de-dup + id: lowercase, strip accents & parentheticals & punctuation.
const norm = (s) =>
  s
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

async function main() {
  const res = await fetch(SOURCE_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`fetch ${SOURCE_URL} -> ${res.status}`);
  const html = await res.text();

  const tbody = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] ?? html;
  const rows = [...tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];

  const curatedKeys = new Set(CURATED.map(([mk, md, yr]) => `${norm(mk)}|${norm(md)}|${yr}`));
  const cars = [];
  const usedIds = new Set();
  let skippedCurated = 0;
  const classMismatches = [];

  for (const row of rows) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => stripTags(m[1]));
    if (cells.length < 4) continue;
    const [make, name, carType, carClass, , collection, addOns] = cells;
    if (!make || !name) continue;

    const cm = carClass.match(/(\d{2,3})\s*([A-Z][0-9]?)/);
    if (!cm) continue;
    const pi = Number(cm[1]);
    const officialClass = cm[2];
    const ym = name.match(/^(\d{4})\s+(.*)$/);
    if (!ym) continue;
    const year = Number(ym[1]);
    let model = ym[2];
    if (model.toLowerCase().startsWith(make.toLowerCase() + ' ')) {
      model = model.slice(make.length + 1).trim();
    }

    // Skip cars already in the hand-curated seed.
    if (curatedKeys.has(`${norm(make)}|${norm(model)}|${year}`)) {
      skippedCurated += 1;
      continue;
    }

    // Validate class against the FH6 bands; use the derived class (loader enforces this).
    const derived = piToClass(pi);
    if (derived !== officialClass)
      classMismatches.push(`${name}: official ${officialClass} vs band ${derived} (PI ${pi})`);

    let id = slug(`${year}-${make}-${model}`);
    let n = 2;
    while (usedIds.has(id)) id = `${slug(`${year}-${make}-${model}`)}-${n++}`;
    usedIds.add(id);

    const dlc = addOns && addOns.trim() ? addOns.trim() : /DLC/i.test(collection) ? collection : '';
    const isBaseGame = !dlc;
    const ownership = dlc || 'Base game';

    cars.push({
      id,
      year,
      make,
      model,
      name,
      ownership,
      isBaseGame,
      stockClass: derived,
      stockPI: pi,
      carType,
      source: 'forza-official-cars',
      confidence: 'low',
      dataVersion: 'DATA_VERSION',
      notes: `Identity/class/PI from the official list (high); physics not yet imported${carType ? ` — theme: ${carType}` : ''}.`,
    });
  }

  // Emit clean TS object literals. dataVersion is a symbol reference (not a string).
  const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  const body = cars
    .map((c) => {
      const lines = [
        `    id: ${q(c.id)},`,
        `    year: ${c.year},`,
        `    make: ${q(c.make)},`,
        `    model: ${q(c.model)},`,
        `    name: ${q(c.name)},`,
        `    ownership: ${q(c.ownership)},`,
        `    isBaseGame: ${c.isBaseGame},`,
        `    stockClass: ${q(c.stockClass)},`,
        `    stockPI: ${c.stockPI},`,
        `    source: ${q(c.source)},`,
        `    confidence: ${q(c.confidence)},`,
        `    dataVersion: DATA_VERSION,`,
        `    notes: ${q(c.notes)},`,
      ];
      return `  {\n${lines.join('\n')}\n  }`;
    })
    .join(',\n');

  const header = `// AUTO-GENERATED by scripts/import-forza-roster.mjs — do not edit by hand.
// Source: ${SOURCE_URL} (official FH6 car list). ${cars.length} cars.
// Authoritative identity/class/PI/DLC only; physics is intentionally absent and
// filled with transparent class-based defaults at build time (low confidence).
// Re-run: node scripts/import-forza-roster.mjs
import type { CarInput } from '../types.ts';
import { DATA_VERSION } from './version.ts';

export const rosterCars: CarInput[] = [
${body},
];
`;

  writeFileSync(OUT, header);
  console.log(`Wrote ${cars.length} roster cars to ${OUT}`);
  console.log(`Skipped ${skippedCurated} cars already in the curated seed (expected ~17).`);
  if (classMismatches.length) {
    console.log(`\nCLASS BAND MISMATCHES (${classMismatches.length}) — review:`);
    for (const m of classMismatches.slice(0, 20)) console.log('  ', m);
  } else {
    console.log('All official classes match the FH6 bands. ✓');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
