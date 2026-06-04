/** Map Angular UI status labels → brighten_pm.projects.project_status */
export function uiStatusToSqlStatus(status: string): string {
  const s = status.trim();
  switch (s) {
    case 'Lead / Precon':
      return 'precon';
    case 'Awarded':
      return 'awarded';
    case 'Setup Needed':
      return 'setup_needed';
    case 'Active':
      return 'active';
    case 'Closeout':
      return 'closeout';
    case 'Closed':
      return 'closed';
    default:
      return s.toLowerCase().replace(/\s+/g, '_');
  }
}

/** Map Angular billing status labels → SQL billing_status */
export function uiBillingStatusToSql(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (s.includes('progress')) return 'progress_billing';
  if (s.includes('final')) return 'fully_billed';
  if (s.includes('pending') || s.includes('not started') || s.includes('no billing')) {
    return 'not_billed';
  }
  return raw.toLowerCase().replace(/\s+/g, '_');
}
