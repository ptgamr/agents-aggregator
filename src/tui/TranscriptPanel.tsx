import { useMemo } from 'react';
import type { SyntaxStyle } from '@opentui/core';
import type { Entry, Session } from '../shared/types';
import { filetypeFor, relTime, shortCwd } from './format';
import { createTuiSyntaxStyle } from './theme';

interface Props {
  session: Session | null;
  entries: Entry[];
  loading: boolean;
  error: string | null;
  focused: boolean;
}

interface BodyContext {
  syntaxStyle: SyntaxStyle;
  streaming: boolean;
}

const ROLE_STYLES: Record<string, { label: string; fg: string }> = {
  user: { label: 'you', fg: '#7dd3fc' },
  assistant: { label: 'assistant', fg: '#a78bfa' },
  thinking: { label: 'thinking', fg: '#666' },
  toolCall: { label: 'tool', fg: '#f59e0b' },
  toolResult: { label: 'result', fg: '#10b981' },
  bash: { label: 'bash', fg: '#34d399' },
  system: { label: 'system', fg: '#666' },
  summary: { label: 'summary', fg: '#888' },
  custom: { label: 'note', fg: '#888' },
};

function EntryView({ entry, ctx }: { entry: Entry; ctx: BodyContext }) {
  const style = ROLE_STYLES[entry.role] ?? ROLE_STYLES.custom;
  const path = entry.args?.path as string | undefined;

  // Tool-call subtitle: "ToolName · path"
  const subtitle =
    entry.role === 'toolCall'
      ? [entry.tool, path].filter(Boolean).join(' · ')
      : entry.role === 'toolResult'
      ? path || ''
      : '';

  const errBadge = entry.role === 'toolResult' && entry.ok === false;

  return (
    <box style={{ flexDirection: 'column', paddingBottom: 1 }}>
      {/* Role header: colored bar + label + optional subtitle + timestamp */}
      <box style={{ flexDirection: 'row' }}>
        <text fg={style.fg}>▎</text>
        <text fg={style.fg} style={{ attributes: 1 /* bold */ }}>
          {style.label}
        </text>
        {errBadge ? <text fg="#ef4444"> (err)</text> : null}
        {subtitle ? <text fg="#666">  {subtitle}</text> : null}
        <text fg="#3a3a3a" style={{ flexGrow: 1 }}>{'  '}{relTime(entry.timestamp)}</text>
      </box>
      <Body entry={entry} ctx={ctx} />
    </box>
  );
}

function Body({ entry, ctx }: { entry: Entry; ctx: BodyContext }) {
  const padLeft = 2;
  const { syntaxStyle, streaming } = ctx;

  if (entry.role === 'bash') {
    return (
      <box style={{ flexDirection: 'column', paddingLeft: padLeft, paddingTop: 1 }}>
        {entry.cmd ? (
          <code content={`$ ${entry.cmd}`} filetype="bash" syntaxStyle={syntaxStyle} />
        ) : null}
        {entry.out ? (
          <text fg="#aaa" wrapMode="word">{clip(entry.out, 40)}</text>
        ) : null}
      </box>
    );
  }

  if (entry.role === 'toolResult') {
    const body = entry.preview ?? entry.text ?? entry.out;
    if (!body) return null;
    const ft = filetypeFor((entry.args?.path as string | undefined) ?? '');
    if (ft) {
      return (
        <box style={{ paddingLeft: padLeft, paddingTop: 1 }}>
          <code content={clip(body, 60)} filetype={ft} syntaxStyle={syntaxStyle} />
        </box>
      );
    }
    return (
      <text fg="#aaa" style={{ paddingLeft: padLeft, paddingTop: 1 }} wrapMode="word">
        {clip(body, 40)}
      </text>
    );
  }

  if (entry.role === 'toolCall') {
    const preview = entry.preview ?? entry.text;
    if (!preview) return null;
    return (
      <text fg="#999" style={{ paddingLeft: padLeft, paddingTop: 1 }} wrapMode="word">
        {clip(preview, 20)}
      </text>
    );
  }

  // user / assistant — render as markdown (handles headings, lists, code fences,
  // tables, inline code, etc. — same approach opencode uses).
  if (entry.role === 'user' || entry.role === 'assistant') {
    const body = entry.text ?? entry.fullText ?? '';
    if (!body) return null;
    return (
      <box style={{ paddingLeft: padLeft, paddingTop: 1, flexDirection: 'column' }}>
        <markdown
          content={clip(body, 400)}
          syntaxStyle={syntaxStyle}
          fg="#d4d4d8"
          streaming={streaming}
          style={{ width: '100%', flexShrink: 0 }}
        />
      </box>
    );
  }

  // thinking / system / summary — dim plain text.
  const body = entry.text ?? entry.fullText ?? '';
  if (!body) return null;
  return (
    <text fg="#888" style={{ paddingLeft: padLeft, paddingTop: 1 }} wrapMode="word">
      {clip(body, 200)}
    </text>
  );
}

function clip(s: string, maxLines: number): string {
  const lines = s.split('\n');
  if (lines.length <= maxLines) return s;
  return lines.slice(0, maxLines).join('\n') + `\n  … ${lines.length - maxLines} more lines`;
}

export function TranscriptPanel({ session, entries, loading, error, focused }: Props) {
  const syntaxStyle = useMemo(() => createTuiSyntaxStyle(), []);
  const ctx: BodyContext = useMemo(
    () => ({ syntaxStyle, streaming: session?.live ?? false }),
    [syntaxStyle, session?.live],
  );

  const title = session
    ? ` ${session.name || shortCwd(session.cwd) || session.id} `
    : ' Transcript ';

  return (
    <box
      title={title}
      style={{
        border: true,
        borderColor: focused ? '#7dd3fc' : '#3a3a3a',
        focusedBorderColor: '#7dd3fc',
        flexDirection: 'column',
        flexGrow: 1,
      }}
    >
      <Header session={session} entryCount={entries.length} />
      <box style={{ flexGrow: 1, flexDirection: 'column' }}>
        {loading ? (
          <text fg="#888" style={{ paddingLeft: 1 }}>Loading…</text>
        ) : error ? (
          <text fg="#ef4444" style={{ paddingLeft: 1 }}>Error: {error}</text>
        ) : !session ? (
          <text fg="#666" style={{ paddingLeft: 1 }}>(select a session)</text>
        ) : entries.length === 0 ? (
          <text fg="#666" style={{ paddingLeft: 1 }}>(empty)</text>
        ) : (
          <scrollbox
            style={{
              flexGrow: 1,
              flexDirection: 'column',
              paddingLeft: 1,
              paddingRight: 1,
            }}
            focused={focused}
            stickyScroll
            stickyStart="bottom"
          >
            {entries.map((e) => (
              <EntryView key={e.id} entry={e} ctx={ctx} />
            ))}
          </scrollbox>
        )}
      </box>
    </box>
  );
}

function Header({
  session,
  entryCount,
}: {
  session: Session | null;
  entryCount: number;
}) {
  if (!session) return null;
  return (
    <box
      style={{
        flexDirection: 'row',
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: '#181818',
      }}
    >
      <text fg="#888">{session.agent}</text>
      <text fg="#444"> · </text>
      <text fg="#bbb" style={{ flexGrow: 1 }}>{shortCwd(session.cwd) || '(no cwd)'}</text>
      <text fg="#666">{entryCount} entries</text>
      {session.live ? <text fg="#10b981">  ● live</text> : null}
    </box>
  );
}
