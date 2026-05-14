import type { AgentType } from '../../shared/types';
import type { Parser } from './base';
import { piParser } from './pi';

const parsers: Record<AgentType, Parser | null> = {
  pi: piParser,
  claude: null,    // Phase 3
  codex: null,     // Phase 4
  opencode: null,  // Phase 5
};

export function parserFor(agent: AgentType): Parser | null {
  return parsers[agent];
}

export { sniffAgent } from './base';
