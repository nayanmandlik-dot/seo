// Module 5 — HTTP Status & Response
// Why these checks matter:
// - 4xx pages waste crawl budget and break the user journey when linked internally.
// - 5xx pages signal server health — repeated 5xx may cause Google to slow crawling.
// - Soft 404s (200 + "not found" content) are the worst of both worlds: search engines may index, then deindex unpredictably.
// - Slow response time correlates with indexation issues and bad UX.
import { makeResult, SEV } from '../utils/result.js';

const M = 'HTTP';

const SOFT_404_PHRASES = [
  /\bpage not found\b/i,
  /\bdoesn'?t exist\b/i,
  /\b404 error\b/i,
  /\bno results found\b/i,
  /\bcannot be found\b/i,
];

const LOGIN_HINTS = [
  /please (?:log ?in|sign ?in)/i,
  /this page requires? (?:authentication|login)/i,
  /authentication required/i,
];

export function analyzePageStatus(page, pages) {
  const out = [];
  if (!page.status) {
    out.push(makeResult({ module: M, checkName: 'Page failed to load',
      severity: SEV.CRITICAL, affectedUrl: page.url,
      description: page.error || 'Network or rendering error',
      recommendation: 'Investigate server availability and TLS.' }));
    return out;
  }
  if (page.status >= 500) {
    out.push(makeResult({ module: M, checkName: '5xx server error',
      severity: SEV.CRITICAL, affectedUrl: page.url,
      description: `Status ${page.status}`,
      recommendation: 'Resolve server-side errors immediately — repeated 5xx hurts crawl rate.', value: page.status }));
  } else if (page.status >= 400) {
    const inboundFrom = [];
    for (const [u, p] of pages) {
      for (const link of p.internalLinks || []) {
        if (link.href === page.url) inboundFrom.push(u);
      }
    }
    out.push(makeResult({ module: M, checkName: '4xx client error',
      severity: SEV.WARNING, affectedUrl: page.url,
      description: `Status ${page.status}. Linked from: ${inboundFrom.slice(0, 5).join(', ')}${inboundFrom.length > 5 ? `, +${inboundFrom.length - 5} more` : ''}`,
      recommendation: 'Fix or remove broken internal links and serve 404/410 only when truly gone.', value: { status: page.status, inboundFrom } }));
  }

  // Soft 404 detection
  if (page.status === 200) {
    const text = (page.renderedHtml || '').slice(0, 5000);
    if (SOFT_404_PHRASES.some(re => re.test(text))) {
      out.push(makeResult({ module: M, checkName: 'Possible soft 404',
        severity: SEV.WARNING, affectedUrl: page.url,
        description: 'Page returns 200 but contains "not found" / "no results" text.',
        recommendation: 'Return a real 404/410 status when no content matches.' }));
    }
    if (LOGIN_HINTS.some(re => re.test(text))) {
      out.push(makeResult({ module: M, checkName: 'Login-walled page',
        severity: SEV.INFO, affectedUrl: page.url,
        description: 'Page appears to require authentication.',
        recommendation: 'Either expose content for crawlers or noindex the gated page.' }));
    }
  }

  if (page.responseTimeMs > 1500) {
    out.push(makeResult({ module: M, checkName: 'Slow response',
      severity: SEV.WARNING, affectedUrl: page.url,
      description: `Server responded in ${page.responseTimeMs} ms.`,
      recommendation: 'Aim for TTFB < 500 ms. Cache, compress, and tune origin response.', value: page.responseTimeMs }));
  }

  for (const r of page.blockedResources || []) {
    out.push(makeResult({ module: M, checkName: 'Blocked resource (403)',
      severity: SEV.WARNING, affectedUrl: page.url,
      description: `${r.url} returned 403`,
      recommendation: 'Allow CSS/JS/image resources for crawlers (don\'t block in firewall or robots.txt).', value: r.url }));
  }
  return out;
}
