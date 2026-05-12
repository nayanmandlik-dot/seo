import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import routes from './api/routes.js';
import { sseHandler } from './api/sse.js';
import { initQueue, getMode } from './crawler/queue.js';

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

await initQueue('seo-audit');
console.log(`[seo-audit] queue mode: ${getMode()}`);

app.listen(PORT, HOST, () => {
  console.log(`[seo-audit] backend listening on http://${HOST}:${PORT}`);
});
