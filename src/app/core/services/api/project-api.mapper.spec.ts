import { describe, expect, it } from 'vitest';
import { mapDashboardRowToProject } from './project-api.mapper';

describe('mapDashboardRowToProject', () => {
  it('maps v_project_dashboard row to Project model', () => {
    const project = mapDashboardRowToProject({
      id: 'proj-1',
      job_number: 'J208',
      project_name: 'PHSD 2026',
      customer: 'PHSD',
      foreman: 'Smith',
      project_status: 'active',
      billing_status: 'progress_billing',
      original_contract_amount: 1_000_000,
      billed_to_date: 250_000,
      balance_to_bill: 750_000,
      prevailing_wage: 1,
      cpr_required: 1,
      needs_review: 0,
      drive_folder_id: null,
      drive_status: 'missing_drive_folder',
      percent_complete: 25,
      profit_margin_percent: 18,
    });

    expect(project.id).toBe('proj-1');
    expect(project.projectNumber).toBe('208');
    expect(project.projectName).toBe('PHSD 2026');
    expect(project.status).toBe('Active');
    expect(project.billingStatus).toBe('Progress billing');
    expect(project.prevailingWage).toBe(true);
    expect(project.certifiedPayrollRequired).toBe(true);
    expect(project.contractPending).toBe(false);
  });

  it('marks pending contract when amount is zero', () => {
    const project = mapDashboardRowToProject({
      id: 'proj-220',
      job_number: '220',
      project_name: 'KC VA Medical Center',
      billing_status: 'pending_contract',
      original_contract_amount: 0,
      revised_contract_amount: 0,
    });

    expect(project.contractPending).toBe(true);
    expect(project.projectNumber).toBe('220');
  });
});
