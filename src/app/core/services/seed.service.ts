import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DataService } from '@core/services/data.service';
import { Project } from '@app/models/types';
import { auth } from '@app/firebase';
import { createLazyJsonLoader } from '@core/utils/mock-data-loader';
import { BrightenSeedBundle } from '@app/data/brighten-seed.types';
import {
  resolveSeedProjectNumber,
  seedChangeOrderToFirestore,
  seedMilestoneToFirestore,
  seedProjectToFirestore,
} from '@shared/utils/brighten-seed-mapper';
import { findProjectMatches, pickCanonicalProject } from '@features/projects/utils/project-dedupe';
import { ProjectDedupeService } from '@core/services/project-dedupe.service';

const seedDataLoader = createLazyJsonLoader<BrightenSeedBundle>('brighten-project-seed.json');

@Injectable({ providedIn: 'root' })
export class SeedService {
  private dataService = inject(DataService);
  private projectDedupe = inject(ProjectDedupeService);
  seeding = signal(false);
  seedMessage = signal<string | null>(null);

  seedMeta: BrightenSeedBundle['meta'] | null = null;

  /** @deprecated Use syncActiveWip — load all creates duplicates. */
  async seedDemoData(): Promise<void> {
    await this.syncActiveWip();
  }

  /** Upsert projects + milestones from the 2026-05-21 seed bundle by job number. */
  async syncActiveWip(): Promise<void> {
    await this.applySeedBundle(true);
    await this.appendDedupeMessage();
  }

  private async appendDedupeMessage(): Promise<void> {
    const result = await this.projectDedupe.dedupeProjects();
    const dedupeNote = this.projectDedupe.lastMessage();
    if (dedupeNote) {
      this.seedMessage.set(`${this.seedMessage() ?? ''} ${dedupeNote}`.trim());
    }
    if (result.projectsRemoved === 0 && dedupeNote?.includes('could not remove')) {
      // keep seed success but surface dedupe warning via message
    }
  }

  private async applySeedBundle(upsert: boolean): Promise<void> {
    const SEED_DATA = await seedDataLoader.get();
    this.seedMeta = SEED_DATA.meta;
    const user = auth.currentUser;
    if (!user) {
      throw new Error('Sign in before loading seed data.');
    }

    this.seeding.set(true);
    this.seedMessage.set(null);

    const financialsByProjectId = new Map(
      SEED_DATA.financials.map(f => [f.projectId, f]),
    );

    try {
      const existing = await this.dataService.waitForProjectsLoaded();
      let existingProjects = upsert ? [...existing] : [];

      const existingMilestones = upsert
        ? await firstValueFrom(this.dataService.getMilestones())
        : [];

      const existingChangeOrders = upsert
        ? await firstValueFrom(this.dataService.getChangeOrders())
        : [];

      const seedIdToFirestoreId = new Map<string, string>();
      let projectsWritten = 0;
      let projectsCreated = 0;
      let projectsUpdated = 0;

      for (const seedProject of SEED_DATA.projects) {
        const financial = financialsByProjectId.get(seedProject.projectId);
        const payload = seedProjectToFirestore(seedProject, financial);
        const projectNumber = resolveSeedProjectNumber(seedProject);

        if (upsert) {
          const matches = findProjectMatches(existingProjects, {
            seedProjectId: seedProject.projectId,
            projectNumber,
          });
          const match = matches.length ? pickCanonicalProject(matches) : undefined;

          if (match) {
            await firstValueFrom(this.dataService.updateProject(match.id, payload));
            seedIdToFirestoreId.set(seedProject.projectId, match.id);
            projectsUpdated++;

            for (const duplicate of matches.filter(p => p.id !== match.id)) {
              await this.dataService.reassignProjectReferences(duplicate.id, match.id);
              await firstValueFrom(this.dataService.deleteProject(duplicate.id));
              existingProjects = existingProjects.filter(p => p.id !== duplicate.id);
            }
          } else {
            const created = await firstValueFrom(this.dataService.createProject({
              ...payload,
              customer: payload.customer ?? 'Brighten Builders LLC',
            }));
            seedIdToFirestoreId.set(seedProject.projectId, created.id);
            projectsCreated++;
            existingProjects.push(created as Project);
          }
        } else {
          const created = await firstValueFrom(this.dataService.createProject({
            ...payload,
            customer: payload.customer ?? 'Brighten Builders LLC',
          }));
          seedIdToFirestoreId.set(seedProject.projectId, created.id);
          projectsCreated++;
        }
        projectsWritten++;
      }

      let milestonesCreated = 0;
      let milestonesSkipped = 0;

      for (const seedMilestone of SEED_DATA.milestones) {
        const firestoreProjectId = seedIdToFirestoreId.get(seedMilestone.projectId);
        if (!firestoreProjectId) {
          milestonesSkipped++;
          continue;
        }

        const milestonePayload = seedMilestoneToFirestore(seedMilestone, firestoreProjectId);

        if (upsert) {
          const duplicate = existingMilestones.find(m =>
            m.projectId === firestoreProjectId &&
            m.title === milestonePayload.title &&
            m.plannedEndDate === milestonePayload.plannedEndDate,
          );
          if (duplicate) {
            milestonesSkipped++;
            continue;
          }
        }

        await firstValueFrom(this.dataService.createMilestone(milestonePayload));
        milestonesCreated++;
      }

      let changeOrdersCreated = 0;
      let changeOrdersUpdated = 0;
      let changeOrdersSkipped = 0;

      for (const seedChangeOrder of SEED_DATA.changeOrders ?? []) {
        let firestoreProjectId = seedIdToFirestoreId.get(seedChangeOrder.projectId);
        if (!firestoreProjectId) {
          const jobNum = seedChangeOrder.projectId.replace(/^J/i, '');
          const matches = findProjectMatches(existingProjects, {
            seedProjectId: seedChangeOrder.projectId,
            projectNumber: jobNum,
          });
          firestoreProjectId = matches.length ? pickCanonicalProject(matches).id : undefined;
        }
        if (!firestoreProjectId) {
          changeOrdersSkipped++;
          continue;
        }

        const coPayload = seedChangeOrderToFirestore(seedChangeOrder, firestoreProjectId);
        const seedTag = `seedChangeOrderId:${seedChangeOrder.changeOrderId}`;

        if (upsert) {
          const match = existingChangeOrders.find(co =>
            co.notes?.includes(seedTag) ||
            (co.projectId === firestoreProjectId &&
              co.coNumber === coPayload.coNumber &&
              co.title === coPayload.title),
          );

          if (match) {
            await firstValueFrom(this.dataService.updateChangeOrder(match.id, coPayload));
            changeOrdersUpdated++;
            continue;
          }
        }

        await firstValueFrom(this.dataService.createChangeOrder(coPayload));
        changeOrdersCreated++;
      }

      const asOf = SEED_DATA.meta.asOfDate;
      if (upsert) {
        this.seedMessage.set(
          `Seed sync (${asOf}): ${projectsUpdated} projects updated, ${projectsCreated} created, ${milestonesCreated} milestones added, ${changeOrdersUpdated} COs updated, ${changeOrdersCreated} COs created.`,
        );
      } else {
        this.seedMessage.set(
          `Loaded ${projectsWritten} projects and ${milestonesCreated} milestones from Brighten seed data (${asOf}).`,
        );
      }
    } catch (error) {
      console.error('Seed failed:', error);
      this.seedMessage.set('Failed to load seed data. Check the browser console for details.');
      throw error;
    } finally {
      this.seeding.set(false);
    }
  }
}
