import fs from 'node:fs';
import path from 'node:path';
import { composeSessionId, type Entry, type EntryImage, type Session } from '../../shared/types';
import type { Parser, SessionFile } from './base';

interface ClaudeAssistantUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

interface ClaudeMessageLine {
  type: 'user' | 'assistant';
  uuid: string;
  parentUuid: string | null;
  timestamp: string;
  cwd?: string;
  sessionId?: string;
  isSidechain?: boolean;
  message: {
    role: 'user' | 'assistant' | string;
    model?: string;
    usage?: ClaudeAssistantUsage;
    content: string | ClaudeContentBlock[];
  };
}

type ClaudeImageSource =
  | { type: 'base64'; media_type: string; data: string }
  | { type: 'url'; url: string };

type ClaudeContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string; signature?: string }
  | { type: 'image'; source: ClaudeImageSource }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string | ClaudeContentBlock[]; is_error?: boolean };

function imageFromBlock(p: Extract<ClaudeContentBlock, { type: 'image' }>): EntryImage | null {
  const src = p.source;
  if (!src) return null;
  if (src.type === 'base64') {
    if (!src.data) return null;
    return { mime: src.media_type || 'image/png', data: src.data };
  }
  if (src.type === 'url') {
    if (!src.url) return null;
    return { mime: 'image/*', url: src.url };
  }
  return null;
}

interface ClaudeTitleLine { type: 'ai-title'; aiTitle: string; sessionId: string; }
type ClaudeLine = ClaudeMessageLine | ClaudeTitleLine | { type: string; [k: string]: unknown };

function readJsonl(filePath: string): ClaudeLine[] {
  const text = fs.readFileSync(filePath, 'utf8');
  const out: ClaudeLine[] = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    try { out.push(JSON.parse(line)); } catch { /* skip */ }
  }
  return out;
}

function shortTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toISOString().slice(11, 19);
  } catch {
    return iso;
  }
}

function tcToString(content: string | ClaudeContentBlock[] | undefined): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return content
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text).join('\n');
}

function previewFromInput(name: string, input: Record<string, unknown>): string {
  if (name === 'Bash') return String(input.command ?? '');
  const interesting = ['file_path', 'path', 'pattern', 'query', 'description'];
  const picked: Record<string, unknown> = {};
  for (const k of interesting) if (k in input) picked[k] = input[k];
  if (Object.keys(picked).length === 0) return JSON.stringify(input).slice(0, 200);
  return JSON.stringify(picked);
}

