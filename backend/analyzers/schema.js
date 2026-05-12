// Module 9 — Structured Data / Schema
// Why these checks matter:
// - Schema.org markup unlocks rich results (stars, FAQ accordions, recipe cards, etc.) which boost CTR.
// - Wrong @type or missing required fields means Google ignores the block and you lose the rich result.
// - Schema describing content not visible on the page violates Google's quality guidelines and risks manual action.
import * as cheerio from 'cheerio';
import { makeResult, SEV } from '../utils/result.js';

const M = 'Schema';

// Per-type required and recommended fields, as documented by Google's rich-result guidelines.
const SCHEMA_RULES = {
  Product: { required: ['name', 'offers'], offerRequired: ['price', 'priceCurrency', 'availability'], recommended: ['aggregateRating', 'image', 'description'] },
  Article: { required: ['headline', 'author', 'datePublished'], recommended: ['dateModified', 'image', 'publisher'] },
  NewsArticle: { required: ['headline', 'author', 'datePublished'], recommended: ['dateModified', 'image', 'publisher'] },
  BlogPosting: { required: ['headline', 'author', 'datePublished'], recommended: ['dateModified', 'image', 'publisher'] },
  FAQPage: { required: ['mainEntity'], minQuestions: 2 },
  BreadcrumbList: { required: ['itemListElement'] },
  LocalBusiness: { required: ['name', 'address', 'telephone'], addressRequired: ['streetAddress', 'addressLocality', 'postalCode'], recommended: ['openingHours', 'priceRange'] },
  Event: { required: ['name', 'startDate', 'location'], recommended: ['organizer', 'endDate'] },
  Recipe: { required: ['name', 'image', 'recipeIngredient', 'recipeInstructions'], recommended: ['cookTime', 'nutrition'] },
  JobPosting: { required: ['title', 'description', 'datePosted', 'hiringOrganization', 'jobLocation'] },
  Review: { required: ['reviewRating', 'author'] },
  AggregateRating: { required: ['ratingValue', 'reviewCount'], recommended: ['bestRating'] },
  VideoObject: { required: ['name', 'description', 'thumbnailUrl', 'uploadDate'], recommended: ['duration'] },
  SoftwareApplication: { required: ['name', 'operatingSystem', 'applicationCategory'], recommended: ['offers'] },
};

export function extractStructuredData(html) {
  const $ = cheerio.load(html || '');
  const blocks = [];
  // JSON-LD
  $('script[type="application/ld+json"]').each((_, el) => {
    const txt = $(el).contents().text();
    try {
      const parsed = JSON.parse(txt);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of arr) blocks.push({ format: 'json-ld', data: item, raw: txt });
    } catch (e) {
      blocks.push({ format: 'json-ld', error: e.message, raw: txt });
    }
  });
  // Microdata
  $('[itemscope]').each((_, el) => {
    const type = $(el).attr('itemtype') || '';
    if (type) blocks.push({ format: 'microdata', data: { '@type': type.split('/').pop() }, raw: '' });
  });
  // RDFa
  $('[typeof]').each((_, el) => {
    const type = $(el).attr('typeof') || '';
    blocks.push({ format: 'rdfa', data: { '@type': type }, raw: '' });
  });
  return blocks;
}

function flatten(node, items = []) {
  if (!node) return items;
  if (Array.isArray(node)) { for (const n of node) flatten(n, items); return items; }
  if (typeof node !== 'object') return items;
  if (node['@type']) items.push(node);
  if (node['@graph']) for (const n of node['@graph']) flatten(n, items);
  return items;
}

function get(obj, key) { return obj?.[key] ?? null; }
function present(v) { return v !== null && v !== undefined && v !== ''; }

