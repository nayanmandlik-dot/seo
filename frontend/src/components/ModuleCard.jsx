import React from 'react';
import Gauge from './Gauge.jsx';

export default function ModuleCard({ name, data }) {
  if (!data) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-center gap-4">
      <Gauge value={data.score} size={84} />
      <div>
        <div className="font-medium">{name}</div>
        <div className="text-xs text-gray-500 mt-1">
          {data.issueCount} issues
          {data.severityCounts.critical ? <span className="ml-2 text-red-600">• {data.severityCounts.critical} critical</span> : null}
          {data.severityCounts.warning ? <span className="ml-2 text-amber-600">• {data.severityCounts.warning} warning</span> : null}
        </div>
      </div>
    </div>
  );
}
