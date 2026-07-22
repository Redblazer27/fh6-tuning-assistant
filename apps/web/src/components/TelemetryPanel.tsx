import { useEffect, useRef, useState } from 'react';
import { summarizeTelemetry, type TelemetryFrame, type TelemetrySummary } from '@fh6/shared';
import { diagnoseTelemetry, type TelemetryDiagnosis } from '@fh6/engine';
import { DEFAULT_BRIDGE_WS, TelemetryClient, type TelemetryStatus } from '../lib/telemetry.ts';
import { fmt } from '../lib/format.ts';

const WHEELS = ['FL', 'FR', 'RL', 'RR'];

/** The current build, bundled into an exported session so a capture is self-describing. */
export interface SessionBuildContext {
  dataVersion: string;
  carId: string;
  carName: string;
  discipline: string;
  targetClass: string | null;
  targetPI: number | null;
  strategyId: string;
  selection: Record<string, string | undefined>;
  tune: unknown;
  estimatedPI: { pi: number; uncertainty: number };
  score: number;
}

/** Downsample frames to at most `cap` so an exported session stays a reasonable size. */
function downsample(frames: TelemetryFrame[], cap = 1500): TelemetryFrame[] {
  if (frames.length <= cap) return frames;
  const step = Math.ceil(frames.length / cap);
  return frames.filter((_, i) => i % step === 0);
}

