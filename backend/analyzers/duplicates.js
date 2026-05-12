// Module 2 — Duplicate Content & Canonicalization
// Why these checks matter:
// - Duplicate titles/descriptions confuse search engines about which URL to rank.
// - Missing/incorrect canonicals can cause Google to index the wrong URL or split signals across duplicates.
// - HTTP/HTTPS or www/non-www both serving 200 fragments link equity across two URL variants.
// - Near-duplicate body content (>85% similar) can trigger duplicate-content filtering.
import * as cheerio from 'cheerio';
import axios from 'axios';
import { makeResult, SEV } from '../utils/result.js';
import { tokenize, cosineSimilarity, shingleSet, jaccard, normalizeUrl } from '../utils/helpers.js';

const M = 'Duplicates';

export function analyzeCanonical(page, pages) {
  const out = [];
  const $ = cheerio.load(page.renderedHtml || page.rawHtml || '');
  const canonical = $('link[rel="canonical"]').attr('href') || '';
  if (!canonical) {
    out.push(makeResult({ module: M, checkName: 'Missing canonical',
      severity: SEV.WARNING, affectedUrl: page.url,
      description: 'No <link rel="canonical"> on this page.',
      recommendation: 'Add a self-referencing canonical to consolidate signals.' }));
    return out;
  }
  let abs;
  try { abs = new URL(canonical, page.url).toString(); } catch {
    out.push(makeResult({ module: M, checkName: 'Invalid canonical URL',
      severity: SEV.CRITICAL, affectedUrl: page.url,
      description: `Canonical "${canonical}" is not a valid URL.`,
      recommendation: 'Fix the canonical href.', value: canonical }));
    return out;
  }
  if (normalizeUrl(abs) !== normalizeUrl(page.url)) {
    const targetPage = pages.get(normalizeUrl(abs));
    if (targetPage && targetPage.status !== 200) {
      out.push(makeResult({ module: M, checkName: 'Canonical points to non-200 URL',
        severity: SEV.CRITICAL, affectedUrl: page.url,
        description: `Canonical -> ${abs} returned ${targetPage.status}`,
        recommendation: 'Update canonical to a 200 URL.', value: abs }));
    }
    if (targetPage) {
      const targetCanonical = (() => {
        try {
          const $$ = cheerio.load(targetPage.renderedHtml || '');
          return $$('link[rel="canonical"]').attr('href') || '';
        } catch { return ''; }
      })();
      if (targetCanonical && normalizeUrl(new URL(targetCanonical, targetPage.url).toString()) !== normalizeUrl(abs)) {
        out.push(makeResult({ module: M, checkName: 'Canonical chain',
          severity: SEV.WARNING, affectedUrl: page.url,
          description: `Canonical chain: ${page.url} -> ${abs} -> ${targetCanonical}`,
          recommendation: 'Canonical chains dilute signals; point directly to the final canonical URL.' }));
      }
    }
  }
  return out;
}

export function analyzeDuplicateMeta(pages) {
  const out = [];
  const titles = new Map();
  const descs = new Map();
  for (const [url, p] of pages) {
    if (p.status !== 200) continue;
    const $ = cheerio.load(p.renderedHtml || p.rawHtml || '');
    const title = $('title').first().text().trim();
    const desc = $('meta[name="description"]').attr('content') || '';
    if (title) {
      const arr = titles.get(title) || []; arr.push(url); titles.set(title, arr);
    }
    if (desc) {
      const arr = descs.get(desc) || []; arr.push(url); descs.set(desc, arr);
    }
  }
  for (const [title, urls] of titles) {
    if (urls.length > 1) {
      for (const url of urls) {
        out.push(makeResult({ module: M, checkName: 'Duplicate title',
          severity: SEV.WARNING, affectedUrl: url,
          description: `Title "${title.slice(0, 80)}" is shared by ${urls.length} pages.`,
          recommendation: 'Make every page title unique.', value: { title, urls } }));
      }
    }
  }
  for (const [desc, urls] of descs) {
    if (urls.length > 1) {
      for (const url of urls) {
        out.push(makeResult({ module: M, checkName: 'Duplicate meta description',
          severity: SEV.WARNING, affectedUrl: url,
          description: `Meta description shared by ${urls.length} pages.`,
          recommendation: 'Write a unique meta description per page.', value: { desc: desc.slice(0, 80), urls } }));
      }
    }
  }
  return out;
}

