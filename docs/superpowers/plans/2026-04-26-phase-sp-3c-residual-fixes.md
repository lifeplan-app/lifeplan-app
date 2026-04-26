# Phase SP-3-C: 残 Important 修正 5 件 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Phase SP-2 監査の Important 残 5 件 + SP-LP-01 設計確定を実装。

**Architecture:** spending/calc/csv-parser.js のパーサ戻り値拡張、spending/index.html の UI 統合。

---

## 修正対象（5 件）

| Fix | 監査 ID | 内容 |
|---|---|---|
| Fix-G | SP-CSV-08-A | parseMFCSV/Zaim が skipped 数を返却 → 通知でスキップ行数表示 |
| Fix-H | SP-CSV-08-B | unknown 形式時に confirm ダイアログ + キャンセル時は中断 |
| Fix-I | SP-CSV-04 | mf-normal.csv フィクスチャを実 MF ME 形式（正値 + 入/出 列）に更新 |
| Fix-J | SP-CL-05 | insurance_ratio の check / avgCheck で income 参照を統一（`state.income?.monthly`） |
| Fix-K | SP-LP-04 item 2 | `setAvgMonths` / `setIrregularYears` 実行時に approved フラグをリセット |
| Fix-L | SP-LP-01 | sync 確認モーダルに「特別費は自動連携対象外」注記を追加（設計確定） |

---

## Fix-G: skipped 行数の通知 (SP-CSV-08-A)

### 修正

**spending/calc/csv-parser.js**: `parseMFCSV` / `parseZaimCSV` の戻り値を `entries` 単独配列から `{ entries, skipped }` オブジェクトに変更。

ただし**後方互換性が重要**: 既存コードは `entries.length`、`for (const e of entries)` のように配列を期待している。

**選択肢 A**: 第二の export 関数 `parseMFCSVWithStats(text)` を追加し、既存の `parseMFCSV(text)` は配列のまま維持。
**選択肢 B**: 戻り値を変更し、呼び出し側を全て更新。

**選択 A**（破壊的変更を避けるため）:

```javascript
// spending/calc/csv-parser.js に追加
export function parseMFCSVWithStats(text, userMap = {}) {
  // 既存の parseMFCSV ロジックを内部展開し、skipped カウンタを増やす
  // または: parseMFCSV を呼んで「期待行数 - 実エントリ数」で逆算
  // 実装: 既存の parseMFCSV を関数内ロジックに展開し、skip 箇所で counter++
  ...
}
export function parseZaimCSVWithStats(text, userMap = {}) { ... }
```

**もっとシンプルな実装**: 既存 parseMFCSV を改造して内部的に `_lastSkipCount` を保持。

```javascript
let _lastMFSkipCount = 0;
export function parseMFCSV(text, userMap = {}) {
  let skipped = 0;
  // ... 既存ループ内、continue する箇所で skipped++
  // 4 箇所: 計算対象=0, 振替=1, !amountNum, !date, MF_SKIP_*
  _lastMFSkipCount = skipped;
  return entries;
}
export function getLastMFSkipCount() { return _lastMFSkipCount; }
```

似た仕組みで `parseZaimCSV` 側も `_lastZaimSkipCount`。

**最もクリーンな実装**: 戻り値を `{ entries, skipped }` に統一し、test と handleCSVFile を全て更新。コード変更箇所を限定するため、こちらを選択。

### 採用: 戻り値変更 + 呼び出し側更新

```javascript
// spending/calc/csv-parser.js
export function parseMFCSV(text, userMap = {}) {
  // ... 既存ロジック
  let skipped = 0;
  // continue する全箇所の前に skipped++ を追加
  // ヘッダ未発見は throw、データ行 0 件は skipped=0 のまま
  ...
  return { entries, skipped };
}
```

呼び出し側:
- `spending/index.html:2747-2752` (handleCSVFile): `entries = parseMFCSV(text)` → `const result = parseMFCSV(text); const entries = result.entries;`
- skipped を `pendingSkipped` に保存 → `confirmImport` で通知に表示

```javascript
// handleCSVFile 内
const result = (fmt === 'zaim') ? parseZaimCSV(text) : parseMFCSV(text);
const entries = result.entries;
window._pendingParseSkipped = result.skipped;  // confirmImport で使う
```

```javascript
// confirmImport 末尾
const parseSkip = window._pendingParseSkipped || 0;
window._pendingParseSkipped = 0;
const parts = [`${imported}件インポート`];
if (skipped > 0) parts.push(`${skipped}件重複スキップ`);
if (parseSkip > 0) parts.push(`${parseSkip}行パース失敗`);
showNotification(parts.join(' / '));
```

### テスト

`test/spending/csv-parser.test.js` の既存テスト全て更新（`entries = parseMFCSV(...)` → `const { entries } = parseMFCSV(...)`）。

新規テスト 2 件:
```javascript
it('parseMFCSV が skipped 行数を返す（計算対象=0 のスキップ）', () => {
  const csv = `計算対象,日付,内容,金額(円),保有金融機関,大項目,中項目,メモ,振替,ID
