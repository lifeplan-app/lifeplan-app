# Phase SP-1: 支出管理アプリ テスト基盤構築 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `spending/index.html` から計算ロジック・CSV パーサ・ライフプラン連携ロジックを `spending/calc/*.js` に ES module として分離し、`test/spending/` 配下に Vitest ユニットテスト + ゴールデンマスターを構築する。

**Architecture:**
- 5 つの ES module を `spending/calc/` 配下に作成
- 各関数は純粋化（global `state` 参照を引数化）
- `spending/index.html` は `<script type="module">` で読み込み + `window.X = X` で既存 onclick の後方互換
- `test/spending/*.test.js` で Vitest が自動収集

**Tech Stack:** ES modules, Vitest 2.x, fixture CSV, snapshot testing

**前提**: 設計書 `docs/superpowers/specs/2026-04-26-phase-sp-spending-app-validation-design.md` を参照のこと。`type: "module"` is already set in package.json. Vitest config glob: `test/**/*.test.js`.

---

### Task 1: spending/calc/utils.js 作成（金額・日付フォーマット系）

**Files:**
- Create: `spending/calc/utils.js`
- Test: `test/spending/utils.test.js`

- [ ] **Step 1: spending/calc/utils.js を作成**

```javascript
// spending/calc/utils.js
// 金額・日付フォーマット・パースのユーティリティ

export function fmt(yen) {
  return '¥' + Math.round(yen).toLocaleString();
}

export function toManYen(yen) {
  return Math.round(yen / 10000 * 10) / 10;
}

export function fmtManYen(yen) {
  return toManYen(yen) + '万円';
}

export function parseDate(str) {
  if (!str) return null;
  const m = str.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (!m) return null;
  const year  = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day   = parseInt(m[3], 10);
  if (year < 1900 || year > 2100) return null;
  if (month < 1  || month > 12)   return null;
  if (day   < 1  || day   > 31)   return null;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}
```

- [ ] **Step 2: test/spending/utils.test.js でユニットテストを書く**

```javascript
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
});
```

- [ ] **Step 3: テストを走らせて失敗ではないことを確認（test/spending/ がまだ無視されていないか）**

```bash
source ~/.nvm/nvm.sh && npm test 2>&1 | tail -10
```

期待: 251 + 14 = **265** pass。spending app の関数定義はまだ index.html 内にあるが、独立 module から import なので競合なし。

- [ ] **Step 4: commit**

```bash
git add spending/calc/utils.js test/spending/utils.test.js
git commit -m "test(phase-sp-1): add spending/calc/utils.js (fmt, toManYen, parseDate) + unit tests"
```

---

### Task 2: spending/calc/csv-parser.js 作成（CSV パーサ + マッピング）

**Files:**
- Create: `spending/calc/csv-parser.js`
- Test: `test/spending/csv-parser.test.js`

- [ ] **Step 1: spending/index.html から定数とパーサを移植 → ES module 形式に**

`spending/index.html` の以下を読んで `spending/calc/csv-parser.js` に移植：
- `MF_CATEGORY_MAP` (line 1441〜1557)
- `MF_SKIP_MAIN`, `MF_SKIP_KEYS` (line 1558〜)
- `ZAIM_CATEGORY_MAP` (line 1573〜)
- `ZAIM_SKIP_CATS` (line 1614〜)
- `findCol` (line 3243)
- `parseCSVLine` (line 3251)
- `mapCategoryByKey` (line 3053) — **state.csvConfig.categoryMap を引数化**
- `mapCategory` (line 3067) — **同上**
- `parseMFCSV` (line 3072) — **state.csvConfig.categoryMap を引数化**
- `parseZaimCSV` (line 3166) — **同上**

