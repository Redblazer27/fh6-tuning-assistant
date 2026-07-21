import { useEffect, useMemo, useState } from 'react';
import { SYMPTOMS } from '@fh6/engine';
import type { Feedback } from '@fh6/data';
import { addFeedback, loadFeedback } from '../lib/storage.ts';

interface Props {
  buildId: string;
  telemetrySummary?: Record<string, number>;
}

function parseLap(input: string): number | undefined {
  const s = input.trim();
  if (!s) return undefined;
  const m = s.match(/^(\d+):(\d{1,2}(?:\.\d+)?)$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export function FeedbackPanel({ buildId, telemetrySummary }: Props) {
  const [list, setList] = useState<Feedback[]>([]);
  const [lap, setLap] = useState('');
  const [event, setEvent] = useState('');
  const [route, setRoute] = useState('');
  const [surface, setSurface] = useState('');
  const [notes, setNotes] = useState('');
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [attachTelemetry, setAttachTelemetry] = useState(true);

  useEffect(() => setList(loadFeedback(buildId)), [buildId]);

  const canSubmit = useMemo(
    () => lap.trim() !== '' || notes.trim() !== '' || symptoms.length > 0,
    [lap, notes, symptoms],
  );

  const submit = () => {
    const entry: Feedback = {
      buildId,
      createdAt: new Date().toISOString(),
      lapTimeSec: parseLap(lap),
      event: event || undefined,
      route: route || undefined,
      surface: surface || undefined,
      symptoms,
      notes: notes || undefined,
      telemetrySummary: attachTelemetry ? telemetrySummary : undefined,
    };
    addFeedback(entry);
    setList(loadFeedback(buildId));
    setLap('');
    setEvent('');
    setRoute('');
    setNotes('');
    setSymptoms([]);
  };

  const toggle = (id: string) =>
    setSymptoms((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  return (
    <div className="card">
      <h2>7 · Report real results</h2>
      <p className="dim" style={{ marginTop: -4 }}>
        Log what happened in-game. This is stored locally and used to suggest refinements — it never
        changes your baseline tune.
      </p>

      <div className="grid cols-2">
        <div>
          <label>Lap time (m:ss.s or seconds)</label>
          <input value={lap} onChange={(e) => setLap(e.target.value)} placeholder="1:32.4" />
        </div>
        <div>
          <label>Surface</label>
          <select value={surface} onChange={(e) => setSurface(e.target.value)}>
            <option value="">—</option>
            <option>tarmac</option>
            <option>dirt</option>
            <option>snow</option>
            <option>mixed</option>
          </select>
        </div>
        <div>
          <label>Event</label>
          <input value={event} onChange={(e) => setEvent(e.target.value)} placeholder="Road Series" />
        </div>
        <div>
          <label>Route</label>
          <input value={route} onChange={(e) => setRoute(e.target.value)} placeholder="Coastal Sprint" />
        </div>
      </div>

      <label>What did it do wrong? (optional)</label>
      <div className="pill-group">
        {SYMPTOMS.map((s) => (
          <button
            key={s.id}
            className={`pill ${symptoms.includes(s.id) ? 'active' : ''}`}
            onClick={() => toggle(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <label>Notes</label>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />

      {telemetrySummary && (
        <label className="checkbox">
          <input
            type="checkbox"
            checked={attachTelemetry}
            onChange={(e) => setAttachTelemetry(e.target.checked)}
          />
          Attach last telemetry session summary
        </label>
      )}

      <div className="row" style={{ marginTop: 8 }}>
        <button className="primary" disabled={!canSubmit} onClick={submit}>
          Save feedback
        </button>
      </div>

      {list.length > 0 && (
        <>
          <h3 style={{ marginTop: 16 }}>History ({list.length})</h3>
          <ul style={{ paddingLeft: 18 }}>
            {list.slice(0, 10).map((f, i) => (
              <li key={i} className="dim" style={{ fontSize: '0.85rem', marginBottom: 4 }}>
                {new Date(f.createdAt).toLocaleString()} —{' '}
                {f.lapTimeSec ? `${f.lapTimeSec.toFixed(2)}s ` : ''}
                {f.symptoms.length ? `[${f.symptoms.join(', ')}] ` : ''}
                {f.notes ?? ''}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
