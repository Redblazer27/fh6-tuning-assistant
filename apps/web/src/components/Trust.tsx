import { useRef, useState } from 'react';
import { parseBuildExport, toBuildExport, type SavedBuild } from '@fh6/shared';
import type { GenerateResult } from '@fh6/engine';
import { shareUrl } from '../state.ts';
import { copyToClipboard } from '../lib/format.ts';
import type { StoredBuild } from '../lib/storage.ts';

interface Props {
  result: GenerateResult;
  savedBuild: SavedBuild;
  savedBuilds: StoredBuild[];
  onSave: () => void;
  onLoad: (b: SavedBuild) => void;
  onDelete: (id: string) => void;
}

function download(name: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function Trust({ result, savedBuild, savedBuilds, onSave, onLoad, onDelete }: Props) {
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const copyLink = async () => {
    const ok = await copyToClipboard(shareUrl(savedBuild));
    setCopied(ok);
    setTimeout(() => setCopied(false), 1500);
  };

  const importFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const build = parseBuildExport(String(reader.result));
      if (build) onLoad(build);
    };
    reader.readAsText(file);
  };

  return (
    <div className="card">
      <h2>
        Confidence &amp; trust <span className={`badge ${result.overallConfidence}`}>{result.overallConfidence}</span>
      </h2>

      <div className="row" style={{ marginBottom: 8 }}>
        <button className="primary" onClick={onSave}>
          Save build
        </button>
        <button onClick={copyLink}>{copied ? 'Link copied ✓' : 'Copy share link'}</button>
        <button
          onClick={() =>
            download(`fh6-build-${savedBuild.request.carId}.json`, JSON.stringify(toBuildExport(savedBuild), null, 2))
          }
        >
          Export JSON
        </button>
        <button onClick={() => fileRef.current?.click()}>Import build…</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])}
        />
      </div>

      <details className="tune-section" open>
        <summary>Assumptions &amp; data version</summary>
        <ul style={{ paddingLeft: 18, margin: '4px 0' }}>
          {result.assumptions.map((a, i) => (
            <li key={i} className="dim" style={{ fontSize: '0.84rem' }}>
              {a}
            </li>
          ))}
        </ul>
      </details>

      <div className="notice" style={{ fontSize: '0.82rem' }}>
        {result.disclaimer}
      </div>

      {savedBuilds.length > 0 && (
        <>
          <h3 style={{ marginTop: 12 }}>Saved builds</h3>
          <ul style={{ paddingLeft: 0, listStyle: 'none', margin: 0 }}>
            {savedBuilds.map((b) => (
              <li key={b.id} className="row" style={{ justifyContent: 'space-between', padding: '4px 0' }}>
                <button className="ghost small" onClick={() => onLoad(b.build)} style={{ textAlign: 'left' }}>
                  {b.label}
                </button>
                <button className="ghost small" onClick={() => onDelete(b.id)} aria-label="Delete">
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
