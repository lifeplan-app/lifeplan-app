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
- **commit SHA**: （Step 12 で追記）

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
