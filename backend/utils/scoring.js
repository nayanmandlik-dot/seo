// Scoring engine — accepts the full list of analyzer results and computes:
//   - per-module score (0..100)
//   - per-page score (0..100)
//   - overall site score (0..100)
//
// Severity weights (per task spec):
//   critical : -10..-20  (we use -15)
//   warning  : -3..-5    (we use -4)
//   info     : 0..-1     (we use -0.5)
import { SEV } from './result.js';

const SEV_WEIGHT = {
  [SEV.CRITICAL]: 15,
  [SEV.WARNING]: 4,
  [SEV.INFO]: 0.5,
};

const ALL_MODULES = [
  'Crawlability', 'Duplicates', 'Meta', 'URL', 'HTTP', 'Speed', 'Mobile',
  'Security', 'Schema', 'Linking', 'Images', 'JS-SEO', 'International',
  'Architecture', 'Content', 'External', 'Accessibility',
];

export function clamp(n) { return Math.max(0, Math.min(100, n)); }

export function computeScores(results, pages) {
  const perModule = {};
  for (const m of ALL_MODULES) perModule[m] = { score: 100, issueCount: 0, severityCounts: { critical: 0, warning: 0, info: 0 } };
  const perPage = new Map();
  for (const url of pages.keys()) perPage.set(url, { score: 100, issueCount: 0, severityCounts: { critical: 0, warning: 0, info: 0 } });

  for (const r of results) {
    const w = SEV_WEIGHT[r.severity] || 0;
    if (perModule[r.module]) {
      perModule[r.module].score -= w;
      perModule[r.module].issueCount++;
      perModule[r.module].severityCounts[r.severity]++;
    }
    if (r.affectedUrl && perPage.has(r.affectedUrl)) {
      perPage.get(r.affectedUrl).score -= w;
      perPage.get(r.affectedUrl).issueCount++;
      perPage.get(r.affectedUrl).severityCounts[r.severity]++;
    }
  }
  // Clamp
  for (const m of Object.keys(perModule)) perModule[m].score = clamp(perModule[m].score);
  for (const [u, v] of perPage) v.score = clamp(v.score);

  // Overall = weighted average of module scores (equal weight; could be tuned)
  const moduleVals = Object.values(perModule).map(m => m.score);
  const overall = moduleVals.length ? Math.round(moduleVals.reduce((a, b) => a + b, 0) / moduleVals.length) : 100;

  return { overall, perModule, perPage: Object.fromEntries(perPage) };
}

export function gradeColor(score) {
  if (score >= 70) return 'green';
  if (score >= 40) return 'orange';
  return 'red';
}

export function topIssues(results, n = 10) {
  const order = [SEV.CRITICAL, SEV.WARNING, SEV.INFO];
  return [...results].sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity)).slice(0, n);
}
