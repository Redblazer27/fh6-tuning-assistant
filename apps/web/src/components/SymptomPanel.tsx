import { CONDITION_MODIFIERS, SYMPTOMS } from '@fh6/engine';
import type { InputDevice } from '@fh6/shared';
import { categoryLabel } from '../lib/format.ts';

export function SymptomPanel({ input }: { input: InputDevice }) {
  return (
    <div className="card">
      <h2>6 · Fix a handling problem</h2>
      <p className="dim" style={{ marginTop: -4 }}>
        Pick what you feel. Try the <strong>first</strong> change; only move down the list if you need
        more. These are tweaks on top of the baseline — they don’t change your saved tune.
      </p>

      {SYMPTOMS.map((s) => (
        <details key={s.id} className="tune-section">
          <summary>{s.label}</summary>
          <ol style={{ margin: '4px 0 10px', paddingLeft: 20 }}>
            {s.adjustments.map((a, i) => (
              <li key={i} style={{ marginBottom: 6 }}>
                <span className="badge" style={{ marginRight: 6 }}>
                  {a.area === 'general' ? 'general' : categoryLabel(a.area)}
                </span>
                <strong>{a.change}</strong>
                <div className="dim" style={{ fontSize: '0.82rem' }}>
                  {a.rationale}
                </div>
              </li>
            ))}
          </ol>
        </details>
      ))}

      <h3 style={{ marginTop: 12 }}>Conditions</h3>
      {CONDITION_MODIFIERS.filter((m) => m.id === input || m.id === 'wet').map((m) => (
        <details key={m.id} className="tune-section" open={m.id === input}>
          <summary>{m.label}</summary>
          <ul style={{ margin: '4px 0 10px', paddingLeft: 20 }}>
            {m.notes.map((n, i) => (
              <li key={i} className="dim" style={{ fontSize: '0.86rem' }}>
                {n}
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
