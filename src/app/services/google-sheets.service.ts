import { Injectable, inject } from '@angular/core';
import { OPTIONAL_FINANCIAL_WORKBOOK, OptionalFinancialTabKey } from '../config/pay-app-billing.config';
import { SheetsService } from './sheets.service';
import { parsePayAppSheetRows } from '../utils/pay-app-billing-parser';

export interface PayAppRawData {
  projectMonthGrid: Record<string, unknown>[];
  invoiceDetail: Record<string, unknown>[];
  projectMonthImport: Record<string, unknown>[];
  payAppUpdateList: Record<string, unknown>[];
  no2026Billing: Record<string, unknown>[];
  fetchedAt: Date;
  missingTabs: string[];
}

@Injectable({ providedIn: 'root' })
export class GoogleSheetsService {
  private sheets = inject(SheetsService);

  getSpreadsheetId(): string {
    return OPTIONAL_FINANCIAL_WORKBOOK.spreadsheetId;
  }

  isConfigured(): boolean {
    return !!this.getSpreadsheetId();
  }

  async getAllPayAppBillingData(): Promise<PayAppRawData> {
    const spreadsheetId = this.getSpreadsheetId();
    if (!spreadsheetId) {
      throw new Error('Optional financial workbook ID is not set. Add it in Settings if you want live sheet sync.');
    }

    const fetchedAt = new Date();
    const missingTabs: string[] = [];
    const result: PayAppRawData = {
      projectMonthGrid: [],
      invoiceDetail: [],
      projectMonthImport: [],
      payAppUpdateList: [],
      no2026Billing: [],
      fetchedAt,
      missingTabs,
    };

    const tabMap: Record<OptionalFinancialTabKey, keyof PayAppRawData> = {
      projectMonthGrid: 'projectMonthGrid',
      invoiceDetail: 'invoiceDetail',
      projectMonthImport: 'projectMonthImport',
      payAppUpdateList: 'payAppUpdateList',
      no2026Billing: 'no2026Billing',
    };

    await Promise.all(
      OPTIONAL_FINANCIAL_WORKBOOK.tabKeys.map(async key => {
        try {
          const rows = await this.readTab(key, spreadsheetId);
          (result[tabMap[key]] as Record<string, unknown>[]) = parsePayAppSheetRows(key, rows);
        } catch {
          missingTabs.push(key);
        }
      }),
    );

    result.missingTabs = missingTabs;
    return result;
  }

  /** @deprecated Use getAllPayAppBillingData — kept as alias. */
  async getAllWorkbookData() {
    const raw = await this.getAllPayAppBillingData();
    return {
      projects: [],
      breakdown: [],
      changes: [],
      invoices: raw.invoiceDetail,
      proposals: [],
      monthlyBilling: raw.projectMonthImport,
      fetchedAt: raw.fetchedAt,
      missingTabs: raw.missingTabs,
    };
  }

  private async readTab(tab: OptionalFinancialTabKey, spreadsheetId?: string): Promise<string[][]> {
    const id = spreadsheetId ?? this.getSpreadsheetId();
    if (!id) throw new Error('Spreadsheet ID is not configured.');
    const range = OPTIONAL_FINANCIAL_WORKBOOK.ranges[tab];
    return this.sheets.getValues(id, range);
  }
}
