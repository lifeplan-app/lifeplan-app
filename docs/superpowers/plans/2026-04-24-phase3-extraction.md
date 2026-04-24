# Phase 3 計算ロジック分離 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `index.html` の計算ロジック約 20 関数を `calc/` 下の 8 ファイルに抽出し、`test/helpers/core.js` の手動コピー問題を根本解決する。**挙動は一切変えない**（Phase 1 スナップショット差分ゼロが成功基準）。

**Architecture:** 各関数群を領域別に段階的に抽出。`<script src>` 方式で関数は window 経由でグローバル登録（現状と同じ動作）。Node 側テストは `vm.runInContext` による sandbox ローダー `test/helpers/load-calc.js` 経由で抽出後のファイルを直接参照。

**Tech Stack:** Vanilla JS（ES module ではなく classic script）、Vitest 2.x、Playwright 1.x（既存）、Node.js 24（nvm経由）

**基準設計書:** `docs/superpowers/specs/2026-04-24-phase3-extraction-design.md`

**リポジトリ:** `/Users/nagatohiroki/ライフプランアプリ/`（main ブランチ直接作業）

**⚠️ 重要な前提:**
- 日本語パス `/Users/nagatohiroki/ライフプランアプリ/` はシェルで必ず **ダブルクォート** で囲む
- `node` / `npm` は nvm 経由（`source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 &&` を各コマンドに prefix）
- **各 Step の終わりで Phase 1 スナップショット差分ゼロを厳格に確認**
- 計算ロジックの内容は一切変えない（変数名・引数名・数式は元のまま）
- ブランチ: `main`（ユーザー承諾済み）

---

## File Structure

### 新規作成

| パス | 想定行数 | 役割 |
|------|---------|------|
| `calc/utils.js` | ~80 | 年齢補助（依存なし） |
| `calc/asset-growth.js` | ~350 | 資産成長・税率（utils 依存） |
| `calc/income-expense.js` | ~150 | 年次収入・支出（utils 依存） |
| `calc/life-events.js` | ~200 | ライフイベント費用（utils 依存） |
| `calc/mortgage.js` | ~180 | 住宅ローン・控除（utils 依存） |
| `calc/retirement.js` | ~500 | 退職シミュ・4 プール（utils, mortgage, income-expense 依存） |
| `calc/scenarios.js` | ~150 | シナリオ比較（retirement 依存） |
| `calc/integrated.js` | ~300 | 統合シミュ（ほぼ全部） |
| `test/helpers/load-calc.js` | ~40 | Node sandbox ローダー |
| `test/helpers/test-helpers.js` | ~30 | テスト専用ヘルパー（`projectEmergencyBalance`, `calcEndYearFromAge`, `calcEndAgeFromYear`） |
| `docs/phase3-extraction/summary.md` | ~50 | 各 Step の抽出記録 |

### 変更

| パス | 変更内容 |
|------|----------|
| `index.html` | 抽出した関数群を削除、`<script src>` タグ追加 |
| `test/calc-asset-growth.test.js` | `helpers/core.js` → `loadCalc` 経由に変更 |
| `test/calc-all-asset-growth.test.js` | 同上 |
| `test/golden-master.test.js` | 同上 + `projectEmergencyBalance` は `test-helpers.js` から |
| `test/regression.test.js` | 同上 + 3 ヘルパーは `test-helpers.js` から |
| `test/property-based.test.js` | 同上 |

### 削除

| パス | 削除理由 |
|------|---------|
| `test/helpers/core.js` | Phase 3 最終 Step（Task 10）で削除。`calc/*.js` と `test-helpers.js` で置換 |

### 変更しない

- `test/scenario-snapshot.test.js`（Playwright で本物の index.html を実行するため影響なし）
- `test/helpers/playwright-runner.js`
- `test/helpers/playwright-runner.smoke.test.js`
- `test/__snapshots__/scenario-snapshot.test.js.snap`（**差分ゼロが成功基準**）
- `package.json` / `vitest.config.js`

### 対象関数と index.html 内の位置

事前調査済み（`grep -n "^function <name>"` での実位置）：

