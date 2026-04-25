// test/spending/aggregate.test.js
import { describe, it, expect } from 'vitest';
import { aggregateEntries, getMonthData } from '../../spending/calc/aggregate.js';

const TEST_CATEGORIES = [
  { id: 'food', name: '食費', emoji: '🍚', domain: 'monthly_variable' },
  { id: 'housing', name: '住宅', emoji: '🏠', domain: 'monthly_fixed' },
  { id: 'special', name: '特別費', emoji: '🎁', domain: 'irregular_variable' },
];

describe('aggregateEntries', () => {
  it('空配列は 0 集計', () => {
    const r = aggregateEntries([], TEST_CATEGORIES);
    expect(r.totalExpense).toBe(0);
    expect(r.income).toBe(0);
    expect(r.domainTotals.monthly_variable).toBe(0);
  });
  it('カテゴリ別・領域別に集計', () => {
    const entries = [
      { amount: 1000, categoryId: 'food', isIncome: false },
      { amount: 80000, categoryId: 'housing', isIncome: false },
      { amount: 500, categoryId: 'food', isIncome: false },
    ];
    const r = aggregateEntries(entries, TEST_CATEGORIES);
    expect(r.categoryTotals.food).toBe(1500);
    expect(r.categoryTotals.housing).toBe(80000);
    expect(r.domainTotals.monthly_variable).toBe(1500);
    expect(r.domainTotals.monthly_fixed).toBe(80000);
    expect(r.totalExpense).toBe(81500);
  });
  it('isIncome=true は income に加算、支出側は不変', () => {
    const entries = [
      { amount: 300000, isIncome: true },
      { amount: 1000, categoryId: 'food', isIncome: false },
    ];
    const r = aggregateEntries(entries, TEST_CATEGORIES);
    expect(r.income).toBe(300000);
    expect(r.totalExpense).toBe(1000);
  });
  it('未マッピングのカテゴリ ID はスキップ', () => {
    const entries = [
      { amount: 500, categoryId: 'unknown_cat', isIncome: false },
      { amount: 1000, categoryId: 'food', isIncome: false },
    ];
    const r = aggregateEntries(entries, TEST_CATEGORIES);
    expect(r.totalExpense).toBe(1000);
    expect(r.categoryTotals.unknown_cat).toBeUndefined();
  });
});

describe('getMonthData', () => {
  it('存在する月キーで返す', () => {
    const months = { '2026-04': { totalExpense: 100 } };
    expect(getMonthData(months, '2026-04').totalExpense).toBe(100);
  });
  it('存在しない月は null', () => {
    expect(getMonthData({}, '2026-04')).toBe(null);
  });
  it('months が null/undefined でも null', () => {
    expect(getMonthData(null, '2026-04')).toBe(null);
    expect(getMonthData(undefined, '2026-04')).toBe(null);
  });
});
