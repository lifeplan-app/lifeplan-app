import { describe, it, expect } from 'vitest';
import { calcSyncValues } from '../../spending/calc/sync.js';

function buildMonth(monthly_fixed, monthly_variable, irregular_fixed = 0, irregular_variable = 0, housing = 0, family = 0) {
  return {
    domainTotals: { monthly_fixed, monthly_variable, irregular_fixed, irregular_variable },
    categoryTotals: { housing, family },
  };
}

describe('calcSyncValues', () => {
  it('データ無しは null', () => {
    expect(calcSyncValues({}, 6)).toBe(null);
    expect(calcSyncValues(null, 6)).toBe(null);
  });
  it('単月データから 1 ヶ月平均を計算（住宅費除外デフォルト）', () => {
    const months = {
      '2026-01': buildMonth(120000, 60000, 0, 0, 80000, 0),
    };
    const r = calcSyncValues(months, 6);
    expect(r.monthlyFixedRaw).toBe(120000);
    expect(r.housingAvg).toBe(80000);
    expect(r.monthlyFixed).toBe(40000);
    expect(r.monthlyVariable).toBe(60000);
    expect(r.monthlyTotal).toBe(100000);
    expect(r.basedOnMonths).toEqual(['2026-01']);
  });
  it('複数月で正しく平均化', () => {
    const months = {
      '2026-01': buildMonth(100000, 50000, 0, 0, 0, 0),
      '2026-02': buildMonth(120000, 70000, 0, 0, 0, 0),
      '2026-03': buildMonth(140000, 90000, 0, 0, 0, 0),
    };
    const r = calcSyncValues(months, 6, { excludeHousing: false });
    expect(r.monthlyFixed).toBeCloseTo(120000);
    expect(r.monthlyVariable).toBeCloseTo(70000);
  });
  it('avgMonths が月数より多い時は全月平均', () => {
    const months = {
      '2026-01': buildMonth(100000, 50000),
      '2026-02': buildMonth(100000, 50000),
    };
    const r = calcSyncValues(months, 12, { excludeHousing: false });
    expect(r.basedOnMonths.length).toBe(2);
  });
  it('家族費除外オプション', () => {
    const months = {
      '2026-01': buildMonth(100000, 50000, 0, 0, 0, 30000),
    };
    const r = calcSyncValues(months, 6, { excludeHousing: false, excludeFamily: true });
    expect(r.familyAvg).toBe(30000);
    expect(r.monthlyFixed).toBe(70000);
  });
  it('不定期支出も平均化', () => {
    const months = {
      '2026-01': buildMonth(100000, 0, 60000, 30000),
    };
    const r = calcSyncValues(months, 6, { excludeHousing: false });
    expect(r.irregularFixed).toBe(60000);
    expect(r.irregularVariable).toBe(30000);
  });
});