| Step | ファイル | 関数・定数 | index.html 行 |
|------|---------|-----------|-------------|
| 1 | `utils.js` | `calcAge` | 6681 |
| 1 | `utils.js` | `calcAgeAtYear` | 6693 |
| 1 | `utils.js` | `calcPartnerAgeAtYear` | 6701 |
| 1 | `utils.js` | `ageToYear` | 6740 |
| 2 | `asset-growth.js` | `ASSET_TYPES` | 5343 |
| 2 | `asset-growth.js` | `TAX_TYPE_DEFAULT` | 7879 |
| 2 | `asset-growth.js` | `TAX_RATE` | 7886 |
| 2 | `asset-growth.js` | `effectiveReturn` | 7888 |
| 2 | `asset-growth.js` | `calcAssetGrowth` | 8700 |
| 2 | `asset-growth.js` | `calcAllAssetGrowth` | 8820 |
| 3 | `income-expense.js` | `getIncomeForYear` | 6748 |
| 3 | `income-expense.js` | `getExpenseForYear` | 6765 |
| 3 | `income-expense.js` | `getRecurringExpenseForYear` | 6792 |
| 3 | `income-expense.js` | `getOneTimeForYear` | 6810 |
| 3 | `income-expense.js` | `getIncomeForYearWithGrowth` | 17145 |
| 4 | `life-events.js` | `EDU_COST` | 12107 |
| 4 | `life-events.js` | `PHASE_AGES` | 12125 |
| 4 | `life-events.js` | `calcLECostByYear` | 13023 |
| 5 | `mortgage.js` | `calcMonthlyPayment` | 12558 |
| 5 | `mortgage.js` | `calcMortgageSchedule` | 12567 |
| 5 | `mortgage.js` | `calcMortgage` | 12617 |
| 5 | `mortgage.js` | `calcIncomeTaxAmount` | 17274 |
| 5 | `mortgage.js` | `calcMortgageDeduction` | 17295 |
| 6 | `retirement.js` | `calcRetirementSim` | 15343 |
| 6 | `retirement.js` | `getRetirementParams` | 17239 |
| 6 | `retirement.js` | `calcRetirementSimWithOpts` | 17525 |
| 7 | `scenarios.js` | `getScenarioBase` | 20678 |
| 7 | `scenarios.js` | `getAdaptiveScenarios` | 20902 |
| 7 | `scenarios.js` | `calcScenarioSim` | 20969 |
| 7 | `scenarios.js` | `calcScenarioFullTimeline` | 21000 |
| 8 | `integrated.js` | `calcIntegratedSim` | 14239 |

行番号は Phase 2.5 完了時点（`9ac846f`）。Phase 3 進行中に上の Step で index.html が縮むため、後続 Step の行番号は grep で再確認する。

---

## 共通ワークフロー（Task 3 以降で繰り返す）

各 Step の手順：

1. **関数範囲を特定**: 該当関数の開始行・終了行を grep/Read で確認
2. **calc/<name>.js を新規作成**: 抽出対象の関数定義をそのままコピー
3. **index.html から該当範囲を削除**
4. **index.html の既存 `<script>` タグ直前に `<script src="calc/<name>.js"></script>` を追加**（Step 1 の utils.js が最初に読まれるよう依存順を守る）
5. **`npm test` 実行**: 既存 155 件グリーン維持を確認
6. （Step 2 のみ）既存ユニットテスト 5 ファイルの `helpers/core.js` import を `loadCalc` 経由に切替、`helpers/core.js` から該当関数を削除、再度 `npm test`
7. **変更をコミット**

---

## Task 1: Setup（calc/ ディレクトリ + load-calc.js + test-helpers.js 雛形）

**Files:**
- Create: `calc/` ディレクトリ
- Create: `test/helpers/load-calc.js`
- Create: `test/helpers/test-helpers.js`
- Create: `docs/phase3-extraction/summary.md`

**狙い:** Phase 3 で使う共通インフラを 1 コミットで用意。以降の Task 2〜10 はこれを前提に動く。

- [ ] **Step 1: ディレクトリ作成**

Run:
```bash
mkdir -p "/Users/nagatohiroki/ライフプランアプリ/calc" "/Users/nagatohiroki/ライフプランアプリ/docs/phase3-extraction" && ls "/Users/nagatohiroki/ライフプランアプリ/calc"
```
Expected: `calc/` が存在、中身空。

- [ ] **Step 2: `test/helpers/load-calc.js` を作成**

Create `test/helpers/load-calc.js` with:

```javascript
// test/helpers/load-calc.js
// Phase 3 で抽出された calc/*.js を Node テスト用に sandbox へロードするヘルパー。
// vm.runInContext で classic script として評価するため、ブラウザ同様に
// 関数・定数は sandbox 直下（または sandbox.window 経由）に登録される。
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CALC_DIR = resolve(__dirname, '..', '..', 'calc');

// 複数ファイルが同じ global を共有するサンドボックス
const sandbox = {
  console,
  Math, Number, Object, Array, Set, Map, JSON, Date, Error,
  parseFloat, parseInt, isFinite, isNaN, NaN, Infinity,
  window: {},
};
vm.createContext(sandbox);

export function loadCalc(filename) {
  const src = readFileSync(resolve(CALC_DIR, filename), 'utf8');
  vm.runInContext(src, sandbox, { filename });
}

export function getSandbox() {
  return sandbox;
}

export function loadCalcBundle(filenames) {
  for (const f of filenames) loadCalc(f);
  return sandbox;
}
```

- [ ] **Step 3: `test/helpers/test-helpers.js` を作成**

Create `test/helpers/test-helpers.js`。`projectEmergencyBalance` / `calcEndYearFromAge` / `calcEndAgeFromYear` は index.html に存在しないテスト専用ユーティリティ。Task 10 で `helpers/core.js` を削除する際に参照先として使用。

**今の時点では中身は最小限**：

```javascript
// test/helpers/test-helpers.js
// index.html に存在しないテスト専用ユーティリティ。
// Phase 3 Task 10 で helpers/core.js を削除する際にここへ移動する。
// Task 10 までは空のまま保持。

export {};
```

- [ ] **Step 4: `docs/phase3-extraction/summary.md` を雛形で作成**

Create `docs/phase3-extraction/summary.md` with:

