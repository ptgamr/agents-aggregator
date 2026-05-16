import { sessionsRepo, wingsRepo } from '../db';
import { log } from '../logger';
import { subscribe } from '../pubsub';
import { parserFor } from '../parsers';
import { mineSessions, pruneOrphans } from './miner';
import { renderSessionMarkdown } from './render';
import { removeStage, stageExists, writeStage } from './stage';

const DEBOUNCE_MS = 30_000;

interface Pending {
  timer: NodeJS.Timeout;
  /** Coalesce while a flush is in flight — set when a new event arrives mid-flush. */
  dirty: boolean;
}

/**
 * Subscribe to `session_updated` events from the watcher, debounce per
 * session, and run the prune→render→mine pipeline. Returns a shutdown
 * function that aborts the subscription and clears pending timers.
 */
export function startMemorySync(): () => void {
  const abort = new AbortController();
  const pending = new Map<string, Pending>();
  const inflight = new Set<string>();

  (async () => {
    try {
      for await (const event of subscribe(abort.signal)) {
        if (event.type !== 'session_updated') continue;
        if (!event.sourceId || !event.sessionId) continue;
        schedule(event.sourceId, event.sessionId);
      }
    } catch (err) {
      if (!abort.signal.aborted) {
        log.warn({ err }, 'memory sync subscriber crashed');
      }
    }
  })();

  function schedule(sourceId: string, sessionId: string): void {
    const key = `${sourceId}:${sessionId}`;
    const existing = pending.get(key);
    if (existing) {
      clearTimeout(existing.timer);
    }
    if (inflight.has(key)) {
      // Mark dirty — a follow-up flush will re-run after the current one ends.
      pending.set(key, {
        timer: setTimeout(() => {}, 0),
        dirty: true,
      });
      clearTimeout(pending.get(key)!.timer);
      return;
    }
    const timer = setTimeout(() => {
      pending.delete(key);
      void flush(sourceId, sessionId);
    }, DEBOUNCE_MS);
    pending.set(key, { timer, dirty: false });
  }

  async function flush(sourceId: string, sessionId: string): Promise<void> {
    const key = `${sourceId}:${sessionId}`;
    inflight.add(key);
    try {
      await syncOne(sourceId, sessionId);
    } catch (err) {
      log.warn({ err, sourceId, sessionId }, 'memory sync failed');
    } finally {
      inflight.delete(key);
      // If new events landed while we were in flight, run once more.
      const queued = pending.get(key);
      if (queued?.dirty) {
        pending.delete(key);
        schedule(sourceId, sessionId);
      }
    }
  }

  return () => {
    abort.abort();
    for (const p of pending.values()) clearTimeout(p.timer);
    pending.clear();
  };
}

/**
 * Run the full pipeline for one session. Exported so the job runner and
 * `agents-aggregator memory rescan` can call it directly.
 *
 * `gate` controls whether to require a `ready` wing in SQLite. The live
 * watcher path passes gate=true so untouched-by-user projects don't get
 * mined. The job runner passes gate=false because it owns the wing
 * transitions itself (pending → mining → ready) and runs syncOne while
 * status is `mining`.
 */
export async function syncOne(
  sourceId: string,
  sessionId: string,
  opts: { gate?: boolean } = {},
): Promise<void> {
  const gate = opts.gate ?? true;
  const session = sessionsRepo.find(sourceId, sessionId);
  if (!session) {
    log.warn({ sourceId, sessionId }, 'memory sync: session not in DB');
    return;
  }
  const parser = parserFor(session.agent);
  if (!parser) {
    log.warn({ agent: session.agent }, 'memory sync: no parser for agent');
    return;
  }
  if (!session.cwd) {
    log.debug({ sourceId, sessionId }, 'memory sync: session has no cwd, skipping');
    return;
  }
  const wing = wingsRepo.findByCwd(session.cwd);
  if (!wing) {
    log.debug({ cwd: session.cwd }, 'memory sync: cwd not opted into mempalace');
    return;
  }
  if (gate && wing.status !== 'ready') {
    log.debug({ wing: wing.slug, status: wing.status }, 'memory sync: wing not ready');
    return;
  }

  const entries = await parser.parseEntries(session.filePath);
  const markdown = renderSessionMarkdown(session, entries);

  // Convos miner assumes immutability — must prune the old drawers before
  // re-mining, otherwise mempalace skips the file as "already filed."
  if (stageExists(sourceId, sessionId)) {
    removeStage(sourceId, sessionId);
    const sync = await pruneOrphans();
    if (!sync.ok) {
      log.warn({ stderr: sync.stderr }, 'mempalace sync failed');
    }
  }

  writeStage(sourceId, sessionId, markdown);
  const mine = await mineSessions(wing.slug);
  if (!mine.ok) {
    log.warn({ stderr: mine.stderr, wing: wing.slug }, 'mempalace mine failed');
  } else {
    log.debug({ wing: wing.slug, ms: mine.durationMs, sourceId, sessionId }, 'mined session');
  }
}

/** Visible for tests / scripted backfills. */
export const _internal = { DEBOUNCE_MS };
