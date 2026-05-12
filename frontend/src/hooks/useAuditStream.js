import { useEffect, useRef, useState } from 'react';
import { API_BASE } from '../api.js';

// Subscribes to Server-Sent Events and aggregates progress / log / status / complete events.
export function useAuditStream(sessionId) {
  const [state, setState] = useState({
    status: 'connecting',
    progress: { pagesCrawled: 0, pagesDiscovered: 0, queueRemaining: 0, elapsedMs: 0 },
    log: [],
    error: null,
    complete: false,
  });
  const ref = useRef(null);

  useEffect(() => {
    if (!sessionId) return;
    const es = new EventSource(`${API_BASE}/events/${sessionId}`);
    ref.current = es;

    es.addEventListener('progress', (e) => {
      const d = JSON.parse(e.data);
      setState((s) => ({ ...s, progress: { ...s.progress, ...d } }));
    });
    es.addEventListener('log', (e) => {
      const d = JSON.parse(e.data);
      setState((s) => ({ ...s, log: [...s.log.slice(-200), d] }));
    });
    es.addEventListener('status', (e) => {
      const d = JSON.parse(e.data);
      setState((s) => ({ ...s, status: d.status }));
    });
    es.addEventListener('complete', (e) => {
      const d = JSON.parse(e.data);
      setState((s) => ({ ...s, status: 'complete', complete: true, summary: d }));
    });
    es.addEventListener('error', (e) => {
      try {
        const d = JSON.parse(e.data || '{}');
        if (d.message) setState((s) => ({ ...s, error: d.message, status: 'error' }));
      } catch { /* network error events have no .data */ }
    });

    return () => { es.close(); };
  }, [sessionId]);

  return state;
}