```markdown
# Phase 3 計算ロジック分離 サマリー

`index.html` の計算ロジック約 20 関数を `calc/` 下の 8 ファイルに抽出した記録。

## 使い方

各 Step 完了時に「抽出関数」「index.html の行数変化」「commit SHA」を追記。

## 基準値（Phase 2.5 完了時点）

- index.html 行数: 23,489 行
- helpers/core.js 行数: 352 行
- calc/ ディレクトリ: なし
- npm test: 155/155 グリーン

---

## Step 1: calc/utils.js（年齢補助）
（Task 2 実施時に記入）

## Step 2: calc/asset-growth.js（資産成長・税率）
（Task 3 実施時に記入）

## Step 3: calc/income-expense.js（年次収入・支出）
（Task 4 実施時に記入）

## Step 4: calc/life-events.js（ライフイベント費用）
（Task 5 実施時に記入）

## Step 5: calc/mortgage.js（住宅ローン）
（Task 6 実施時に記入）

## Step 6: calc/retirement.js（退職シミュ）
（Task 7 実施時に記入）

## Step 7: calc/scenarios.js（シナリオ比較）
（Task 8 実施時に記入）

## Step 8: calc/integrated.js（統合シミュ）
（Task 9 実施時に記入）

## Step 9: helpers/core.js 削除
（Task 10 実施時に記入）

## 完了時点（Phase 3 完了後）
（Task 10 で記入：最終行数・コミット数・全体総括）
```

- [ ] **Step 5: `npm test` で非破壊確認**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npm test 2>&1 | tail -5
```
Expected: 155/155 グリーン（新ファイルは既存テストに影響しない）。

- [ ] **Step 6: コミット**

Run:
```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add "calc/.gitkeep" test/helpers/load-calc.js test/helpers/test-helpers.js docs/phase3-extraction/summary.md 2>/dev/null; touch "calc/.gitkeep" 2>/dev/null; git add calc/.gitkeep test/helpers/load-calc.js test/helpers/test-helpers.js docs/phase3-extraction/summary.md && git commit -m "chore(phase3): scaffold calc dir, load-calc.js, test-helpers.js, summary"
```

**注**: `calc/.gitkeep` は中身空のディレクトリを git 管理に乗せるため（Task 2 で削除される）。

---

## Task 2: Step 1 — calc/utils.js（年齢補助の抽出）

**Files:**
- Create: `calc/utils.js`
- Modify: `index.html`（該当 4 関数を削除、`<script src>` タグ追加、`calc/.gitkeep` 削除）
- Modify: `docs/phase3-extraction/summary.md`

**狙い:** 他ファイルが依存する土台を最初に抽出。

**対象関数（index.html の行）:**
- `calcAge` (6681-6692)
- `calcAgeAtYear` (6693-6700)
- `calcPartnerAgeAtYear` (6701-6707)
- `ageToYear` (6740-6747)

- [ ] **Step 1: 関数範囲を Read で確認**

該当関数の正確な開始・終了行を Read で確認。特に `calcAge` の終了位置と次の関数との境界（`calcAgeAtYear` 直前に `//` コメントなどがあれば含める/除外判断）。

- [ ] **Step 2: `calc/utils.js` を作成**

Create `calc/utils.js`。内容は index.html の L6681-6707 と L6740-6747 をそのままコピー：

```javascript
// calc/utils.js
// Phase 3 Step 1: 年齢補助ユーティリティ（index.html から抽出）
// 依存: なし
// このファイルはブラウザでは <script src> で読み込まれ、関数はグローバルに登録される。
// Node テスト環境では test/helpers/load-calc.js 経由で sandbox にロードされる。

function calcAge() {
  // [index.html:6681-6692 と同一]
}

// 指定年における本人の年齢（birth未設定なら null）
function calcAgeAtYear(yr) {
  // [index.html:6693-6700 と同一]
}

// 指定年におけるパートナーの年齢（partnerbirth未設定なら null）
function calcPartnerAgeAtYear(yr) {
  // [index.html:6701-6707 と同一]
}

function ageToYear(age) {
  // [index.html:6740-6747 と同一]
}
```

**重要**: コメント内の行番号は参考用。実際のコード本体は Read した内容を忠実にコピーする。

- [ ] **Step 3: index.html から該当関数を削除**

Edit で L6681-6707 と L6740-6747 を削除。間に他関数があるので Read で境界を確認してから削除範囲を決める。

**注**: `calcAge` と `calcAgeAtYear` / `calcPartnerAgeAtYear` は連続。L6708-6739 に `makeYearLabels` 等の他の関数があれば保持する。

- [ ] **Step 4: `<script src>` タグを追加**

`index.html:5341` 付近の既存 `<script>` タグ直前に挿入：

```html
<!-- Phase 3: calc/ 下の計算ロジックモジュール -->
<script src="calc/utils.js"></script>
```

Edit 対象: `index.html:5341` 直前。`<script>` の前の行を Read で確認してから。

- [ ] **Step 5: `calc/.gitkeep` を削除**

Run:
```bash
rm "/Users/nagatohiroki/ライフプランアプリ/calc/.gitkeep"
```

- [ ] **Step 6: `npm test` で失敗なし確認**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npm test 2>&1 | tail -10
```
Expected: **155/155 グリーン、snapshot 差分ゼロ**。差分が出た場合は抽出で挙動が変わっているので Step 2 からやり直し。

- [ ] **Step 7: `summary.md` に Step 1 の実測を追記**

Edit で `## Step 1: calc/utils.js（年齢補助）` セクションに以下を記入：

