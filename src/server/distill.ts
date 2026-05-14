import type { Entry } from '../shared/types';

/**
 * Squeeze a parsed transcript into a compact form for LLM summarization.
 * Drops high-volume / low-signal entries (file reads, greps, tool results,
 * thinking) and truncates long assistant prose. Edits are kept because they
 * are the work product. Reads are kept only when their path is later edited.
 */

const ASSISTANT_TEXT_LIMIT = 2000;     // chars per assistant entry
const BASH_OUT_LIMIT = 400;            // chars of bash stdout kept
const EDIT_PREVIEW_LIMIT = 800;

const READ_LIKE_TOOLS = new Set(['Read', 'Grep', 'Glob', 'LS', 'NotebookRead']);
const EDIT_LIKE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Update']);

export interface DistillOptions {
  /** Include `thinking` entries (default false — verbose and rarely useful for summaries). */
  includeThinking?: boolean;
  /** Hard cap on output characters; truncates from the start (oldest) if exceeded. */
  maxChars?: number;
}

export function distill(entries: Entry[], opts: DistillOptions = {}): string {
  const includeThinking = opts.includeThinking ?? false;
  const maxChars = opts.maxChars ?? 180_000;

  // First pass: collect paths that get edited later. A Read of a file that's
  // later edited is contextually relevant — keep it. A Read of something never
  // touched again is almost certainly noise.
  const editedPaths = new Set<string>();
  for (const e of entries) {
    if (e.role === 'toolCall' && e.tool && EDIT_LIKE_TOOLS.has(e.tool)) {
      const p = e.args?.path;
      if (typeof p === 'string') editedPaths.add(p);
    }
  }

  const lines: string[] = [];
  for (const e of entries) {
    const block = renderEntry(e, { includeThinking, editedPaths });
    if (block) lines.push(block);
  }

  let out = lines.join('\n\n');
  if (out.length > maxChars) {
    // Drop from the head — older context goes first.
    out = '[…earlier transcript omitted…]\n\n' + out.slice(out.length - maxChars);
  }
  return out;
}

interface RenderCtx {
  includeThinking: boolean;
  editedPaths: Set<string>;
}

function renderEntry(e: Entry, ctx: RenderCtx): string | null {
  switch (e.role) {
    case 'user':
      return e.text?.trim() ? `## user\n${e.text.trim()}` : null;

    case 'assistant': {
      const t = e.text?.trim();
      if (!t) return null;
      return `## assistant\n${truncate(t, ASSISTANT_TEXT_LIMIT)}`;
    }

    case 'thinking':
      if (!ctx.includeThinking) return null;
      return e.text?.trim() ? `## thinking\n${truncate(e.text.trim(), 600)}` : null;

    case 'bash': {
      const cmd = e.cmd?.trim();
      if (!cmd) return null;
      const out = e.out?.trim();
      const tail = out ? `\n→ ${truncate(out, BASH_OUT_LIMIT)}` : '';
      return `## bash\n$ ${cmd}${tail}`;
    }

    case 'toolCall': {
      const tool = e.tool ?? 'tool';
      const path = typeof e.args?.path === 'string' ? e.args.path : undefined;
      if (EDIT_LIKE_TOOLS.has(tool)) {
        const head = path ? `## ${tool} ${path}` : `## ${tool}`;
        const preview = e.preview?.trim();
        return preview ? `${head}\n${truncate(preview, EDIT_PREVIEW_LIMIT)}` : head;
      }
      if (READ_LIKE_TOOLS.has(tool)) {
        // Keep Reads only when the same path is later edited — they explain why.
        if (path && ctx.editedPaths.has(path)) return `## ${tool} ${path}`;
        return null;
      }
      // Unknown tool: keep one-line header for visibility.
      return path ? `## ${tool} ${path}` : `## ${tool}`;
    }

    case 'toolResult':
      // The parser already collapses results to a short summary, but for the
      // distilled transcript even that is rarely worth the tokens.
      return null;

    case 'system':
    case 'summary':
    case 'custom':
    default:
      return null;
  }
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + '…';
}
