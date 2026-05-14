import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type MouseEvent, type ReactNode,
} from 'react';
import { monoFont, themes, type ThemeMode } from '../theme';
import { CodeView } from './CodeView';
import { DiffView } from './DiffView';
import { SideBySideDiff } from './SideBySideDiff';

export type DiffMode = 'unified' | 'split';
const DIFF_MODE_KEY = 'aa.filePreview.diffMode';

function loadDiffMode(): DiffMode {
  try {
    const v = localStorage.getItem(DIFF_MODE_KEY);
    if (v === 'split' || v === 'unified') return v;
  } catch { /* localStorage may be unavailable */ }
  return 'unified';
}

function saveDiffMode(m: DiffMode): void {
  try { localStorage.setItem(DIFF_MODE_KEY, m); } catch { /* ignore */ }
}

export interface FileEdit {
  oldText: string;
  newText: string;
}

export interface FilePreview {
  path: string;
  tool: string;
  edits: FileEdit[];
}

interface FilePreviewContextValue {
  open: (preview: FilePreview) => void;
}

const FilePreviewContext = createContext<FilePreviewContextValue | null>(null);

export function useFilePreview(): FilePreviewContextValue {
  const ctx = useContext(FilePreviewContext);
  if (!ctx) throw new Error('FilePreviewProvider missing');
  return ctx;
}

/**
 * Build a FilePreview from a tool entry's args. Returns null for tools we
 * don't know how to expand into a diff (e.g. Read, Grep).
 */
export function previewFromArgs(
  tool: string | undefined,
  args: Record<string, unknown> | undefined,
): FilePreview | null {
  if (!args) return null;
  const path = typeof args.path === 'string' ? args.path : '';
  if (!path) return null;

  // Single-edit
  if (typeof args.old_string === 'string' && typeof args.new_string === 'string') {
    return {
      path, tool: tool ?? 'Edit',
      edits: [{ oldText: args.old_string, newText: args.new_string }],
    };
  }

  // Multi-edit
  if (Array.isArray(args.edits)) {
    const edits: FileEdit[] = [];
    for (const ed of args.edits as Array<{ old_string?: unknown; new_string?: unknown }>) {
      if (typeof ed?.old_string === 'string' && typeof ed?.new_string === 'string') {
        edits.push({ oldText: ed.old_string, newText: ed.new_string });
      }
    }
    if (edits.length > 0) return { path, tool: tool ?? 'MultiEdit', edits };
  }

  // Write / new-file
  if (typeof args.content === 'string') {
    return {
      path, tool: tool ?? 'Write',
      edits: [{ oldText: '', newText: args.content }],
    };
  }

  return null;
}

interface ProviderProps { theme: ThemeMode; children: ReactNode; }

export function FilePreviewProvider({ theme, children }: ProviderProps) {
  const [preview, setPreview] = useState<FilePreview | null>(null);

  const open = useCallback((p: FilePreview) => setPreview(p), []);
  const close = useCallback(() => setPreview(null), []);

  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview, close]);

  useEffect(() => {
    if (!preview) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [preview]);

  const value = useMemo(() => ({ open }), [open]);

  return (
    <FilePreviewContext.Provider value={value}>
      {children}
      {preview && <Overlay theme={theme} preview={preview} onClose={close} />}
    </FilePreviewContext.Provider>
  );
}

interface OverlayProps {
  theme: ThemeMode;
  preview: FilePreview;
  onClose: () => void;
}