```
- **抽出関数**: `calcAge`, `calcAgeAtYear`, `calcPartnerAgeAtYear`, `ageToYear`
- **calc/utils.js 行数**: N 行
- **index.html 削減行数**: 約 N 行（23,489 → XXX）
- **テスト結果**: 155/155 グリーン、snapshot 差分 0 行
- **commit SHA**: （Step 8 で追記）
```

- [ ] **Step 8: コミット + SHA 追記**

Run:
```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add calc/utils.js index.html docs/phase3-extraction/summary.md && git rm calc/.gitkeep 2>/dev/null; git commit -m "refactor(phase3): extract calcAge/calcAgeAtYear/calcPartnerAgeAtYear/ageToYear to calc/utils.js"
```

その後 `git log -1 --format=%h` で SHA 取得、Edit で summary.md の commit SHA を補完、追加コミット：

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add docs/phase3-extraction/summary.md && git commit -m "docs(phase3): record Step 1 actual SHA"
```

---

## Task 3: Step 2 — calc/asset-growth.js + helpers/core.js の段階的削除 + 5 テスト切替

**Files:**
- Create: `calc/asset-growth.js`
- Modify: `index.html`（該当関数・定数削除、`<script src>` 追加）
- Modify: `test/calc-asset-growth.test.js`, `test/calc-all-asset-growth.test.js`, `test/golden-master.test.js`, `test/regression.test.js`, `test/property-based.test.js`
- Modify: `test/helpers/core.js`（`ASSET_TYPES`, `TAX_*`, `effectiveReturn`, `calcAssetGrowth`, `calcAllAssetGrowth` を削除）
- Modify: `docs/phase3-extraction/summary.md`

**狙い:** Phase 3 で最も影響範囲が広い Step。`helpers/core.js` の主要部分を除去し、5 つのユニットテストが `loadCalc` 経由で `calc/asset-growth.js` を使うように切替。

**対象関数・定数（index.html の行）:**
- `ASSET_TYPES` (5343 付近で始まる const 定義、終端 `};`)
- `TAX_TYPE_DEFAULT` (7879 付近)
- `TAX_RATE` (7886)
- `effectiveReturn` (7888)
- `calcAssetGrowth` (8700)
- `calcAllAssetGrowth` (8820)

### Step 2 の手順

- [ ] **Step 1: 関数範囲を Read で確認**

特に `ASSET_TYPES` は複数行のオブジェクト定義なので終端 `};` の行を特定。`calcAssetGrowth` と `calcAllAssetGrowth` も関数本体が長いので開始・終了を両方確認。

- [ ] **Step 2: `calc/asset-growth.js` を作成**

Create `calc/asset-growth.js`。ヘッダコメント + index.html から該当部分をコピー：

```javascript
// calc/asset-growth.js
// Phase 3 Step 2: 資産成長・税率（index.html から抽出）
// 依存: utils.js（calcAgeAtYear 等。ただし asset-growth 自体は直接呼んでいない可能性あり。
//       ただし effectiveReturn / calcAssetGrowth / calcAllAssetGrowth の内部で state を使う場合は、
//       utils.js より後にロードすること）

const ASSET_TYPES = {
  // ... index.html L5343-XXXX と同一
};

const TAX_TYPE_DEFAULT = {
  // ... index.html L7879-XXXX と同一
};

const TAX_RATE = 0.20315;

function effectiveReturn(annualReturn, taxType) {
  // ... index.html L7888-XXXX と同一
}

function calcAssetGrowth(a, years, extraContribs = []) {
  // ... index.html L8700-XXXX と同一
}

function calcAllAssetGrowth(assets, years) {
  // ... index.html L8820-XXXX と同一
}
```

**重要**: 実装本体は Read した index.html の内容を忠実にコピー。コメント「L5343-XXXX と同一」は参考表記で、実際には Read 結果そのものを貼る。

- [ ] **Step 3: index.html から該当部分を削除**

Edit で 6 箇所（`ASSET_TYPES`, `TAX_TYPE_DEFAULT`, `TAX_RATE`, `effectiveReturn`, `calcAssetGrowth`, `calcAllAssetGrowth`）を削除。

- [ ] **Step 4: `<script src>` を追加**

`calc/utils.js` の `<script>` タグ直後に挿入：

```html
<script src="calc/asset-growth.js"></script>
```

- [ ] **Step 5: `npm test` で失敗確認**

```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npm test 2>&1 | tail -10
```

Expected: **スナップショット 25 件はグリーン維持**（本物の index.html を Playwright で実行しているため関数の位置が変わっても同じ結果）。**ユニットテスト 128 件もグリーン維持**（helpers/core.js 側の複製がまだ残っている）。**155/155 グリーン**のはず。

- [ ] **Step 6: 5 つのユニットテストファイルを `loadCalc` 経由に切替**

各テストファイルについて、`import { ... } from './helpers/core.js'` を以下のパターンに置換：

**Before (例: `test/calc-asset-growth.test.js`)**:
```javascript
import { calcAssetGrowth, TAX_RATE } from './helpers/core.js';
```

**After**:
```javascript
import { loadCalc, getSandbox } from './helpers/load-calc.js';
import { describe, it, expect, beforeAll } from 'vitest';

let sb;
beforeAll(() => {
  loadCalc('utils.js');
  loadCalc('asset-growth.js');
  sb = getSandbox();
});

