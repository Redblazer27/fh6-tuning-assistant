import { useEffect, useMemo, useState } from 'react';
import {
  encodeBuildToParam,
  type BuildRequest,
  type LockedSelections,
  type SavedBuild,
  type UpgradeCategory,
} from '@fh6/shared';
import { createDataStore, defaultStore, loadDataset } from '@fh6/data';
import { generateBuild } from '@fh6/engine';
import { CarPicker } from './components/CarPicker.tsx';
import { GoalWizard } from './components/GoalWizard.tsx';
import { Strategies } from './components/Strategies.tsx';
import { StrategyDetail } from './components/StrategyDetail.tsx';
import { SymptomPanel } from './components/SymptomPanel.tsx';
import { FeedbackPanel } from './components/FeedbackPanel.tsx';
import { TelemetryPanel } from './components/TelemetryPanel.tsx';
import { AdminPanel } from './components/AdminPanel.tsx';
import { Compare } from './components/Compare.tsx';
import { Trust } from './components/Trust.tsx';
import { decodeFromHash, defaultRequest, toSavedBuild } from './state.ts';
import {
  clearImportedDataset,
  deleteBuild,
  loadImportedDatasetRaw,
  loadSavedBuilds,
  saveBuild,
  saveImportedDatasetRaw,
  type StoredBuild,
} from './lib/storage.ts';

