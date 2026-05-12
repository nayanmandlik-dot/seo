// Orchestrates a full audit:
//   1. Fetch robots.txt + sitemaps
//   2. Run the Playwright crawler (with progress emitting via SSE)
//   3. Run all 17 analyzer modules over the crawl results
//   4. Compute scores and persist the final report JSON
import { v4 as uuid } from 'uuid';
import * as cheerio from 'cheerio';
import { fetchRobots } from '../crawler/robots.js';
import { fetchAllSitemaps } from '../crawler/sitemap.js';
import { Crawler } from '../crawler/crawler.js';
import { saveReport } from './storage.js';
import { computeScores, topIssues } from './scoring.js';
import { emit } from '../api/sse.js';
import { normalizeUrl } from './helpers.js';

import * as crawlability from '../analyzers/crawlability.js';
import * as duplicates from '../analyzers/duplicates.js';
import { analyzeMeta } from '../analyzers/meta.js';
import { analyzeUrl, analyzeRedirects, analyzeStatusEdgeCases } from '../analyzers/urlStructure.js';
import { analyzePageStatus } from '../analyzers/httpStatus.js';
import { analyzeSpeed, analyzeResponseHeaders } from '../analyzers/speed.js';
import { analyzeMobile, analyzeContentParity } from '../analyzers/mobile.js';
import { analyzeTls, analyzeSecurityHeaders, analyzeMixedContent } from '../analyzers/security.js';
import { analyzeSchema, extractStructuredData } from '../analyzers/schema.js';
import { analyzeInternalLinking } from '../analyzers/internalLinking.js';
import { analyzeImages } from '../analyzers/images.js';
import { analyzeJsSeo, probeGooglebot } from '../analyzers/javascriptSeo.js';
import { analyzeHreflangPage, analyzeHreflangBidirectional } from '../analyzers/internationalSeo.js';
import { analyzeArchitecture } from '../analyzers/architecture.js';
import { analyzePageContent, analyzeCannibalization, analyzeTemplated } from '../analyzers/contentQuality.js';
import { analyzeExternalLinks } from '../analyzers/externalLinks.js';
import { analyzeAccessibility } from '../analyzers/accessibility.js';

const sessions = new Map(); // sessionId -> { status, crawler, report }

export function getSession(id) { return sessions.get(id); }

