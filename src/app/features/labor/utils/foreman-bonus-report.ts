import {
  ForemanBonusExportFormat,
  ForemanBonusRecord,
  ForemanBonusReportMeta,
  ForemanBonusSummary,
} from '@app/models/foreman-bonus.types';

const REPORT_STYLES = `
  body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 24px; font-size: 12px; }
  h1 { margin: 0 0 4px; font-size: 22px; }
  h2 { margin: 24px 0 8px; font-size: 16px; }
  h3 { margin: 0 0 8px; font-size: 14px; }
  .company { font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.04em; }
  .meta { color: #4b5563; margin-bottom: 16px; line-height: 1.5; }
  .cards { display: grid; grid-template-columns: repeat(5, minmax(110px, 1fr)); gap: 10px; margin: 16px 0 20px; }
  .card { border: 1px solid #d1d5db; border-radius: 8px; padding: 10px; }
  .card label { display: block; font-size: 9px; text-transform: uppercase; color: #6b7280; margin-bottom: 4px; letter-spacing: 0.04em; }
  .card strong { font-size: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #d1d5db; padding: 6px 8px; vertical-align: top; }
  th { background: #f3f4f6; text-align: left; font-size: 9px; text-transform: uppercase; color: #4b5563; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  .foreman-section { page-break-after: always; margin-bottom: 32px; }
  .foreman-section:last-child { page-break-after: auto; }
  .job-block { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin-bottom: 12px; }
  .job-title { font-weight: bold; margin-bottom: 8px; }
  .job-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 16px; }
  .job-grid div { line-height: 1.45; }
  .review-flag { display: inline-block; background: #fef3c7; color: #92400e; font-size: 9px; font-weight: bold; padding: 2px 6px; border-radius: 999px; margin-left: 6px; text-transform: uppercase; }
  .totals-row td { font-weight: bold; background: #f9fafb; }
  @media print {
    body { margin: 12mm; }
    .foreman-section { page-break-after: always; }
    .no-print { display: none; }
  }
`;

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(value: number | undefined): string {
  return (value ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function pct(value: number | undefined): string {
  return `${((value ?? 0) * 100).toFixed(2)}%`;
}

function laborDelta(value: number | undefined): string {
  const amount = value ?? 0;
  if (amount > 0) return `-${money(amount)}`;
  if (amount < 0) return money(Math.abs(amount));
  return money(0);
}

function formatReportThrough(date?: string): string {
  if (!date) return '—';
  const parsed = new Date(`${date.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function statusBadge(record: ForemanBonusRecord): string {
  if (record.status !== 'NeedsReview') return '';
  return '<span class="review-flag">Needs Review</span>';
}

function jobLabel(record: ForemanBonusRecord): string {
  return `${record.jobNumber ?? '—'} — ${record.projectName ?? '—'}`;
}

function wrapHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>${REPORT_STYLES}</style>
</head>
<body>
  <div class="no-print" style="margin-bottom:16px;padding:10px 12px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;">
    Use your browser print dialog and choose <strong>Save as PDF</strong>.
  </div>
  ${body}
</body>
</html>`;
}

function combinedJobTable(records: ForemanBonusRecord[]): string {
  const rows = records.map(record => `
    <tr>
      <td>${escapeHtml(jobLabel(record))}${statusBadge(record)}</td>
      <td>${escapeHtml(record.foremanName)}</td>
      <td class="num">${money(record.actualLaborCost)}</td>
      <td class="num">${money(record.laborBudget)}</td>
      <td class="num">${pct(record.percentComplete)}</td>
      <td class="num">${money(record.currentLaborBudget)}</td>
      <td class="num">${laborDelta(record.laborSavings)}</td>
      <td class="num">${pct(record.billingReleasePercent)}</td>
      <td class="num">${money(record.foremanShareBonus)}</td>
      <td class="num">${money(record.bonusAvailableToReceive)}</td>
      <td class="num">${money(record.previouslyPaid)}</td>
      <td class="num">${money(record.payThisTerm)}</td>
      <td class="num">${money(record.remainingPotential)}</td>
      <td>${escapeHtml(record.notes ?? '')}</td>
    </tr>
  `).join('');

  const totals = records.reduce(
    (acc, record) => ({
      potential: acc.potential + record.foremanShareBonus,
      received: acc.received + record.bonusAvailableToReceive,
      paid: acc.paid + record.previouslyPaid,
      payThisTerm: acc.payThisTerm + record.payThisTerm,
      remaining: acc.remaining + record.remainingPotential,
    }),
    { potential: 0, received: 0, paid: 0, payThisTerm: 0, remaining: 0 },
  );

  return `
    <table>
      <thead>
        <tr>
          <th>Job # / Project</th>
          <th>Foreman</th>
          <th class="num">Labor Cost</th>
          <th class="num">Labor Budget</th>
          <th class="num">% Complete</th>
          <th class="num">Current Labor Budget</th>
          <th class="num">Labor Delta / Savings</th>
          <th class="num">Percent of Rec.</th>
          <th class="num">Potential Total Bonus</th>
          <th class="num">Bonus Total of Received</th>
          <th class="num">Prior Bonus Paid</th>
          <th class="num">Pay This Term</th>
          <th class="num">Potential Left to Receive</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <tr class="totals-row">
          <td colspan="8">Totals</td>
          <td class="num">${money(totals.potential)}</td>
          <td class="num">${money(totals.received)}</td>
          <td class="num">${money(totals.paid)}</td>
          <td class="num">${money(totals.payThisTerm)}</td>
          <td class="num">${money(totals.remaining)}</td>
          <td></td>
        </tr>
      </tbody>
    </table>
  `;
}

function summaryCards(summary: ForemanBonusSummary): string {
  return `
    <div class="cards">
      <div class="card"><label>Total Jobs</label><strong>${summary.totalJobs}</strong></div>
      <div class="card"><label>Total Bonus to Date</label><strong>${money(summary.totalBonusEarnedToDate)}</strong></div>
      <div class="card"><label>Potential Total Bonus</label><strong>${money(summary.potentialTotalBonus)}</strong></div>
      <div class="card"><label>Previously Paid</label><strong>${money(summary.previouslyPaid)}</strong></div>
      <div class="card"><label>Pay This Term</label><strong>${money(summary.payThisTerm)}</strong></div>
      <div class="card"><label>Remaining Potential</label><strong>${money(summary.remainingPotential)}</strong></div>
    </div>
  `;
}

export function buildCombinedPayPeriodSummaryHtml(
  meta: ForemanBonusReportMeta,
  sections: Array<{ summary: ForemanBonusSummary; records: ForemanBonusRecord[] }>,
): string {
  const header = `
    <div class="company">${escapeHtml(meta.companyName ?? 'Brighten Builders LLC')}</div>
    <h1>Foreman Bonus Summary</h1>
    <p class="meta">
      Report Through: ${escapeHtml(formatReportThrough(meta.reportThrough))}<br>
      Bonus Period: ${escapeHtml(meta.reportPeriodStart ?? '—')} to ${escapeHtml(meta.reportPeriodEnd ?? meta.reportThrough)}<br>
      ${meta.reportLabel ? `Report Label: ${escapeHtml(meta.reportLabel)}<br>` : ''}
      ${meta.bonusRunNumber != null ? `Bonus Run #: ${meta.bonusRunNumber}` : ''}
    </p>
  `;

  const body = sections.map(({ summary, records }) => `
    <section class="foreman-section">
      <h2>Foreman: ${escapeHtml(summary.foremanName)}</h2>
      <p class="meta">
        Total Jobs: ${summary.totalJobs} ·
        Total Bonus to Date: ${money(summary.totalBonusEarnedToDate)} ·
        Previously Paid: ${money(summary.previouslyPaid)} ·
        Pay This Term: ${money(summary.payThisTerm)} ·
        Remaining Potential: ${money(summary.remainingPotential)}
        ${summary.bonusNumber != null ? ` · Bonus #: ${summary.bonusNumber}` : ''}
      </p>
      ${combinedJobTable(records)}
      <p class="meta" style="margin-top:12px;">
        Total Jobs: ${summary.totalJobs}<br>
        Pay This Term: ${money(summary.payThisTerm)}<br>
        Total Bonus to Date: ${money(summary.totalBonusEarnedToDate)}<br>
        Previously Paid Total: ${money(summary.previouslyPaid)}<br>
        ${summary.bonusNumber != null ? `Bonus #: ${summary.bonusNumber}` : ''}
      </p>
    </section>
  `).join('');

  return wrapHtml(meta.reportLabel ?? 'Foreman Bonus Summary', header + body);
}

export function buildIndividualShortSummaryHtml(
  meta: ForemanBonusReportMeta,
  summary: ForemanBonusSummary,
): string {
  const body = `
    <h1>Foreman Bonus Summary – ${escapeHtml(summary.foremanName)}</h1>
    <p class="meta">Report Through: ${escapeHtml(formatReportThrough(meta.reportThrough))}</p>
    <h3>Bonus Overview</h3>
    <div class="cards">
      <div class="card"><label>Total Jobs</label><strong>${summary.totalJobs}</strong></div>
      <div class="card"><label>Total Bonus to Date</label><strong>${money(summary.totalBonusEarnedToDate)}</strong></div>
      <div class="card"><label>Previously Paid</label><strong>${money(summary.previouslyPaid)}</strong></div>
      <div class="card"><label>Pay This Term</label><strong>${money(summary.payThisTerm)}</strong></div>
      <div class="card"><label>Remaining Potential</label><strong>${money(summary.remainingPotential)}</strong></div>
    </div>
    <p class="meta">
      Notes<br>
      Report through ${escapeHtml(formatReportThrough(meta.reportThrough))}
      ${summary.bonusNumber != null ? `<br>Bonus #: ${summary.bonusNumber}` : ''}
    </p>
  `;
  return wrapHtml(`Foreman Bonus Summary – ${summary.foremanName}`, body);
}

export function buildIndividualFullBreakdownHtml(
  meta: ForemanBonusReportMeta,
  summary: ForemanBonusSummary,
  records: ForemanBonusRecord[],
): string {
  const jobs = records.map(record => `
    <div class="job-block">
      <div class="job-title">${escapeHtml(jobLabel(record))}${statusBadge(record)}</div>
      <div class="job-grid">
        <div>Labor Cost: ${money(record.actualLaborCost)}</div>
        <div>Labor Budget: ${money(record.laborBudget)}</div>
        <div>Percent Complete: ${pct(record.percentComplete)}</div>
        <div>Current Labor Budget: ${money(record.currentLaborBudget)}</div>
        <div>Labor Delta / Savings: ${laborDelta(record.laborSavings)}</div>
        <div>Billing Release %: ${pct(record.billingReleasePercent)}</div>
        <div>Potential Total Bonus: ${money(record.foremanShareBonus)}</div>
        <div>Bonus Total of Received: ${money(record.bonusAvailableToReceive)}</div>
        <div>Prior Bonus Paid: ${money(record.previouslyPaid)}</div>
        <div>Pay This Term: ${money(record.payThisTerm)}</div>
        <div>Remaining Potential: ${money(record.remainingPotential)}</div>
        ${record.notes ? `<div style="grid-column:1 / -1;">Notes: ${escapeHtml(record.notes)}</div>` : ''}
      </div>
    </div>
  `).join('');

  const body = `
    <h1>Foreman Bonus Summary – ${escapeHtml(summary.foremanName)}</h1>
    <p class="meta">
      Report Through: ${escapeHtml(formatReportThrough(meta.reportThrough))}
      ${summary.bonusNumber != null ? `<br>Bonus #: ${summary.bonusNumber}` : ''}
    </p>
    ${summaryCards(summary)}
    <h3>Job Breakdown</h3>
    ${jobs}
    <h3>Totals</h3>
    <div class="job-grid">
      <div>Total Bonus to Date: ${money(summary.totalBonusEarnedToDate)}</div>
      <div>Potential Total Bonus: ${money(summary.potentialTotalBonus)}</div>
      <div>Previously Paid: ${money(summary.previouslyPaid)}</div>
      <div>Pay This Term: ${money(summary.payThisTerm)}</div>
      <div>Remaining Potential: ${money(summary.remainingPotential)}</div>
    </div>
  `;
  return wrapHtml(`Foreman Bonus Full – ${summary.foremanName}`, body);
}

export function openForemanBonusReport(html: string, title: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) {
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title.replace(/\s+/g, '-').toLowerCase()}.html`;
    link.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function downloadForemanBonusCsv(records: ForemanBonusRecord[], filename: string): void {
  const header = [
    'Report Period Start',
    'Report Period End',
    'Report Through',
    'Bonus #',
    'Foreman',
    'Job #',
    'Project',
    'Labor Cost Basis',
    'Wages',
    'Fringe',
    'Actual Labor Cost',
    'Labor Budget',
    'Percent Complete',
    'Current Labor Budget',
    'Labor Savings',
    'Bonus Rate',
    'Foreman Share %',
    'Potential Total Bonus',
    'Billing Release %',
    'Bonus Available / Bonus Total of Received',
    'Previously Paid',
    'Pay This Term',
    'Remaining Potential',
    'Status',
    'Source',
    'Notes',
  ];

  const lines = records.map(record => [
    record.reportPeriodStart ?? '',
    record.reportPeriodEnd ?? '',
    record.reportPeriodEnd ?? '',
    record.bonusNumber ?? '',
    record.foremanName,
    record.jobNumber ?? '',
    record.projectName ?? '',
    record.laborCostBasis,
    record.wagesAmount ?? '',
    record.fringeAmount ?? '',
    record.actualLaborCost,
    record.laborBudget,
    record.percentComplete,
    record.currentLaborBudget,
    record.laborSavings,
    record.bonusRate,
    record.foremanSharePercent,
    record.foremanShareBonus,
    record.billingReleasePercent,
    record.bonusAvailableToReceive,
    record.previouslyPaid,
    record.payThisTerm,
    record.remainingPotential,
    record.status,
    record.source,
    record.notes ?? '',
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

  const csv = [header.join(','), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function buildForemanBonusReportHtml(
  format: ForemanBonusExportFormat,
  meta: ForemanBonusReportMeta,
  sections: Array<{ summary: ForemanBonusSummary; records: ForemanBonusRecord[] }>,
): string {
  if (format === 'combined') {
    return buildCombinedPayPeriodSummaryHtml(meta, sections);
  }
  const section = sections[0];
  if (!section) {
    return wrapHtml('Foreman Bonus Summary', '<p>No bonus records found for export.</p>');
  }
  if (format === 'short') {
    return buildIndividualShortSummaryHtml(meta, section.summary);
  }
  return buildIndividualFullBreakdownHtml(meta, section.summary, section.records);
}

/** @deprecated Use buildForemanBonusReportHtml */
export function buildForemanBonusSummaryHtml(
  summary: ForemanBonusSummary,
  records: ForemanBonusRecord[],
  reportLabel: string,
): string {
  return buildCombinedPayPeriodSummaryHtml(
    {
      companyName: 'Brighten Builders LLC',
      reportThrough: summary.reportPeriodEnd ?? '',
      reportPeriodStart: summary.reportPeriodStart,
      reportPeriodEnd: summary.reportPeriodEnd,
      reportLabel,
    },
    [{ summary, records }],
  );
}

/** @deprecated Use openForemanBonusReport */
export const openForemanBonusSummaryReport = openForemanBonusReport;