// テスト内では sb.calcAssetGrowth, sb.TAX_RATE で参照
```

**各テストファイルの変更詳細:**

1. `test/calc-asset-growth.test.js` — `calcAssetGrowth`, `TAX_RATE` → `sb.*` に置換
2. `test/calc-all-asset-growth.test.js` — `calcAllAssetGrowth` → `sb.calcAllAssetGrowth`
3. `test/property-based.test.js` — `calcAssetGrowth`, `calcAllAssetGrowth` → `sb.*`
4. `test/golden-master.test.js` — `calcAssetGrowth` → `sb.calcAssetGrowth`、**`projectEmergencyBalance` は `helpers/core.js` 内で一旦残存**（Task 10 で `test-helpers.js` へ移動）
5. `test/regression.test.js` — `calcAssetGrowth` 等 → `sb.*`、`projectEmergencyBalance` / `calcEndYearFromAge` / `calcEndAgeFromYear` は `helpers/core.js` から継続 import（Task 10 で移動）

**詳細手順**: 各ファイルを Read → Edit で import 行を置換 → describe の外で `let sb; beforeAll(() => { loadCalc(...); sb = getSandbox(); })` を追加 → テスト本体の関数参照を `sb.functionName` に置換。

**注**: `calcAssetGrowth` のデフォルト引数 `_currentYear = new Date().getFullYear()` は helpers/core.js 版の機能で index.html 版にはない。そのため sandbox 版を呼ぶ際は `sb.calcAssetGrowth(asset, years, extras)` で固定（デフォルト引数は使わない）。もしテストがこの 4 番目の引数を使っているなら、sandbox 版では現在年が実行時の年になる点に注意（テストが日時依存になる可能性）。

- [ ] **Step 7: `test/helpers/core.js` から該当定義を削除**

以下の export を削除：
- `ASSET_TYPES`（L13-)
- `TAX_TYPE_DEFAULT`（L35-）
- `TAX_RATE`（L44）
- `effectiveReturn`（L46-）
- `calcAssetGrowth`（L56-）
- `calcAllAssetGrowth`（L158-）

残るのは `projectEmergencyBalance`, `calcEndYearFromAge`, `calcEndAgeFromYear`（Task 10 で削除予定）。

- [ ] **Step 8: `npm test` で 155/155 グリーン確認**

```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npm test 2>&1 | tail -10
```

- [ ] **Step 9: summary.md に Step 2 の実測を追記**

- [ ] **Step 10: コミット**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add calc/asset-growth.js index.html test/calc-asset-growth.test.js test/calc-all-asset-growth.test.js test/golden-master.test.js test/regression.test.js test/property-based.test.js test/helpers/core.js docs/phase3-extraction/summary.md && git commit -m "refactor(phase3): extract asset-growth module and switch unit tests to loadCalc"
```

- [ ] **Step 11: SHA 補完コミット**

Task 2 Step 8 と同じ手順で SHA を summary.md に補完。

---

## Task 4: Step 3 — calc/income-expense.js

**Files:**
- Create: `calc/income-expense.js`
- Modify: `index.html`
- Modify: `docs/phase3-extraction/summary.md`

**狙い:** 収入・支出関連の 5 関数を抽出。

**対象関数（index.html の行、Task 3 完了後に再 grep で確認）:**
- `getIncomeForYear` (6748 付近)
- `getExpenseForYear` (6765 付近)
- `getRecurringExpenseForYear` (6792 付近)
- `getOneTimeForYear` (6810 付近)
- `getIncomeForYearWithGrowth` (17145 付近)

**注**: 先行 Step で index.html の行数が変動しているので、**各 Step 開始時に grep で行番号を再確認**すること：

```bash
grep -nE "^function (getIncomeForYear|getExpenseForYear|getRecurringExpenseForYear|getOneTimeForYear|getIncomeForYearWithGrowth)\b" "/Users/nagatohiroki/ライフプランアプリ/index.html"
```

### Task 4 手順

- [ ] **Step 1: grep で最新行番号を確認**

上記 grep コマンド実行。現在の行番号を把握。

- [ ] **Step 2: 対象関数を Read で確認し、範囲を特定**

各関数の開始・終了行（次の関数定義の直前）を特定。

- [ ] **Step 3: `calc/income-expense.js` を作成**

ヘッダコメント + 5 関数を index.html からコピー：

```javascript
// calc/income-expense.js
// Phase 3 Step 3: 年次収入・支出（index.html から抽出）
// 依存: utils.js（calcAge 等を内部で呼ぶ）、asset-growth.js（ASSET_TYPES を getExpenseForYear が参照する場合）
//
// ブラウザ: <script src> 読込で関数がグローバル登録される
// Node テスト: load-calc.js 経由で sandbox にロード

function getIncomeForYear(yr) { /* ... index.html の内容 ... */ }
function getExpenseForYear(yr) { /* ... */ }
function getRecurringExpenseForYear(year) { /* ... */ }
function getOneTimeForYear(yr) { /* ... */ }
function getIncomeForYearWithGrowth(yr) { /* ... */ }
```

- [ ] **Step 4: index.html から削除**

5 関数を Edit で削除（`getIncomeForYearWithGrowth` は他 4 関数と離れているので別操作）。

- [ ] **Step 5: `<script src>` 追加**

`asset-growth.js` の直後に：
```html
<script src="calc/income-expense.js"></script>
```

- [ ] **Step 6: `npm test` で 155/155 グリーン確認**

- [ ] **Step 7: summary.md に Step 3 を追記**

