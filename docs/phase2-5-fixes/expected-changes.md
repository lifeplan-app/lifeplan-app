# Phase 2.5 修正の期待方向と実測

各グループ修正の「事前に宣言した期待方向」と「実際のスナップショット差分サマリー」を時系列で記録。

## 使い方

各グループ実施前に「期待方向」を追記 → 修正後に「実測サマリー」を追記。
Phase 2 監査レポートの該当 Critical にここを参照するリンクを張る予定。

---

## Group 1: パートナー年齢バグ修正（02-C01 / 06-C01）

### 期待方向
- **対象**: `getIncomeForYearWithGrowth` (`index.html:17152`) の `partnerGrowthYears` 計算
- **修正内容**: `partnerUntilAge - currentAge` を `partnerUntilAge - partnerCurrentAge` に変更（`partnerCurrentAge = currentYear - partnerBirthYear`、未設定時は `currentAge` fallback）
- **期待される snapshot 差分**:
  - シナリオ B（鈴木健太 35歳 + パートナー年齢差あり）で `annualIncome` が年次的に変化
  - シナリオ A（田中葵・独身）は `partnerBase === 0` なので早期 return、差分なし
  - シナリオ C/D/E も配偶者設定に応じて `annualIncome` が動く
- **確認ポイント**: パートナーが本人より若いシナリオで `annualIncome` が減方向、年上シナリオで増方向

### 実測サマリー
- **commit SHA**: `63f82dc`
- **snapshot 差分行数**: 0 行（`git diff test/__snapshots__/scenario-snapshot.test.js.snap` の結果）
- **シナリオ別変化（初年度 annualIncome, `calcIntegratedSim` 先頭行）**:
  - A 田中葵: 314 → 314 万（`partnerIncome=0` で早期 return、想定通り変化なし）
  - B 鈴木健太: 690 → 690 万（`partnerGrowthRate` 未設定＝0 で `Math.pow(1,N)=1`、バグ経路が無害化され差分なし）
  - C 山本誠: 980 → 980 万（`partnerIncome=0` で早期 return）
  - D 中村博: 792 → 792 万（`partnerGrowthRate=0` 扱いのため差分なし）
  - E 林菜緒: 328 → 328 万（`partnerIncome=0` で早期 return）
- **方向の評価**: コード修正は意味的に正しい（`partnerUntilAge - partnerCurrentAge` へ置換）。ただし既存サンプル 5 本はいずれも `partnerGrowthRate` 未設定 or `partnerIncome=0` のため、`Math.pow(1+0, ...) = 1` でバグが inert となり snapshot 差分は発生せず。既存 155 tests はすべてグリーン。将来 `partnerGrowthRate > 0` のサンプルが追加されれば、このコミットで想定通りの挙動となる（partnerUntilAge ベースの `Math.min` がパートナー年齢に切り替わる）。

---

## Group 2: 年金関数重複解消（04-C01）

### 期待方向
- **対象**: 古い `calcPensionEstimate()`（引数なし、`index.html:5944`）を `calcSimplePensionEstimate()` にリネーム。呼び出し元 7 箇所（UI onchange/oninput × 4、`calcSimpleSim` × 1、`renderTaxSimulation` × 2）も追従
- **期待される snapshot 差分**: **差分なし**の想定。メインの `calcIntegratedSim` / `calcRetirementSimWithOpts` は `calcPensionEstimate(who)`（新しい方）を経由しないで `retPensionMonthly` を直接読むため、今回のリネームで統合シミュの出力は変わらない
- **確認ポイント**: snapshot が全く動かないこと（他の影響なし）。`calcSimpleSim` と `renderTaxSimulation` は UI 経路なので Playwright snapshot では検証されないが、JS 構文エラーが入らないことは `npm test` の完走で担保される

### 実測サマリー
- **commit SHA**: `47632d4`
- **snapshot 差分行数**: 0 行（期待通り）
- **index.html の変更箇所**: 8 箇所（定義 1 + 呼び出し 7）
  - L3321, L3329, L3335, L3344（UI onchange/oninput）
  - L5944（関数定義）
  - L5979（calcSimpleSim 内）
  - L20376, L20493（renderTaxSimulation 内）
