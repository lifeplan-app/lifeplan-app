# Phase 3｜計算ロジック分離 設計書

- **作成日**: 2026-04-24
- **対象アプリ**: ライフプランアプリ（`index.html`）
- **位置付け**: 計算ロジック検証プランの **Phase 3**（計算ロジックの `index.html` からの分離）
- **前提フェーズ**:
  - Phase 1 スナップショットテスト完了（`1f83582`）
  - Phase 2 計算監査完了（`0d16b30`）
  - Phase 2.5 Critical 10 件修正完了（`9ac846f`）
- **後続フェーズ候補**:
  - Phase 3.5: B スコープ追加抽出（年金・税・相続等）
  - Phase 4: Important 43 件の修正
  - Phase 5: UI / 描画関数の抽出（C スコープ）

---

## 1. 背景と目的

### 1.1 現状の構造的問題

- `index.html` は約 23,489 行（Phase 2.5 完了時点）の単一ファイル。
- 計算ロジック（約 20 関数）と UI ロジック（約 380 関数）が混在。
- テストは **実質的に 2 系統**:
  - Vitest ユニットテスト 128 件：`test/helpers/core.js`（手動コピー版）を検証
  - Phase 1 スナップショット 25 件：Playwright で本物の `index.html` を検証
- `helpers/core.js` は本体から**手でコピーされた複製**であり、変更漏れで挙動が乖離するドリフトリスクが残存。

### 1.2 Phase 3 の目的

**`helpers/core.js` の手動コピー問題を根本解決**し、`index.html` の計算ロジックを別ファイルに分離して保守性を上げる。

具体的には：

1. 計算系の純粋関数（約 20）を `calc/` ディレクトリ下の 8 ファイルに抽出
2. `index.html` は `<script src>` で読み込むのみの形に変更
3. Vitest ユニットテストは `test/helpers/load-calc.js`（sandbox ローダー）経由で抽出後のファイルを直接参照
4. `test/helpers/core.js` を最終的に削除
5. **挙動は一切変えない**（Phase 1 スナップショット差分ゼロが成功基準）

### 1.3 非目的（意識的に除外）

- UI 関数・DOM 描画関数の分離（Phase 5 候補）
- 税計算・相続・贈与・賃貸比較等の分離（Phase 3.5 候補）
- 計算ロジックの内容変更（Phase 4 で Important 修正時）
- ES モジュール化（`<script type="module">`）・ビルドシステム導入・TypeScript 化

---

## 2. スコープ（A: ミニマム）

### 2.1 抽出対象の約 20 関数

| カテゴリ | 関数・定数 |
|---|---|
| 年齢補助（utils） | `calcAge`, `calcAgeAtYear`, `calcPartnerAgeAtYear`, `ageToYear` |
| 資産成長（asset-growth） | `ASSET_TYPES`, `TAX_TYPE_DEFAULT`, `TAX_RATE`, `effectiveReturn`, `calcAssetGrowth`, `calcAllAssetGrowth`, `projectEmergencyBalance` |
| 収入・支出（income-expense） | `getIncomeForYear`, `getIncomeForYearWithGrowth`, `getExpenseForYear`, `getRecurringExpenseForYear`, `getOneTimeForYear` |
| ライフイベント（life-events） | `calcLECostByYear`, `calcLeaveReduction`, `EDU_COST`, `PHASE_AGES` |
| 住宅ローン（mortgage） | `calcMonthlyPayment`, `calcMortgageSchedule`, `calcMortgage`, `calcMortgageDeduction`, `calcIncomeTaxAmount` |
| リタイア（retirement） | `calcRetirementSim`, `calcRetirementSimWithOpts`, `getRetirementParams` |
| シナリオ（scenarios） | `calcScenarioSim`, `calcScenarioFullTimeline`, `getAdaptiveScenarios`, `getScenarioBase` |
| 統合（integrated） | `calcIntegratedSim` |

### 2.2 対象外（Phase 3 ではそのまま index.html に残す）

- UI 関数（`render*`, `update*`, `save*`, `load*`, `switch*` など）
- DOM 依存関数（`calcPensionEstimate`, `calcSimplePensionEstimate` 等）
- その他計算関数（`calcTakeHome`, `calcInhTax*`, `calcGift*`, `calcInsuranceNeeds`, `calcRentResult` 等）

