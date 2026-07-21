import type { Source } from '../types.ts';

/**
 * Source registry. Every data record cites one of these by id, and inherits a
 * default confidence unless it declares its own. See docs/data-policy.md.
 */
export const sources: Source[] = [
  {
    id: 'forza-official-cars',
    name: 'Forza Horizon 6 — Official Car List',
    url: 'https://forza.net/fh6cars',
    type: 'official',
    defaultConfidence: 'high',
    notes: 'Authoritative for car availability, make/model/year, and DLC/pack membership.',
  },
  {
    id: 'forza-support-dataout',
    name: 'Forza Horizon 6 — "Data Out" Telemetry Documentation',
    url: 'https://support.forza.net/hc/en-us/articles/51744149102611-Forza-Horizon-6-Data-Out-Documentation',
    type: 'official',
    defaultConfidence: 'high',
    notes: 'Authoritative for the UDP telemetry packet layout and enablement.',
  },
  {
    id: 'fandom-fh6-cars',
    name: 'Forza Wiki (Fandom) — FH6 Cars',
    url: 'https://forza.fandom.com/wiki/Forza_Horizon_6/Cars',
    type: 'community',
    defaultConfidence: 'medium',
    notes: 'Reputable community roster with stats; used where official data is incomplete.',
  },
  {
    id: 'community-tuning-consensus',
    name: 'Community tuning guides (ForzaTune guide, forza.guide, sim-racing setups)',
    type: 'community',
    defaultConfidence: 'medium',
    notes:
      'Consensus references for tunable ranges and part behaviour. Used to sanity-check heuristics, ' +
      'not as exact numbers.',
  },
  {
    id: 'inferred-model',
    name: 'FH6 Tuning Assistant — inferred model',
    type: 'inferred',
    defaultConfidence: 'low',
    notes:
      'Values estimated by this app’s physics/PI model rather than observed in-game. Always ' +
      'shown with a confidence label and refined by user feedback.',
  },
];
