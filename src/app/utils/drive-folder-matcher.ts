import type {
  DriveFolderMappingRule,
  FolderMatchCandidate,
  FolderMatchConfidence,
  FolderMatchMethod,
  ScannedDriveFolder,
} from '../models/drive-folder-mapping.types';
import { DRIVE_FOLDER_MAPPING_RULES } from '../models/drive-folder-mapping.types';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

export function isDriveFolder(mimeType: string): boolean {
  return mimeType === FOLDER_MIME;
}

/** Normalize folder names for alias matching. */
export function normalizeFolderToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizePathSegments(path: string): string[] {
  return path.split('/').map(s => normalizeFolderToken(s)).filter(Boolean);
}

export function driveFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}

function pathMatchesPattern(folderPath: string, pattern: string[]): boolean {
  const segments = normalizePathSegments(folderPath);
  if (pattern.length === 0) return false;
  if (pattern.length === 1) {
    return segments.some(seg => seg === pattern[0] || seg.includes(pattern[0]));
  }
  if (segments.length < pattern.length) return false;
  for (let i = 0; i <= segments.length - pattern.length; i++) {
    let ok = true;
    for (let j = 0; j < pattern.length; j++) {
      const seg = segments[i + j];
      const pat = pattern[j];
      if (seg !== pat && !seg.includes(pat)) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

function scoreMatch(
  folder: ScannedDriveFolder,
  rule: DriveFolderMappingRule,
  pattern: string[],
): { score: number; matchedBy: FolderMatchMethod; confidence: FolderMatchConfidence } {
  const segments = normalizePathSegments(folder.path);
  const lastSeg = segments[segments.length - 1] ?? '';

  if (segments.length === pattern.length) {
    const exact = pattern.every((p, i) => segments[i] === p);
    if (exact) {
      return { score: 100 - (rule.priority ?? 5), matchedBy: 'exact', confidence: 'high' };
    }
  }

  if (pathMatchesPattern(folder.path, pattern)) {
    const depthPenalty = Math.max(0, segments.length - pattern.length) * 3;
    return {
      score: 80 - depthPenalty - (rule.priority ?? 5),
      matchedBy: 'alias',
      confidence: segments.length === pattern.length ? 'high' : 'medium',
    };
  }

  if (rule.segmentAliases?.some(a => lastSeg === a || lastSeg.includes(a))) {
    const parentOk = pattern.length <= 1
      || (pattern.length === 2 && segments.length >= 2 && pathMatchesPattern(folder.path, pattern));
    if (parentOk || pattern.length <= 1) {
      return { score: 55 - (rule.priority ?? 5), matchedBy: 'alias', confidence: 'medium' };
    }
  }

  if (rule.key === 'CHANGE_ORDERS' && isChangeOrderFolderName(folder.name)) {
    return { score: 52 - (rule.priority ?? 5), matchedBy: 'alias', confidence: 'medium' };
  }

  return { score: 0, matchedBy: 'missing', confidence: 'missing' };
}

/** Match CO-number folders like CO001, CO 002 under Contract & COs. */
function isChangeOrderFolderName(name: string): boolean {
  const n = normalizeFolderToken(name);
  return /^co\d+$/.test(n.replace(/\s/g, '')) || n.startsWith('change order ');
}

function matchChangeOrderFolders(scanned: ScannedDriveFolder[]): FolderMatchCandidate | null {
  const candidates = scanned.filter(f => {
    const segments = normalizePathSegments(f.path);
    const parent = segments.length >= 2 ? segments[segments.length - 2] : '';
    const inCoSection = parent.includes('contract') || parent.includes('cos');
    return isChangeOrderFolderName(f.name) && (inCoSection || f.depth <= 2);
  });
  if (!candidates.length) return null;
  const best = candidates.sort((a, b) => b.path.length - a.path.length)[0];
  return {
    folderKey: 'CHANGE_ORDERS',
    folder: best,
    matchedBy: 'alias',
    confidence: 'medium',
    score: 58,
    needsReview: candidates.length > 1,
  };
}

/** Match photos folders: * PO Images, * Progress Pictures at depth 1. */
function matchPoImagesFolder(scanned: ScannedDriveFolder[]): FolderMatchCandidate | null {
  const candidates = scanned.filter(f => {
    const n = normalizeFolderToken(f.name);
    return n.includes('po images')
      || n.includes('po log images')
      || n.includes('receipt images')
      || /^j\d+ po images$/.test(n.replace(/\s+/g, ' '));
  });
  if (!candidates.length) return null;
  const best = candidates.sort((a, b) => a.name.length - b.name.length)[0];
  return {
    folderKey: 'PO_IMAGES',
    folder: best,
    matchedBy: 'alias',
    confidence: 'medium',
    score: 62,
    needsReview: candidates.length > 1,
  };
}

/** Match progress photo folders at depth 1. */
function matchPhotosFolder(scanned: ScannedDriveFolder[]): FolderMatchCandidate | null {
  const candidates = scanned.filter(f => {
    if (f.depth !== 1) return false;
    const n = normalizeFolderToken(f.name);
    return n.includes('po images') || n.includes('progress pictures') || n.endsWith(' photos');
  });
  if (!candidates.length) return null;
  const best = candidates.sort((a, b) => a.name.length - b.name.length)[0];
  return {
    folderKey: 'PHOTOS',
    folder: best,
    matchedBy: 'alias',
    confidence: 'medium',
    score: 60,
    needsReview: candidates.length > 1,
  };
}

export function matchFoldersToRules(
  scanned: ScannedDriveFolder[],
  rules: DriveFolderMappingRule[] = DRIVE_FOLDER_MAPPING_RULES,
): Map<string, FolderMatchCandidate> {
  const results = new Map<string, FolderMatchCandidate>();
  const usedFolderIds = new Set<string>();

  for (const rule of rules) {
    if (rule.key === 'PROJECT_ROOT') continue;

    let best: FolderMatchCandidate | null = null;

    for (const folder of scanned) {
      for (const pattern of rule.pathPatterns) {
        const { score, matchedBy, confidence } = scoreMatch(folder, rule, pattern);
        if (score <= 0) continue;

        const candidate: FolderMatchCandidate = {
          folderKey: rule.key,
          folder,
          matchedBy,
          confidence,
          score,
          needsReview: false,
        };

        if (!best || candidate.score > best.score) {
          best = candidate;
        }
      }
    }

    if (best) {
      const dupes = scanned.filter(f =>
        f.id !== best!.folder.id
        && normalizePathSegments(f.path).join('/') === normalizePathSegments(best!.folder.path).join('/'),
      );
      best.needsReview = dupes.length > 0;
      results.set(rule.key, best);
      usedFolderIds.add(best.folder.id);
    }
  }

  const photos = matchPhotosFolder(scanned.filter(f => !usedFolderIds.has(f.id)));
  if (photos && !results.has('PHOTOS')) {
    results.set('PHOTOS', photos);
    usedFolderIds.add(photos.folder.id);
  }

  const poImages = matchPoImagesFolder(scanned.filter(f => !usedFolderIds.has(f.id)));
  if (poImages && !results.has('PO_IMAGES')) {
    results.set('PO_IMAGES', poImages);
    usedFolderIds.add(poImages.folder.id);
  }

  const coFolder = matchChangeOrderFolders(scanned.filter(f => !usedFolderIds.has(f.id)));
  if (coFolder && !results.has('CHANGE_ORDERS')) {
    results.set('CHANGE_ORDERS', coFolder);
    usedFolderIds.add(coFolder.folder.id);
  }

  // Flag keys that share the same physical folder (e.g. RFIS + CORRESPONDENCE)
  const byFolderId = new Map<string, string[]>();
  for (const [key, match] of results) {
    const ids = byFolderId.get(match.folder.id) ?? [];
    ids.push(key);
    byFolderId.set(match.folder.id, ids);
  }
  for (const keys of byFolderId.values()) {
    if (keys.length > 1) {
      for (const key of keys) {
        const m = results.get(key);
        if (m) m.needsReview = true;
      }
    }
  }

  return results;
}
