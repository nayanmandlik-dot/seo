import React from 'react';
import Gauge from '../../components/Gauge.jsx';
import ModuleCard from '../../components/ModuleCard.jsx';
import SeverityBadge from '../../components/SeverityBadge.jsx';

export default function Overview({ report }) {
  const sev = report.stats?.severity || {};
  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="md:col-span-1 bg-white border border-gray-200 rounded-lg p-4 flex flex-col items-center justify-center">
          <Gauge value={report.scores?.overall ?? 0} label="Overall score" size={180} />
        </div>
        <div className="md:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat title="Pages crawled" value={report.stats?.pagesCrawled || 0} />
          <Stat title="Issues found" value={report.stats?.issuesFound || 0} />
          <Stat title="Critical" value={sev.critical || 0} color="text-red-600" />
          <Stat title="Warnings" value={sev.warning || 0} color="text-amber-600" />
          <Stat title="Avg response" value={`${report.stats?.avgResponseTimeMs || 0} ms`} />
          <Stat title="Total time" value={`${Math.round((report.stats?.totalTimeMs || 0) / 1000)} s`} />
          <Stat title="Pages/min" value={(report.stats?.pagesPerMinute || 0).toFixed(1)} />
          <Stat title="Discovered" value={report.stats?.pagesDiscovered || 0} />
        </div>
      </div>

      <h2 className="text-lg font-semibold mb-3">Modules</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {Object.entries(report.scores?.perModule || {}).map(([name, m]) => (
          <ModuleCard key={name} name={name} data={m} />
        ))}
      </div>

      <h2 className="text-lg font-semibold mb-3">Top issues</h2>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Severity</th>
              <th className="text-left px-3 py-2 font-medium">Module</th>
              <th className="text-left px-3 py-2 font-medium">Issue</th>
              <th className="text-left px-3 py-2 font-medium">URL</th>
            </tr>
          </thead>
          <tbody>
            {(report.topIssues || []).map((i, idx) => (
              <tr key={idx} className="border-t border-gray-100">
                <td className="px-3 py-2"><SeverityBadge severity={i.severity} /></td>
                <td className="px-3 py-2 text-gray-700">{i.module}</td>
                <td className="px-3 py-2"><div className="font-medium">{i.checkName}</div><div className="text-xs text-gray-500">{i.recommendation}</div></td>
                <td className="px-3 py-2 text-blue-600 break-all">{i.affectedUrl || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ title, value, color }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="text-xs text-gray-500">{title}</div>
      <div className={`text-2xl font-semibold ${color || ''}`}>{value}</div>
    </div>
  );
}
