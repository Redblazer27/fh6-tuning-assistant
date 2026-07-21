import type { TelemetryFrame } from '@fh6/shared';

export type TelemetryStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface TelemetryHandlers {
  onFrame: (frame: TelemetryFrame) => void;
  onStatus: (status: TelemetryStatus) => void;
}

/**
 * Connects to the local telemetry bridge over WebSocket and forwards decoded
 * FH6 frames. The bridge does the UDP work; the browser only consumes JSON.
 * Auto-reconnects with a small backoff while `active`.
 */
export class TelemetryClient {
  private ws: WebSocket | null = null;
  private active = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private url: string,
    private handlers: TelemetryHandlers,
  ) {}

  connect(url?: string): void {
    if (url) this.url = url;
    this.active = true;
    this.open();
  }

  disconnect(): void {
    this.active = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.handlers.onStatus('disconnected');
  }

  private open(): void {
    this.handlers.onStatus('connecting');
    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this.handlers.onStatus('error');
      this.scheduleReconnect();
      return;
    }
    this.ws.onopen = () => this.handlers.onStatus('connected');
    this.ws.onmessage = (ev) => {
      try {
        const frame = JSON.parse(ev.data as string) as TelemetryFrame;
        if (frame && typeof frame.speedKmh === 'number') this.handlers.onFrame(frame);
      } catch {
        /* ignore malformed frame */
      }
    };
    this.ws.onerror = () => this.handlers.onStatus('error');
    this.ws.onclose = () => {
      if (this.active) this.scheduleReconnect();
      else this.handlers.onStatus('disconnected');
    };
  }

  private scheduleReconnect(): void {
    if (!this.active || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.active) this.open();
    }, 2000);
  }
}

export const DEFAULT_BRIDGE_WS = 'ws://localhost:8123';
