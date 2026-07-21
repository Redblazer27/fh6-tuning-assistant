import { useRef, useState } from 'react';
import { loadDataset, type DataStore } from '@fh6/data';

interface Props {
  store: DataStore;
  usingImported: boolean;
  onImport: (raw: unknown) => void;
  onReset: () => void;
}

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function AdminPanel({ store, usingImported, onImport, onReset }: Props) {
  const [msg, setMsg] = useState<{ kind: 'info' | 'bad'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const tryImport = (text: string) => {
    try {
      const parsed = JSON.parse(text);
      loadDataset(parsed); // validate (throws on any problem)
      onImport(parsed);
      setMsg({ kind: 'info', text: 'Dataset imported and validated. It now backs the app.' });
    } catch (e) {
      setMsg({ kind: 'bad', text: `Import failed: ${(e as Error).message}` });
    }
  };

  const onFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => tryImport(String(reader.result));
    reader.readAsText(file);
  };

  const v = store.dataset.version;

  return (
    <div className="card">
      <h2>Admin · data</h2>
      <p className="dim" style={{ marginTop: -4 }}>
        Data is versioned with per-record source &amp; confidence. Correct or expand it here — imports are
        validated before they’re used.
      </p>

      <div className="notice info">
        <strong>{v.gameVersion}</strong> · data version <span className="mono">{v.dataVersion}</span> ·{' '}
        {store.dataset.cars.length} cars · {store.dataset.parts.length} parts
        {usingImported && ' · (using imported dataset)'}
      </div>

      <div className="row">
        <button onClick={() => download(`fh6-dataset-${v.dataVersion}.json`, JSON.stringify(store.dataset, null, 2))}>
          Export dataset JSON
        </button>
        <button onClick={() => fileRef.current?.click()}>Import dataset JSON…</button>
        {usingImported && (
          <button className="ghost" onClick={onReset}>
            Reset to seed
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
      </div>

      {msg && (
        <div className={`notice ${msg.kind === 'bad' ? 'bad' : 'info'}`} style={{ marginTop: 8 }}>
          {msg.text}
        </div>
      )}
    </div>
  );
}
