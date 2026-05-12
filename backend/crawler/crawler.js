// Recursive Playwright crawler.
// For each URL: opens a Playwright page (full JS render), captures rendered HTML,
// fetches raw HTML over HTTP, records response timing, redirect chain, status,
// extracts links, and resolves images for downstream analyzers.
import { chromium } from 'playwright';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'node:url';
import { sameRegistrableDomain, normalizeUrl, getHostname, sleep } from '../utils/helpers.js';
import { isAllowed } from './robots.js';
import { emit } from '../api/sse.js';

export const USER_AGENTS = {
  googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  custom: process.env.DEFAULT_USER_AGENT || 'SEOAuditBot/1.0',
};

const SPEED_DELAY = { polite: 1000, normal: 333, fast: 100 };

export class Crawler {
  constructor(options) {
    this.rootUrl = normalizeUrl(options.rootUrl);
    this.rootHost = getHostname(this.rootUrl);
    this.maxPages = options.maxPages || null; // null = unlimited
    this.crawlSpeed = options.crawlSpeed || 'normal';
    this.includePatterns = (options.includePatterns || []).map(p => new RegExp(p));
    this.excludePatterns = (options.excludePatterns || []).map(p => new RegExp(p));
    this.userAgent = USER_AGENTS[options.userAgent] || options.userAgent || USER_AGENTS.chrome;
    this.crawlSubdomains = !!options.crawlSubdomains;
    this.respectRobots = options.respectRobots !== false;
    this.maxDepth = options.maxDepth || null;
    this.concurrency = Number(process.env.MAX_CONCURRENT_PAGES || 5);
    this.robots = options.robots || null;
    this.sessionId = options.sessionId;
    this.cancelled = false;

    this.queue = []; // [{ url, depth, fromUrl }]
    this.discovered = new Map(); // url -> { depth, inboundFrom: Set }
    this.pages = new Map(); // url -> page record
    this.processing = 0;
    this.crawlDelayMs = SPEED_DELAY[this.crawlSpeed] ?? SPEED_DELAY.normal;
    if (this.respectRobots && this.robots?.rules?.['*']?.crawlDelay) {
      this.crawlDelayMs = Math.max(this.crawlDelayMs, this.robots.rules['*'].crawlDelay * 1000);
    }
    this.startedAt = 0;
    this.browser = null;
    this.log = [];
  }

  inScope(url) {
    const host = getHostname(url);
    if (!host) return false;
    if (this.crawlSubdomains) {
      if (!sameRegistrableDomain(this.rootUrl, url)) return false;
    } else {
      if (host !== this.rootHost) return false;
    }
    if (this.includePatterns.length && !this.includePatterns.some(r => r.test(url))) return false;
    if (this.excludePatterns.some(r => r.test(url))) return false;
    if (this.respectRobots && this.robots) {
      try {
        const u = new URL(url);
        if (!isAllowed(this.robots, u.pathname + u.search, this.userAgent)) return false;
      } catch { /* ignore */ }
    }
    return true;
  }

  enqueue(url, depth, fromUrl) {
    const norm = normalizeUrl(url);
    if (!norm) return;
    const known = this.discovered.get(norm);
    if (known) {
      if (fromUrl) known.inboundFrom.add(fromUrl);
      return;
    }
    if (this.maxDepth != null && depth > this.maxDepth) return;
    if (!this.inScope(norm)) return;
    this.discovered.set(norm, { depth, inboundFrom: new Set(fromUrl ? [fromUrl] : []) });
    this.queue.push({ url: norm, depth, fromUrl });
  }

  pushLog(msg) {
    const entry = { ts: Date.now(), msg };
    this.log.push(entry);
    if (this.log.length > 200) this.log.shift();
    emit(this.sessionId, 'log', entry);
  }

  emitProgress() {
    emit(this.sessionId, 'progress', {
      pagesCrawled: this.pages.size,
      pagesDiscovered: this.discovered.size,
      queueRemaining: this.queue.length,
      issuesFound: 0,
      elapsedMs: Date.now() - this.startedAt,
    });
  }

  cancel() { this.cancelled = true; }

  async run(onPage) {
    this.startedAt = Date.now();
    this.browser = await chromium.launch({ headless: true });
    try {
      this.enqueue(this.rootUrl, 0, null);
      this.pushLog(`Starting crawl of ${this.rootUrl}`);

      // worker pool
      const workers = Array.from({ length: this.concurrency }, () => this.worker(onPage));
      await Promise.all(workers);

      this.pushLog(`Crawl complete: ${this.pages.size} pages crawled`);
      return { pages: this.pages, discovered: this.discovered };
    } finally {
      await this.browser.close().catch(() => {});
    }
  }

  async worker(onPage) {
    while (!this.cancelled) {
      const next = this.queue.shift();
      if (!next) {
        // queue might be empty but other workers in flight
        if (this.processing === 0) return;
        await sleep(50);
        continue;
      }
      if (this.maxPages && this.pages.size >= this.maxPages) {
        this.pushLog(`Reached max pages (${this.maxPages}); stopping`);
        return;
      }
      this.processing++;
      try {
        const rec = await this.fetchWithRetry(next.url, next.depth, next.fromUrl);
        if (rec) {
          this.pages.set(next.url, rec);
          if (onPage) await onPage(rec, this);
          // discover further links
          for (const link of rec.internalLinks) this.enqueue(link.href, next.depth + 1, next.url);
          this.emitProgress();
        }
      } catch (e) {
        this.pushLog(`ERROR ${next.url}: ${e.message}`);
      } finally {
        this.processing--;
        if (this.crawlDelayMs) await sleep(this.crawlDelayMs);
      }
    }
  }

