import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { serve } from '@hono/node-server';
import { setConfigPath } from './paths';
import type { AgentType } from '../shared/types';

const program = new Command();
program
  .name('agents-aggregator')
  .description('Agents Aggregator — aggregate AI coding-agent session history')
  .option('-c, --config <path>', 'Path to config.json (default: ~/.config/agents-aggregator/config.json)')
  .hook('preAction', (thisCmd) => {
    const cfg = thisCmd.opts().config as string | undefined;
    if (cfg) setConfigPath(cfg);
  });

// --- serve ---------------------------------------------------------------

program
  .command('serve')
  .description('Start the API server and serve the UI')
  .option('-p, --port <port>', 'Port to listen on', '3000')
  .option('--no-ui', 'Skip serving the built UI (API only)')
  .action(async (opts: { port: string; ui: boolean }) => {
    const { loadConfig } = await import('./config');
    const { sourcesRepo } = await import('./db');
    const { indexAll } = await import('./indexer');
    const { startWatcher } = await import('./watcher');
    const { app, mountStaticUi } = await import('./api');
    const { log } = await import('./logger');

    const port = Number(opts.port);
    if (!Number.isFinite(port) || port <= 0) {
      console.error(`Invalid --port: ${opts.port}`);
      process.exit(2);
    }

    const cfg = loadConfig();
    for (const s of cfg.sources) sourcesRepo.upsert({ ...s });

    const { scanned, sources } = await indexAll();
    log.info({ scanned, sources }, 'initial index complete');

    const stopWatcher = startWatcher();

    if (opts.ui) {
      const uiDir = resolveUiDir();
      mountStaticUi(uiDir);
    }

    serve({ fetch: app.fetch, port }, ({ port: p }) => {
      log.info({ port: p }, 'agents-aggregator listening');
      if (opts.ui) {
        console.log(`\n  Agents Aggregator → http://localhost:${p}\n`);
      }
    });

    const shutdown = () => {
      log.info('shutting down');
      stopWatcher();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });

// --- source --------------------------------------------------------------

const source = program.command('source').description('Manage sources');

source
  .command('add <root>')
  .description('Add a source (auto-sniffs agent type)')
  .option('-l, --label <label>', 'Display label')
  .option('-a, --agent <agent>', 'Override sniffed agent (pi|claude|codex|opencode)')
  .option('--id <id>', 'Override generated slug')
  .action(async (root: string, opts: { label?: string; agent?: string; id?: string }) => {
    const { loadConfig, resolveRoot, saveConfig, slugFromRoot } = await import('./config');
    const { sourcesRepo } = await import('./db');
    const { sniffAgent } = await import('./parsers');

    const abs = resolveRoot(root);
    const agent = (opts.agent as AgentType | undefined) ?? sniffAgent(abs);
    if (!agent) {
      console.error(`Could not sniff agent at ${abs} — pass --agent`);
      process.exit(2);
    }
    const id = opts.id ?? slugFromRoot(abs, agent);
    const cfg = loadConfig();
    if (cfg.sources.find((s) => s.id === id)) {
      console.error(`Source "${id}" already exists. Pick a different --id.`);
      process.exit(2);
    }
    const label = opts.label ?? id;
    const entry = { id, label, agent, root: abs, enabled: true };
    cfg.sources.push(entry);
    saveConfig(cfg);
    sourcesRepo.upsert({ ...entry });
    console.log(`Added: ${id} (${agent}) → ${abs}`);
  });

source
  .command('list')
  .description('List configured sources')
  .action(async () => {
    const { loadConfig } = await import('./config');
    const cfg = loadConfig();
    if (cfg.sources.length === 0) {
      console.log('No sources configured. Try: agents-aggregator source add ~/.claude');
      return;
    }
    for (const s of cfg.sources) {
      const flag = s.enabled ? ' ' : 'x';
      console.log(`${flag} ${s.id.padEnd(20)} ${s.agent.padEnd(10)} ${s.root}`);
    }
  });

source
  .command('remove <id>')
  .description('Remove a source by id')
  .action(async (id: string) => {
    const { loadConfig, saveConfig } = await import('./config');
    const { sourcesRepo } = await import('./db');
    const cfg = loadConfig();
    const before = cfg.sources.length;
    cfg.sources = cfg.sources.filter((s) => s.id !== id);
    if (cfg.sources.length === before) {
      console.error(`No source "${id}"`);
      process.exit(2);
    }
    saveConfig(cfg);
    sourcesRepo.remove(id);
    console.log(`Removed: ${id}`);
  });

async function setEnabled(id: string, enabled: boolean) {
  const { loadConfig, saveConfig } = await import('./config');
  const { sourcesRepo } = await import('./db');
  const cfg = loadConfig();
  const s = cfg.sources.find((x) => x.id === id);
  if (!s) {
    console.error(`No source "${id}"`);
    process.exit(2);
  }
  s.enabled = enabled;
  saveConfig(cfg);
  sourcesRepo.upsert({ ...s });
  console.log(`${enabled ? 'Enabled' : 'Disabled'}: ${id}`);
}

source.command('enable <id>').action((id: string) => setEnabled(id, true));
source.command('disable <id>').action((id: string) => setEnabled(id, false));

// --- scan ----------------------------------------------------------------

program
  .command('scan')
  .description('Re-scan all enabled sources and refresh the index')
  .action(async () => {
    const { loadConfig } = await import('./config');
    const { sourcesRepo } = await import('./db');
    const { indexAll } = await import('./indexer');
    const cfg = loadConfig();
    for (const s of cfg.sources) sourcesRepo.upsert({ ...s });
    const { scanned, sources } = await indexAll();
    console.log(`Scanned ${scanned} sessions across ${sources} source(s)`);
  });

// -------------------------------------------------------------------------

function resolveUiDir(): string {
  // Bundled at dist/server/cli.js  → UI at  ../ui
  // Dev via tsx (src/server/cli.ts) → UI at ../../dist/ui
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '../ui'),
    path.resolve(here, '../../dist/ui'),
  ];
  for (const c of candidates) {
    if (existsSync(path.join(c, 'index.html'))) return c;
  }
  return candidates[0];
}

program.parseAsync().catch((err) => {
  console.error(err);
  process.exit(1);
});
