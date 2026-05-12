// Module 12 — JavaScript SEO
// Why these checks matter:
// - If significant content/links only appear after JS runs, Google's two-pass indexing may delay or miss it.
// - Hash routing (#/page) is opaque to crawlers — only the route fragment is sent to the server.
// - Console errors during render can indicate broken pages or failed data fetches.
// - Resources blocked for Googlebot UA cause discovery and rendering gaps.
import * as cheerio from 'cheerio';
import axios from 'axios';
import { makeResult, SEV } from '../utils/result.js';
import { URL } from 'node:url';

const M = 'JS-SEO';

export function analyzeJsSeo(page) {
  const out = [];
  const raw = page.rawHtml || '';
  const rendered = page.renderedHtml || '';
  const rawTextLen = stripText(raw).length;
  const renderedTextLen = stripText(rendered).length;

  if (rawTextLen > 0 && renderedTextLen > rawTextLen * 1.5) {
    out.push(makeResult({ module: M, checkName: 'Significant content only after JS',
      severity: SEV.WARNING, affectedUrl: page.url,
      description: `Raw HTML body has ~${rawTextLen} chars; rendered has ~${renderedTextLen} chars.`,
      recommendation: 'Server-render or pre-render primary content so it\'s in the initial HTML.', value: { rawTextLen, renderedTextLen } }));
  }

  const rawLinks = countLinks(raw);
  const renderedLinks = countLinks(rendered);
  if (renderedLinks > rawLinks * 2 && renderedLinks - rawLinks > 10) {
    out.push(makeResult({ module: M, checkName: 'Internal links only after JS',
      severity: SEV.WARNING, affectedUrl: page.url,
      description: `Raw HTML has ${rawLinks} <a> tags; rendered has ${renderedLinks}.`,
      recommendation: 'Render primary navigation and content links in initial HTML for reliable crawlability.', value: { rawLinks, renderedLinks } }));
  }

  if ((page.consoleErrors?.length || 0) > 0) {
    out.push(makeResult({ module: M, checkName: 'JS console errors during render',
      severity: SEV.INFO, affectedUrl: page.url,
      description: `${page.consoleErrors.length} console errors`,
      recommendation: 'Fix console errors — they may indicate broken interactivity or failed content loads.', value: page.consoleErrors.slice(0, 5) }));
  }
  if ((page.jsErrors?.length || 0) > 0) {
    out.push(makeResult({ module: M, checkName: 'JS runtime errors',
      severity: SEV.WARNING, affectedUrl: page.url,
      description: `${page.jsErrors.length} runtime errors`,
      recommendation: 'Fix JS errors — they break interactivity and may stop hydration.', value: page.jsErrors.slice(0, 5) }));
  }

  // Hash routing
  for (const link of page.internalLinks || []) {
    if (link.raw && link.raw.startsWith('#/')) {
      out.push(makeResult({ module: M, checkName: 'Hash-based routing detected',
        severity: SEV.WARNING, affectedUrl: page.url,
        description: `Link uses "#/" routing: ${link.raw}`,
        recommendation: 'Use the History API (clean URLs) instead of hash routing — search engines treat # as a fragment.', value: link.raw }));
      break;
    }
  }

  // noscript fallback
  const $ = cheerio.load(rendered || raw);
  if ($('noscript').length === 0 && renderedTextLen > rawTextLen * 1.5) {
    out.push(makeResult({ module: M, checkName: 'No noscript fallback',
      severity: SEV.INFO, affectedUrl: page.url,
      description: 'JS-heavy page with no <noscript> content.',
      recommendation: 'Provide a <noscript> fallback for users and crawlers without JS.' }));
  }

  return out;
}

// Optional: probe with Googlebot UA to detect resources blocked for crawlers
export async function probeGooglebot(url) {
  const out = [];
  try {
    const res = await axios.get(url, {
      timeout: 20000,
      validateStatus: () => true,
      maxRedirects: 5,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' },
    });
    if (res.status === 403) {
      out.push(makeResult({ module: M, checkName: 'Page blocks Googlebot UA',
        severity: SEV.CRITICAL, affectedUrl: url,
        description: `Googlebot UA returned ${res.status}.`,
        recommendation: 'Allow Googlebot in your firewall/WAF.', value: res.status }));
    }
  } catch { /* ignore */ }
  return out;
}

function stripText(html) {
  if (!html) return '';
  const $ = cheerio.load(html);
  $('script, style, noscript').remove();
  return ($('body').text() || '').replace(/\s+/g, ' ').trim();
}

function countLinks(html) {
  if (!html) return 0;
  const $ = cheerio.load(html);
  return $('a[href]').length;
}