新シグネチャ:
```javascript
// spending/calc/csv-parser.js
import { parseDate } from './utils.js';

export const MF_CATEGORY_MAP = { /* 元の値そのまま */ };
export const MF_SKIP_MAIN    = new Set([ /* 元の値 */ ]);
export const MF_SKIP_KEYS    = new Set([ /* 元の値 */ ]);
export const ZAIM_CATEGORY_MAP = { /* 元の値 */ };
export const ZAIM_SKIP_CATS  = new Set([ /* 元の値 */ ]);

export function parseCSVLine(line) { /* 元のコードそのまま */ }
export function findCol(headers, candidates) { /* 元のコードそのまま */ }

// 旧: state.csvConfig.categoryMap を参照
// 新: userMap を引数で受け取る
export function mapCategoryByKey(userMap, key) {
  if (!key) return null;
  const exact = (userMap && userMap[key]) || MF_CATEGORY_MAP[key] || ZAIM_CATEGORY_MAP[key];
  if (exact) return exact;
  if (key.includes('::')) {
    const mainCat = key.split('::')[0];
    return (userMap && userMap[mainCat]) || MF_CATEGORY_MAP[mainCat] || ZAIM_CATEGORY_MAP[mainCat] || null;
  }
  return null;
}

export function mapCategory(userMap, mfCat) {
  if (!mfCat) return null;
  return (userMap && userMap[mfCat]) || MF_CATEGORY_MAP[mfCat] || null;
}

// 旧: state.csvConfig.categoryMap グローバル参照
// 新: userMap を引数で受け取る（unused でも将来用に予約）
export function parseMFCSV(text, userMap = {}) {
  /* 元のコード - state.csvConfig.categoryMap 参照は無いが、関数内 mapCategoryByKey 呼び出しがあれば userMap を渡すよう書き換え */
}

export function parseZaimCSV(text, userMap = {}) { /* 同上 */ }
```

**重要**: `parseMFCSV` / `parseZaimCSV` 自体は実は `state` 参照していない（元コード line 3072〜3162 を確認）。ただし返り値の `entries[].categoryId` は `null` でセットされ、後段で `mapCategoryByKey` で解決される設計。よって CSV パーサ自体はそのまま移植で OK。`userMap` 引数は将来の柔軟性のため optional に追加する程度。

- [ ] **Step 2: test/spending/csv-parser.test.js でユニットテスト**

```javascript
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
```

- [ ] **Step 3: テスト走らせ pass 確認**

```bash
source ~/.nvm/nvm.sh && npm test 2>&1 | tail -5
```

期待: 251 + 14 (utils) + 17 (csv-parser) = **282** pass。

- [ ] **Step 4: commit**

```bash
git add spending/calc/csv-parser.js test/spending/csv-parser.test.js
git commit -m "test(phase-sp-1): add spending/calc/csv-parser.js (parseMFCSV/parseZaimCSV/mapCategory) + unit tests"
```

---

### Task 3: spending/calc/aggregate.js 作成（集計）

**Files:**
- Create: `spending/calc/aggregate.js`
- Test: `test/spending/aggregate.test.js`

- [ ] **Step 1: aggregate.js を作成**

```javascript
// spending/calc/aggregate.js
// エントリ集計・月次データ取得

export function aggregateEntries(entries, categories) {
  const catMap = Object.fromEntries(categories.map(c => [c.id, c]));
  const categoryTotals = {};
  const domainTotals = { monthly_fixed: 0, monthly_variable: 0, irregular_fixed: 0, irregular_variable: 0 };
  let totalExpense = 0;
  let income = 0;

  for (const e of entries) {
    if (e.isIncome) { income += e.amount; continue; }
    const cat = catMap[e.categoryId];
    if (!cat) continue;
    categoryTotals[e.categoryId] = (categoryTotals[e.categoryId] || 0) + e.amount;
    domainTotals[cat.domain] = (domainTotals[cat.domain] || 0) + e.amount;
    totalExpense += e.amount;
  }
  return { categoryTotals, domainTotals, totalExpense, income };
}

export function getMonthData(months, monthKey) {
  return (months && months[monthKey]) || null;
}
```

- [ ] **Step 2: aggregate.test.js を書く**

```javascript
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
```

- [ ] **Step 3: テスト走らせ pass 確認**

```bash
source ~/.nvm/nvm.sh && npm test 2>&1 | tail -5
```

期待: 282 + 7 = **289** pass。

- [ ] **Step 4: commit**

```bash
git add spending/calc/aggregate.js test/spending/aggregate.test.js
git commit -m "test(phase-sp-1): add spending/calc/aggregate.js (aggregateEntries/getMonthData) + unit tests"
```

---

