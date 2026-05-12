// Module 1 — Crawlability & Indexation
// Why these checks matter:
// - robots.txt errors and overly broad disallows can prevent search engines from crawling whole sections.
// - Sitemaps that reference blocked, missing, or non-200 URLs waste crawl budget and signal poor site hygiene.
// - noindex (in meta or X-Robots-Tag) directly removes pages from search results — a misplaced one is catastrophic.
// - Crawl traps (faceted nav, calendars, session IDs) burn crawl budget on near-duplicate pages.
import * as cheerio from 'cheerio';
import { makeResult, SEV } from '../utils/result.js';
import { isAllowed } from '../crawler/robots.js';

const M = 'Crawlability';

export function analyzeRobots(robots) {
  const out = [];
  if (!robots || !robots.exists) {
    out.push(makeResult({ module: M, checkName: 'robots.txt missing',
      severity: SEV.WARNING, affectedUrl: null,
      description: 'No robots.txt found at /robots.txt.',
      recommendation: 'Add a robots.txt with explicit allow rules and a Sitemap: declaration.' }));
    return out;
  }
  for (const e of robots.errors) {
    out.push(makeResult({ module: M, checkName: 'robots.txt syntax error',
      severity: SEV.WARNING, affectedUrl: null, description: e,
      recommendation: 'Fix syntax errors in robots.txt — invalid lines may be ignored or block content unintentionally.', value: e }));
  }
  // Overly broad disallow
  for (const [ua, r] of Object.entries(robots.rules)) {
    if (r.disallow.includes('/')) {
      out.push(makeResult({ module: M, checkName: 'robots.txt blocks entire site',
        severity: SEV.CRITICAL, affectedUrl: null,
        description: `User-agent "${ua}" has "Disallow: /" — blocks all URLs.`,
        recommendation: 'Remove "Disallow: /" unless the entire site is intentionally hidden from search.', value: ua }));
    }
  }
  if (!robots.sitemaps.length) {
    out.push(makeResult({ module: M, checkName: 'robots.txt missing Sitemap declaration',
      severity: SEV.INFO, affectedUrl: null,
      description: 'No "Sitemap:" line in robots.txt.',
      recommendation: 'Add a "Sitemap: https://your-site/sitemap.xml" line so crawlers can discover the sitemap.' }));
  }
  for (const r of Object.values(robots.rules)) {
    if (r.crawlDelay && r.crawlDelay > 5) {
      out.push(makeResult({ module: M, checkName: 'High crawl-delay',
        severity: SEV.INFO, affectedUrl: null,
        description: `crawl-delay is ${r.crawlDelay}s — Googlebot ignores this but other crawlers will slow.`,
        recommendation: 'Use Search Console crawl-rate settings instead of crawl-delay > 5.', value: r.crawlDelay }));
    }
  }
  return out;
}

export async function analyzeSitemaps(sitemapResult, pages, robots) {
  const out = [];
  if (!sitemapResult.sitemaps.length) {
    out.push(makeResult({ module: M, checkName: 'No sitemap found',
      severity: SEV.WARNING, affectedUrl: null,
      description: 'No XML sitemap was found at /sitemap.xml or in robots.txt.',
      recommendation: 'Generate and submit an XML sitemap to help search engines discover URLs.' }));
    return out;
  }
  for (const sm of sitemapResult.sitemaps) {
    if (!sm.ok) {
      out.push(makeResult({ module: M, checkName: 'Sitemap fetch failed',
        severity: SEV.CRITICAL, affectedUrl: sm.url,
        description: `Could not fetch sitemap: ${sm.error || sm.status}`,
        recommendation: 'Ensure the sitemap returns a 200 with valid XML.', value: sm.status }));
    }
  }
  // Validate every URL in the sitemap
  for (const item of sitemapResult.allUrls) {
    if (!item.loc) continue;
    if (item.lastmod) {
      const d = new Date(item.lastmod);
      if (isNaN(d.getTime())) {
        out.push(makeResult({ module: M, checkName: 'Sitemap invalid lastmod',
          severity: SEV.WARNING, affectedUrl: item.loc,
          description: `lastmod "${item.lastmod}" is not a valid W3C date.`,
          recommendation: 'Use ISO 8601 format (e.g. 2024-01-15) for lastmod.', value: item.lastmod }));
      }
    }
    // blocked by robots
    if (robots && robots.exists) {
      try {
        const u = new URL(item.loc);
        if (!isAllowed(robots, u.pathname + u.search)) {
          out.push(makeResult({ module: M, checkName: 'Sitemap URL blocked by robots.txt',
            severity: SEV.CRITICAL, affectedUrl: item.loc,
            description: 'URL is in sitemap but blocked by robots.txt — conflicting signals.',
            recommendation: 'Remove the URL from the sitemap, or unblock it in robots.txt.' }));
        }
      } catch { /* ignore */ }
    }
    // not a 200 in our crawl
    const page = pages.get(item.loc) || pages.get(item.loc.replace(/\/$/, ''));
    if (page && page.status && page.status !== 200) {
      out.push(makeResult({ module: M, checkName: 'Sitemap URL not 200',
        severity: SEV.CRITICAL, affectedUrl: item.loc,
        description: `Sitemap URL returned ${page.status}.`,
        recommendation: 'Remove non-200 URLs from sitemap or fix their status.', value: page.status }));
    }
  }
  // Pages crawled but not in sitemap
  const sitemapSet = new Set(sitemapResult.allUrls.map(x => x.loc));
  for (const [url, p] of pages) {
    if (p.status === 200 && !sitemapSet.has(url) && p.depth <= 3) {
      out.push(makeResult({ module: M, checkName: 'Important page missing from sitemap',
        severity: SEV.INFO, affectedUrl: url,
        description: 'Page is reachable and shallow but not in any sitemap.',
        recommendation: 'Include important pages in the XML sitemap.' }));
    }
  }
  return out;
}