0,2026/04/01,スキップ,-1000,銀行A,食費,昼食,,0,t1
1,2026/04/02,通常,-500,食費,昼食,,0,t2`;
  const { entries, skipped } = parseMFCSV(csv);
  expect(entries.length).toBe(1);
  expect(skipped).toBe(1);
});

it('parseZaimCSV が skipped 行数を返す（不正日付スキップ）', () => {
  const csv = `日付,方向,カテゴリ,品目,金額,通貨,振替,ID
不正日付,支出,食費,昼食,1500,JPY,0,z1
2026/04/02,支出,食費,昼食,1200,JPY,0,z2`;
  const { entries, skipped } = parseZaimCSV(csv);
  expect(entries.length).toBe(1);
  expect(skipped).toBe(1);
});
```

snapshot.test.js も `parseMFCSV(text)` → `parseMFCSV(text).entries` に更新が必要。

---

## Fix-H: unknown 形式時の confirm ダイアログ (SP-CSV-08-B)

### 修正

`handleCSVFile` (spending/index.html:2727-2761):

```javascript
const fmt = detectCSVFormat(text);

// [Fix-H] unknown 形式は明示的に確認
if (fmt === 'unknown') {
  if (!confirm('CSV 形式を自動検知できませんでした。マネーフォワード ME 形式として読み込みを試行しますか？\n（誤った形式で読み込まれる可能性があります）')) {
    return;
  }
}

// バッジ更新...
```

### テスト

UI 側のため Vitest テストなし。ブラウザ確認推奨。

---

## Fix-I: mf-normal.csv フィクスチャ実形式更新 (SP-CSV-04)

### 問題
現状の `test/spending/fixtures/mf-normal.csv` は支出を負値（`-3500`）で表現し、`入/出` 列がない。実 MF ME エクスポートは正値 + `入/出` 列（"支出"/"収入"）形式。

### 修正

ヘッダに `入/出` 列を追加、金額を正値に、収入/支出を `入/出` 列で表現。

```csv
計算対象,日付,内容,金額(円),保有金融機関,大項目,中項目,メモ,振替,ID,入/出
1,2026/01/05,スーパー,3500,銀行A,食費,食料品,,0,sample-001,支出
1,2026/01/10,家賃,80000,銀行A,住宅,家賃,,0,sample-002,支出
1,2026/01/15,給与,300000,銀行A,収入,給与,,0,sample-003,収入
1,2026/01/20,携帯,8500,銀行A,通信費,携帯電話,,0,sample-004,支出
1,2026/01/22,コンビニ,1200,銀行A,食費,外食,,0,sample-005,支出
1,2026/01/25,水道,5500,銀行A,水道・光熱費,水道,,0,sample-006,支出
1,2026/01/28,ドラッグストア,2800,銀行A,日用品,生活雑貨,,0,sample-007,支出
1,2026/01/29,電気,9200,銀行A,水道・光熱費,電気,,0,sample-008,支出
1,2026/01/30,ガス,4100,銀行A,水道・光熱費,ガス,,0,sample-009,支出
1,2026/01/31,服,12000,銀行A,衣服・美容,衣服,,0,sample-010,支出
```

snapshot は再生成（金額が正/負変わるが entries の amount 値は同じ、isIncome 判定経路だけ変わる）。`-u` で更新。

### 影響

- `parseMFCSV` の `入/出` カラム経路（line 3128-3134 in original code）が初めて fixture でテストされる
- 既存 snapshot は再生成（amount 値は変わらない、`isIncome` の判定根拠が変わる）

---

## Fix-J: insurance_ratio income 参照統一 (SP-CL-05)

### 修正

`spending/index.html` 内 `SUGGESTION_TRIGGERS` の `insurance_ratio` トリガー（grep `insurance_ratio` で位置特定）:

```javascript
// Before
{ id: 'insurance_ratio', ...,
  check: (d) => d.income > 0 && (d.categoryTotals?.insurance || 0) / d.income > 0.15,
  avgCheck: (avg) => {
    const income = state.income?.monthly || 0;
    return income > 0 && (avg.cats.insurance || 0) / income > 0.15;
  },
}

// After: 両方とも state.income?.monthly を参照
{ id: 'insurance_ratio', ...,
  check: (d) => {
    const income = state.income?.monthly || 0;
    return income > 0 && (d.categoryTotals?.insurance || 0) / income > 0.15;
  },
  avgCheck: (avg) => {
    const income = state.income?.monthly || 0;
    return income > 0 && (avg.cats.insurance || 0) / income > 0.15;
  },
}
```

理由: `state.income?.monthly` はユーザー設定値（プロフィール画面で入力）で安定。`d.income` は CSV 由来でボーナス月や未記録月で大きくブレるため判定基準として不適切。

---

## Fix-K: 集計期間変更時の approval リセット (SP-LP-04 item 2)

### 修正

`setAvgMonths(months)` と `setIrregularYears(years)` (grep で位置特定):

