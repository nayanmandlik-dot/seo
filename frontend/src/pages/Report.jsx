import React, { useEffect, useState } from 'react';
import { useParams, NavLink, Routes, Route, Navigate } from 'react-router-dom';
import { api } from '../api.js';
import Overview from './tabs/Overview.jsx';
import Issues from './tabs/Issues.jsx';
import Pages from './tabs/Pages.jsx';
import Structure from './tabs/Structure.jsx';
import Speed from './tabs/Speed.jsx';
import Schema from './tabs/Schema.jsx';
import Duplicates from './tabs/Duplicates.jsx';
import Export from './tabs/Export.jsx';

const TABS = [
  ['', 'Overview'],
  ['issues', 'Issues'],
  ['pages', 'Pages'],
  ['structure', 'Site Structure'],
  ['speed', 'Speed'],
  ['schema', 'Schema'],
  ['duplicates', 'Duplicates'],
  ['export', 'Export'],
];

export default function Report() {
  const { sessionId } = useParams();
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getReport(sessionId).then(setReport).catch(e => setError(e.message));
  }, [sessionId]);

  if (error) return <div className="p-3 bg-red-100 text-red-800 rounded">Failed to load report: {error}</div>;
  if (!report) return (
    <div className="space-y-3">
      <div className="skeleton h-12" />
      <div className="skeleton h-64" />
    </div>
  );

  return (
    <div>
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{report.rootUrl}</h1>
          <div className="text-xs text-gray-500">Session {report.sessionId} • {new Date(report.completedAt || report.createdAt).toLocaleString()}</div>
        </div>
      </header>
      <nav className="flex flex-wrap gap-1 mb-4 border-b border-gray-200">
        {TABS.map(([slug, label]) => (
          <NavLink
            key={slug}
            to={`/report/${sessionId}/${slug}`}
            end={slug === ''}
            className={({ isActive }) => `px-3 py-2 text-sm rounded-t ${isActive ? 'bg-white border border-b-0 border-gray-200 font-medium text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<Overview report={report} />} />
        <Route path="issues" element={<Issues report={report} />} />
        <Route path="pages" element={<Pages report={report} />} />
        <Route path="structure" element={<Structure report={report} />} />
        <Route path="speed" element={<Speed report={report} />} />
        <Route path="schema" element={<Schema report={report} />} />
        <Route path="duplicates" element={<Duplicates report={report} />} />
        <Route path="export" element={<Export report={report} />} />
        <Route path="*" element={<Navigate to="" replace />} />
      </Routes>
    </div>
  );
}
