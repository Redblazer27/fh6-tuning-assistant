import type { PartInput } from '../types.ts';
import { CATEGORY_PHYSICS } from '../part-physics.ts';
import { DATA_VERSION } from './version.ts';

/**
 * Representative FH6 upgrade catalog (seed).
 *
 * Parts are modelled generically per category: choosing a part modifies the
 * built car's underlying spec (power, mass, grip, aero capability, drivetrain,
 * aspiration, tire compound), and the PI/tuning engine derive everything else
 * from that spec. Effect magnitudes are community-consensus estimates
 * (confidence: medium) or inferred (low) — never presented as exact.
 *
 * Every category includes a stock (tierRank 0) option so "no change" is a valid
 * choice for the optimizer, and every upgrade carries a `rationale` — the physics
 * and the reason it helps — shown alongside the part in the UI. Where the reason
 * is the same for every tier in a category it comes from CATEGORY_PHYSICS below;
 * parts whose physics differ from their category (e.g. turbo vs supercharger,
 * each tire compound) set their own. The shared CATEGORY_PHYSICS map (also used
 * as a load-time fallback for imported parts) lives in ../part-physics.ts.
 */

type PartSeed = Omit<PartInput, 'source' | 'confidence' | 'dataVersion'> &
  Partial<Pick<PartInput, 'source' | 'confidence' | 'dataVersion'>>;

const P = (p: PartSeed): PartInput => {
  const { rationale, ...rest } = p;
  return {
    source: 'community-tuning-consensus',
    confidence: 'medium',
    dataVersion: DATA_VERSION,
    // Every upgrade is explained: its own reason, else the category's physics.
    rationale: rationale ?? CATEGORY_PHYSICS[p.category],
    ...rest,
  };
};

const stock = (category: PartInput['category'], name: string): PartInput =>
  P({
    id: `${category}-stock`,
    category,
    name,
    tierRank: 0,
    tier: 'stock',
    rationale: 'Factory part — the baseline the upgrades improve on. No change to the car.',
  });

