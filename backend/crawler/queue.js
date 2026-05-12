// Bull queue wrapper. Falls back to an in-memory queue if Redis is unreachable
// so the app remains usable in dev environments without Redis.
import Bull from 'bull';

let queue = null;
let mode = 'memory';
const memoryJobs = [];
const memoryHandlers = [];
let memoryRunning = 0;

const REDIS = {
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    retryStrategy: () => null,
    reconnectOnError: () => false,
  },
};

// Honor an explicit opt-out so users without Redis don't even try to connect.
const REDIS_DISABLED = process.env.DISABLE_REDIS === '1' || process.env.DISABLE_REDIS === 'true';

export async function initQueue(name = 'seo-crawl') {
  if (REDIS_DISABLED) { mode = 'memory'; return null; }
  return new Promise((resolve) => {
    let settled = false;
    const fallback = (reason) => {
      if (settled) return;
      settled = true;
      console.warn('[queue] Redis unavailable, using in-memory queue:', reason);
      mode = 'memory';
      try { q?.close?.().catch(() => {}); } catch { /* ignore */ }
      resolve(null);
    };
    let q;
    try {
      q = new Bull(name, REDIS);
    } catch (e) { return fallback(e.message); }

    // Bull/ioredis emit errors on the queue when Redis dies; handle them
    // so they never become unhandled exceptions that crash the backend.
    q.on('error', (e) => {
      if (!settled) { fallback(e.message); return; }
      // Connection died after we'd settled in redis mode — downgrade to memory
      // and re-pump so queued jobs still run.
      if (mode === 'redis') {
        console.warn('[queue] Redis connection lost, switching to memory mode:', e.message);
        mode = 'memory';
        queue = null;
        try { q.close().catch(() => {}); } catch { /* ignore */ }
        pumpMemory();
      }
    });

    q.isReady()
      .then(() => {
        if (settled) return;
        settled = true;
        queue = q;
        mode = 'redis';
        resolve(q);
      })
      .catch((e) => fallback(e.message));

    // Hard 3s timeout — if Redis doesn't ack a connection by then, fall back.
    setTimeout(() => fallback('connection timeout'), 3000);
  });
}

export function getMode() { return mode; }

export function addJob(data, opts = {}) {
  if (mode === 'redis' && queue) {
    return queue.add(data, opts).catch((e) => {
      console.warn('[queue] add failed, falling back to memory:', e.message);
      mode = 'memory'; queue = null;
      memoryJobs.push({ data, opts }); pumpMemory();
    });
  }
  memoryJobs.push({ data, opts });
  pumpMemory();
  return Promise.resolve();
}

export function processJobs(concurrency, handler) {
  // Always register the memory handler so it's ready if/when we fall back.
  memoryHandlers.push({ concurrency, handler });
  if (mode === 'redis' && queue) {
    queue.process(concurrency, async (job) => handler(job.data));
  }
  pumpMemory();
}

function pumpMemory() {
  for (const { concurrency, handler } of memoryHandlers) {
    while (memoryRunning < concurrency && memoryJobs.length) {
      const { data } = memoryJobs.shift();
      memoryRunning++;
      Promise.resolve(handler(data))
        .catch(e => console.error('[queue][memory] handler error:', e))
        .finally(() => { memoryRunning--; pumpMemory(); });
    }
  }
}

export async function closeQueue() {
  if (queue) await queue.close();
  queue = null;
  memoryJobs.length = 0;
  memoryHandlers.length = 0;
}
