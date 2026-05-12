import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { startAudit, cancelAudit, getSession } from '../utils/reportBuilder.js';
import { listReports, loadReport, deleteReport, getExportsDir } from '../utils/storage.js';
import { compareReports } from '../utils/compare.js';
import { exportReportPdf, exportIssuesCsv, exportReportJson } from '../utils/pdfExport.js';
import { addJob, processJobs } from '../crawler/queue.js';
import { v4 as uuid } from 'uuid';

// Process queued audits one at a time per worker — startAudit handles its own per-audit concurrency.
processJobs(2, async (data) => startAudit(data));

const router = express.Router();

router.get('/reports', (_req, res) => {
  res.json(listReports());
});

router.get('/reports/:id', (req, res) => {
  const r = loadReport(req.params.id);
  if (!r) return res.status(404).json({ error: 'not found' });
  res.json(r);
});

router.delete('/reports/:id', (req, res) => {
  const ok = deleteReport(req.params.id);
  res.json({ ok });
});

router.post('/audit', (req, res) => {
  const body = req.body || {};
  if (!body.rootUrl) return res.status(400).json({ error: 'rootUrl required' });
  try {
    new URL(body.rootUrl);
  } catch { return res.status(400).json({ error: 'invalid rootUrl' }); }
  const sessionId = uuid();
  addJob({
    sessionId,
    rootUrl: body.rootUrl,
    maxPages: body.maxPages || null,
    crawlSpeed: body.crawlSpeed || 'normal',
    includePatterns: body.includePatterns || [],
    excludePatterns: body.excludePatterns || [],
    userAgent: body.userAgent || 'chrome',
    crawlSubdomains: !!body.crawlSubdomains,
    respectRobots: body.respectRobots !== false,
    maxDepth: body.maxDepth || null,
    pageSpeedApiKey: body.pageSpeedApiKey,
    pageSpeedSampleSize: body.pageSpeedSampleSize || 10,
  });
  res.json({ sessionId });
});

router.post('/audit/:id/cancel', (req, res) => {
  cancelAudit(req.params.id);
  res.json({ ok: true });
});

router.get('/audit/:id/status', (req, res) => {
  const s = getSession(req.params.id);
  if (s) return res.json({ status: s.status });
  const r = loadReport(req.params.id);
  if (r) return res.json({ status: r.status });
  res.status(404).json({ error: 'not found' });
});

router.get('/compare/:a/:b', (req, res) => {
  const a = loadReport(req.params.a);
  const b = loadReport(req.params.b);
  if (!a || !b) return res.status(404).json({ error: 'one or both not found' });
  res.json(compareReports(a, b));
});

router.post('/reports/:id/export/pdf', async (req, res) => {
  const r = loadReport(req.params.id);
  if (!r) return res.status(404).json({ error: 'not found' });
  try {
    const result = await exportReportPdf(r, { executive: !!req.body?.executive });
    res.json({ ok: true, ...result, downloadUrl: `/api/exports/${path.basename(result.filename)}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/reports/:id/export/csv', async (req, res) => {
  const r = loadReport(req.params.id);
  if (!r) return res.status(404).json({ error: 'not found' });
  try {
    const result = await exportIssuesCsv(r);
    res.json({ ok: true, ...result, downloadUrl: `/api/exports/${path.basename(result.filename)}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/reports/:id/export/json', async (req, res) => {
  const r = loadReport(req.params.id);
  if (!r) return res.status(404).json({ error: 'not found' });
  try {
    const result = await exportReportJson(r);
    res.json({ ok: true, ...result, downloadUrl: `/api/exports/${path.basename(result.filename)}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/exports/:filename', (req, res) => {
  const safe = path.basename(req.params.filename);
  const fp = path.join(getExportsDir(), safe);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'not found' });
  res.download(fp, safe);
});

export default router;
