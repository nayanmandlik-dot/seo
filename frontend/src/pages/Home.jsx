import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api.js';

export default function Home() {
  const nav = useNavigate();
  const [reports, setReports] = useState(null);
  const [url, setUrl] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [config, setConfig] = useState({
    maxPages: '',
    crawlSpeed: 'normal',
    includePatterns: '',
    excludePatterns: '',
    pageSpeedApiKey: '',
    userAgent: 'chrome',
    crawlSubdomains: false,
    respectRobots: true,
    maxDepth: '',
  });

  useEffect(() => { api.listReports().then(setReports).catch(() => setReports([])); }, []);

  async function start() {
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const body = {
        rootUrl: url.trim(),
        maxPages: config.maxPages ? Number(config.maxPages) : null,
        crawlSpeed: config.crawlSpeed,
        includePatterns: config.includePatterns ? config.includePatterns.split(/\n+/).filter(Boolean) : [],
        excludePatterns: config.excludePatterns ? config.excludePatterns.split(/\n+/).filter(Boolean) : [],
        userAgent: config.userAgent,
        crawlSubdomains: config.crawlSubdomains,
        respectRobots: config.respectRobots,
        maxDepth: config.maxDepth ? Number(config.maxDepth) : null,
        pageSpeedApiKey: config.pageSpeedApiKey || undefined,
      };
      const { sessionId } = await api.startAudit(body);
      nav(`/audit/${sessionId}`);
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  }

  async function remove(id) {
    if (!confirm('Delete this audit?')) return;
    await api.deleteReport(id);
    setReports(await api.listReports());
  }

  return (
    <div>
      <section className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <h1 className="text-xl font-semibold mb-1">New audit</h1>
        <p className="text-sm text-gray-500 mb-4">Crawl a website end-to-end and get a 17-module technical SEO report.</p>
        <div className="flex gap-2">
          <input className="flex-1 border border-gray-300 rounded px-3 py-2"
            placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button onClick={() => setShowSettings(!showSettings)} className="px-3 py-2 border border-gray-300 rounded text-sm">
            Settings
          </button>
          <button disabled={busy || !url.trim()} onClick={start}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
            {busy ? 'Starting…' : 'Start Audit'}
          </button>
        </div>
        {error && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 text-red-800 rounded text-sm">
            Failed to start audit: {error}
          </div>
        )}
        {showSettings && (
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <label className="block">
              <span className="text-gray-600">Max pages (blank = unlimited)</span>
              <input type="number" className="mt-1 w-full border border-gray-300 rounded px-2 py-1" value={config.maxPages}
                onChange={(e) => setConfig({ ...config, maxPages: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-gray-600">Crawl speed</span>
              <select className="mt-1 w-full border border-gray-300 rounded px-2 py-1" value={config.crawlSpeed}
                onChange={(e) => setConfig({ ...config, crawlSpeed: e.target.value })}>
                <option value="polite">Polite (1 req/sec)</option>
                <option value="normal">Normal (3 req/sec)</option>
                <option value="fast">Fast (10 req/sec)</option>
              </select>
            </label>
            <label className="block">
              <span className="text-gray-600">User-Agent</span>
              <select className="mt-1 w-full border border-gray-300 rounded px-2 py-1" value={config.userAgent}
                onChange={(e) => setConfig({ ...config, userAgent: e.target.value })}>
                <option value="chrome">Chrome</option>
                <option value="googlebot">Googlebot</option>
                <option value="custom">Custom (env)</option>
              </select>
            </label>
            <label className="block">
              <span className="text-gray-600">Max crawl depth (optional)</span>
              <input type="number" className="mt-1 w-full border border-gray-300 rounded px-2 py-1" value={config.maxDepth}
                onChange={(e) => setConfig({ ...config, maxDepth: e.target.value })} />
            </label>
            <label className="block col-span-2">
              <span className="text-gray-600">Include URL patterns (regex, one per line)</span>
              <textarea rows="2" className="mt-1 w-full border border-gray-300 rounded px-2 py-1 font-mono text-xs"
                value={config.includePatterns} onChange={(e) => setConfig({ ...config, includePatterns: e.target.value })} />
            </label>
            <label className="block col-span-2">
              <span className="text-gray-600">Exclude URL patterns (regex, one per line)</span>
              <textarea rows="2" className="mt-1 w-full border border-gray-300 rounded px-2 py-1 font-mono text-xs"
                value={config.excludePatterns} onChange={(e) => setConfig({ ...config, excludePatterns: e.target.value })} />
            </label>
            <label className="block col-span-2">
              <span className="text-gray-600">PageSpeed Insights API key (overrides env)</span>
              <input className="mt-1 w-full border border-gray-300 rounded px-2 py-1" value={config.pageSpeedApiKey}
                onChange={(e) => setConfig({ ...config, pageSpeedApiKey: e.target.value })} />
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={config.crawlSubdomains}
                onChange={(e) => setConfig({ ...config, crawlSubdomains: e.target.checked })} />
              <span>Crawl subdomains</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={config.respectRobots}
                onChange={(e) => setConfig({ ...config, respectRobots: e.target.checked })} />
              <span>Respect robots.txt</span>
            </label>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Past audits</h2>
        {!reports ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-12" />)}</div>
        ) : reports.length === 0 ? (
          <div className="text-sm text-gray-500 bg-white border border-gray-200 rounded-lg p-6 text-center">No audits yet — run your first one above.</div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">URL</th>
                  <th className="text-right px-3 py-2 font-medium">Pages</th>
                  <th className="text-right px-3 py-2 font-medium">Issues</th>
                  <th className="text-right px-3 py-2 font-medium">Score</th>
                  <th className="text-left px-3 py-2 font-medium">Date</th>
                  <th className="text-right px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {reports.map(r => (
                  <tr key={r.sessionId} className="border-t border-gray-100">
                    <td className="px-3 py-2 text-blue-600 break-all max-w-md truncate">
                      <Link to={`/report/${r.sessionId}`}>{r.rootUrl}</Link>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.pages}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.issues}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{r.score ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{r.completedAt ? new Date(r.completedAt).toLocaleString() : '—'}</td>
                    <td className="px-3 py-2 text-right">
                      <button className="text-xs text-red-600 hover:underline" onClick={() => remove(r.sessionId)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
