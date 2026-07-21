import { useMemo, useState } from 'react';
import type { Car } from '@fh6/data';

interface Props {
  cars: Car[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export function CarPicker({ cars, selectedId, onSelect }: Props) {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return cars;
    return cars.filter((c) =>
      `${c.year} ${c.make} ${c.model} ${c.name} ${c.drivetrain ?? ''} ${c.stockClass}`
        .toLowerCase()
        .includes(needle),
    );
  }, [cars, q]);

  return (
    <div className="card">
      <h2>1 · Pick a car</h2>
      <input
        type="search"
        placeholder="Search year, make, model, drivetrain…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search cars"
      />
      <div className="car-list" style={{ marginTop: 10 }}>
        {filtered.map((c) => (
          <div
            key={c.id}
            className={`car-item ${c.id === selectedId ? 'active' : ''}`}
            onClick={() => onSelect(c.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onSelect(c.id)}
          >
            <div>
              <div>{c.name}</div>
              <div className="meta">
                {[
                  c.drivetrain,
                  typeof c.powerHp === 'number' ? `${c.powerHp} hp` : null,
                  typeof c.massKg === 'number' ? `${Math.round(c.massKg)} kg` : null,
                  c.ownership,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
            <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
              <div>
                <strong>{c.stockClass}</strong> <span className="dim">{c.stockPI}</span>
              </div>
              <span className={`badge ${c.confidence}`}>{c.confidence}</span>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="dim">No cars match “{q}”.</div>}
      </div>
    </div>
  );
}