function Overlay({ theme, preview, onClose }: OverlayProps) {
  const t = themes[theme];
  const stop = (e: MouseEvent) => e.stopPropagation();
  const totalEdits = preview.edits.length;
  const isNewFile = totalEdits === 1 && preview.edits[0].oldText === '';
  const [mode, setMode] = useState<DiffMode>(() => loadDiffMode());
  const changeMode = (m: DiffMode) => { setMode(m); saveDiffMode(m); };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 2147483646,
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 32,
      }}
    >
      <div
        onClick={stop}
        style={{
          width: 'min(96vw, 1200px)', maxHeight: '92vh',
          display: 'flex', flexDirection: 'column',
          background: t.bg, color: t.fg,
          border: `1px solid ${t.border}`, borderRadius: 8,
          boxShadow: '0 18px 60px rgba(0,0,0,0.55)',
          overflow: 'hidden',
        }}
      >
        <div style={{
          display: 'flex', gap: 10, alignItems: 'center',
          padding: '10px 14px', background: t.panel2,
          borderBottom: `1px solid ${t.border}`,
          fontFamily: monoFont, fontSize: 12.5, color: t.dim,
        }}>
          <span style={{ color: t.accent }}>▸</span>
          <span style={{ color: t.fg, fontWeight: 500 }}>{preview.tool}</span>
          <span style={{
            flex: 1, minWidth: 0, color: t.fg2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }} title={preview.path}>{preview.path}</span>
          <span style={{ color: isNewFile ? t.green : t.dim2 }}>
            {isNewFile
              ? 'new file'
              : totalEdits === 1 ? '1 edit' : `${totalEdits} edits`}
          </span>
          {!isNewFile && (
            <ModeToggle theme={theme} mode={mode} onChange={changeMode} />
          )}
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              background: 'transparent', color: t.fg2,
              border: `1px solid ${t.border}`, borderRadius: 6,
              padding: '3px 9px', fontSize: 13, lineHeight: 1, cursor: 'pointer',
            }}
          >✕</button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: t.bg }}>
          {isNewFile ? (
            <CodeView
              theme={theme}
              path={preview.path}
              code={preview.edits[0].newText}
            />
          ) : (
            preview.edits.map((ed, i) => (
              <div key={i} style={{
                borderTop: i === 0 ? 'none' : `1px solid ${t.border2}`,
              }}>
                {totalEdits > 1 && (
                  <div style={{
                    padding: '6px 14px', fontSize: 11.5, color: t.dim2,
                    fontFamily: monoFont, letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    background: t.panel,
                  }}>
                    edit {i + 1} / {totalEdits}
                  </div>
                )}
                {mode === 'split' ? (
                  <SideBySideDiff
                    theme={theme}
                    oldText={ed.oldText}
                    newText={ed.newText}
                    maxLines={100000}
                    maxHeight="none"
                  />
                ) : (
                  <DiffView
                    theme={theme}
                    oldText={ed.oldText}
                    newText={ed.newText}
                    maxLines={100000}
                    maxHeight="none"
                  />
                )}
              </div>
            ))
          )}
        </div>

        <div style={{
          padding: '8px 14px', borderTop: `1px solid ${t.border}`,
          background: t.panel2, color: t.dim2,
          fontFamily: monoFont, fontSize: 11.5,
        }}>
          Esc to close · click outside to dismiss
        </div>
      </div>
    </div>
  );
}

interface ModeToggleProps {
  theme: ThemeMode;
  mode: DiffMode;
  onChange: (m: DiffMode) => void;
}

function ModeToggle({ theme, mode, onChange }: ModeToggleProps) {
  const t = themes[theme];
  const opts: DiffMode[] = ['unified', 'split'];
  return (
    <div role="group" aria-label="Diff mode" style={{
      display: 'inline-flex', border: `1px solid ${t.border}`, borderRadius: 6,
      overflow: 'hidden', fontFamily: monoFont, fontSize: 11.5, lineHeight: 1,
    }}>
      {opts.map((opt) => {
        const active = mode === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            aria-pressed={active}
            style={{
              background: active ? t.accent : 'transparent',
              color: active ? '#fff' : t.fg2,
              border: 'none',
              padding: '4px 9px',
              cursor: active ? 'default' : 'pointer',
              borderRight: opt === 'unified' ? `1px solid ${t.border}` : 'none',
            }}
          >{opt}</button>
        );
      })}
    </div>
  );
}