- [ ] **Step 8: コミット**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add calc/income-expense.js index.html docs/phase3-extraction/summary.md && git commit -m "refactor(phase3): extract income/expense getters to calc/income-expense.js"
```

- [ ] **Step 9: SHA 補完コミット**

---

## Task 5: Step 4 — calc/life-events.js

**Files:**
- Create: `calc/life-events.js`
- Modify: `index.html`
- Modify: `docs/phase3-extraction/summary.md`

**対象（行番号は grep で再確認）:**
- `EDU_COST` (12107 付近、const 定義)
- `PHASE_AGES` (12125 付近)
- `calcLECostByYear` (13023 付近、**中に `calcLeaveReduction` がネスト**されている)

### Task 5 手順

- [ ] **Step 1: grep で行番号再確認**

```bash
grep -nE "^function calcLECostByYear\b|^const (EDU_COST|PHASE_AGES) =" "/Users/nagatohiroki/ライフプランアプリ/index.html"
```

- [ ] **Step 2: Read で `calcLECostByYear` の終端を確認**

`calcLECostByYear` の内部に `calcLeaveReduction` がネストされている。関数の閉じ括弧を見つけるまで Read。

- [ ] **Step 3: `calc/life-events.js` 作成**

```javascript
// calc/life-events.js
// Phase 3 Step 4: ライフイベント費用（教育費・保育・育休・介護・奨学金）
// 依存: utils.js

const EDU_COST = { /* ... */ };
const PHASE_AGES = { /* ... */ };

function calcLECostByYear(year, opts = {}) {
  /* 内部で calcLeaveReduction がネスト定義される */
}
```

- [ ] **Step 4: index.html から削除**

- [ ] **Step 5: `<script src>` 追加**

```html
<script src="calc/life-events.js"></script>
```

- [ ] **Step 6: `npm test`**

- [ ] **Step 7: summary.md 追記**

- [ ] **Step 8: コミット**

```bash
git commit -m "refactor(phase3): extract calcLECostByYear and life-event tables to calc/life-events.js"
```

- [ ] **Step 9: SHA 補完**

---

## Task 6: Step 5 — calc/mortgage.js

**Files:**
- Create: `calc/mortgage.js`
- Modify: `index.html`
- Modify: `docs/phase3-extraction/summary.md`

**対象:**
- `calcMonthlyPayment` (12558 付近)
- `calcMortgageSchedule` (12567 付近)
- `calcMortgage` (12617 付近、DOM 触る可能性あり → 要判断)
- `calcIncomeTaxAmount` (17274 付近、Phase 2.5 で新設)
- `calcMortgageDeduction` (17295 付近)

### Task 6 手順

- [ ] **Step 1: grep で行番号再確認**

```bash
grep -nE "^function (calcMonthlyPayment|calcMortgageSchedule|calcMortgage|calcMortgageDeduction|calcIncomeTaxAmount)\b" "/Users/nagatohiroki/ライフプランアプリ/index.html"
```

- [ ] **Step 2: `calcMortgage()` が DOM を触るか Read で確認**

`document.getElementById` 等の DOM API 呼び出しがあれば、それは UI 関数扱いで**抽出しない**（index.html に残す）。その場合、抽出対象は 4 関数（`calcMonthlyPayment`, `calcMortgageSchedule`, `calcIncomeTaxAmount`, `calcMortgageDeduction`）のみ。

- [ ] **Step 3: `calc/mortgage.js` 作成**

```javascript
// calc/mortgage.js
// Phase 3 Step 5: 住宅ローン・住宅ローン控除
// 依存: utils.js

function calcMonthlyPayment(principal, annualRate, remainingMonths) { /* ... */ }
function calcMortgageSchedule() { /* ... */ }
// calcMortgage は DOM 依存のため index.html に残す（Read 結果で判断）
function calcIncomeTaxAmount(taxableIncomeMan) { /* ... */ }
function calcMortgageDeduction(year, balance) { /* ... */ }
```

- [ ] **Step 4: index.html から抽出対象を削除**

- [ ] **Step 5: `<script src>` 追加**

```html
<script src="calc/mortgage.js"></script>
```

- [ ] **Step 6: `npm test`**

- [ ] **Step 7: summary.md 追記**

- [ ] **Step 8: コミット**

```bash
git commit -m "refactor(phase3): extract mortgage calculations to calc/mortgage.js"
```

- [ ] **Step 9: SHA 補完**

---

## Task 7: Step 6 — calc/retirement.js

**Files:**
- Create: `calc/retirement.js`
- Modify: `index.html`
- Modify: `docs/phase3-extraction/summary.md`

**対象（最大規模の Step、~500 行）:**
- `getRetirementParams` (17239 付近)
- `calcRetirementSim` (15343 付近)
- `calcRetirementSimWithOpts` (17525 付近)

### Task 7 手順

- [ ] **Step 1: grep で行番号再確認 + 範囲特定**

```bash
grep -nE "^function (calcRetirementSim|calcRetirementSimWithOpts|getRetirementParams)\b" "/Users/nagatohiroki/ライフプランアプリ/index.html"
```

- [ ] **Step 2: 各関数を Read で終端確認**

`calcRetirementSimWithOpts` は特に長い（~250 行想定）。関数定義全体を把握。

- [ ] **Step 3: `calc/retirement.js` 作成**

```javascript
// calc/retirement.js
// Phase 3 Step 6: 退職シミュ・4 プール取り崩し
// 依存: utils.js, mortgage.js, income-expense.js, life-events.js

