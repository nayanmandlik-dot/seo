// Production: VITE_API_URL points at the Render backend root,
//   e.g. https://seo-p307.onrender.com  → BASE becomes ${VITE_API_URL}/api
// Local dev: VITE_API_URL is unset, BASE falls back to "/api" which Vite's
//   proxy forwards to http://localhost:4000 (see vite.config.js).
const BASE = `${import.meta.env.VITE_API_URL || ''}/api`;
export const API_BASE = BASE;

async function http(path, init) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export const api = {
  listReports: () => http('/reports'),
  getReport: (id) => http(`/reports/${id}`),
  deleteReport: (id) => http(`/reports/${id}`, { method: 'DELETE' }),
  startAudit: (body) => http('/audit', { method: 'POST', body: JSON.stringify(body) }),
  cancelAudit: (id) => http(`/audit/${id}/cancel`, { method: 'POST' }),
  status: (id) => http(`/audit/${id}/status`),
  compare: (a, b) => http(`/compare/${a}/${b}`),
  exportPdf: (id, executive = false) => http(`/reports/${id}/export/pdf`, { method: 'POST', body: JSON.stringify({ executive }) }),
  exportCsv: (id) => http(`/reports/${id}/export/csv`, { method: 'POST' }),
  exportJson: (id) => http(`/reports/${id}/export/json`, { method: 'POST' }),
};
