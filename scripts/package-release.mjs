#!/usr/bin/env node
/**
 * Build downloadable, self-contained release bundles.
 *
 * For each platform: a standalone `fh6-bridge` executable (no Node required) that
 * serves the prebuilt web app AND streams FH6 telemetry, packaged next to the web
 * bundle and a RUN guide, zipped into `release/`.
 *
 * Run by `.github/workflows/release.yml` after `npm run build`. Requires the `zip`
 * CLI (present on GitHub's ubuntu runners). Executables are produced with
 * @yao-pkg/pkg (fetched via npx).
 */
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const webDist = path.join(root, 'apps', 'web', 'dist');
const bridgeBundle = path.join(root, 'apps', 'bridge', 'dist', 'fh6-bridge.cjs');
const releaseDir = path.join(root, 'release');
const binDir = path.join(releaseDir, 'bin');

const run = (cmd, opts = {}) => {
  console.log(`$ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', ...opts });
};

// 1. Ensure inputs exist.
if (!existsSync(webDist)) run('npm run build');
run('npm run build -w @fh6/bridge');

// 2. Fresh release dir.
rmSync(releaseDir, { recursive: true, force: true });
mkdirSync(binDir, { recursive: true });

// 3. Compile the bridge to standalone executables.
run(
  `npx --yes @yao-pkg/pkg "${bridgeBundle}" ` +
    `--targets node20-win-x64,node20-linux-x64,node20-macos-x64 ` +
    `--output "${path.join(binDir, 'fh6-bridge')}"`,
);

const produced = readdirSync(binDir);
const platforms = [
  { key: 'windows', match: /win/i, exeName: 'fh6-bridge.exe', runner: 'fh6-bridge.exe' },
  { key: 'linux', match: /linux/i, exeName: 'fh6-bridge', runner: './fh6-bridge' },
  { key: 'macos', match: /macos|mac/i, exeName: 'fh6-bridge', runner: './fh6-bridge' },
];

const runGuide = (runner) => `FH6 Tuning Assistant — local app + telemetry bridge

1. Run the executable:
     ${runner}
2. It prints a URL like  http://127.0.0.1:8123  — open it in your browser for the full app.
3. For live telemetry, in Forza Horizon 6:
     Settings -> HUD and Gameplay -> Data Out = On
     Data Out IP Address = 127.0.0.1
     Data Out IP Port    = 20440
   Then start driving. The app's Telemetry tab should light up (ws://localhost:8123).

Options: --port 8123  --udp-port 20440  --record session.csv
No installation or Node.js required.
`;

let made = 0;
for (const p of platforms) {
  const file = produced.find((f) => p.match.test(f));
  if (!file) {
    console.warn(`! no executable produced for ${p.key} (looked in ${binDir})`);
    continue;
  }
  const stage = path.join(releaseDir, `stage-${p.key}`);
  mkdirSync(path.join(stage, 'web'), { recursive: true });
  cpSync(path.join(binDir, file), path.join(stage, p.exeName));
  cpSync(webDist, path.join(stage, 'web'), { recursive: true });
  writeFileSync(path.join(stage, 'RUN.txt'), runGuide(p.runner));

  const zipName = `fh6-tuning-assistant-${p.key}.zip`;
  run(`zip -r "${path.join(releaseDir, zipName)}" .`, { cwd: stage });
  made += 1;
  console.log(`packaged ${zipName}`);
}

if (made === 0) {
  console.error('No release bundles were produced.');
  process.exit(1);
}
console.log(`Done. ${made} bundle(s) in ${releaseDir}`);
