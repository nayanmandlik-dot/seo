import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import SeverityBadge from '../components/SeverityBadge.jsx';

export default function Compare() {
  const [reports, setReports] = useState([]);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [diff, setDiff] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { api.listReports().then(setReports); }, []);

  async function run() {
    if (!a || !b) return;
    setLoading(true);
    try { setDiff(await api.compare(a, b)); }
    catch (e) { alert(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Compare audits</h1>
      <div className="bg-white border border-gray-200 rounded-lg p-4 grid grid-cols-2 gap-4">
        <Picker label="Older (A)" reports={reports} value={a} onChange={setA} />
        <Picker label="Newer (B)" reports={reports} value={b} onChange={setB} />
        <button onClick={run} disabled={!a || !b || loading} className="col-span-2 px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50">
          {loading ? 'Comparing…' : 'Compare'}
        </button>
      </div>
      {diff && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Stat title="Score change" value={(diff.scoreDelta >= 0 ? '+' : '') + diff.scoreDelta} color={diff.scoreDelta >= 0 ? 'text-green-600' : 'text-red-600'} />
          <Stat title="Fixed issues" value={diff.fixedIssues.length} color="text-green-600" />
          <Stat title="New issues" value={diff.newIssues.length} color="text-red-600" />
          <IssueList title="New issues" issues={diff.newIssues} />
          <IssueList title="Fixed issues" issues={diff.fixedIssues} />
        </div>
      )}
    </div>
  );
}

function Picker({ label, reports, value, onChange }) {
  return (
    <label className="block text-sm">
      <span className="text-gray-600">{label}</span>
      <select className="mt-1 w-full border border-gray-300 rounded px-2 py-1" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— select audit —</option>
        {reports.map(r => (
          <option key={r.sessionId} value={r.sessionId}>
            {new Date(r.completedAt || r.createdAt).toLocaleString()} — {r.rootUrl}
          </option>
        ))}
      </select>
    </label>
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

function IssueList({ title, issues }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 md:col-span-3">
      <h3 className="font-medium mb-2">{title} ({issues.length})</h3>
      {issues.length === 0 ? <div className="text-sm text-gray-500">None</div> : (
        <ul className="space-y-2 max-h-96 overflow-auto">
          {issues.slice(0, 200).map((i, idx) => (
            <li key={idx} className="text-sm border-l-2 pl-2 border-gray-200">
              <div className="flex gap-2 items-center"><SeverityBadge severity={i.severity} /><span className="font-medium">{i.checkName}</span><span className="text-xs text-gray-500">{i.module}</span></div>
              <div className="text-xs text-blue-600 break-all">{i.affectedUrl || '—'}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
