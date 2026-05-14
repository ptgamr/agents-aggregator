export type AgentType = 'claude' | 'codex' | 'opencode' | 'pi';

export interface Source {
  id: string;
  label: string;
  agent: AgentType;
  root: string;
  enabled: boolean;
  sessions?: number;
}

export interface Session {
  id: string;
  sourceId: string;
  agent: AgentType;
  name: string | null;
  cwd: string;
  model: string;
  startedAt: string;
  updatedAt: string;
  messageCount: number;
  costUsd: number | null;
  live: boolean;
  branches: number;
  status: 'streaming' | 'tool' | 'idle' | string;
}

export type EntryRole =
  | 'user'
  | 'assistant'
  | 'toolCall'
  | 'toolResult'
  | 'thinking'
  | 'bash'
  | 'system'
  | 'summary'
  | 'custom';

/** Composite session id used in URLs and React keys: `<sourceId>:<sessionId>`. */
export const SESSION_ID_SEP = ':';
export function composeSessionId(sourceId: string, sessionId: string): string {
  return `${sourceId}${SESSION_ID_SEP}${sessionId}`;
}
export function splitSessionId(id: string): { sourceId: string; sessionId: string } | null {
  const i = id.indexOf(SESSION_ID_SEP);
  if (i < 0) return null;
  return { sourceId: id.slice(0, i), sessionId: id.slice(i + 1) };
}

export interface Entry {
  id: string;
  role: EntryRole;
  timestamp: string;
  text?: string;
  fullText?: string;
  streaming?: boolean;
  tool?: string;
  args?: { path?: string; [k: string]: unknown };
  preview?: string;
  cmd?: string;
  out?: string;
  ok?: boolean;
  summary?: string;
}
