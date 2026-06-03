import { FirestoreAuditFields } from './firestore-lifecycle.types';

export type ActivityEntityType =
  | 'project'
  | 'project_file'
  | 'project_folder'
  | 'import_exception'
  | 'sync_run';

export type ActivityAction =
  | 'project_file.created'
  | 'project_file.updated'
  | 'project_file.archived'
  | 'project_file.restored'
  | 'project.updated'
  | 'drive_folder.linked';

export interface ActivityEvent extends FirestoreAuditFields {
  id: string;
  projectId?: string;
  entityType: ActivityEntityType;
  entityId: string;
  action: ActivityAction;
  title: string;
  description?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  source?: string;
}

export interface RecordActivityEventInput {
  projectId?: string;
  entityType: ActivityEntityType;
  entityId: string;
  action: ActivityAction;
  title: string;
  description?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  source?: string;
}