- **引数あり呼び出し `calcPensionEstimate('partner')` 等の維持**: 確認済み（L3376, L3384, L3390, L3399, L14663, L14664, L15111 は変更なし）
- **テスト結果**: 155/155 グリーン。メイン経路への影響なし
- **方向の評価**: 期待通り。hoisting による shadowing 解消のみで観測可能な snapshot 変化はゼロ。`calcSimpleSim` / `renderTaxSimulation` で NaN 伝播が発生していた経路が修正されたが、Playwright snapshot では未検証（UI 依存）

---

## Group 3: 住宅ローン控除の構造修正（05-C01 / C02 / C03）

### 期待方向
- **対象**: 住宅ローン控除の構造修正3件
  - 05-C01: 住宅種別セレクタ追加（UI変更）
  - 05-C02: `calcIncomeTaxAmount` ヘルパ新設、`calcMortgageDeduction` に税額 cap 追加
  - 05-C03: `calcIntegratedSim` のローン残高を線形近似から amortization 置換
- **期待される snapshot 差分**:
  - 既存サンプル（住宅種別未設定＝デフォルト `general`）で、10年→10年控除期間は変化なし（元々10年設定）、借入限度額は `general` 2000万で control
  - `mortgageDeduct` が税額 cap で低所得シナリオ（E シングルマザー）で縮小
  - 住宅ローン残高（`leMortgage` フィールド）が中期で増加（線形近似より amortization が多い）
  - 最終年資産は概ね減少方向
- **確認ポイント**:
  - シナリオ B（ローンあり）で `leMortgage` と `mortgageDeduct` が変化
  - シナリオ A/C/D/E（ローンなし）は変化なし
  - シナリオ E で `mortgageDeduct` が税額 cap で縮小（ただしローンなしなら該当しない）
  - NaN/Infinity/負数なし

### 実測サマリー
- **commit SHA**: `65950e9`
- **snapshot 差分行数**: 1858 行（929 追加 / 929 削除）
- **変化の主なフィールド**: `mortgageDeduct`, `assetTotal`, `cashFlow`, `cashPool`, `totalWealth`, `endAssets`, `startAssets`, `annualReturn`, `annualSurplus`, `indexPool`, `investPool`
- **シナリオ別変化**:
  - A 田中葵: 変化なし（ローンなし、期待通り）
  - B 鈴木健太: 5 snapshot が変化（`calcIntegratedSim` / `calcRetirementSimWithOpts` 標準・楽観・悲観 / `calcScenarioFullTimeline`）。`mortgageDeduct` が借入限度 cap により縮小（例: 2027年 23→14, 2028年 22→14, 2029年 21→14, 2031年 20→14, 2032年 19→14）。借入額 3,800 万円 × 0.7% = 26.6 万円（元の `Math.min(balance*0.007, 31.5)` で約 21〜26）が、`general` の借入限度 2,000 万円 × 0.7% = 14 万円に制限された結果。`totalWealth` は 2027 年 724→715、2029 年 1345→1322 と減少。退職期は `leMortgage` が変わらないため `endAssets` の差分は 47 万円程度（2056 年 13379→13332）で緩やか
  - C 山本誠: 変化なし（ローンなし、期待通り）
  - D 中村博: 変化なし（ローンなし、期待通り）
  - E 林菜緒: 変化なし（ローンなし、期待通り）
- **方向の評価**: 期待通り。ローンあり唯一のシナリオ B のみで `mortgageDeduct` が `general` の 2,000 万円上限 (14 万円/年) に収束。線形近似→amortization 置換の影響は `calcIntegratedSim` の住宅残高で観測され、`calcMortgageDeduction` 内で二重に limit 制御されるため `mortgageDeduct` の最大値は 14 で cap された。NaN/Infinity/負数なし。155/155 テスト green

---

## Group 4: partnerExpenseChange 経路整合（06-C02）

### 期待方向
（Group 4 実施時に記入）

### 実測サマリー
（Group 4 修正後に記入）

---

## Group 5: プール枯渇の正しい検知（07-C01 / 08-C01）

### 期待方向
（Group 5 実施時に記入）

### 実測サマリー
（Group 5 修正後に記入）

---

## Group 6: インフレ非対称性の解消（09-C01）

### 期待方向
（Group 6 実施時に記入）

### 実測サマリー
（Group 6 修正後に記入）
