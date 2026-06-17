import { ProjectFile } from '@app/models/types';
import { ProjectDocumentApiRow } from './project-api.types';

function str(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  return String(value);
}

function pick(row: ProjectDocumentApiRow, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return undefined;
}

/** Map Cloud SQL v_project_documents row → existing Angular ProjectFile model (read-only display). */
export function mapDocumentApiRowToProjectFile(row: ProjectDocumentApiRow, index = 0): ProjectFile {
  const fileName =
    str(pick(row, 'file_name'))
    ?? str(pick(row, 'document_name'))
    ?? str(pick(row, 'title'))
    ?? str(pick(row, 'document_type'))
    ?? 'Document';

  return {
    id: str(pick(row, 'id', 'document_id')) ?? `doc-${index}`,
    projectId: str(pick(row, 'project_id')) ?? '',
    folderKey: str(pick(row, 'folder_key')),
    fileName,
    fileId: str(pick(row, 'file_id', 'drive_file_id')),
    fileUrl: str(pick(row, 'file_url', 'drive_url', 'url')),
    mimeType: str(pick(row, 'mime_type')),
    documentType: str(pick(row, 'document_type')) ?? 'Document',
    documentStatus: str(pick(row, 'document_status', 'source_status', 'status')) ?? 'Unknown',
    relatedRecordType: str(pick(row, 'related_record_type')),
    relatedRecordId: str(pick(row, 'related_record_id')),
    driveFolderId: str(pick(row, 'drive_folder_id')),
    drivePath: str(pick(row, 'drive_path')),
    uploadedBy: str(pick(row, 'uploaded_by')),
    uploadedAt: str(pick(row, 'created_at', 'uploaded_at')),
    lastModifiedAt: str(pick(row, 'updated_at', 'last_modified_at', 'created_at')),
    notes: str(pick(row, 'notes')),
    ownerId: str(pick(row, 'owner_id')),
  };
}

export function mapDocumentApiRowsToProjectFiles(rows: ProjectDocumentApiRow[]): ProjectFile[] {
  return rows.map((row, index) => mapDocumentApiRowToProjectFile(row, index));
}