export function analyzeSchema(page) {
  const out = [];
  const blocks = extractStructuredData(page.renderedHtml || page.rawHtml || '');
  const types = new Set();
  let parseError = false;

  for (const b of blocks) {
    if (b.error) {
      parseError = true;
      out.push(makeResult({ module: M, checkName: 'JSON-LD parse error',
        severity: SEV.CRITICAL, affectedUrl: page.url,
        description: `Could not parse JSON-LD block: ${b.error}`,
        recommendation: 'Fix JSON syntax — the block will be ignored by Google.', value: b.raw?.slice(0, 200) }));
      continue;
    }
    if (b.format !== 'json-ld') {
      types.add(b.data['@type']);
      continue;
    }
    const items = flatten(b.data);
    if (b.data['@context'] && !/schema\.org/i.test(JSON.stringify(b.data['@context']))) {
      out.push(makeResult({ module: M, checkName: 'Schema @context not Schema.org',
        severity: SEV.WARNING, affectedUrl: page.url,
        description: `@context = ${JSON.stringify(b.data['@context'])}`,
        recommendation: 'Use "@context": "https://schema.org".' }));
    }
    for (const item of items) {
      const type = Array.isArray(item['@type']) ? item['@type'][0] : item['@type'];
      if (!type) continue;
      types.add(type);
      const rules = SCHEMA_RULES[type];
      if (!rules) continue;

      for (const f of rules.required || []) {
        if (!present(get(item, f))) {
          out.push(makeResult({ module: M, checkName: `${type} missing required: ${f}`,
            severity: SEV.WARNING, affectedUrl: page.url,
            description: `${type} schema missing required field "${f}".`,
            recommendation: 'Add the field to qualify for rich results.', value: f }));
        }
      }
      for (const f of rules.recommended || []) {
        if (!present(get(item, f))) {
          out.push(makeResult({ module: M, checkName: `${type} missing recommended: ${f}`,
            severity: SEV.INFO, affectedUrl: page.url,
            description: `${type} schema missing recommended field "${f}".`,
            recommendation: `Add "${f}" — rich results display better with it.`, value: f }));
        }
      }
      // Nested validations
      if (type === 'Product' && item.offers) {
        const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
        for (const f of rules.offerRequired || []) {
          if (!present(get(offer, f))) {
            out.push(makeResult({ module: M, checkName: `Product offers missing ${f}`,
              severity: SEV.WARNING, affectedUrl: page.url,
              description: `Product/offers missing "${f}".`,
              recommendation: 'Required for product rich result eligibility.', value: f }));
          }
        }
      }
      if (type === 'LocalBusiness' && item.address) {
        const addr = item.address;
        for (const f of rules.addressRequired || []) {
          if (!present(get(addr, f))) {
            out.push(makeResult({ module: M, checkName: `LocalBusiness address missing ${f}`,
              severity: SEV.WARNING, affectedUrl: page.url,
              description: `address missing "${f}".`,
              recommendation: 'Postal address fields required for local rich result.', value: f }));
          }
        }
      }
      if (type === 'FAQPage') {
        const main = Array.isArray(item.mainEntity) ? item.mainEntity : (item.mainEntity ? [item.mainEntity] : []);
        if (main.length < 2) {
          out.push(makeResult({ module: M, checkName: 'FAQPage with fewer than 2 questions',
            severity: SEV.WARNING, affectedUrl: page.url,
            description: `FAQPage has ${main.length} Question entries.`,
            recommendation: 'Provide at least 2 Question + acceptedAnswer pairs.', value: main.length }));
        }
        for (const q of main) {
          if (!q.acceptedAnswer || !q.name) {
            out.push(makeResult({ module: M, checkName: 'FAQ Question incomplete',
              severity: SEV.WARNING, affectedUrl: page.url,
              description: 'A Question is missing name or acceptedAnswer.',
              recommendation: 'Each Question needs both name and acceptedAnswer.', value: q }));
            break;
          }
        }
      }
      if (type === 'BreadcrumbList' && Array.isArray(item.itemListElement)) {
        for (let i = 0; i < item.itemListElement.length; i++) {
          const el = item.itemListElement[i];
          if (el.position !== i + 1 && el.position !== String(i + 1)) {
            out.push(makeResult({ module: M, checkName: 'BreadcrumbList non-sequential position',
              severity: SEV.WARNING, affectedUrl: page.url,
              description: `Position ${el.position} at index ${i}.`,
              recommendation: 'Use sequential positions starting at 1.' }));
            break;
          }
        }
      }
    }
  }
  // Rich-result opportunity hints
  const $ = cheerio.load(page.renderedHtml || '');
  const hasProductCues = $('[itemtype*="Product"]').length || /\$\d+|price/i.test($.text().slice(0, 5000));
  if (hasProductCues && !types.has('Product')) {
    out.push(makeResult({ module: M, checkName: 'Possible Product page without Product schema',
      severity: SEV.INFO, affectedUrl: page.url,
      description: 'Page looks like a product page but no Product schema detected.',
      recommendation: 'Add Product JSON-LD to qualify for product rich results.' }));
  }
  if (page.url && /\/(blog|news|article)\//i.test(page.url) && !types.has('Article') && !types.has('NewsArticle') && !types.has('BlogPosting')) {
    out.push(makeResult({ module: M, checkName: 'Possible Article page without schema',
      severity: SEV.INFO, affectedUrl: page.url,
      description: 'URL looks like an article but no Article schema detected.',
      recommendation: 'Add Article/NewsArticle/BlogPosting JSON-LD.' }));
  }
  return { issues: out, types: [...types], blocks: blocks.length, parseError };
}
