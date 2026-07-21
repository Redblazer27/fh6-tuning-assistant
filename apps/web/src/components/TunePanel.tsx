import { useState } from 'react';
import type { TuningCategory } from '@fh6/shared';
import type { BuildStrategy } from '@fh6/engine';
import type { Car } from '@fh6/data';
import { copyToClipboard, differentialLines, fmt, tuneToText } from '../lib/format.ts';

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
  const t = strategy.tune.tune;
  const u = t.units;
  const tn = strategy.tune.tunable;
  const rat = strategy.tune.rationale;

  const copy = async () => {
    const ok = await copyToClipboard(tuneToText(car, strategy));
    setCopied(ok);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>5 · In-game tune</h2>
        <button className="small" onClick={copy}>
          {copied ? 'Copied ✓' : 'Copy tune'}
        </button>
      </div>
      <p className="dim" style={{ marginTop: -4 }}>
        Enter in the FH6 tuning menu, top to bottom. “Needs part” means install that upgrade to unlock the
        section in-game.
      </p>

      <Section
        id="tires"
        title="Tires"
        tunable={tn.tires}
        rationale={rat.tires}
        rows={[
          ['Front pressure', `${fmt(t.tires.frontPsi)} psi`],
          ['Rear pressure', `${fmt(t.tires.rearPsi)} psi`],
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
          ['Front rate', `${fmt(t.springs.frontRate)} ${u.springRate}`],
          ['Rear rate', `${fmt(t.springs.rearRate)} ${u.springRate}`],
          ['Ride height front', `${fmt(t.springs.frontRideHeight)} ${u.rideHeight}`],
          ['Ride height rear', `${fmt(t.springs.rearRideHeight)} ${u.rideHeight}`],
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
                ['Front downforce', `${fmt(t.aero.frontDownforce, 0)} ${u.downforce}`],
                ['Rear downforce', `${fmt(t.aero.rearDownforce, 0)} ${u.downforce}`],
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
