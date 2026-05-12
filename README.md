# Technical SEO Audit Tool

A production-grade web application that crawls a website end-to-end and produces a full technical SEO audit covering 17 modules: crawlability, duplicates, on-page meta, URL structure, HTTP status, page speed (Core Web Vitals via Google PSI), mobile-friendliness, security, structured data, internal linking, images, JavaScript SEO, international SEO, site architecture, content quality, external links, and accessibility.

## Stack

- **Backend:** Node.js + Express
- **Crawler:** Playwright (full JS rendering) + Cheerio (raw-HTML parsing for JS-SEO comparison)
- **Queue:** Bull + Redis
- **Frontend:** React + Vite + Tailwind CSS + D3.js
- **Live updates:** Server-Sent Events
- **Reports:** JSON files on disk (one per session)
- **Exports:** Puppeteer (PDF), CSV, JSON
- **APIs:** Google PageSpeed Insights, Google Safe Browsing

## Project layout

```
/seo-audit-tool
  /backend
    /crawler        Playwright crawler, link extractor, queue
    /analyzers      One file per module
    /api            Express routes + SSE
    /utils          Scoring engine, storage, report builder, PDF
  /frontend
    /src
      /components   Dashboard, charts, tables, gauges, link graph
      /pages        Overview, Issues, Pages, Speed, Schema, etc.
      /hooks        SSE hook, audit state
  /reports          Saved audit JSON files
  /exports          Generated PDFs and CSVs
```

## Setup

### 1. Prerequisites

- Node.js 18+
- Redis (locally on `127.0.0.1:6379`, or via Docker: `docker run -p 6379:6379 redis`)
- A free Google PageSpeed Insights API key

### 2. Install

```bash
# from project root
npm install
# install Playwright browsers (one-time)
npx playwright install chromium
```

### 3. Configure

```bash
cp .env.example .env
# edit .env and add your PAGESPEED_API_KEY
```

#### How to get a PageSpeed Insights API key

1. Visit https://developers.google.com/speed/docs/insights/v5/get-started
2. Click "Get a key" → choose or create a Google Cloud project
3. Copy the generated key into `.env` as `PAGESPEED_API_KEY=...`
4. (Optional) Enable the **PageSpeed Insights API** in the Google Cloud console for higher quotas

#### How to get a Safe Browsing API key (optional)

1. Visit https://developers.google.com/safe-browsing/v4/get-started
2. Enable the **Safe Browsing API** in your Google Cloud project
3. Add the generated key to `.env` as `SAFE_BROWSING_API_KEY=...`

### 4. Run

```bash
# start Redis (if using Docker)
docker run -d -p 6379:6379 --name seo-audit-redis redis

# run both servers in dev mode
npm run dev
```

- Backend: http://localhost:4000
- Frontend: http://localhost:5173

## Usage

1. Open the frontend in your browser
2. Paste a website URL (e.g. `https://example.com`)
3. (Optional) open the **Settings** panel to configure crawl speed, max pages, user-agent, include/exclude regex, subdomain crawling, robots.txt respect
4. Click **Start Audit**
5. Watch the live progress bar, log feed, and stats while the audit runs
6. When the audit completes, the dashboard auto-opens with full results across all tabs

### Past audits

Every audit is persisted to `/reports/<session-id>.json`. The homepage shows a list of past audits and lets you re-open or compare two audits side-by-side (new issues / fixed issues / score change).

### Exports

From the **Export** tab:
- Full report → PDF (formatted, print-ready)
- Executive summary → short PDF
- Issues → CSV
- Raw report → JSON

## Modules covered

| # | Module | What it checks |
|---|--------|----------------|
| 1 | Crawlability & Indexation | robots.txt, sitemaps, noindex, crawl traps, depth |
| 2 | Duplicate Content | canonicals, dup titles/desc, near-dup, www/https variants |
| 3 | On-Page Meta | title, meta desc, H1, headings, OG, Twitter, charset, favicon |
| 4 | URL Structure | length, casing, special chars, redirect chains/loops, depth |
| 5 | HTTP Status | 4xx/5xx, soft 404s, blocked resources, response times |
| 6 | Page Speed / CWV | Google PSI mobile + desktop, render-blocking, compression |
| 7 | Mobile-Friendliness | viewport, font size, tap target, parity |
| 8 | Security & HTTPS | SSL, HSTS, mixed content, security headers, TLS version |
| 9 | Structured Data | JSON-LD/Microdata/RDFa, schema validation, rich result eligibility |
| 10 | Internal Linking | broken, orphans, anchor analysis, simple PageRank |
| 11 | Images | alt, dimensions, oversized, formats, lazy loading, LCP fetchpriority |
| 12 | JavaScript SEO | rendered vs raw HTML, console errors, Googlebot UA, hash routing |
| 13 | International SEO | hreflang validation, x-default, bidirectional pairing |
| 14 | Site Architecture | depth, hubs, authority pages, breadcrumbs, faceted nav |
| 15 | Content Quality | thin content, freshness, cannibalization, templated content |
| 16 | External Links | broken, HTTPS, rel attrs, target=_blank safety |
| 17 | Accessibility (SEO) | alt text, labels, landmarks, link text, language |

## Scoring

- Per-page, per-module, and overall site scores (0–100)
- Severity weights: Critical (−10 to −20), Warning (−3 to −5), Info (−0 to −1)
- Gauge colors: red < 40, orange 40–70, green > 70

## Configuration options (Settings panel)

- Max pages to crawl (default unlimited; warning at 500+)
- Crawl speed: polite (1 rps), normal (3 rps), fast (10 rps)
- Include/exclude URL patterns (regex)
- PageSpeed API key (override env)
- User agent: Googlebot, Chrome, custom
- Crawl subdomains: on/off
- Respect robots.txt: on/off
- Maximum crawl depth (optional)

## Notes

- The crawler uses up to 5 concurrent Playwright pages (configurable via `MAX_CONCURRENT_PAGES`).
- Failed pages are retried up to 2 times before being marked as errors.
- The app is fully offline-capable except for PageSpeed and Safe Browsing API calls.
