export function relTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(mo / 12)}y`;
}

export function shortCwd(cwd: string): string {
  if (!cwd) return '';
  const home = process.env.HOME ?? '';
  if (home && cwd.startsWith(home)) return '~' + cwd.slice(home.length);
  return cwd;
}

const EXT_TO_FT: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'tsx', '.js': 'javascript', '.jsx': 'jsx',
  '.json': 'json', '.md': 'markdown', '.py': 'python', '.go': 'go',
  '.rs': 'rust', '.rb': 'ruby', '.sh': 'bash', '.bash': 'bash',
  '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml', '.html': 'html',
  '.css': 'css', '.sql': 'sql', '.c': 'c', '.h': 'c', '.cpp': 'cpp',
  '.java': 'java', '.kt': 'kotlin', '.swift': 'swift', '.lua': 'lua',
};

export function filetypeFor(pathLike?: string): string | undefined {
  if (!pathLike) return undefined;
  const i = pathLike.lastIndexOf('.');
  if (i < 0) return undefined;
  return EXT_TO_FT[pathLike.slice(i).toLowerCase()];
}
