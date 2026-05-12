// Standardized analyzer result object used by every module.
// { module, checkName, severity, affectedUrl, description, recommendation, value }

export const SEV = {
  CRITICAL: 'critical',
  WARNING: 'warning',
  INFO: 'info',
};

export function makeResult({ module, checkName, severity, affectedUrl, description, recommendation, value }) {
  return {
    module,
    checkName,
    severity,
    affectedUrl: affectedUrl || null,
    description: description || '',
    recommendation: recommendation || '',
    value: value === undefined ? null : value,
  };
}
