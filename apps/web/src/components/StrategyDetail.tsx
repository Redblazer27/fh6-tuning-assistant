import type { UpgradeCategory, LockedSelections } from '@fh6/shared';
import type { BuildStrategy } from '@fh6/engine';
import type { Car, DataStore } from '@fh6/data';
import { categoryLabel, credits } from '../lib/format.ts';
import { TunePanel } from './TunePanel.tsx';

interface Props {
  car: Car;
  strategy: BuildStrategy;
  store: DataStore;
  locks: LockedSelections;
  onSetLock: (category: UpgradeCategory, partId: string) => void;
  onRemoveLock: (category: UpgradeCategory) => void;
}

export function StrategyDetail({ car, strategy, store, locks, onSetLock, onRemoveLock }: Props) {
  const upgrades = strategy.parts.filter((p) => p.isUpgrade);

  return (
    <div className="stack">
      <div className="card">
        <h2>4 · Parts to buy</h2>
        <p className="dim" style={{ marginTop: -4 }}>
          {upgrades.length} upgrades · {credits(strategy.totalCost)}. Change any part to override, or lock
          it and re-optimize the rest.
        </p>

        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Part</th>
                <th className="num">Cost</th>
                <th>Unlocks</th>
                <th>Lock</th>
              </tr>
            </thead>
            <tbody>
              {store.categories.map((category) => {
                const selectedId = strategy.selection[category];
                const options = store.getPartsByCategory(category);
                const locked = category in locks;
                const part = selectedId ? store.getPart(selectedId) : undefined;
                const isUpgrade = (part?.tierRank ?? 0) > 0;
                return (
                  <tr key={category} style={{ opacity: isUpgrade || locked ? 1 : 0.6 }}>
                    <td>{categoryLabel(category)}</td>
                    <td>
                      <select
                        value={selectedId ?? ''}
                        onChange={(e) => onSetLock(category, e.target.value)}
                        aria-label={`${categoryLabel(category)} part`}
                      >
                        {options.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="num">{part?.cost ? credits(part.cost) : '—'}</td>
                    <td className="dim" style={{ fontSize: '0.78rem' }}>
                      {part?.unlocks.length ? part.unlocks.join(', ') : ''}
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={locked}
                        onChange={(e) =>
                          e.target.checked
                            ? selectedId && onSetLock(category, selectedId)
                            : onRemoveLock(category)
                        }
                        aria-label={`Lock ${categoryLabel(category)}`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Why this ranked here</h2>
        <p className="dim" style={{ marginTop: -4 }}>
          Score {strategy.score.total.toFixed(1)} / 100 (balanced lens). Contributions:
        </p>
        <table>
          <thead>
            <tr>
              <th>Metric</th>
              <th className="num">Value</th>
              <th className="num">Weight</th>
              <th className="num">Points</th>
            </tr>
          </thead>
          <tbody>
            {strategy.score.components.map((c) => (
              <tr key={c.label}>
                <td>{c.label}</td>
                <td className="num">{c.value}</td>
                <td className="num">{(c.weight * 100).toFixed(0)}%</td>
                <td className="num">{c.contribution.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {strategy.pi.components.length > 0 && (
          <p className="dim" style={{ marginTop: 8, fontSize: '0.82rem' }}>
            PI vs stock ({strategy.pi.stockPI}):{' '}
            {strategy.pi.components.map((c) => `${c.label} ${c.delta >= 0 ? '+' : ''}${c.delta}`).join(', ')}{' '}
            → {strategy.pi.pi} ±{strategy.pi.uncertainty}.
          </p>
        )}
      </div>

      <TunePanel car={car} strategy={strategy} />
    </div>
  );
}
