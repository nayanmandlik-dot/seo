// Module 6 — Page Speed & Core Web Vitals
// Why these checks matter:
// - Core Web Vitals (LCP, CLS, INP) are confirmed Google ranking signals as of 2024.
// - Render-blocking and unused JS/CSS extend Time to Interactive and reduce conversion.
// - Compression, Cache-Control, and ETag headers are basic origin hygiene that PSI penalizes when missing.
// - Third-party scripts often dominate Total Blocking Time and can be the biggest performance offender.
import axios from 'axios';
import { makeResult, SEV } from '../utils/result.js';

const M = 'Speed';
const PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

export async function runPageSpeed(url, strategy, apiKey) {
  if (!apiKey) return { error: 'No API key configured' };
  try {
    const res = await axios.get(PSI_ENDPOINT, {
      timeout: 60000,
      params: {
        url, strategy, key: apiKey,
        category: ['performance', 'seo', 'accessibility', 'best-practices'],
      },
    });
    return res.data;
  } catch (e) {
    return { error: e.response?.data?.error?.message || e.message };
  }
}

function metric(audits, key) {
  const a = audits?.[key];
  if (!a) return null;
  return { score: a.score, value: a.numericValue, display: a.displayValue };
}

export async function analyzeSpeed(url, apiKey) {
  const out = [];
  const speedReport = { url, mobile: null, desktop: null };

  for (const strategy of ['mobile', 'desktop']) {
    const data = await runPageSpeed(url, strategy, apiKey);
    if (data.error) {
      out.push(makeResult({ module: M, checkName: 'PageSpeed API error',
        severity: SEV.INFO, affectedUrl: url,
        description: `(${strategy}) ${data.error}`,
        recommendation: 'Configure PAGESPEED_API_KEY in .env to enable Core Web Vitals checks.', value: data.error }));
      continue;
    }
    const audits = data.lighthouseResult?.audits || {};
    const cwv = {
      lcp: metric(audits, 'largest-contentful-paint'),
      cls: metric(audits, 'cumulative-layout-shift'),
      inp: metric(audits, 'interaction-to-next-paint') || metric(audits, 'experimental-interaction-to-next-paint'),
      fcp: metric(audits, 'first-contentful-paint'),
      ttfb: metric(audits, 'server-response-time'),
      si: metric(audits, 'speed-index'),
      tbt: metric(audits, 'total-blocking-time'),
    };
    speedReport[strategy] = {
      performanceScore: data.lighthouseResult?.categories?.performance?.score ?? null,
      cwv,
      renderBlocking: audits['render-blocking-resources']?.details?.items?.length || 0,
      unusedJs: audits['unused-javascript']?.details?.items?.length || 0,
      unusedCss: audits['unused-css-rules']?.details?.items?.length || 0,
      unminifiedJs: audits['unminified-javascript']?.details?.items?.length || 0,
      unminifiedCss: audits['unminified-css']?.details?.items?.length || 0,
      compression: audits['uses-text-compression']?.score ?? null,
      cache: audits['uses-long-cache-ttl']?.score ?? null,
      thirdParty: audits['third-party-summary']?.details?.items?.length || 0,
    };

    // CWV thresholds
    if (cwv.lcp?.value > 4000) out.push(makeResult({ module: M, checkName: `LCP fail (${strategy})`,
      severity: SEV.CRITICAL, affectedUrl: url, description: `LCP is ${(cwv.lcp.value / 1000).toFixed(2)}s`,
      recommendation: 'Reduce LCP below 2.5s — preload hero image, optimise server response, eliminate render-blocking resources.', value: cwv.lcp.value }));
    else if (cwv.lcp?.value > 2500) out.push(makeResult({ module: M, checkName: `LCP needs improvement (${strategy})`,
      severity: SEV.WARNING, affectedUrl: url, description: `LCP is ${(cwv.lcp.value / 1000).toFixed(2)}s`,
      recommendation: 'Aim for LCP < 2.5s.', value: cwv.lcp.value }));

    if (cwv.cls?.value > 0.25) out.push(makeResult({ module: M, checkName: `CLS fail (${strategy})`,
      severity: SEV.CRITICAL, affectedUrl: url, description: `CLS is ${cwv.cls.value.toFixed(3)}`,
      recommendation: 'Reserve space for images and ads; avoid late-injected content above the fold.', value: cwv.cls.value }));
    else if (cwv.cls?.value > 0.1) out.push(makeResult({ module: M, checkName: `CLS needs improvement (${strategy})`,
      severity: SEV.WARNING, affectedUrl: url, description: `CLS is ${cwv.cls.value.toFixed(3)}`,
      recommendation: 'Aim for CLS < 0.1.', value: cwv.cls.value }));

    if (cwv.inp?.value > 500) out.push(makeResult({ module: M, checkName: `INP fail (${strategy})`,
      severity: SEV.CRITICAL, affectedUrl: url, description: `INP is ${cwv.inp.value} ms`,
      recommendation: 'Reduce JS execution on input handlers, break up long tasks.', value: cwv.inp.value }));
    else if (cwv.inp?.value > 200) out.push(makeResult({ module: M, checkName: `INP needs improvement (${strategy})`,
      severity: SEV.WARNING, affectedUrl: url, description: `INP is ${cwv.inp.value} ms`,
      recommendation: 'Aim for INP < 200ms.', value: cwv.inp.value }));

    // Render-blocking
    if (speedReport[strategy].renderBlocking > 0) {
      out.push(makeResult({ module: M, checkName: `Render-blocking resources (${strategy})`,
        severity: SEV.WARNING, affectedUrl: url,
        description: `${speedReport[strategy].renderBlocking} render-blocking resources detected`,
        recommendation: 'Defer/async non-critical CSS and JS, inline critical CSS.', value: speedReport[strategy].renderBlocking }));
    }
    if (speedReport[strategy].unusedJs > 5) out.push(makeResult({ module: M, checkName: `Unused JavaScript (${strategy})`,
      severity: SEV.INFO, affectedUrl: url, description: `${speedReport[strategy].unusedJs} bundles with unused JS`,
      recommendation: 'Code-split and lazy-load JS that isn\'t needed on initial render.', value: speedReport[strategy].unusedJs }));
    if (speedReport[strategy].unusedCss > 5) out.push(makeResult({ module: M, checkName: `Unused CSS (${strategy})`,
      severity: SEV.INFO, affectedUrl: url, description: `${speedReport[strategy].unusedCss} stylesheets with unused rules`,
      recommendation: 'Remove or split unused CSS.', value: speedReport[strategy].unusedCss }));
    if (speedReport[strategy].unminifiedJs > 0) out.push(makeResult({ module: M, checkName: `Unminified JS (${strategy})`,
      severity: SEV.WARNING, affectedUrl: url, description: 'JS files are not minified',
      recommendation: 'Run JS through a minifier (esbuild/terser/etc.).' }));
    if (speedReport[strategy].unminifiedCss > 0) out.push(makeResult({ module: M, checkName: `Unminified CSS (${strategy})`,
      severity: SEV.WARNING, affectedUrl: url, description: 'CSS files are not minified',
      recommendation: 'Minify CSS in your build.' }));
    if (speedReport[strategy].compression === 0) out.push(makeResult({ module: M, checkName: `Missing text compression (${strategy})`,
      severity: SEV.WARNING, affectedUrl: url, description: 'Text resources not gzip/brotli compressed',
      recommendation: 'Enable gzip or brotli at the server/CDN level.' }));
    if (speedReport[strategy].cache === 0) out.push(makeResult({ module: M, checkName: `Inefficient cache policy (${strategy})`,
      severity: SEV.INFO, affectedUrl: url, description: 'Cache-Control TTLs are short or missing',
      recommendation: 'Set long cache TTLs for static assets and use immutable filenames.' }));
    if (speedReport[strategy].thirdParty > 5) out.push(makeResult({ module: M, checkName: `Many third-party scripts (${strategy})`,
      severity: SEV.INFO, affectedUrl: url, description: `${speedReport[strategy].thirdParty} third-party origins`,
      recommendation: 'Audit and remove or lazy-load third-party tags that don\'t justify their performance cost.', value: speedReport[strategy].thirdParty }));
  }

  return { issues: out, speedReport };
}

// Header-based checks (no PSI required) — runs on every page
export function analyzeResponseHeaders(page) {
  const out = [];
  const h = page.headers || {};
  const enc = h['content-encoding'] || h['Content-Encoding'] || '';
  if (page.status === 200 && !/(gzip|br|deflate|zstd)/i.test(enc)) {
    out.push(makeResult({ module: M, checkName: 'No content compression',
      severity: SEV.WARNING, affectedUrl: page.url,
      description: `Response not compressed (Content-Encoding: "${enc || 'none'}")`,
      recommendation: 'Enable gzip or brotli on the origin/CDN.', value: enc }));
  }
  const cc = h['cache-control'] || h['Cache-Control'] || '';
  if (page.status === 200 && !cc) {
    out.push(makeResult({ module: M, checkName: 'Missing Cache-Control header',
      severity: SEV.INFO, affectedUrl: page.url,
      description: 'No Cache-Control header on response.',
      recommendation: 'Set a Cache-Control header for HTML and static assets.' }));
  }
  return out;
}
