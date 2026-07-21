import dgram from 'node:dgram';
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createWriteStream, existsSync, type WriteStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { CSV_HEADER, csvRow, parsePacket } from './parser.ts';

export interface BridgeOptions {
  host: string;
  /** HTTP + WebSocket port (the app is served here and telemetry streams over WS). */
  port: number;
  udpHost: string;
  udpPort: number;
  /** Directory of the prebuilt web app to serve, or null to serve an info page. */
  webDir: string | null;
  /** Optional CSV recording path. */
  recordPath: string | null;
  log: (msg: string) => void;
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

const INFO_PAGE = (port: number) => `<!doctype html><meta charset="utf-8">
<title>FH6 Bridge</title>
<body style="font-family:system-ui;background:#0b1020;color:#e8eefc;padding:32px;line-height:1.6">
<h1>FH6 Telemetry Bridge</h1>
<p>The bridge is running. Telemetry is streaming over <code>ws://localhost:${port}</code>.</p>
<p>No web app bundle was found next to this server. Open the hosted app (or the dev server) and set the
bridge URL to <code>ws://localhost:${port}</code>.</p>
<p>In FH6: <b>Settings → HUD and Gameplay → Data Out</b> = On, IP <code>127.0.0.1</code>, Port <code>20440</code>.</p>
</body>`;

export interface Bridge {
  start(): Promise<void>;
  stop(): void;
}

export function createBridge(opts: BridgeOptions): Bridge {
  const clients = new Set<WebSocket>();
  let recordStream: WriteStream | null = null;
  let frameCount = 0;

  const serveStatic = async (req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, clients: clients.size, frames: frameCount }));
      return;
    }
    if (!opts.webDir) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(INFO_PAGE(opts.port));
      return;
    }
    const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
    const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
    const filePath = path.resolve(opts.webDir, rel);
    // Prevent path traversal outside the web dir.
    if (!filePath.startsWith(path.resolve(opts.webDir))) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    try {
      const target = existsSync(filePath) ? filePath : path.resolve(opts.webDir, 'index.html');
      const data = await readFile(target);
      const ext = path.extname(target).toLowerCase();
      res.writeHead(200, { 'content-type': CONTENT_TYPES[ext] ?? 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  };

  const http = createHttpServer((req, res) => void serveStatic(req, res));
  const wss = new WebSocketServer({ server: http });
  wss.on('connection', (ws) => {
    clients.add(ws);
    opts.log(`web client connected (${clients.size} total)`);
    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
  });

  const udp = dgram.createSocket('udp4');
  udp.on('message', (msg) => {
    const frame = parsePacket(msg as Buffer);
    if (!frame) return;
    frameCount += 1;
    const json = JSON.stringify(frame);
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(json);
    }
    if (recordStream && frame.isRaceOn) recordStream.write(csvRow(frame) + '\n');
  });
  udp.on('error', (err) => opts.log(`UDP error: ${err.message}`));

  return {
    start() {
      if (opts.recordPath) {
        recordStream = createWriteStream(opts.recordPath, { flags: 'a' });
        recordStream.write(CSV_HEADER + '\n');
        opts.log(`recording telemetry to ${opts.recordPath}`);
      }
      return new Promise<void>((resolve) => {
        udp.bind(opts.udpPort, opts.udpHost, () => {
          opts.log(`listening for FH6 Data Out on udp://${opts.udpHost}:${opts.udpPort}`);
        });
        http.listen(opts.port, opts.host, () => {
          opts.log(`app + telemetry on http://${opts.host}:${opts.port}  (ws://${opts.host}:${opts.port})`);
          resolve();
        });
      });
    },
    stop() {
      recordStream?.end();
      udp.close();
      wss.close();
      http.close();
    },
  };
}
