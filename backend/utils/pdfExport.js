// Render report HTML and convert to PDF using Puppeteer.
import puppeteer from 'puppeteer';
import { json2csv } from 'json-2-csv';
import fs from 'node:fs';
import path from 'node:path';
import { getExportsDir } from './storage.js';

function fmt(n) { return Number(n || 0).toLocaleString(); }

function reportHtml(report, executive = false) {
  const sev = report.stats?.severity || {};
  const modules = Object.entries(report.scores?.perModule || {});
  return `<!doctype html><html><head><meta charset="utf-8"><title>SEO Audit — ${report.rootUrl}</title>
  <style>
    @page { size: A4; margin: 24mm 16mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color:#111827; }
    h1 { font-size: 28px; margin: 0 0 4px; }
    h2 { font-size: 18px; margin: 24px 0 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
    .meta { color:#6b7280; margin-bottom: 16px; }
    .grid { display:grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 12px 0; }
    .card { padding: 12px; border:1px solid #e5e7eb; border-radius: 8px; }
    .score { font-size: 48px; font-weight:700; }
    .score.green { color:#16a34a; } .score.orange { color:#d97706; } .score.red { color:#dc2626; }
    table { width:100%; border-collapse: collapse; font-size: 12px; }
    th, td { border-bottom: 1px solid #e5e7eb; padding: 6px 8px; text-align:left; vertical-align:top; }
    .sev-critical { color:#dc2626; font-weight:600; }
    .sev-warning { color:#d97706; font-weight:600; }
    .sev-info { color:#6b7280; }
    .pill { display:inline-block; padding:2px 8px; border-radius:9999px; font-size:11px; }
    .pill.green{background:#dcfce7;color:#166534;} .pill.orange{background:#ffedd5;color:#9a3412;} .pill.red{background:#fee2e2;color:#991b1b;}
  </style></head><body>
  <h1>SEO Audit Report</h1>
  <div class="meta">
    <div><strong>${report.rootUrl}</strong></div>
    <div>${new Date(report.completedAt || report.createdAt).toLocaleString()}</div>
    <div>${fmt(report.stats?.pagesCrawled)} pages • ${fmt(report.stats?.issuesFound)} issues</div>
  </div>
  <div class="grid">
    <div class="card"><div>Overall score</div><div class="score ${gradeColor(report.scores?.overall)}">${report.scores?.overall ?? '—'}</div></div>
    <div class="card"><div>Critical</div><div class="score red">${sev.critical || 0}</div></div>
    <div class="card"><div>Warnings</div><div class="score orange">${sev.warning || 0}</div></div>
  </div>

  <h2>Module scores</h2>
  <table><thead><tr><th>Module</th><th>Score</th><th>Issues</th><th>Critical</th><th>Warning</th><th>Info</th></tr></thead><tbody>
    ${modules.map(([name, m]) => `<tr><td>${name}</td><td><span class="pill ${gradeColor(m.score)}">${m.score}</span></td><td>${m.issueCount}</td><td>${m.severityCounts.critical}</td><td>${m.severityCounts.warning}</td><td>${m.severityCounts.info}</td></tr>`).join('')}
  </tbody></table>

  <h2>Top issues</h2>
  <table><thead><tr><th>Severity</th><th>Module</th><th>Issue</th><th>URL</th></tr></thead><tbody>
    ${(report.topIssues || []).map(i => `<tr><td class="sev-${i.severity}">${i.severity.toUpperCase()}</td><td>${i.module}</td><td>${escape(i.checkName)}</td><td>${escape(i.affectedUrl || '—')}</td></tr>`).join('')}
  </tbody></table>

  ${executive ? '' : `
  <h2>All issues (${report.results?.length || 0})</h2>
  <table><thead><tr><th>Severity</th><th>Module</th><th>Issue</th><th>URL</th><th>Recommendation</th></tr></thead><tbody>
    ${(report.results || []).slice(0, 500).map(i => `<tr><td class="sev-${i.severity}">${i.severity}</td><td>${i.module}</td><td>${escape(i.checkName)}</td><td>${escape(i.affectedUrl || '—')}</td><td>${escape(i.recommendation || '')}</td></tr>`).join('')}
  </tbody></table>
  ${report.results?.length > 500 ? `<div class="meta">Showing first 500 of ${report.results.length}; export full CSV/JSON for the rest.</div>` : ''}
  `}
  </body></html>`;
}

function gradeColor(s) { return s >= 70 ? 'green' : s >= 40 ? 'orange' : 'red'; }

function escape(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export async function exportReportPdf(report, { executive = false } = {}) {
  const html = reportHtml(report, executive);
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const filename = `${report.sessionId}${executive ? '-executive' : '-full'}.pdf`;
    const out = path.join(getExportsDir(), filename);
    await page.pdf({ path: out, format: 'A4', printBackground: true });
    return { path: out, filename };
  } finally {
    await browser.close().catch(() => {});
  }
}

export async function exportIssuesCsv(report) {
  const rows = (report.results || []).map(r => ({
    severity: r.severity,
    module: r.module,
    check: r.checkName,
    url: r.affectedUrl || '',
    description: r.description,
    recommendation: r.recommendation,
  }));
  const csv = await json2csv(rows);
  const filename = `${report.sessionId}-issues.csv`;
  const out = path.join(getExportsDir(), filename);
  fs.writeFileSync(out, csv, 'utf8');
  return { path: out, filename };
}

export async function exportReportJson(report) {
  const filename = `${report.sessionId}-report.json`;
  const out = path.join(getExportsDir(), filename);
  fs.writeFileSync(out, JSON.stringify(report, null, 2), 'utf8');
  return { path: out, filename };
}
