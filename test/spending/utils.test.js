// test/spending/utils.test.js
import { describe, it, expect } from 'vitest';
import { fmt, toManYen, fmtManYen, parseDate } from '../../spending/calc/utils.js';

describe('utils.fmt', () => {
  it('整数円を ¥ 付きカンマ区切りで整形', () => {
    expect(fmt(123456)).toBe('¥123,456');
  });
  it('小数は四捨五入', () => {
    expect(fmt(1234.6)).toBe('¥1,235');
  });
  it('0 円は ¥0', () => {
    expect(fmt(0)).toBe('¥0');
  });
});

describe('utils.toManYen', () => {
  it('10000 円 → 1.0 万円', () => {
    expect(toManYen(10000)).toBe(1);
  });
  it('15000 円 → 1.5 万円', () => {
    expect(toManYen(15000)).toBe(1.5);
  });
  it('123456 円 → 12.3 万円（小数1桁四捨五入）', () => {
    expect(toManYen(123456)).toBe(12.3);
  });
  it('999 円 → 0.1 万円', () => {
    expect(toManYen(999)).toBe(0.1);
  });
  it('0 円 → 0 万円', () => {
    expect(toManYen(0)).toBe(0);
  });
});

describe('utils.fmtManYen', () => {
  it('単位付き整形', () => {
    expect(fmtManYen(15000)).toBe('1.5万円');
  });
});

describe('utils.parseDate', () => {
  it('2026/04/26 → 2026-04-26', () => {
    expect(parseDate('2026/04/26')).toBe('2026-04-26');
  });
  it('2026-4-9 → 2026-04-09 (zero pad)', () => {
    expect(parseDate('2026-4-9')).toBe('2026-04-09');
  });
  it('範囲外年は null', () => {
    expect(parseDate('1899/01/01')).toBe(null);
    expect(parseDate('2101/01/01')).toBe(null);
  });
  it('不正月日は null', () => {
    expect(parseDate('2026/13/01')).toBe(null);
    expect(parseDate('2026/01/32')).toBe(null);
  });
  it('空文字・null は null', () => {
    expect(parseDate('')).toBe(null);
    expect(parseDate(null)).toBe(null);
  });
  it('日付以外の文字列は null', () => {
    expect(parseDate('not-a-date')).toBe(null);
  });
  it('yyyy.mm.dd（ドット区切り）も許容', () => {
    expect(parseDate('2026.04.26')).toBe('2026-04-26');
  });
  it('Feb 30 等の不正カレンダー日付は null', () => {
    expect(parseDate('2026/02/30')).toBe(null);
    expect(parseDate('2026/04/31')).toBe(null);
  });
  it('うるう年の Feb 29 は許可', () => {
    expect(parseDate('2024/02/29')).toBe('2024-02-29');
  });
  it('うるう年でない Feb 29 は null', () => {
    expect(parseDate('2025/02/29')).toBe(null);
  });
});
