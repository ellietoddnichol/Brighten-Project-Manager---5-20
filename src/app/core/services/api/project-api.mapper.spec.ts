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

  it('maps Phase 1B Overview + project_scope fields', () => {
    const project = mapDashboardRowToProject({
      id: 'proj-1b',
      job_number: 'J300',
      project_name: 'Phase 1B Job',
      project_profile: 'FullProject',
      retainage_percent: '5.00',
      award_date: '2026-01-15T06:00:00.000Z',
      current_phase: 'Construction',
      scope_summary: 'Summary',
      included_work: 'Included',
      exclusions: 'Excluded',
      schedule_access_notes: 'Access notes',
      closeout_requirements: 'Closeout',
    });

    expect(project.projectProfile).toBe('FullProject');
    expect(project.retainagePercent).toBe(5);
    expect(project.awardDate).toBe('2026-01-15');
    expect(project.currentPhase).toBe('Construction');
    expect(project.scopeSummary).toBe('Summary');
    expect(project.includedWork).toBe('Included');
    expect(project.exclusions).toBe('Excluded');
    expect(project.scheduleAccessNotes).toBe('Access notes');
    expect(project.closeoutRequirements).toBe('Closeout');
  });

  it('leaves Phase 1B fields undefined when scope row absent', () => {
    const project = mapDashboardRowToProject({
      id: 'proj-none',
      job_number: 'J301',
      project_name: 'No Scope',
      retainage_percent: null,
      award_date: null,
    });
    expect(project.retainagePercent).toBeUndefined();
    expect(project.awardDate).toBeUndefined();
    expect(project.scopeSummary).toBeUndefined();
  });

  it('builds driveFolderUrl from drive_folder_id', () => {
    const project = mapDashboardRowToProject({
      id: 'proj-2',
      job_number: '204',
      project_name: 'Lightedge',
      drive_folder_id: 'abc123XYZ',
    });

    expect(project.driveFolderId).toBe('abc123XYZ');
    expect(project.driveFolderUrl).toBe('https://drive.google.com/drive/folders/abc123XYZ');
  });
});
