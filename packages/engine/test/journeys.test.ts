import { describe, expect, it } from 'vitest';
import type { BuildRequest } from '@fh6/shared';
import { generateBuild } from '../src/index.ts';
import { assertTuneWithinRanges, makeRequest, store } from './helpers.ts';

interface Journey {
  name: string;
  req: Partial<BuildRequest>;
  expectLegalTop?: boolean;
}

const journeys: Journey[] = [
  {
    name: 'MX-5 · road · B (grip)',
    req: { carId: 'mazda-mx5-nd-2019', discipline: 'road', targetClass: 'B' },
  },
  {
    name: 'WRX · rally · A (AWD)',
    req: { carId: 'subaru-wrx-sti-2019', discipline: 'rally', targetClass: 'A' },
  },
  {
    name: 'Mustang · drag · S2',
    req: { carId: 'ford-mustang-gt-2018', discipline: 'drag', targetClass: 'S2' },
  },
  {
    name: 'Silvia · drift · A',
    req: { carId: 'nissan-silvia-s15-1999', discipline: 'drift', targetClass: 'A' },
  },
  {
    name: '911 GT3 · road · S2 · no aero',
    req: {
      carId: 'porsche-911-gt3-991-2018',
      discipline: 'road',
      targetClass: 'S2',
      constraints: { noAero: true },
    },
  },
  {
    name: 'Civic Type R · street · A · FWD · budget',
    req: {
      carId: 'honda-civic-type-r-2018',
      discipline: 'street',
      targetClass: 'A',
      constraints: { budgetCredits: 80000 },
    },
  },
  {
    name: 'Jesko · top speed · open PI',
    req: {
      carId: 'koenigsegg-jesko-2020',
      discipline: 'top_speed',
      targetClass: null,
      targetPI: null,
    },
  },
  {
    name: 'F-150 Raptor · cross country · A',
    req: { carId: 'ford-f150-raptor-2017', discipline: 'cross_country', targetClass: 'A' },
  },
];

describe('representative user journeys', () => {
  for (const j of journeys) {
    it(j.name, () => {
      const result = generateBuild(store, makeRequest(j.req));
      const ranges = store.getTuneRanges(result.car.id);

      expect(result.strategies.length).toBeGreaterThan(0);
      const top = result.strategies[0]!;

      // Tune is always in-game-legal (within ranges).
      for (const s of result.strategies) assertTuneWithinRanges(s.tune.tune, ranges);

      // The build actually upgraded something.
      expect(top.parts.some((p) => p.isUpgrade)).toBe(true);

      // Trust surface is populated.
      expect(result.assumptions.length).toBeGreaterThan(0);
      expect(result.disclaimer.length).toBeGreaterThan(0);
      expect(['high', 'medium', 'low']).toContain(result.overallConfidence);
    });
  }

  it('no-aero journey yields a null aero tune and no aero parts', () => {
    const result = generateBuild(
      store,
      makeRequest({
        carId: 'porsche-911-gt3-991-2018',
        discipline: 'road',
        targetClass: 'S2',
        constraints: { noAero: true },
      }),
    );
    const top = result.strategies[0]!;
    expect(top.tune.tune.aero).toBeNull();
    expect(top.parts.filter((p) => p.isUpgrade).every((p) => !p.category.includes('aero'))).toBe(
      true,
    );
  });

  it('capped journeys land at or below the PI cap', () => {
    const result = generateBuild(
      store,
      makeRequest({ carId: 'mazda-mx5-nd-2019', discipline: 'road', targetClass: 'B' }),
    );
    for (const s of result.strategies) expect(s.pi.pi).toBeLessThanOrEqual(700);
  });
});
