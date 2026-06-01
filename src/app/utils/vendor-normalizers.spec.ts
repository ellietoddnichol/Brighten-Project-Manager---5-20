import { describe, expect, it } from 'vitest';
import {
  displayCompanyName,
  resolveVendorFromFolderName,
  vendorNamesMatch,
} from './vendor-normalizers';

describe('vendor-normalizers', () => {
  it('normalizes PDF artifact names', () => {
    expect(displayCompanyName('Briarwood Construction Inc..')).toBe('Briarwood Construction Inc.');
    expect(displayCompanyName('ckf')).toBe('CKF');
  });

  it('resolves Drive folder aliases', () => {
    expect(resolveVendorFromFolderName('C4')).toEqual({ companyName: 'C4 Drywall Finishing LLC', matched: true });
    expect(resolveVendorFromFolderName('Denney')).toEqual({ companyName: 'JF Denney Inc.', matched: true });
    expect(resolveVendorFromFolderName('Tech Electric')).toEqual({ companyName: 'Tech Electric, LLC', matched: true });
    expect(resolveVendorFromFolderName('KC Plaster')).toEqual({ companyName: 'KC Plastering', matched: true });
  });

  it('flags unknown Drive folder vendors', () => {
    expect(resolveVendorFromFolderName('MPI').matched).toBe(false);
    expect(resolveVendorFromFolderName('Engineer').matched).toBe(false);
  });

  it('matches vendor name variants', () => {
    expect(vendorNamesMatch('JF Denney Inc..', 'JF Denney Inc.')).toBe(true);
    expect(vendorNamesMatch('Tech', 'Tech Electric, LLC')).toBe(false);
  });
});
