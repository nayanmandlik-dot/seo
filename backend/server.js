import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import routes from './api/routes.js';
import { sseHandler } from './api/sse.js';
import { initQueue, getMode } from './crawler/queue.js';

// Belt-and-suspenders: if Chromium isn't on disk at startup (e.g. Render
// served a build with a stale node_modules cache that predated postinstall),
// install it now. On a healthy deploy this is a ~30ms no-op directory check;
// on a stale-cache deploy it adds ~2 min to cold start and then audits work.
async function ensureChromium() {
  const cacheDir = process.env.PLAYWRIGHT_BROWSERS_PATH
    || path.join(os.homedir(), '.cache', 'ms-playwright');
  let hasChromium = false;
  try {
    const entries = fs.readdirSync(cacheDir);
    hasChromium = entries.some((e) => e.startsWith('chromium'));
  } catch { /* cache dir doesn't exist yet */ }
  if (hasChromium) {
    console.log(`[seo-audit] Chromium found at ${cacheDir}`);
    return;
  }
  console.warn(`[seo-audit] Chromium MISSING at ${cacheDir} — installing (~2 min)…`);
  await new Promise((resolve) => {
    const proc = spawn('npx', ['playwright', 'install', 'chromium'], {
      stdio: 'inherit',
      shell: true,
    });
    proc.on('exit', (code) => {
      if (code === 0) console.log('[seo-audit] Chromium install complete');
      else console.error(`[seo-audit] Chromium install failed (exit ${code}) — audits will error until fixed`);
      resolve();
    });
    proc.on('error', (e) => {
      console.error('[seo-audit] Chromium install spawn error:', e.message);
      resolve();
    });
  });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || '0.0.0.0';

const reportsDir = path.resolve(__dirname, '..', process.env.REPORTS_DIR || 'reports');
const exportsDir = path.resolve(__dirname, '..', process.env.EXPORTS_DIR || 'exports');
for (const d of [reportsDir, exportsDir]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

app.get('/', (_req, res) => {
  res.send('Backend is running successfully 🚀');
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/events/:sessionId', sseHandler);
app.use('/api', routes);

// Don't let async errors from third-party libs (e.g. ioredis losing the connection)
// take down the whole backend.
process.on('unhandledRejection', (e) => console.warn('[unhandledRejection]', e?.message || e));
process.on('uncaughtException', (e) => console.warn('[uncaughtException]', e?.message || e));

// JSON error handler — unhandled route errors return JSON, not HTML stack traces
// (the frontend always parses res.json() and HTML would crash the parser).
app.use((err, _req, res, _next) => {
  console.error('[express error]', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

await ensureChromium();
await initQueue('seo-audit');

// Startup summary — appears in Render logs at boot so misconfigurations
// (wrong reports dir, missing API key, etc) are obvious without reproducing.
console.log('[seo-audit] startup config:');
console.log(`  NODE_ENV:       ${process.env.NODE_ENV || 'development'}`);
console.log(`  queue mode:     ${getMode()}`);
console.log(`  reports dir:    ${reportsDir}`);
console.log(`  exports dir:    ${exportsDir}`);
console.log(`  pagespeed key:  ${process.env.PAGESPEED_API_KEY ? 'set' : 'NOT SET (Page Speed module will fail)'}`);
console.log(`  playwright dir: ${process.env.PLAYWRIGHT_BROWSERS_PATH || '(default ~/.cache/ms-playwright)'}`);

app.listen(PORT, HOST, () => {
  console.log(`[seo-audit] backend listening on http://${HOST}:${PORT}`);
});
