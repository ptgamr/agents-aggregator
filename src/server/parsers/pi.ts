import fs from 'node:fs';
import path from 'node:path';
import { composeSessionId, type Entry, type Session } from '../../shared/types';
import type { Parser, SessionFile } from './base';

interface PiSessionHeader {
  type: 'session';
  version: number;
  id: string;
  timestamp: string;
  cwd: string;
}

interface PiModelChange {
  type: 'model_change';
  id: string;
  parentId: string | null;
  timestamp: string;
  provider: string;
  modelId: string;
}

interface PiMessage {
  type: 'message';
  id: string;
  parentId: string | null;
  timestamp: string;
  message: {
    role: 'user' | 'assistant' | 'toolResult' | string;
    content?: PiPart[];
    toolCallId?: string;
    toolName?: string;
  };
}

type PiPart =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'toolCall'; id: string; name: string; arguments: Record<string, unknown> };

type PiLine = PiSessionHeader | PiModelChange | PiMessage | { type: string; [k: string]: unknown };

function readJsonl(filePath: string): PiLine[] {
  const text = fs.readFileSync(filePath, 'utf8');
  const out: PiLine[] = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    try { out.push(JSON.parse(line)); } catch { /* skip malformed */ }
  }
  return out;
}

function previewFromArgs(name: string, args: Record<string, unknown>): string {
  if (name === 'bash') return String((args.cmd as string) || (args.command as string) || '');
  // Cheap preview: small subset of args
  const interesting = ['path', 'file', 'pattern', 'query'];
  const picked: Record<string, unknown> = {};
  for (const k of interesting) if (k in args) picked[k] = args[k];
  if (Object.keys(picked).length === 0) return JSON.stringify(args).slice(0, 200);
  return JSON.stringify(picked);
}

function shortTime(iso: string): string {
  // Render HH:MM:SS from an ISO timestamp; fall back to the raw value.
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toISOString().slice(11, 19);
  } catch {
    return iso;
  }
}

export const piParser: Parser = {
  agent: 'pi',

  listSessions(root: string): SessionFile[] {
    const sessionsDir = path.join(root, 'agent', 'sessions');
    if (!fs.existsSync(sessionsDir)) return [];
    const out: SessionFile[] = [];
    for (const cwdEnc of fs.readdirSync(sessionsDir)) {
      const dir = path.join(sessionsDir, cwdEnc);
      let stat;
      try { stat = fs.statSync(dir); } catch { continue; }
      if (!stat.isDirectory()) continue;
      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.jsonl')) continue;
        const filePath = path.join(dir, file);
        // Filename pattern: <ISO>_<uuid>.jsonl — sessionId is the uuid
        const m = file.match(/_([0-9a-f-]+)\.jsonl$/);
        const sessionId = m?.[1] ?? file.replace(/\.jsonl$/, '');
        out.push({ sessionId, filePath });
      }
    }
    return out;
  },

  parseSession(filePath: string, sourceId: string): Session & { filePath: string } {
    const lines = readJsonl(filePath);
    let header: PiSessionHeader | null = null;
    let model: string | null = null;
    let messageCount = 0;
    let lastTs: string | null = null;
    for (const l of lines) {
      if (l.type === 'session') header = l as PiSessionHeader;
      else if (l.type === 'model_change') model = (l as PiModelChange).modelId;
      else if (l.type === 'message') {
        messageCount += 1;
        lastTs = (l as PiMessage).timestamp;
      }
    }
    const stat = fs.statSync(filePath);
    const startedAt = header?.timestamp ?? stat.birthtime.toISOString();
    const updatedAt = lastTs ?? stat.mtime.toISOString();
    const sessionId = header?.id ?? path.basename(filePath, '.jsonl');
    return {
      id: composeSessionId(sourceId, sessionId),
      sourceId,
      agent: 'pi',
      name: null,
      cwd: header?.cwd ?? '',
      model: model ?? '',
      startedAt,
      updatedAt,
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

    // First pass: collect bash toolResults by toolCallId so we can fold them
    // into their toolCall entry (the design renders bash as cmd + out together).
    const bashResults = new Map<string, { out: string; timestamp: string }>();
    for (const l of lines) {
      if (l.type !== 'message') continue;
      const m = l as PiMessage;
      if (m.message.role !== 'toolResult') continue;
      if (m.message.toolName !== 'bash') continue;
      const id = m.message.toolCallId;
      if (!id) continue;
      const text = (m.message.content ?? [])
        .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text).join('');
      bashResults.set(id, { out: text, timestamp: shortTime(m.timestamp) });
    }

    const out: Entry[] = [];
    for (const l of lines) {
      if (l.type !== 'message') continue;
      const m = l as PiMessage;
      const ts = shortTime(m.timestamp);
      const role = m.message.role;
      const parts = m.message.content ?? [];

      if (role === 'user') {
        const text = parts
          .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
          .map((p) => p.text).join('\n');
        if (text) out.push({ id: m.id, role: 'user', timestamp: ts, text });
        continue;
      }

      if (role === 'assistant') {
        parts.forEach((p, i) => {
          const eid = parts.length === 1 ? m.id : `${m.id}#${i}`;
          if (p.type === 'text') {
            out.push({ id: eid, role: 'assistant', timestamp: ts, text: p.text });
          } else if (p.type === 'thinking') {
            out.push({ id: eid, role: 'thinking', timestamp: ts, text: p.thinking });
          } else if (p.type === 'toolCall') {
            if (p.name === 'bash') {
              const r = bashResults.get(p.id);
              const cmd = String((p.arguments?.cmd as string) || (p.arguments?.command as string) || '');
              out.push({
                id: eid, role: 'bash', timestamp: ts,
                cmd, out: r?.out ?? '',
              });
            } else {
              const argPath = typeof p.arguments?.path === 'string' ? (p.arguments.path as string) : undefined;
              out.push({
                id: eid, role: 'toolCall', timestamp: ts,
                tool: p.name,
                args: { path: argPath, ...p.arguments },
                preview: previewFromArgs(p.name, p.arguments ?? {}),
              });
            }
          }
        });
        continue;
      }

      if (role === 'toolResult') {
        if (m.message.toolName === 'bash') continue; // folded into the bash toolCall
        const text = parts
          .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
          .map((p) => p.text).join('\n');
        const lineCount = text.split('\n').length;
        out.push({
          id: m.id, role: 'toolResult', timestamp: ts,
          tool: m.message.toolName,
          ok: true,
          summary: lineCount > 1 ? `${lineCount} lines` : text.slice(0, 120),
        });
        continue;
      }
    }
    return out;
  },
};
