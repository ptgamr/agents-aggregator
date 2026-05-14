import { useEffect, useRef, useState } from 'react';
import type { Entry } from '../../shared/types';
import { PROTO_CYCLE } from '../cycle';

export type EntriesMap = Record<string, Entry[]>;

// Typewriter on the streaming entry in the active session, periodically
// finishes the streaming entry and enqueues the next event from PROTO_CYCLE.
export function useLiveStream(
  activeId: string,
  initialEntries: EntriesMap,
  loud: boolean,
): EntriesMap {
  const [entries, setEntries] = useState<EntriesMap>(() => ({ ...initialEntries }));
  const tickRef = useRef(0);

  useEffect(() => {
    const id = setInterval(() => {
      setEntries((prev) => {
        const arr = prev[activeId];
        if (!arr) return prev;
        const last = arr[arr.length - 1];
        if (!last?.streaming) return prev;
        const target = last.fullText ?? last.text ?? '';
        const current = last.text ?? '';
        if (current.length >= target.length) return prev;
        const step = loud ? 4 : 2;
        const next: Entry = {
          ...last,
          text: target.slice(0, current.length + step),
          fullText: target,
        };
        return { ...prev, [activeId]: [...arr.slice(0, -1), next] };
      });
    }, 60);
    return () => clearInterval(id);
  }, [activeId, loud]);

  useEffect(() => {
    const id = setInterval(() => {
      tickRef.current++;
      setEntries((prev) => {
        const arr = prev[activeId];
        if (!arr) return prev;
        const last = arr[arr.length - 1];
        const target = last?.fullText ?? last?.text ?? '';
        const current = last?.text ?? '';
        const done = !last?.streaming || current.length >= target.length;
        if (!done) return prev;
        const nextRaw = PROTO_CYCLE[tickRef.current % PROTO_CYCLE.length];
        const e: Entry = {
          ...nextRaw,
          id: `live-${activeId}-${tickRef.current}-${Date.now()}`,
        };
        if (e.streaming) {
          e.fullText = e.text;
          e.text = '';
        }
        const updatedPrev = last ? { ...last, streaming: false } : last;
        const tail = updatedPrev ? [...arr.slice(0, -1), updatedPrev] : arr;
        return { ...prev, [activeId]: [...tail, e] };
      });
    }, 5500);
    return () => clearInterval(id);
  }, [activeId]);

  return entries;
}
