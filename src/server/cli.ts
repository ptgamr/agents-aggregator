import { Command } from 'commander';
import { loadConfig, resolveRoot, saveConfig, slugFromRoot, type ConfigSource } from './config';
import { sourcesRepo } from './db';
import { sniffAgent } from './parsers';
import { indexAll } from './indexer';
import type { AgentType } from '../shared/types';

const program = new Command();
program.name('aa').description('Agents Aggregator CLI');

const source = program.command('source').description('Manage sources');

source
  .command('add <root>')
  .description('Add a source (auto-sniffs agent type)')
  .option('-l, --label <label>', 'Display label')
  .option('-a, --agent <agent>', 'Override sniffed agent (pi|claude|codex|opencode)')
  .option('--id <id>', 'Override generated slug')
  .action((root: string, opts: { label?: string; agent?: string; id?: string }) => {
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
    const entry: ConfigSource = { id, label, agent, root: abs, enabled: true };
    cfg.sources.push(entry);
    saveConfig(cfg);
    sourcesRepo.upsert({ ...entry });
    console.log(`Added: ${id} (${agent}) → ${abs}`);
  });

source
  .command('list')
  .description('List configured sources')
  .action(() => {
    const cfg = loadConfig();
    if (cfg.sources.length === 0) {
      console.log('No sources configured. Try: aa source add ~/.pi');
      return;
    }
    for (const s of cfg.sources) {
      const flag = s.enabled ? ' ' : '✗';
      console.log(`${flag} ${s.id.padEnd(20)} ${s.agent.padEnd(10)} ${s.root}`);
    }
  });

source
  .command('remove <id>')
  .description('Remove a source by id')
  .action((id: string) => {
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

function setEnabled(id: string, enabled: boolean) {
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

program
  .command('scan')
  .description('Re-scan all enabled sources and refresh the index')
  .action(async () => {
    // Make sure DB knows about all configured sources before scanning.
    const cfg = loadConfig();
    for (const s of cfg.sources) sourcesRepo.upsert({ ...s });
    const { scanned, sources } = await indexAll();
    console.log(`Scanned ${scanned} sessions across ${sources} source(s)`);
  });

program.parseAsync().catch((err) => {
  console.error(err);
  process.exit(1);
});
