import { describe, expect, it } from 'vitest';
import { mapActionCenterRowsToPriorities } from './action-center-api.mapper';
import { mapTaskApiRowToProjectTask } from './project-task-api.mapper';
import { mapDocumentApiRowToProjectFile } from './project-document-api.mapper';

describe('action-center-api.mapper', () => {
  it('maps SQL action center rows to home priorities', () => {
    const items = mapActionCenterRowsToPriorities([
      {
        id: 'ac-1',
        project_id: 'proj-158',
        job_number: '158',
        project_name: 'Blue Valley CTE 2026',
        issue: 'Missing contract backup',
        severity: 'error',
        next_action_label: 'Review contract',
        source: 'Drive',
        priority_rank: 5,
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0].projectId).toBe('proj-158');
    expect(items[0].jobNumber).toBe('158');
    expect(items[0].severity).toBe('error');
    expect(items[0].route).toBe('/projects/proj-158');
  });
});

describe('project-task-api.mapper', () => {
  it('maps SQL task rows to ProjectTask', () => {
    const task = mapTaskApiRowToProjectTask({
      id: 'task-1',
      project_id: 'proj-158',
      title: 'Submit COI',
      assigned_to: 'AJ Todd',
      due_date: '2026-06-15',
      status: 'in_progress',
      priority: 'High',
      task_group: 'Field Operations',
      source: 'manual',
    });

    expect(task.id).toBe('task-1');
    expect(task.projectId).toBe('proj-158');
    expect(task.status).toBe('In Progress');
    expect(task.priority).toBe('High');
  });
});

describe('project-document-api.mapper', () => {
  it('maps SQL document rows to ProjectFile', () => {
    const file = mapDocumentApiRowToProjectFile({
      id: 'doc-1',
      project_id: 'proj-158',
      file_name: 'Contract.pdf',
      document_type: 'Contract',
      source_status: 'linked',
      file_url: 'https://drive.google.com/file/d/abc/view',
    });

    expect(file.id).toBe('doc-1');
    expect(file.fileName).toBe('Contract.pdf');
    expect(file.documentStatus).toBe('linked');
  });
});
