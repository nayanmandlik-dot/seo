// Sitemap fetcher: handles plain XML sitemaps and sitemap indexes.
import axios from 'axios';
import xml2js from 'xml2js';

export async function fetchSitemap(url, depth = 0, seen = new Set()) {
  if (seen.has(url) || depth > 5) return { url, ok: false, status: 0, urls: [], indexes: [], error: 'cycle/depth' };
  seen.add(url);
  try {
    const res = await axios.get(url, {
      timeout: 20000,
      validateStatus: () => true,
      maxRedirects: 5,
      headers: { 'User-Agent': process.env.DEFAULT_USER_AGENT || 'SEOAuditBot/1.0' },
      responseType: 'text',
    });
    if (res.status >= 400) return { url, ok: false, status: res.status, urls: [], indexes: [], error: `status ${res.status}` };
    const data = await xml2js.parseStringPromise(res.data, { explicitArray: false });
    const urls = [];
    const indexes = [];
    if (data?.urlset?.url) {
      const arr = Array.isArray(data.urlset.url) ? data.urlset.url : [data.urlset.url];
      for (const u of arr) {
        urls.push({ loc: u.loc, lastmod: u.lastmod || null, changefreq: u.changefreq || null, priority: u.priority || null });
      }
    } else if (data?.sitemapindex?.sitemap) {
      const arr = Array.isArray(data.sitemapindex.sitemap) ? data.sitemapindex.sitemap : [data.sitemapindex.sitemap];
      for (const s of arr) indexes.push(s.loc);
    }
    return { url, ok: true, status: res.status, urls, indexes, error: null };
  } catch (e) {
    return { url, ok: false, status: 0, urls: [], indexes: [], error: e.message };
  }
}

export async function fetchAllSitemaps(seedUrls) {
  const result = { sitemaps: [], allUrls: [] };
  const seen = new Set();
  const queue = [...seedUrls];
  while (queue.length) {
    const u = queue.shift();
    const sm = await fetchSitemap(u, 0, seen);
    result.sitemaps.push(sm);
    for (const e of sm.indexes) if (!seen.has(e)) queue.push(e);
    for (const item of sm.urls) result.allUrls.push(item);
  }
  return result;
}
