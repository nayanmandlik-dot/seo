// Module 17 — Accessibility (SEO-relevant)
// Why these checks matter:
// - Many accessibility signals (alt text, link text, language) double as SEO signals.
// - Landmark elements (<main>, <nav>, etc.) help both screen readers and crawlers parse structure.
// - Form inputs without labels are unusable for assistive tech and reduce conversion.
// - Skip-nav links are a basic A11y compliance item often required for AODA/ADA conformance.
import * as cheerio from 'cheerio';
import { makeResult, SEV } from '../utils/result.js';

const M = 'Accessibility';

export function analyzeAccessibility(page) {
  const out = [];
  if (page.status !== 200) return out;
  const $ = cheerio.load(page.renderedHtml || page.rawHtml || '');

  // Form inputs without label
  $('input, select, textarea').each((_, el) => {
    const $el = $(el);
    const type = $el.attr('type');
    if (type === 'hidden' || type === 'submit' || type === 'button') return;
    const id = $el.attr('id');
    const ariaLabel = $el.attr('aria-label');
    const ariaLabelledBy = $el.attr('aria-labelledby');
    const wrapped = $el.parents('label').length > 0;
    const explicit = id ? $(`label[for="${id}"]`).length > 0 : false;
    if (!ariaLabel && !ariaLabelledBy && !wrapped && !explicit) {
      out.push(makeResult({ module: M, checkName: 'Form input without label',
        severity: SEV.WARNING, affectedUrl: page.url,
        description: `${el.tagName}${id ? `#${id}` : ''} has no associated <label>.`,
        recommendation: 'Add a <label for="..."> or aria-label.' }));
    }
  });

  // Landmarks
  for (const tag of ['main', 'nav', 'header', 'footer']) {
    if ($(tag).length === 0 && $(`[role="${tag === 'main' ? 'main' : tag === 'nav' ? 'navigation' : tag === 'header' ? 'banner' : 'contentinfo'}"]`).length === 0) {
      out.push(makeResult({ module: M, checkName: `Missing <${tag}> landmark`,
        severity: SEV.INFO, affectedUrl: page.url,
        description: `No <${tag}> element or matching ARIA role.`,
        recommendation: `Add <${tag}> for clearer document structure.` }));
    }
  }

  // Links with no descriptive text
  $('a[href]').each((_, el) => {
    const $el = $(el);
    const text = $el.text().replace(/\s+/g, ' ').trim();
    const ariaLabel = $el.attr('aria-label') || '';
    const hasImg = $el.find('img').length > 0;
    if (!text && !ariaLabel && !hasImg) {
      out.push(makeResult({ module: M, checkName: 'Link with no text',
        severity: SEV.WARNING, affectedUrl: page.url,
        description: `Empty <a> with href="${$el.attr('href')}"`,
        recommendation: 'Provide visible link text or aria-label.' }));
    }
  });

  // Buttons with no accessible name
  $('button').each((_, el) => {
    const $el = $(el);
    const text = $el.text().replace(/\s+/g, ' ').trim();
    const ariaLabel = $el.attr('aria-label');
    if (!text && !ariaLabel) {
      out.push(makeResult({ module: M, checkName: 'Button with no accessible name',
        severity: SEV.WARNING, affectedUrl: page.url,
        description: 'Button has no text or aria-label.',
        recommendation: 'Add visible label or aria-label.' }));
    }
  });

  // Skip nav
  const firstLink = $('a').first();
  const text = firstLink.text().toLowerCase();
  if (!/skip|jump/.test(text)) {
    out.push(makeResult({ module: M, checkName: 'Missing skip-navigation link',
      severity: SEV.INFO, affectedUrl: page.url,
      description: 'No "skip to content" link near the top of the page.',
      recommendation: 'Add a skip-nav link as the first focusable element.' }));
  }

  // Document language
  if (!$('html').attr('lang')) {
    out.push(makeResult({ module: M, checkName: 'Missing document language',
      severity: SEV.WARNING, affectedUrl: page.url,
      description: 'No lang attribute on <html>.',
      recommendation: 'Add lang="..." for assistive technology and language targeting.' }));
  }

  return out;
}
