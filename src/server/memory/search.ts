import { spawn } from 'node:child_process';
import { log } from '../logger';
import { sessionsRepo } from '../db';
import { parseStageFilename } from './render';

export interface SearchHit {
  sourceId: string | null;
  sessionId: string | null;
  wing: string;
  room: string;
  sourceFile: string;
  snippet: string;
  scores: { cosine: number | null; bm25: number | null };
  /** Filled when sourceId/sessionId resolve to a known session in our DB. */
  session: ResolvedSession | null;
}

export interface ResolvedSession {
  agent: string;
  cwd: string | null;
  label: string | null;
  updatedAt: string;
  messageCount: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export async function searchPalace(
  query: string,
  opts: { limit?: number; wing?: string } = {},
): Promise<SearchHit[]> {
  const args = ['search', query];
  if (opts.limit && opts.limit > 0) args.push('--results', String(opts.limit));
  if (opts.wing) args.push('--wing', opts.wing);

  const stdout = await runCapture(['mempalace', ...args], DEFAULT_TIMEOUT_MS);
  const hits = parseSearchOutput(stdout);
  for (const h of hits) {
    if (h.sourceId && h.sessionId) {
      const s = sessionsRepo.find(h.sourceId, h.sessionId);
      if (s) {
        h.session = {
          agent: s.agent,
          cwd: s.cwd,
          label: s.name,
          updatedAt: s.updatedAt,
          messageCount: s.messageCount,
        };
      }
    }
  }
  return hits;
}

/**
 * Parse the structured ASCII output of `mempalace search`. See the spike
 * record in MEMPALACE.md for the exact shape; in summary:
 *
 *     [N] <wing> / <room>
 *         Source: <basename>.md
 *         Match:  cosine=<f>  bm25=<f>
 *
 *         <snippet body, possibly multi-line>
 *
 *     ─────────────────  ← block separator (Unicode box-drawing)
 */
export function parseSearchOutput(stdout: string): SearchHit[] {
  const hits: SearchHit[] = [];
  // Use the separator line (with leading 2 spaces and ≥4 box-drawing chars)
  // to chop the output. The header section before the first hit doesn't
  // start with `  [`, so we filter blocks by that.
  const blocks = stdout.split(/\n\s*─{4,}\s*\n/);
  for (const block of blocks) {
    const hit = parseHitBlock(block);
    if (hit) hits.push(hit);
  }
  return hits;
}

function parseHitBlock(block: string): SearchHit | null {
  const lines = block.split('\n');
  let header: RegExpMatchArray | null = null;
  let source: string | null = null;
  let scores: { cosine: number | null; bm25: number | null } = { cosine: null, bm25: null };
  let bodyStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!header) {
      const m = line.match(/^\s*\[\d+\]\s+(\S+)\s*\/\s*(\S+)/);
      if (m) {
        header = m;
        continue;
      }
    }
    const src = line.match(/^\s*Source:\s+(\S+)/);
    if (src) {
      source = src[1];
      continue;
    }
    const mat = line.match(/^\s*Match:\s+cosine=([\d.]+)(?:\s+bm25=([\d.]+))?/);
    if (mat) {
      scores = {
        cosine: Number.parseFloat(mat[1]),
        bm25: mat[2] != null ? Number.parseFloat(mat[2]) : null,
      };
      bodyStart = i + 1;
      break;
    }
  }

  if (!header || !source) return null;

  const snippetLines = bodyStart >= 0 ? lines.slice(bodyStart) : [];
  // The body is indented by 6 spaces — strip a common leading indent.
  const snippet = snippetLines
    .map((l) => l.replace(/^\s{0,6}/, ''))
    .join('\n')
    .replace(/^\n+|\n+$/g, '');

  const parsed = parseStageFilename(source);
  return {
    sourceId: parsed?.sourceId ?? null,
    sessionId: parsed?.sessionId ?? null,
    wing: header[1],
    room: header[2],
    sourceFile: source,
    snippet,
    scores,
    session: null,
  };
}

function runCapture(argv: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0], argv.slice(1), { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout?.on('data', (d: Buffer) => { out += d.toString(); });
    child.stderr?.on('data', (d: Buffer) => { err += d.toString(); });
    const timer = setTimeout(() => {
      log.warn({ argv, timeoutMs }, 'mempalace search timed out');
      child.kill('SIGTERM');
    }, timeoutMs);
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`mempalace exited ${code}: ${err.slice(0, 500)}`));
      else resolve(out);
    });
  });
}
