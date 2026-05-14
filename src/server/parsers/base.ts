import fs from 'node:fs';
import path from 'node:path';
import type { AgentType, Entry, Session } from '../../shared/types';

export interface SessionFile {
  sessionId: string;
  filePath: string;
}

export interface Parser {
  agent: AgentType;
  /** Enumerate session files under a source root. */
  listSessions(root: string): SessionFile[];
  /** Parse session metadata from the file (cheap header read or stat). */
  parseSession(filePath: string, sourceId: string): Promise<Session & { filePath: string }> | (Session & { filePath: string });
  /** Parse all entries in the file (normalized to design's role taxonomy). */
  parseEntries(filePath: string): Promise<Entry[]> | Entry[];
}

/**
 * Sniff the agent type from a source root. Returns null if no parser claims it.
 * Pi:       <root>/agent/sessions/<encoded-cwd>/<file>.jsonl
 * Claude:   <root>/projects/<encoded-cwd>/<uuid>.jsonl
 * Codex:    <root>/sessions/YYYY/MM/DD/rollout-<uuid>.jsonl
 * OpenCode: unknown (TBD in phase 5)
 */
export function sniffAgent(root: string): AgentType | null {
  if (!fs.existsSync(root)) return null;
  if (fs.existsSync(path.join(root, 'agent', 'sessions'))) return 'pi';
  if (fs.existsSync(path.join(root, 'projects'))) return 'claude';
  if (fs.existsSync(path.join(root, 'sessions'))) return 'codex';
  if (fs.existsSync(path.join(root, 'config'))) return 'opencode';
  return null;
}
