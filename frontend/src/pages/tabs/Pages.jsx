import React, { useState } from 'react';
import PagesTable from '../../components/PagesTable.jsx';
import SeverityBadge from '../../components/SeverityBadge.jsx';

export default function Pages({ report }) {
  const [selected, setSelected] = useState(null);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className={selected ? 'lg:col-span-2' : 'lg:col-span-3'}>
        <PagesTable pages={report.pages || []} onSelect={setSelected} />
      </div>
      {selected && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 max-h-[80vh] overflow-auto">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm break-all">{selected.url}</h3>
            <button onClick={() => setSelected(null)} className="text-gray-500 text-xs">Close</button>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <div><dt className="text-gray-500">Status</dt><dd>{selected.status}</dd></div>
            <div><dt className="text-gray-500">Score</dt><dd>{selected.score}</dd></div>
            <div><dt className="text-gray-500">Words</dt><dd>{selected.wordCount}</dd></div>
            <div><dt className="text-gray-500">Time</dt><dd>{selected.responseTimeMs} ms</dd></div>
            <div><dt className="text-gray-500">Inbound</dt><dd>{selected.inboundCount}</dd></div>
            <div><dt className="text-gray-500">Outbound</dt><dd>{selected.outboundCount}</dd></div>
          </dl>
          <h4 className="mt-4 font-medium text-sm">Issues ({selected.issues?.length || 0})</h4>
          <ul className="mt-2 space-y-2">
            {(selected.issues || []).map((i, idx) => (
              <li key={idx} className="border-l-2 pl-2 border-gray-200 text-sm">
                <div className="flex gap-2 items-center"><SeverityBadge severity={i.severity} /><span className="font-medium">{i.checkName}</span></div>
                <div className="text-xs text-gray-600">{i.description}</div>
                <div className="text-xs text-gray-500">{i.recommendation}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