function getRetirementParams() { /* ... */ }
function calcRetirementSim() { /* 内部で calcRetirementSimWithOpts を呼ぶ */ }
function calcRetirementSimWithOpts(opts = {}) { /* ... */ }
```

- [ ] **Step 4: index.html から削除**

- [ ] **Step 5: `<script src>` 追加**

```html
<script src="calc/retirement.js"></script>
```

- [ ] **Step 6: `npm test`**

**重要**: Phase 1 スナップショットの `calcRetirementSimWithOpts` 標準/楽観/悲観（3 パターン × 5 シナリオ = 15 件）が変化したら抽出ミス。要確認。

- [ ] **Step 7: summary.md 追記**

- [ ] **Step 8: コミット**

```bash
git commit -m "refactor(phase3): extract retirement simulation to calc/retirement.js"
```

- [ ] **Step 9: SHA 補完**

---

## Task 8: Step 7 — calc/scenarios.js

**Files:**
- Create: `calc/scenarios.js`
- Modify: `index.html`
- Modify: `docs/phase3-extraction/summary.md`

**対象:**
- `getScenarioBase` (20678 付近)
- `getAdaptiveScenarios` (20902 付近)
- `calcScenarioSim` (20969 付近)
- `calcScenarioFullTimeline` (21000 付近)

### Task 8 手順

- [ ] **Step 1: grep で行番号再確認**

- [ ] **Step 2-9: 他 Step と同じ流れで抽出・テスト・コミット**

`calc/scenarios.js` 作成 → index.html 削除 → `<script src>` 追加 → `npm test` → summary 追記 → コミット → SHA 補完。

commit メッセージ: `refactor(phase3): extract scenario comparison to calc/scenarios.js`

---

## Task 9: Step 8 — calc/integrated.js（最後の計算抽出）

**Files:**
- Create: `calc/integrated.js`
- Modify: `index.html`
- Modify: `docs/phase3-extraction/summary.md`

**対象:**
- `calcIntegratedSim` (14239 付近、Phase 1 の本命関数)

### Task 9 手順

- [ ] **Step 1: grep で行番号再確認**

- [ ] **Step 2: 関数全体を Read**

Phase 2.5 で多数の fix が入って大きくなっている可能性あり。関数本体全体を把握。

- [ ] **Step 3: `calc/integrated.js` 作成**

```javascript
// calc/integrated.js
// Phase 3 Step 8: 統合キャッシュフローシミュレーション（Phase 1 スナップショットの主要対象）
// 依存: utils.js, asset-growth.js, income-expense.js, life-events.js, mortgage.js, retirement.js, scenarios.js

function calcIntegratedSim(years, opts = {}) { /* ... */ }
```

- [ ] **Step 4: index.html から削除**

- [ ] **Step 5: `<script src>` 追加（依存の最後に）**

```html
<script src="calc/integrated.js"></script>
```

- [ ] **Step 6: `npm test`**

**最大の関門**: シナリオ snapshot の `calcIntegratedSim` 5 件が変化するとここでバレる。スナップショット差分ゼロ必須。

- [ ] **Step 7-9: summary 追記 + コミット + SHA 補完**

commit メッセージ: `refactor(phase3): extract calcIntegratedSim to calc/integrated.js`

---

## Task 10: Step 9 — helpers/core.js 削除 + test-helpers.js 本格化 + 最終サマリー

**Files:**
- Modify: `test/helpers/test-helpers.js`（`projectEmergencyBalance`, `calcEndYearFromAge`, `calcEndAgeFromYear` を移動）
- Modify: `test/golden-master.test.js`（`projectEmergencyBalance` の import 先変更）
- Modify: `test/regression.test.js`（3 関数の import 先変更）
- Delete: `test/helpers/core.js`
- Modify: `docs/phase3-extraction/summary.md`（最終総括）

**狙い:** `helpers/core.js` に残っていたテスト専用関数を `test-helpers.js` に移し、core.js を完全削除。Phase 3 完了。

### Task 10 手順

- [ ] **Step 1: `test/helpers/core.js` に残っている関数を確認**

```bash
grep -nE "^export" "/Users/nagatohiroki/ライフプランアプリ/test/helpers/core.js"
```

Expected: Task 3 以降で除去された結果、残っているのは:
- `projectEmergencyBalance`
- `calcEndYearFromAge`
- `calcEndAgeFromYear`

これら 3 関数を Read で本体取得。

- [ ] **Step 2: `test/helpers/test-helpers.js` を更新**

`export {};` のみだった test-helpers.js に 3 関数を移動：

```javascript
// test/helpers/test-helpers.js
// index.html に存在しないテスト専用ユーティリティ。
// Phase 3 Task 10 で helpers/core.js から移動。

export function projectEmergencyBalance(asset, yearsToRetire) {
  // ... helpers/core.js の内容をそのままコピー
}

export function calcEndYearFromAge(birthYear, age) {
  // ... 同上
}

