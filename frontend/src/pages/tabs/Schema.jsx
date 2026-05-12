import React, { useMemo } from 'react';
import SeverityBadge from '../../components/SeverityBadge.jsx';

export default function Schema({ report }) {
  const types = useMemo(() => {
    const m = new Map();
    for (const p of report.pages || []) {
      for (const t of p.schemaTypes || []) m.set(t, (m.get(t) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [report]);
  const schemaIssues = (report.results || []).filter(i => i.module === 'Schema');

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="font-medium mb-3">Schema types found across the site</h3>
        {types.length === 0 ? <div className="text-sm text-gray-500">No structured data detected.</div> : (
          <ul className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {types.map(([t, c]) => (
              <li key={t} className="bg-gray-50 rounded px-3 py-2 text-sm flex justify-between">
                <span>{t}</span><span className="tabular-nums text-gray-600">{c}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <h3 className="font-medium px-4 py-3 border-b border-gray-200">Schema validation issues ({schemaIssues.length})</h3>
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Severity</th>
              <th className="text-left px-3 py-2 font-medium">Issue</th>
              <th className="text-left px-3 py-2 font-medium">URL</th>
              <th className="text-left px-3 py-2 font-medium">Recommendation</th>
            </tr>
          </thead>
          <tbody>
            {schemaIssues.slice(0, 200).map((i, idx) => (
              <tr key={idx} className="border-t border-gray-100 align-top">
                <td className="px-3 py-2"><SeverityBadge severity={i.severity} /></td>
                <td className="px-3 py-2"><div className="font-medium">{i.checkName}</div><div className="text-xs text-gray-500">{i.description}</div></td>
                <td className="px-3 py-2 text-blue-600 break-all">{i.affectedUrl || '—'}</td>
                <td className="px-3 py-2 text-gray-600">{i.recommendation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
