import { URL } from 'node:url';

export function safeUrl(input, base) {
  try { return new URL(input, base).toString(); } catch { return null; }
}

export function normalizeUrl(input) {
  try {
    const u = new URL(input);
    u.hash = '';
    // Sort query params for consistent dedup
    const params = [...u.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
    u.search = '';
    for (const [k, v] of params) u.searchParams.append(k, v);
    return u.toString();
  } catch { return input; }
}

export function getHostname(input) {
  try { return new URL(input).hostname; } catch { return null; }
}

export function sameRegistrableDomain(a, b) {
  const ha = getHostname(a); const hb = getHostname(b);
  if (!ha || !hb) return false;
  if (ha === hb) return true;
  // crude eTLD+1 comparison: last two labels
  const partsA = ha.split('.').slice(-2).join('.');
  const partsB = hb.split('.').slice(-2).join('.');
  return partsA === partsB;
}

export function isHttp(input) {
  try { const u = new URL(input); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; }
}

export function urlDepth(input) {
  try {
    const u = new URL(input);
    const segs = u.pathname.split('/').filter(Boolean);
    return segs.length;
  } catch { return 0; }
}

export function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);
}

// Cosine similarity over bag-of-words token frequency vectors.
export function cosineSimilarity(tokensA, tokensB) {
  const fa = new Map(); const fb = new Map();
  for (const t of tokensA) fa.set(t, (fa.get(t) || 0) + 1);
  for (const t of tokensB) fb.set(t, (fb.get(t) || 0) + 1);
  const keys = new Set([...fa.keys(), ...fb.keys()]);
  let dot = 0, magA = 0, magB = 0;
  for (const k of keys) {
    const a = fa.get(k) || 0; const b = fb.get(k) || 0;
    dot += a * b; magA += a * a; magB += b * b;
  }
  if (!magA || !magB) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// Simple shingled hash for near-duplicate detection (faster than full cosine).
export function shingleSet(text, size = 5) {
  const tokens = tokenize(text);
  const set = new Set();
  for (let i = 0; i + size <= tokens.length; i++) {
    set.add(tokens.slice(i, i + size).join(' '));
  }
  return set;
}

export function jaccard(setA, setB) {
  if (!setA.size || !setB.size) return 0;
  let intersection = 0;
  for (const v of setA) if (setB.has(v)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union ? intersection / union : 0;
}

export function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
