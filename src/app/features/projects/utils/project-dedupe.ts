import { Project } from '@app/models/types';

import { normalizeJobKey, parseJobLabel } from '@shared/utils/master-sheet-parser';



export function normalizeProjectNumber(value: string | number | undefined | null): string {

  if (value == null || value === '') return '';



  let trimmed = String(value).trim();

  if (!trimmed) return '';



  if (trimmed.includes(' - ')) {

    trimmed = parseJobLabel(trimmed).projectNumber;

  }



  if (/^j(\d+)$/i.test(trimmed)) {

    trimmed = trimmed.slice(1);

  }



  const n = Number(trimmed);

  if (Number.isFinite(n) && trimmed !== '' && !/[a-zA-Z]/.test(trimmed)) {

    return String(Math.trunc(n));

  }



  return trimmed.toLowerCase();

}



export function extractLeadingJobNumber(text: string | undefined): string {

  if (!text?.trim()) return '';



  const trimmed = text.trim();

  if (trimmed.includes(' - ')) {

    return normalizeProjectNumber(parseJobLabel(trimmed).projectNumber);

  }



  const dashMatch = trimmed.match(/^j?(\d+)\s*[-–—]/i);

  if (dashMatch) return normalizeProjectNumber(dashMatch[1]);



  if (/^j?\d+$/i.test(trimmed)) return normalizeProjectNumber(trimmed);



  return '';

}



function addNumericKey(keys: Set<string>, num: string): void {

  const normalized = normalizeProjectNumber(num);

  if (normalized && /^\d+$/.test(normalized)) {

    keys.add(`num:${normalized}`);

  }

}



/** All keys that identify the same job across seed / master sheet / manual records. */

export function canonicalJobKeys(project: Partial<Project>): string[] {

  const keys = new Set<string>();



  addNumericKey(keys, normalizeProjectNumber(project.projectNumber));



  const nameNum = extractLeadingJobNumber(project.projectName);

  if (nameNum) addNumericKey(keys, nameNum);



  if (project.seedProjectId) {

    keys.add(`seed:${project.seedProjectId}`);

    addNumericKey(keys, project.seedProjectId.replace(/^J/i, ''));

  }



  if (project.masterSheetJobId) {

    keys.add(`master:${normalizeJobKey(project.masterSheetJobId)}`);

    const parsed = parseJobLabel(project.masterSheetJobId);

    addNumericKey(keys, parsed.projectNumber);

  }



  if (project.projectName?.trim()) {

    keys.add(`name:${normalizeJobKey(project.projectName)}`);

  }



  return [...keys];

}



function countPopulatedFields(project: Project): number {

  return Object.values(project).filter(v => v != null && v !== '').length;

}



/** Prefer seeded / master-sheet-linked records with the richest data. */

export function scoreProjectForCanonical(project: Project): number {

  let score = 0;

  if (project.seedProjectId) score += 1000;

  if (project.masterSheetJobId) score += 500;

  if (project.wipStatus) score += 50;

  if (project.currentActivity) score += 20;

  if (project.phase) score += 20;

  if (project.originalContractAmount) score += 10;

  if (project.masterSheetSyncedAt) score += 10;

  if (project.timeDataSheetSyncedAt) score += 10;

  score += countPopulatedFields(project);

  return score;

}



export function pickCanonicalProject(candidates: Project[]): Project {

  return [...candidates].sort((a, b) => {

    const scoreDiff = scoreProjectForCanonical(b) - scoreProjectForCanonical(a);

    if (scoreDiff !== 0) return scoreDiff;

    return a.id.localeCompare(b.id);

  })[0];

}



class UnionFind {

  private parent = new Map<string, string>();



  find(id: string): string {

    const parent = this.parent.get(id) ?? id;

    if (parent !== id) {

      const root = this.find(parent);

      this.parent.set(id, root);

      return root;

    }

    this.parent.set(id, id);

    return id;

  }



  union(a: string, b: string): void {

    const rootA = this.find(a);

    const rootB = this.find(b);

    if (rootA !== rootB) {

      this.parent.set(rootA, rootB);

    }

  }

}



/** Group projects that share any canonical job key (num, seed id, master sheet id). */

export function findDuplicateProjectGroups(projects: Project[]): Map<string, Project[]> {

  if (!projects.length) return new Map();



  const uf = new UnionFind();

  const keyToProjectIds = new Map<string, string[]>();



  for (const project of projects) {

    uf.find(project.id);

    for (const key of canonicalJobKeys(project)) {

      const ids = keyToProjectIds.get(key) ?? [];

      if (ids.length) {

        uf.union(project.id, ids[0]);

      }

      ids.push(project.id);

      keyToProjectIds.set(key, ids);

    }

  }



  const components = new Map<string, Project[]>();

  for (const project of projects) {

    const root = uf.find(project.id);

    const list = components.get(root) ?? [];

    list.push(project);

    components.set(root, list);

  }



  return new Map([...components.entries()].filter(([, list]) => list.length > 1));

}



export function findProjectMatches(

  projects: Project[],

  criteria: {

    seedProjectId?: string;

    projectNumber?: string;

    masterSheetJobId?: string;

    projectName?: string;

  },

): Project[] {

  const probeKeys = new Set(

    canonicalJobKeys({

      seedProjectId: criteria.seedProjectId,

      projectNumber: criteria.projectNumber,

      masterSheetJobId: criteria.masterSheetJobId,

      projectName: criteria.projectName,

    }),

  );

  if (!probeKeys.size) return [];



  return projects.filter(p => canonicalJobKeys(p).some(key => probeKeys.has(key)));

}



/** Hide duplicate rows in the UI while Firestore cleanup catches up. */

export function dedupeProjectsForDisplay(projects: Project[]): Project[] {

  const groups = findDuplicateProjectGroups(projects);

  if (!groups.size) return projects;



  const dropIds = new Set<string>();

  for (const [, group] of groups) {

    const canonical = pickCanonicalProject(group);

    for (const project of group) {

      if (project.id !== canonical.id) {

        dropIds.add(project.id);

      }

    }

  }



  return projects.filter(p => !dropIds.has(p.id));

}



export function mergeProjectFields(primary: Project, secondary: Project): Partial<Project> {

  const merged: Partial<Project> = {};

  const fields: (keyof Project)[] = [

    'seedProjectId', 'masterSheetJobId', 'masterSheetStatus', 'masterSheetUrl',

    'wipStatus', 'phase', 'currentActivity', 'county', 'address', 'customer',

    'originalContractAmount', 'totalLaborHours', 'regularHours', 'overtimeHours',

    'doubleTimeHours', 'lastTimelogDate', 'timelogEntryCount',

  ];



  for (const field of fields) {

    const primaryVal = primary[field];

    const secondaryVal = secondary[field];

    if ((primaryVal == null || primaryVal === '') && secondaryVal != null && secondaryVal !== '') {

      (merged as Record<string, unknown>)[field] = secondaryVal;

    }

  }



  return merged;

}

