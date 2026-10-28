import { useEffect, useState } from 'react';
import type { GenerationEvent } from '@cyberlearn/shared';
import { API_BASE } from '../../lib/api';

/** Statuses after which the server sends no further progress for this run. */
export const TERMINAL_STATUSES: readonly string[] = ['completed', 'partially_completed', 'failed', 'cancelled'];

/** Subscribes to live generation progress via Server-Sent Events (spec 4.6). */
export function useGenerationStream(id: string | undefined, enabled: boolean) {
  const [event, setEvent] = useState<GenerationEvent | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // Each subscription starts clean: an event from a previous run (e.g. the
    // 'failed' event before a retry) must not mask the fresh server state.
    setEvent(null);
    setConnected(false);
    if (!id || !enabled) return;
    const source = new EventSource(`${API_BASE}/generations/${id}/events`, { withCredentials: true });
    source.addEventListener('open', () => setConnected(true));
    source.addEventListener('error', () => setConnected(false));
    source.addEventListener('progress', (e) => {
      let next: GenerationEvent;
      try {
        next = JSON.parse((e as MessageEvent).data) as GenerationEvent;
      } catch {
        return; // ignore malformed event
      }
      setEvent(next);
      // Nothing more will arrive for a finished run; stop the browser from reconnecting.
      if (TERMINAL_STATUSES.includes(next.status)) {
        source.close();
        setConnected(false);
      }
    });
    return () => source.close();
  }, [id, enabled]);

  return { event, connected };
}
