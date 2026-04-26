import { describe, it, expect } from 'vitest';
import { calcSuggestionAvg, calcSavingsImpact } from '../../spending/calc/suggest.js';

describe('calcSuggestionAvg', () => {
  it('空 months は null', () => {
    expect(calcSuggestionAvg({}, 3)).toBe(null);
    expect(calcSuggestionAvg(null, 3)).toBe(null);
  });
  it('カテゴリ別・ドメイン別月次平均', () => {
    const months = {
      '2026-01': {
        categoryTotals: { food: 30000, telecom: 8000 },
        domainTotals: { monthly_variable: 30000, monthly_fixed: 8000 },
      },
      '2026-02': {
        categoryTotals: { food: 40000, telecom: 8000 },
        domainTotals: { monthly_variable: 40000, monthly_fixed: 8000 },
      },
      '2026-03': {
        categoryTotals: { food: 50000, telecom: 8000 },
        domainTotals: { monthly_variable: 50000, monthly_fixed: 8000 },
      },
    };
    const r = calcSuggestionAvg(months, 6);
    expect(r.cats.food).toBe(40000);
    expect(r.cats.telecom).toBe(8000);
    expect(r.domains.monthly_variable).toBe(40000);
    expect(r.domains.monthly_fixed).toBe(8000);
    expect(r.nMonths).toBe(3);
    expect(r.keys).toEqual(['2026-01', '2026-02', '2026-03']);
  });
  it('一部月にカテゴリ無くても平均（分母は月数固定）', () => {
    const months = {
      '2026-01': { categoryTotals: { food: 30000 }, domainTotals: { monthly_variable: 30000 } },
      '2026-02': { categoryTotals: { food: 30000, daily: 10000 }, domainTotals: { monthly_variable: 40000 } },
    };
    const r = calcSuggestionAvg(months, 6);
    expect(r.cats.food).toBe(30000);
    expect(r.cats.daily).toBe(5000);
    expect(r.nMonths).toBe(2);
  });
  it('avgMonths が月数より多い時は全月平均（slice の挙動）', () => {
    const months = {
      '2026-01': { categoryTotals: { food: 30000 }, domainTotals: { monthly_variable: 30000 } },
    };
    const r = calcSuggestionAvg(months, 12);
    expect(r.nMonths).toBe(1);
  });
});

describe('calcSavingsImpact', () => {
  it('lifeplan なしは既定 30 年 3%', () => {
    const r = calcSavingsImpact(5000);
    expect(r.years).toBe(30);
    expect(r.rate).toBe(3);
    // 月 5000 × 30 年 × 3% ≈ 290 万円台
    expect(r.amount).toBeGreaterThan(280);
    expect(r.amount).toBeLessThan(300);
  });
  it('lifeplan profile.birth から年齢を逆算（75 歳まで）', () => {
    const lp = { profile: { birth: '1990-01-01' } };
    const r = calcSavingsImpact(5000, lp);
    const age = new Date().getFullYear() - 1990;
    const expectedYears = Math.max(5, 75 - age);
    expect(r.years).toBe(expectedYears);
  });
  it('lifeplan assets から加重平均利回りを採用', () => {
    const lp = {
      profile: { birth: '1990-01-01' },
      assets: [
        { amount: 1000, return: 5 },
        { amount: 1000, return: 3 },
      ],
    };
    const r = calcSavingsImpact(10000, lp);
    expect(r.rate).toBe(4); // (5+3)/2 = 4%
  });
  it('資産総額 0 の場合はデフォルト利回り維持', () => {
    const lp = { assets: [{ amount: 0, return: 5 }] };
    const r = calcSavingsImpact(10000, lp);
    expect(r.rate).toBe(3);
  });
  it('利回り 20%以上は無視（外れ値ガード）', () => {
    const lp = { assets: [{ amount: 1000, return: 25 }] };
    const r = calcSavingsImpact(10000, lp);
    expect(r.rate).toBe(3);
  });

  it('lifeplan.finance.simYears を優先して使用', () => {
    const lp = {
      profile: { birth: '1990-01-01' },
      finance: { simYears: 40 },
    };
    const r = calcSavingsImpact(5000, lp);
    expect(r.years).toBe(40);
  });

  it('simYears 無く retirement.targetAge があれば targetAge - age', () => {
    const lp = {
      profile: { birth: '1990-01-01' },
      retirement: { targetAge: 65 },
    };
    const r = calcSavingsImpact(5000, lp);
    const age = new Date().getFullYear() - 1990;
    expect(r.years).toBe(Math.max(5, 65 - age));
  });

  it('simYears も targetAge も無ければ既存の 75 - age', () => {
    const lp = { profile: { birth: '1990-01-01' } };
    const r = calcSavingsImpact(5000, lp);
    const age = new Date().getFullYear() - 1990;
    expect(r.years).toBe(Math.max(5, 75 - age));
  });
});
