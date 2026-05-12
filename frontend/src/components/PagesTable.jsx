import React, { useMemo, useState } from 'react';

function color(s) { return s >= 70 ? 'text-green-600' : s >= 40 ? 'text-amber-600' : 'text-red-600'; }

export default function PagesTable({ pages, onSelect }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('score-asc');
  const filtered = useMemo(() => {
    const arr = pages.filter(p => !search || p.url.toLowerCase().includes(search.toLowerCase()));
    arr.sort((a, b) => {
      switch (sort) {
        case 'score-asc': return a.score - b.score;
        case 'score-desc': return b.score - a.score;
        case 'issues-desc': return b.issueCount - a.issueCount;
        case 'time-desc': return (b.responseTimeMs || 0) - (a.responseTimeMs || 0);
        case 'depth-desc': return b.depth - a.depth;
        default: return 0;
      }
    });
    return arr;
  }, [pages, search, sort]);

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <input className="border border-gray-300 rounded px-2 py-1 text-sm flex-1" placeholder="Filter URL"
          value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="border border-gray-300 rounded px-2 py-1 text-sm" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="score-asc">Sort: lowest score</option>
          <option value="score-desc">Sort: highest score</option>
          <option value="issues-desc">Sort: most issues</option>
          <option value="time-desc">Sort: slowest</option>
          <option value="depth-desc">Sort: deepest</option>
        </select>
      </div>
      <div className="overflow-auto border border-gray-200 rounded-lg bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-3 py-2 font-medium">URL</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-left px-3 py-2 font-medium">Title</th>
              <th className="text-right px-3 py-2 font-medium">Words</th>
              <th className="text-right px-3 py-2 font-medium">Time (ms)</th>
              <th className="text-right px-3 py-2 font-medium">Depth</th>
              <th className="text-right px-3 py-2 font-medium">Issues</th>
              <th className="text-right px-3 py-2 font-medium">Score</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 1000).map((p, idx) => (
              <tr key={idx} className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => onSelect?.(p)}>
                <td className="px-3 py-2 text-blue-600 break-all max-w-md truncate">{p.url}</td>
                <td className="px-3 py-2">{p.status}</td>
                <td className="px-3 py-2 text-gray-600 max-w-xs truncate">{p.title || '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{p.wordCount ?? '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{p.responseTimeMs ?? '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{p.depth}</td>
                <td className="px-3 py-2 text-right tabular-nums">{p.issueCount}</td>
                <td className={`px-3 py-2 text-right tabular-nums font-semibold ${color(p.score)}`}>{p.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
