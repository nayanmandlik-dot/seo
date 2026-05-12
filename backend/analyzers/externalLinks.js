// Module 16 — External Links
// Why these checks matter:
// - Broken external links degrade UX and erode trust signals.
// - Linking to HTTP from an HTTPS page may break under strict CSPs or browser warnings.
// - Missing rel="nofollow"/"sponsored"/"ugc" on paid or untrusted links violates Google's link spam policy.
// - target="_blank" without rel="noopener" allows the target to access window.opener (security risk).
import axios from 'axios';
import { makeResult, SEV } from '../utils/result.js';

const M = 'External';

export async function analyzeExternalLinks(pages, concurrency = 8) {
  const out = [];
  const seen = new Map(); // href -> { status, error }
  const all = [];
  for (const [url, p] of pages) {
    for (const link of p.externalLinks || []) {
      all.push({ source: url, link });
    }
  }

  // Per-page lint
  for (const { source, link } of all) {
    if (link.target === '_blank' && !/\bnoopener\b/i.test(link.rel || '')) {
      out.push(makeResult({ module: M, checkName: 'target=_blank without rel=noopener',
        severity: SEV.WARNING, affectedUrl: source,
        description: `${link.href} opens in new tab without rel="noopener noreferrer"`,
        recommendation: 'Add rel="noopener noreferrer" to all target=_blank links (security best practice).', value: link.href }));
    }
    if (/^http:\/\//i.test(link.href)) {
      out.push(makeResult({ module: M, checkName: 'External HTTP link',
        severity: SEV.INFO, affectedUrl: source,
        description: `${link.href} uses HTTP.`,
        recommendation: 'Where possible, link to the HTTPS version.', value: link.href }));
    }
  }

  // HEAD-only reachability check, dedup'd
  const unique = [...new Set(all.map(x => x.link.href))];
  let idx = 0;
  async function worker() {
    while (idx < unique.length) {
      const i = idx++;
      const href = unique[i];
      try {
        const res = await axios.head(href, { timeout: 10000, maxRedirects: 5, validateStatus: () => true });
        seen.set(href, { status: res.status });
        if (res.status >= 400) {
          for (const { source } of all.filter(x => x.link.href === href)) {
            out.push(makeResult({ module: M, checkName: 'Broken external link',
              severity: SEV.WARNING, affectedUrl: source,
              description: `${href} returned ${res.status}`,
              recommendation: 'Update or remove the broken link.', value: { href, status: res.status } }));
          }
        }
      } catch (e) {
        seen.set(href, { status: 0, error: e.message });
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  return { issues: out, statusByHref: seen };
}