export async function startAudit(options) {
  const sessionId = options.sessionId || uuid();
  const startedAt = Date.now();
  const session = { sessionId, status: 'running', crawler: null, report: null };
  sessions.set(sessionId, session);

  emit(sessionId, 'status', { status: 'running', startedAt });

  // Run async without blocking the request
  (async () => {
    try {
      // 1. robots.txt
      emit(sessionId, 'log', { ts: Date.now(), msg: 'Fetching robots.txt' });
      const robots = await fetchRobots(options.rootUrl);

      // 2. sitemaps
      const sitemapSeeds = robots.sitemaps.length ? robots.sitemaps : [new URL('/sitemap.xml', options.rootUrl).toString()];
      emit(sessionId, 'log', { ts: Date.now(), msg: `Fetching ${sitemapSeeds.length} sitemap(s)` });
      const sitemapResult = await fetchAllSitemaps(sitemapSeeds);

      // 3. crawl
      const crawler = new Crawler({ ...options, sessionId, robots });
      session.crawler = crawler;
      const { pages } = await crawler.run();

      if (pages.size > 500) {
        emit(sessionId, 'log', { ts: Date.now(), msg: `Warning: site exceeds 500 pages (${pages.size}); continuing.` });
      }

      // Save a checkpoint after the crawl so a backend restart during analyzing
      // leaves *something* visible to the user instead of "report not found".
      saveReport(sessionId, {
        sessionId, rootUrl: options.rootUrl, status: 'analyzing',
        createdAt: startedAt,
        stats: { pagesCrawled: pages.size, pagesDiscovered: pages.size },
      });

      // 4. analyzers
      emit(sessionId, 'status', { status: 'analyzing' });

      // Wrap each analyzer call so one failure doesn't kill the whole audit.
      // Emits a log event so users see exactly which phase is running.
      const safe = async (name, fn) => {
        emit(sessionId, 'log', { ts: Date.now(), msg: `Analyzing: ${name}` });
        try {
          const t0 = Date.now();
          const result = await fn();
          const elapsed = Date.now() - t0;
          if (elapsed > 5000) {
            emit(sessionId, 'log', { ts: Date.now(), msg: `  ${name} took ${(elapsed / 1000).toFixed(1)}s` });
          }
          return result ?? [];
        } catch (e) {
          console.error(`[audit][${sessionId}] analyzer ${name} failed:`, e);
          emit(sessionId, 'log', { ts: Date.now(), msg: `  WARN ${name} failed: ${e.message}` });
          return [];
        }
      };

      const allResults = [];
      const pageIssueIndex = new Map(); // url -> [issues]

      // Site-wide analyzers (each wrapped so failures degrade gracefully)
      allResults.push(...await safe('robots',           () => crawlability.analyzeRobots(robots)));
      allResults.push(...await safe('sitemaps',         () => crawlability.analyzeSitemaps(sitemapResult, pages, robots)));
      allResults.push(...await safe('crawl traps',      () => crawlability.analyzeCrawlTraps(pages)));
      allResults.push(...await safe('crawl depth',      () => crawlability.analyzeCrawlDepth(pages)));
      allResults.push(...await safe('duplicate meta',   () => duplicates.analyzeDuplicateMeta(pages)));
      allResults.push(...await safe('near duplicates',  () => duplicates.analyzeNearDuplicates(pages)));
      allResults.push(...await safe('URL variants',     () => duplicates.analyzeUrlVariants(pages)));
      allResults.push(...await safe('host variants',    () => duplicates.analyzeHostVariants(options.rootUrl)));
      allResults.push(...await safe('cannibalization',  () => analyzeCannibalization(pages)));
      allResults.push(...await safe('templated',        () => analyzeTemplated(pages)));
      allResults.push(...await safe('hreflang sitewide',() => analyzeHreflangBidirectional(pages)));

      const tlsRaw = await safe('TLS', () => analyzeTls(options.rootUrl));
      const tlsRes = Array.isArray(tlsRaw) ? { issues: [], tlsInfo: null } : tlsRaw;
      allResults.push(...(tlsRes.issues || []));

      // Per-page analyzers
      const pageMeta = {}; // url -> { wordCount, schemaTypes, ... }
      let i = 0;
      for (const [url, page] of pages) {
        i++;
        emit(sessionId, 'progress', { phase: 'analyze', pagesAnalyzed: i, totalPages: pages.size });
        const localIssues = [];
        localIssues.push(...crawlability.analyzePageIndexation(page));
        localIssues.push(...duplicates.analyzeCanonical(page, pages));
        localIssues.push(...analyzeMeta(page));
        localIssues.push(...analyzeUrl(page));
        localIssues.push(...analyzeRedirects(page));
        localIssues.push(...analyzeStatusEdgeCases(page));
        localIssues.push(...analyzePageStatus(page, pages));
        localIssues.push(...analyzeResponseHeaders(page));
        localIssues.push(...analyzeMobile(page));
        localIssues.push(...analyzeSecurityHeaders(page));
        localIssues.push(...analyzeMixedContent(page));
        const schemaRes = analyzeSchema(page);
        localIssues.push(...schemaRes.issues);
        localIssues.push(...analyzeImages(page));
        localIssues.push(...analyzeJsSeo(page));
        const hreflangRes = analyzeHreflangPage(page);
        localIssues.push(...hreflangRes.issues);
        const contentRes = analyzePageContent(page);
        localIssues.push(...(contentRes.issues || []));
        localIssues.push(...analyzeAccessibility(page));

        pageMeta[url] = {
          status: page.status,
          depth: page.depth,
          responseTimeMs: page.responseTimeMs,
          wordCount: contentRes.wordCount || 0,
          schemaTypes: schemaRes.types || [],
          schemaBlocks: schemaRes.blocks || 0,
          hreflang: hreflangRes.tags || [],
          title: titleOf(page),
        };

        pageIssueIndex.set(url, localIssues);
        allResults.push(...localIssues);
      }

      // Internal linking + architecture (need full page graph)
      const linkingRes = analyzeInternalLinking(pages, sitemapResult.allUrls.map(x => x.loc));
      allResults.push(...linkingRes.issues);
      const archRes = analyzeArchitecture(pages, linkingRes);
      allResults.push(...archRes.issues);

      // External links (HEAD all unique externals)
      emit(sessionId, 'log', { ts: Date.now(), msg: 'Probing external links' });
      const extRes = await analyzeExternalLinks(pages);
      allResults.push(...extRes.issues);

      // Page Speed (PSI) — only if API key configured.
      // Run in parallel batches: serial took ~30s per page × N pages, which
      // exceeded Render free-tier wall-clock + memory limits.
      const apiKey = options.pageSpeedApiKey || process.env.PAGESPEED_API_KEY;
      const speedReports = {};
      if (apiKey) {
        const sampleSize = options.pageSpeedSampleSize || 5; // was 10 — too slow on free tier
        const top = [...pages.keys()].slice(0, sampleSize);
        emit(sessionId, 'log', { ts: Date.now(), msg: `Running PageSpeed Insights on ${top.length} pages (parallel, 3 at a time)` });
        const PSI_CONCURRENCY = 3;
        let done = 0;
        for (let i = 0; i < top.length; i += PSI_CONCURRENCY) {
          const batch = top.slice(i, i + PSI_CONCURRENCY);
          const results = await Promise.all(batch.map(url =>
            analyzeSpeed(url, apiKey).catch(e => {
              console.error(`[audit][${sessionId}] PSI failed for ${url}:`, e.message);
              return { issues: [], speedReport: null };
            })
          ));
          batch.forEach((url, j) => {
            const r = results[j];
            if (r?.issues) allResults.push(...r.issues);
            speedReports[url] = r?.speedReport ?? null;
            done++;
          });
          emit(sessionId, 'log', { ts: Date.now(), msg: `  PSI progress: ${done}/${top.length}` });
        }
      } else {
        emit(sessionId, 'log', { ts: Date.now(), msg: 'No PAGESPEED_API_KEY; skipping CWV checks' });
      }

      // Googlebot probe (homepage only)
      allResults.push(...await safe('Googlebot probe', () => probeGooglebot(options.rootUrl)));

      // 5. scores
      const scores = computeScores(allResults, pages);
      const completedAt = Date.now();

      // Convert pages map to JSON-friendly structure
      const pageList = [];
      for (const [url, p] of pages) {
        const issues = pageIssueIndex.get(url) || [];
        pageList.push({
          url, finalUrl: p.finalUrl, depth: p.depth, fromUrl: p.fromUrl,
          status: p.status, responseTimeMs: p.responseTimeMs,
          redirectChain: p.redirectChain,
          inboundCount: linkingRes.inbound.get(url)?.size || 0,
          outboundCount: linkingRes.outbound.get(url)?.size || 0,
          rank: linkingRes.ranks.get(url) || 0,
          internalLinks: p.internalLinks?.map(l => ({ href: l.href, text: l.text, rel: l.rel })) || [],
          externalLinks: p.externalLinks?.map(l => ({ href: l.href, text: l.text, rel: l.rel, target: l.target })) || [],
          images: p.images || [],
          consoleErrors: p.consoleErrors || [],
          headers: p.headers || {},
          ...pageMeta[url],
          score: scores.perPage[url]?.score ?? 100,
          issueCount: issues.length,
          issues,
        });
      }

      const report = {
        sessionId,
        rootUrl: options.rootUrl,
        config: { ...options, pageSpeedApiKey: apiKey ? '***' : null },
        createdAt: startedAt,
        completedAt,
        status: 'complete',
        stats: {
          pagesCrawled: pages.size,
          pagesDiscovered: sessions.get(sessionId)?.crawler?.discovered.size || pages.size,
          issuesFound: allResults.length,
          severity: countSeverity(allResults),
          avgResponseTimeMs: pageList.length ? Math.round(pageList.reduce((s, p) => s + (p.responseTimeMs || 0), 0) / pageList.length) : 0,
          totalTimeMs: completedAt - startedAt,
          pagesPerMinute: pages.size / Math.max(1, (completedAt - startedAt) / 60000),
        },
        scores,
        topIssues: topIssues(allResults, 10),
        results: allResults,
        pages: pageList,
        robots,
        sitemap: sitemapResult,
        tls: tlsRes.tlsInfo,
        architecture: archRes.summary,
        externalLinkStatuses: Object.fromEntries(extRes.statusByHref),
        speedReports,
        linkGraph: buildGraph(pages, linkingRes),
      };
      session.report = report;
      session.status = 'complete';
      saveReport(sessionId, report);

      emit(sessionId, 'complete', { sessionId, score: scores.overall, issuesFound: allResults.length });
    } catch (e) {
      console.error('[audit]', e);
      session.status = 'error';
      emit(sessionId, 'error', { message: e.message, stack: e.stack });
      saveReport(sessionId, { sessionId, status: 'error', error: e.message, createdAt: startedAt });
    }
  })();

  return { sessionId };
}

export function cancelAudit(sessionId) {
  const s = sessions.get(sessionId);
  if (s?.crawler) s.crawler.cancel();
  if (s) s.status = 'cancelled';
  emit(sessionId, 'status', { status: 'cancelled' });
}

function titleOf(page) {
  try {
    const $ = cheerio.load(page.renderedHtml || '');
    return $('title').first().text().trim();
  } catch { return ''; }
}

function countSeverity(results) {
  return results.reduce((acc, r) => {
    acc[r.severity] = (acc[r.severity] || 0) + 1; return acc;
  }, { critical: 0, warning: 0, info: 0 });
}

function buildGraph(pages, linkingRes) {
  const nodes = [];
  const links = [];
  for (const [url, p] of pages) {
    nodes.push({
      id: url,
      depth: p.depth,
      status: p.status,
      inbound: linkingRes.inbound.get(url)?.size || 0,
      outbound: linkingRes.outbound.get(url)?.size || 0,
      rank: linkingRes.ranks.get(url) || 0,
    });
  }
  for (const [u, set] of linkingRes.outbound) {
    for (const v of set) links.push({ source: u, target: v });
  }
  return { nodes, links };
}
