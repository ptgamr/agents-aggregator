import type { Entry, Session } from '../../shared/types';

const TOOL_BODY_LIMIT = 500;
const BASH_BODY_LIMIT = 500;
const TRUNC_MARK = '\n[…truncated…]';

export function renderSessionMarkdown(session: Session, entries: Entry[]): string {
  const out: string[] = [];
  const header = sessionHeader(session);
  if (header) out.push(header, '');

  let openExchange = false;

  for (const e of entries) {
    switch (e.role) {
      case 'user': {
        const text = bodyOf(e);
        if (!text) continue;
        if (openExchange) out.push('');
        out.push(`> [User] ${oneLine(text)}`);
        const rest = text.split('\n').slice(1);
        for (const line of rest) {
          out.push(`> ${line}`);
        }
        openExchange = true;
        break;
      }

      case 'assistant': {
        const text = bodyOf(e);
        if (!text) continue;
        if (!openExchange) {
          out.push('> [Assistant-only]');
          openExchange = true;
        }
        out.push('', text);
        break;
      }

      case 'toolCall': {
        const args = formatArgs(e.args);
        const title = `### Tool: ${e.tool ?? 'unknown'}${args ? ` ${args}` : ''}`;
        out.push('', title);
        break;
      }

      case 'toolResult': {
        const body = truncate(e.preview ?? bodyOf(e), TOOL_BODY_LIMIT);
        if (body) out.push('', body);
        break;
      }

      case 'bash': {
        const cmd = e.cmd ?? '';
        const result = truncate(e.out ?? '', BASH_BODY_LIMIT);
        const block = ['## Bash', `$ ${cmd}`];
        if (result) block.push(result);
        out.push('', block.join('\n'));
        break;
      }

      case 'thinking':
      case 'system':
      case 'custom':
        // dropped — see MEMPALACE.md role mapping
        break;

      case 'summary': {
        const s = e.summary?.trim();
        if (s) out.push('', `## Summary`, s);
        break;
      }
    }
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

/**
 * One-line context comment before the first exchange. Goes inside an HTML
 * comment so it's invisible to MemPalace's chunker (which only triggers on
 * `>` and `---`).
 */
function sessionHeader(s: Session): string | null {
  const parts: string[] = [];
  if (s.agent) parts.push(`agent=${s.agent}`);
  if (s.cwd) parts.push(`cwd=${s.cwd}`);
  if (s.startedAt) parts.push(`started=${s.startedAt}`);
  return parts.length ? `<!-- ${parts.join(' ')} -->` : null;
}

function bodyOf(e: Entry): string {
  return (e.fullText ?? e.text ?? '').trim();
}

function oneLine(s: string): string {
  const i = s.indexOf('\n');
  return i < 0 ? s : s.slice(0, i);
}

function formatArgs(args: Entry['args']): string {
  if (!args) return '';
  if (typeof args.path === 'string') return args.path;
  const keys = Object.keys(args);
  if (keys.length === 0) return '';
  // Keep it short — full args would inflate chunks.
  const head = keys
    .slice(0, 3)
    .map((k) => `${k}=${shortVal(args[k])}`)
    .join(' ');
  return head;
}

function shortVal(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.length > 40 ? v.slice(0, 40) + '…' : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '…';
}

function truncate(s: string, limit: number): string {
  if (!s) return '';
  return s.length <= limit ? s : s.slice(0, limit) + TRUNC_MARK;
}

/**
 * Composite filename used to round-trip identity through MemPalace search
 * output. Search surfaces `Source: <basename>` only, so we encode
 * `(sourceId, sessionId)` in the basename.
 */
export function stageFilename(sourceId: string, sessionId: string): string {
  // Underscore is the only ASCII separator that doesn't appear in sourceId
  // slugs (kebab-case, alnum) or sessionId formats we've observed (UUIDs,
  // datetime-rolled). Doubled to be unambiguous on the split side.
  return `${sourceId}__${sessionId}.md`;
}

export function parseStageFilename(
  basename: string,
): { sourceId: string; sessionId: string } | null {
  const stem = basename.endsWith('.md') ? basename.slice(0, -3) : basename;
  const i = stem.indexOf('__');
  if (i < 0) return null;
  return { sourceId: stem.slice(0, i), sessionId: stem.slice(i + 2) };
}
