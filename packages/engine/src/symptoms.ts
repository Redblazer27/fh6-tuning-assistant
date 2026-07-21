import type { TuningCategory } from '@fh6/shared';

/**
 * Symptom-based adjustments. For a handling complaint, the app shows the SMALLEST,
 * SAFEST change first and works up to bigger structural changes. These are guidance
 * on top of the generated baseline — applying one is the user's choice and never
 * silently changes the baseline tune.
 */

export interface SymptomAdjustment {
  area: TuningCategory | 'general';
  /** The concrete change to try, e.g. "Soften front ARB by 2–4". */
  change: string;
  rationale: string;
}

export type SymptomGroup =
  | 'understeer'
  | 'oversteer'
  | 'traction'
  | 'braking'
  | 'stability'
  | 'response'
  | 'ride';

export interface Symptom {
  id: string;
  label: string;
  group: SymptomGroup;
  /** Ordered smallest-safe-first. */
  adjustments: SymptomAdjustment[];
}

export const SYMPTOMS: Symptom[] = [
  {
    id: 'understeer-entry',
    label: 'Understeer turning in (corner entry)',
    group: 'understeer',
    adjustments: [
      { area: 'antiroll_bars', change: 'Soften front ARB by 2–4', rationale: 'Frees the front to build grip earlier.' },
      { area: 'alignment', change: 'Add front toe-out 0.1°', rationale: 'Sharpens initial turn-in.' },
      { area: 'tires', change: 'Lower front tire pressure 1–2 psi', rationale: 'Grows the front contact patch.' },
      { area: 'alignment', change: 'Add 0.3–0.5° front camber (more negative)', rationale: 'More grip at cornering lean.' },
      { area: 'springs', change: 'Soften front springs slightly', rationale: 'Last resort — bigger balance shift.' },
    ],
  },
  {
    id: 'understeer-exit',
    label: 'Understeer on corner exit (on power)',
    group: 'understeer',
    adjustments: [
      { area: 'differential', change: 'Reduce accel lock 5–10%', rationale: 'Less locking lets the car rotate on throttle.' },
      { area: 'antiroll_bars', change: 'Soften front ARB by 2–3', rationale: 'Shifts balance toward rotation.' },
      { area: 'aero', change: 'Reduce front downforce a little', rationale: 'Trims front-end push at speed.' },
    ],
  },
  {
    id: 'oversteer-entry',
    label: 'Rear steps out on entry (off throttle / trail braking)',
    group: 'oversteer',
    adjustments: [
      { area: 'differential', change: 'Reduce decel (coast) lock 5–10%', rationale: 'Calms the rear when lifting/braking into a corner.' },
      { area: 'antiroll_bars', change: 'Soften rear ARB by 2–3', rationale: 'Gives the rear more grip.' },
      { area: 'alignment', change: 'Add rear toe-in 0.1°', rationale: 'Stabilizes the rear axle.' },
      { area: 'tires', change: 'Raise rear tire pressure 1–2 psi', rationale: 'Quick way to trim rear grip response.' },
    ],
  },
  {
    id: 'oversteer-exit',
    label: 'Oversteer on exit (power-on, rear slides)',
    group: 'oversteer',
    adjustments: [
      { area: 'differential', change: 'Reduce accel lock 5–10%', rationale: 'Softens power-on rear breakaway.' },
      { area: 'antiroll_bars', change: 'Soften rear ARB by 2–3', rationale: 'More mechanical rear grip.' },
      { area: 'aero', change: 'Add rear downforce', rationale: 'More high-speed rear stability.' },
      { area: 'tires', change: 'Raise rear tire pressure 1 psi', rationale: 'Small, reversible balance trim.' },
    ],
  },
  {
    id: 'brake-instability',
    label: 'Rear steps out under braking',
    group: 'braking',
    adjustments: [
      { area: 'differential', change: 'Reduce decel lock 5–10%', rationale: 'The most common cause — coast lock unsettles the rear.' },
      { area: 'brakes', change: 'Move brake balance forward 2–4%', rationale: 'Keeps the rear from locking first.' },
      { area: 'brakes', change: 'Reduce brake pressure 3–5%', rationale: 'Less lock-up, especially on a controller.' },
      { area: 'damping', change: 'Soften rear rebound slightly', rationale: 'Keeps the rear planted during weight transfer.' },
    ],
  },
  {
    id: 'poor-launch',
    label: 'Wheelspin off the line / poor launch',
    group: 'traction',
    adjustments: [
      { area: 'differential', change: 'Increase accel lock 5–10% (RWD/AWD)', rationale: 'Distributes drive for a cleaner hook-up.' },
      { area: 'tires', change: 'Lower drive-axle tire pressure 1–2 psi', rationale: 'Bigger contact patch off the line.' },
      { area: 'springs', change: 'Raise rear ride height / soften rear a touch', rationale: 'Aids rearward weight transfer on launch.' },
      { area: 'gearing', change: 'Slightly taller 1st gear', rationale: 'Reduces initial torque spike (drag).' },
    ],
  },
  {
    id: 'unstable-highspeed',
    label: 'Unstable / twitchy at high speed',
    group: 'stability',
    adjustments: [
      { area: 'aero', change: 'Add rear downforce (or reduce front)', rationale: 'Rear stability grows with speed.' },
      { area: 'alignment', change: 'Add rear toe-in 0.1°', rationale: 'Straight-line stability.' },
      { area: 'alignment', change: 'Increase caster 0.5°', rationale: 'Stronger self-centering.' },
      { area: 'tires', change: 'Raise tire pressures 1–2 psi', rationale: 'Firms up response and reduces squirm.' },
    ],
  },
  {
    id: 'lazy-response',
    label: 'Turn-in feels lazy / slow to respond',
    group: 'response',
    adjustments: [
      { area: 'antiroll_bars', change: 'Stiffen front ARB by 2–3', rationale: 'Quicker weight transfer to the front.' },
      { area: 'alignment', change: 'Add front toe-out 0.1°', rationale: 'Eager turn-in.' },
      { area: 'tires', change: 'Raise front tire pressure 1 psi', rationale: 'Snappier response.' },
      { area: 'aero', change: 'Reduce front/rear downforce a little', rationale: 'Less drag-induced lag on tighter tracks.' },
    ],
  },
  {
    id: 'body-roll',
    label: 'Too much body roll / vague in corners',
    group: 'stability',
    adjustments: [
      { area: 'antiroll_bars', change: 'Stiffen both ARBs by 3–5 (keep the balance)', rationale: 'Directly reduces roll.' },
      { area: 'springs', change: 'Stiffen springs modestly (both ends)', rationale: 'Less body movement if ARBs aren’t enough.' },
    ],
  },
  {
    id: 'bottoming-dirt',
    label: 'Bottoming out / harsh on dirt or kerbs',
    group: 'ride',
    adjustments: [
      { area: 'springs', change: 'Raise ride height', rationale: 'More travel before the car bottoms.' },
      { area: 'springs', change: 'Soften springs', rationale: 'Absorbs bigger hits.' },
      { area: 'damping', change: 'Soften bump damping 1–2', rationale: 'Lets the wheel move over impacts.' },
      { area: 'tires', change: 'Lower tire pressures 1–3 psi', rationale: 'More compliance on rough surfaces.' },
    ],
  },
];

export interface ConditionModifier {
  id: string;
  label: string;
  notes: string[];
}

export const CONDITION_MODIFIERS: ConditionModifier[] = [
  {
    id: 'controller',
    label: 'Controller',
    notes: [
      'Reduce brake pressure ~5% to avoid lock-ups.',
      'Slightly more caster helps the car self-center and feel calmer.',
      'Avoid an ultra-stiff rear ARB — it makes the rear snappy on a stick.',
      'In-game, lower steering sensitivity/deadzone can matter more than the tune.',
    ],
  },
  {
    id: 'wheel',
    label: 'Wheel',
    notes: [
      'You can run a bit more front grip / lower caster for feel and precision.',
      'Stiffer, more responsive setups are easier to place accurately.',
    ],
  },
  {
    id: 'wet',
    label: 'Wet / slippery',
    notes: [
      'Lower tire pressures 1–3 psi for a bigger contact patch.',
      'Reduce brake pressure 5–10% and move balance slightly forward.',
      'Reduce differential accel lock to limit power-on slides.',
      'Add a touch of rear toe-in for stability.',
    ],
  },
];
