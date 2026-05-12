// Module 14 — Site Architecture
// Why these checks matter:
// - Pages more than 4 clicks from the homepage tend to receive less crawl attention and PageRank.
// - Hub pages with many outbound links and authority pages with many inbound links shape the site graph.
// - Breadcrumbs strengthen topical signals and should match BreadcrumbList schema where present.
// - Faceted navigation (filter combinations) creates near-infinite indexable URLs without controls.
import * as cheerio from 'cheerio';
import { makeResult, SEV } from '../utils/result.js';

const M = 'Architecture';

export function analyzeArchitecture(pages, linkingResult) {
  const out = [];
  const inbound = linkingResult.inbound;
  const outbound = linkingResult.outbound;

  let totalDepth = 0; let count = 0;
  for (const [url, p] of pages) {
    if (p.status !== 200) continue;
    totalDepth += p.depth; count++;
    if (p.depth > 4) {
      out.push(makeResult({ module: M, checkName: 'Page deeper than 4 clicks',
        severity: SEV.INFO, affectedUrl: url,
        description: `${p.depth} clicks from homepage`,
        recommendation: 'Surface deep content in hubs/navigation to flatten architecture.', value: p.depth }));
    }
  }
  const avgDepth = count ? totalDepth / count : 0;
  const summary = { avgDepth, hubs: [], authorities: [] };

  // Top 10 hubs and authorities
  const out_arr = [...outbound.entries()].map(([u, s]) => [u, s.size]).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const in_arr = [...inbound.entries()].map(([u, s]) => [u, s.size]).sort((a, b) => b[1] - a[1]).slice(0, 10);
  summary.hubs = out_arr;
  summary.authorities = in_arr;

  // Breadcrumb HTML detection
  for (const [url, p] of pages) {
    const $ = cheerio.load(p.renderedHtml || '');
    const hasBreadcrumb = $('[class*="breadcrumb"], nav[aria-label*="breadcrumb" i]').length > 0;
    const schemaBreadcrumb = (p.renderedHtml || '').includes('"BreadcrumbList"');
    if (hasBreadcrumb && !schemaBreadcrumb) {
      out.push(makeResult({ module: M, checkName: 'HTML breadcrumb without schema',
        severity: SEV.INFO, affectedUrl: url,
        description: 'Visible breadcrumb but no BreadcrumbList JSON-LD.',
        recommendation: 'Add BreadcrumbList structured data.' }));
    }
  }

  // Faceted nav heuristic — many parameter combinations off the same path
  const facetedPaths = new Map();
  for (const url of pages.keys()) {
    try {
      const u = new URL(url);
      if (!u.search) continue;
      const params = u.searchParams.size;
      if (params >= 2) facetedPaths.set(u.pathname, (facetedPaths.get(u.pathname) || 0) + 1);
    } catch {}
  }
  for (const [path, c] of facetedPaths) {
    if (c >= 10) {
      out.push(makeResult({ module: M, checkName: 'Faceted navigation creating indexable URLs',
        severity: SEV.WARNING, affectedUrl: path,
        description: `${c} multi-parameter URLs under ${path}.`,
        recommendation: 'Use canonical to a clean URL or noindex faceted pages.', value: c }));
    }
  }

  return { issues: out, summary };
}
