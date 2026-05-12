// Module 7 — Mobile-Friendliness
// Why these checks matter:
// - Google indexes mobile-first; pages that aren't mobile-usable rank poorly.
// - Tap targets <48px and tiny text directly hurt mobile UX scores.
// - Horizontal overflow on mobile is one of Google's official "mobile usability" failures.
// - Content parity between mobile and desktop avoids "hidden content" penalties.
import * as cheerio from 'cheerio';
import { makeResult, SEV } from '../utils/result.js';

const M = 'Mobile';

export function analyzeMobile(page) {
  const out = [];
  const $ = cheerio.load(page.renderedHtml || page.rawHtml || '');
  const viewport = $('meta[name="viewport"]').attr('content') || '';
  if (!viewport) {
    out.push(makeResult({ module: M, checkName: 'Missing viewport',
      severity: SEV.CRITICAL, affectedUrl: page.url,
      description: 'No meta viewport tag.',
      recommendation: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.' }));
  }
  if (/user-scalable\s*=\s*no/i.test(viewport) || /maximum-scale\s*=\s*1(?:\.0)?\b/i.test(viewport)) {
    out.push(makeResult({ module: M, checkName: 'Zoom disabled',
      severity: SEV.WARNING, affectedUrl: page.url,
      description: 'Viewport blocks user scaling (accessibility issue).',
      recommendation: 'Allow user scaling by removing user-scalable=no/maximum-scale=1.' }));
  }
  // Inline font-size below 12px on body/p
  const inlineFonts = [];
  $('[style]').each((_, el) => {
    const style = $(el).attr('style') || '';
    const m = style.match(/font-size\s*:\s*(\d+)px/i);
    if (m && Number(m[1]) < 12) inlineFonts.push(Number(m[1]));
  });
  if (inlineFonts.length > 0) {
    out.push(makeResult({ module: M, checkName: 'Font size below 12px',
      severity: SEV.WARNING, affectedUrl: page.url,
      description: `${inlineFonts.length} elements use font-size < 12px inline.`,
      recommendation: 'Use font-size >= 12px (16px is best for body) on mobile.', value: inlineFonts }));
  }
  return out;
}

// Tap-target and overflow checks need a live page. Called from a Playwright session.
export async function analyzeMobileLive(page, url) {
  const out = [];
  try {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (overflow) {
      out.push(makeResult({ module: M, checkName: 'Horizontal overflow on mobile',
        severity: SEV.WARNING, affectedUrl: url,
        description: 'Document is wider than viewport on 375px screens.',
        recommendation: 'Audit fixed widths, large images, and tables; use max-width: 100%.' }));
    }
    const smallTaps = await page.$$eval('a, button, input[type=submit]', els => els.filter(e => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (r.width < 48 || r.height < 48);
    }).length);
    if (smallTaps > 0) {
      out.push(makeResult({ module: M, checkName: 'Small tap targets',
        severity: SEV.WARNING, affectedUrl: url,
        description: `${smallTaps} clickable elements smaller than 48x48 px.`,
        recommendation: 'Increase tap target size to at least 48x48 px.', value: smallTaps }));
    }
  } catch (e) { /* swallow — this is a best-effort live check */ }
  return out;
}

// Compares text length between rendered HTML (desktop UA) and mobile UA via raw axios.
// In our crawler we already have desktop renderedHtml; the dedicated mobile fetch happens here.
export async function analyzeContentParity(url, desktopHtml, mobileHtml) {
  const out = [];
  if (!desktopHtml || !mobileHtml) return out;
  const stripText = (h) => {
    const $ = cheerio.load(h);
    $('script, style, noscript').remove();
    return ($('body').text() || '').replace(/\s+/g, ' ').trim();
  };
  const d = stripText(desktopHtml).length;
  const m = stripText(mobileHtml).length;
  if (d > 1000 && m / d < 0.7) {
    out.push(makeResult({ module: M, checkName: 'Mobile/desktop content parity gap',
      severity: SEV.WARNING, affectedUrl: url,
      description: `Mobile body text is ~${((m / d) * 100).toFixed(0)}% of desktop.`,
      recommendation: 'Mobile-first indexing — make sure mobile renders the same primary content.', value: { desktopChars: d, mobileChars: m } }));
  }
  return out;
}