export const claudeParser: Parser = {
  agent: 'claude',

  listSessions(root: string): SessionFile[] {
    const projects = path.join(root, 'projects');
    if (!fs.existsSync(projects)) return [];
    const out: SessionFile[] = [];
    for (const projDir of fs.readdirSync(projects)) {
      const dir = path.join(projects, projDir);
      let stat;
      try { stat = fs.statSync(dir); } catch { continue; }
      if (!stat.isDirectory()) continue;
      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.jsonl')) continue;
        out.push({
          sessionId: file.replace(/\.jsonl$/, ''),
          filePath: path.join(dir, file),
        });
      }
    }
    return out;
  },

  parseSession(filePath: string, sourceId: string): Session & { filePath: string } {
    const lines = readJsonl(filePath);
    let cwd = '';
    let model = '';
    let name: string | null = null;
    let firstTs: string | null = null;
    let lastTs: string | null = null;
    let messageCount = 0;
    for (const l of lines) {
      if (l.type === 'user' || l.type === 'assistant') {
        const m = l as ClaudeMessageLine;
        if (m.isSidechain) continue;
        if (!firstTs) firstTs = m.timestamp;
        lastTs = m.timestamp;
        if (!cwd && m.cwd) cwd = m.cwd;
        if (m.type === 'assistant' && m.message.model) model = m.message.model;
        messageCount += 1;
      } else if (l.type === 'ai-title') {
        // Last title wins — Claude updates this as the conversation evolves.
        name = (l as ClaudeTitleLine).aiTitle;
      }
    }
    const stat = fs.statSync(filePath);
    const sessionId = path.basename(filePath, '.jsonl');
    return {
      id: composeSessionId(sourceId, sessionId),
      sourceId,
      agent: 'claude',
      name,
      cwd,
      model,
      startedAt: firstTs ?? stat.birthtime.toISOString(),
      updatedAt: lastTs ?? stat.mtime.toISOString(),
      messageCount,
      costUsd: null,
      live: false,
      branches: 0,
      status: 'idle',
      filePath,
    };
  },

  parseEntries(filePath: string): Entry[] {
    const lines = readJsonl(filePath);

    // First pass: collect Bash tool_results by tool_use_id so we can fold them
    // into their tool_use entry.
    const bashResults = new Map<string, { out: string; timestamp: string; isError: boolean }>();
    // Track which tool_use ids correspond to Bash so we know which results to fold.
    const bashToolUseIds = new Set<string>();
    for (const l of lines) {
      if (l.type !== 'assistant') continue;
      const m = l as ClaudeMessageLine;
      if (m.isSidechain) continue;
      const c = m.message.content;
      if (!Array.isArray(c)) continue;
      for (const p of c) {
        if (p.type === 'tool_use' && p.name === 'Bash') bashToolUseIds.add(p.id);
      }
    }
    for (const l of lines) {
      if (l.type !== 'user') continue;
      const m = l as ClaudeMessageLine;
      if (m.isSidechain) continue;
      const c = m.message.content;
      if (!Array.isArray(c)) continue;
      for (const p of c) {
        if (p.type !== 'tool_result') continue;
        if (!bashToolUseIds.has(p.tool_use_id)) continue;
        bashResults.set(p.tool_use_id, {
          out: tcToString(p.content),
          timestamp: shortTime(m.timestamp),
          isError: !!p.is_error,
        });
      }
    }

    const out: Entry[] = [];
    for (const l of lines) {
      if (l.type !== 'user' && l.type !== 'assistant') continue;
      const m = l as ClaudeMessageLine;
      if (m.isSidechain) continue;
      const ts = shortTime(m.timestamp);
      const role = m.message.role;
      const c = m.message.content;

      if (role === 'user') {
        if (typeof c === 'string') {
          if (c.trim()) out.push({ id: m.uuid, role: 'user', timestamp: ts, text: c });
          continue;
        }
        if (!Array.isArray(c)) continue;
        let lastUserEntry: Entry | null = null;
        c.forEach((p, i) => {
          const eid = c.length === 1 ? m.uuid : `${m.uuid}#${i}`;
          if (p.type === 'text') {
            if (p.text.trim()) {
              lastUserEntry = { id: eid, role: 'user', timestamp: ts, text: p.text };
              out.push(lastUserEntry);
            }
          } else if (p.type === 'image') {
            const img = imageFromBlock(p);
            if (!img) return;
            if (lastUserEntry) {
              (lastUserEntry.images ??= []).push(img);
            } else {
              lastUserEntry = { id: eid, role: 'user', timestamp: ts, images: [img] };
              out.push(lastUserEntry);
            }
          } else if (p.type === 'tool_result') {
            if (bashToolUseIds.has(p.tool_use_id)) return; // folded into bash entry
            const text = tcToString(p.content);
            const lineCount = text.split('\n').length;
            out.push({
              id: eid, role: 'toolResult', timestamp: ts,
              ok: !p.is_error,
              summary: lineCount > 1 ? `${lineCount} lines` : text.slice(0, 120),
            });
          }
        });
        continue;
      }

      if (role === 'assistant') {
        if (!Array.isArray(c)) continue;
        let lastAsstEntry: Entry | null = null;
        c.forEach((p, i) => {
          const eid = c.length === 1 ? m.uuid : `${m.uuid}#${i}`;
          if (p.type === 'text') {
            if (p.text) {
              lastAsstEntry = { id: eid, role: 'assistant', timestamp: ts, text: p.text };
              out.push(lastAsstEntry);
            }
          } else if (p.type === 'thinking') {
            if (p.thinking) out.push({ id: eid, role: 'thinking', timestamp: ts, text: p.thinking });
          } else if (p.type === 'image') {
            const img = imageFromBlock(p);
            if (!img) return;
            if (lastAsstEntry) {
              (lastAsstEntry.images ??= []).push(img);
            } else {
              lastAsstEntry = { id: eid, role: 'assistant', timestamp: ts, images: [img] };
              out.push(lastAsstEntry);
            }
          } else if (p.type === 'tool_use') {
            if (p.name === 'Bash') {
              const r = bashResults.get(p.id);
              out.push({
                id: eid, role: 'bash', timestamp: ts,
                cmd: String(p.input.command ?? ''),
                out: r?.out ?? '',
              });
            } else {
              const argPath = typeof p.input.file_path === 'string'
                ? (p.input.file_path as string)
                : typeof p.input.path === 'string' ? (p.input.path as string) : undefined;
              out.push({
                id: eid, role: 'toolCall', timestamp: ts,
                tool: p.name,
                args: { path: argPath, ...p.input },
                preview: previewFromInput(p.name, p.input),
              });
            }
          }
        });
        continue;
      }
    }
    return out;
  },
};
