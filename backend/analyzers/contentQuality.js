// Module 15 — Content Quality
// Why these checks matter:
// - Thin content (<300 words) often fails to rank; Google's helpful-content system actively demotes it.
// - Excessive ads/affiliate links above the fold can trigger "intrusive ads" demotions.
// - Two pages competing for the same query (cannibalization) split their ranking signals.
// - Stale content can lose rankings to fresher competitors.
// - Templated content (near-identical variants) often gets seen as low quality by crawlers.
import * as cheerio from 'cheerio';
import { makeResult, SEV } from '../utils/result.js';
import { tokenize, jaccard, shingleSet } from '../utils/helpers.js';

const M = 'Content';

export function analyzePageContent(page) {
  const out = [];
  if (page.status !== 200) return out;
  const $ = cheerio.load(page.renderedHtml || page.rawHtml || '');
  $('script, style, nav, header, footer, noscript, [aria-hidden="true"]').remove();
  const text = ($('body').text() || '').replace(/\s+/g, ' ').trim();
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount < 300) {
    out.push(makeResult({ module: M, checkName: 'Thin content',
      severity: SEV.WARNING, affectedUrl: page.url,
      description: `Visible text is only ${wordCount} words.`,
      recommendation: 'Expand the page with substantive content (300+ words minimum for content pages).', value: wordCount }));
  }
  // Excessive ads / affiliates
  const adIndicators = $('iframe[src*="googlesyndication"], iframe[src*="doubleclick"], ins[class*="adsbygoogle"]').length;
  const affiliateLinks = $('a[href*="amzn.to"], a[href*="?tag="], a[href*="affiliate"], a[href*="ref="]').length;
  if (adIndicators > 4 || affiliateLinks > 10) {
    out.push(makeResult({ module: M, checkName: 'Many ads/affiliate links',
      severity: SEV.INFO, affectedUrl: page.url,
      description: `${adIndicators} ad slots, ${affiliateLinks} affiliate links.`,
      recommendation: 'Balance content with monetisation; too many ads/affiliates can demote rankings.', value: { adIndicators, affiliateLinks } }));
  }
  // Freshness (try schema dateModified, then Last-Modified header)
  let modified = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const j = JSON.parse($(el).contents().text());
      const arr = Array.isArray(j) ? j : [j];
      for (const item of arr) {
        if (item.dateModified) modified = modified || item.dateModified;
        if (item.datePublished) modified = modified || item.datePublished;
      }
    } catch {}
  });
  if (!modified && page.headers && (page.headers['last-modified'] || page.headers['Last-Modified'])) {
    modified = page.headers['last-modified'] || page.headers['Last-Modified'];
  }
  if (modified) {
    const ts = new Date(modified).getTime();
    if (Number.isFinite(ts) && ts < Date.now() - 2 * 365 * 24 * 60 * 60 * 1000) {
      out.push(makeResult({ module: M, checkName: 'Stale content',
        severity: SEV.INFO, affectedUrl: page.url,
        description: `Last modified ${modified}.`,
        recommendation: 'Refresh or update the content; signal freshness via dateModified.', value: modified }));
    }
  }
  return { issues: out, wordCount };
}

// Cannibalization: pages with overlapping titles/H1 likely target the same query
export function analyzeCannibalization(pages) {
  const out = [];
  const items = [];
  for (const [url, p] of pages) {
    if (p.status !== 200) continue;
    const $ = cheerio.load(p.renderedHtml || '');
    const title = $('title').first().text().trim();
    const h1 = $('h1').first().text().trim();
    if (!title) continue;
    items.push({ url, title, h1 });
  }
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]; const b = items[j];
      const sim = titleSimilarity(a.title, b.title);
      if (sim >= 0.7) {
        out.push(makeResult({ module: M, checkName: 'Possible keyword cannibalization',
          severity: SEV.INFO, affectedUrl: a.url,
          description: `Title overlaps with ${b.url}: "${a.title}" / "${b.title}"`,
          recommendation: 'Consolidate, differentiate, or canonicalise pages targeting the same query.', value: { other: b.url, similarity: sim } }));
      }
    }
  }
  return out;
}

function titleSimilarity(a, b) {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  let inter = 0; for (const w of ta) if (tb.has(w)) inter++;
  const denom = Math.min(ta.size, tb.size) || 1;
  return inter / denom;
}

// Templated content: many pages with very similar shingles — typical of programmatically generated pages
export function analyzeTemplated(pages, threshold = 0.92) {
  const out = [];
  const fps = [];
  for (const [url, p] of pages) {
    if (p.status !== 200) continue;
    const $ = cheerio.load(p.renderedHtml || '');
    $('script, style').remove();
    fps.push({ url, fp: shingleSet($('body').text() || '', 3) });
  }
  const groups = [];
  const used = new Set();
  for (let i = 0; i < fps.length; i++) {
    if (used.has(i)) continue;
    const group = [fps[i].url];
    for (let j = i + 1; j < fps.length; j++) {
      if (used.has(j)) continue;
      if (jaccard(fps[i].fp, fps[j].fp) >= threshold) { group.push(fps[j].url); used.add(j); }
    }
    if (group.length >= 5) groups.push(group);
  }
  for (const g of groups) {
    out.push(makeResult({ module: M, checkName: 'Templated/auto-generated content',
      severity: SEV.WARNING, affectedUrl: g[0],
      description: `${g.length} pages share near-identical structure.`,
      recommendation: 'Add unique value to templated pages or noindex them.', value: g }));
  }
  return out;
}