  async fetchWithRetry(url, depth, fromUrl) {
    let lastErr = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const rec = await this.fetchOne(url, depth, fromUrl);
        return rec;
      } catch (e) {
        lastErr = e;
        this.pushLog(`Retry ${attempt + 1} for ${url}: ${e.message}`);
        await sleep(500 * (attempt + 1));
      }
    }
    return {
      url, depth, fromUrl,
      status: 0, error: lastErr ? lastErr.message : 'failed',
      internalLinks: [], externalLinks: [], images: [],
      renderedHtml: '', rawHtml: '', headers: {}, redirectChain: [], responseTimeMs: 0,
      consoleErrors: [], blockedResources: [], jsErrors: [],
    };
  }

  async fetchOne(url, depth, fromUrl) {
    this.pushLog(`Crawling ${url}`);

    // 1. raw HTTP fetch (no JS) - used for JS-SEO comparison & header inspection
    let rawRes;
    const t0 = Date.now();
    try {
      rawRes = await axios.get(url, {
        timeout: 30000,
        validateStatus: () => true,
        maxRedirects: 0,
        headers: { 'User-Agent': this.userAgent, 'Accept': 'text/html,application/xhtml+xml' },
        responseType: 'text',
      });
    } catch (e) {
      rawRes = { status: 0, headers: {}, data: '', request: {} };
    }
    const responseTimeMs = Date.now() - t0;

    // follow redirects manually so we capture the chain
    const redirectChain = [];
    let current = { url, status: rawRes.status, headers: rawRes.headers || {} };
    let body = rawRes.data || '';
    let hops = 0;
    while ([301, 302, 303, 307, 308].includes(current.status) && current.headers.location && hops < 10) {
      const next = new URL(current.headers.location, current.url).toString();
      redirectChain.push({ from: current.url, to: next, status: current.status });
      try {
        const r = await axios.get(next, {
          timeout: 30000,
          validateStatus: () => true,
          maxRedirects: 0,
          headers: { 'User-Agent': this.userAgent, 'Accept': 'text/html,application/xhtml+xml' },
          responseType: 'text',
        });
        current = { url: next, status: r.status, headers: r.headers || {} };
        body = r.data || '';
        hops++;
      } catch (e) { break; }
    }

    // 2. Playwright render
    const context = await this.browser.newContext({
      userAgent: this.userAgent,
      viewport: { width: 1280, height: 800 },
      ignoreHTTPSErrors: false,
    });
    const page = await context.newPage();

    const consoleErrors = [];
    const jsErrors = [];
    const blockedResources = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', err => jsErrors.push(err.message));
    page.on('response', r => {
      if (r.status() === 403) blockedResources.push({ url: r.url(), status: 403 });
    });

    let renderedHtml = '';
    let finalUrl = url;
    let pwStatus = 0;
    try {
      const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
      pwStatus = resp ? resp.status() : 0;
      finalUrl = page.url();
      renderedHtml = await page.content();
    } catch (e) {
      this.pushLog(`Playwright nav error ${url}: ${e.message}`);
    }

    // Extract links and assets from rendered DOM (matches what crawlers see)
    const $ = cheerio.load(renderedHtml || body);
    const internalLinks = [];
    const externalLinks = [];
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      const abs = (() => { try { return new URL(href, finalUrl || url).toString(); } catch { return null; } })();
      if (!abs) return;
      const rel = $(el).attr('rel') || '';
      const target = $(el).attr('target') || '';
      const text = $(el).text().trim().slice(0, 200);
      const sameSite = sameRegistrableDomain(this.rootUrl, abs) && (this.crawlSubdomains || getHostname(abs) === this.rootHost);
      const linkRec = { href: abs, rel, target, text, raw: href };
      if (sameSite) internalLinks.push(linkRec); else externalLinks.push(linkRec);
    });

    const images = [];
    $('img').each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      if (!src) return;
      const abs = (() => { try { return new URL(src, finalUrl || url).toString(); } catch { return null; } })();
      images.push({
        src: abs || src,
        alt: $(el).attr('alt') ?? null,
        width: $(el).attr('width') || null,
        height: $(el).attr('height') || null,
        loading: $(el).attr('loading') || null,
        fetchpriority: $(el).attr('fetchpriority') || null,
        renderedWidth: null,
        renderedHeight: null,
      });
    });

    // measure rendered image sizes
    try {
      const imgSizes = await page.$$eval('img', els => els.map(e => ({
        src: e.currentSrc || e.src,
        rw: e.getBoundingClientRect().width,
        rh: e.getBoundingClientRect().height,
        natW: e.naturalWidth,
        natH: e.naturalHeight,
      })));
      for (const i of images) {
        const m = imgSizes.find(x => x.src === i.src);
        if (m) { i.renderedWidth = Math.round(m.rw); i.renderedHeight = Math.round(m.rh); i.naturalWidth = m.natW; i.naturalHeight = m.natH; }
      }
    } catch { /* ignore */ }

    await page.close().catch(() => {});
    await context.close().catch(() => {});

    return {
      url,
      finalUrl,
      depth,
      fromUrl,
      status: current.status || pwStatus,
      pwStatus,
      headers: current.headers || {},
      redirectChain,
      responseTimeMs,
      rawHtml: body || '',
      renderedHtml,
      internalLinks,
      externalLinks,
      images,
      consoleErrors,
      jsErrors,
      blockedResources,
      error: null,
    };
  }
}
