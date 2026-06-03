import { ChangeRequest, DailyLog, Rfi, Submittal } from '@app/models/project-controls.types';
import { Billing, ChangeOrder, Project } from '@app/models/types';
import { coNumber } from '@features/projects/utils/change-management';

function escapeHtml(value?: string): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function projectHeader(project: Project): string {
  return `
  <h1>Brighten Builders LLC</h1>
  <div class="meta">
    <div><strong>Project:</strong> ${escapeHtml(project.projectName)}</div>
    <div><strong>Project Number:</strong> J${escapeHtml(project.projectNumber)}</div>
  </div>`;
}

const baseStyles = `
  body { font-family: Arial, sans-serif; color: #111; max-width: 800px; margin: 40px auto; line-height: 1.5; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  h2 { font-size: 14px; color: #555; margin-top: 0; font-weight: normal; }
  .meta { margin: 24px 0; }
  .meta div { margin: 4px 0; }
  .section { margin-top: 24px; }
`;

export function buildChangeRequestHtml(project: Project, cr: ChangeRequest): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(cr.crNumber ?? 'Change Request')}</title><style>${baseStyles}</style></head><body>
  ${projectHeader(project)}
  <h2>Change Request</h2>
  <div class="meta">
    <div><strong>CR #:</strong> ${escapeHtml(cr.crNumber)}</div>
    <div><strong>Date:</strong> ${escapeHtml(cr.requestDate)}</div>
    <div><strong>Requested By:</strong> ${escapeHtml(cr.requestedBy)}</div>
    <div><strong>Source:</strong> ${escapeHtml(cr.source)}</div>
    <div><strong>Type:</strong> ${escapeHtml(cr.changeType)}</div>
    <div><strong>Status:</strong> ${escapeHtml(cr.status)}</div>
  </div>
  <div class="section"><strong>Description</strong><p>${escapeHtml(cr.description)}</p></div>
  <div class="section"><strong>Reason</strong><p>${escapeHtml(cr.reason)}</p></div>
  </body></html>`;
}

export function buildRfiHtml(project: Project, rfi: Rfi): string {
  const submitted = rfi.submittedDate ?? rfi.dateSubmitted;
  const due = rfi.dueDate ?? rfi.neededByDate;
  const loc = rfi.location ?? rfi.locationDrawingReference;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(rfi.rfiNumber ?? 'RFI')}</title><style>${baseStyles}</style></head><body>
  ${projectHeader(project)}
  <h2>Request for Information</h2>
  <div class="meta">
    <div><strong>RFI #:</strong> ${escapeHtml(rfi.rfiNumber)}</div>
    <div><strong>Title:</strong> ${escapeHtml(rfi.title)}</div>
    <div><strong>Submitted:</strong> ${escapeHtml(submitted)}</div>
    <div><strong>Due:</strong> ${escapeHtml(due)}</div>
    <div><strong>Priority:</strong> ${escapeHtml(rfi.priority)}</div>
    <div><strong>Status:</strong> ${escapeHtml(rfi.status)}</div>
  </div>
  <div class="section"><strong>Question</strong><p>${escapeHtml(rfi.question)}</p></div>
  <div class="section"><strong>Reason</strong><p>${escapeHtml(rfi.reason)}</p></div>
  <div class="section"><strong>Location</strong><p>${escapeHtml(loc)}</p></div>
  <div class="section"><strong>Drawing / Spec</strong><p>${escapeHtml(rfi.drawingReference)} / ${escapeHtml(rfi.specReference)}</p></div>
  ${rfi.answer ? `<div class="section"><strong>Answer</strong><p>${escapeHtml(rfi.answer)}</p></div>` : ''}
  </body></html>`;
}