// Near-duplicate detection — compute jaccard over 5-token shingles for every pair.
// O(n^2) but fine for typical site sizes (<10k pages); for larger sites this could be replaced with simhash.
export function analyzeNearDuplicates(pages, threshold = 0.85) {
  const out = [];
  const fingerprints = [];
  for (const [url, p] of pages) {
    if (p.status !== 200) continue;
    const $ = cheerio.load(p.renderedHtml || p.rawHtml || '');
    $('script, style, nav, header, footer').remove();
    const text = $('body').text() || '';
    const fp = shingleSet(text, 5);
    fingerprints.push({ url, fp });
  }
  const reported = new Set();
  for (let i = 0; i < fingerprints.length; i++) {
    for (let j = i + 1; j < fingerprints.length; j++) {
      const sim = jaccard(fingerprints[i].fp, fingerprints[j].fp);
      if (sim >= threshold) {
        const key = [fingerprints[i].url, fingerprints[j].url].sort().join('|');
        if (reported.has(key)) continue;
        reported.add(key);
        out.push(makeResult({ module: M, checkName: 'Near-duplicate content',
          severity: SEV.WARNING, affectedUrl: fingerprints[i].url,
          description: `${(sim * 100).toFixed(1)}% similar to ${fingerprints[j].url}`,
          recommendation: 'Consolidate, canonicalise, or differentiate near-duplicate pages.', value: { other: fingerprints[j].url, similarity: sim } }));
      }
    }
  }
  return out;
}

export function analyzeUrlVariants(pages) {
  const out = [];
  const seen = new Map();
  for (const url of pages.keys()) {
    try {
      const u = new URL(url);
      const key = u.host.replace(/^www\./i, '') + u.pathname.replace(/\/$/, '').toLowerCase() + u.search;
      const arr = seen.get(key) || []; arr.push(url); seen.set(key, arr);
    } catch { /* ignore */ }
  }
  for (const [, urls] of seen) {
    if (urls.length > 1) {
      out.push(makeResult({ module: M, checkName: 'URL variants both indexable',
        severity: SEV.WARNING, affectedUrl: urls[0],
        description: `Same content reachable at: ${urls.join(', ')}`,
        recommendation: 'Pick one canonical URL form (www/non-www, trailing slash, case) and 301 the others.', value: urls }));
    }
  }
  return out;
}

// www vs non-www and HTTP vs HTTPS reachability — issue a single HEAD per variant.
export async function analyzeHostVariants(rootUrl) {
  const out = [];
  const u = new URL(rootUrl);
  const variants = [];
  variants.push(u.protocol + '//' + (u.host.startsWith('www.') ? u.host.slice(4) : 'www.' + u.host) + '/');
  variants.push((u.protocol === 'https:' ? 'http:' : 'https:') + '//' + u.host + '/');
  for (const v of variants) {
    try {
      const r = await axios.get(v, { timeout: 15000, maxRedirects: 0, validateStatus: () => true });
      if (r.status === 200) {
        out.push(makeResult({ module: M, checkName: 'URL variant returns 200 without redirect',
          severity: SEV.WARNING, affectedUrl: v,
          description: `${v} returns 200 — should 301 to the canonical host/scheme.`,
          recommendation: 'Configure server to 301 the alternate host or scheme to the canonical one.', value: r.status }));
      }
    } catch { /* ignore */ }
  }
  return out;
}
