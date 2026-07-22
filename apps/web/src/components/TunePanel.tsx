import { useState } from 'react';
import type { TuningCategory } from '@fh6/shared';
import type { BuildStrategy } from '@fh6/engine';
import type { Car } from '@fh6/data';
import {
  copyToClipboard,
  differentialLines,
  downforceText,
  fmt,
  pressureText,
  rideHeightText,
  springText,
  tuneToText,
  type UnitSystem,
} from '../lib/format.ts';

const UNITS_KEY = 'fh6-units';
const initialUnitSystem = (): UnitSystem =>
  (typeof localStorage !== 'undefined' && localStorage.getItem(UNITS_KEY)) === 'imperial'
    ? 'imperial'
    : 'metric';

interface Props {
  car: Car;
  strategy: BuildStrategy;
}

function Section({
  id,
  title,
  tunable,
  rationale,
  rows,
}: {
  id: TuningCategory;
  title: string;
  tunable: boolean;
  rationale?: string;
  rows: [string, string][];
}) {
  return (
    <details className={`tune-section ${tunable ? '' : 'locked'}`} open>
      <summary>
        {title} {!tunable && <span className="badge">needs part</span>}
      </summary>
      <table>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={`${id}-${k}`}>
              <td className="dim">{k}</td>
              <td className="num mono">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rationale && <div className="rationale">{rationale}</div>}
    </details>
  );
}

export function TunePanel({ car, strategy }: Props) {
  const [copied, setCopied] = useState(false);
  const [system, setSystem] = useState<UnitSystem>(initialUnitSystem);
  const t = strategy.tune.tune;
  const u = t.units;
  const tn = strategy.tune.tunable;
  const rat = strategy.tune.rationale;

  const chooseUnits = (next: UnitSystem) => {
    setSystem(next);
    try {
      localStorage.setItem(UNITS_KEY, next);
    } catch {
      /* ignore storage errors (private mode) */
    }
  };

  const copy = async () => {
    const ok = await copyToClipboard(tuneToText(car, strategy, system));
    setCopied(ok);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>5 · In-game tune</h2>
        <div className="row" style={{ gap: 8 }}>
          <div className="pill-group">
            <button
              className={`pill ${system === 'metric' ? 'active' : ''}`}
              onClick={() => chooseUnits('metric')}
            >
              metric
            </button>
            <button
              className={`pill ${system === 'imperial' ? 'active' : ''}`}
              onClick={() => chooseUnits('imperial')}
            >
              imperial
            </button>
          </div>
          <button className="small" onClick={copy}>
            {copied ? 'Copied ✓' : 'Copy tune'}
          </button>
        </div>
      </div>
      <p className="dim" style={{ marginTop: -4 }}>
        Enter in the FH6 tuning menu, top to bottom. “Needs part” means install that upgrade to unlock the
        section in-game. Set the same units ({system}) in your FH6 settings so the numbers match.
      </p>

      <Section
        id="tires"
        title="Tires"
        tunable={tn.tires}
        rationale={rat.tires}
        rows={[
          ['Front pressure', pressureText(t.tires.frontPsi, system)],
          ['Rear pressure', pressureText(t.tires.rearPsi, system)],
        ]}
      />
      <Section
        id="gearing"
        title="Gearing"
        tunable={tn.gearing}
        rationale={rat.gearing}
        rows={[
          ['Final drive', fmt(t.gearing.finalDrive, 2)],
          ...t.gearing.gears.map((g, i): [string, string] => [`${i + 1}. gear`, fmt(g, 2)]),
        ]}
      />
      <Section
        id="alignment"
        title="Alignment"
        tunable={tn.alignment}
        rationale={rat.alignment}
        rows={[
          ['Camber front', `${fmt(t.alignment.camberFrontDeg)}°`],
          ['Camber rear', `${fmt(t.alignment.camberRearDeg)}°`],
          ['Toe front', `${fmt(t.alignment.toeFrontDeg)}°`],
          ['Toe rear', `${fmt(t.alignment.toeRearDeg)}°`],
          ['Caster', `${fmt(t.alignment.casterDeg)}°`],
        ]}
      />
      <Section
        id="antiroll_bars"
        title="Anti-roll bars"
        tunable={tn.antiroll_bars}
        rationale={rat.antiroll_bars}
        rows={[
          ['Front', fmt(t.antiRollBars.front)],
          ['Rear', fmt(t.antiRollBars.rear)],
        ]}
      />
      <Section
        id="springs"
        title="Springs"
        tunable={tn.springs}
        rationale={rat.springs}
        rows={[
          ['Front rate', springText(t.springs.frontRate, u.springRate, system)],
          ['Rear rate', springText(t.springs.rearRate, u.springRate, system)],
          ['Ride height front', rideHeightText(t.springs.frontRideHeight, u.rideHeight, system)],
          ['Ride height rear', rideHeightText(t.springs.rearRideHeight, u.rideHeight, system)],
        ]}
      />
      <Section
        id="damping"
        title="Damping"
        tunable={tn.damping}
        rationale={rat.damping}
        rows={[
          ['Rebound front', fmt(t.damping.reboundFront)],
          ['Rebound rear', fmt(t.damping.reboundRear)],
          ['Bump front', fmt(t.damping.bumpFront)],
          ['Bump rear', fmt(t.damping.bumpRear)],
        ]}
      />
      <Section
        id="aero"
        title="Aero"
        tunable={tn.aero}
        rationale={rat.aero}
        rows={
          t.aero
            ? [
                ['Front downforce', downforceText(t.aero.frontDownforce, u.downforce, system)],
                ['Rear downforce', downforceText(t.aero.rearDownforce, u.downforce, system)],
              ]
            : [['Aero', 'none / not applicable']]
        }
      />
      <Section
        id="brakes"
        title="Brakes"
        tunable={tn.brakes}
        rationale={rat.brakes}
        rows={[
          ['Balance', `${fmt(t.brakes.balanceFrontPct, 0)}% front`],
          ['Pressure', `${fmt(t.brakes.pressurePct, 0)}%`],
        ]}
      />
      <Section
        id="differential"
        title="Differential"
        tunable={tn.differential}
        rationale={rat.differential}
        rows={differentialLines(t.differential)}
      />
    </div>
  );
}
