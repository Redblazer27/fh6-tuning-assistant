import { useMemo, useState } from 'react';
import type { BuildRequest } from '@fh6/shared';
import type { DataStore } from '@fh6/data';
import { compareCars } from '@fh6/engine';

interface Props {
  store: DataStore;
  request: BuildRequest;
  /** The car currently being tuned — seeded into the comparison set. */
  initialCarId: string;
}

/**
 * Rank several cars for the current goal. The optimizer builds each car for the
 * same discipline + class/PI; ranking uses the transparent goal-fit score
 * (drivetrain and tire fit included) with weight balance as the tie-breaker.
 */
export function Compare({ store, request, initialCarId }: Props) {
  const [carIds, setCarIds] = useState<string[]>([initialCarId]);
  const [toAdd, setToAdd] = useState('');

  const result = useMemo(
    () => (carIds.length ? compareCars(store, carIds, request) : null),
    [store, carIds, request],
  );

  const add = () => {
    if (toAdd && !carIds.includes(toAdd)) setCarIds((ids) => [...ids, toAdd]);
    setToAdd('');
  };
  const remove = (id: string) => setCarIds((ids) => ids.filter((x) => x !== id));

  const goalLabel = `${request.discipline} · ${request.targetClass ?? request.targetPI ?? 'open'}`;

  return (
    <div className="card">
      <h2>Compare cars for this goal</h2>
      <p className="dim" style={{ marginTop: -4 }}>
        Ranks each car by the best build it can reach for <strong>{goalLabel}</strong>. Drivetrain and
        tire fit are already in the score; weight balance breaks ties between similar cars.
      </p>

      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <select
          value={toAdd}
          onChange={(e) => setToAdd(e.target.value)}
          aria-label="Add a car to compare"
        >
          <option value="">Add a car…</option>
          {store.cars.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button className="pill" onClick={add} disabled={!toAdd}>
          Add
        </button>
      </div>

      {result && result.rows.length > 0 ? (
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Car</th>
                <th>Drivetrain</th>
                <th className="num">Score</th>
                <th className="num">Est. PI</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r, i) => (
                <tr key={r.carId}>
                  <td>{i + 1}</td>
                  <td>
                    {r.car.name}
                    {!r.legal && <span className="dim"> · over cap</span>}
                    {r.weightDistEstimated && (
                      <span
                        className="dim"
                        title="No weight-distribution data — a neutral 50/50 is assumed for the balance tie-breaker."
                      >
                        {' '}
                        · est. balance
                      </span>
                    )}
                  </td>
                  <td>{r.drivetrain}</td>
                  <td className="num" title={`Goal-fit ${r.goalFitScore.toFixed(1)} + balance`}>
                    {r.comparisonScore.toFixed(1)}
                  </td>
                  <td className="num">
                    {r.pi} ±{r.bestStrategy.pi.uncertainty}
                  </td>
                  <td>
                    <button
                      className="pill"
                      onClick={() => remove(r.carId)}
                      aria-label={`Remove ${r.car.name}`}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="dim" style={{ marginTop: 12 }}>
          Add cars to compare them for this goal.
        </p>
      )}

      {result?.notes.map((n) => (
        <p key={n} className="dim" style={{ fontSize: '0.8rem', marginTop: 6 }}>
          {n}
        </p>
      ))}
    </div>
  );
}