export function App() {
  const [datasetRaw, setDatasetRaw] = useState<unknown | null>(() => loadImportedDatasetRaw());
  const store = useMemo(() => {
    if (datasetRaw) {
      try {
        return createDataStore(loadDataset(datasetRaw));
      } catch {
        return defaultStore;
      }
    }
    return defaultStore;
  }, [datasetRaw]);
  const usingImported = store !== defaultStore;

  const initial = useMemo(() => decodeFromHash(location.hash), []);
  const [request, setRequest] = useState<BuildRequest>(() =>
    initial && store.getCar(initial.request.carId)
      ? initial.request
      : defaultRequest(store.cars[0]!.id),
  );
  const [locks, setLocks] = useState<LockedSelections>(() => initial?.lockedParts ?? {});
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>(
    () => initial?.strategyId ?? 'balanced',
  );
  const [savedBuilds, setSavedBuilds] = useState<StoredBuild[]>(() => loadSavedBuilds());
  const [telemetrySummary, setTelemetrySummary] = useState<Record<string, number> | undefined>();
  const [tab, setTab] = useState<'tune' | 'compare' | 'telemetry' | 'admin'>('tune');

  // If the active dataset no longer contains the selected car, reset safely.
  useEffect(() => {
    if (!store.getCar(request.carId)) {
      setRequest(defaultRequest(store.cars[0]!.id));
      setLocks({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  const carExists = !!store.getCar(request.carId);
  const result = useMemo(
    () => (carExists ? generateBuild(store, request, { locks }) : null),
    [store, request, locks, carExists],
  );

  const selected =
    result?.strategies.find((s) => s.id === selectedStrategyId) ?? result?.strategies[0];

  const label = result
    ? `${result.car.name} · ${request.discipline} · ${request.targetClass ?? request.targetPI ?? 'open'}`
    : 'build';
  const savedBuild: SavedBuild = toSavedBuild(
    request,
    selected?.id ?? selectedStrategyId,
    locks,
    store.dataset.version.dataVersion,
    label,
  );
  const buildParam = encodeBuildToParam(savedBuild);

  // Keep the URL a permanent, shareable permalink of the current build.
  useEffect(() => {
    history.replaceState(null, '', `${location.pathname}${location.search}#b=${buildParam}`);
  }, [buildParam]);

  const setLock = (category: UpgradeCategory, partId: string) =>
    setLocks((l) => ({ ...l, [category]: partId }));
  const removeLock = (category: UpgradeCategory) =>
    setLocks((l) => {
      const next = { ...l };
      delete next[category];
      return next;
    });

  const onSave = () => {
    const stored: StoredBuild = {
      id: String(Date.now()),
      savedAt: new Date().toISOString(),
      label,
      build: { ...savedBuild, createdAt: new Date().toISOString() },
    };
    setSavedBuilds(saveBuild(stored));
  };
  const onLoadBuild = (b: SavedBuild) => {
    if (!store.getCar(b.request.carId)) return;
    setRequest(b.request);
    setLocks(b.lockedParts ?? {});
    setSelectedStrategyId(b.strategyId);
  };

  return (
    <div className="app">
      <div className="topbar">
        <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" />
        <div>
          <h1>FH6 Tuning Assistant</h1>
          <div className="dim" style={{ fontSize: '0.8rem' }}>
            Build optimizer + tuning engine for Forza Horizon 6
          </div>
        </div>
        <div className="grow" />
        <span className="badge mono">{store.dataset.version.dataVersion}</span>
        {result && <span className={`badge ${result.overallConfidence}`}>{result.overallConfidence} confidence</span>}
      </div>

      <div className="grid cols-2">
        <CarPicker
          cars={store.cars}
          selectedId={request.carId}
          onSelect={(id) => {
            setRequest({ ...request, carId: id });
            setLocks({});
          }}
        />
        <GoalWizard request={request} store={store} onChange={setRequest} />
      </div>

      {result && selected ? (
        <>
          <div style={{ marginTop: 16 }}>
            <Strategies result={result} selectedId={selected.id} onSelect={setSelectedStrategyId} />
          </div>

          <div className="grid cols-2" style={{ marginTop: 16 }}>
            <StrategyDetail
              car={result.car}
              strategy={selected}
              store={store}
              locks={locks}
              onSetLock={setLock}
              onRemoveLock={removeLock}
            />

            <div className="stack">
              <Trust
                result={result}
                savedBuild={savedBuild}
                savedBuilds={savedBuilds}
                onSave={onSave}
                onLoad={onLoadBuild}
                onDelete={(id) => setSavedBuilds(deleteBuild(id))}
              />

              <div className="row">
                <button className={`pill ${tab === 'tune' ? 'active' : ''}`} onClick={() => setTab('tune')}>
                  Adjust
                </button>
                <button
                  className={`pill ${tab === 'compare' ? 'active' : ''}`}
                  onClick={() => setTab('compare')}
                >
                  Compare
                </button>
                <button
                  className={`pill ${tab === 'telemetry' ? 'active' : ''}`}
                  onClick={() => setTab('telemetry')}
                >
                  Telemetry
                </button>
                <button className={`pill ${tab === 'admin' ? 'active' : ''}`} onClick={() => setTab('admin')}>
                  Data
                </button>
              </div>

              {tab === 'tune' && (
                <>
                  <SymptomPanel input={request.input} />
                  <FeedbackPanel buildId={buildParam} telemetrySummary={telemetrySummary} />
                </>
              )}
              {tab === 'compare' && (
                <Compare store={store} request={request} initialCarId={request.carId} />
              )}
              {tab === 'telemetry' && (
                <TelemetryPanel
                  onSummary={setTelemetrySummary}
                  buildContext={{
                    dataVersion: store.dataset.version.dataVersion,
                    carId: result.car.id,
                    carName: result.car.name,
                    discipline: request.discipline,
                    drivetrain: selected.builtSpec.drivetrain,
                    targetClass: request.targetClass ?? null,
                    targetPI: request.targetPI ?? null,
                    strategyId: selected.id,
                    selection: selected.selection,
                    tune: selected.tune.tune,
                    estimatedPI: { pi: selected.pi.pi, uncertainty: selected.pi.uncertainty },
                    score: selected.score.total,
                  }}
                />
              )}
              {tab === 'admin' && (
                <AdminPanel
                  store={store}
                  usingImported={usingImported}
                  onImport={(raw) => {
                    saveImportedDatasetRaw(raw);
                    setDatasetRaw(raw);
                  }}
                  onReset={() => {
                    clearImportedDataset();
                    setDatasetRaw(null);
                  }}
                />
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="card" style={{ marginTop: 16 }}>
          Loading…
        </div>
      )}

      <div className="footer">
        Deterministic, open tuning engine. Estimated results — verify in-game and report back. Data is
        versioned with per-record source &amp; confidence; nothing uncertain is presented as exact. Official
        car list:{' '}
        <a href="https://forza.net/fh6cars" target="_blank" rel="noreferrer">
          forza.net/fh6cars
        </a>
        .
      </div>
    </div>
  );
}
