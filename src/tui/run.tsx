import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCliRenderer } from '@opentui/core';
import { createRoot } from '@opentui/react';
import { setApiBase } from './api-client';
import { App } from './App';

export async function runTui(): Promise<void> {
  // Corporate HTTP proxies (set via http_proxy / https_proxy) break
  // localhost-to-localhost traffic between the TUI and the spawned server.
  // Ensure we always bypass the proxy for loopback.
  bypassProxyForLoopback();

  const port = await findFreePort();
  const serverCmd = resolveServerCmd();
  const child = spawn(serverCmd.cmd, [...serverCmd.args, 'serve', '--port', String(port), '--no-ui'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
    env: { ...process.env, PINO_LOG_LEVEL: 'warn' },
  });

  // Silence the server's stderr/stdout so they don't leak into the TUI buffer.
  child.stdout?.resume();
  child.stderr?.resume();

  let exited = false;
  child.on('exit', (code) => {
    exited = true;
    if (code !== 0 && code !== null) {
      // Restore terminal & report — TUI may not be mounted yet.
      process.stderr.write(`\nagents-agg serve exited with code ${code}\n`);
      process.exit(code);
    }
  });

  setApiBase(`http://127.0.0.1:${port}`);
  await waitForReady(port, 10_000);

  const renderer = await createCliRenderer();
  createRoot(renderer).render(<App />);

  const shutdown = () => {
    try { renderer.destroy(); } catch { /* ok */ }
    if (!exited) {
      try { child.kill('SIGTERM'); } catch { /* ok */ }
    }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('exit', () => { if (!exited) { try { child.kill('SIGTERM'); } catch { /* ok */ } } });
}

function resolveServerCmd(): { cmd: string; args: string[] } {
  // Locate the CLI entry. In dev (tsx/bun src/server/cli.ts), this file is in
  // src/tui/; in dist it's in dist/tui/. We need to invoke the *Node* server
  // (better-sqlite3 doesn't work in Bun), so always use the `node`+`tsx` path
  // in dev, and the bundled CLI in prod.
  const here = path.dirname(fileURLToPath(import.meta.url));
  // dist layout: dist/tui/run.js  → ../server/cli.js
  const bundledCli = path.resolve(here, '..', 'server', 'cli.js');
  const srcCli = path.resolve(here, '..', 'server', 'cli.ts');

  if (fileExists(bundledCli)) {
    return { cmd: process.execPath /* node */, args: [bundledCli] };
  }
  // Dev path: invoke tsx via the local node_modules .bin.
  const repoRoot = findRepoRoot(here);
  const tsxBin = repoRoot ? path.join(repoRoot, 'node_modules', '.bin', 'tsx') : 'tsx';
  return { cmd: tsxBin, args: [srcCli] };
}

function fileExists(p: string): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('node:fs');
    return fs.existsSync(p);
  } catch { return false; }
}

function findRepoRoot(start: string): string | null {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('node:fs');
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function bypassProxyForLoopback(): void {
  const loopback = '127.0.0.1,localhost,::1';
  const merge = (existing: string | undefined) => {
    if (!existing) return loopback;
    const have = new Set(existing.split(',').map((s) => s.trim()).filter(Boolean));
    for (const h of loopback.split(',')) have.add(h);
    return Array.from(have).join(',');
  };
  process.env.NO_PROXY = merge(process.env.NO_PROXY);
  process.env.no_proxy = merge(process.env.no_proxy);
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error('no address')));
      }
    });
  });
}

async function waitForReady(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown = null;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/sources`, {
        signal: AbortSignal.timeout(500),
      });
      if (r.ok) return;
      lastErr = new Error(`HTTP ${r.status}`);
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`server did not become ready in ${timeoutMs}ms (last: ${String(lastErr)})`);
}
