import { Project, TimeEntry } from '@app/models/types';
import { timeEntryMatchesProject } from './time-entry-project-match';

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    projectNumber: 'J204',
    projectName: 'Sample Job',
    ...overrides,
  } as Project;
}

function entry(overrides: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: 'e1',
    recordId: 'e1',
    regularHours: 8,
    overtimeHours: 0,
    doubleTimeHours: 0,
    totalHours: 8,
    ...overrides,
  };
}

describe('timeEntryMatchesProject', () => {
  it('does not match entries with no job label', () => {
    expect(timeEntryMatchesProject(project(), entry({ jobIdLabel: undefined }))).toBe(false);
    expect(timeEntryMatchesProject(project(), entry({ jobIdLabel: '' }))).toBe(false);
    expect(timeEntryMatchesProject(project(), entry({ jobIdLabel: '   ' }))).toBe(false);
  });

  it('matches by projectId when job label is present', () => {
    expect(timeEntryMatchesProject(
      project({ id: 'p1' }),
      entry({ projectId: 'p1', jobIdLabel: 'J204 - Sample Job' }),
    )).toBe(true);
  });

  it('matches by full job label', () => {
    expect(timeEntryMatchesProject(
      project(),
      entry({ jobIdLabel: 'J204 - Sample Job' }),
    )).toBe(true);
  });

  it('matches by job number only in label', () => {
    expect(timeEntryMatchesProject(
      project(),
      entry({ jobIdLabel: 'J204' }),
    )).toBe(true);
  });

  it('does not match a different job', () => {
    expect(timeEntryMatchesProject(
      project({ projectNumber: 'J204' }),
      entry({ jobIdLabel: 'J305 - Other Job' }),
    )).toBe(false);
  });

  it('does not use loose prefix matching (J2 vs J204)', () => {
    expect(timeEntryMatchesProject(
      project({ projectNumber: 'J2', projectName: 'Short' }),
      entry({ jobIdLabel: 'J204 - Longer Number' }),
    )).toBe(false);
  });
});
