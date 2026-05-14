import { serve } from '@hono/node-server';
import { app } from './api';
import { loadConfig } from './config';
import { sourcesRepo } from './db';
import { indexAll } from './indexer';
import { startWatcher } from './watcher';
import { log } from './logger';

const PORT = Number(process.env.PORT ?? 3000);

async function main(): Promise<void> {
  // Sync config → DB. Config is the source of truth for sources.
  const cfg = loadConfig();
  for (const s of cfg.sources) sourcesRepo.upsert({ ...s });

  const { scanned, sources } = await indexAll();
  log.info({ scanned, sources }, 'initial index complete');

  const stopWatcher = startWatcher();

  serve({ fetch: app.fetch, port: PORT }, ({ port }) => {
    log.info({ port }, 'agents-aggregator API listening');
  });

  const shutdown = () => {
    log.info('shutting down');
    stopWatcher();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void main();
