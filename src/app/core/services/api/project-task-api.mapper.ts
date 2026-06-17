import { ProjectTask } from '@app/models/types';
import { PROJECT_TASK_GROUPS } from '@app/models/project-controls.types';
import { ProjectTaskApiRow } from './project-api.types';

function str(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  return String(value);
}

function pick(row: ProjectTaskApiRow, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return undefined;
}

function mapTaskStatus(raw: unknown): ProjectTask['status'] {
  const s = String(raw ?? 'not_started').toLowerCase().replace(/_/g, ' ');
  if (s.includes('complete')) return 'Complete';
  if (s.includes('cancel')) return 'Canceled';
  if (s.includes('progress')) return 'In Progress';
  if (s.includes('wait')) return 'Waiting';
  return 'Not Started';
}

function mapPriority(raw: unknown): ProjectTask['priority'] {
  const p = String(raw ?? 'medium').toLowerCase();
  if (p.includes('critical')) return 'Critical';
  if (p.includes('high')) return 'High';
  if (p.includes('low')) return 'Low';
  return 'Medium';
}

function mapTaskGroup(raw: unknown): ProjectTask['taskGroup'] {
  const value = str(raw) ?? 'Field Operations';
  return (PROJECT_TASK_GROUPS as readonly string[]).includes(value)
    ? (value as ProjectTask['taskGroup'])
    : 'Field Operations';
}

function datePart(value: unknown): string | undefined {
  const raw = str(value);
  if (!raw) return undefined;
  return raw.slice(0, 10);
}

/** Map Cloud SQL v_project_tasks row → existing Angular ProjectTask model. */
export function mapTaskApiRowToProjectTask(row: ProjectTaskApiRow, index = 0): ProjectTask {
  const sourceRaw = str(pick(row, 'source'))?.toLowerCase();
  return {
    id: str(pick(row, 'id', 'task_id')) ?? `task-${index}`,
    projectId: str(pick(row, 'project_id')) ?? '',
    title: str(pick(row, 'title', 'task_title')) ?? 'Untitled task',
    description: str(pick(row, 'description')),
    assignedTo: str(pick(row, 'assigned_to', 'assignee')),
    dueDate: datePart(pick(row, 'due_date')),
    status: mapTaskStatus(pick(row, 'status', 'task_status')),
    priority: mapPriority(pick(row, 'priority')),
    taskGroup: mapTaskGroup(pick(row, 'task_group', 'group_name')),
    source: sourceRaw === 'system' ? 'system' : 'manual',
    systemTriggerKey: str(pick(row, 'system_trigger_key')),
    relatedRecordType: str(pick(row, 'related_record_type')),
    relatedRecordId: str(pick(row, 'related_record_id')),
    createdAt: str(pick(row, 'created_at')),
    completedAt: datePart(pick(row, 'completed_at')),
    notes: str(pick(row, 'notes')),
    ownerId: str(pick(row, 'owner_id')),
  };
}

export function mapTaskApiRowsToProjectTasks(rows: ProjectTaskApiRow[]): ProjectTask[] {
  return rows.map((row, index) => mapTaskApiRowToProjectTask(row, index));
}
