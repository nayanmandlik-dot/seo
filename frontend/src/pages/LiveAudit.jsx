import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuditStream } from '../hooks/useAuditStream.js';
import { api } from '../api.js';

export default function LiveAudit() {
  const { sessionId } = useParams();
  const nav = useNavigate();
  const state = useAuditStream(sessionId);

  useEffect(() => {
    if (state.complete) {
      const t = setTimeout(() => nav(`/report/${sessionId}`), 800);
      return () => clearTimeout(t);
    }
  }, [state.complete, sessionId, nav]);

  const { progress, log, status, error } = state;
  const pct = progress.pagesDiscovered ? Math.round((progress.pagesCrawled / progress.pagesDiscovered) * 100) : 0;

  // Empty-log placeholder reflects actual SSE state — "Waiting for log events"
  // is misleading when the real situation is "connection failed" or "audit errored
  // before producing any logs". Surfacing this distinction means users (and us)
  // can diagnose without opening DevTools.
  const emptyLogMessage = (() => {
    if (status === 'error') return 'Audit failed before producing any logs — see error below.';
    if (status === 'cancelled') return 'Audit was cancelled.';
    if (status === 'connecting') return 'Connecting to backend…';
    return 'Audit queued — waiting for first log event from the crawler…';
  })();

  return (
    <div>
      <h1 className="text-xl font-semibold mb-1">Audit in progress</h1>
      <p className="text-sm text-gray-500 mb-4">Session: <code className="text-xs">{sessionId}</code> • Status: <span className={status === 'error' ? 'text-red-600 font-medium' : ''}>{status}</span></p>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-300 rounded">
          <div className="font-medium text-red-900 mb-1">Audit failed</div>
          <div className="text-sm text-red-800 whitespace-pre-wrap break-words">{error}</div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between mb-2 text-sm">
          <div>Pages: <strong>{progress.pagesCrawled}</strong> / {progress.pagesDiscovered} discovered</div>
          <div className="text-gray-500">{Math.round((progress.elapsedMs || 0) / 1000)}s elapsed</div>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-blue-600 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
          <div className="bg-gray-50 p-2 rounded"><div className="text-xs text-gray-500">Crawled</div><div className="font-semibold">{progress.pagesCrawled}</div></div>
          <div className="bg-gray-50 p-2 rounded"><div className="text-xs text-gray-500">Queue</div><div className="font-semibold">{progress.queueRemaining}</div></div>
          <div className="bg-gray-50 p-2 rounded"><div className="text-xs text-gray-500">Discovered</div><div className="font-semibold">{progress.pagesDiscovered}</div></div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium">Live log</h2>
          <button onClick={() => api.cancelAudit(sessionId).catch(() => {})} className="text-xs text-red-600 hover:underline">Cancel</button>
        </div>
        <div className="font-mono text-xs h-72 overflow-auto bg-gray-900 text-green-300 p-3 rounded">
          {log.length === 0 ? <div className="text-gray-500">{emptyLogMessage}</div> :
            log.slice(-200).map((e, i) => (
              <div key={i}>[{new Date(e.ts).toLocaleTimeString()}] {e.msg}</div>
            ))}
        </div>
      </div>
    </div>
  );
}
