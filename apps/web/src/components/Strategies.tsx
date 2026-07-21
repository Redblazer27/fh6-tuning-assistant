import type { GenerateResult } from '@fh6/engine';
import { credits } from '../lib/format.ts';

interface Props {
  result: GenerateResult;
  selectedId: string;
  onSelect: (id: string) => void;
}

export function Strategies({ result, selectedId, onSelect }: Props) {
  return (
    <div className="card">
      <h2>3 · Build strategies</h2>
      <p className="dim" style={{ marginTop: -4 }}>
        Ranked by a fair (balanced) score for {result.discipline.replace('_', ' ')}. Pick one to see
        parts + tune.
      </p>

      {result.warnings.map((w, i) => (
        <div key={i} className={`notice ${w.includes('already exceeds') ? 'bad' : 'warn'}`}>
          {w}
        </div>
      ))}

      <div className="grid cols-3" style={{ marginTop: 8 }}>
        {result.strategies.map((s) => (
          <div
            key={s.id}
            className={`strategy ${s.id === selectedId ? 'active' : ''}`}
            onClick={() => onSelect(s.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onSelect(s.id)}
          >
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>{s.label}</strong>
              <span className={`badge ${s.legal ? 'high' : 'low'}`}>
                {s.legal ? 'legal' : 'over cap'}
              </span>
            </div>
            <div className="pi">
              {s.pi.pi}
              <span className="dim" style={{ fontSize: '0.8rem', fontWeight: 400 }}>
                {' '}
                ±{s.pi.uncertainty} · {s.pi.class}
              </span>
            </div>
            <div className="bar" title={`Score ${s.score.total.toFixed(1)} / 100`}>
              <span style={{ width: `${Math.min(100, s.score.total)}%` }} />
            </div>
            <div className="row dim" style={{ justifyContent: 'space-between', marginTop: 6 }}>
              <span>Score {s.score.total.toFixed(1)}</span>
              <span>{credits(s.totalCost)}</span>
            </div>
            {!s.legal && s.legality.violations[0] && (
              <div className="dim" style={{ fontSize: '0.78rem', marginTop: 4 }}>
                {s.legality.violations[0]}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
