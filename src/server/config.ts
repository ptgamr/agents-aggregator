import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { configDir, configPath, expandHome } from './paths';
import type { AgentType } from '../shared/types';

const AgentEnum = z.enum(['claude', 'codex', 'opencode', 'pi']) satisfies z.ZodType<AgentType>;

const SourceConfig = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  agent: AgentEnum,
  root: z.string().min(1),
  enabled: z.boolean().default(true),
});

const Config = z.object({
  sources: z.array(SourceConfig).default([]),
});

export type ConfigSource = z.infer<typeof SourceConfig>;
export type Config = z.infer<typeof Config>;

export function loadConfig(): Config {
  const p = configPath();
  if (!fs.existsSync(p)) return { sources: [] };
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  return Config.parse(raw);
}

export function saveConfig(c: Config): void {
  fs.mkdirSync(configDir(), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(c, null, 2) + '\n');
}

export function resolveRoot(root: string): string {
  return path.resolve(expandHome(root));
}

export function slugFromRoot(root: string, agent: AgentType): string {
  const base = path.basename(resolveRoot(root)).replace(/^\.+/, '') || agent;
  return base.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
}
