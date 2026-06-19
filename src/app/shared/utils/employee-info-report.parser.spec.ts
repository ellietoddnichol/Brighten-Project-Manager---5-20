import { describe, expect, it } from 'vitest';
import { parseEmployeeInfoReportRows } from './employee-info-report.parser';
import { employeeNameMatchKey, formatEmployeeDisplayName } from './employee-name-match';

const SAMPLE_REPORT = [
  ['Employee Info Report', '', '', '', '', '', '', '', '', ''],
  ['Company: BRIGHTEN BUILDERS LLC', '', '', '', '', '', '', '', '', ''],
  ['Employee Name', 'Employee Address Line 1', 'Employee City', 'Employee State', 'Employee ZIP', 'Employee Status', 'Hire Date', 'Pay Type', 'Pay Rate Amount', 'Department Number'],
  ['Miller, Dustin', '11150 Siegel Cemetery Road', 'Excelsior Springs', 'Missouri', '640245356', 'Active', 45593, 'Hourly', 50.83, '005'],
  ['Miller, Dustin', '11150 Siegel Cemetery Road', 'Excelsior Springs', 'Missouri', '640245356', 'Active', 45593, 'Hourly', 48.63, '005'],
  ['TODD, ANTHONY J', '407 Logan Street', 'Leavenworth', 'Kansas', '66048', 'Terminated', 45425, 'Hourly', 17.5, '0'],
  ['Todd, Anthony J', '407 Logan Street', 'Leavenworth', 'Kansas', '66048', 'Active', 45425, 'Hourly', 45.78, '0'],
  ['Parkhurst, Colton', 'addr', 'city', 'KS', '66048', 'Active', 45425, 'Hourly', 44.63, '003'],
  ['Parkhurst, Colton', 'addr', 'city', 'KS', '66048', 'Active', 45425, 'Hourly', 49.32, '005'],
  ['Someone, No Rate', 'addr', 'city', 'KS', '66048', 'Active', 45425, 'Salary', 0, '003'],
] as string[][];

describe('employee-name-match', () => {
  it('matches last-first and first-last names', () => {
    expect(employeeNameMatchKey('Miller, Dustin')).toBe(employeeNameMatchKey('Dustin Miller'));
    expect(formatEmployeeDisplayName('Miller, Dustin')).toBe('Dustin Miller');
  });
});

describe('parseEmployeeInfoReportRows', () => {
  it('parses hourly employees and picks highest active rate per person', () => {
    const parsed = parseEmployeeInfoReportRows(SAMPLE_REPORT);
    expect(parsed).toHaveLength(3);

    const miller = parsed.find(r => r.displayName === 'Dustin Miller');
    expect(miller?.payPerHour).toBe(50.83);
    expect(miller?.status).toBe('Active');

    const todd = parsed.find(r => r.matchKey === employeeNameMatchKey('Todd, Anthony J'));
    expect(todd?.payPerHour).toBe(45.78);

    const colton = parsed.find(r => r.displayName.includes('Colton'));
    expect(colton?.payPerHour).toBe(49.32);
  });
});
