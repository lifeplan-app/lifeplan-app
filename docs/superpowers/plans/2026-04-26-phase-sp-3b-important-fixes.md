# Phase SP-3-B: Important 修正 6 件 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Phase SP-2 監査検出 Important 11 件のうち、影響度が高く設計議論不要な 6 件を修正する。残 5 件は SP-3-C で別途検討。

**Architecture:** spending/calc/*.js（純粋関数）とspending/index.html（UI/state統合層）を修正。各フィックスにユニットテスト追加。

**Tech Stack:** ES modules, Vitest 2.x

---

## 修正対象（6 件）

| ID | 領域 | 内容 | 修正先 |
|---|---|---|---|
| Fix-A | SP-CSV-07 | `saveState()` try/catch なし → `QuotaExceededError` 無音失敗 | spending/index.html |
| Fix-B | SP-CSV-06 | ID 列なし CSV 重複検知失敗（`Date.now()_i`） | spending/calc/csv-parser.js |
| Fix-C | SP-CSV-02 | `parseDate` の `yyyy.mm.dd` 等未対応 | spending/calc/utils.js |
| Fix-D | SP-CL-03 | `calcIrregularAmounts` の `nYears` 短期データ過大評価 | spending/index.html (or extracted) |
| Fix-E | SP-CL-06 | `calcSavingsImpact` 75 歳ハードコード → lifeplan 設定参照 | spending/calc/suggest.js |
| Fix-F | SP-LP-04 | `irregularSuggestions[].amount` 常に 0 → 計算値を保存 | spending/index.html |

---

## Fix-A: saveState QuotaExceededError 対応 (SP-CSV-07)

### 該当箇所
`spending/index.html` の `saveState()` 関数（grep で位置特定）:
```javascript
function saveState() {
  localStorage.setItem('spending_v1', JSON.stringify(state));
}
```

### 修正
```javascript
function saveState() {
  try {
    localStorage.setItem('spending_v1', JSON.stringify(state));
  } catch (e) {
    if (e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014)) {
      showNotification('⚠️ ストレージ容量上限に達したため保存できませんでした。古いデータを削除してください。');
      console.error('[saveState] QuotaExceededError:', e);
    } else {
      showNotification('⚠️ データの保存に失敗しました（ブラウザ設定をご確認ください）');
      console.error('[saveState] save failed:', e);
    }
  }
}
```

### テスト

ユニットテスト不可（localStorage は Node 環境にない）。手動確認のみ。

---

## Fix-B: ID-less CSV duplicate detection (SP-CSV-06)

### 該当箇所
`spending/calc/csv-parser.js` の `parseMFCSV` および `parseZaimCSV`:
```javascript
// MF
id: entryId || `csv_${Date.now()}_${i}`,
// Zaim
id: entryId || `csv_zaim_${Date.now()}_${i}`,
```

### 修正
ID 列がない場合は **内容ベースハッシュ**で安定 ID を生成。再インポート時に同一 ID となるため `existingIds.has(id)` で重複検知が機能する。

`spending/calc/csv-parser.js` の `parseMFCSV` 内 entries push 部分:
```javascript
// Before
id: entryId || `csv_${Date.now()}_${i}`,

// After
id: entryId || `csv_mf_${date}_${amountNum}_${mfCat}_${mfSubCat}_${i}`,
```

`parseZaimCSV` も同様に:
```javascript
id: entryId || `csv_zaim_${date}_${amountNum}_${cat}_${item}_${i}`,
```

`Date.now()` を排除し、`date`, `amountNum`, カテゴリ情報, 行インデックス `i` を組み合わせる。同一 CSV を再インポート → 同一 ID → `existingIds` で除外される。

### テスト

`test/spending/csv-parser.test.js` に追加:

```javascript
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
```

Zaim 側も類似のテスト 1 件追加。

---

## Fix-C: parseDate variants (SP-CSV-02)

### 該当箇所
`spending/calc/utils.js` の `parseDate`:
```javascript
const m = str.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
```

### 修正
ドット区切り `yyyy.mm.dd` を許容:
```javascript
const m = str.match(/(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
```

カレンダー検証を追加（Feb 30 等を弾く）:
```javascript
export function parseDate(str) {
  if (!str) return null;
  const m = String(str).match(/(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (!m) return null;
  const year  = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day   = parseInt(m[3], 10);
  if (year < 1900 || year > 2100) return null;
  if (month < 1  || month > 12)   return null;
  if (day   < 1  || day   > 31)   return null;
  // Calendar validity check (rejects Feb 30, Apr 31, etc.)
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}
```

### テスト

`test/spending/utils.test.js` に追加:

```javascript
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
```

---

## Fix-D: calcIrregularAmounts nYears 短期データ過大評価 (SP-CL-03)

### 該当箇所
`spending/index.html` 内の `calcIrregularAmounts`（grep で位置特定）:
```javascript
const nYears = keys.length / 12 || (1 / 12);
return { catAmounts, nYears: Math.max(nYears, 1 / 12) };
```

### 問題
`keys.length=7`（7ヶ月分データ）の時、`nYears = 0.583`。月実績合計を `/0.583` で割ると年額が **約 71% 過大評価**される。例: 7ヶ月で車検 8 万円 → ¥137,000/年 として連携。

### 修正方針
**保守的アプローチ**: `nYears` の最小値を **1.0**（1 年）にクランプ。データが 12 ヶ月未満の場合は「過去 1 年内に発生した実績合計 = 年額」として扱う。これにより過大評価を防止し、データが揃うにつれて精度が上がる挙動になる。

```javascript
function calcIrregularAmounts(keys, irCats) {
  const catAmounts = {};
  for (const k of keys) {
    const d = state.months[k];
    for (const cat of irCats) {
      catAmounts[cat.id] = (catAmounts[cat.id] || 0) + (d.categoryTotals?.[cat.id] || 0);
    }
  }
  // [Fix-D / SP-CL-03] 12ヶ月未満データでの過大評価を防ぐため nYears 下限を 1.0 にクランプ
  const rawNYears = keys.length / 12;
  const nYears = Math.max(rawNYears, 1);
  return { catAmounts, nYears };
}
```

呼出側 `doSyncToLifeplan` の `nYears` 計算も同様にクランプ:
```javascript
const nYears = Math.max(irrKeys.length / 12, 1);  // was: Math.max(..., 1/12)
```

### テスト

`spending/index.html` のインライン関数のためユニットテスト追加困難。コード内コメントで挙動を明示し、SP-3-B 完了レポートに「12ヶ月未満データの挙動変化」を記載。

将来 SP-3-C で `calcIrregularAmounts` を `spending/calc/aggregate.js` に extract した時にユニットテスト追加。

### snapshot 影響

なし（テストフィクスチャは月跨ぎでも 12 ヶ月未満なので関係なし、parseMFCSV 自体は不変）。

---

## Fix-E: calcSavingsImpact lifeplan 設定参照 (SP-CL-06)

### 該当箇所
`spending/calc/suggest.js`:
```javascript
export function calcSavingsImpact(monthlySavings, lifeplan = null) {
  let years = 30;
  let rate = 0.03;
  if (lifeplan) {
    if (lifeplan.profile?.birth) {
      const age = new Date().getFullYear() - parseInt(lifeplan.profile.birth.split('-')[0]);
      years = Math.max(5, 75 - age);
    }
    // ...
  }
}
```

### 問題
`75 - age` で「75 歳まで」をハードコード。lifeplan の `finance.simYears`（シミュ年数）や `retirement.targetAge`（退職目標年齢）などと連動しない。

### 修正方針
lifeplan の以下を優先順位で参照:
1. `lifeplan.finance.simYears` が存在 → そのまま `years` として使用
2. `lifeplan.retirement.targetAge` が存在 → `targetAge - age` を `years` に
3. それも無ければ既存の `75 - age`

```javascript
export function calcSavingsImpact(monthlySavings, lifeplan = null) {
  let years = 30;
  let rate = 0.03;
  if (lifeplan) {
    let age = null;
    if (lifeplan.profile?.birth) {
      age = new Date().getFullYear() - parseInt(lifeplan.profile.birth.split('-')[0]);
    }

    // [Fix-E / SP-CL-06] 積立期間を lifeplan 設定から推定
    if (typeof lifeplan.finance?.simYears === 'number' && lifeplan.finance.simYears > 0) {
      years = Math.max(5, lifeplan.finance.simYears);
    } else if (lifeplan.retirement?.targetAge && age != null) {
      years = Math.max(5, parseInt(lifeplan.retirement.targetAge) - age);
    } else if (age != null) {
      years = Math.max(5, 75 - age);
    }

    // 利回り（既存ロジック）
    if (lifeplan.assets?.length) {
      const totalBal = lifeplan.assets.reduce((s, a) => s + (a.amount || 0), 0);
      if (totalBal > 0) {
        const wr = lifeplan.assets.reduce((s, a) => s + (a.return || 0) * (a.amount || 0), 0) / totalBal;
        if (wr > 0 && wr < 20) rate = wr / 100;
      }
    }
  }
  const r12 = rate / 12;
  const n = years * 12;
  const fv = monthlySavings * ((Math.pow(1 + r12, n) - 1) / r12);
  return { amount: Math.round(fv / 10000), years, rate: Math.round(rate * 1000) / 10 };
}
```

### テスト

`test/spending/suggest.test.js` に追加:

```javascript
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
```

---

## Fix-F: irregularSuggestions amount 計算保存 (SP-LP-04)

### 該当箇所
`spending/index.html` の `toggleIrregularApproval()` (grep `toggleIrregularApproval`):
```javascript
sug = { categoryId: catId, name: cat?.name || catId, amount: 0, intervalYears: 1, approved: false };
```

### 問題
承認時に `amount` を計算せず常に `0` で保存。`spending_v1.lifeplanSync.irregularSuggestions[]` のスキーマ（`amount: 万円/年`）と乖離。

### 修正方針
`toggleIrregularApproval` 内、または別の helper で「現在の集計期間における当該カテゴリの年額」を計算して `amount` に格納。

```javascript
function toggleIrregularApproval(catId, checked) {
  const cat = state.categories.find(c => c.id === catId);
  if (!state.lifeplanSync.irregularSuggestions) state.lifeplanSync.irregularSuggestions = [];
  let sug = state.lifeplanSync.irregularSuggestions.find(s => s.categoryId === catId);

  // [Fix-F / SP-LP-04] 承認時に現在の集計期間に基づく年額を計算
  const irrKeys = getIrregularKeys(irregularAvgYears);
  const nYears = Math.max(irrKeys.length / 12, 1);  // Fix-D と整合
  let catTotal = 0;
  for (const k of irrKeys) {
    catTotal += state.months[k]?.categoryTotals?.[catId] || 0;
  }
  const annualManYen = Math.round(toManYen(catTotal / nYears) * 10) / 10;

  if (!sug) {
    sug = { categoryId: catId, name: cat?.name || catId, amount: annualManYen, intervalYears: 1, approved: false };
    state.lifeplanSync.irregularSuggestions.push(sug);
  }
  sug.approved = checked;
  sug.amount = annualManYen;  // 既存項目も最新値に更新
  saveState();
  renderIrregularList();
}
```

### テスト

`spending/index.html` のインライン関数のためユニットテスト追加困難。Fix-D と同様、コメント明示のみ。SP-3-B 完了レポートに記載。

---

## 実装順序

並列性なし（spending/index.html を複数 Fix が触る）。順序:

1. **Fix-C** (parseDate variants) — `spending/calc/utils.js`、独立、テスト容易
2. **Fix-B** (ID-less duplicate) — `spending/calc/csv-parser.js`、独立、テスト容易
3. **Fix-E** (calcSavingsImpact) — `spending/calc/suggest.js`、独立、テスト容易
4. **Fix-A** (saveState try/catch) — `spending/index.html`、UI 層
5. **Fix-D** (calcIrregularAmounts nYears clamp) — `spending/index.html`
6. **Fix-F** (toggleIrregularApproval amount) — `spending/index.html`、Fix-D の挙動と一致

### Task 1: Fix-C parseDate variants

**Files:**
- Modify: `spending/calc/utils.js`
- Modify: `test/spending/utils.test.js`

- [ ] **Step 1: utils.js の parseDate を修正**

上記 Fix-C コードに置換。

- [ ] **Step 2: utils.test.js に 4 ケース追加**

上記 Fix-C テストコードを既存 describe 内に追加。

- [ ] **Step 3: テスト**

```bash
source ~/.nvm/nvm.sh && npm test test/spending/utils.test.js 2>&1 | tail -10
```

期待: 14 + 4 = 18 件 pass。

- [ ] **Step 4: commit**

```bash
git add spending/calc/utils.js test/spending/utils.test.js
git commit -m "fix(phase-sp-3b): parseDate に yyyy.mm.dd 対応 + カレンダー検証 (SP-CSV-02)"
```

### Task 2: Fix-B ID-less duplicate detection

**Files:**
- Modify: `spending/calc/csv-parser.js`
- Modify: `test/spending/csv-parser.test.js`

- [ ] **Step 1: parseMFCSV と parseZaimCSV の id フォールバック修正**

両関数の `id: entryId || ...` を内容ベースハッシュに変更。

- [ ] **Step 2: csv-parser.test.js に決定性テスト 2 ケース追加**

- [ ] **Step 3: テスト + commit**

```bash
source ~/.nvm/nvm.sh && npm test test/spending/csv-parser.test.js 2>&1 | tail -10
git add spending/calc/csv-parser.js test/spending/csv-parser.test.js
git commit -m "fix(phase-sp-3b): ID 列なし CSV の重複検知用 ID を内容ベースハッシュに変更 (SP-CSV-06)"
```

### Task 3: Fix-E calcSavingsImpact

**Files:**
- Modify: `spending/calc/suggest.js`
- Modify: `test/spending/suggest.test.js`

- [ ] **Step 1: suggest.js の calcSavingsImpact を修正**

- [ ] **Step 2: suggest.test.js に 3 ケース追加**

- [ ] **Step 3: テスト + commit**

```bash
source ~/.nvm/nvm.sh && npm test test/spending/suggest.test.js 2>&1 | tail -10
git add spending/calc/suggest.js test/spending/suggest.test.js
git commit -m "fix(phase-sp-3b): calcSavingsImpact が lifeplan 設定 (simYears/targetAge) を参照 (SP-CL-06)"
```

### Task 4: Fix-A saveState try/catch

**Files:**
- Modify: `spending/index.html`

- [ ] **Step 1: saveState() を try/catch + 通知付きに変更**

- [ ] **Step 2: テスト + commit**

```bash
source ~/.nvm/nvm.sh && npm test 2>&1 | tail -5
git add spending/index.html
git commit -m "fix(phase-sp-3b): saveState の QuotaExceededError 処理 (SP-CSV-07)"
```

### Task 5: Fix-D calcIrregularAmounts nYears clamp

**Files:**
- Modify: `spending/index.html`

- [ ] **Step 1: calcIrregularAmounts と doSyncToLifeplan の nYears 下限を 1 に変更**

- [ ] **Step 2: テスト + commit**

```bash
source ~/.nvm/nvm.sh && npm test 2>&1 | tail -5
git add spending/index.html
git commit -m "fix(phase-sp-3b): calcIrregularAmounts の短期データ過大評価を防止 (SP-CL-03)"
```

### Task 6: Fix-F irregularSuggestions amount

**Files:**
- Modify: `spending/index.html`

- [ ] **Step 1: toggleIrregularApproval を amount 計算 + 保存 + 再計算ロジック付きに変更**

- [ ] **Step 2: テスト + commit**

```bash
source ~/.nvm/nvm.sh && npm test 2>&1 | tail -5
git add spending/index.html
git commit -m "fix(phase-sp-3b): irregularSuggestions.amount に年額を計算保存 (SP-LP-04)"
```

### Task 7: 完了ドキュメント

**Files:**
- Create: `docs/spending-fixes/phase-sp-3b-completion.md`

簡易完了レポート。各 Fix の SHA、テスト件数推移、ブラウザ確認ポイントを記録。

---

## 完了条件

- [ ] Fix-A〜F すべて適用
- [ ] 全 spending ユニットテスト pass（284 → 約 293+α 件）
- [ ] 6 commits + 1 docs commit

## SP-3-C への先送り（残 5 件）

- SP-CSV-04: フィクスチャ MF 実形式乖離（test 改善、production 影響なし）
- SP-CSV-08: スキップ行数通知 + unknown フォーマット警告（UX 改善）
- SP-CL-05: insurance_ratio 単月/平均の income 参照不整合（軽微）
- SP-LP-01: irregular_variable → expenses[] 完全対応（設計議論必要）
- SP-LP-04 item 2: 期間変更時の承認フラグリセット（UX 議論必要）
