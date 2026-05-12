// Compare two audit reports — produces { newIssues, fixedIssues, scoreChange }.
export function compareReports(prev, curr) {
  const key = (i) => `${i.module}|${i.checkName}|${i.affectedUrl || ''}`;
  const prevSet = new Map();
  for (const i of prev.results || []) prevSet.set(key(i), i);
  const currSet = new Map();
  for (const i of curr.results || []) currSet.set(key(i), i);

  const newIssues = [];
  const fixedIssues = [];
  for (const [k, v] of currSet) if (!prevSet.has(k)) newIssues.push(v);
  for (const [k, v] of prevSet) if (!currSet.has(k)) fixedIssues.push(v);

  return {
    prev: { sessionId: prev.sessionId, score: prev.scores?.overall, issues: prev.results?.length || 0, completedAt: prev.completedAt },
    curr: { sessionId: curr.sessionId, score: curr.scores?.overall, issues: curr.results?.length || 0, completedAt: curr.completedAt },
    scoreDelta: (curr.scores?.overall ?? 0) - (prev.scores?.overall ?? 0),
    newIssues,
    fixedIssues,
  };
}
