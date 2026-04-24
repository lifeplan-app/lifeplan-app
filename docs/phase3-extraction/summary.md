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

- **抽出関数**: `calcAge`, `calcAgeAtYear`, `calcPartnerAgeAtYear`, `ageToYear`
- **calc/utils.js 行数**: 41 行
- **index.html 削減行数**: 33 行（23,489 → 23,456）
- **テスト結果**: 155/155 グリーン、snapshot 差分 0 行
- **commit SHA**: `a66a9a6`

## Step 2: calc/asset-growth.js（資産成長・税率）

- **抽出関数・定数**: `ASSET_TYPES`, `TAX_TYPE_DEFAULT`, `TAX_RATE`, `effectiveReturn`, `calcAssetGrowth`, `calcAllAssetGrowth`
- **calc/asset-growth.js 行数**: 363 行
- **index.html 削減行数**: 346 行（23,456 → 23,110）
- **helpers/core.js 削減行数**: 305 行（352 → 47。残存: `projectEmergencyBalance`, `calcEndYearFromAge`, `calcEndAgeFromYear`）
- **切替したテストファイル**: 5（calc-asset-growth, calc-all-asset-growth, golden-master, regression, property-based）
- **補足**: `vm.runInContext` では `const` がサンドボックスに露出しないため、`ASSET_TYPES` / `TAX_TYPE_DEFAULT` / `TAX_RATE` は `var` で宣言。`calcAllAssetGrowth` は `state.finance?.simYears` を参照するため、`test/helpers/load-calc.js` のサンドボックスに `state = { profile: {}, finance: {} }` を追加。
- **テスト結果**: 155/155 グリーン、snapshot 差分 0 行
- **commit SHA**: `00c5837`

## Step 3: calc/income-expense.js（年次収入・支出）

- **抽出関数**: `getIncomeForYear`, `getExpenseForYear`, `getRecurringExpenseForYear`, `getOneTimeForYear`, `getIncomeForYearWithGrowth`
- **calc/income-expense.js 行数**: 172 行
- **index.html 削減行数**: 156 行（23,110 → 22,954）
- **テスト結果**: 155/155 グリーン、snapshot 差分 0 行
- **補足**: 5 関数はすべて `function` 宣言で、`vm.runInContext` サンドボックスへ自動露出するため、`var` 化は不要。`getIncomeForYearWithGrowth` は同一ファイル内で `getIncomeForYear` / `ageToYear` / `calcAge` を参照。
- **commit SHA**: `8ed5539`

## Step 4: calc/life-events.js（ライフイベント費用）

- **抽出関数・定数**: `EDU_COST`, `PHASE_AGES`, `calcLECostByYear`（内部ネストの `calcLeaveReduction` 含む）
- **calc/life-events.js 行数**: 152 行
- **index.html 削減行数**: 141 行（22,954 → 22,813）
- **テスト結果**: 155/155 グリーン、snapshot 差分 0 行
- **補足**: `EDU_COST` / `PHASE_AGES` はテストから直接参照されないため `const` のまま据え置き（将来テスト側から `sb.EDU_COST` を参照する必要が生じたら `var` へ変更）。`calcLECostByYear` は `function` 宣言なので sandbox へ自動露出。`calcMortgageSchedule` は次 Step で同 sandbox に抽出予定（現状 index.html 側で定義）。
- **commit SHA**: `076506a`

## Step 5: calc/mortgage.js（住宅ローン）

- **抽出関数**: `calcMonthlyPayment`, `calcMortgageSchedule`, `calcIncomeTaxAmount`, `calcMortgageDeduction`（4 関数）
- **index.html に残置**: `calcMortgage()` — `document.getElementById(...)` で DOM 入力値を読み取り、`el.innerHTML` で結果を描画するため UI 依存。抽出対象外。
- **calc/mortgage.js 行数**: 125 行
- **index.html 削減行数**: 110 行（22,813 → 22,703）
- **テスト結果**: 155/155 グリーン、snapshot 差分 0 行
- **補足**: 4 関数はいずれも `function` 宣言のため `vm.runInContext` sandbox へ自動露出。`calcMortgageSchedule` は同一 sandbox にロードされた `calcMortgage`（index.html 側）ではなく、ブラウザ実行時のみ `calcMortgage` と共存する。Node テストでは `calcMortgage` を呼ばないため影響なし。`calcMortgageDeduction` 内の `getRetirementParams` は Step 6 以降で `calc/retirement.js` に抽出予定だが、現状 sandbox へは index.html 経由で露出している。
- **commit SHA**: `30e0219`

## Step 6: calc/retirement.js（退職シミュ）

