/** QuickBooks Project Mgmt Sync — live QBO data exported to Google Sheets. */
export const QB_PROJECT_MGMT_SYNC = {
  spreadsheetId: '1vCYC3qM4cf3mDYfpaYk4Zkg1RUKONMqLcFdjAe3p9KA',
  url: 'https://docs.google.com/spreadsheets/d/1vCYC3qM4cf3mDYfpaYk4Zkg1RUKONMqLcFdjAe3p9KA/edit',
  tabs: {
    customers: ['Customers'],
    incomeByCustomer: ['Income by Customer Summary'],
    invoiceDetails: ['Invoice Details'],
    arAging: ['AR Aging Summary'],
    vendorBalance: ['Vendor Balance Summary'],
    billPayments: ['Bill Payments'],
    /** Detailed job cost transaction tabs. */
    detailCost: [
      'Project Cost Detail',
      'Bill Details',
      'Bill Detail',
      'Expense Details',
      'Vendor Bill Lines',
      'Job Cost Detail',
      'Transaction Detail by Account',
    ],
  },
  syncIntervalMs: 10 * 60 * 1000,
  storageKey: 'brighten.qbProjectMgmtSyncStore',
} as const;

export const QB_DETAIL_COST_WARNING =
  'QuickBooks summary sync is connected, but detailed job cost transaction sync is not available yet. Add a Bill Details or Project Cost Detail tab to import actual costs by vendor/account/job.';
