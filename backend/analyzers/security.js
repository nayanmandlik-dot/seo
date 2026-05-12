// Module 8 — Security & HTTPS
// Why these checks matter:
// - HTTPS is a confirmed Google ranking signal; broken SSL chains break trust badges in browsers.
// - Mixed content (HTTP assets on an HTTPS page) gets blocked by browsers and reduces "secure" signal.
// - HSTS prevents protocol downgrade attacks; security headers (CSP, X-Frame-Options) are basic hardening.
// - TLS 1.0/1.1 are deprecated and flagged by browsers.
import tls from 'node:tls';
import { URL } from 'node:url';
import * as cheerio from 'cheerio';
import { makeResult, SEV } from '../utils/result.js';

const M = 'Security';

export async function analyzeTls(rootUrl) {
  const out = [];
  const u = new URL(rootUrl);
  if (u.protocol !== 'https:') {
    out.push(makeResult({ module: M, checkName: 'Site not on HTTPS',
      severity: SEV.CRITICAL, affectedUrl: rootUrl,
      description: 'Root URL is plain HTTP.',
      recommendation: 'Move to HTTPS — it\'s a Google ranking signal and required for modern features.' }));
    return { issues: out, tlsInfo: null };
  }
  return new Promise((resolve) => {
    const socket = tls.connect({ host: u.hostname, port: 443, servername: u.hostname, timeout: 10000 }, () => {
      const cert = socket.getPeerCertificate(true);
      const protocol = socket.getProtocol();
      const tlsInfo = { protocol, valid: socket.authorized, validFrom: cert.valid_from, validTo: cert.valid_to, subject: cert.subject, issuer: cert.issuer };
      if (!socket.authorized) {
        out.push(makeResult({ module: M, checkName: 'Invalid SSL certificate',
          severity: SEV.CRITICAL, affectedUrl: rootUrl,
          description: socket.authorizationError || 'Certificate failed verification.',
          recommendation: 'Fix the certificate chain or hostname mismatch.', value: socket.authorizationError }));
      }
      const exp = cert.valid_to ? new Date(cert.valid_to).getTime() : 0;
      if (exp && exp < Date.now()) {
        out.push(makeResult({ module: M, checkName: 'SSL certificate expired',
          severity: SEV.CRITICAL, affectedUrl: rootUrl,
          description: `Certificate expired on ${cert.valid_to}.`,
          recommendation: 'Renew the certificate immediately.', value: cert.valid_to }));
      } else if (exp && exp - Date.now() < 14 * 24 * 60 * 60 * 1000) {
        out.push(makeResult({ module: M, checkName: 'SSL certificate expiring soon',
          severity: SEV.WARNING, affectedUrl: rootUrl,
          description: `Certificate expires on ${cert.valid_to}.`,
          recommendation: 'Renew the certificate soon.', value: cert.valid_to }));
      }
      if (protocol && /TLSv1(\.0|\.1)?$/.test(protocol)) {
        out.push(makeResult({ module: M, checkName: 'Deprecated TLS version',
          severity: SEV.CRITICAL, affectedUrl: rootUrl,
          description: `Server negotiated ${protocol}.`,
          recommendation: 'Disable TLS 1.0 and 1.1 — only TLS 1.2 and 1.3 are secure.', value: protocol }));
      }
      socket.end();
      resolve({ issues: out, tlsInfo });
    });
    socket.on('error', (err) => {
      out.push(makeResult({ module: M, checkName: 'TLS handshake failed',
        severity: SEV.CRITICAL, affectedUrl: rootUrl,
        description: err.message,
        recommendation: 'Investigate certificate, hostname, or TLS configuration.' }));
      resolve({ issues: out, tlsInfo: null });
    });
    socket.on('timeout', () => { socket.destroy(); resolve({ issues: out, tlsInfo: null }); });
  });
}

export function analyzeSecurityHeaders(page) {
  const out = [];
  if (page.status !== 200) return out;
  const h = Object.fromEntries(
    Object.entries(page.headers || {}).map(([k, v]) => [k.toLowerCase(), v])
  );
  const isHttps = (() => { try { return new URL(page.finalUrl || page.url).protocol === 'https:'; } catch { return false; } })();

  if (isHttps && !h['strict-transport-security']) {
    out.push(makeResult({ module: M, checkName: 'Missing HSTS header',
      severity: SEV.WARNING, affectedUrl: page.url,
      description: 'No Strict-Transport-Security header on HTTPS response.',
      recommendation: 'Add HSTS, e.g. "Strict-Transport-Security: max-age=31536000; includeSubDomains".' }));
  } else if (h['strict-transport-security'] && !/max-age=\d{6,}/.test(h['strict-transport-security'])) {
    out.push(makeResult({ module: M, checkName: 'HSTS max-age too short',
      severity: SEV.INFO, affectedUrl: page.url,
      description: `HSTS: "${h['strict-transport-security']}"`,
      recommendation: 'Use max-age >= 15552000 (180 days) for meaningful protection.', value: h['strict-transport-security'] }));
  }
  const required = {
    'x-content-type-options': 'Add "X-Content-Type-Options: nosniff".',
    'x-frame-options': 'Add "X-Frame-Options: SAMEORIGIN" or use CSP frame-ancestors.',
    'content-security-policy': 'Define a Content-Security-Policy to mitigate XSS.',
    'referrer-policy': 'Add a Referrer-Policy (e.g. "strict-origin-when-cross-origin").',
    'permissions-policy': 'Set a Permissions-Policy to restrict powerful browser features.',
  };
  for (const [k, rec] of Object.entries(required)) {
    if (!h[k]) {
      out.push(makeResult({ module: M, checkName: `Missing ${k}`,
        severity: SEV.INFO, affectedUrl: page.url,
        description: `Response is missing ${k} header.`,
        recommendation: rec }));
    }
  }
  return out;
}

export function analyzeMixedContent(page) {
  const out = [];
  let pageIsHttps = false;
  try { pageIsHttps = new URL(page.finalUrl || page.url).protocol === 'https:'; } catch {}
  if (!pageIsHttps) return out;
  const $ = cheerio.load(page.renderedHtml || page.rawHtml || '');
  const insecure = [];
  $('script[src], img[src], iframe[src], link[href][rel="stylesheet"]').each((_, el) => {
    const $el = $(el);
    const src = $el.attr('src') || $el.attr('href') || '';
    if (/^http:\/\//i.test(src)) insecure.push({ tag: el.tagName, src });
  });
  if (insecure.length) {
    out.push(makeResult({ module: M, checkName: 'Mixed content',
      severity: SEV.WARNING, affectedUrl: page.url,
      description: `${insecure.length} HTTP resources loaded on HTTPS page.`,
      recommendation: 'Serve all sub-resources over HTTPS.', value: insecure }));
  }
  return out;
}
