import fs from 'node:fs';
import path from 'node:path';
import { cellStr, jobNumberFromFilename } from './import-utils.mjs';

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function normalizeHeader(h) {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function parseDriveFolderCsv(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return { projectRoots: [], duplicateReviews: [] };

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  const idx = name => headers.indexOf(normalizeHeader(name));

  const jobIdx = idx('jobnumber') >= 0 ? idx('jobnumber') : idx('job');
  const nameIdx = idx('projectname') >= 0 ? idx('projectname') : idx('name');
  const folderIdx = idx('drivefolderid') >= 0 ? idx('drivefolderid') : idx('folderid');
  const statusIdx = idx('lifecyclestatus') >= 0 ? idx('lifecyclestatus') : idx('status');

  const projectRoots = [];
  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    const jobNumber = cellStr(cols[jobIdx]).replace(/^J/i, '');
    const driveFolderId = cellStr(cols[folderIdx]);
    if (!jobNumber || !driveFolderId) continue;
    const lifecycleRaw = statusIdx >= 0 ? cellStr(cols[statusIdx]).toLowerCase() : '';
    projectRoots.push({
      jobNumber,
      projectName: nameIdx >= 0 ? cellStr(cols[nameIdx]) : undefined,
      driveFolderId,
      lifecycleStatus: lifecycleRaw.includes('closed') ? 'closed' : 'inProgress',
    });
  }

  return { projectRoots };
}

export function parseDuplicateReviewCsv(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  const jobIdx = headers.findIndex(h => h.includes('job'));
  const noteIdx = headers.findIndex(h => h.includes('note') || h.includes('reason'));

  const duplicateReviews = [];
  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    const jobNumber = cellStr(cols[jobIdx >= 0 ? jobIdx : 0]).replace(/^J/i, '');
    if (!jobNumber) continue;
    duplicateReviews.push({
      jobNumber,
      note: noteIdx >= 0 ? cellStr(cols[noteIdx]) : 'Duplicate job folder in Drive — review before linking',
    });
  }
  return duplicateReviews;
}

export function buildDriveFolderSeed({ importsDir, seedsDir, existingSeedPath }) {
  const projectCsv = path.join(importsDir, 'clean_project_root_folder_ids.csv');
  const duplicateCsv = path.join(importsDir, 'duplicate_job_folder_ids_review.csv');

  let projectRoots = [];
  let duplicateReviews = [
    { jobNumber: '101', note: 'Duplicate job folder in Drive — review before linking' },
    { jobNumber: '102', note: 'Duplicate job folder in Drive — review before linking' },
    { jobNumber: '103', note: 'Duplicate job folder in Drive — review before linking' },
  ];
  let topLevelFolders = [];

  if (fs.existsSync(existingSeedPath)) {
    const existing = JSON.parse(fs.readFileSync(existingSeedPath, 'utf8'));
    topLevelFolders = existing.topLevelFolders ?? [];
    if (!fs.existsSync(projectCsv)) projectRoots = existing.projectRoots ?? [];
  }

  if (fs.existsSync(projectCsv)) {
    projectRoots = parseDriveFolderCsv(projectCsv).projectRoots;
  }
  if (fs.existsSync(duplicateCsv)) {
    duplicateReviews = parseDuplicateReviewCsv(duplicateCsv);
  }

  const inProgressCount = projectRoots.filter(p => p.lifecycleStatus !== 'closed').length;
  const closedCount = projectRoots.filter(p => p.lifecycleStatus === 'closed').length;

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      source: fs.existsSync(projectCsv)
        ? 'Drive audit CSV — clean project root folder IDs'
        : 'Drive audit seed (partial — drop CSV for full 91 roots)',
      inProgressCount,
      closedCount,
      totalCount: projectRoots.length,
    },
    topLevelFolders,
    duplicateReviews,
    projectRoots,
  };
}
