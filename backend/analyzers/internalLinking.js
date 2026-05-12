// Module 10 — Internal Linking
// Why these checks matter:
// - Internal links distribute PageRank-style equity through the site; orphan pages get no link signal.
// - Generic anchors ("click here") give Google no semantic clue about the destination's topic.
// - Links pointing to redirects waste link equity — the destination link is the canonical signal.
// - Pages with too many outbound links dilute equity per link.
import { makeResult, SEV } from '../utils/result.js';
import * as cheerio from 'cheerio';
import { normalizeUrl } from '../utils/helpers.js';

const M = 'Linking';

const GENERIC_ANCHORS = new Set(['click here', 'read more', 'here', 'this', 'more', 'link', 'learn more']);

export function analyzeInternalLinking(pages, sitemapUrls = []) {
  const out = [];
  const inbound = new Map();
  const outbound = new Map();
  for (const [url, p] of pages) {
    const set = new Set();
    for (const link of p.internalLinks || []) {
      const norm = normalizeUrl(link.href);
      if (!pages.has(norm)) continue;
      set.add(norm);
      if (!inbound.has(norm)) inbound.set(norm, new Set());
      inbound.get(norm).add(url);
    }
    outbound.set(url, set);
  }

  // Orphans (no inbound)
  for (const [url, p] of pages) {
    if (p.status !== 200) continue;
    const inSize = inbound.get(url)?.size || 0;
    if (url === [...pages.keys()][0]) continue; // skip the seed/homepage
    if (inSize === 0) {
      out.push(makeResult({ module: M, checkName: 'Orphan page',
        severity: SEV.WARNING, affectedUrl: url,
        description: 'Zero internal links point to this page.',
        recommendation: 'Add internal links from related pages so search engines can discover and rank this page.' }));
    } else if (inSize === 1) {
      out.push(makeResult({ module: M, checkName: 'Single-inbound page',
        severity: SEV.INFO, affectedUrl: url,
        description: 'Only 1 internal link points here.',
        recommendation: 'Increase internal links from relevant content for stronger signals.' }));
    }
  }

  // Too many outbound
  for (const [url, set] of outbound) {
    const total = (pages.get(url)?.internalLinks?.length || 0) + (pages.get(url)?.externalLinks?.length || 0);
    if (total > 150) {
      out.push(makeResult({ module: M, checkName: 'Excessive outbound links',
        severity: SEV.INFO, affectedUrl: url,
        description: `${total} outbound links on the page.`,
        recommendation: 'Trim navigational/footer links — too many links dilute equity.', value: total }));
    }
  }

  // Anchor and redirect/noindex destinations
  for (const [url, p] of pages) {
    for (const link of p.internalLinks || []) {
      const text = (link.text || '').trim().toLowerCase();
      if (GENERIC_ANCHORS.has(text)) {
        out.push(makeResult({ module: M, checkName: 'Generic anchor text',
          severity: SEV.INFO, affectedUrl: url,
          description: `Anchor "${link.text}" -> ${link.href}`,
          recommendation: 'Use descriptive, keyword-relevant anchor text.', value: link }));
      }
      const target = pages.get(normalizeUrl(link.href));
      if (target && target.redirectChain && target.redirectChain.length > 0) {
        out.push(makeResult({ module: M, checkName: 'Internal link to redirect',
          severity: SEV.INFO, affectedUrl: url,
          description: `Link to ${link.href} which redirects.`,
          recommendation: 'Update link to point directly to the final URL.', value: link.href }));
      }
      if (target) {
        const $ = cheerio.load(target.renderedHtml || '');
        const robots = $('meta[name="robots"]').attr('content') || '';
        if (/noindex/i.test(robots)) {
          out.push(makeResult({ module: M, checkName: 'Internal link to noindex page',
            severity: SEV.INFO, affectedUrl: url,
            description: `Link to ${link.href} which is noindex.`,
            recommendation: 'Either index the destination or remove the internal link.', value: link.href }));
        }
      }
    }
  }

  // Broken internal links
  for (const [url, p] of pages) {
    for (const link of p.internalLinks || []) {
      const target = pages.get(normalizeUrl(link.href));
      if (target && target.status >= 400) {
        out.push(makeResult({ module: M, checkName: 'Broken internal link',
          severity: SEV.WARNING, affectedUrl: url,
          description: `Link to ${link.href} (status ${target.status})`,
          recommendation: 'Fix or remove the broken link.', value: { href: link.href, status: target.status } }));
      }
    }
  }

  // Compute simple PageRank-style score
  const ranks = computePageRank(pages, outbound);
  // Flag important pages with low rank
  for (const u of sitemapUrls) {
    const r = ranks.get(normalizeUrl(u)) || 0;
    if (r > 0 && r < 0.3) {
      out.push(makeResult({ module: M, checkName: 'Important page with low link equity',
        severity: SEV.INFO, affectedUrl: u,
        description: `Sitemap URL with low internal link rank (${r.toFixed(3)}).`,
        recommendation: 'Add internal links from high-equity pages to boost rank.', value: r }));
    }
  }

  return { issues: out, inbound, outbound, ranks };
}

// Damping=0.85, 30 iterations — sufficient for typical sites
function computePageRank(pages, outbound, damping = 0.85, iters = 30) {
  const N = pages.size;
  if (!N) return new Map();
  const ranks = new Map();
  for (const u of pages.keys()) ranks.set(u, 1 / N);
  for (let it = 0; it < iters; it++) {
    const next = new Map();
    for (const u of pages.keys()) next.set(u, (1 - damping) / N);
    for (const [u, set] of outbound) {
      const share = (ranks.get(u) || 0) * damping / (set.size || 1);
      for (const v of set) next.set(v, (next.get(v) || 0) + share);
    }
    for (const [k, v] of next) ranks.set(k, v);
  }
  // Normalise to 0..1 by dividing by max
  let max = 0; for (const v of ranks.values()) if (v > max) max = v;
  if (max > 0) for (const [k, v] of ranks) ranks.set(k, v / max);
  return ranks;
}