### Task 4: spending/calc/sync.js 作成（ライフプラン連携）

**Files:**
- Create: `spending/calc/sync.js`
- Test: `test/spending/sync.test.js`

- [ ] **Step 1: sync.js を作成**

`spending/index.html:2011〜2045` の `calcSyncValues` を「state.months 引数化」して移植：

```javascript
// spending/calc/sync.js
// spending → lifeplan 連携用の集計値計算

/**
 * 直近 avgMonths ヶ月の月次データから連携用平均値を計算
 * @param {object} months - state.months（{ 'YYYY-MM': monthData }）
 * @param {number} avgMonths - 平均化する月数
 * @param {object} opts - { excludeHousing, excludeFamily }
 * @returns {object|null} 計算結果。データ無しなら null
 */
export function calcSyncValues(months, avgMonths, { excludeHousing = true, excludeFamily = false } = {}) {
  const keys = Object.keys(months || {}).sort().slice(-avgMonths);
  if (!keys.length) return null;

  let mfSum = 0, mvSum = 0, ifSum = 0, ivSum = 0, famSum = 0, housingSum = 0;
  for (const k of keys) {
    const d = months[k];
    mfSum     += d.domainTotals?.monthly_fixed     || 0;
    mvSum     += d.domainTotals?.monthly_variable  || 0;
    ifSum     += d.domainTotals?.irregular_fixed   || 0;
    ivSum     += d.domainTotals?.irregular_variable|| 0;
    famSum    += d.categoryTotals?.family          || 0;
    housingSum+= d.categoryTotals?.housing         || 0;
  }
  const n = keys.length;
  const housingAvg      = housingSum / n;
  const familyAvg       = famSum / n;
  const monthlyFixedRaw = mfSum / n;
  const monthlyFixed =
    monthlyFixedRaw
    - (excludeHousing ? housingAvg : 0)
    - (excludeFamily  ? familyAvg  : 0);
  const monthlyVariable = mvSum / n;
  return {
    monthlyFixedRaw,
    monthlyFixed,
    monthlyVariable,
    monthlyTotal:      monthlyFixed + monthlyVariable,
    irregularFixed:    ifSum / n,
    irregularVariable: ivSum / n,
    housingAvg,
    familyAvg,
    basedOnMonths: keys,
  };
}
```

- [ ] **Step 2: sync.test.js を書く**

```javascript
// test/spending/sync.test.js
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
      '2026-01': buildMonth(120000, 60000, 0, 0, 80000, 0), // monthly_fixed includes housing 80000
    };
    const r = calcSyncValues(months, 6);
    expect(r.monthlyFixedRaw).toBe(120000);
    expect(r.housingAvg).toBe(80000);
    expect(r.monthlyFixed).toBe(40000); // 120000 - 80000
    expect(r.monthlyVariable).toBe(60000);
    expect(r.monthlyTotal).toBe(100000); // 40000 + 60000
    expect(r.basedOnMonths).toEqual(['2026-01']);
  });
  it('複数月で正しく平均化', () => {
    const months = {
      '2026-01': buildMonth(100000, 50000, 0, 0, 0, 0),
      '2026-02': buildMonth(120000, 70000, 0, 0, 0, 0),
      '2026-03': buildMonth(140000, 90000, 0, 0, 0, 0),
    };
    const r = calcSyncValues(months, 6, { excludeHousing: false });
    expect(r.monthlyFixed).toBeCloseTo(120000); // (100+120+140)/3 *1000
    expect(r.monthlyVariable).toBeCloseTo(70000); // (50+70+90)/3 *1000
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
      '2026-01': buildMonth(100000, 50000, 0, 0, 0, 30000), // family 30000
    };
    const r = calcSyncValues(months, 6, { excludeHousing: false, excludeFamily: true });
    expect(r.familyAvg).toBe(30000);
    expect(r.monthlyFixed).toBe(70000); // 100000 - 30000
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
```

- [ ] **Step 3: テスト走らせ pass 確認**

```bash
source ~/.nvm/nvm.sh && npm test 2>&1 | tail -5
```

期待: 289 + 6 = **295** pass。

- [ ] **Step 4: commit**

```bash
git add spending/calc/sync.js test/spending/sync.test.js
git commit -m "test(phase-sp-1): add spending/calc/sync.js (calcSyncValues) + unit tests"
```

