import { describe, expect, it } from 'vitest';
import { activeProjectFiles } from '../utils/project-documents.compute';
import { ProjectFile } from '../models/types';

describe('ProjectFilesRepository (via compute helpers)', () => {
  it('activeProjectFiles excludes archived rows', () => {
    const files: ProjectFile[] = [
      { id: 'a', projectId: 'p1', fileName: 'Active', documentType: 'Contract', documentStatus: 'Received' },
      { id: 'b', projectId: 'p1', fileName: 'Old', documentType: 'Contract', documentStatus: 'Received', archived: true },
      { id: 'c', projectId: 'p2', fileName: 'Other', documentType: 'Contract', documentStatus: 'Received' },
    ];
    expect(activeProjectFiles(files, 'p1').map(f => f.id)).toEqual(['a']);
  });
});
