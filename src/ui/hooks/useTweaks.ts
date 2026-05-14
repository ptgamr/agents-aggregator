import { useCallback, useEffect, useState } from 'react';
import type { Tweaks } from '../theme';

export type SetTweak = <K extends keyof Tweaks>(key: K, value: Tweaks[K]) => void;

const STORAGE_KEY = 'aggregator.tweaks.v1';

function load(defaults: Tweaks): Tweaks {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<Tweaks>;
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}

function save(values: Tweaks): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(values)); } catch { /* ignore */ }
}

export function useTweaks(defaults: Tweaks): [Tweaks, SetTweak] {
  const [values, setValues] = useState<Tweaks>(() => load(defaults));

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setValues(load(defaults));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [defaults]);

  const setTweak = useCallback<SetTweak>((key, value) => {
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      save(next);
      return next;
    });
  }, []);
  return [values, setTweak];
}
