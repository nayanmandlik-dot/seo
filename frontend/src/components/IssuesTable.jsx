import React, { useMemo, useState } from 'react';
import SeverityBadge from './SeverityBadge.jsx';

export default function IssuesTable({ issues }) {
  const [severity, setSeverity] = useState('all');
  const [module, setModule] = useState('all');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('severity');

  const modules = useMemo(() => ['all', ...new Set(issues.map(i => i.module))], [issues]);

  const filtered = useMemo(() => {
    const order = { critical: 0, warning: 1, info: 2 };
    return issues
      .filter(i => severity === 'all' || i.severity === severity)
      .filter(i => module === 'all' || i.module === module)
      .filter(i => !search || (i.checkName.toLowerCase().includes(search.toLowerCase()) || (i.affectedUrl || '').toLowerCase().includes(search.toLowerCase())))
      .sort((a, b) => {
        if (sortKey === 'severity') return order[a.severity] - order[b.severity];
        if (sortKey === 'module') return a.module.localeCompare(b.module);
        if (sortKey === 'url') return (a.affectedUrl || '').localeCompare(b.affectedUrl || '');
        return 0;
      });
  }, [issues, severity, module, search, sortKey]);

  function exportCsv() {
    const rows = [['severity', 'module', 'check', 'url', 'description', 'recommendation']];
    for (const i of filtered) rows.push([i.severity, i.module, i.checkName, i.affectedUrl || '', (i.description || '').replace(/"/g, '""'), (i.recommendation || '').replace(/"/g, '""')]);
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'issues.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3 items-center">
        <select className="border border-gray-300 rounded px-2 py-1 text-sm" value={severity} onChange={(e) => setSeverity(e.target.value)}>
          <option value="all">All severities</option>
          <option value="critical">Critical</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>
        <select className="border border-gray-300 rounded px-2 py-1 text-sm" value={module} onChange={(e) => setModule(e.target.value)}>
          {modules.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <input className="border border-gray-300 rounded px-2 py-1 text-sm flex-1 min-w-[200px]"
          placeholder="Search check or URL" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="border border-gray-300 rounded px-2 py-1 text-sm" value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
          <option value="severity">Sort: severity</option>
          <option value="module">Sort: module</option>
          <option value="url">Sort: URL</option>
        </select>
        <button onClick={exportCsv} className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">Export CSV</button>
        <span className="text-xs text-gray-500 ml-auto">{filtered.length} of {issues.length}</span>
      </div>
      <div className="overflow-auto border border-gray-200 rounded-lg bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Severity</th>
              <th className="text-left px-3 py-2 font-medium">Module</th>
              <th className="text-left px-3 py-2 font-medium">Issue</th>
              <th className="text-left px-3 py-2 font-medium">URL</th>
              <th className="text-left px-3 py-2 font-medium">Recommendation</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 1000).map((i, idx) => (
              <tr key={idx} className="border-t border-gray-100 hover:bg-gray-50 align-top">
                <td className="px-3 py-2"><SeverityBadge severity={i.severity} /></td>
                <td className="px-3 py-2 text-gray-700">{i.module}</td>
                <td className="px-3 py-2"><div className="font-medium">{i.checkName}</div><div className="text-xs text-gray-500">{i.description}</div></td>
                <td className="px-3 py-2 text-blue-600 break-all">{i.affectedUrl || '—'}</td>
                <td className="px-3 py-2 text-gray-600">{i.recommendation}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > 1000 ? <div className="text-xs text-gray-500 p-2">Showing first 1000 of {filtered.length}; export CSV for the full list.</div> : null}
      </div>
    </div>
  );
}
