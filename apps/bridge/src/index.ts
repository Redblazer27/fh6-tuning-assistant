import path from 'node:path';
import { existsSync } from 'node:fs';
import { createBridge } from './server.ts';

/** Minimal `--key value` / `--key=value` argument parser. */
function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a || !a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq !== -1) {
      out[a.slice(2, eq)] = a.slice(eq + 1);
    } else {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        out[a.slice(2)] = next;
        i += 1;
      } else {
        out[a.slice(2)] = true;
      }
    }
  }
  return out;
}

/** Find the prebuilt web app to serve (next to the executable, then common dev paths). */
function resolveWebDir(explicit?: string): string | null {
  const candidates = explicit
    ? [explicit]
    : [
        path.join(path.dirname(process.execPath), 'web'),
        path.join(process.cwd(), 'web'),
        path.join(process.cwd(), 'apps', 'web', 'dist'),
        path.join(process.cwd(), 'dist'),
      ];
  for (const dir of candidates) {
    if (existsSync(path.join(dir, 'index.html'))) return path.resolve(dir);
  }
  return null;
}

const args = parseArgs(process.argv.slice(2));
const num = (v: unknown, d: number): number => (typeof v === 'string' && v ? Number(v) : d);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

const bridge = createBridge({
  host: str(args.host) ?? '127.0.0.1',
  port: num(args.port, 8123),
  udpHost: str(args['udp-host']) ?? '127.0.0.1',
  udpPort: num(args['udp-port'], 20440),
  webDir: resolveWebDir(str(args.web)),
  recordPath: str(args.record) ?? null,
  log: (msg) => console.log(`[fh6-bridge] ${msg}`),
});

void bridge.start().then(() => {
  console.log(
    '[fh6-bridge] ready. In FH6: Settings → HUD and Gameplay → Data Out = On, 127.0.0.1:20440',
  );
  console.log('[fh6-bridge] Press Ctrl+C to stop.');
});

process.on('SIGINT', () => {
  console.log('\n[fh6-bridge] shutting down…');
  bridge.stop();
  process.exit(0);
});