---

### Task 5: spending/calc/suggest.js 作成（改善提案）

**Files:**
- Create: `spending/calc/suggest.js`
- Test: `test/spending/suggest.test.js`

- [ ] **Step 1: spending/index.html:2646〜 の calcSuggestionAvg / calcSavingsImpact を移植**

両関数とも `state.months` グローバル参照。state を引数化。

```javascript
// spending/calc/suggest.js
// 改善提案・節約インパクト計算

/**
 * 直近 nMonths ヶ月のカテゴリ別平均
 */
export function calcSuggestionAvg(months, nMonths) {
  const keys = Object.keys(months || {}).sort().slice(-nMonths);
  if (!keys.length) return {};
  const sums = {};
  for (const k of keys) {
    const cats = months[k]?.categoryTotals || {};
    for (const cid in cats) {
      sums[cid] = (sums[cid] || 0) + cats[cid];
    }
  }
  const n = keys.length;
  const out = {};
  for (const cid in sums) {
    out[cid] = sums[cid] / n;
  }
  return out;
}

/**
 * 月 monthlySavings 円節約した時の累積効果
 * @param {number} monthlySavings - 月次節約額（円）
 * @param {object} opts - { years, returnRate }
 */
export function calcSavingsImpact(monthlySavings, { years = 30, returnRate = 0.03 } = {}) {
  // 月複利: 月利 = returnRate / 12
  const m = returnRate / 12;
  const n = years * 12;
  // 年金終価係数
  if (m === 0) {
    return monthlySavings * n;
  }
  const fv = monthlySavings * ((Math.pow(1 + m, n) - 1) / m);
  return Math.round(fv);
}
```

- [ ] **Step 2: suggest.test.js を書く**

```javascript
// test/spending/suggest.test.js
import { describe, it, expect } from 'vitest';
import { calcSuggestionAvg, calcSavingsImpact } from '../../spending/calc/suggest.js';

describe('calcSuggestionAvg', () => {
  it('空 months は空オブジェクト', () => {
    expect(calcSuggestionAvg({}, 3)).toEqual({});
    expect(calcSuggestionAvg(null, 3)).toEqual({});
  });
  it('カテゴリ別月次平均', () => {
    const months = {
      '2026-01': { categoryTotals: { food: 30000, telecom: 8000 } },
      '2026-02': { categoryTotals: { food: 40000, telecom: 8000 } },
      '2026-03': { categoryTotals: { food: 50000, telecom: 8000 } },
    };
    const r = calcSuggestionAvg(months, 6);
    expect(r.food).toBe(40000); // (30+40+50)/3 *1000
    expect(r.telecom).toBe(8000);
  });
  it('一部月にカテゴリ無くても平均', () => {
    const months = {
      '2026-01': { categoryTotals: { food: 30000 } },
      '2026-02': { categoryTotals: { food: 30000, daily: 10000 } },
    };
    const r = calcSuggestionAvg(months, 6);
    expect(r.food).toBe(30000);
    expect(r.daily).toBe(5000); // 10000 / 2
  });
});

describe('calcSavingsImpact', () => {
  it('return 0% は単純な合計', () => {
    expect(calcSavingsImpact(10000, { years: 1, returnRate: 0 })).toBe(120000);
  });
  it('30 年 3% で月 5000 円節約 ≈ 290 万円程度', () => {
    const r = calcSavingsImpact(5000, { years: 30, returnRate: 0.03 });
    expect(r).toBeGreaterThan(2800000);
    expect(r).toBeLessThan(3000000);
  });
  it('20 年 5% で月 10000 円節約', () => {
    const r = calcSavingsImpact(10000, { years: 20, returnRate: 0.05 });
    expect(r).toBeGreaterThan(4000000);
    expect(r).toBeLessThan(4200000);
  });
});
```

- [ ] **Step 3: テスト走らせ pass 確認**

```bash
source ~/.nvm/nvm.sh && npm test 2>&1 | tail -5
```

期待: 295 + 5 = **300** pass。

- [ ] **Step 4: commit**

