import React, { useState } from 'react';
import { api } from '../../api.js';

export default function Export({ report }) {
  const [busy, setBusy] = useState(null);
  const [last, setLast] = useState(null);

  async function go(type) {
    setBusy(type);
    try {
      let r;
      if (type === 'pdf-full') r = await api.exportPdf(report.sessionId, false);
      else if (type === 'pdf-exec') r = await api.exportPdf(report.sessionId, true);
      else if (type === 'csv') r = await api.exportCsv(report.sessionId);
      else if (type === 'json') r = await api.exportJson(report.sessionId);
      setLast(r);
    } catch (e) { alert('Export failed: ' + e.message); }
    finally { setBusy(null); }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 max-w-xl">
      <h2 className="text-lg font-semibold mb-3">Export options</h2>
      <p className="text-sm text-gray-600 mb-4">Generate downloadable artifacts for sharing the audit results.</p>
      <div className="grid grid-cols-2 gap-3">
        <button disabled={busy} onClick={() => go('pdf-full')} className="border border-gray-300 rounded p-3 text-left hover:border-blue-500">
          <div className="font-medium text-sm">Full PDF report</div>
          <div className="text-xs text-gray-500">Print-ready PDF with all issues.</div>
        </button>
        <button disabled={busy} onClick={() => go('pdf-exec')} className="border border-gray-300 rounded p-3 text-left hover:border-blue-500">
          <div className="font-medium text-sm">Executive summary PDF</div>
          <div className="text-xs text-gray-500">Score + module summary + top issues.</div>
        </button>
        <button disabled={busy} onClick={() => go('csv')} className="border border-gray-300 rounded p-3 text-left hover:border-blue-500">
          <div className="font-medium text-sm">Issues CSV</div>
          <div className="text-xs text-gray-500">Spreadsheet of all issues.</div>
        </button>
        <button disabled={busy} onClick={() => go('json')} className="border border-gray-300 rounded p-3 text-left hover:border-blue-500">
          <div className="font-medium text-sm">Raw JSON</div>
          <div className="text-xs text-gray-500">Full audit report data.</div>
        </button>
      </div>
      {busy && <div className="mt-4 text-sm text-gray-500">Generating {busy}…</div>}
      {last && (
        <div className="mt-4 text-sm">
          <a href={last.downloadUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Download {last.filename}</a>
        </div>
      )}
    </div>
  );
}