export function analyzePageIndexation(page) {
  const out = [];
  const $ = cheerio.load(page.renderedHtml || page.rawHtml || '');
  const meta = $('meta[name="robots"]').attr('content') || '';
  const xrobots = page.headers['x-robots-tag'] || page.headers['X-Robots-Tag'] || '';
  const metaNoindex = /noindex/i.test(meta);
  const headerNoindex = /noindex/i.test(xrobots);

  if (metaNoindex) {
    out.push(makeResult({ module: M, checkName: 'noindex (meta)',
      severity: SEV.CRITICAL, affectedUrl: page.url,
      description: 'Page contains <meta name="robots" content="noindex">',
      recommendation: 'Remove noindex unless the page should not appear in search results.', value: meta }));
  }
  if (headerNoindex) {
    out.push(makeResult({ module: M, checkName: 'noindex (X-Robots-Tag header)',
      severity: SEV.CRITICAL, affectedUrl: page.url,
      description: `X-Robots-Tag header contains noindex: "${xrobots}"`,
      recommendation: 'Remove noindex from X-Robots-Tag if the page should be indexed.', value: xrobots }));
  }
  if (metaNoindex !== headerNoindex && (metaNoindex || headerNoindex)) {
    out.push(makeResult({ module: M, checkName: 'meta vs header robots conflict',
      severity: SEV.WARNING, affectedUrl: page.url,
      description: 'Meta robots and X-Robots-Tag disagree on noindex.',
      recommendation: 'Make meta robots and X-Robots-Tag consistent — search engines may treat them ambiguously.' }));
  }
  // nofollow on internal links
  for (const link of page.internalLinks || []) {
    if (/\bnofollow\b/i.test(link.rel || '')) {
      out.push(makeResult({ module: M, checkName: 'Internal link with nofollow',
        severity: SEV.WARNING, affectedUrl: page.url,
        description: `Internal link to ${link.href} uses rel="nofollow"`,
        recommendation: 'Remove nofollow from internal links — it wastes link equity.', value: link.href }));
    }
  }
  // pagination canonical: if URL has ?page= and canonical points to page=1 only, that flattens series
  const canonical = $('link[rel="canonical"]').attr('href') || '';
  const u = new URL(page.url);
  if (/[?&]page=\d+/.test(u.search) && canonical && !/[?&]page=/.test(canonical)) {
    out.push(makeResult({ module: M, checkName: 'Paginated page canonicalises away',
      severity: SEV.WARNING, affectedUrl: page.url,
      description: 'Paginated page has a canonical pointing to a non-paginated URL.',
      recommendation: 'Use self-referencing canonicals on paginated pages.' }));
  }
  return out;
}

// Crawl-trap detection: count how many distinct URLs share the same path with only differing query params.
export function analyzeCrawlTraps(pages) {
  const out = [];
  const groups = new Map();
  for (const url of pages.keys()) {
    try {
      const u = new URL(url);
      if (!u.search) continue;
      groups.set(u.pathname, (groups.get(u.pathname) || 0) + 1);
    } catch { /* ignore */ }
  }
  for (const [path, count] of groups) {
    if (count >= 25) {
      out.push(makeResult({ module: M, checkName: 'Possible crawl trap',
        severity: SEV.WARNING, affectedUrl: path,
        description: `${count} parameterised variants of "${path}" were found.`,
        recommendation: 'Add canonicals, block parameter URLs in robots.txt, or use noindex on infinite filters.', value: count }));
    }
  }
  return out;
}

export function analyzeCrawlDepth(pages) {
  const out = [];
  for (const [url, p] of pages) {
    if (p.depth > 4) {
      out.push(makeResult({ module: M, checkName: 'Page deeper than 4 clicks',
        severity: SEV.INFO, affectedUrl: url,
        description: `Page is ${p.depth} clicks from the homepage.`,
        recommendation: 'Surface deep pages in navigation, hubs, or related links to flatten architecture.', value: p.depth }));
    }
  }
  return out;
}
