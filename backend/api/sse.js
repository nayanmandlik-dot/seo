// Server-Sent Events for live crawl progress.
// Each session has a Set of response objects we push events to.
const sessions = new Map();

export function sseHandler(req, res) {
  const { sessionId } = req.params;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  if (!sessions.has(sessionId)) sessions.set(sessionId, new Set());
  sessions.get(sessionId).add(res);

  res.write(`event: ping\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);

  const heartbeat = setInterval(() => {
    res.write(`event: ping\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sessions.get(sessionId)?.delete(res);
    if (sessions.get(sessionId)?.size === 0) sessions.delete(sessionId);
  });
}

export function emit(sessionId, type, data) {
  const subs = sessions.get(sessionId);
  if (!subs || subs.size === 0) return;
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of subs) {
    try { res.write(payload); } catch { /* ignore broken sub */ }
  }
}
