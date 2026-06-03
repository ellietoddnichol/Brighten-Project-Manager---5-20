import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ProjectLaborActual } from '@app/models/labor-actual.types';
import { Project } from '@app/models/types';
import { DataService } from '@core/services/data.service';
import { LaborDataService } from '@features/labor/services/labor-data.service';
import { buildLaborActuals, laborCostFromActuals } from '@features/labor/utils/labor-actual.compute';
import { isCertifiedPayrollProject } from '@features/labor/utils/certified-payroll-week';
import { CertifiedPayrollTasksService } from '@features/labor/services/certified-payroll-tasks.service';

@Injectable({ providedIn: 'root' })
export class ProjectLaborActualService {
  private data = inject(DataService);
  private laborData = inject(LaborDataService);
  private cprTasks = inject(CertifiedPayrollTasksService);

  private cache = signal<ProjectLaborActual[]>([]);

  snapshot(): ProjectLaborActual[] {
    const local = this.cache();
    if (local.length) return local;
    return this.data.projectLaborActualsSnapshot();
  }

  forProject(projectId: string): ProjectLaborActual[] {
    return this.snapshot().filter(a => a.projectId === projectId);
  }

  laborCostForProject(projectId: string): number {
    return laborCostFromActuals(projectId, this.snapshot());
  }

  async refreshFromApprovedTime(projects?: Project[]): Promise<number> {
    const projectList = projects ?? this.data.projectsSnapshot();
    const actuals = buildLaborActuals(
      this.laborData.normalizedEntries(),
      this.data.timeEntriesSnapshot(),
      projectList,
      this.data.employeesSnapshot(),
    );

    this.cache.set(actuals);

    for (const actual of actuals) {
      await firstValueFrom(this.data.upsertProjectLaborActual(actual));
    }

    for (const project of projectList.filter(isCertifiedPayrollProject)) {
      const projectActuals = actuals.filter(a => a.projectId === project.id);
      if (projectActuals.length > 0) {
        await this.cprTasks.ensureWeeklyGenerateTask(project);
      }
    }

    return actuals.length;
  }
}
