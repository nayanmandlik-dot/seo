// Module 3 — On-Page Meta
// Why these checks matter:
// - Title and meta description directly drive SERP click-through; bad lengths cause truncation.
// - H1 and heading hierarchy give Google a structural understanding of the page.
// - Open Graph and Twitter cards control how the page appears when shared on social platforms.
// - lang and viewport are signals that affect mobile-friendliness and language targeting.
import * as cheerio from 'cheerio';
import { makeResult, SEV } from '../utils/result.js';

const M = 'Meta';

export function analyzeMeta(page) {
  const out = [];
  const $ = cheerio.load(page.renderedHtml || page.rawHtml || '');

  const title = $('title').first().text().trim();
  if (!title) {
    out.push(makeResult({ module: M, checkName: 'Missing title',
      severity: SEV.CRITICAL, affectedUrl: page.url,
      description: 'No <title> tag.',
      recommendation: 'Every page must have a unique, descriptive <title>.' }));
  } else {
    if (title.length < 30) out.push(makeResult({ module: M, checkName: 'Title too short',
      severity: SEV.WARNING, affectedUrl: page.url, description: `Title is ${title.length} chars.`,
      recommendation: 'Aim for 30–60 chars to make titles informative.', value: title }));
    if (title.length > 60) out.push(makeResult({ module: M, checkName: 'Title too long',
      severity: SEV.WARNING, affectedUrl: page.url, description: `Title is ${title.length} chars and may be truncated in SERPs.`,
      recommendation: 'Keep titles under 60 chars.', value: title }));
  }

  const desc = $('meta[name="description"]').attr('content') || '';
  if (!desc) {
    out.push(makeResult({ module: M, checkName: 'Missing meta description',
      severity: SEV.WARNING, affectedUrl: page.url,
      description: 'No meta description.',
      recommendation: 'Write a 70–160 char description summarising the page.' }));
  } else {
    if (desc.length < 70) out.push(makeResult({ module: M, checkName: 'Meta description too short',
      severity: SEV.INFO, affectedUrl: page.url, description: `Description is ${desc.length} chars.`,
      recommendation: 'Aim for 70–160 chars.', value: desc }));
    if (desc.length > 160) out.push(makeResult({ module: M, checkName: 'Meta description too long',
      severity: SEV.INFO, affectedUrl: page.url, description: `Description is ${desc.length} chars and may be truncated.`,
      recommendation: 'Keep meta descriptions under 160 chars.', value: desc }));
  }

  const h1s = $('h1').map((_, el) => $(el).text().trim()).get();
  if (h1s.length === 0) {
    out.push(makeResult({ module: M, checkName: 'Missing H1',
      severity: SEV.WARNING, affectedUrl: page.url,
      description: 'No <h1> on this page.',
      recommendation: 'Add exactly one descriptive H1 per page.' }));
  } else if (h1s.length > 1) {
    out.push(makeResult({ module: M, checkName: 'Multiple H1 tags',
      severity: SEV.WARNING, affectedUrl: page.url,
      description: `${h1s.length} H1 tags found.`,
      recommendation: 'Use exactly one H1 per page.', value: h1s }));
  } else if (title) {
    // Crude similarity: at least one significant token shared
    const t1 = new Set(title.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const t2 = new Set(h1s[0].toLowerCase().split(/\s+/).filter(w => w.length > 3));
    let common = 0; for (const w of t1) if (t2.has(w)) common++;
    if (t1.size > 2 && common === 0) {
      out.push(makeResult({ module: M, checkName: 'H1 unrelated to title',
        severity: SEV.INFO, affectedUrl: page.url,
        description: 'H1 and title share no significant words.',
        recommendation: 'Align H1 and title around the same primary topic/keyword.', value: { title, h1: h1s[0] } }));
    }
  }

  // Heading hierarchy: detect skipped levels and out-of-order
  const headings = [];
  $('h1,h2,h3,h4,h5,h6').each((_, el) => {
    headings.push({ level: Number(el.tagName.toLowerCase().slice(1)), text: $(el).text().trim() });
  });
  for (let i = 1; i < headings.length; i++) {
    if (headings[i].level - headings[i - 1].level > 1) {
      out.push(makeResult({ module: M, checkName: 'Skipped heading level',
        severity: SEV.INFO, affectedUrl: page.url,
        description: `H${headings[i - 1].level} -> H${headings[i].level} skips a level.`,
        recommendation: 'Use heading levels sequentially (H1->H2->H3).', value: headings[i].text }));
      break;
    }
  }

  const lang = $('html').attr('lang');
  if (!lang) out.push(makeResult({ module: M, checkName: 'Missing lang attribute',
    severity: SEV.WARNING, affectedUrl: page.url,
    description: 'No lang attribute on <html>.',
    recommendation: 'Add lang (e.g. lang="en") for accessibility and language targeting.' }));
  else if (!/^[a-z]{2,3}(-[A-Z]{2})?$/.test(lang)) out.push(makeResult({ module: M, checkName: 'Invalid lang attribute',
    severity: SEV.INFO, affectedUrl: page.url,
    description: `lang="${lang}" doesn't match expected format.`,
    recommendation: 'Use BCP 47 codes (e.g. en, en-US).', value: lang }));

  const viewport = $('meta[name="viewport"]').attr('content') || '';
  if (!viewport) out.push(makeResult({ module: M, checkName: 'Missing viewport meta',
    severity: SEV.CRITICAL, affectedUrl: page.url,
    description: 'No meta viewport tag — page won\'t scale on mobile.',
    recommendation: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.' }));
  if (/user-scalable\s*=\s*no/i.test(viewport) || /maximum-scale\s*=\s*1(?:\.0)?\b/i.test(viewport)) {
    out.push(makeResult({ module: M, checkName: 'Viewport disables zoom',
      severity: SEV.WARNING, affectedUrl: page.url,
      description: `Viewport contains "${viewport}" — disables user scaling.`,
      recommendation: 'Allow user scaling for accessibility.', value: viewport }));
  }

  // OG / Twitter
  const ogRequired = ['og:title', 'og:description', 'og:image', 'og:url'];
  for (const k of ogRequired) {
    if (!$(`meta[property="${k}"]`).attr('content')) {
      out.push(makeResult({ module: M, checkName: `Missing ${k}`,
        severity: SEV.INFO, affectedUrl: page.url,
        description: `Open Graph tag ${k} is missing.`,
        recommendation: `Add <meta property="${k}" content="..."> for richer social sharing.` }));
    }
  }
  const twRequired = ['twitter:card', 'twitter:image'];
  for (const k of twRequired) {
    if (!$(`meta[name="${k}"]`).attr('content')) {
      out.push(makeResult({ module: M, checkName: `Missing ${k}`,
        severity: SEV.INFO, affectedUrl: page.url,
        description: `Twitter Card tag ${k} is missing.`,
        recommendation: `Add <meta name="${k}" content="..."> for Twitter previews.` }));
    }
  }

  // Charset
  const charset = ($('meta[charset]').attr('charset') || '').toUpperCase();
  if (!charset) {
    out.push(makeResult({ module: M, checkName: 'Missing charset',
      severity: SEV.WARNING, affectedUrl: page.url,
      description: 'No charset declaration.',
      recommendation: 'Add <meta charset="UTF-8"> as the first child of <head>.' }));
  } else if (charset !== 'UTF-8') {
    out.push(makeResult({ module: M, checkName: 'Non-UTF-8 charset',
      severity: SEV.INFO, affectedUrl: page.url,
      description: `Charset is ${charset}.`,
      recommendation: 'Use UTF-8 to support all characters.', value: charset }));
  }

  // Favicon
  const fav = $('link[rel*="icon"]').attr('href');
  if (!fav) out.push(makeResult({ module: M, checkName: 'Missing favicon',
    severity: SEV.INFO, affectedUrl: page.url,
    description: 'No <link rel="icon">.',
    recommendation: 'Declare a favicon for browser tabs and bookmarks.' }));

  return out;
}