- **抽出関数**: `calcRetirementSim`, `getRetirementParams`, `calcRetirementSimWithOpts`（3 関数）
- **calc/retirement.js 行数**: 606 行
- **index.html 削減行数**: 591 行（22,703 → 22,112。`<script src="calc/retirement.js">` 追加で +1 含む）
- **テスト結果**: 155/155 グリーン、snapshot 差分 0 行
- **補足**:
  - Phase 2.5 の Critical fix コメント（`[Phase 2.5 08-C01 fix]`）を忠実に保持。`06-C02` / `07-C01` は該当関数以外（`calcIntegratedSim`）のコメントのため本ファイルには含まれない。
  - `calcRetirementSim()` は `document.getElementById('retHybridSwitchAge')` を 1 箇所で参照する（ハイブリッド切替年齢 UI 入力のフォールバック）。Node sandbox には `document` がないが、snapshot テストは Playwright 経由のブラウザ実行なので問題なし。他テストは `calcRetirementSimWithOpts` のみ使用。
  - `getRetirementParams` は Step 5 で抽出済みの `calcMortgageDeduction` から呼ばれる。同一 sandbox で解決。
  - 3 関数はすべて `function` 宣言なので sandbox へ自動露出。依存: `calcAge`, `ASSET_TYPES`, `calcMortgageSchedule`, `calcMortgageDeduction`, `calcLECostByYear`, `getRecurringExpenseForYear`, `getMedicalAddition`（index.html 残置）, `calcIntegratedSim`（未抽出・Step 8 予定）。
- **commit SHA**: `3845303`

## Step 7: calc/scenarios.js（シナリオ比較）

- **抽出関数**: `getScenarioBase`, `getAdaptiveScenarios`, `calcScenarioSim`, `calcScenarioFullTimeline`（4 関数）
- **calc/scenarios.js 行数**: 143 行
- **index.html 削減行数**: 126 行（22,112 → 21,986。`<script src="calc/scenarios.js">` 追加で +1 含む）
- **テスト結果**: 155/155 グリーン、snapshot 差分 0 行
- **補足**:
  - 4 関数すべて純粋計算（DOM 依存なし）。`function` 宣言のため `vm.runInContext` sandbox へ自動露出。
  - `calcScenarioFullTimeline` は `calcIntegratedSim`（Step 8 で抽出予定）を呼ぶ。ブラウザ実行時は同一グローバルスコープで解決。Node テストでは scenarios 系を直接呼ばないため未解決参照は問題にならない。
  - `calcScenarioSim` は `state.retirement` を一時的に書き換えて `calcRetirementSimWithOpts`（Step 6）を呼び、即座に復元する。副作用は try/finally 相当の復元ロジックで封じ込め。
  - snapshot テスト（Phase 1）の `calcScenarioFullTimeline (getAdaptiveScenarios 各パターン)` 5 件に変化なし。
- **commit SHA**: `12e743f`

## Step 8: calc/integrated.js（統合シミュ）

- **抽出関数**: `calcIntegratedSim`（1 関数、Phase 1 スナップショット 5 件の主要対象）
- **calc/integrated.js 行数**: 153 行
- **index.html 削減行数**: 149 行（21,986 → 21,837。`<script src="calc/integrated.js">` 追加で +1 含む）
- **テスト結果**: 155/155 グリーン、snapshot 差分 0 行（Phase 1 シナリオA〜E 5 件の `calcIntegratedSim` 出力が完全一致）
- **補足**:
  - Phase 2.5 の Critical fix コメントを忠実に保持: `[Phase 2.5 05-C03 fix]`（amortization 事前生成・mortgage balance 取得の 2 箇所）、`[Phase 2.5 06-C02 fix]`（パートナー退職後の月支出変化・事前算出と加算の 2 箇所）、`[Phase 2.5 07-C01 fix]`（投資プール枯渇後の清算停止）、`[Phase 2.5 09-C01 fix]`（現役期インフレ係数の事前算出・ループ内算出・各カテゴリ適用・年間支出適用の 4 箇所）。
  - DOM 依存なし（`document`/`window` 参照ゼロ）。`state`, `calcAllAssetGrowth`, `calcMortgageSchedule`, `calcMortgageDeduction`, `calcLECostByYear`, `getIncomeForYearWithGrowth`, `getExpenseForYear`, `getOneTimeForYear` を sandbox 経由で参照。
  - `function` 宣言のため `vm.runInContext` sandbox へ自動露出。Phase 1 snapshot テスト（Playwright 経由のブラウザ実行）も `<script src="calc/integrated.js">` 追加により解決。
  - `calcScenarioFullTimeline`（Step 7 抽出済）から `calcIntegratedSim` を呼ぶ依存が同一 sandbox で解決されるように。
- **commit SHA**: （本コミットで補完）

## Step 9: helpers/core.js 削除
（Task 10 実施時に記入）

## 完了時点（Phase 3 完了後）
（Task 10 で記入：最終行数・コミット数・全体総括）
