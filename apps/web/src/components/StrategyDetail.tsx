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
                // Car-aware list: a car's profile may lock a category or restrict
                // parts, so this can be a subset of the global catalog.
                const options = store.getAvailablePartsByCategory(car.id, category);
                const canUpgrade = options.some((o) => o.tierRank > 0);
                const locked = category in locks;
                const part = selectedId ? store.getPart(selectedId) : undefined;
                const isUpgrade = (part?.tierRank ?? 0) > 0;
                // The real body-kit names this car offers (we model them as one
                // generic Widebody part, but show the actual kits from the wiki).
                const bodyKits =
                  category === 'body_kit'
                    ? (store.getUpgradeProfile(car.id)?.bodyKitOptions ?? [])
                    : [];
                return (
                  <tr key={category} style={{ opacity: isUpgrade || locked ? 1 : 0.6 }}>
                    <td>
                      {categoryLabel(category)}
                      {!canUpgrade && (
                        <span
                          className="dim"
                          title="This car cannot upgrade this category (stock only)."
                          style={{ display: 'block', fontSize: '0.72rem' }}
                        >
                          🔒 not upgradable
                        </span>
                      )}
                    </td>
                    <td>
                      <select
                        value={selectedId ?? ''}
                        onChange={(e) => onSetLock(category, e.target.value)}
                        aria-label={`${categoryLabel(category)} part`}
                        disabled={!canUpgrade}
                      >
                        {options.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                      {isUpgrade && part?.rationale && (
                        <span
                          className="dim"
                          style={{ display: 'block', fontSize: '0.74rem', marginTop: 2 }}
                        >
                          {part.rationale}
                        </span>
                      )}
                      {bodyKits.length > 0 && (
                        <span
                          className="dim"
                          style={{ display: 'block', fontSize: '0.72rem', marginTop: 2 }}
                        >
                          Kits: {bodyKits.join(', ')}
                        </span>
                      )}
                    </td>
                    <td className="num">{part?.cost ? credits(part.cost) : '—'}</td>
                    <td className="dim" style={{ fontSize: '0.78rem' }}>
                      {part?.unlocks.length ? part.unlocks.join(', ') : ''}
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={locked}
                        disabled={!canUpgrade}
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
            {strategy.score.components
              .filter((c) => c.weight > 0.0001)
              .map((c) => (
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
