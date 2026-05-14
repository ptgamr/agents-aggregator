import { useCallback, useState } from 'react';
import type { Tweaks } from '../theme';

export type SetTweak = <K extends keyof Tweaks>(key: K, value: Tweaks[K]) => void;

export function useTweaks(defaults: Tweaks): [Tweaks, SetTweak] {
  const [values, setValues] = useState<Tweaks>(defaults);
  const setTweak = useCallback<SetTweak>((key, value) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);
  return [values, setTweak];
}
