import { sessionsRepo, wingsRepo, type WingStatus } from '../db';
import { log } from '../logger';
import { publish } from '../pubsub';
import { splitSessionId } from '../../shared/types';
import { killAllInflight, mineProject, pruneOrphans } from './miner';
import { removeStage, stageExists } from './stage';
import { syncOne } from './sync';
import { slugFor } from './wing';

export type JobPhase =
  | 'queued'
  | 'project'
  | 'sessions'
  | 'ready'
  | 'failed'
  | 'cancelled';

export interface JobState {
  slug: string;
  cwd: string;
  phase: JobPhase;
  sessionsTotal: number;
  sessionsDone: number;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}

interface Job {
  state: JobState;
  abort: AbortController;
}

const queue: Job[] = [];
let current: Job | null = null;
let workerActive = false;
let shuttingDown = false;

/**
 * Enqueue a project for mining. Idempotent: if the cwd is already queued
 * or currently being mined, return the existing job state. Creates a
 * wing row when one doesn't exist yet.
 */
export function addProject(cwd: string): JobState {
  // De-dupe by cwd: if already in queue or currently mining, return that.
  const inFlight = findActive(cwd);
  if (inFlight) return cloneState(inFlight.state);

  // Ensure a wing row exists for this cwd.
  const slug = slugFor(cwd);
  wingsRepo.setStatus(slug, 'pending');

  const job: Job = {
    state: {
      slug,
      cwd,
      phase: 'queued',
      sessionsTotal: 0,
      sessionsDone: 0,
      startedAt: null,
      finishedAt: null,
      error: null,
    },
    abort: new AbortController(),
  };
  queue.push(job);
  publishJobEvent(job);
  void runWorker();
  return cloneState(job.state);
}

/**
 * Remove a project from MemPalace. Cancels the job if it's running,
 * prunes drawers from the palace, wipes stage files, and deletes the
 * wing row.
 */
export async function removeProject(slug: string): Promise<{ removed: boolean }> {
  const wing = wingsRepo.findBySlug(slug);
  if (!wing) return { removed: false };

  // Cancel if active.
  const active = findActiveBySlug(slug);
  if (active) active.abort.abort();
  // Drop from queue.
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].state.slug === slug) queue.splice(i, 1);
  }

  // Wipe stage files for sessions in this wing's cwd.
  const sessions = sessionsRepo.list({ project: wing.cwd });
  for (const s of sessions) {
    const parts = splitSessionId(s.id);
    if (parts && stageExists(parts.sourceId, parts.sessionId)) {
      removeStage(parts.sourceId, parts.sessionId);
    }
  }

  // Prune now-orphaned drawers from the palace.
  const prune = await pruneOrphans();
  if (!prune.ok) {
    log.warn({ stderr: prune.stderr, slug }, 'mempalace sync --apply failed during remove');
  }

  wingsRepo.remove(slug);
  publish({ type: 'memory_job', slug, phase: 'cancelled' });
  return { removed: true };
}

/** Current snapshot for the API. */
export function listJobs(): { queue: JobState[]; current: JobState | null } {
  return {
    queue: queue.map((j) => cloneState(j.state)),
    current: current ? cloneState(current.state) : null,
  };
}

/** Shutdown hook — cancels in-flight work and prevents new jobs from starting. */
export function stopJobRunner(): void {
  shuttingDown = true;
  if (current) current.abort.abort();
  for (const job of queue) job.abort.abort();
  queue.length = 0;
  // Belt and braces: kill any orphan mempalace child the abort didn't catch.
  killAllInflight();
}

// ── Worker ────────────────────────────────────────────────────────────────

async function runWorker(): Promise<void> {
  if (workerActive || shuttingDown) return;
  workerActive = true;
  try {
    while (queue.length > 0 && !shuttingDown) {
      const job = queue.shift()!;
      current = job;
      await runJob(job);
      current = null;
    }
  } finally {
    workerActive = false;
  }
}

async function runJob(job: Job): Promise<void> {
  const { slug, cwd } = job.state;
  const signal = job.abort.signal;

  job.state.startedAt = new Date().toISOString();
  job.state.phase = 'project';
  wingsRepo.setStatus(slug, 'mining');
  publishJobEvent(job);

  // Phase 1 — project mine.
  try {
    const r = await mineProject(cwd, slug, signal);
    if (signal.aborted) {
      finishJob(job, 'cancelled', null);
      return;
    }
    if (!r.ok) {
      finishJob(job, 'failed', `project mine failed: ${(r.stderr || `exit ${r.code}`).slice(0, 400)}`);
      return;
    }
  } catch (err) {
    finishJob(job, 'failed', `project mine threw: ${(err as Error).message}`);
    return;
  }

  // Phase 2 — session mining.
  const sessions = sessionsRepo.list({ project: cwd });
  job.state.sessionsTotal = sessions.length;
  job.state.phase = 'sessions';
  publishJobEvent(job);

  for (const s of sessions) {
    if (signal.aborted) {
      finishJob(job, 'cancelled', null);
      return;
    }
    const parts = splitSessionId(s.id);
    if (!parts) continue;
    try {
      // gate=false: the worker owns the wing lifecycle and runs while the
      // wing is `mining`, so syncOne would otherwise refuse to mine.
      await syncOne(parts.sourceId, parts.sessionId, { gate: false });
    } catch (err) {
      log.warn({ err, id: s.id, slug }, 'session sync failed during job');
    }
    job.state.sessionsDone++;
    // Throttle event publishing — every 5 sessions or the last one.
    if (job.state.sessionsDone === job.state.sessionsTotal || job.state.sessionsDone % 5 === 0) {
      publishJobEvent(job);
    }
  }

  wingsRepo.setLastMinedAt(slug, new Date().toISOString());
  finishJob(job, 'ready', null);
}

function finishJob(job: Job, phase: JobPhase, error: string | null): void {
  job.state.phase = phase;
  job.state.finishedAt = new Date().toISOString();
  job.state.error = error;
  const status: WingStatus =
    phase === 'ready' ? 'ready' :
    phase === 'failed' ? 'failed' :
    'pending'; // cancelled → back to pending so the user can retry
  wingsRepo.setStatus(job.state.slug, status, error);
  log.info({ slug: job.state.slug, phase, error }, 'memory job finished');
  publishJobEvent(job);
}

function publishJobEvent(job: Job): void {
  publish({
    type: 'memory_job',
    slug: job.state.slug,
    phase: job.state.phase,
    sessionsDone: job.state.sessionsDone,
    sessionsTotal: job.state.sessionsTotal,
    error: job.state.error,
  });
}

function findActive(cwd: string): Job | null {
  if (current && current.state.cwd === cwd) return current;
  return queue.find((j) => j.state.cwd === cwd) ?? null;
}

function findActiveBySlug(slug: string): Job | null {
  if (current && current.state.slug === slug) return current;
  return queue.find((j) => j.state.slug === slug) ?? null;
}

function cloneState(s: JobState): JobState {
  return { ...s };
}
