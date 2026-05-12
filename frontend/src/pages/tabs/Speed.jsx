import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function Speed({ report }) {
  const speed = report.speedReports || {};
  const pages = Object.entries(speed);
  const slowest = (report.pages || [])
    .filter(p => p.responseTimeMs)
    .sort((a, b) => b.responseTimeMs - a.responseTimeMs)
    .slice(0, 20);

  if (!pages.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6 text-sm text-gray-600">
        No PageSpeed Insights data — set <code>PAGESPEED_API_KEY</code> in your .env or in the audit settings to enable Core Web Vitals checks.
        <h3 className="mt-4 font-medium text-base">Slowest pages by raw response time</h3>
        <div className="mt-3 h-72">
          <ResponsiveContainer>
            <BarChart data={slowest.map(p => ({ url: shorten(p.url), ms: p.responseTimeMs }))}>
              <XAxis dataKey="url" hide />
              <YAxis />
              <Tooltip />
              <Bar dataKey="ms" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {['mobile', 'desktop'].map(strategy => {
          const lcps = pages.map(([, r]) => r?.[strategy]?.cwv?.lcp?.value).filter(Boolean);
          const avgLcp = lcps.length ? lcps.reduce((a, b) => a + b, 0) / lcps.length : 0;
          const cls = pages.map(([, r]) => r?.[strategy]?.cwv?.cls?.value).filter(v => v != null);
          const avgCls = cls.length ? cls.reduce((a, b) => a + b, 0) / cls.length : 0;
          const inp = pages.map(([, r]) => r?.[strategy]?.cwv?.inp?.value).filter(Boolean);
          const avgInp = inp.length ? inp.reduce((a, b) => a + b, 0) / inp.length : 0;
          return (
            <div key={strategy} className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="font-medium capitalize">{strategy} CWV (averages across {pages.length} pages)</h3>
              <dl className="grid grid-cols-3 gap-3 mt-3 text-sm">
                <div><dt className="text-gray-500 text-xs">LCP</dt><dd className="text-xl font-semibold">{(avgLcp / 1000).toFixed(2)}s</dd></div>
                <div><dt className="text-gray-500 text-xs">CLS</dt><dd className="text-xl font-semibold">{avgCls.toFixed(3)}</dd></div>
                <div><dt className="text-gray-500 text-xs">INP</dt><dd className="text-xl font-semibold">{Math.round(avgInp)}ms</dd></div>
              </dl>
            </div>
          );
        })}
      </div>
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="font-medium mb-2">Slowest pages</h3>
        <div className="h-72">
          <ResponsiveContainer>
            <BarChart data={slowest.map(p => ({ url: shorten(p.url), ms: p.responseTimeMs }))}>
              <XAxis dataKey="url" hide />
              <YAxis />
              <Tooltip />
              <Bar dataKey="ms" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-3 py-2 font-medium">URL</th>
              <th className="text-right px-3 py-2 font-medium">Mobile perf</th>
              <th className="text-right px-3 py-2 font-medium">Desktop perf</th>
              <th className="text-right px-3 py-2 font-medium">LCP (m)</th>
              <th className="text-right px-3 py-2 font-medium">CLS (m)</th>
              <th className="text-right px-3 py-2 font-medium">INP (m)</th>
            </tr>
          </thead>
          <tbody>
            {pages.map(([url, r]) => (
              <tr key={url} className="border-t border-gray-100">
                <td className="px-3 py-2 text-blue-600 break-all max-w-md truncate">{url}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r?.mobile?.performanceScore != null ? Math.round(r.mobile.performanceScore * 100) : '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r?.desktop?.performanceScore != null ? Math.round(r.desktop.performanceScore * 100) : '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r?.mobile?.cwv?.lcp ? (r.mobile.cwv.lcp.value / 1000).toFixed(2) + 's' : '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r?.mobile?.cwv?.cls ? r.mobile.cwv.cls.value.toFixed(3) : '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r?.mobile?.cwv?.inp ? Math.round(r.mobile.cwv.inp.value) + 'ms' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function shorten(u) {
  try { const x = new URL(u); return x.pathname.length > 30 ? x.pathname.slice(0, 30) + '…' : x.pathname; } catch { return u; }
}