export function buildSubmittalCoverHtml(project: Project, sub: Submittal): string {
  const vendor = sub.vendor ?? sub.vendorSubcontractor ?? sub.subcontractor;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(sub.submittalNumber ?? 'Submittal')}</title><style>${baseStyles} table { width:100%; border-collapse:collapse; margin:16px 0; } th,td { border:1px solid #ccc; padding:8px; text-align:left; }</style></head><body>
  ${projectHeader(project)}
  <h2>Submittal Cover Sheet</h2>
  <table>
    <tr><th>Submittal #</th><td>${escapeHtml(sub.submittalNumber)}</td></tr>
    <tr><th>Title</th><td>${escapeHtml(sub.title ?? sub.description)}</td></tr>
    <tr><th>Spec Section</th><td>${escapeHtml(sub.specSection)}</td></tr>
    <tr><th>Vendor / Sub</th><td>${escapeHtml(vendor)}</td></tr>
    <tr><th>Package</th><td>${escapeHtml(sub.packageName)}</td></tr>
    <tr><th>Status</th><td>${escapeHtml(sub.status)}</td></tr>
    <tr><th>Required Date</th><td>${escapeHtml(sub.requiredDate)}</td></tr>
    <tr><th>Due Date</th><td>${escapeHtml(sub.dueDate)}</td></tr>
    <tr><th>Ball in Court</th><td>${escapeHtml(sub.ballInCourt)}</td></tr>
  </table>
  <div class="section"><strong>Description</strong><p>${escapeHtml(sub.description)}</p></div>
  </body></html>`;
}

export function buildDailyLogHtml(project: Project, log: DailyLog): string {
  const crew = log.employeesOnSite ?? log.crewOnSite;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Daily Log ${escapeHtml(log.logDate)}</title><style>${baseStyles}</style></head><body>
  ${projectHeader(project)}
  <h2>Daily Field Log</h2>
  <div class="meta">
    <div><strong>Date:</strong> ${escapeHtml(log.logDate)}</div>
    <div><strong>Foreman:</strong> ${escapeHtml(log.foreman ?? log.submittedBy)}</div>
    <div><strong>Weather:</strong> ${escapeHtml(log.weather)}</div>
    <div><strong>Crew:</strong> ${escapeHtml(crew)}</div>
    <div><strong>Temperature:</strong> ${escapeHtml(log.temperature)}</div>
  </div>
  <div class="section"><strong>Work Performed</strong><p>${escapeHtml(log.workPerformed)}</p></div>
  <div class="section"><strong>Areas Worked</strong><p>${escapeHtml(log.areasWorked)}</p></div>
  ${log.delays ? `<div class="section"><strong>Delays</strong><p>${escapeHtml(log.delays)}</p></div>` : ''}
  ${log.safetyIssues ? `<div class="section"><strong>Safety Issues</strong><p>${escapeHtml(log.safetyIssues)}</p></div>` : ''}
  </body></html>`;
}

export function buildPayAppHtml(project: Project, billing: Billing): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Pay App ${escapeHtml(billing.payAppNumber)}</title><style>${baseStyles} table { width:100%; border-collapse:collapse; margin:20px 0; } th,td { border:1px solid #ccc; padding:8px; }</style></head><body>
  ${projectHeader(project)}
  <h2>Pay Application</h2>
  <div class="meta">
    <div><strong>Pay App #:</strong> ${escapeHtml(billing.payAppNumber)}</div>
    <div><strong>Period:</strong> ${escapeHtml(billing.billingPeriod)}</div>
    <div><strong>Status:</strong> ${escapeHtml(billing.status)}</div>
  </div>
  <table>
    <tr><th>Work Completed This Period</th><td>${billing.workCompletedThisPeriod ?? 0}</td></tr>
    <tr><th>Stored Materials</th><td>${billing.storedMaterials ?? 0}</td></tr>
    <tr><th>Retainage</th><td>${billing.retainageAmount ?? 0}</td></tr>
    <tr><th>Total Billed To Date</th><td>${billing.totalBilledToDate ?? 0}</td></tr>
    <tr><th>Amount Paid</th><td>${billing.amountPaid ?? 0}</td></tr>
  </table>
  </body></html>`;
}

export function buildCertifiedPayrollCsv(
  project: Project,
  weekEnding: string,
  rows: string[][],
): string {
  const header = [
    'Project Number', 'Project Name', 'Week Ending', 'Employee', 'Classification',
    'Regular Hours', 'Overtime Hours', 'Gross Package',
  ];
  const lines = [header, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','));
  return lines.join('\n');
}

export function coFileName(co: ChangeOrder, project: Project): string {
  return `${coNumber(co) || 'CO'}-${project.projectNumber}-Change-Order.html`;
}