export const parts: PartInput[] = [
  // ---- Engine: power adders (multiplicative) --------------------------------
  stock('intake', 'Stock Intake'),
  P({
    id: 'intake-street',
    category: 'intake',
    name: 'Street Intake',
    tierRank: 1,
    tier: 'street',
    effects: { powerMultiplier: 1.015 },
    cost: 4000,
  }),
  P({
    id: 'intake-sport',
    category: 'intake',
    name: 'Sport Intake',
    tierRank: 2,
    tier: 'sport',
    effects: { powerMultiplier: 1.03 },
    cost: 8000,
  }),
  P({
    id: 'intake-race',
    category: 'intake',
    name: 'Race Intake',
    tierRank: 3,
    tier: 'race',
    effects: { powerMultiplier: 1.06 },
    cost: 18000,
  }),

  stock('exhaust', 'Stock Exhaust'),
  P({
    id: 'exhaust-street',
    category: 'exhaust',
    name: 'Street Exhaust',
    tierRank: 1,
    tier: 'street',
    effects: { powerMultiplier: 1.015 },
    cost: 4500,
  }),
  P({
    id: 'exhaust-sport',
    category: 'exhaust',
    name: 'Sport Exhaust',
    tierRank: 2,
    tier: 'sport',
    effects: { powerMultiplier: 1.03 },
    cost: 9000,
  }),
  P({
    id: 'exhaust-race',
    category: 'exhaust',
    name: 'Race Exhaust',
    tierRank: 3,
    tier: 'race',
    effects: { powerMultiplier: 1.05 },
    cost: 20000,
  }),

  stock('camshaft', 'Stock Camshaft'),
  P({
    id: 'camshaft-sport',
    category: 'camshaft',
    name: 'Sport Camshaft',
    tierRank: 1,
    tier: 'sport',
    effects: { powerMultiplier: 1.04 },
    cost: 14000,
  }),
  P({
    id: 'camshaft-race',
    category: 'camshaft',
    name: 'Race Camshaft',
    tierRank: 2,
    tier: 'race',
    effects: { powerMultiplier: 1.07 },
    cost: 30000,
  }),

  stock('valves', 'Stock Valves'),
  P({
    id: 'valves-sport',
    category: 'valves',
    name: 'Sport Valves',
    tierRank: 1,
    tier: 'sport',
    effects: { powerMultiplier: 1.03 },
    cost: 12000,
  }),
  P({
    id: 'valves-race',
    category: 'valves',
    name: 'Race Valves',
    tierRank: 2,
    tier: 'race',
    effects: { powerMultiplier: 1.05 },
    cost: 26000,
  }),

  stock('displacement', 'Stock Displacement'),
  P({
    id: 'displacement-up',
    category: 'displacement',
    name: 'Engine Bore/Stroke',
    tierRank: 1,
    tier: 'race',
    effects: { powerMultiplier: 1.08 },
    cost: 40000,
  }),

  stock('pistons_compression', 'Stock Pistons'),
  P({
    id: 'pistons-sport',
    category: 'pistons_compression',
    name: 'Sport Pistons/Compression',
    tierRank: 1,
    tier: 'sport',
    effects: { powerMultiplier: 1.04 },
    cost: 16000,
  }),
  P({
    id: 'pistons-race',
    category: 'pistons_compression',
    name: 'Race Pistons/Compression',
    tierRank: 2,
    tier: 'race',
    effects: { powerMultiplier: 1.07 },
    cost: 34000,
  }),

  stock('ignition', 'Stock Ignition'),
  P({
    id: 'ignition-sport',
    category: 'ignition',
    name: 'Sport Ignition',
    tierRank: 1,
    tier: 'sport',
    effects: { powerMultiplier: 1.02 },
    cost: 5000,
  }),
  P({
    id: 'ignition-race',
    category: 'ignition',
    name: 'Race Ignition',
    tierRank: 2,
    tier: 'race',
    effects: { powerMultiplier: 1.035 },
    cost: 12000,
  }),

  stock('fuel_system', 'Stock Fuel System'),
  P({
    id: 'fuel-sport',
    category: 'fuel_system',
    name: 'Sport Fuel System',
    tierRank: 1,
    tier: 'sport',
    effects: { powerMultiplier: 1.02 },
    cost: 6000,
  }),
  P({
    id: 'fuel-race',
    category: 'fuel_system',
    name: 'Race Fuel System',
    tierRank: 2,
    tier: 'race',
    effects: { powerMultiplier: 1.04 },
    cost: 15000,
  }),

  stock('intercooler', 'Stock Intercooler'),
  P({
    id: 'intercooler-sport',
    category: 'intercooler',
    name: 'Sport Intercooler',
    tierRank: 1,
    tier: 'sport',
    effects: { powerMultiplier: 1.02 },
    cost: 9000,
    notes: 'Most effective with forced induction.',
  }),
  P({
    id: 'intercooler-race',
    category: 'intercooler',
    name: 'Race Intercooler',
    tierRank: 2,
    tier: 'race',
    effects: { powerMultiplier: 1.04 },
    cost: 18000,
    notes: 'Most effective with forced induction.',
  }),

  stock('oil_cooling', 'Stock Oil & Cooling'),
  P({
    id: 'oil-race',
    category: 'oil_cooling',
    name: 'Race Oil & Cooling',
    tierRank: 1,
    tier: 'race',
    effects: { powerMultiplier: 1.01 },
    cost: 12000,
  }),

  stock('flywheel', 'Stock Flywheel'),
  P({
    id: 'flywheel-sport',
    category: 'flywheel',
    name: 'Sport Flywheel',
    tierRank: 1,
    tier: 'sport',
    effects: { launchMultiplier: 1.02, massKgDelta: -4 },
    cost: 9000,
  }),
  P({
    id: 'flywheel-race',
    category: 'flywheel',
    name: 'Race Flywheel',
    tierRank: 2,
    tier: 'race',
    effects: { launchMultiplier: 1.04, massKgDelta: -7 },
    cost: 20000,
  }),

  // ---- Forced induction / aspiration ---------------------------------------
  stock('forced_induction', 'Stock Aspiration'),
  P({
    id: 'fi-turbo',
    category: 'forced_induction',
    name: 'Turbocharger',
    tierRank: 1,
    tier: 'turbo',
    effects: { powerMultiplier: 1.25, massKgDelta: 15 },
    setsAspiration: 'turbo',
    cost: 45000,
    confidence: 'low',
    rationale:
      'A turbocharger uses exhaust energy to force-feed air — a big power jump for its weight, with some throttle lag before boost builds.',
  }),
  P({
    id: 'fi-twin-turbo',
    category: 'forced_induction',
    name: 'Twin Turbo',
    tierRank: 2,
    tier: 'twin_turbo',
    effects: { powerMultiplier: 1.35, massKgDelta: 22 },
    setsAspiration: 'twin_turbo',
    cost: 65000,
    confidence: 'low',
    rationale:
      'Two smaller turbos spool faster and flow more air than one — the largest forced-induction gain, at the most added weight.',
  }),
  P({
    id: 'fi-supercharger',
    category: 'forced_induction',
    name: 'Supercharger',
    tierRank: 1,
    tier: 'supercharged',
    effects: { powerMultiplier: 1.3, massKgDelta: 18 },
    setsAspiration: 'supercharged',
    cost: 55000,
    confidence: 'low',
    rationale:
      'A belt-driven supercharger boosts power with instant, lag-free response and strong low-end torque, at a parasitic drive cost.',
  }),
  P({
    id: 'fi-centrifugal',
    category: 'forced_induction',
    name: 'Centrifugal Supercharger',
    tierRank: 2,
    tier: 'centrifugal',
    effects: { powerMultiplier: 1.28, massKgDelta: 16 },
    setsAspiration: 'centrifugal',
    cost: 58000,
    confidence: 'low',
    rationale:
      'A centrifugal supercharger builds boost with revs — strong top-end power and less heat than a roots blower, with a more progressive delivery.',
  }),

  // ---- Conversions ----------------------------------------------------------
  stock('engine_swap', 'Stock Engine'),
  P({
    id: 'engine-swap-highperf',
    category: 'engine_swap',
    name: 'High-Performance Engine Swap',
    tierRank: 1,
    tier: 'swap',
    effects: { powerMultiplier: 1.6, massKgDelta: 30 },
    cost: 90000,
    confidence: 'low',
    notes: 'Generic swap estimate; real swaps set a specific engine/power.',
    rationale:
      'Drops in a much stronger engine for the largest possible power gain. Adds weight and can change the car’s balance; per-car swaps use the specific engine’s real power.',
  }),

  stock('drivetrain_swap', 'Stock Drivetrain'),
  P({
    id: 'dt-swap-awd',
    category: 'drivetrain_swap',
    name: 'AWD Conversion',
    tierRank: 1,
    tier: 'awd',
    effects: { massKgDelta: 40, launchMultiplier: 1.12 },
    setsDrivetrain: 'AWD',
    cost: 85000,
    confidence: 'low',
    rationale:
      'Drives all four wheels: far better launch and traction, especially on loose or wet surfaces — at a notable weight penalty. Great for drag, rally and off-road.',
  }),
  P({
    id: 'dt-swap-rwd',
    category: 'drivetrain_swap',
    name: 'RWD Conversion',
    tierRank: 1,
    tier: 'rwd',
    effects: { massKgDelta: -10 },
    setsDrivetrain: 'RWD',
    cost: 60000,
    confidence: 'low',
    rationale:
      'Drives the rear wheels — the cleaner steering feel and balance most circuit and drift builds want, and it sheds a little driveline weight.',
  }),
  P({
    id: 'dt-swap-fwd',
    category: 'drivetrain_swap',
    name: 'FWD Conversion',
    tierRank: 1,
    tier: 'fwd',
    effects: { massKgDelta: -15 },
    setsDrivetrain: 'FWD',
    cost: 50000,
    confidence: 'low',
    rationale:
      'Drives the front wheels — the lightest layout, but it limits power-down under acceleration and is rarely chosen for performance builds.',
  }),

  // ---- Brakes ---------------------------------------------------------------
  stock('brakes', 'Stock Brakes'),
  P({
    id: 'brakes-street',
    category: 'brakes',
    name: 'Street Brakes',
    tierRank: 1,
    tier: 'street',
    effects: { brakingMultiplier: 1.03 },
    cost: 7000,
  }),
  P({
    id: 'brakes-sport',
    category: 'brakes',
    name: 'Sport Brakes',
    tierRank: 2,
    tier: 'sport',
    effects: { brakingMultiplier: 1.06 },
    cost: 14000,
  }),
  P({
    id: 'brakes-race',
    category: 'brakes',
    name: 'Race Brakes',
    tierRank: 3,
    tier: 'race',
    effects: { brakingMultiplier: 1.1 },
    unlocks: ['brakes'],
    cost: 26000,
  }),

  // ---- Springs & dampers (suspension) --------------------------------------
  stock('springs_dampers', 'Stock Suspension'),
  P({
    id: 'susp-sport',
    category: 'springs_dampers',
    name: 'Sport Suspension',
    tierRank: 1,
    tier: 'sport',
    effects: { gripMultiplier: 1.02 },
    unlocks: ['alignment'],
    cost: 15000,
  }),
  P({
    id: 'susp-race',
    category: 'springs_dampers',
    name: 'Race Suspension',
    tierRank: 2,
    tier: 'race',
    effects: { gripMultiplier: 1.05 },
    unlocks: ['alignment', 'springs', 'damping'],
    cost: 32000,
  }),
  P({
    id: 'susp-rally',
    category: 'springs_dampers',
    name: 'Rally Suspension',
    tierRank: 2,
    tier: 'rally',
    effects: { gripMultiplier: 1.03 },
    unlocks: ['alignment', 'springs', 'damping'],
    cost: 32000,
    notes: 'Higher travel; better for dirt/rally.',
    rationale:
      'Rally coilovers add suspension travel and run softer rates to soak up bumps and keep the tires planted on dirt and gravel — the choice for loose surfaces.',
  }),
  P({
    id: 'susp-drift',
    category: 'springs_dampers',
    name: 'Drift Suspension',
    tierRank: 2,
    tier: 'drift',
    effects: { gripMultiplier: 1.02 },
    unlocks: ['alignment', 'springs', 'damping'],
    cost: 32000,
    rationale:
      'Drift coilovers favor a stiff, responsive setup with steering geometry that helps initiate and hold big slide angles.',
  }),

  // ---- Anti-roll bars -------------------------------------------------------
  // The small grip multiplier represents the real handling gain from being able
  // to tune roll balance (the part's value is the tunability it unlocks).
  stock('front_arb', 'Stock Front ARB'),
  P({
    id: 'arb-front-race',
    category: 'front_arb',
    name: 'Race Front Anti-roll Bar',
    tierRank: 1,
    tier: 'race',
    effects: { gripMultiplier: 1.008 },
    unlocks: ['antiroll_bars'],
    cost: 8000,
    confidence: 'low',
  }),
  stock('rear_arb', 'Stock Rear ARB'),
  P({
    id: 'arb-rear-race',
    category: 'rear_arb',
    name: 'Race Rear Anti-roll Bar',
    tierRank: 1,
    tier: 'race',
    effects: { gripMultiplier: 1.008 },
    unlocks: ['antiroll_bars'],
    cost: 8000,
    confidence: 'low',
  }),

  // ---- Chassis / weight -----------------------------------------------------
  stock('chassis_reinforcement', 'Stock Chassis'),
  P({
    id: 'chassis-street',
    category: 'chassis_reinforcement',
    name: 'Street Chassis Reinforcement',
    tierRank: 1,
    tier: 'street',
    effects: { gripMultiplier: 1.004, massKgDelta: 3 },
    cost: 6000,
  }),
  P({
    id: 'chassis-sport',
    category: 'chassis_reinforcement',
    name: 'Sport Chassis Reinforcement',
    tierRank: 2,
    tier: 'sport',
    effects: { gripMultiplier: 1.007, massKgDelta: 6 },
    cost: 11000,
  }),
  P({
    id: 'chassis-race',
    category: 'chassis_reinforcement',
    name: 'Roll Cage',
    tierRank: 3,
    tier: 'race',
    effects: { gripMultiplier: 1.01, massKgDelta: 10 },
    cost: 18000,
    rationale:
      'A welded-in roll cage is the stiffest reinforcement, so the suspension and alignment work exactly as tuned — the sharpest, most consistent handling, at a little safety weight.',
  }),

  stock('weight_reduction', 'Stock Weight'),
  P({
    id: 'weight-street',
    category: 'weight_reduction',
    name: 'Street Weight Reduction',
    tierRank: 1,
    tier: 'street',
    effects: { massMultiplier: 0.97 },
    cost: 12000,
  }),
  P({
    id: 'weight-sport',
    category: 'weight_reduction',
    name: 'Sport Weight Reduction',
    tierRank: 2,
    tier: 'sport',
    effects: { massMultiplier: 0.94 },
    cost: 26000,
  }),
  P({
    id: 'weight-race',
    category: 'weight_reduction',
    name: 'Race Weight Reduction',
    tierRank: 3,
    tier: 'race',
    effects: { massMultiplier: 0.9 },
    cost: 48000,
  }),

  // ---- Drivetrain -----------------------------------------------------------
  stock('clutch', 'Stock Clutch'),
  P({
    id: 'clutch-sport',
    category: 'clutch',
    name: 'Sport Clutch',
    tierRank: 1,
    tier: 'sport',
    effects: { launchMultiplier: 1.01 },
    cost: 6000,
  }),
  P({
    id: 'clutch-race',
    category: 'clutch',
    name: 'Race Clutch',
    tierRank: 2,
    tier: 'race',
    effects: { launchMultiplier: 1.03 },
    cost: 14000,
  }),

  stock('transmission', 'Stock Transmission'),
  P({
    id: 'trans-sport',
    category: 'transmission',
    name: 'Sport Transmission',
    tierRank: 1,
    tier: 'sport',
    effects: { launchMultiplier: 1.02 },
    cost: 16000,
  }),
  P({
    id: 'trans-race',
    category: 'transmission',
    name: 'Race Transmission',
    tierRank: 2,
    tier: 'race',
    effects: { launchMultiplier: 1.03 },
    unlocks: ['gearing'],
    cost: 36000,
    notes: 'Enables full gear-ratio + final-drive tuning.',
  }),

  stock('driveline', 'Stock Driveline'),
  P({
    id: 'driveline-sport',
    category: 'driveline',
    name: 'Sport Driveline',
    tierRank: 1,
    tier: 'sport',
    effects: { launchMultiplier: 1.01 },
    cost: 8000,
  }),
  P({
    id: 'driveline-race',
    category: 'driveline',
    name: 'Race Driveline',
    tierRank: 2,
    tier: 'race',
    effects: { launchMultiplier: 1.02 },
    cost: 18000,
  }),

  // The small launch/grip multipliers represent the traction & corner-exit gain
  // from a tunable limited-slip diff (the part's value is its tunability).
  stock('differential', 'Stock Differential'),
  P({
    id: 'diff-sport',
    category: 'differential',
    name: 'Sport Differential',
    tierRank: 1,
    tier: 'sport',
    effects: { launchMultiplier: 1.01, gripMultiplier: 1.005 },
    unlocks: ['differential'],
    cost: 14000,
    confidence: 'low',
  }),
  P({
    id: 'diff-race',
    category: 'differential',
    name: 'Race Differential',
    tierRank: 2,
    tier: 'race',
    effects: { launchMultiplier: 1.02, gripMultiplier: 1.01 },
    unlocks: ['differential'],
    cost: 30000,
    confidence: 'low',
  }),
  P({
    id: 'diff-rally',
    category: 'differential',
    name: 'Rally Differential',
    tierRank: 2,
    tier: 'rally',
    effects: { launchMultiplier: 1.018, gripMultiplier: 1.008 },
    unlocks: ['differential'],
    cost: 30000,
    confidence: 'low',
  }),
  P({
    id: 'diff-drift',
    category: 'differential',
    name: 'Drift Differential',
    tierRank: 2,
    tier: 'drift',
    effects: { launchMultiplier: 1.015 },
    unlocks: ['differential'],
    cost: 30000,
    confidence: 'low',
    rationale:
      'A drift diff runs near-locked so both rear wheels spin together — essential for breaking traction smoothly and sustaining a slide.',
  }),
  P({
    id: 'diff-offroad',
    category: 'differential',
    name: 'Off-road Differential',
    tierRank: 2,
    tier: 'offroad',
    effects: { launchMultiplier: 1.018, gripMultiplier: 1.008 },
    unlocks: ['differential'],
    cost: 30000,
    confidence: 'low',
  }),

  // ---- Tires & rims ---------------------------------------------------------
  // Compounds set the tire's grip and the surface it works on. Per-compound
  // rationale explains the trade-off — raw tarmac grip is not always the goal
  // (drift tires and drag tires trade lateral grip for control / launch).
  stock('tire_compound', 'Stock Tires'),
  P({
    id: 'tire-street',
    category: 'tire_compound',
    name: 'Street Tires',
    tierRank: 1,
    tier: 'street',
    setsTireCompound: 'street',
    cost: 9000,
    rationale: 'Street tires: a modest grip bump over stock for road driving.',
  }),
  P({
    id: 'tire-sport',
    category: 'tire_compound',
    name: 'Sport Tires',
    tierRank: 2,
    tier: 'sport',
    setsTireCompound: 'sport',
    cost: 18000,
    rationale: 'Sport tires: noticeably more tarmac grip for spirited road and light track use.',
  }),
  P({
    id: 'tire-semi-slick',
    category: 'tire_compound',
    name: 'Semi-Slick Tires',
    tierRank: 3,
    tier: 'semi_slick',
    setsTireCompound: 'semi_slick',
    cost: 30000,
    rationale: 'Semi-slick tires: near-race tarmac grip that is still usable in the cold and wet.',
  }),
  P({
    id: 'tire-slick',
    category: 'tire_compound',
    name: 'Race (Slick) Tires',
    tierRank: 4,
    tier: 'slick',
    setsTireCompound: 'slick',
    cost: 45000,
    rationale:
      'Race slicks: the most tarmac grip available — the default for circuit and top-speed builds, but useless on loose surfaces.',
  }),
  P({
    id: 'tire-drag',
    category: 'tire_compound',
    name: 'Drag Tires',
    tierRank: 4,
    tier: 'drag',
    setsTireCompound: 'drag',
    effects: { launchMultiplier: 1.12 },
    cost: 40000,
    rationale:
      'Drag tires: maximum straight-line launch. Since the June 15 FH6 physics update their cornering grip is deliberately poor, so use them only for drag.',
  }),
  P({
    id: 'tire-rally',
    category: 'tire_compound',
    name: 'Rally Tires',
    tierRank: 3,
    tier: 'rally',
    setsTireCompound: 'rally',
    cost: 30000,
    rationale:
      'Rally tires: grippy on dirt and gravel while still workable on tarmac — the all-surface choice.',
  }),
  P({
    id: 'tire-offroad',
    category: 'tire_compound',
    name: 'Off-road Tires',
    tierRank: 3,
    tier: 'offroad',
    setsTireCompound: 'offroad',
    cost: 30000,
    rationale:
      'Off-road tires: maximum grip on loose, rough terrain, at the cost of tarmac grip — for cross-country.',
  }),
  P({
    id: 'tire-drift',
    category: 'tire_compound',
    name: 'Drift Tires',
    tierRank: 3,
    tier: 'drift',
    setsTireCompound: 'drift',
    cost: 30000,
    rationale:
      'Drift tires: tuned for a smooth, controllable breakaway so you can hold big angles — lower outright grip than slicks, but that is the point.',
  }),
  P({
    id: 'tire-snow',
    category: 'tire_compound',
    name: 'Snow Tires',
    tierRank: 3,
    tier: 'snow',
    setsTireCompound: 'snow',
    cost: 30000,
    rationale: 'Snow tires: the only compound that grips on snow and ice.',
  }),

  stock('front_tire_width', 'Stock Front Tire Width'),
  P({
    id: 'front-width-1',
    category: 'front_tire_width',
    name: 'Front Tires +1 Width',
    tierRank: 1,
    tier: '+1',
    effects: { gripMultiplier: 1.015, massKgDelta: 3 },
    cost: 6000,
  }),
  P({
    id: 'front-width-2',
    category: 'front_tire_width',
    name: 'Front Tires +2 Width',
    tierRank: 2,
    tier: '+2',
    effects: { gripMultiplier: 1.03, massKgDelta: 6 },
    cost: 12000,
  }),

  stock('rear_tire_width', 'Stock Rear Tire Width'),
  P({
    id: 'rear-width-1',
    category: 'rear_tire_width',
    name: 'Rear Tires +1 Width',
    tierRank: 1,
    tier: '+1',
    effects: { gripMultiplier: 1.015, massKgDelta: 3 },
    cost: 6000,
  }),
  P({
    id: 'rear-width-2',
    category: 'rear_tire_width',
    name: 'Rear Tires +2 Width',
    tierRank: 2,
    tier: '+2',
    effects: { gripMultiplier: 1.03, massKgDelta: 6 },
    cost: 12000,
  }),

  stock('rim_style', 'Stock Rims'),
  P({
    id: 'rim-sport',
    category: 'rim_style',
    name: 'Lightweight Sport Rims',
    tierRank: 1,
    tier: 'sport',
    effects: { massKgDelta: -6 },
    cosmeticVisible: true,
    cost: 10000,
  }),

  stock('rim_size', 'Stock Rim Size'),
  P({
    id: 'rim-size-up',
    category: 'rim_size',
    name: 'Larger Rims (+grip, +mass)',
    tierRank: 1,
    tier: '+1',
    effects: { gripMultiplier: 1.01, massKgDelta: 4 },
    cosmeticVisible: true,
    cost: 5000,
  }),

  // ---- Aero -----------------------------------------------------------------
  stock('front_aero', 'Stock Front Aero'),
  P({
    id: 'front-aero-race',
    category: 'front_aero',
    name: 'Race Front Splitter',
    tierRank: 1,
    tier: 'race',
    effects: { aeroFront: { minKgf: 0, maxKgf: 120 } },
    unlocks: ['aero'],
    isAeroPart: true,
    cosmeticVisible: true,
    cost: 15000,
  }),

  stock('rear_aero', 'Stock Rear Aero'),
  P({
    id: 'rear-aero-race',
    category: 'rear_aero',
    name: 'Race Rear Wing',
    tierRank: 1,
    tier: 'race',
    effects: { aeroRear: { minKgf: 0, maxKgf: 260 } },
    unlocks: ['aero'],
    isAeroPart: true,
    cosmeticVisible: true,
    cost: 20000,
  }),

  // ---- Body kits ------------------------------------------------------------
  // Widebody is the one body kit with a real performance effect (wider track +
  // tires → grip). It is offered only to cars whose profile lists real
  // bodyKitOptions (see getAvailablePartsByCategory); other cars get stock only.
  stock('body_kit', 'Stock Body'),
  P({
    id: 'body-widebody',
    category: 'body_kit',
    name: 'Widebody Kit',
    tierRank: 1,
    tier: 'widebody',
    effects: { gripMultiplier: 1.02, massKgDelta: 6 },
    cosmeticVisible: true,
    cost: 22000,
  }),
];
