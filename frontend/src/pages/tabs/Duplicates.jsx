import React, { useMemo } from 'react';
import SeverityBadge from '../../components/SeverityBadge.jsx';

export default function Duplicates({ report }) {
  const groups = useMemo(() => {
    const dupTitles = new Map();
    const dupDesc = new Map();
    const nearDup = [];
    for (const i of report.results || []) {
      if (i.module !== 'Duplicates') continue;
      if (i.checkName === 'Duplicate title') {
        const k = i.value?.title || ''; if (!dupTitles.has(k)) dupTitles.set(k, new Set()); for (const u of i.value?.urls || []) dupTitles.get(k).add(u);
      } else if (i.checkName === 'Duplicate meta description') {
        const k = i.value?.desc || ''; if (!dupDesc.has(k)) dupDesc.set(k, new Set()); for (const u of i.value?.urls || []) dupDesc.get(k).add(u);
      } else if (i.checkName === 'Near-duplicate content') {
        nearDup.push({ a: i.affectedUrl, b: i.value?.other, sim: i.value?.similarity });
      }
    }
    return { dupTitles: [...dupTitles.entries()], dupDesc: [...dupDesc.entries()], nearDup };
  }, [report]);

  const canonicalIssues = (report.results || []).filter(i => i.module === 'Duplicates' && i.checkName.toLowerCase().includes('canonical'));

  return (
    <div className="space-y-4">
      <Section title="Duplicate titles">
        {groups.dupTitles.length === 0 ? <Empty /> :
          groups.dupTitles.map(([title, urls], idx) => (
            <div key={idx} className="border-t border-gray-100 first:border-0 py-2">
              <div className="text-sm font-medium">"{title}"</div>
              <ul className="mt-1 text-xs text-blue-600 space-y-0.5">
                {[...urls].map(u => <li key={u} className="break-all">{u}</li>)}
              </ul>
            </div>
          ))}
      </Section>
      <Section title="Duplicate descriptions">
        {groups.dupDesc.length === 0 ? <Empty /> :
          groups.dupDesc.map(([desc, urls], idx) => (
            <div key={idx} className="border-t border-gray-100 first:border-0 py-2">
              <div className="text-sm font-medium truncate">"{desc}"</div>
              <ul className="mt-1 text-xs text-blue-600 space-y-0.5">
                {[...urls].map(u => <li key={u} className="break-all">{u}</li>)}
              </ul>
            </div>
          ))}
      </Section>
      <Section title="Near-duplicate pages">
        {groups.nearDup.length === 0 ? <Empty /> : (
          <table className="min-w-full text-sm">
            <thead><tr><th className="text-left py-1">A</th><th className="text-left py-1">B</th><th className="text-right py-1">Similarity</th></tr></thead>
            <tbody>
              {groups.nearDup.slice(0, 50).map((g, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="py-1 text-blue-600 break-all">{g.a}</td>
                  <td className="py-1 text-blue-600 break-all">{g.b}</td>
                  <td className="py-1 text-right tabular-nums">{(g.sim * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
      <Section title="Canonical issues">
        {canonicalIssues.length === 0 ? <Empty /> :
          canonicalIssues.slice(0, 100).map((i, idx) => (
            <div key={idx} className="flex gap-2 items-start py-2 border-t border-gray-100 first:border-0 text-sm">
              <SeverityBadge severity={i.severity} />
              <div className="flex-1">
                <div className="font-medium">{i.checkName}</div>
                <div className="text-xs text-gray-500">{i.description}</div>
                <div className="text-xs text-blue-600 break-all">{i.affectedUrl}</div>
              </div>
            </div>
          ))}
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="font-medium mb-3">{title}</h3>
      {children}
    </div>
  );
}
function Empty() { return <div className="text-sm text-gray-500">None found.</div>; }
