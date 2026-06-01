export function normalizeCompanyName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Canonical display names for the 24 QuickBooks subcontractor vendors. */
export const CANONICAL_VENDOR_NAMES: Record<string, string> = {
  briarwoodconstructioninc: 'Briarwood Construction Inc.',
  c4drywallfinishingllc: 'C4 Drywall Finishing LLC',
  techelectricllc: 'Tech Electric, LLC',
  jfdenneyinc: 'JF Denney Inc.',
  fdccontract: 'FDC Contract',
  jayhawkfiresprinklers: 'Jayhawk Fire Sprinklers',
  ckf: 'CKF',
  switzerbrotherspaintingllc: 'Switzer Brothers Painting LLC',
  daycopaintinginc: 'DayCo Painting, Inc',
  cdfcontractingllc: 'CDF Contracting LLC',
  kbuildingspecialtiesinc: 'K Building Specialties, Inc',
  kcplastering: 'KC Plastering',
  eldonsonsgutters: 'Eldon & Sons Gutters',
  jbblinds: 'J&B Blinds',
  kellerfiresafety: 'Keller Fire & Safety',
  randconstructioncompany: 'Rand Construction Company',
  mcglinnheatingandcooling: 'McGlinn Heating and Cooling',
  greatplainstileandstone: 'Great Plains Tile and Stone',
  pettyproductsinc: 'Petty Products, Inc.',
  scooterdoorservice: 'Scooter Door Service',
  kansasgraniteandtile: 'Kansas Granite and Tile',
  certifiedlifesafetyllc: 'Certified Life Safety, LLC',
  generalfiresprinkler: 'General Fire Sprinkler',
  higenesjanitorialserviceinc: "Hi-Gene's Janitorial Service, Inc.",
};

/** Drive folder short names → canonical master vendor name when known. */
export const VENDOR_FOLDER_ALIASES: Record<string, string> = {
  c4: 'C4 Drywall Finishing LLC',
  briarwood: 'Briarwood Construction Inc.',
  denney: 'JF Denney Inc.',
  jfdenney: 'JF Denney Inc.',
  tech: 'Tech Electric, LLC',
  techelectric: 'Tech Electric, LLC',
  ckf: 'CKF',
  kcplaster: 'KC Plastering',
  kcplastering: 'KC Plastering',
  eldonsons: 'Eldon & Sons Gutters',
  eldons: 'Eldon & Sons Gutters',
  jbblinds: 'J&B Blinds',
  jayhawk: 'Jayhawk Fire Sprinklers',
  keller: 'Keller Fire & Safety',
  mcglinn: 'McGlinn Heating and Cooling',
  petty: 'Petty Products, Inc.',
  greatplains: 'Great Plains Tile and Stone',
  dayco: 'DayCo Painting, Inc',
  fdc: 'FDC Contract',
  lw: 'L&W Supply Corporation',
  lwsupply: 'L&W Supply Corporation',
};

export function displayCompanyName(name: string): string {
  const trimmed = name.trim().replace(/\.\./g, '.').replace(/\s+$/, '').replace(/\.+$/, '').replace(/\s+/g, ' ');
  const norm = normalizeCompanyName(trimmed);
  if (CANONICAL_VENDOR_NAMES[norm]) return CANONICAL_VENDOR_NAMES[norm];
  if (trimmed.length <= 4 && trimmed === trimmed.toLowerCase()) return trimmed.toUpperCase();
  return trimmed;
}

export function resolveVendorFromFolderName(folderName: string): { companyName: string; matched: boolean } {
  const trimmed = folderName.trim();
  const norm = normalizeCompanyName(trimmed);
  const alias = VENDOR_FOLDER_ALIASES[norm];
  if (alias) return { companyName: alias, matched: true };
  const canonical = CANONICAL_VENDOR_NAMES[norm];
  if (canonical) return { companyName: canonical, matched: true };
  const partial = Object.entries(VENDOR_FOLDER_ALIASES).find(([key]) => norm.includes(key) || key.includes(norm));
  if (partial) return { companyName: partial[1], matched: true };
  return { companyName: trimmed, matched: false };
}

export function vendorNamesMatch(a: string, b: string): boolean {
  const na = normalizeCompanyName(displayCompanyName(a));
  const nb = normalizeCompanyName(displayCompanyName(b));
  if (na === nb) return true;
  const ca = CANONICAL_VENDOR_NAMES[na];
  const cb = CANONICAL_VENDOR_NAMES[nb];
  return !!(ca && cb && ca === cb);
}

export function findSubcontractorByName<T extends { companyName: string }>(
  subs: T[],
  name: string,
): T | undefined {
  const target = displayCompanyName(name);
  return subs.find(s => vendorNamesMatch(s.companyName, target));
}