export function calcEndAgeFromYear(birthYear, endYear) {
  // ... 同上
}
```

- [ ] **Step 3: テストの import 先を変更**

`test/golden-master.test.js`:
```javascript
// before:
// import { projectEmergencyBalance } from './helpers/core.js';
// after:
import { projectEmergencyBalance } from './helpers/test-helpers.js';
```

`test/regression.test.js`:
```javascript
// before:
// import { projectEmergencyBalance, calcEndYearFromAge, calcEndAgeFromYear } from './helpers/core.js';
// after:
import { projectEmergencyBalance, calcEndYearFromAge, calcEndAgeFromYear } from './helpers/test-helpers.js';
```

他のテストは Task 3 で既に `loadCalc` 経由になっているので変更不要。

- [ ] **Step 4: `test/helpers/core.js` を削除**

Run:
```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git rm test/helpers/core.js
```

- [ ] **Step 5: `grep "helpers/core"` で残存参照確認**

```bash
grep -rn "helpers/core" "/Users/nagatohiroki/ライフプランアプリ/test" "/Users/nagatohiroki/ライフプランアプリ/index.html" 2>/dev/null | head
```

Expected: マッチなし。もし残っていたら Step 3 の更新漏れ。

- [ ] **Step 6: `npm test` で 155/155 グリーン確認**

```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npm test 2>&1 | tail -10
```

Expected: 155/155 グリーン、snapshot 差分ゼロ。

- [ ] **Step 7: `summary.md` の最終総括セクションを完成**

以下のような最終まとめを `## 完了時点（Phase 3 完了後）` セクションに書く：

```markdown
## 完了時点（Phase 3 完了後）

### 成果物
- `calc/` 下に 8 ファイル（合計 X 行）
- `test/helpers/load-calc.js`（Node sandbox ローダー）
- `test/helpers/test-helpers.js`（テスト専用ヘルパー 3 関数）
- `docs/phase3-extraction/summary.md`（本ドキュメント）

### 削減
- `index.html`: 23,489 → X 行（-Y 行）
- `test/helpers/core.js`: 352 → 削除

### テスト
- npm test: 155/155 グリーン
- snapshot 差分: 0 行（挙動不変を確認）

### コミット数
- Phase 3 全体で約 N コミット（各 Step fix コミット + SHA 補完コミット）

### 成功基準の確認
1. ✅ calc/ に 8 ファイル作成
2. ✅ index.html から抽出済み関数定義が消えている
3. ✅ test/helpers/core.js が削除されている
4. ✅ test/helpers/load-calc.js が追加されて全ユニットテストが利用
5. ✅ npm test 155/155 グリーン
6. ✅ snapshot 差分ゼロ（挙動不変）
7. ✅ index.html 約 2,000 行減（実績: Y 行減）
8. ✅ コミット履歴が 9 コミット前後
9. ✅ summary.md に各 Step 記録

### Phase 4 への橋渡し
- 領域別に分離された calc/ ファイルは、Important 43 件の修正時に触る範囲が局所化される
- Phase 1 スナップショット（25 件）は引き続き安全網として機能
- 例: 02-I01（インフレ統一）→ calc/income-expense.js + calc/life-events.js
- 例: 03-I05-I10（教育費）→ calc/life-events.js
- DOM 依存の Important（例: 04-I02 年金繰下げ）は Phase 3.5（B スコープ）で抽出してから修正
```

- [ ] **Step 8: 最終コミット**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add test/helpers/test-helpers.js test/golden-master.test.js test/regression.test.js docs/phase3-extraction/summary.md && git commit -m "refactor(phase3): delete helpers/core.js and finalize Phase 3 with summary"
```

- [ ] **Step 9: Phase 3 全体のコミット履歴確認**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git log --oneline c85e055..HEAD
```

Phase 3 実装計画コミット（`cb9c95a` 等）以降のすべてのコミットを表示。約 18-20 コミット（Task 1 setup + Tasks 2-9 各 2 コミット + Task 10 最終）が確認できれば完了。

---

## 完了条件のまとめ

- [ ] Task 1〜10 のすべてが完了
- [ ] `calc/` に 8 ファイル存在
- [ ] `test/helpers/load-calc.js` と `test/helpers/test-helpers.js` が存在
- [ ] `test/helpers/core.js` が削除されている
- [ ] `grep "helpers/core"` で 0 マッチ
- [ ] `npm test` で 155/155 グリーン
- [ ] `test/__snapshots__/scenario-snapshot.test.js.snap` の差分ゼロ（`git diff c85e055..HEAD -- test/__snapshots__/` で確認）
- [ ] `docs/phase3-extraction/summary.md` の全 Step セクションが埋まっている
- [ ] index.html が約 2,000 行減少している

## Phase 4 以降への橋渡し

Phase 3 完了後、計算ロジックが領域別モジュールに分離される。Phase 4（Important 43 件修正）では：

- **02-I01 / 02-I02（インフレ変数二重管理）** → `calc/income-expense.js` + `calc/life-events.js` を修正
- **03-I05-I10（教育費キャリブレーション）** → `calc/life-events.js` を修正
- **04-I02（年金繰下げ未反映）** → DOM 依存関数。Phase 3.5（B スコープ）で `calc/pension.js` を抽出してから修正
- **05-I01-I06（住宅ローン Important）** → `calc/mortgage.js` を修正
- **07-I01-I04（二プール Important）** → `calc/integrated.js` + `calc/asset-growth.js` を修正
- **08-I01-I05（退職シミュ Important）** → `calc/retirement.js` を修正

Phase 1 スナップショット（25 件）は Phase 4 の修正でも安全網として機能。