```javascript
function setAvgMonths(m) {
  syncAvgMonths = m;
  // [Fix-K] 期間変更時に approval リセット（金額が変わるため）
  if (state.lifeplanSync.irregularSuggestions) {
    state.lifeplanSync.irregularSuggestions.forEach(s => { s.approved = false; });
  }
  saveState();
  renderSync();
}

function setIrregularYears(y) {
  irregularAvgYears = y;
  // [Fix-K] 期間変更時に approval リセット（金額が変わるため）
  if (state.lifeplanSync.irregularSuggestions) {
    state.lifeplanSync.irregularSuggestions.forEach(s => { s.approved = false; });
  }
  saveState();
  renderSync();
}
```

UI 注記をどこかに追加するのは将来検討。今は機能のみ。

---

## Fix-L: 特別費 自動連携対象外の UI 注記 (SP-LP-01)

### 修正

sync 確認モーダル（`syncToLifeplan` 内、approved 行の後）に注記を追加:

```javascript
// syncToLifeplan 内、approved.length > 0 のブロックの後に挿入
const variableCount = state.categories.filter(c => c.domain === 'irregular_variable').length;
if (variableCount > 0) {
  lines.push(`<span style="color:var(--text-muted);font-size:11px">※ 特別費（一回限りの支出）は自動連携対象外です。必要に応じてライフプラン側の「単発支出」で手動登録してください。</span>`);
}
```

これにより、「irregular_variable は自動連携しない」という SP-3-A Fix-3 の設計判断がユーザーに明示される。

---

## 実装順序

1. **Fix-G** csv-parser 戻り値変更 — 連鎖的に test 全更新
2. **Fix-I** fixture 更新 — snapshot 再生成
3. **Fix-J** insurance_ratio 統一
4. **Fix-K** approval リセット
5. **Fix-L** UI 注記
6. **Fix-H** unknown confirm

### Task 1: Fix-G + テスト全更新

最も連鎖が多い。先に対応。

- [ ] Step 1: csv-parser.js の parseMFCSV / parseZaimCSV 戻り値を `{ entries, skipped }` に変更（skipped カウンタを各 continue 箇所に追加）
- [ ] Step 2: csv-parser.test.js 内の `const entries = parseMFCSV(...)` を `const { entries } = parseMFCSV(...)` に全て更新
- [ ] Step 3: snapshot.test.js 内の `parseMFCSV(text)` を `parseMFCSV(text).entries` に更新
- [ ] Step 4: spending/index.html の handleCSVFile を `const result = parseMFCSV(...); const entries = result.entries;` に更新
- [ ] Step 5: confirmImport で `window._pendingParseSkipped` を通知に含める
- [ ] Step 6: csv-parser.test.js に skipped 件数テスト 2 件追加
- [ ] Step 7: テスト + commit

```bash
git add spending/calc/csv-parser.js test/spending/csv-parser.test.js test/spending/snapshot.test.js spending/index.html
git commit -m "fix(phase-sp-3c): parseMFCSV/Zaim が skipped 数を返却し通知に表示 (SP-CSV-08-A)"
```

期待: 既存 snapshot が変動なし（skipped=0 の fixture のため）。

### Task 2: Fix-I fixture 更新 + snapshot 再生成

- [ ] Step 1: test/spending/fixtures/mf-normal.csv をヘッダ追加 + 正値化
- [ ] Step 2: snapshot 再生成（`npm test test/spending/snapshot.test.js -- -u`）
- [ ] Step 3: snapshot 内容確認（amount 値は不変、`mfCategory` 等は不変、コンテンツが正しいか）
- [ ] Step 4: テスト + commit

```bash
git add test/spending/fixtures/mf-normal.csv test/spending/__snapshots__/snapshot.test.js.snap
git commit -m "fix(phase-sp-3c): mf-normal.csv フィクスチャを実 MF ME 形式（正値 + 入/出 列）に更新 (SP-CSV-04)"
```

### Task 3: Fix-J insurance_ratio 統一

- [ ] Step 1: SUGGESTION_TRIGGERS の insurance_ratio.check を `state.income?.monthly` 使用に変更
- [ ] Step 2: テスト + commit

### Task 4: Fix-K approval リセット

- [ ] Step 1: setAvgMonths と setIrregularYears に approval リセットを追加
- [ ] Step 2: テスト + commit

### Task 5: Fix-L UI 注記

- [ ] Step 1: syncToLifeplan の確認モーダル組み立て部分に variableCount > 0 時の注記追加
- [ ] Step 2: テスト + commit

### Task 6: Fix-H unknown 形式 confirm

- [ ] Step 1: handleCSVFile に fmt === 'unknown' の confirm 追加
- [ ] Step 2: テスト + commit

### Task 7: 完了ドキュメント

- [ ] Step 1: docs/spending-fixes/phase-sp-3c-completion.md 作成
- [ ] Step 2: commit

---

## 完了条件

- [ ] 6 fix commits + 1 docs commit
- [ ] 全テスト pass（294 → 296+）
- [ ] snapshot は Fix-I で意図的更新

## SP-3 シリーズ完了後の状態

- SP-3-A: Critical 2 + Important 1 修正済み
- SP-3-B: Important 6 修正済み
- SP-3-C: Important 5 修正済み + SP-LP-01 設計確定
- 残: Minor のみ（影響軽微、選別）
