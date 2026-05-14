import { useCallback, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'aggregator.blurredProjects.v1';

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function save(s: Set<string>): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...s])); } catch { /* ignore */ }
}

export interface BlurredProjects {
  has: (cwd: string) => boolean;
  toggle: (cwd: string) => void;
  clear: () => void;
  size: number;
  list: string[];
}

export function useBlurredProjects(): BlurredProjects {
  const [set, setSet] = useState<Set<string>>(() => load());

  // Cross-tab sync — if another tab updates the list, mirror it here.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setSet(load());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggle = useCallback((cwd: string) => {
    setSet((prev) => {
      const next = new Set(prev);
      if (next.has(cwd)) next.delete(cwd); else next.add(cwd);
      save(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setSet((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set<string>();
      save(next);
      return next;
    });
  }, []);

  return useMemo(() => ({
    has: (cwd: string) => set.has(cwd),
    toggle,
    clear,
    size: set.size,
    list: [...set],
  }), [set, toggle, clear]);
}
