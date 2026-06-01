/** Brighten Drive folder discovery and project document mapping. */

export type FolderMatchMethod = 'exact' | 'alias' | 'manual' | 'fallback' | 'missing';
export type FolderMatchConfidence = 'high' | 'medium' | 'low' | 'missing';
export type FolderLinkStatus = 'Linked' | 'Missing' | 'Needs Review' | 'Manual';

/** Alias for ProjectFolder records used as folder links. */
export type ProjectFolderLink = {
  id: string;
  projectId: string;
  folderKey: string;
  displayName: string;
  driveFolderId?: string;
  drivePath?: string;
  folderUrl?: string;
  matchedBy: FolderMatchMethod;
  confidence: FolderMatchConfidence;
  isSystemRequired: boolean;
  needsReview?: boolean;
  linkStatus: FolderLinkStatus;
  lastScannedAt?: string;
  notes?: string;
  sortOrder: number;
};

export type DriveFolderMappingRule = {
  key: string;
  displayName: string;
  expectedPath: string;
  isSystemRequired: boolean;
  sortOrder: number;
  /** Path segments from project root, normalized tokens per segment. */
  pathPatterns: string[][];
  /** Single-segment aliases at any depth under a matching parent. */
  segmentAliases?: string[];
  /** Prefer this pattern when multiple matches exist (lower = higher priority). */
  priority?: number;
};

