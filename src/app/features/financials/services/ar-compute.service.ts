import { Injectable, inject } from '@angular/core';
import { DataService } from '@core/services/data.service';
import { QuickBooksSyncDataService } from '@core/services/quickbooks-sync-data.service';
import { ProjectFinancialService } from '@features/projects/services/project-financial.service';
import { ProjectLifecycleService } from '@features/projects/services/project-lifecycle.service';
import {
  ArComputeContext,
  ArJobRow,
  ArPortfolioSummary,
  buildArJobRows,
  computeArPortfolioSummary,
} from '@features/financials/utils/ar.compute';
import { isOverheadJob } from '@shared/utils/project';

@Injectable({ providedIn: 'root' })
export class ArComputeService {
  private data = inject(DataService);
  private qbSync = inject(QuickBooksSyncDataService);
  private financials = inject(ProjectFinancialService);
  private lifecycle = inject(ProjectLifecycleService);

  buildContext(): ArComputeContext {
    const projects = this.data.projectsSnapshot().filter(p => !isOverheadJob(p));
    const lifecycles = new Map(projects.map(p => [p.id, this.lifecycle.forProject(p)]));
    const financialMap = new Map(projects.map(p => [p.id, this.financials.computeForProject(p)]));

    return {
      records: this.data.arRecordsSnapshot(),
      projects,
      lifecycles,
      qbHasArAgingTab: this.qbSync.arAging().length > 0,
      financials: financialMap,
    };
  }

  jobRows(ctx?: ArComputeContext): ArJobRow[] {
    return buildArJobRows(ctx ?? this.buildContext());
  }

  portfolioSummary(ctx?: ArComputeContext): ArPortfolioSummary {
    return computeArPortfolioSummary(ctx ?? this.buildContext());
  }

  jobRowForProject(projectId: string, ctx?: ArComputeContext): ArJobRow | undefined {
    return this.jobRows(ctx).find(r => r.projectId === projectId);
  }
}
