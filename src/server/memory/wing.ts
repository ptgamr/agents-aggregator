import crypto from 'node:crypto';
import path from 'node:path';
import { wingsRepo } from '../db';

/**
 * Resolve a stable wing slug for a project cwd. Idempotent: repeated calls
 * with the same cwd return the same slug. Collision-safe: two cwds with
 * the same basename get distinct slugs by appending a short cwd hash.
 *
 * The slug is what MemPalace uses to partition the palace via --wing. It's
 * persisted in the `wing` table so renames stay sticky across restarts.
 */
export function slugFor(cwd: string): string {
  if (!cwd) return 'unknown';
  const existing = wingsRepo.findByCwd(cwd);
  if (existing) return existing.slug;

  const base = baseSlug(cwd);
  // First wing to claim a base gets the bare slug; later collisions get a
  // hash suffix. This keeps the common case (one project per basename)
  // clean.
  let candidate = base;
  if (wingsRepo.findBySlug(candidate)) {
    candidate = `${base}-${shortHash(cwd)}`;
  }
  wingsRepo.insert(candidate, cwd);
  return candidate;
}

function baseSlug(cwd: string): string {
  const name = path.basename(cwd).replace(/^\.+/, '');
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'unknown';
}

function shortHash(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex').slice(0, 6);
}
