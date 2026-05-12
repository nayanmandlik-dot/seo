import React from 'react';
import { Routes, Route, Link, NavLink } from 'react-router-dom';
import Home from './pages/Home.jsx';
import LiveAudit from './pages/LiveAudit.jsx';
import Report from './pages/Report.jsx';
import Compare from './pages/Compare.jsx';

export default function App() {
  return (
    <div className="min-h-full">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="font-semibold text-lg">SEO Audit Tool</Link>
          <nav className="flex gap-3 text-sm">
            <NavLink to="/" className={({ isActive }) => isActive ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'}>Home</NavLink>
            <NavLink to="/compare" className={({ isActive }) => isActive ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'}>Compare</NavLink>
          </nav>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/audit/:sessionId" element={<LiveAudit />} />
          <Route path="/report/:sessionId/*" element={<Report />} />
          <Route path="/compare" element={<Compare />} />
        </Routes>
      </main>
    </div>
  );
}
