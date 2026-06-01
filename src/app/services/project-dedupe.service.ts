import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { auth } from '../firebase';
import { DataService } from './data.service';
import {
  findDuplicateProjectGroups,
  mergeProjectFields,
  pickCanonicalProject,
} from '../utils/project-dedupe';

export interface ProjectDedupeResult {
  groupsMerged: number;
  projectsRemoved: number;
  referencesMoved: number;
  passes: number;
}

@Injectable({ providedIn: 'root' })
export class ProjectDedupeService {
  private dataService = inject(DataService);

  running = signal(false);
  lastMessage = signal<string | null>(null);
  lastError = signal<string | null>(null);

  async dedupeProjects(maxPasses = 8): Promise<ProjectDedupeResult> {
    if (!auth.currentUser) {
      throw new Error('Sign in before removing duplicate projects.');
    }
    if (this.running()) {
      throw new Error('Duplicate cleanup already in progress.');
    }

    this.running.set(true);
    this.lastError.set(null);

    try {
      let totalGroupsMerged = 0;
      let totalProjectsRemoved = 0;
      let totalReferencesMoved = 0;
      let passes = 0;
      let deleteFailures = 0;

      for (let pass = 0; pass < maxPasses; pass++) {
        const projects = await this.dataService.waitForProjectsLoaded(pass ? 750 : 0);
        const duplicateGroups = findDuplicateProjectGroups(projects);
        if (!duplicateGroups.size) break;

        passes++;
        let passRemoved = 0;

        for (const [, group] of duplicateGroups) {
          const canonical = pickCanonicalProject(group);
          const duplicates = group.filter(p => p.id !== canonical.id);
          if (!duplicates.length) continue;

          totalGroupsMerged++;

          const mergedUpdates = duplicates.reduce(
            (acc, duplicate) => ({ ...acc, ...mergeProjectFields(canonical, duplicate) }),
            {} as ReturnType<typeof mergeProjectFields>,
          );
          if (Object.keys(mergedUpdates).length) {
            await firstValueFrom(this.dataService.updateProject(canonical.id, mergedUpdates));
          }

          for (const duplicate of duplicates) {
            try {
              totalReferencesMoved += await this.dataService.reassignProjectReferences(
                duplicate.id,
                canonical.id,
              );
              await firstValueFrom(this.dataService.deleteProject(duplicate.id));
              totalProjectsRemoved++;
              passRemoved++;
            } catch (error) {
              deleteFailures++;
              console.error(`Failed to remove duplicate project ${duplicate.id}:`, error);
            }
          }
        }

        if (passRemoved === 0) break;
      }

      const remaining = findDuplicateProjectGroups(
        await this.dataService.waitForProjectsLoaded(750),
      );

      const result: ProjectDedupeResult = {
        groupsMerged: totalGroupsMerged,
        projectsRemoved: totalProjectsRemoved,
        referencesMoved: totalReferencesMoved,
        passes,
      };

      if (totalProjectsRemoved) {
        const failureNote = deleteFailures
          ? ` ${deleteFailures} delete${deleteFailures === 1 ? '' : 's'} failed — check the browser console.`
          : '';
        this.lastMessage.set(
          `Removed ${totalProjectsRemoved} duplicate project${totalProjectsRemoved === 1 ? '' : 's'} across ${totalGroupsMerged} job group${totalGroupsMerged === 1 ? '' : 's'} (${passes} pass${passes === 1 ? '' : 'es'}).${failureNote}`,
        );
      } else if (remaining.size) {
        this.lastMessage.set(
          `Found ${remaining.size} duplicate group${remaining.size === 1 ? '' : 's'} (${remainingGroupsSummary(remaining)}) but could not remove them — check the browser console for errors.`,
        );
      } else {
        this.lastMessage.set('No duplicate projects found.');
      }

      return result;
    } catch (error: any) {
      const message = error?.message ?? 'Duplicate cleanup failed.';
      this.lastError.set(message);
      throw error;
    } finally {
      this.running.set(false);
    }
  }
}

function remainingGroupsSummary(groups: Map<string, import('../models/types').Project[]>): string {
  const examples = [...groups.values()]
    .slice(0, 3)
    .map(group => {
      const canonical = pickCanonicalProject(group);
      return `#${canonical.projectNumber || '?'} ${canonical.projectName}`;
    });
  return examples.join('; ');
}
