// Module 13 — International SEO
// Why these checks matter:
// - hreflang tells Google which language/country variant to serve in SERPs.
// - Bidirectional pairing is required: each variant must reference all others or Google ignores the cluster.
// - Missing x-default leaves the fallback variant for unmatched users undefined.
// - hreflang URLs must be 200 — chains/404s break the cluster.
import * as cheerio from 'cheerio';
import { makeResult, SEV } from '../utils/result.js';

const M = 'International';

const ISO_LANG = /^[a-z]{2,3}$/;
const ISO_REGION = /^[A-Z]{2}$/;

export function extractHreflang(page) {
  const out = [];
  const $ = cheerio.load(page.renderedHtml || page.rawHtml || '');
  $('link[rel="alternate"][hreflang]').each((_, el) => {
    const lang = $(el).attr('hreflang');
    const href = $(el).attr('href');
    if (lang && href) out.push({ lang, href });
  });
  // HTTP header form: Link: <url>; rel="alternate"; hreflang="x"
  const linkHeader = page.headers?.link || page.headers?.Link;
  if (linkHeader) {
    const parts = String(linkHeader).split(',');
    for (const p of parts) {
      const m = p.match(/<([^>]+)>.*hreflang=["']?([\w-]+)["']?/i);
      if (m) out.push({ lang: m[2], href: m[1] });
    }
  }
  return out;
}

export function analyzeHreflangPage(page) {
  const out = [];
  const tags = extractHreflang(page);
  if (!tags.length) return { issues: out, tags };

  const seen = new Map();
  let hasXDefault = false;
  for (const t of tags) {
    if (t.lang === 'x-default') { hasXDefault = true; continue; }
    const [lang, region] = t.lang.split('-');
    if (!ISO_LANG.test(lang)) {
      out.push(makeResult({ module: M, checkName: 'Invalid hreflang language code',
        severity: SEV.WARNING, affectedUrl: page.url,
        description: `hreflang="${t.lang}"`,
        recommendation: 'Use ISO 639-1 lowercase language codes.', value: t.lang }));
    }
    if (region && !ISO_REGION.test(region)) {
      out.push(makeResult({ module: M, checkName: 'Invalid hreflang region code',
        severity: SEV.WARNING, affectedUrl: page.url,
        description: `hreflang="${t.lang}"`,
        recommendation: 'Use ISO 3166-1 alpha-2 uppercase region codes.', value: t.lang }));
    }
    if (seen.has(t.lang) && seen.get(t.lang) !== t.href) {
      out.push(makeResult({ module: M, checkName: 'Conflicting hreflang declarations',
        severity: SEV.WARNING, affectedUrl: page.url,
        description: `Two different URLs declared for ${t.lang}.`,
        recommendation: 'Each language/region must point to one URL.', value: t }));
    }
    seen.set(t.lang, t.href);
  }
  if (!hasXDefault) {
    out.push(makeResult({ module: M, checkName: 'Missing x-default hreflang',
      severity: SEV.INFO, affectedUrl: page.url,
      description: 'No x-default declared.',
      recommendation: 'Add a x-default hreflang for users that don\'t match any language/region.' }));
  }
  return { issues: out, tags };
}

// Cross-page bidirectional check: A says it's paired with B; B must reference A back.
export function analyzeHreflangBidirectional(pages) {
  const out = [];
  const map = new Map();
  for (const [url, p] of pages) {
    map.set(url, extractHreflang(p));
  }
  for (const [a, tags] of map) {
    for (const t of tags) {
      if (t.lang === 'x-default') continue;
      const target = map.get(t.href);
      if (!target) {
        out.push(makeResult({ module: M, checkName: 'hreflang target not crawled or not 200',
          severity: SEV.WARNING, affectedUrl: a,
          description: `hreflang -> ${t.href} (${t.lang}) was not reachable.`,
          recommendation: 'hreflang URLs must return 200 and be crawlable.', value: t }));
        continue;
      }
      const back = target.find(x => x.href === a);
      if (!back) {
        out.push(makeResult({ module: M, checkName: 'Non-bidirectional hreflang',
          severity: SEV.WARNING, affectedUrl: a,
          description: `${t.href} does not reference ${a} back.`,
          recommendation: 'Each variant in an hreflang cluster must reference every other variant.', value: t }));
      }
    }
  }
  return out;
}
