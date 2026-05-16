import { spawn, type ChildProcess } from 'node:child_process';
import { log } from '../logger';
import { stageDir } from './stage';

export interface MineResult {
  ok: boolean;
  code: number | null;
  stderr: string;
  durationMs: number;
  aborted?: boolean;
}

const MINE_TIMEOUT_MS = 30 * 60_000; // 30 min — big projects can be slow on first mine
const SYNC_TIMEOUT_MS = 60_000;

/** Set of in-flight mempalace children. Tracked so shutdown can kill them. */
const inflight = new Set<ChildProcess>();

export function killAllInflight(): void {
  for (const c of inflight) {
    try { c.kill('SIGTERM'); } catch { /* already dead */ }
  }
}

export function mineSessions(wing: string, signal?: AbortSignal): Promise<MineResult> {
  return runMempalace([
    'mine',
    stageDir(),
    '--mode', 'convos',
    '--wing', wing,
    '--agent', 'agents-aggregator',
  ], MINE_TIMEOUT_MS, signal);
}

export function mineProject(cwd: string, wing: string, signal?: AbortSignal): Promise<MineResult> {
  return runMempalace([
    'mine',
    cwd,
    '--wing', wing,
    '--agent', 'agents-aggregator',
  ], MINE_TIMEOUT_MS, signal);
}

/**
 * Prune drawers whose source files no longer exist on disk. Run after
 * deleting a stage file (e.g. before re-rendering an updated session) so
 * the old drawers don't linger.
 */
export function pruneOrphans(signal?: AbortSignal): Promise<MineResult> {
  return runMempalace(['sync', stageDir(), '--apply'], SYNC_TIMEOUT_MS, signal);
}

function runMempalace(args: string[], timeoutMs: number, signal?: AbortSignal): Promise<MineResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    if (signal?.aborted) {
      resolve({ ok: false, code: null, stderr: 'aborted before start', durationMs: 0, aborted: true });
      return;
    }
    const child = spawn('mempalace', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    inflight.add(child);
    let stderr = '';
    child.stdout?.on('data', () => { /* discard mempalace progress bars */ });
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    const timer = setTimeout(() => {
      log.warn({ args, timeoutMs }, 'mempalace timed out, killing');
      child.kill('SIGTERM');
    }, timeoutMs);
    let aborted = false;
    const onAbort = () => {
      aborted = true;
      try { child.kill('SIGTERM'); } catch { /* ignore */ }
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    child.on('error', (err) => {
      clearTimeout(timer);
      inflight.delete(child);
      signal?.removeEventListener('abort', onAbort);
      resolve({ ok: false, code: null, stderr: stderr || String(err), durationMs: Date.now() - start, aborted });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      inflight.delete(child);
      signal?.removeEventListener('abort', onAbort);
      resolve({
        ok: code === 0 && !aborted,
        code,
        stderr: code === 0 ? '' : stderr,
        durationMs: Date.now() - start,
        aborted,
      });
    });
  });
}
