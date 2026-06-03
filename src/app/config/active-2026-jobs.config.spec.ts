import { describe, expect, it } from 'vitest';
import {
  ACTIVE_2026_JOB_NUMBERS,
  BRIGHTEN_PROFIT_TARGET,
  isActive2026ControlJob,
} from '@app/config/active-2026-jobs.config';

describe('active-2026-jobs.config', () => {
  it('defines exactly 28 control-list jobs', () => {
    expect(ACTIVE_2026_JOB_NUMBERS.size).toBe(28);
    expect(isActive2026ControlJob('158')).toBe(true);
    expect(isActive2026ControlJob('228')).toBe(true);
    expect(isActive2026ControlJob('155')).toBe(false);
  });

  it('uses 20% profit target', () => {
    expect(BRIGHTEN_PROFIT_TARGET).toBe(0.2);
  });
});
