import fs from 'node:fs';
import { sessionsRepo, sourcesRepo, type SessionRow } from './db';
import { parserFor } from './parsers';
import { splitSessionId, type Source } from '../shared/types';
import { resolveRoot } from './config';
import { log } from './logger';

/**
 * Scan every enabled source, parse session metadata, and upsert into SQLite.
 * Cheap for Phase 1 (header-only metadata, no entry insertion).
 */
export async function indexAll(): Promise<{ scanned: number; sources: number }> {
  const sources = sourcesRepo.list().filter((s) => s.enabled);
  let scanned = 0;
  for (const src of sources) {
    scanned += await indexSource(src);
  }
  return { scanned, sources: sources.length };
}

export async function indexSource(src: Source): Promise<number> {
  const parser = parserFor(src.agent);
  if (!parser) {
    log.warn({ source: src.id, agent: src.agent }, 'no parser registered');
    return 0;
  }
  const root = resolveRoot(src.root);
  if (!fs.existsSync(root)) {
    log.warn({ source: src.id, root }, 'source root does not exist');
    return 0;
  }
  const files = parser.listSessions(root);
  let n = 0;
  for (const f of files) {
    try {
      const meta = await parser.parseSession(f.filePath, src.id);
      const row: SessionRow = {
        sourceId: src.id,
        sessionId: f.sessionId,
        agent: meta.agent,
        filePath: meta.filePath,
        cwd: meta.cwd || null,
        name: meta.name,
        model: meta.model || null,
        startedAt: meta.startedAt,
        updatedAt: meta.updatedAt,
        messageCount: meta.messageCount,
        costUsd: meta.costUsd,
        branches: meta.branches,
        live: meta.live ? 1 : 0,
        status: meta.status,
      };
      sessionsRepo.upsert(row);
      n++;
    } catch (err) {
      log.warn({ err, file: f.filePath }, 'failed to parse session');
    }
  }
  log.info({ source: src.id, indexed: n }, 'indexed source');
  return n;
}

export async function reindexFile(sourceId: string, filePath: string): Promise<string | null> {
  const src = sourcesRepo.list().find((s) => s.id === sourceId);
  if (!src) return null;
  const parser = parserFor(src.agent);
  if (!parser) return null;
  if (!fs.existsSync(filePath)) return null;
  try {
    const meta = await parser.parseSession(filePath, src.id);
    const sessionId = splitSessionId(meta.id)?.sessionId ?? '';
    sessionsRepo.upsert({
      sourceId: src.id,
      sessionId,
      agent: meta.agent,
      filePath: meta.filePath,
      cwd: meta.cwd || null,
      name: meta.name,
      model: meta.model || null,
      startedAt: meta.startedAt,
      updatedAt: meta.updatedAt,
      messageCount: meta.messageCount,
      costUsd: meta.costUsd,
      branches: meta.branches,
      live: 1,
      status: 'streaming',
    });
    return sessionId;
  } catch (err) {
    log.warn({ err, file: filePath }, 'reindex failed');
    return null;
  }
}