---

## 3. アーキテクチャ

### 3.1 全体構成

```
【Before】
index.html (23,489 行・全ロジック内包)
  └── <script> 内に計算関数 約400個

test/helpers/core.js (352 行・手動コピー) ← 問題の本丸
  └── calcAssetGrowth 等の複製

【After】
index.html (約 21,500 行・UI中心)
  └── <script src="calc/utils.js"></script>
      <script src="calc/asset-growth.js"></script>
      ... 8 本 ...
      <script src="calc/integrated.js"></script>
      <script> UI / イベント / 描画 </script>

calc/
  ├── utils.js
  ├── asset-growth.js
  ├── income-expense.js
  ├── life-events.js
  ├── mortgage.js
  ├── retirement.js
  ├── scenarios.js
  └── integrated.js

test/helpers/load-calc.js (新規・sandbox ローダー)
test/helpers/core.js (削除)
```

### 3.2 実行方式

- **`<script src>` 方式**（ES module ではない）
- calc/*.js の関数は **グローバル（window.\*）に登録**（現状と同じ挙動）
- ビルドなし・Cloudflare Pages / Netlify の静的配信で動作
- Playwright テストも `file://` で動く（現状と同じ）

### 3.3 Node テスト側

`test/helpers/load-calc.js` が `vm.runInContext` で calc/*.js を sandbox にロードする：

```javascript
// test/helpers/load-calc.js
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CALC_DIR = resolve(__dirname, '..', '..', 'calc');

const sandbox = {
  console,
  Math, Number, Object, Array, Set, Map, JSON, Date, Error,
  parseFloat, parseInt, isFinite, isNaN, NaN,
  window: {},
};
vm.createContext(sandbox);

export function loadCalc(filename) {
  const src = readFileSync(resolve(CALC_DIR, filename), 'utf8');
  vm.runInContext(src, sandbox);
}

export function getSandbox() {
  return sandbox;
}

export function loadCalcBundle(filenames) {
  for (const f of filenames) loadCalc(f);
  return sandbox;
}
```

テスト側の使用例：

```javascript
import { describe, it, expect, beforeAll } from 'vitest';
import { loadCalc, getSandbox } from './helpers/load-calc.js';

let sb;
beforeAll(() => {
  loadCalc('utils.js');
  loadCalc('asset-growth.js');
  sb = getSandbox();
});

it('calcAssetGrowth', () => {
  const result = sb.calcAssetGrowth(asset, 10);
  expect(result.values[10]).toBeCloseTo(...);
});
```

---

## 4. ファイル構成

### 4.1 新規作成

| パス | 想定行数 | 役割 |
|------|---------|------|
| `calc/utils.js` | ~100 | 年齢補助（依存なし・土台） |
| `calc/asset-growth.js` | ~350 | 資産成長・税率（utils 依存） |
| `calc/income-expense.js` | ~150 | 収入・支出の年次計算（utils 依存） |
| `calc/life-events.js` | ~200 | ライフイベント費用（utils 依存） |
| `calc/mortgage.js` | ~180 | 住宅ローン・控除（utils 依存） |
| `calc/retirement.js` | ~500 | 退職シミュ・4 プール（utils, mortgage, income-expense 依存） |
| `calc/scenarios.js` | ~150 | シナリオ比較（retirement 依存） |
| `calc/integrated.js` | ~300 | 統合シミュ（ほぼ全部に依存） |
| `test/helpers/load-calc.js` | ~40 | Node sandbox ローダー |
| `docs/phase3-extraction/summary.md` | ~50 | 各 Step の抽出記録 |

### 4.2 変更

| パス | 変更内容 |
|------|----------|
| `index.html` | 抽出済み関数を削除、`<script src>` タグ追加。行数約 2,000 行減 |
| `test/calc-asset-growth.test.js` | `import from 'helpers/core.js'` を `loadCalc` 経由に変更 |
| `test/calc-all-asset-growth.test.js` | 同上 |
| `test/golden-master.test.js` | 同上 |
| `test/regression.test.js` | 同上 |
| `test/property-based.test.js` | 同上 |

### 4.3 削除

| パス | 削除理由 |
|------|---------|
| `test/helpers/core.js` | Phase 3 最終 Step で削除。calc/*.js で置換される |

### 4.4 変更しない

- `test/scenario-snapshot.test.js`（Phase 1 安全網・Playwright 経由で本物の index.html を実行するため関数の位置が変わっても影響なし）
- `test/helpers/playwright-runner.js`
- `test/helpers/playwright-runner.smoke.test.js`
- `test/__snapshots__/scenario-snapshot.test.js.snap`（**変化ゼロが成功基準**）
- `package.json` / `vitest.config.js`

---

## 5. 段階的移行の手順

各 Step で共通ワークフロー：

```
1. 該当領域の関数を index.html から「移動」（切り取り）して calc/<name>.js 新規作成
2. index.html の <script> タグに <script src="calc/<name>.js"></script> を追加
3. npm test 実行 → スナップショット 25 件グリーン維持、ユニット 128 件グリーン維持（helpers/core.js はまだ残存）
4. 該当領域に関する既存ユニットテストの import を loadCalc 経由に切替
5. helpers/core.js から該当部分を削除
6. npm test で 155/155 グリーン確認
7. コミット
```

### 5.1 Step 別の内容

| Step | ファイル | 依存先 | 主要関数 |
|------|---------|-------|---------|
| Step 1 | `calc/utils.js` | なし | `calcAge`, `calcAgeAtYear`, `calcPartnerAgeAtYear`, `ageToYear` |
| Step 2 | `calc/asset-growth.js` | utils | `ASSET_TYPES`, `TAX_*`, `effectiveReturn`, `calcAssetGrowth`, `calcAllAssetGrowth`, `projectEmergencyBalance` |
| Step 3 | `calc/income-expense.js` | utils | `getIncomeForYear`, `getIncomeForYearWithGrowth`, `getExpenseForYear`, `getRecurringExpenseForYear`, `getOneTimeForYear` |
| Step 4 | `calc/life-events.js` | utils | `calcLECostByYear`, `calcLeaveReduction`, `EDU_COST`, `PHASE_AGES` |
| Step 5 | `calc/mortgage.js` | utils | `calcMonthlyPayment`, `calcMortgageSchedule`, `calcMortgage`, `calcMortgageDeduction`, `calcIncomeTaxAmount` |
| Step 6 | `calc/retirement.js` | utils, mortgage, income-expense | `calcRetirementSim`, `calcRetirementSimWithOpts`, `getRetirementParams` |
| Step 7 | `calc/scenarios.js` | retirement | `calcScenarioSim`, `calcScenarioFullTimeline`, `getAdaptiveScenarios`, `getScenarioBase` |
| Step 8 | `calc/integrated.js` | ほぼ全部 | `calcIntegratedSim` |
| Step 9 | （`helpers/core.js` 削除 + `summary.md` 記載） | — | — |

### 5.2 Step 2 の重点

`helpers/core.js` にも `calcAssetGrowth` 等の複製があり、ユニットテスト 5 ファイルがここを参照している。Step 2 完了時点で：

- `test/calc-asset-growth.test.js` / `test/calc-all-asset-growth.test.js` / `test/golden-master.test.js` / `test/regression.test.js` / `test/property-based.test.js` の import を `loadCalc` に切替
- `helpers/core.js` の該当関数（`ASSET_TYPES`, `TAX_*`, `effectiveReturn`, `calcAssetGrowth`, `calcAllAssetGrowth`, `projectEmergencyBalance`, `calcAgeAtYear` 等）を削除

### 5.3 Step 9（最終）

- `test/helpers/core.js` を `git rm`
- `test/helpers/load-calc.js` は残る
- `docs/phase3-extraction/summary.md` に各 Step の抽出関数と行数変化を記録

---

## 6. 成功基準

1. **`calc/` に 8 ファイル作成済み**
2. **`index.html` から抽出済み関数の定義が消えている**（grep で確認）
3. **`test/helpers/core.js` が削除されている**
4. **`test/helpers/load-calc.js` が追加され、全ユニットテストが利用**
5. **`npm test` で 155/155 グリーン**
6. **Phase 1 スナップショット（25 件）が Phase 2.5 完了時点と完全一致**（`test/__snapshots__/` に差分ゼロ）
7. **index.html の行数が約 2,000 行減少**（23,489 → 約 21,500）
8. **コミット履歴が 9 コミット前後**（Step 1〜8 + helpers/core.js 最終削除）
9. **`docs/phase3-extraction/summary.md`** に各 Step の記録

---

## 7. 既知のリスクと対処

| # | リスク | 対処 |
|---|--------|------|
| 1 | `<script src>` のキャッシュで古いバージョンが残る | Playwright テストは毎回新しいページロードなので問題なし。実ブラウザは Phase 3 のスコープ外 |
| 2 | 関数間の隠れた依存を移動漏れで壊す | **スナップショットが即座に検知**。各 Step で `npm test` 必須 |
| 3 | 変数スコープの違い（同一 `<script>` 内 closure → 別ファイル global） | `let`/`const` で宣言された定数は global 昇格しない。抽出時に `window.FOO = ...` への代入に変えるか、計算で参照されるかを事前 grep で確認 |
| 4 | `state` グローバル変数への依存 | `state` は index.html 側に残り、calc 側は参照のみ。ブラウザは同じ global スコープ共有で問題なし。Node テストは `sandbox.state = {...}` で事前注入 |
| 5 | `vm.runInContext` の sandbox が複数ロードで状態持ちすぎる | `beforeAll` で `loadCalc` を呼ぶ前に sandbox のリセットが必要な場合は `load-calc.js` に `resetSandbox()` を追加可能（現時点では不要と判断） |
| 6 | Step 6（retirement ~500 行）の巨大さ | 事前 Read で関数境界を決めてから進める。問題なら Step 6a / 6b に分割 |
| 7 | `helpers/core.js` への他テストの参照が残る | Step 9 前に `grep "helpers/core"` で残存参照確認 |
| 8 | `calc/*.js` 内で `state`・`opts` 等の引数・グローバル名前衝突 | 抽出関数は元の引数名をそのまま維持。引数名変更は Phase 3 スコープ外 |
| 9 | `index.html` の `<script>` タグ挿入位置が他コードと干渉 | L5341 の既存 `<script>` 直前に挿入。実装時に該当行を Read で確認 |

---

## 8. スコープ外（Phase 3 でやらないこと）

- UI 関数・イベントハンドラ・DOM 描画関数の抽出
- 税計算・相続・贈与・賃貸比較等の抽出
- **計算ロジックの内容変更**（スナップショット差分ゼロが成功基準）
- ビルドシステム導入・ES モジュール化・TypeScript 化
- `<script>` タグの順序以外での依存管理（動的 import 等）
- `state` グローバル変数の廃止・関数型リファクタリング

---

## 9. Phase 4 以降への橋渡し

Phase 3 完了後の状態は Phase 4（Important 修正）の安全な出発点となる：

- 計算ロジックが領域別に分離されているため、Important 修正時に触るファイルが局所的
- 例：02-I01（インフレ統一）→ `calc/income-expense.js` と `calc/life-events.js`
- 例：04-I02（年金繰下げ）→ DOM 依存のため Phase 3 スコープ外だが、Phase 3.5 で切り出し後に修正
- Phase 1 スナップショットが引き続きリファクタ・修正の安全網として機能

---

## 10. 実装順序（writing-plans スキルで詳細化）

writing-plans 側で以下を個別タスクに分解：

```
Task 1: calc/ ディレクトリ作成 + test/helpers/load-calc.js 実装
Task 2: Step 1 utils.js 抽出
Task 3: Step 2 asset-growth.js 抽出 + helpers/core.js 削除（該当部分）+ ユニットテスト切替
Task 4: Step 3 income-expense.js 抽出
Task 5: Step 4 life-events.js 抽出
Task 6: Step 5 mortgage.js 抽出
Task 7: Step 6 retirement.js 抽出
Task 8: Step 7 scenarios.js 抽出
Task 9: Step 8 integrated.js 抽出
Task 10: Step 9 helpers/core.js 削除 + summary.md 記載
```
