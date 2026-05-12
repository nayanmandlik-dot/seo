import React from 'react';

const STYLES = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  warning: 'bg-amber-100 text-amber-800 border-amber-200',
  info: 'bg-gray-100 text-gray-700 border-gray-200',
};

export default function SeverityBadge({ severity }) {
  return (
    <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded border ${STYLES[severity] || STYLES.info}`}>
      {severity?.toUpperCase()}
    </span>
  );
}
