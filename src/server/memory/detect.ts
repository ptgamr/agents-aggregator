import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface MempalaceDetection {
  /** mempalace binary found on PATH. */
  installed: boolean;
  /** Version string from `mempalace --version`, or null when installed=false. */
  version: string | null;
  /** A palace has been initialised (~/.mempalace/config.json exists). */
  initialised: boolean;
  /** Path that init would persist to (or already has). */
  palaceConfigPath: string;
  /** First reason why integration can't run, or null when ready. */
  unavailableReason: string | null;
}

export function detectMempalace(): MempalaceDetection {
  const palaceConfigPath = path.join(os.homedir(), '.mempalace', 'config.json');

  const bin = which('mempalace');
  if (!bin) {
    return {
      installed: false,
      version: null,
      initialised: false,
      palaceConfigPath,
      unavailableReason: 'mempalace not found on PATH (try: uv tool install mempalace)',
    };
  }

  const ver = spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 5_000 });
  const version = ver.status === 0 ? ver.stdout.trim() : null;

  const initialised = fs.existsSync(palaceConfigPath);
  return {
    installed: true,
    version,
    initialised,
    palaceConfigPath,
    unavailableReason: initialised
      ? null
      : `palace not initialised (run: mempalace init <dir> --yes --no-llm)`,
  };
}

function which(cmd: string): string | null {
  const PATH = process.env.PATH || '';
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const dir of PATH.split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = path.join(dir, cmd + ext);
      try {
        const st = fs.statSync(candidate);
        if (st.isFile()) return candidate;
      } catch {
        // not found, continue
      }
    }
  }
  return null;
}
