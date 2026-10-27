import { useEffect, useState } from 'react';
import type { GenerationEvent } from '@cyberlearn/shared';
import { API_BASE } from '../../lib/api';

/** Subscribes to live generation progress via Server-Sent Events (spec 4.6). */
export function useGenerationStream(id: string | undefined, enabled: boolean) {
  const [event, setEvent] = useState<GenerationEvent | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!id || !enabled) return;
    const source = new EventSource(`${API_BASE}/generations/${id}/events`, { withCredentials: true });
    source.addEventListener('open', () => setConnected(true));
    source.addEventListener('error', () => setConnected(false));
    source.addEventListener('progress', (e) => {
      try {
        setEvent(JSON.parse((e as MessageEvent).data) as GenerationEvent);
      } catch {
        /* ignore malformed event */
      }
    });
    return () => source.close();
  }, [id, enabled]);

  return { event, connected };
}