```bash
git add spending/calc/suggest.js test/spending/suggest.test.js
git commit -m "test(phase-sp-1): add spending/calc/suggest.js (calcSuggestionAvg/calcSavingsImpact) + unit tests"
```

---

### Task 6: spending/index.html を ES module 導入で更新（後方互換）

**Files:**
- Modify: `spending/index.html`

ここまで spending/calc/*.js は単独 module として作成され、テストは pass している。しかし spending/index.html はまだ古いインライン関数を使っている。本タスクで spending/index.html から関数定義を削除し、新 module から import + window.X = X で後方互換維持。

- [ ] **Step 1: spending/index.html の `<script>` タグを `<script type="module">` に変更**

`spending/index.html` の最後の `<script>` タグ（メインのインライン JS、おそらく line 1300〜の辺り）を `<script type="module" src="...">` ではなく直接インライン化された ES module に変更。または、別ファイル `spending/main.js` に切り出して import するのが綺麗。

**簡略アプローチ（推奨）**: 既存の `<script>` を `<script type="module">` に変更し、トップに `import` 文を追加。さらに module 末尾で `window.functionName = functionName` をすべての export 関数で行う。

具体例:
```html
<script type="module">
  import { fmt, toManYen, fmtManYen, parseDate } from './calc/utils.js';
  import { aggregateEntries, getMonthData } from './calc/aggregate.js';
  import {
    parseCSVLine, findCol, mapCategoryByKey, mapCategory,
    parseMFCSV, parseZaimCSV,
    MF_CATEGORY_MAP, MF_SKIP_MAIN, MF_SKIP_KEYS,
    ZAIM_CATEGORY_MAP, ZAIM_SKIP_CATS
  } from './calc/csv-parser.js';
  import { calcSyncValues } from './calc/sync.js';
  import { calcSuggestionAvg, calcSavingsImpact } from './calc/suggest.js';

  // 既存の onclick="someFn()" 等が使えるようグローバル登録
  Object.assign(window, {
    fmt, toManYen, fmtManYen, parseDate,
    aggregateEntries, getMonthData,
    parseCSVLine, findCol, mapCategoryByKey, mapCategory,
    parseMFCSV, parseZaimCSV,
    calcSuggestionAvg, calcSavingsImpact,
  });

  // 既存の関数定義を削除（重複定義回避）
  // ... 残りの関数定義（DOM 操作等）はそのまま
</script>
```

- [ ] **Step 2: 既存の関数定義を削除**

`spending/index.html` から以下を削除:
- `function fmt(yen)` (line 1976)
- `function toManYen(yen)` (line 1979)
- `function fmtManYen(yen)` (line 1982)
- `function aggregateEntries(...)` (line 1989)
- `function getMonthData(...)` (line 2007)
- `function calcSyncValues(...)` (line 2011)
- `function calcSuggestionAvg(...)` (line 2646)
- `function calcSavingsImpact(...)` (line 2662)
- `function parseMFCSV(...)` (line 3072)
- `function parseZaimCSV(...)` (line 3166)
- `function findCol(...)` (line 3243)
- `function parseCSVLine(...)` (line 3251)
- `function parseDate(...)` (line 3271)
- `function mapCategoryByKey(...)` (line 3053)
- `function mapCategory(...)` (line 3067)

定数も削除:
- `const MF_CATEGORY_MAP = ...` (line 1441)
- `const MF_SKIP_MAIN = ...`
- `const MF_SKIP_KEYS = ...`
- `const ZAIM_CATEGORY_MAP = ...`
- `const ZAIM_SKIP_CATS = ...`

なお `state.csvConfig.categoryMap` は state なのでそのまま。

**ただし重要**: `calcSyncValues` と `calcSuggestionAvg` は元々 `state.months` を参照する設計。新シグネチャは `(months, ...)` を受け取る。spending/index.html 側の呼び出し箇所をすべて `calcSyncValues(state.months, ...)` のように書き換える必要あり。

呼び出し箇所を grep で特定:
```bash
grep -n "calcSyncValues\|calcSuggestionAvg\|getMonthData\|mapCategory\|mapCategoryByKey" spending/index.html
```

各箇所を編集して引数追加:
- `calcSyncValues(6, opts)` → `calcSyncValues(state.months, 6, opts)`
- `calcSuggestionAvg(3)` → `calcSuggestionAvg(state.months, 3)`
- `getMonthData(key)` → `getMonthData(state.months, key)`
- `mapCategoryByKey(key)` → `mapCategoryByKey(state.csvConfig.categoryMap, key)`
- `mapCategory(cat)` → `mapCategory(state.csvConfig.categoryMap, cat)`

- [ ] **Step 3: ブラウザで動作確認**

```bash
echo "ローカルでサーバ起動して動作確認:"
echo "cd spending && python3 -m http.server 8000"
echo "ブラウザで http://localhost:8000/ を開いて以下を確認:"
echo "  1. オンボーディング画面が表示される（初回 or localStorage クリア後）"
echo "  2. CSV 取り込みが動作する（fixtures/mf-normal.csv をドラッグ）"
echo "  3. 月次ダッシュボードが表示される"
echo "  4. ライフプラン連携カードに何か表示される"
```

ユーザーが手動で動作確認後、問題なければ次へ。

- [ ] **Step 4: テスト走らせ全体グリーン確認**

```bash
source ~/.nvm/nvm.sh && npm test 2>&1 | tail -5
```

期待: **300** pass（既存 + SP-1 ユニット）。

- [ ] **Step 5: commit**

```bash
git add spending/index.html
git commit -m "$(cat <<'EOF'
refactor(phase-sp-1): migrate spending/index.html to ES modules

spending/calc/*.js (5 modules) からの import に切り替え。
window.X = X 登録で onclick 等の後方互換維持。
内部呼び出しは calcSyncValues(state.months, ...) のように
明示的な state 渡しに更新。

機能変更なし、ブラウザ動作確認済み。
EOF
)"
```

---

### Task 7: fixture CSV 5 種類作成

**Files:**
- Create: `test/spending/fixtures/mf-normal.csv`
- Create: `test/spending/fixtures/mf-edge-quotes.csv`
- Create: `test/spending/fixtures/mf-unmapped-category.csv`
- Create: `test/spending/fixtures/zaim-normal.csv`
- Create: `test/spending/fixtures/cross-month.csv`

- [ ] **Step 1: mf-normal.csv（MF 標準フォーマット 10 行）**

```csv
計算対象,日付,内容,金額(円),保有金融機関,大項目,中項目,メモ,振替,ID
1,2026/01/05,スーパー,-3500,銀行A,食費,食料品,,0,sample-001
1,2026/01/10,家賃,-80000,銀行A,住宅,家賃,,0,sample-002
1,2026/01/15,給与,300000,銀行A,収入,給与,,0,sample-003
1,2026/01/20,携帯,-8500,銀行A,通信費,携帯電話,,0,sample-004
1,2026/01/22,コンビニ,-1200,銀行A,食費,外食,,0,sample-005
1,2026/01/25,水道,-5500,銀行A,水道・光熱費,水道,,0,sample-006
1,2026/01/28,ドラッグストア,-2800,銀行A,日用品,生活雑貨,,0,sample-007
1,2026/01/29,電気,-9200,銀行A,水道・光熱費,電気,,0,sample-008
1,2026/01/30,ガス,-4100,銀行A,水道・光熱費,ガス,,0,sample-009
1,2026/01/31,服,-12000,銀行A,衣服・美容,衣服,,0,sample-010
```

- [ ] **Step 2: mf-edge-quotes.csv（引用符・カンマ・CRLF・BOM）**

CRLF と BOM をきちんと埋めるため、heredoc 不可。Bash 経由で作成:

```bash
cat > /tmp/mf-edge-quotes.csv << 'PYEOF'
計算対象,日付,内容,金額(円),保有金融機関,大項目,中項目,メモ,振替,ID
1,2026/02/01,"カフェ, 渋谷店",-650,銀行A,食費,外食,,0,edge-001
1,2026/02/02,"""特売""セール",-3200,銀行A,食費,食料品,,0,edge-002
1,2026/02/03,",,カンマ多めの内容",-1000,銀行A,日用品,生活雑貨,,0,edge-003
PYEOF

# Add BOM and CRLF
printf '\xEF\xBB\xBF' > test/spending/fixtures/mf-edge-quotes.csv
sed 's/$/\r/' /tmp/mf-edge-quotes.csv >> test/spending/fixtures/mf-edge-quotes.csv
```

- [ ] **Step 3: mf-unmapped-category.csv（未マッピングカテゴリ含む）**

```csv
計算対象,日付,内容,金額(円),保有金融機関,大項目,中項目,メモ,振替,ID
1,2026/03/01,謎の出費,-5000,銀行A,カスタムカテゴリX,なし,,0,unmap-001
1,2026/03/02,普通,-1000,銀行A,食費,食料品,,0,unmap-002
1,2026/03/03,別の謎,-7000,銀行A,新ジャンル,なし,,0,unmap-003
```

- [ ] **Step 4: zaim-normal.csv**

```csv
日付,方向,カテゴリ,品目,金額,通貨,振替,ID
2026/01/05,支出,食費,食料品,3500,JPY,0,zaim-001
2026/01/10,支出,住宅,家賃,80000,JPY,0,zaim-002
2026/01/15,収入,給与,本業,300000,JPY,0,zaim-003
2026/01/20,支出,通信費,携帯,8500,JPY,0,zaim-004
2026/01/22,支出,食費,外食,1200,JPY,0,zaim-005
```

- [ ] **Step 5: cross-month.csv（月跨ぎ）**

```csv
計算対象,日付,内容,金額(円),保有金融機関,大項目,中項目,メモ,振替,ID
1,2025/12/30,12月末,-1000,銀行A,食費,食料品,,0,cm-001
1,2025/12/31,大晦日,-2000,銀行A,食費,食料品,,0,cm-002
1,2026/01/01,元日,-3000,銀行A,食費,食料品,,0,cm-003
1,2026/01/02,1月初,-4000,銀行A,食費,食料品,,0,cm-004
```

- [ ] **Step 6: commit**

```bash
git add test/spending/fixtures/
git commit -m "test(phase-sp-1): add 5 fixture CSVs (MF normal/edge/unmapped, Zaim, cross-month)"
```

---

### Task 8: ゴールデンマスター snapshot テスト

**Files:**
- Create: `test/spending/snapshot.test.js`

- [ ] **Step 1: snapshot.test.js を書く**

```javascript
// test/spending/snapshot.test.js
// fixture CSV → 期待 entries → snapshot 固定化
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMFCSV, parseZaimCSV } from '../../spending/calc/csv-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, 'fixtures');

function readFixture(name) {
  return fs.readFileSync(path.join(fixturesDir, name), 'utf8');
}

// id フィールドは Date.now() に依存するためスナップショット時に正規化
function normalizeEntries(entries) {
  return entries.map(e => ({
    ...e,
    id: e.id.startsWith('csv_') ? '<dynamic>' : e.id,
  }));
}

describe('snapshot: MF CSV パース結果', () => {
  it('mf-normal.csv', () => {
    const text = readFixture('mf-normal.csv');
    const entries = parseMFCSV(text);
    expect(normalizeEntries(entries)).toMatchSnapshot();
  });
  it('mf-edge-quotes.csv', () => {
    const text = readFixture('mf-edge-quotes.csv');
    const entries = parseMFCSV(text);
    expect(normalizeEntries(entries)).toMatchSnapshot();
  });
  it('mf-unmapped-category.csv', () => {
    const text = readFixture('mf-unmapped-category.csv');
    const entries = parseMFCSV(text);
    expect(normalizeEntries(entries)).toMatchSnapshot();
  });
  it('cross-month.csv', () => {
    const text = readFixture('cross-month.csv');
    const entries = parseMFCSV(text);
    expect(normalizeEntries(entries)).toMatchSnapshot();
  });
});

describe('snapshot: Zaim CSV パース結果', () => {
  it('zaim-normal.csv', () => {
    const text = readFixture('zaim-normal.csv');
    const entries = parseZaimCSV(text);
    expect(normalizeEntries(entries)).toMatchSnapshot();
  });
});
```

- [ ] **Step 2: 初回 snapshot を作成**

```bash
source ~/.nvm/nvm.sh && npm test test/spending/snapshot.test.js -- --update
```

期待: `test/spending/__snapshots__/snapshot.test.js.snap` が生成される。

- [ ] **Step 3: snapshot 内容を確認**

```bash
cat test/spending/__snapshots__/snapshot.test.js.snap | head -50
```

意図通りの entries 配列が固定化されているか確認。`id: '<dynamic>'` の正規化が効いているか確認。

- [ ] **Step 4: 全テスト走らせ最終確認**

```bash
source ~/.nvm/nvm.sh && npm test 2>&1 | tail -5
```

期待: **300 + 5 = 305** pass（snapshot 5 件）。

- [ ] **Step 5: commit**

```bash
git add test/spending/snapshot.test.js test/spending/__snapshots__/
git commit -m "test(phase-sp-1): add fixture-based golden master snapshot tests"
```

---

### Task 9: SP-1 完了確認 + ドキュメント

**Files:**
- Create: `docs/spending-fixes/phase-sp-1-baseline.md`

- [ ] **Step 1: 完了確認**

```bash
echo "=== spending/calc/ モジュール ==="
ls spending/calc/
echo
echo "=== test/spending/ ==="
find test/spending -type f
echo
echo "=== 全テスト ==="
source ~/.nvm/nvm.sh && npm test 2>&1 | tail -5
echo
echo "=== 全 commit ==="
git log --oneline | head -10
```

期待:
- spending/calc/ に 5 ファイル
- test/spending/ に fixtures + 5 テストファイル + snapshots
- 305 / 305 pass
- 約 8 commits 追加

- [ ] **Step 2: ベースラインドキュメント作成**

```bash
mkdir -p docs/spending-fixes
```

`docs/spending-fixes/phase-sp-1-baseline.md`:

```markdown
# Phase SP-1: 支出管理アプリ テスト基盤 ベースライン

**完了日**: 2026-04-26

## 構築されたインフラ

### モジュール (spending/calc/)
- `utils.js` — fmt, toManYen, fmtManYen, parseDate
- `csv-parser.js` — parseMFCSV, parseZaimCSV, parseCSVLine, mapCategory, MF/ZAIM CATEGORY_MAP
- `aggregate.js` — aggregateEntries, getMonthData
- `sync.js` — calcSyncValues
- `suggest.js` — calcSuggestionAvg, calcSavingsImpact

### テスト (test/spending/)
- `utils.test.js` — 14 件
- `csv-parser.test.js` — 17 件
- `aggregate.test.js` — 7 件
- `sync.test.js` — 6 件
- `suggest.test.js` — 5 件
- `snapshot.test.js` — 5 件（fixture-based golden master）

### Fixtures
- mf-normal.csv / mf-edge-quotes.csv / mf-unmapped-category.csv
- zaim-normal.csv / cross-month.csv

## メトリクス
- ライフプラン側: 251/251
- 支出管理アプリ追加: **54 件**
- 合計: **305/305 グリーン**

## 後方互換
- spending/index.html は ES module 化、window.X 登録で onclick 互換維持
- localStorage spending_v1 スキーマ不変
- ブラウザ動作確認済み

## 次フェーズ (SP-2)
- 計算ロジック領域 5-8 項目監査
- CSV/データ整形領域 5-8 項目監査
- ライフプラン連携領域 3-5 項目監査
- 検出問題を docs/spending-audits/SP-*.md にレポート化
```

- [ ] **Step 3: commit**

```bash
git add docs/spending-fixes/phase-sp-1-baseline.md
git commit -m "docs(phase-sp-1): record SP-1 baseline + completion (305/305 green)"
```

---

## SP-1 完了条件チェックリスト

- [ ] spending/calc/ 5 モジュール作成
- [ ] spending/index.html から関数定義削除 + ES module 移行
- [ ] window.X = X グローバル登録で後方互換
- [ ] ブラウザで支出管理アプリ動作確認
- [ ] test/spending/ 配下に 6 テストファイル + 5 fixtures
- [ ] 既存 251 件 + 新規 54 件 = 305 件全グリーン
- [ ] ベースラインドキュメント記録

## 想定 commit 数

- Task 1〜5: ユニットテスト追加（5 commits）
- Task 6: ES module 移行（1 commit）
- Task 7: Fixtures（1 commit）
- Task 8: Snapshot（1 commit）
- Task 9: ドキュメント（1 commit）

合計 **9 commits**
