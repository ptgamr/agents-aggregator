import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { log } from './logger';

export type Backend = 'claude' | 'codex';

export interface SummarizeChunk {
  type: 'status' | 'chunk' | 'done' | 'error';
  text?: string;
  detail?: string;
}

const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';
const CODEX_BIN = process.env.CODEX_BIN || 'codex';

const SYSTEM_PROMPT = [
  'You are summarizing a coding-agent session for a developer reviewing past work.',
  'Do NOT call any tools. Do NOT ask follow-up questions. Just produce the summary as plain markdown.',
  'Format:',
  '**Goal.** One sentence.',
  '**Done.** 3-7 bullets, each starting with a verb (Fixed/Added/Refactored/Investigated/…). Reference files in backticks when relevant.',
  '**Files changed.** Comma-separated list of paths, or "none".',
  '**Open / unfinished.** 0-3 bullets, or "none".',
  'Be terse. Do not pad with preamble or sign-off.',
].join('\n');

const USER_PREAMBLE = 'Below is a distilled transcript. Summarize per the format above.\n\n---\n\n';

/**
 * Spawn the chosen agent CLI, feed it the system prompt + distilled transcript,
 * and stream stdout back as chunks. The CLI is invoked in its non-interactive
 * mode with tools disabled / a read-only sandbox so it can't touch the filesystem.
 */
export async function* summarize(
  backend: Backend,
  distilled: string,
  signal: AbortSignal,
): AsyncGenerator<SummarizeChunk> {
  yield { type: 'status', text: `starting ${backend}…` };

  // Codex stdout has chrome (headers, prompt echo, "tokens used" footer) that
  // we don't want to surface — so we route Codex's clean final message through
  // a temp file via --output-last-message, and ignore its stdout.
  const codexOutFile = backend === 'codex'
    ? path.join(os.tmpdir(), `agg-codex-${randomUUID()}.txt`)
    : null;

  let proc: ChildProcessWithoutNullStreams;
  try {
    proc = spawnBackend(backend, codexOutFile);
  } catch (err) {
    yield { type: 'error', detail: (err as Error).message };
    return;
  }

  // Kill the child if the request is aborted.
  const onAbort = () => { try { proc.kill('SIGTERM'); } catch { /* ignore */ } };
  signal.addEventListener('abort', onAbort, { once: true });

  // Feed the prompt on stdin, then close stdin so the CLI starts working.
  const fullPrompt = backend === 'claude'
    ? `${SYSTEM_PROMPT}\n\n${USER_PREAMBLE}${distilled}`
    : `${SYSTEM_PROMPT}\n\n${USER_PREAMBLE}${distilled}`;
  proc.stdin.write(fullPrompt);
  proc.stdin.end();

  // Collect stderr for diagnostics on failure — don't surface it to the client
  // unless the process exits non-zero.
  let stderrBuf = '';
  proc.stderr.on('data', (b: Buffer) => { stderrBuf += b.toString('utf8'); });

  // Stream stdout. Both CLIs print the assistant's response to stdout as it
  // arrives in their default text mode; we forward chunks verbatim.
  type StdoutEvent = { kind: 'chunk'; text: string } | { kind: 'end' };
  const queue: StdoutEvent[] = [];
  let resolve: (() => void) | null = null;

  proc.stdout.on('data', (b: Buffer) => {
    // For Codex we drop stdout — the clean response comes via --output-last-message.
    if (backend === 'codex') return;
    queue.push({ kind: 'chunk', text: b.toString('utf8') });
    resolve?.();
  });
  const exitPromise = new Promise<{ code: number | null }>((res) => {
    proc.on('close', (code) => { queue.push({ kind: 'end' }); resolve?.(); res({ code }); });
    proc.on('error', (err) => {
      queue.push({ kind: 'chunk', text: `\n[spawn error: ${err.message}]` });
      queue.push({ kind: 'end' });
      resolve?.();
      res({ code: -1 });
    });
  });

  // Pump the queue, yielding chunks until the process ends.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (queue.length === 0) {
      await new Promise<void>((r) => { resolve = r; });
      resolve = null;
    }
    const ev = queue.shift();
    if (!ev) continue;
    if (ev.kind === 'end') break;
    yield { type: 'chunk', text: ev.text };
  }

  signal.removeEventListener('abort', onAbort);
  const { code } = await exitPromise;
  if (code !== 0) {
    log.warn({ backend, code, stderr: stderrBuf.slice(0, 1000) }, 'summarizer exited non-zero');
    yield { type: 'error', detail: stderrBuf.trim().slice(-500) || `exit ${code}` };
    if (codexOutFile) fs.unlink(codexOutFile).catch(() => { /* ignore */ });
    return;
  }
  if (codexOutFile) {
    try {
      const finalText = await fs.readFile(codexOutFile, 'utf8');
      if (finalText.trim()) yield { type: 'chunk', text: finalText };
    } catch (err) {
      log.warn({ err, codexOutFile }, 'failed to read codex output file');
      yield { type: 'error', detail: 'codex produced no output file' };
      return;
    } finally {
      fs.unlink(codexOutFile).catch(() => { /* ignore */ });
    }
  }
  yield { type: 'done' };
}

function spawnBackend(backend: Backend, codexOutFile: string | null): ChildProcessWithoutNullStreams {
  if (backend === 'claude') {
    // --tools ""           disable all tools
    // --model haiku        cheap + fast for summaries
    // --permission-mode dontAsk  never prompt for permission
    // --no-session-persistence  don't pollute ~/.claude with this run
    return spawn(
      CLAUDE_BIN,
      [
        '-p',
        '--tools', '',
        '--model', 'haiku',
        '--permission-mode', 'dontAsk',
        '--no-session-persistence',
      ],
      { cwd: os.tmpdir(), stdio: ['pipe', 'pipe', 'pipe'] },
    );
  }
  // codex exec - reads prompt from stdin
  // --sandbox read-only  safest mode, no file writes
  // --skip-git-repo-check  /tmp isn't a git repo
  // --ephemeral          don't persist a session file
  if (!codexOutFile) throw new Error('codexOutFile required for codex backend');
  return spawn(
    CODEX_BIN,
    [
      'exec',
      '--sandbox', 'read-only',
      '--skip-git-repo-check',
      '--ephemeral',
      '--output-last-message', codexOutFile,
      '-',
    ],
    { cwd: os.tmpdir(), stdio: ['pipe', 'pipe', 'pipe'] },
  );
}
