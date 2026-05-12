import React from 'react';

function color(score) {
  if (score >= 70) return '#16a34a';
  if (score >= 40) return '#d97706';
  return '#dc2626';
}

export default function Gauge({ value = 0, label, size = 160 }) {
  const v = Math.max(0, Math.min(100, value));
  const r = size / 2 - 12;
  const c = 2 * Math.PI * r;
  const dash = (v / 100) * c;
  const stroke = color(v);
  return (
    <div className="inline-flex flex-col items-center">
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#e5e7eb" strokeWidth="12" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={stroke} strokeWidth="12" fill="none"
          strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        <text x="50%" y="50%" textAnchor="middle" dy=".35em"
          fontSize={size * 0.32} fontWeight="700" fill={stroke}>{v}</text>
      </svg>
      {label && <div className="mt-2 text-sm text-gray-600">{label}</div>}
    </div>
  );
}
