import { ProjectTask } from '@app/models/types';

export function isManualProjectTask(task: Pick<ProjectTask, 'source'>): boolean {
  return task.source !== 'system';
}
