import path from 'node:path';
import os from 'node:os';

export const APP_NAME = 'agents-aggregator';

export function configDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.length > 0 ? xdg : path.join(os.homedir(), '.config');
  return path.join(base, APP_NAME);
}

export const configPath = (): string => path.join(configDir(), 'config.json');
export const dbPath = (): string => path.join(configDir(), 'index.db');

export function expandHome(p: string): string {
  if (p === '~' || p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}
