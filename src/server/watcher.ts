import fs from 'node:fs';
import path from 'node:path';
import { sourcesRepo } from './db';
import { reindexFile } from './indexer';
import { publish } from './pubsub';
import { resolveRoot, type ConfigSource } from './config';
import { parserFor } from './parsers';
import { log } from './logger';

const DEBOUNCE_MS = 150;

/**
 * Watch every enabled source root recursively. Each `.jsonl` change debounces,
 * re-parses session metadata, and publishes an `entry` event so SSE clients
 * refresh.
 *
 * Note: this is the Phase 2 "lite" watcher from PLAN.md — we re-parse the
 * whole file on change rather than tailing byte offsets. Good enough at
 * personal scale; the tail path is a future optimisation.
 */
export function startWatcher(): () => void {
  const sources = sourcesRepo.list().filter((s) => s.enabled);
  const stops: Array<() => void> = [];
  for (const src of sources) {
    const stop = watchSource(src);
    if (stop) stops.push(stop);
  }
  return () => stops.forEach((s) => s());
}

function watchSource(src: ConfigSource): (() => void) | null {
  const root = resolveRoot(src.root);
  const parser = parserFor(src.agent);
  if (!parser) return null;
  if (!fs.existsSync(root)) {
    log.warn({ source: src.id, root }, 'watcher skipped, root missing');
    return null;
  }

  // Watch the sessions parent dir for each agent so we don't pick up
  // unrelated files. Pi: <root>/agent/sessions; others added later.
  const watchDir = src.agent === 'pi' ? path.join(root, 'agent', 'sessions') : root;
  if (!fs.existsSync(watchDir)) return null;

  const pending = new Map<string, NodeJS.Timeout>();
  let watcher: fs.FSWatcher;
  try {
    watcher = fs.watch(watchDir, { recursive: true });
  } catch (err) {
    log.warn({ err, watchDir }, 'fs.watch failed');
    return null;
  }
  watcher.on('error', (err) => log.warn({ err }, 'watcher error'));
  watcher.on('change', (_ev, filename) => {
    if (!filename) return;
    const fname = String(filename);
    if (!fname.endsWith('.jsonl')) return;
    const filePath = path.join(watchDir, fname);
    const prev = pending.get(filePath);
    if (prev) clearTimeout(prev);
    pending.set(filePath, setTimeout(() => {
      pending.delete(filePath);
      void (async () => {
        const sessionId = await reindexFile(src.id, filePath);
        if (sessionId) {
          publish({ type: 'session_updated', sourceId: src.id, sessionId });
        }
      })();
    }, DEBOUNCE_MS));
  });

  log.info({ source: src.id, watchDir }, 'watching source');
  return () => {
    watcher.close();
    for (const t of pending.values()) clearTimeout(t);
    pending.clear();
  };
}
