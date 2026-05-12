// Module 11 — Images
// Why these checks matter:
// - Alt text gives search engines a textual representation of images and is also an accessibility requirement.
// - Width/height attributes prevent layout shift (CLS).
// - Oversized images are the #1 cause of slow LCP on image-heavy pages.
// - Modern formats (WebP/AVIF) cut image bytes by 25–50%.
// - fetchpriority="high" on the LCP image meaningfully improves LCP on Chrome.
import * as cheerio from 'cheerio';
import { makeResult, SEV } from '../utils/result.js';

const M = 'Images';

const NEXT_GEN_EXT = /\.(webp|avif)(\?|$)/i;
const LEGACY_EXT = /\.(jpg|jpeg|png|gif)(\?|$)/i;

export function analyzeImages(page) {
  const out = [];
  if (!Array.isArray(page.images) || page.images.length === 0) return out;
  const $ = cheerio.load(page.renderedHtml || page.rawHtml || '');

  // Identify likely LCP image (first large in-viewport <img>)
  let lcpImage = null;
  for (const img of page.images) {
    if ((img.renderedWidth || 0) >= 300 && (img.renderedHeight || 0) >= 200) { lcpImage = img; break; }
  }

  for (const img of page.images) {
    if (img.alt === null) {
      out.push(makeResult({ module: M, checkName: 'Missing alt attribute',
        severity: SEV.WARNING, affectedUrl: page.url,
        description: `<img src="${img.src}"> has no alt attribute`,
        recommendation: 'Add alt text describing the image; use alt="" only for decorative images.', value: img.src }));
    } else if (img.alt === '' && (img.renderedWidth || 0) > 100) {
      out.push(makeResult({ module: M, checkName: 'Empty alt on content image',
        severity: SEV.WARNING, affectedUrl: page.url,
        description: `Image at ${img.src} has empty alt but appears to be content-bearing.`,
        recommendation: 'If decorative, keep empty alt; otherwise add descriptive alt text.', value: img.src }));
    } else if (img.alt && img.alt.length > 125) {
      out.push(makeResult({ module: M, checkName: 'Alt text too long',
        severity: SEV.INFO, affectedUrl: page.url,
        description: `Alt text is ${img.alt.length} chars.`,
        recommendation: 'Keep alt text under 125 chars.', value: img.alt }));
    }

    if (!img.width || !img.height) {
      out.push(makeResult({ module: M, checkName: 'Image missing width/height',
        severity: SEV.INFO, affectedUrl: page.url,
        description: `${img.src} has no explicit width/height — causes layout shift.`,
        recommendation: 'Set width and height attributes (or CSS aspect-ratio) to prevent CLS.', value: img.src }));
    }

    // oversized: natural dimensions much greater than rendered
    if (img.naturalWidth && img.renderedWidth && img.naturalWidth > img.renderedWidth * 2) {
      out.push(makeResult({ module: M, checkName: 'Oversized image',
        severity: SEV.WARNING, affectedUrl: page.url,
        description: `${img.src}: natural ${img.naturalWidth}px vs rendered ${img.renderedWidth}px`,
        recommendation: 'Serve correctly-sized images using srcset and sizes.', value: img }));
    }

    if (LEGACY_EXT.test(img.src) && !NEXT_GEN_EXT.test(img.src)) {
      out.push(makeResult({ module: M, checkName: 'Non next-gen image format',
        severity: SEV.INFO, affectedUrl: page.url,
        description: `${img.src} is JPEG/PNG/GIF.`,
        recommendation: 'Serve WebP or AVIF for ~30% smaller payloads.', value: img.src }));
    }

    if (img.loading !== 'lazy' && img !== lcpImage && (img.renderedWidth || 0) > 100) {
      out.push(makeResult({ module: M, checkName: 'Below-fold image without lazy-loading',
        severity: SEV.INFO, affectedUrl: page.url,
        description: `${img.src} has no loading="lazy"`,
        recommendation: 'Add loading="lazy" to images below the fold.', value: img.src }));
    }
    if (/^http:\/\//i.test(img.src) && /^https:/.test(page.finalUrl || page.url)) {
      out.push(makeResult({ module: M, checkName: 'Mixed content image',
        severity: SEV.WARNING, affectedUrl: page.url,
        description: `Image loaded over HTTP on HTTPS page: ${img.src}`,
        recommendation: 'Serve images over HTTPS.', value: img.src }));
    }
  }

  if (lcpImage && lcpImage.fetchpriority !== 'high') {
    out.push(makeResult({ module: M, checkName: 'LCP image missing fetchpriority="high"',
      severity: SEV.INFO, affectedUrl: page.url,
      description: `Likely LCP image ${lcpImage.src} could load earlier with fetchpriority="high".`,
      recommendation: 'Add fetchpriority="high" to the LCP image to improve LCP.', value: lcpImage.src }));
  }

  return out;
}
