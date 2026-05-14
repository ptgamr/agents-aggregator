// In-process pub/sub with async-iterator subscribers.
// Used to fan out file-change events to SSE clients.

export interface Event {
  type: string;
  sourceId?: string;
  sessionId?: string;
  [k: string]: unknown;
}

type Listener = (e: Event) => void;

const listeners = new Set<Listener>();

export function publish(e: Event): void {
  for (const fn of listeners) {
    try { fn(e); } catch { /* listener error must not break publishing */ }
  }
}

export async function* subscribe(signal: AbortSignal): AsyncGenerator<Event> {
  const queue: Event[] = [];
  let resolve: (() => void) | null = null;
  const wake = () => { if (resolve) { resolve(); resolve = null; } };
  const onAbort = () => wake();
  const onEvent: Listener = (e) => { queue.push(e); wake(); };

  listeners.add(onEvent);
  signal.addEventListener('abort', onAbort, { once: true });

  try {
    while (!signal.aborted) {
      while (queue.length > 0) {
        const next = queue.shift()!;
        yield next;
      }
      if (signal.aborted) break;
      await new Promise<void>((r) => { resolve = r; });
    }
  } finally {
    listeners.delete(onEvent);
    signal.removeEventListener('abort', onAbort);
  }
}