export const DRIVE_FOLDER_MAPPING_RULES: DriveFolderMappingRule[] = [
  {
    key: 'PROJECT_ROOT',
    displayName: 'Project Root',
    expectedPath: '(project folder)',
    isSystemRequired: true,
    sortOrder: 0,
    pathPatterns: [],
  },
  {
    key: 'BID_PRICING',
    displayName: 'Bid & Pricing',
    expectedPath: 'Bid & Pricing',
    isSystemRequired: false,
    sortOrder: 1,
    pathPatterns: [['bid pricing'], ['bid and pricing']],
    segmentAliases: ['bid pricing', 'bid and pricing'],
  },
  {
    key: 'CHANGE_REQUESTS',
    displayName: 'Change Requests',
    expectedPath: 'Bid & Pricing / Change Requests Pending',
    isSystemRequired: false,
    sortOrder: 2,
    pathPatterns: [
      ['bid pricing', 'change requests pending'],
      ['bid and pricing', 'change requests pending'],
    ],
    segmentAliases: ['change requests pending'],
    priority: 1,
  },
  {
    key: 'CONTRACT',
    displayName: 'Contract',
    expectedPath: 'Contract & COs / Contract',
    isSystemRequired: false,
    sortOrder: 3,
    pathPatterns: [
      ['contract cos', 'contract'],
      ['contract and cos', 'contract'],
    ],
    segmentAliases: ['contract'],
    priority: 1,
  },
  {
    key: 'CHANGE_ORDERS',
    displayName: 'Change Orders',
    expectedPath: 'Contract & COs / Change Orders',
    isSystemRequired: false,
    sortOrder: 4,
    pathPatterns: [
      ['contract cos', 'change orders'],
      ['contract and cos', 'change orders'],
      ['contract cos', 'change order x'],
      ['contract and cos', 'change order x'],
    ],
    segmentAliases: ['change orders', 'change order x'],
    priority: 1,
  },
  {
    key: 'CLOSEOUT',
    displayName: 'Closeout',
    expectedPath: 'Contract & COs / Closeout',
    isSystemRequired: false,
    sortOrder: 5,
    pathPatterns: [
      ['contract cos', 'closeout'],
      ['contract and cos', 'closeout'],
      ['contract cos', 'closeouts'],
      ['contract and cos', 'closeouts'],
      ['contract cos', 'close out'],
      ['contract and cos', 'close out'],
    ],
    segmentAliases: ['closeout', 'closeouts', 'close out'],
    priority: 2,
  },
  {
    key: 'RFIS',
    displayName: 'RFIs',
    expectedPath: 'Correspondence',
    isSystemRequired: false,
    sortOrder: 6,
    pathPatterns: [['correspondence']],
    segmentAliases: ['correspondence', 'rfis', 'rfi'],
  },
  {
    key: 'CORRESPONDENCE',
    displayName: 'Correspondence',
    expectedPath: 'Correspondence',
    isSystemRequired: false,
    sortOrder: 7,
    pathPatterns: [['correspondence']],
    segmentAliases: ['correspondence'],
    priority: 1,
  },
  {
    key: 'SUBMITTALS',
    displayName: 'Submittals',
    expectedPath: 'Material & Submittals / Submittals',
    isSystemRequired: false,
    sortOrder: 8,
    pathPatterns: [
      ['material submittals', 'submittals'],
      ['material and submittals', 'submittals'],
    ],
    segmentAliases: ['submittals'],
    priority: 1,
  },
  {
    key: 'APPROVED_SUBMITTALS',
    displayName: 'Approved Submittals',
    expectedPath: 'Material & Submittals / Approved Submittals',
    isSystemRequired: false,
    sortOrder: 9,
    pathPatterns: [
      ['material submittals', 'approved submittals'],
      ['material and submittals', 'approved submittals'],
    ],
    segmentAliases: ['approved submittals'],
    priority: 2,
  },
  {
    key: 'TAX_EXEMPTION',
    displayName: 'Tax Exemption Certificate',
    expectedPath: 'Material & Submittals / Tax Exemption Certificate',
    isSystemRequired: false,
    sortOrder: 10,
    pathPatterns: [
      ['material submittals', 'tax exemption certificate'],
      ['material and submittals', 'tax exemption certificate'],
      ['material submittals', 'tax exemtion certificate'],
      ['material and submittals', 'tax exemtion certificate'],
    ],
    segmentAliases: ['tax exemption certificate', 'tax exemtion certificate', 'tec'],
    priority: 3,
  },
  {
    key: 'BILLING',
    displayName: 'Pay Applications',
    expectedPath: 'Pay Apps & Labor Reports / Pay Applications',
    isSystemRequired: false,
    sortOrder: 11,
    pathPatterns: [
      ['pay apps labor reports', 'pay applications'],
      ['pay apps and labor reports', 'pay applications'],
    ],
    segmentAliases: ['pay applications', 'pay apps'],
    priority: 1,
  },
  {
    key: 'LIEN_WAIVERS',
    displayName: 'Lien Waivers',
    expectedPath: 'Pay Apps & Labor Reports / Waivers',
    isSystemRequired: false,
    sortOrder: 12,
    pathPatterns: [
      ['pay apps labor reports', 'waivers'],
      ['pay apps and labor reports', 'waivers'],
      ['pay apps labor reports', 'waviers'],
      ['pay apps and labor reports', 'waviers'],
    ],
    segmentAliases: ['waivers', 'waviers', 'lien waivers', 'lien waiver'],
    priority: 2,
  },
  {
    key: 'CERTIFIED_PAYROLL',
    displayName: 'Certified Payroll',
    expectedPath: 'Pay Apps & Labor Reports / Certified Payroll',
    isSystemRequired: false,
    sortOrder: 13,
    pathPatterns: [
      ['pay apps labor reports', 'certified payroll'],
      ['pay apps and labor reports', 'certified payroll'],
    ],
    segmentAliases: ['certified payroll', 'cpr', 'certified payroll sheets'],
    priority: 1,
  },
  {
    key: 'PLANS_SPECS',
    displayName: 'Plans & Specs',
    expectedPath: 'Plans & Specs',
    isSystemRequired: false,
    sortOrder: 14,
    pathPatterns: [['plans specs'], ['plans and specs'], ['plans'], ['drawings'], ['specs']],
    segmentAliases: ['plans specs', 'plans and specs', 'plans', 'drawings', 'specs'],
  },
  {
    key: 'SUBS',
    displayName: 'Subs',
    expectedPath: 'Subs',
    isSystemRequired: false,
    sortOrder: 15,
    pathPatterns: [['subs'], ['subcontractors']],
    segmentAliases: ['subs', 'subcontractors'],
  },
  {
    key: 'FIELD_RESOURCES',
    displayName: 'Field Resources',
    expectedPath: 'Field Resources',
    isSystemRequired: false,
    sortOrder: 16,
    pathPatterns: [['field resources'], ['superintendent docs']],
    segmentAliases: ['field resources', 'superintendent docs'],
  },
  {
    key: 'PO_IMAGES',
    displayName: 'PO Images / Receipts',
    expectedPath: 'J### - PO Images',
    isSystemRequired: false,
    sortOrder: 17,
    pathPatterns: [],
    segmentAliases: ['po images', 'po log images', 'receipt images', 'po log'],
    priority: 2,
  },
  {
    key: 'PHOTOS',
    displayName: 'Photos',
    expectedPath: 'PO Images / Progress Pictures',
    isSystemRequired: false,
    sortOrder: 18,
    pathPatterns: [],
    segmentAliases: ['po images', 'progress pictures', 'photos'],
    priority: 3,
  },
  {
    key: 'DAILY_LOGS',
    displayName: 'Daily Logs',
    expectedPath: 'Daily Logs',
    isSystemRequired: false,
    sortOrder: 19,
    pathPatterns: [['daily logs'], ['field reports']],
    segmentAliases: ['daily logs', 'field reports'],
  },
  {
    key: 'SAFETY',
    displayName: 'Safety',
    expectedPath: 'Safety',
    isSystemRequired: false,
    sortOrder: 20,
    pathPatterns: [['safety']],
    segmentAliases: ['safety'],
  },
  {
    key: 'INSPECTIONS',
    displayName: 'Permits / Inspections',
    expectedPath: 'Permits / Inspections',
    isSystemRequired: false,
    sortOrder: 21,
    pathPatterns: [['permits inspections'], ['inspections'], ['permits']],
    segmentAliases: ['inspections', 'permits'],
  },
];

/** @deprecated Use DRIVE_FOLDER_MAPPING_RULES */
export const PROJECT_FOLDER_KEYS = DRIVE_FOLDER_MAPPING_RULES.filter(r => r.key !== 'PROJECT_ROOT').map(r => ({
  key: r.key,
  name: r.displayName,
  sortOrder: r.sortOrder,
}));

export type ScannedDriveFolder = {
  id: string;
  name: string;
  path: string;
  parentId: string;
  depth: number;
};

export type FolderMatchCandidate = {
  folderKey: string;
  folder: ScannedDriveFolder;
  matchedBy: FolderMatchMethod;
  confidence: FolderMatchConfidence;
  score: number;
  needsReview: boolean;
};
