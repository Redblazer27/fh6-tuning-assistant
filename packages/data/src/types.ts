import type { z } from 'zod';
import type {
  carSchema,
  datasetSchema,
  feedbackSchema,
  gameVersionSchema,
  partEffectsSchema,
  partSchema,
  sourceSchema,
  tuneRangesSchema,
} from './schemas.ts';

export type GameVersion = z.infer<typeof gameVersionSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type Car = z.infer<typeof carSchema>;
export type Part = z.infer<typeof partSchema>;
export type PartEffects = z.infer<typeof partEffectsSchema>;
export type TuneRanges = z.infer<typeof tuneRangesSchema>;
export type Feedback = z.infer<typeof feedbackSchema>;
export type Dataset = z.infer<typeof datasetSchema>;

// Input types (defaults optional) — used when authoring seed / importing.
export type CarInput = z.input<typeof carSchema>;
export type PartInput = z.input<typeof partSchema>;
export type TuneRangesInput = z.input<typeof tuneRangesSchema>;
export type DatasetInput = z.input<typeof datasetSchema>;
