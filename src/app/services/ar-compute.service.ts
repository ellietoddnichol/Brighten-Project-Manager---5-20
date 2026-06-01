import { Injectable, inject } from '@angular/core';
import { DataService } from './data.service';
import { QuickBooksSyncDataService } from './quickbooks-sync-data.service';
import { ProjectFinancialService } from './project-financial.service';
import { ProjectLifecycleService } from './project-lifecycle.service';
import {
  ArComputeContext,
  ArJobRow,
  ArPortfolioSummary,
  buildArJobRows,
  computeArPortfolioSummary,
} from '../utils/ar.compute';
import { isOverheadJob } from '../utils/project';

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
