// robots.txt fetcher and parser.
// Returns: { raw, rules: { '*': { allow: [...], disallow: [...], crawlDelay: number } }, sitemaps: [], errors: [] }
import axios from 'axios';

export async function fetchRobots(rootUrl) {
  const u = new URL('/robots.txt', rootUrl).toString();
  try {
    const res = await axios.get(u, {
      timeout: 15000,
      validateStatus: () => true,
      maxRedirects: 5,
      headers: { 'User-Agent': process.env.DEFAULT_USER_AGENT || 'SEOAuditBot/1.0' },
    });
    if (res.status >= 400) return { exists: false, status: res.status, raw: '', rules: {}, sitemaps: [], errors: [] };
    return parseRobots(res.data, res.status);
  } catch (e) {
    return { exists: false, status: 0, raw: '', rules: {}, sitemaps: [], errors: [`fetch failed: ${e.message}`] };
  }
}

export function parseRobots(text, status = 200) {
  const errors = [];
  const sitemaps = [];
  const rules = {};
  let currentAgents = [];
  const lines = String(text || '').split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    let raw = lines[i];
    const hashIdx = raw.indexOf('#');
    if (hashIdx >= 0) raw = raw.slice(0, hashIdx);
    const line = raw.trim();
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon < 0) { errors.push(`Line ${i + 1}: missing colon`); continue; }
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === 'user-agent') {
      currentAgents = [value.toLowerCase()];
      if (!rules[value.toLowerCase()]) rules[value.toLowerCase()] = { allow: [], disallow: [], crawlDelay: null };
    } else if (field === 'disallow') {
      for (const ua of currentAgents) {
        rules[ua] = rules[ua] || { allow: [], disallow: [], crawlDelay: null };
        rules[ua].disallow.push(value);
      }
    } else if (field === 'allow') {
      for (const ua of currentAgents) {
        rules[ua] = rules[ua] || { allow: [], disallow: [], crawlDelay: null };
        rules[ua].allow.push(value);
      }
    } else if (field === 'crawl-delay') {
      const n = Number(value);
      if (Number.isFinite(n)) {
        for (const ua of currentAgents) {
          rules[ua] = rules[ua] || { allow: [], disallow: [], crawlDelay: null };
          rules[ua].crawlDelay = n;
        }
      } else errors.push(`Line ${i + 1}: invalid crawl-delay "${value}"`);
    } else if (field === 'sitemap') {
      sitemaps.push(value);
    }
  }
  return { exists: true, status, raw: text, rules, sitemaps, errors };
}

// Returns true if path is allowed for the given UA (longest-match rule wins, RFC-style).
export function isAllowed(robots, urlPath, ua = '*') {
  if (!robots || !robots.exists) return true;
  const uaKey = robots.rules[ua.toLowerCase()] ? ua.toLowerCase() : '*';
  const r = robots.rules[uaKey];
  if (!r) return true;
  let match = { len: -1, allow: true };
  for (const d of r.disallow) {
    if (d === '') continue;
    if (matches(urlPath, d) && d.length > match.len) match = { len: d.length, allow: false };
  }
  for (const a of r.allow) {
    if (matches(urlPath, a) && a.length > match.len) match = { len: a.length, allow: true };
  }
  return match.allow;
}

function matches(p, pattern) {
  if (pattern === '/') return true;
  if (pattern.includes('*') || pattern.endsWith('$')) {
    let re = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    if (re.endsWith('$')) re = re.slice(0, -1);
    return new RegExp('^' + re).test(p);
  }
  return p.startsWith(pattern);
}
