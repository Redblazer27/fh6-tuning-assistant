import { useEffect, useRef, useState } from 'react';
import { summarizeTelemetry, type TelemetryFrame } from '@fh6/shared';
import { diagnoseTelemetry, type TelemetryDiagnosis } from '@fh6/engine';
import { DEFAULT_BRIDGE_WS, TelemetryClient, type TelemetryStatus } from '../lib/telemetry.ts';
import { fmt } from '../lib/format.ts';

const WHEELS = ['FL', 'FR', 'RL', 'RR'];

export function TelemetryPanel({
  onSummary,
}: {
  onSummary: (summary: Record<string, number>) => void;
}) {
  const [url, setUrl] = useState(DEFAULT_BRIDGE_WS);
  const [status, setStatus] = useState<TelemetryStatus>('disconnected');
  const [frame, setFrame] = useState<TelemetryFrame | null>(null);
  const [recording, setRecording] = useState(false);
  const [recorded, setRecorded] = useState(0);
  const [diagnosis, setDiagnosis] = useState<TelemetryDiagnosis | null>(null);

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
      recordingRef.current = true;
      setRecording(true);
    } else {
      recordingRef.current = false;
      setRecording(false);
      const summary = summarizeTelemetry(framesRef.current);
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
        Run the bridge, then in FH6: Settings → HUD and Gameplay → Data Out = On, IP 127.0.0.1, Port
        20440.
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
