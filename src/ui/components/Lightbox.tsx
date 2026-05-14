import {
  createContext, useCallback, useContext, useEffect, useState,
  type CSSProperties, type MouseEvent, type ReactNode,
} from 'react';
import { monoFont } from '../theme';

export interface LightboxImage { src: string; alt?: string; }

interface LightboxContextValue {
  open: (images: LightboxImage[], index?: number) => void;
}

const LightboxContext = createContext<LightboxContextValue | null>(null);

export function useLightbox(): LightboxContextValue {
  const ctx = useContext(LightboxContext);
  if (!ctx) throw new Error('LightboxProvider missing');
  return ctx;
}

interface State { images: LightboxImage[]; index: number; }

export function LightboxProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State | null>(null);

  const open = useCallback((images: LightboxImage[], index = 0) => {
    if (images.length === 0) return;
    setState({ images, index: Math.max(0, Math.min(images.length - 1, index)) });
  }, []);
  const close = useCallback(() => setState(null), []);

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setState((s) => s && { ...s, index: (s.index - 1 + s.images.length) % s.images.length });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setState((s) => s && { ...s, index: (s.index + 1) % s.images.length });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, close]);

  useEffect(() => {
    if (!state) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [state]);

  return (
    <LightboxContext.Provider value={{ open }}>
      {children}
      {state && (
        <Overlay
          state={state}
          onPrev={() => setState((s) => s && { ...s, index: (s.index - 1 + s.images.length) % s.images.length })}
          onNext={() => setState((s) => s && { ...s, index: (s.index + 1) % s.images.length })}
          onClose={close}
        />
      )}
    </LightboxContext.Provider>
  );
}

interface OverlayProps {
  state: State;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

function Overlay({ state, onPrev, onNext, onClose }: OverlayProps) {
  const img = state.images[state.index];
  const multi = state.images.length > 1;
  const stop = (e: MouseEvent) => e.stopPropagation();

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 2147483647,
        background: 'rgba(0,0,0,0.82)',
        backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 32, cursor: 'zoom-out',
      }}
    >
      <img
        src={img.src} alt={img.alt ?? ''}
        onClick={stop}
        style={{
          maxWidth: 'min(95vw, 1600px)', maxHeight: '92vh', objectFit: 'contain',
          boxShadow: '0 18px 60px rgba(0,0,0,0.55)', cursor: 'default',
          borderRadius: 4,
        }}
      />
      <IconBtn
        aria-label="Close"
        onClick={(e) => { stop(e); onClose(); }}
        style={{ top: 16, right: 16 }}
      >✕</IconBtn>
      {multi && (
        <>
          <IconBtn
            aria-label="Previous image"
            onClick={(e) => { stop(e); onPrev(); }}
            style={{ left: 16, top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, fontSize: 22 }}
          >‹</IconBtn>
          <IconBtn
            aria-label="Next image"
            onClick={(e) => { stop(e); onNext(); }}
            style={{ right: 16, top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, fontSize: 22 }}
          >›</IconBtn>
          <div style={{
            position: 'absolute', bottom: 22, left: '50%', transform: 'translateX(-50%)',
            color: 'rgba(255,255,255,0.82)', fontFamily: monoFont, fontSize: 12.5,
            background: 'rgba(0,0,0,0.4)', padding: '4px 10px', borderRadius: 12,
            pointerEvents: 'none',
          }}>
            {state.index + 1} / {state.images.length}
          </div>
        </>
      )}
    </div>
  );
}

interface IconBtnProps {
  children: ReactNode;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  style?: CSSProperties;
  'aria-label': string;
}

function IconBtn({ children, onClick, style, 'aria-label': ariaLabel }: IconBtnProps) {
  return (
    <button
      type="button" aria-label={ariaLabel} onClick={onClick}
      style={{
        position: 'absolute', width: 36, height: 36, borderRadius: 10,
        background: 'rgba(255,255,255,0.12)', color: '#fff',
        border: '1px solid rgba(255,255,255,0.18)',
        fontSize: 16, lineHeight: 1, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        ...style,
      }}
    >{children}</button>
  );
}
