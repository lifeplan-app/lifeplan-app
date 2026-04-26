// test/spending/csv-parser.test.js
import { describe, it, expect } from 'vitest';
import {
  parseCSVLine, findCol,
  mapCategoryByKey, mapCategory,
  parseMFCSV, parseZaimCSV,
  MF_CATEGORY_MAP, ZAIM_CATEGORY_MAP,
} from '../../spending/calc/csv-parser.js';

describe('parseCSVLine', () => {
  it('単純な3列', () => {
    expect(parseCSVLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });
  it('引用符内のカンマを保持', () => {
    expect(parseCSVLine('"a,b",c,d')).toEqual(['a,b', 'c', 'd']);
  });
  it('引用符のエスケープ ("" → ")', () => {
    expect(parseCSVLine('"a""b",c')).toEqual(['a"b', 'c']);
  });
  it('空フィールド', () => {
    expect(parseCSVLine('a,,c')).toEqual(['a', '', 'c']);
  });
});

describe('findCol', () => {
  it('完全一致', () => {
    expect(findCol(['日付', '金額'], ['日付'])).toBe(0);
  });
  it('部分一致', () => {
    expect(findCol(['日付列'], ['日付'])).toBe(0);
  });
  it('複数候補から最初に見つかる', () => {
    expect(findCol(['入/出'], ['入/出', '入出', '収支'])).toBe(0);
  });
  it('未発見は -1', () => {
    expect(findCol(['他'], ['日付'])).toBe(-1);
  });
});

describe('mapCategoryByKey', () => {
  it('user map 優先', () => {
    expect(mapCategoryByKey({ '光熱費': 'housing' }, '光熱費')).toBe('housing');
  });
  it('user map 無ければ MF_CATEGORY_MAP', () => {
    const sampleMfKey = Object.keys(MF_CATEGORY_MAP)[0];
    expect(mapCategoryByKey({}, sampleMfKey)).toBe(MF_CATEGORY_MAP[sampleMfKey]);
  });
  it('「大::中」未発見時は大項目フォールバック', () => {
    const sampleMfKey = Object.keys(MF_CATEGORY_MAP)[0];
    expect(mapCategoryByKey({}, `${sampleMfKey}::存在しない中項目`)).toBe(MF_CATEGORY_MAP[sampleMfKey]);
  });
  it('null/空キーは null', () => {
    expect(mapCategoryByKey({}, '')).toBe(null);
    expect(mapCategoryByKey({}, null)).toBe(null);
  });
});

describe('parseMFCSV - 基本', () => {
  it('正常な MF CSV をパース', () => {
    const csv = `計算対象,日付,内容,金額,大項目,中項目,振替,ID
1,2026/04/01,ランチ,-1500,食費,昼食,0,test-1
1,2026/04/02,給与,300000,収入,給与,0,test-2`;
    const entries = parseMFCSV(csv);
    expect(entries.length).toBe(2);
    expect(entries[0].amount).toBe(1500);
    expect(entries[0].isIncome).toBe(false);
    expect(entries[1].amount).toBe(300000);
    expect(entries[1].isIncome).toBe(true);
  });
  it('計算対象 0 の行はスキップ', () => {
    const csv = `計算対象,日付,内容,金額,大項目,中項目,振替,ID
0,2026/04/01,スキップ,-1000,食費,昼食,0,t1
1,2026/04/02,通常,-500,食費,昼食,0,t2`;
    const entries = parseMFCSV(csv);
    expect(entries.length).toBe(1);
    expect(entries[0].id).toBe('t2');
  });
  it('振替=1 の行はスキップ', () => {
    const csv = `計算対象,日付,内容,金額,大項目,中項目,振替,ID
1,2026/04/01,振替,-1000,食費,昼食,1,t1
1,2026/04/02,通常,-500,食費,昼食,0,t2`;
    const entries = parseMFCSV(csv);
    expect(entries.length).toBe(1);
    expect(entries[0].id).toBe('t2');
  });
  it('BOM 付きでもパース可', () => {
    const csv = `﻿計算対象,日付,内容,金額,大項目,中項目,振替,ID
1,2026/04/01,ランチ,-1500,食費,昼食,0,t1`;
    const entries = parseMFCSV(csv);
    expect(entries.length).toBe(1);
  });
  it('対応しない形式は throw', () => {
    expect(() => parseMFCSV('不正な,形式\n1,2,3')).toThrow();
  });
});

describe('parseZaimCSV - 基本', () => {
  it('Zaim CSV をパース', () => {
    const csv = `日付,方向,カテゴリ,品目,金額,通貨,振替,ID
2026/04/01,支出,食費,昼食,1500,JPY,0,z1
2026/04/02,収入,給与,本業,300000,JPY,0,z2`;
    const entries = parseZaimCSV(csv);
    expect(entries.length).toBe(2);
    expect(entries[0].isIncome).toBe(false);
    expect(entries[1].isIncome).toBe(true);
  });
});

describe('parseMFCSV: ID 列なし時の重複検知用 ID 生成', () => {
  const csvNoId = `計算対象,日付,内容,金額(円),保有金融機関,大項目,中項目,メモ,振替
1,2026/04/01,ランチ,-1500,銀行A,食費,昼食,,0
1,2026/04/02,ディナー,-2500,銀行A,食費,夕食,,0`;

  it('ID 列なしでも同じ CSV を 2 回パースすれば同一 ID が生成される（決定的）', () => {
    const r1 = parseMFCSV(csvNoId);
    const r2 = parseMFCSV(csvNoId);
    expect(r1.length).toBeGreaterThan(0);
    expect(r1.length).toBe(r2.length);
    for (let i = 0; i < r1.length; i++) {
      expect(r1[i].id).toBe(r2[i].id);
    }
  });

  it('ID には date / amount / カテゴリ情報が含まれる', () => {
    const r = parseMFCSV(csvNoId);
    expect(r[0].id).toContain('2026-04-01');
    expect(r[0].id).toContain('1500');
  });
});

describe('parseZaimCSV: ID 列なし時の重複検知用 ID 生成', () => {
  const csvNoId = `日付,方向,カテゴリ,品目,金額,通貨,振替
2026/04/01,支出,食費,昼食,1500,JPY,0
2026/04/02,支出,食費,夕食,2500,JPY,0`;

  it('ID 列なしでも同じ CSV を 2 回パースすれば同一 ID が生成される（決定的）', () => {
    const r1 = parseZaimCSV(csvNoId);
    const r2 = parseZaimCSV(csvNoId);
    expect(r1.length).toBeGreaterThan(0);
    expect(r1.length).toBe(r2.length);
    for (let i = 0; i < r1.length; i++) {
      expect(r1[i].id).toBe(r2[i].id);
    }
  });
});
