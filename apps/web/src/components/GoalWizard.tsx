import {
  CLASS_LETTERS,
  DISCIPLINES,
  DISCIPLINE_LABELS,
  DRIVETRAINS,
  DRIVING_STYLES,
  INPUT_DEVICES,
  type BuildConstraints,
  type BuildRequest,
  type Drivetrain,
} from '@fh6/shared';
import type { DataStore } from '@fh6/data';

interface Props {
  request: BuildRequest;
  store: DataStore;
  onChange: (next: BuildRequest) => void;
}

export function GoalWizard({ request, store, onChange }: Props) {
  const set = (partial: Partial<BuildRequest>) => onChange({ ...request, ...partial });
  const setC = (partial: Partial<BuildConstraints>) =>
    onChange({ ...request, constraints: { ...request.constraints, ...partial } });
  const c = request.constraints;
  const engineSwaps = store.getPartsByCategory('engine_swap').filter((p) => p.tierRank > 0);

  return (
    <div className="card">
      <h2>2 · Goal</h2>

      <label>Activity</label>
      <div className="pill-group">
        {DISCIPLINES.map((d) => (
          <button
            key={d}
            className={`pill ${request.discipline === d ? 'active' : ''}`}
            onClick={() => set({ discipline: d })}
          >
            {DISCIPLINE_LABELS[d]}
          </button>
        ))}
      </div>

      <div className="grid cols-2">
        <div>
          <label>Target class</label>
          <select
            value={request.targetClass ?? ''}
            onChange={(e) => set({ targetClass: (e.target.value || null) as BuildRequest['targetClass'] })}
          >
            <option value="">No class cap</option>
            {CLASS_LETTERS.map((cl) => (
              <option key={cl} value={cl}>
                {cl}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Exact PI cap (optional)</label>
          <input
            type="number"
            min={100}
            max={999}
            placeholder="e.g. 800"
            value={request.targetPI ?? ''}
            onChange={(e) => set({ targetPI: e.target.value ? Number(e.target.value) : null })}
          />
        </div>
      </div>

      <div className="grid cols-2">
        <div>
          <label>Input</label>
          <div className="pill-group">
            {INPUT_DEVICES.map((i) => (
              <button
                key={i}
                className={`pill ${request.input === i ? 'active' : ''}`}
                onClick={() => set({ input: i })}
              >
                {i}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label>Driving style</label>
          <div className="pill-group">
            {DRIVING_STYLES.map((s) => (
              <button
                key={s}
                className={`pill ${request.drivingStyle === s ? 'active' : ''}`}
                onClick={() => set({ drivingStyle: s })}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      <h3 style={{ marginTop: 16 }}>Constraints</h3>
      <label className="checkbox">
        <input type="checkbox" checked={!!c.noSwaps} onChange={(e) => setC({ noSwaps: e.target.checked })} />
        No engine / drivetrain swaps
      </label>
      <label className="checkbox">
        <input type="checkbox" checked={!!c.noAero} onChange={(e) => setC({ noAero: e.target.checked })} />
        No aero (no wings/splitters)
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={!!c.stockLooking}
          onChange={(e) => setC({ stockLooking: e.target.checked })}
        />
        Keep it stock-looking (no visible parts)
      </label>

      <div className="grid cols-2">
        <div>
          <label>Preferred drivetrain</label>
          <select
            value={c.preferredDrivetrain ?? ''}
            disabled={!!c.noSwaps}
            onChange={(e) =>
              setC({ preferredDrivetrain: (e.target.value || null) as Drivetrain | null })
            }
          >
            <option value="">Keep stock</option>
            {DRIVETRAINS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Budget (credits)</label>
          <input
            type="number"
            min={0}
            step={1000}
            placeholder="unlimited"
            value={c.budgetCredits ?? ''}
            onChange={(e) => setC({ budgetCredits: e.target.value ? Number(e.target.value) : null })}
          />
        </div>
      </div>

      {engineSwaps.length > 0 && (
        <div>
          <label>Engine swap</label>
          <select
            value={c.preferredEngineSwapId ?? ''}
            disabled={!!c.noSwaps}
            onChange={(e) =>
              setC({
                preferredEngineSwapId: e.target.value || null,
                allowEngineSwap: e.target.value ? true : c.allowEngineSwap,
              })
            }
          >
            <option value="">Optimizer decides</option>
            {engineSwaps.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
