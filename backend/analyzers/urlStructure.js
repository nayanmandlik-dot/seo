// Module 4 — URL Structure
// Why these checks matter:
// - Long, mixed-case, special-character URLs reduce shareability and may be truncated/encoded oddly.
// - Redirect chains and loops dilute link equity and slow page loads.
// - 301 vs 302 misuse signals temporary moves where a permanent move was intended (or vice-versa) — confuses search engines.
// - 410 ("gone") is the right code for permanently removed content; using 404 leaves crawlers periodically retrying.
import { makeResult, SEV } from '../utils/result.js';

const M = 'URL';

export function analyzeUrl(page) {
  const out = [];
  const url = page.url;
  if (url.length > 115) out.push(makeResult({ module: M, checkName: 'URL too long',
    severity: SEV.INFO, affectedUrl: url,
    description: `URL is ${url.length} chars.`,
    recommendation: 'Keep URLs under 115 chars where possible.', value: url.length }));
  let pathPart;
  try { pathPart = new URL(url).pathname; } catch { pathPart = url; }
  if (/[A-Z]/.test(pathPart)) {
    out.push(makeResult({ module: M, checkName: 'Uppercase in URL',
      severity: SEV.INFO, affectedUrl: url,
      description: 'URL path contains uppercase letters.',
      recommendation: 'Use lowercase URLs to avoid case-sensitive duplicates.' }));
  }
  if (/[ %!@$^*+={}\[\]<>;:'"\\|`~]/.test(decodeURIComponent(pathPart))) {
    out.push(makeResult({ module: M, checkName: 'Special characters in URL',
      severity: SEV.WARNING, affectedUrl: url,
      description: 'URL path contains spaces or special characters.',
      recommendation: 'Use only alphanumerics, hyphens, and forward slashes.' }));
  }
  if (pathPart.includes('_')) {
    out.push(makeResult({ module: M, checkName: 'Underscores in URL',
      severity: SEV.INFO, affectedUrl: url,
      description: 'URL uses underscores instead of hyphens.',
      recommendation: 'Replace underscores with hyphens — Google treats hyphens as word separators.' }));
  }
  return out;
}

export function analyzeRedirects(page) {
  const out = [];
  if (!page.redirectChain || page.redirectChain.length === 0) return out;
  if (page.redirectChain.length >= 2) {
    out.push(makeResult({ module: M, checkName: 'Redirect chain',
      severity: SEV.WARNING, affectedUrl: page.url,
      description: `Redirect chain length ${page.redirectChain.length}: ${page.redirectChain.map(h => `${h.from} -> ${h.to}`).join(' | ')}`,
      recommendation: 'Update internal links and source redirects to point directly to the final URL.', value: page.redirectChain }));
  }
  // detect loop
  const seen = new Set();
  for (const hop of page.redirectChain) {
    if (seen.has(hop.from)) {
      out.push(makeResult({ module: M, checkName: 'Redirect loop',
        severity: SEV.CRITICAL, affectedUrl: page.url,
        description: `Redirect loop detected at ${hop.from}.`,
        recommendation: 'Fix the redirect rules to avoid the loop.', value: page.redirectChain }));
      break;
    }
    seen.add(hop.from);
  }
  // 302 used for permanent moves
  for (const hop of page.redirectChain) {
    if (hop.status === 302) {
      out.push(makeResult({ module: M, checkName: 'Temporary redirect (302) — verify intent',
        severity: SEV.INFO, affectedUrl: hop.from,
        description: `${hop.from} -> ${hop.to} uses 302.`,
        recommendation: 'Use 301 for permanent moves so signals consolidate.', value: hop }));
    }
  }
  return out;
}

export function analyzeStatusEdgeCases(page) {
  const out = [];
  if (page.status === 404) {
    out.push(makeResult({ module: M, checkName: '404 page',
      severity: SEV.WARNING, affectedUrl: page.url,
      description: 'Page returns 404.',
      recommendation: 'If the URL is permanently gone, return 410. Otherwise restore content or 301 to a relevant page.' }));
  }
  return out;
}
