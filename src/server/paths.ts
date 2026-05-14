import path from 'node:path';
import os from 'node:os';

export const APP_NAME = 'agents-aggregator';

// CLI may override the config location via --config. When set, the database
// is co-located in the same directory.
let configOverride: { dir: string; file: string } | null = null;

export function setConfigPath(filePath: string): void {
  const abs = path.resolve(expandHome(filePath));
  configOverride = { dir: path.dirname(abs), file: abs };
}

export function configDir(): string {
  if (configOverride) return configOverride.dir;
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.length > 0 ? xdg : path.join(os.homedir(), '.config');
  return path.join(base, APP_NAME);
}

export const configPath = (): string =>
  configOverride ? configOverride.file : path.join(configDir(), 'config.json');

export const dbPath = (): string => path.join(configDir(), 'index.db');

export function expandHome(p: string): string {
  if (p === '~' || p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}
