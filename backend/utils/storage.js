import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const reportsDir = path.resolve(__dirname, '..', '..', process.env.REPORTS_DIR || 'reports');
const exportsDir = path.resolve(__dirname, '..', '..', process.env.EXPORTS_DIR || 'exports');

export function getReportsDir() { return reportsDir; }
export function getExportsDir() { return exportsDir; }

export function saveReport(sessionId, report) {
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  const file = path.join(reportsDir, `${sessionId}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2), 'utf8');
  return file;
}

export function loadReport(sessionId) {
  const file = path.join(reportsDir, `${sessionId}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function listReports() {
  if (!fs.existsSync(reportsDir)) return [];
  return fs.readdirSync(reportsDir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        const r = JSON.parse(fs.readFileSync(path.join(reportsDir, f), 'utf8'));
        return {
          sessionId: r.sessionId,
          rootUrl: r.rootUrl,
          createdAt: r.createdAt,
          completedAt: r.completedAt,
          status: r.status,
          score: r.scores?.overall ?? null,
          pages: r.stats?.pagesCrawled ?? 0,
          issues: r.stats?.issuesFound ?? 0,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export function deleteReport(sessionId) {
  const file = path.join(reportsDir, `${sessionId}.json`);
  if (fs.existsSync(file)) { fs.unlinkSync(file); return true; }
  return false;
}
