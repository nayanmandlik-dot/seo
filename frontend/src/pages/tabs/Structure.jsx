import React, { useMemo, useState } from 'react';
import LinkGraph from '../../components/LinkGraph.jsx';

export default function Structure({ report }) {
  const [selected, setSelected] = useState(null);
  const scoreByUrl = useMemo(() => {
    const m = {};
    for (const p of report.pages || []) m[p.url] = p.score;
    return m;
  }, [report]);
  const archived = report.architecture || {};

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
      <div className="lg:col-span-3">
        <LinkGraph
          nodes={report.linkGraph?.nodes || []}
          links={report.linkGraph?.links || []}
          scoreByUrl={scoreByUrl}
          onSelect={setSelected}
        />
      </div>
      <aside className="space-y-4">
        <div className="bg-white border border-gray-200 rounded-lg p-3 text-sm">
          <div className="text-gray-500 text-xs mb-1">Average depth</div>
          <div className="text-xl font-semibold">{(archived.avgDepth || 0).toFixed(2)}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <h3 className="text-sm font-medium mb-2">Top hub pages (most outbound)</h3>
          <ul className="text-xs space-y-1">
            {(archived.hubs || []).map(([url, c]) => (
              <li key={url} className="flex justify-between gap-2"><span className="break-all text-blue-600">{url}</span><span>{c}</span></li>
            ))}
          </ul>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <h3 className="text-sm font-medium mb-2">Top authority pages (most inbound)</h3>
          <ul className="text-xs space-y-1">
            {(archived.authorities || []).map(([url, c]) => (
              <li key={url} className="flex justify-between gap-2"><span className="break-all text-blue-600">{url}</span><span>{c}</span></li>
            ))}
          </ul>
        </div>
        {selected && (
          <div className="bg-white border border-gray-200 rounded-lg p-3 text-sm">
            <h3 className="font-medium break-all">{selected.id}</h3>
            <dl className="mt-2 text-xs grid grid-cols-2 gap-1">
              <div><dt className="text-gray-500">Inbound</dt><dd>{selected.inbound}</dd></div>
              <div><dt className="text-gray-500">Outbound</dt><dd>{selected.outbound}</dd></div>
              <div><dt className="text-gray-500">Depth</dt><dd>{selected.depth}</dd></div>
              <div><dt className="text-gray-500">Status</dt><dd>{selected.status}</dd></div>
              <div><dt className="text-gray-500">Rank</dt><dd>{selected.rank?.toFixed(3)}</dd></div>
            </dl>
          </div>
        )}
      </aside>
    </div>
  );
}
