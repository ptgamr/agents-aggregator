import { useState } from 'react';
import type { Entry, Session } from '../../shared/types';
import { extractJournal } from '../api';
import {
  backendModelLabel,
  monoFont, themes,
  type SummarizeBackend, type ThemeMode,
} from '../theme';
import { projectKeyFor, projectLabel, type JournalProposal } from './types';

interface SummarizeButtonProps {
  theme: ThemeMode;
  session: Session;
  entries: Entry[];
  onProposals: (proposals: JournalProposal[]) => void;
  /** Which CLI to shell out to (see Tweaks → Summarization). Defaults to claude. */
  backend?: SummarizeBackend;
  /** Number of cached proposals for this session. When > 0, the button click
   *  toggles the floating panel instead of re-running the model. */
  proposalsCount?: number;
  /** Whether the floating panel is currently visible. Drives the toggle label. */
  panelOpen?: boolean;
  /** Toggle handler — called when there are existing proposals. */
  onToggle?: () => void;
}

export function SummarizeButton({
  theme, session, entries, onProposals, backend = 'claude',
  proposalsCount = 0, panelOpen, onToggle,
}: SummarizeButtonProps) {
  const hasProposals = proposalsCount > 0;
  const t = themes[theme];
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const transcript = entries.slice(-20).map((e) => {
        if (e.role === 'user') return `USER: ${e.text ?? ''}`;
        if (e.role === 'assistant') return `ASSISTANT: ${e.text ?? ''}`;
        if (e.role === 'thinking') return `(thinking) ${e.text ?? ''}`;
        if (e.role === 'toolCall') return `TOOL ${e.tool}(${JSON.stringify(e.args ?? {})})`;
        if (e.role === 'toolResult') return `TOOL_RESULT ${e.tool}: ${e.summary ?? ''}`;
        if (e.role === 'bash') return `$ ${e.cmd ?? ''}\n${e.out ?? ''}`;
        return '';
      }).filter(Boolean).join('\n');

      const prompt = `You are reviewing a coding-agent session transcript and extracting durable journal entries for a developer's project notes.

Project: ${projectLabel(session.cwd)}  (${session.cwd})
Agent: ${session.agent}
Task: ${session.name || '(untitled)'}

Transcript:
${transcript}

Return ONLY valid JSON, no prose, of the form:
{"items":[{"kind":"learning|next|note","text":"...","tags":["..."]}]}

Rules:
- "learning" = a durable insight, gotcha, or decision someone would want to remember on this project.
- "next" = a concrete follow-up the developer should pick up next session. Action-oriented, imperative voice.
- "note" = freeform observation that isn't either.
- 1-2 sentences per item. No more than 4 items total. Be specific to this transcript.`;

      const raw = await extractJournal(prompt, backend);
      // Be liberal in what we accept — pull out the first {...} block.
      const match = raw.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match ? match[0] : raw) as {
        items?: Array<{ kind?: string; text?: string; tags?: unknown }>;
      };
      const items: JournalProposal[] = (parsed.items ?? []).map((it) => {
        const kind: JournalProposal['kind'] =
          it.kind === 'learning' || it.kind === 'next' || it.kind === 'note'
            ? it.kind : 'note';
        return {
          kind,
          text: String(it.text ?? '').trim(),
          tags: Array.isArray(it.tags)
            ? it.tags.filter((x): x is string => typeof x === 'string').slice(0, 4)
            : [],
          agent: session.agent,
          sourceSessionId: session.id,
          sourceEntryId: null,
          projectKey: projectKeyFor(session.cwd),
        };
      }).filter((x) => x.text);

      onProposals(items);
    } catch (err) {
      console.warn('summarize failed', err);
      onProposals([{
        kind: 'note',
        text: `(Could not parse model output — try again.)`,
        agent: session.agent,
        sourceSessionId: session.id,
        sourceEntryId: null,
        projectKey: projectKeyFor(session.cwd),
        tags: [],
      }]);
    } finally {
      setLoading(false);
    }
  };

  const model = backendModelLabel(backend);
  const handleClick = hasProposals && onToggle ? onToggle : run;
  const title = hasProposals
    ? (panelOpen ? 'Hide proposal panel' : 'Show proposal panel')
    : `Summarize last 20 entries with ${model} (change in Tweaks → Summarization)`;
  return (
    <button
      onClick={handleClick}
      disabled={loading}
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '4px 8px', borderRadius: 4,
        background: panelOpen ? t.panel2 : t.panel,
        border: `1px solid ${panelOpen ? t.amber + '88' : t.border}`,
        color: loading ? t.dim2 : t.fg2,
        fontFamily: monoFont, fontSize: 11,
        cursor: loading ? 'default' : 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ color: t.amber, fontSize: 10 }}>◆</span>
      {loading
        ? `summarizing via ${backend}…`
        : hasProposals
          ? (panelOpen ? 'hide proposals' : 'show proposals')
          : 'summarize → journal'}
      <span style={{ color: t.dim2, fontSize: 10 }}>
        · {hasProposals ? `${proposalsCount}` : model}
      </span>
    </button>
  );
}