export function TelemetryPanel({
  onSummary,
  buildContext,
}: {
  onSummary: (summary: Record<string, number>) => void;
  buildContext?: SessionBuildContext | null;
}) {
  const [url, setUrl] = useState(DEFAULT_BRIDGE_WS);
  const [status, setStatus] = useState<TelemetryStatus>('disconnected');
  const [frame, setFrame] = useState<TelemetryFrame | null>(null);
  const [recording, setRecording] = useState(false);
  const [recorded, setRecorded] = useState(0);
  const [diagnosis, setDiagnosis] = useState<TelemetryDiagnosis | null>(null);
  const [summary, setSummary] = useState<TelemetrySummary | null>(null);

  const clientRef = useRef<TelemetryClient | null>(null);
  const framesRef = useRef<TelemetryFrame[]>([]);
  const recordingRef = useRef(false);
  const lastUi = useRef(0);

  useEffect(() => () => clientRef.current?.disconnect(), []);

  const connect = () => {
    clientRef.current?.disconnect();
    const client = new TelemetryClient(url, {
      onStatus: setStatus,
      onFrame: (f) => {
        if (recordingRef.current) {
          framesRef.current.push(f);
          setRecorded(framesRef.current.length);
        }
        const now = performance.now();
        if (now - lastUi.current > 100) {
          lastUi.current = now;
          setFrame(f);
        }
      },
    });
    clientRef.current = client;
    client.connect(url);
  };

  const toggleRecord = () => {
    if (!recording) {
      framesRef.current = [];
      setRecorded(0);
      setDiagnosis(null);
      setSummary(null);
      recordingRef.current = true;
      setRecording(true);
    } else {
      recordingRef.current = false;
      setRecording(false);
      const summary = summarizeTelemetry(framesRef.current);
      setSummary(summary);
      setDiagnosis(diagnoseTelemetry(summary));
      onSummary({
        frames: summary.frames,
        durationSec: Number(summary.durationSec.toFixed(1)),
        topSpeedKmh: Number(summary.topSpeedKmh.toFixed(1)),
        understeerIndex: Number(summary.understeerIndex.toFixed(3)),
        meanSlipFL: Number(summary.meanCombinedSlip[0].toFixed(3)),
        meanSlipFR: Number(summary.meanCombinedSlip[1].toFixed(3)),
        meanSlipRL: Number(summary.meanCombinedSlip[2].toFixed(3)),
        meanSlipRR: Number(summary.meanCombinedSlip[3].toFixed(3)),
      });
    }
  };

  const exportSession = () => {
    if (!summary) return;
    const bundle = {
      kind: 'fh6-session',
      version: 1,
      recordedAt: new Date().toISOString(),
      // The build this session was driven with — so a capture is self-describing.
      build: buildContext ?? null,
      telemetry: {
        summary,
        diagnosis,
        // Full frames are 60 Hz; downsample so the file stays small but analyzable.
        frames: downsample(framesRef.current),
        totalFramesRecorded: framesRef.current.length,
      },
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const car = buildContext?.carId ?? 'car';
    const disc = buildContext?.discipline ?? 'session';
    a.download = `fh6-session-${car}-${disc}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>Live telemetry (FH6 Data Out)</h2>
        <span className="row" style={{ gap: 6 }}>
          <span className={`led ${status === 'connected' ? 'on' : ''}`} />
          <span className="dim">{status}</span>
        </span>
      </div>
      <p className="dim" style={{ marginTop: -4 }}>
        Run <code>npm run capture</code> and open this page at{' '}
        <code>http://localhost:8123</code>. In FH6: Settings → HUD and Gameplay → Data Out = On, IP
        127.0.0.1, Port 20440 (Data Out format = Car Dash). Then <b>Record a session</b>, drive a few
        corners, <b>Stop &amp; summarize</b>, and <b>Export session</b> to share the capture.
      </p>

      <div className="row">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          style={{ maxWidth: 240 }}
          aria-label="Bridge WebSocket URL"
        />
        <button onClick={connect}>Connect</button>
        <button onClick={() => clientRef.current?.disconnect()}>Disconnect</button>
        <button
          className={recording ? 'primary' : ''}
          onClick={toggleRecord}
          disabled={status !== 'connected'}
        >
          {recording ? `Stop & summarize (${recorded})` : 'Record session'}
        </button>
        <button onClick={exportSession} disabled={!summary || recording} title="Download this session (build + telemetry) as JSON to share">
          Export session
        </button>
      </div>

      {frame ? (
        <>
          <div className="telemetry-grid" style={{ marginTop: 12 }}>
            <Metric k="Speed" v={`${fmt(frame.speedKmh, 0)} km/h`} />
            <Metric k="RPM" v={fmt(frame.rpm, 0)} />
            <Metric k="Gear" v={String(frame.gear)} />
            <Metric k="Throttle" v={`${Math.round((frame.accel / 255) * 100)}%`} />
            <Metric k="Brake" v={`${Math.round((frame.brake / 255) * 100)}%`} />
            <Metric k="Power" v={`${fmt(frame.powerKw, 0)} kW`} />
          </div>
          <h3 style={{ marginTop: 12 }}>Tire combined slip</h3>
          <div className="telemetry-grid">
            {WHEELS.map((w, i) => (
              <Metric key={w} k={`Slip ${w}`} v={fmt(frame.combinedSlip[i] ?? 0, 2)} />
            ))}
          </div>
        </>
      ) : (
        <div className="notice info" style={{ marginTop: 10 }}>
          No frames yet. Connect the bridge and start driving in-game.
        </div>
      )}

      {diagnosis && (
        <div style={{ marginTop: 14 }}>
          <h3>Diagnosis from this session</h3>
          {diagnosis.findings.length === 0 ? (
            <p className="dim" style={{ marginTop: 0 }}>
              {diagnosis.notes.join(' ')}
            </p>
          ) : (
            <>
              {diagnosis.findings.map((f) => (
                <div key={f.symptomId} className="notice info" style={{ marginTop: 8 }}>
                  <div>
                    <strong>{f.label}</strong> <span className="dim">({f.severity})</span>
                  </div>
                  <div className="dim" style={{ fontSize: '0.8rem' }}>
                    {f.evidence}
                  </div>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                    {f.adjustments.map((a) => (
                      <li key={a.change} style={{ fontSize: '0.85rem' }}>
                        <strong>{a.change}</strong> — <span className="dim">{a.rationale}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <p className="dim" style={{ fontSize: '0.75rem', marginTop: 8 }}>
                Measured read of tire slip — try the smallest change first and re-record. Heuristic /
                low confidence until calibrated against real captures.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Metric({ k, v }: { k: string; v: string }) {
  return (
    <div className="metric">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
}
