import React from 'react';
import IssuesTable from '../../components/IssuesTable.jsx';

export default function Issues({ report }) {
  return <IssuesTable issues={report.results || []} />;
}
