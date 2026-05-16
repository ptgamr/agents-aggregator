import fs from 'node:fs';
import { wingsRepo } from '../db';
import { log } from '../logger';
import { addProject } from './jobs';
import { pruneOrphans } from './miner';
import { stageDir } from './stage';

/**
 * `memory rescan` — wipe staged Markdown, prune the palace, and re-enqueue
 * every opted-in project. Heavy-handed; for when the render format
 * changed or the palace got into a bad state. Only re-mines projects the
 * user has already added; doesn't touch un-added cwds.
 */
export async function rescanAll(): Promise<void> {
  const dir = stageDir();
  if (fs.existsSync(dir)) {
    log.info({ dir }, 'wiping stage dir');
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
  // After wiping the files, sync prunes their drawers from the palace.
  const sync = await pruneOrphans();
  if (!sync.ok) log.warn({ stderr: sync.stderr }, 'sync --apply failed during rescan');

  const wings = wingsRepo.list();
  log.info({ wings: wings.length }, 'rescan: re-enqueueing opted-in projects');
  for (const w of wings) {
    addProject(w.cwd);
  }
}
