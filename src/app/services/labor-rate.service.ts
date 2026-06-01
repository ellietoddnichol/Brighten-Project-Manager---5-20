import { Injectable } from '@angular/core';
import {
  ClassificationRateRecord,
  EmployeeRecord,
  RateMatchSource,
} from '../models/labor.types';
import { LABOR_SHEET } from '../config/labor-sheet.config';
import { normalizeEmployeeName, isNonUnionEmployee } from '../utils/labor-normalizers';

export interface MatchedLaborRate {
  unionArea: string;
  classification: string;
  baseRate?: number;
  fringeRate?: number;
  totalPackage?: number;
  source: RateMatchSource;
  fringeEligible: boolean;
}

@Injectable({ providedIn: 'root' })
export class LaborRateService {
  matchRate(
    employeeName: string | undefined,
    classification: string | undefined,
    employees: EmployeeRecord[],
    classificationRates: ClassificationRateRecord[],
    defaultArea = LABOR_SHEET.defaultUnionArea,
    defaultClassification = LABOR_SHEET.defaultClassification,
  ): MatchedLaborRate {
    const employeeKey = normalizeEmployeeName(employeeName);
    const employee = employees.find(e => normalizeEmployeeName(e.employeeName) === employeeKey);

    const entryClassification = classification?.trim();
    const employeeClassification = employee?.defaultClassification?.trim();
    const nonUnion = isNonUnionEmployee(employee, entryClassification || employeeClassification);

    const resolvedClassification =
      entryClassification
      || employeeClassification
      || (nonUnion ? 'Admin' : defaultClassification);

    if (nonUnion) {
      const baseRate = employee?.baseRate != null && employee.baseRate > 0 ? employee.baseRate : undefined;
      return {
        unionArea: 'Non-Union',
        classification: resolvedClassification,
        baseRate,
        fringeRate: 0,
        totalPackage: baseRate,
        source: baseRate != null ? 'employee-summary' : 'missing',
        fringeEligible: false,
      };
    }

    const resolvedArea = employee?.unionArea?.trim() || defaultArea;

    if (employee?.baseRate != null && employee.baseRate > 0) {
      const fringeRate = employee.fringeRate ?? this.lookupFringe(resolvedArea, resolvedClassification, classificationRates);
      return {
        unionArea: resolvedArea,
        classification: resolvedClassification,
        baseRate: employee.baseRate,
        fringeRate,
        totalPackage: employee.baseRate + (fringeRate ?? 0),
        source: 'employee-summary',
        fringeEligible: employee.fringeEligible ?? true,
      };
    }

    const classRate = this.lookupClassification(resolvedArea, resolvedClassification, classificationRates)
      ?? this.lookupClassification(defaultArea, resolvedClassification, classificationRates)
      ?? this.lookupClassification(defaultArea, defaultClassification, classificationRates);

    if (classRate) {
      return {
        unionArea: classRate.unionArea,
        classification: classRate.classification,
        baseRate: classRate.baseRate,
        fringeRate: classRate.fringeRate,
        totalPackage: classRate.totalPackage,
        source: classRate.unionArea === defaultArea && classRate.classification === defaultClassification
          ? 'area-default'
          : 'classification',
        fringeEligible: true,
      };
    }

    return {
      unionArea: resolvedArea,
      classification: resolvedClassification,
      source: 'missing',
      fringeEligible: true,
    };
  }

  private lookupClassification(
    area: string,
    classification: string,
    rates: ClassificationRateRecord[],
  ): ClassificationRateRecord | undefined {
    const areaKey = area.trim().toLowerCase();
    const classKey = this.normalizeClassification(classification);

    const exact = rates.find(r =>
      r.unionArea.trim().toLowerCase() === areaKey
      && this.normalizeClassification(r.classification) === classKey,
    );
    if (exact) return exact;

    const areaMatch = rates.find(r =>
      r.unionArea.trim().toLowerCase() === areaKey
      && this.classificationMatches(classKey, this.normalizeClassification(r.classification)),
    );
    if (areaMatch) return areaMatch;

    return rates.find(r =>
      this.classificationMatches(classKey, this.normalizeClassification(r.classification)),
    );
  }

  private normalizeClassification(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private classificationMatches(input: string, candidate: string): boolean {
    if (!input || !candidate) return false;
    if (input === candidate) return true;

    const aliases: Record<string, string[]> = {
      journeyman: ['journeyman', 'carpenter', 'journeyman carpenter', 'general carpenter', 'carpenter journeyman'],
      foreman: ['foreman', 'carpenter foreman', 'carp foreman', 'working foreman'],
      'general foreman': ['general foreman', 'gen foreman', 'general carpenter foreman'],
      apprentice: ['apprentice', 'apprentice carpenter', 'carpenter apprentice'],
      'apprentice period 1': ['apprentice period 1', 'apprentice 1', '1st period', 'period 1', 'apprentice period one'],
      'apprentice period 2': ['apprentice period 2', 'apprentice 2', '2nd period', 'period 2'],
      'apprentice period 3': ['apprentice period 3', 'apprentice 3', '3rd period', 'period 3'],
      'apprentice period 4': ['apprentice period 4', 'apprentice 4', '4th period', 'period 4'],
      'apprentice period 5': ['apprentice period 5', 'apprentice 5', '5th period', 'period 5'],
      'apprentice period 6': ['apprentice period 6', 'apprentice 6', '6th period', 'period 6'],
      'apprentice period 7': ['apprentice period 7', 'apprentice 7', '7th period', 'period 7'],
      'apprentice period 8': ['apprentice period 8', 'apprentice 8', '8th period', 'period 8'],
      'carpenter helper': ['carpenter helper', 'helper', 'carp helper'],
    };

    for (const [canonical, values] of Object.entries(aliases)) {
      const normalizedValues = values.map(v => this.normalizeClassification(v));
      const inputHit = normalizedValues.includes(input) || input.includes(canonical);
      const candidateHit = normalizedValues.includes(candidate) || candidate.includes(canonical);
      if (inputHit && candidateHit) return true;
    }

    return input.includes(candidate) || candidate.includes(input);
  }

  private lookupFringe(
    area: string,
    classification: string,
    rates: ClassificationRateRecord[],
  ): number | undefined {
    return this.lookupClassification(area, classification, rates)?.fringeRate;
  }
}
