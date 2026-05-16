import fs from 'node:fs';
import path from 'node:path';
import { configDir } from '../paths';
import { stageFilename } from './render';

export function stageDir(): string {
  return path.join(configDir(), 'mempalace-stage');
}

export function stagePath(sourceId: string, sessionId: string): string {
  return path.join(stageDir(), stageFilename(sourceId, sessionId));
}

/**
 * Atomically write a session's rendered Markdown to the stage path.
 * Atomicity matters because mempalace mine may read concurrently with the
 * watcher overwriting on a fresh event — a partial file would silently
 * truncate the palace's drawer for this session.
 */
export function writeStage(sourceId: string, sessionId: string, markdown: string): string {
  const dest = stagePath(sourceId, sessionId);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, markdown, 'utf8');
  fs.renameSync(tmp, dest);
  return dest;
}

/**
 * Remove the stage file for a session if present. Returns true when a file
 * was actually deleted.
 */
export function removeStage(sourceId: string, sessionId: string): boolean {
  const p = stagePath(sourceId, sessionId);
  try {
    fs.unlinkSync(p);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
}

export function stageExists(sourceId: string, sessionId: string): boolean {
  return fs.existsSync(stagePath(sourceId, sessionId));
}
