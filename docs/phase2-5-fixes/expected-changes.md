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
- **対象**: `calcIntegratedSim`（L14225-14340）と `calcMonteCarlo`（L18580-18646）に `partnerExpenseChange` の反映を追加
- **参照実装**: `calcRetirementSimWithOpts:17604-17605` と `calcMultiScenario:18400`
- **期待される snapshot 差分**: 
  - パートナー退職（`partnerTargetAge` 到達）後の年度で `annualExpense` が `partnerExpenseChange * 12` 分だけ変化
  - 該当シナリオ: サンプル JSON に `retirement.partnerExpenseChange` が設定されていれば変化。ゼロ設定なら差分ゼロ
- **確認ポイント**: サンプルシナリオの `retirement.partnerExpenseChange` 設定を事前確認。未設定なら snapshot 差分なしが期待

### 実測サマリー
- **commit SHA**: `932a8a4`
- **サンプルシナリオの `partnerExpenseChange` 設定数**: 0 件（`grep -l partnerExpenseChange sample_data/*.json` が空）
- **snapshot 差分行数**: 0 行（`git diff test/__snapshots__/scenario-snapshot.test.js.snap` は空）
- **index.html の変更箇所**: 2 箇所
  - `calcIntegratedSim`（L14270 付近）: ループ外で `_pRetireYearIS` / `_pExpChangeMonthlyIS` を算出、ループ内で `annualExpense` に `partnerExpenseChange * 12` を加算
  - `calcMonteCarlo`（L18684 付近）: 既存の `_partnerRetireYear` を再利用し、`totalExpense` に `partnerExpenseChange * 12` を加算
- **テスト結果**: 155/155 グリーン
- **方向の評価**: 期待通り。既存 5 サンプルいずれも `retirement.partnerExpenseChange` 未設定のため snapshot 差分はゼロ。経路間整合性（`calcRetirementSimWithOpts` と `calcMultiScenario` に存在し、`calcIntegratedSim` / `calcMonteCarlo` に欠落していた）が解消された。将来 `partnerExpenseChange != 0` のサンプルが追加されれば `calcIntegratedSim` の `annualExpense` が `partnerTargetAge` 年齢到達以降で変化する

---

## Group 5: プール枯渇の正しい検知（07-C01 / 08-C01）

### 期待方向
- **対象**:
  - 07-C01: `calcIntegratedSim` の二プール枯渇検知強化（投資プール枯渇後の複利成長と清算を停止）
  - 08-C01: `calcRetirementSimWithOpts` の 4 プール `depleted` 判定拡張
- **期待される snapshot 差分**:
  - FIRE シナリオ（C 山本誠）の出口戦略で、投資プール枯渇年以降の `totalWealth` が「架空プラス」→ 現実に即したマイナス/ゼロ方向
  - `depleted: true` が早い年で立つ
  - 他シナリオ（A/B/D/E）は枯渇しない限り影響なし
- **確認ポイント**: snapshot に `depleted: true` 年が新たに出現するか。C シナリオの退職期の最終年資産が減少方向

### 実測サマリー
- **commit SHA**: `edba0a0`
- **snapshot 差分行数**: 2306 行（1153 追加 / 1153 削除）
- **index.html の変更箇所**: 2 箇所
  - `calcIntegratedSim`（L14321 付近）: `investPoolHealthy = _investDeficit < investAssetBase` を追加、複利成長と清算を `investPoolHealthy` でガード
  - `calcRetirementSimWithOpts`（L17825 付近）: `criticalPoolDepleted` 判定を新設、`depleted` 判定に追加
- **シナリオ別変化**:
  - A 田中葵: 変化なし（投資プール枯渇なし、期待通り）
  - B 鈴木健太: 変化なし（投資プール枯渇なし、期待通り）
  - C 山本誠: 変化なし（FIRE シナリオだが、既存 snapshot では `_investDeficit >= investAssetBase` に至る年がなく、08-C01 の `criticalPoolDepleted` にも該当しなかった）
  - D 中村博: 変化なし（期待通り）
  - E 林菜緒: 5 snapshot すべてが変化（`calcIntegratedSim` / `calcRetirementSimWithOpts` 標準・楽観・悲観 / `calcScenarioFullTimeline`）。シングルマザー低収入シナリオで投資プールが早期に枯渇しており、07-C01 の幻影機会損失複利成長が停止。結果:
    - 枯渇中年度の `cashFlow` がマイナスのまま残り（例: 2029 年 -218 → -333）、`liquidation` が 0 に
    - 投資プール枯渇中は _investDeficit が複利で増えないため、積立による回復で investPool が正しく復活（2041 年以降 `investPool: 0 → 32, 66, 101, 138...`）
    - 退職期では `startAssets` / `endAssets` が増加方向（2056 年 2078 → 2480、2091 年 2284 → 2999）。これは現役時代の幻影機会損失複利の停止により投資プールが実態に即して積み上がった結果
- **08-C01 の depleted 検知**: どのシナリオでも新たな `depleted: true` は出現せず。既存の `endAssets <= 0` / `isFundingShortfall` 判定が先行して発火するケースのみで、`criticalPoolDepleted` が補完的に発火するケースは 5 サンプルには含まれていない
- **テスト結果**: 155/155 グリーン
- **方向の評価**: 07-C01 は期待通り観測された。特に E シナリオで「投資プール枯渇後も機会損失複利で架空マイナス化が続き、積立を打ち消してしまう」バグが解消された。退職期の資産が上方修正されたのは、現役時代の幻影損失の停止による意味のある影響。08-C01 の `criticalPoolDepleted` は既存サンプルでは発火しなかったが、将来より過酷なシナリオ（C の極端な FIRE 失敗パターン等）が追加された際の安全網として機能する

---

## Group 6: インフレ非対称性の解消（09-C01）

### 期待方向
- **対象**: `calcIntegratedSim` の現役期 `annualExpense` と `leCost` にインフレ係数を適用
- **修正方針**: `infFactor = Math.pow(1 + inflationRate/100, yr - currentYear)` を `getExpenseForYear` と `calcLECostByYear` の戻り値（契約額固定項目を除く）に掛ける
- **期待される snapshot 差分**:
  - 全シナリオで現役期 `annualExpense` が年々増加
  - 5 年目で `1.02^5 ≈ 1.104` 倍、20 年目で `1.486` 倍、40 年目で `2.208` 倍
  - 教育費・介護費が大学入学年・介護開始年に従来より大きく計上
  - 最終年の資産残高は多くのシナリオで減少方向（インフレ過小評価が是正されるため）
- **確認ポイント**:
  - シナリオ A 5 年目 `annualExpense` が `1.02^5 ≈ 1.104` 倍になっているか手計算で検算
  - `leMortgage`（ローン返済分）はインフレ適用されず名目固定
  - NaN/Infinity/負数なし

### 実測サマリー
- **commit SHA**: `c39d54b`
- **snapshot 差分行数**: 12,386 行（6,193 追加 / 6,193 削除）※ Phase 2.5 最大規模
- **index.html の変更箇所**: 1 箇所（`calcIntegratedSim` のループ先頭）
  - `_infRateIS = state.finance.inflationRate / 100` をループ外で算出
  - `_infFactorIS = Math.pow(1 + _infRateIS, y)` をループ内で算出
  - `leCostRaw` に改名し、`leCost = { childcare*inf, education*inf, mortgage, care*inf, scholarship }` として再構築
  - `annualExpense = getExpenseForYear(yr) * _infFactorIS` で置換
- **シナリオ A 5 年目 annualExpense の手計算検算**:
  - 元値: 192（固定）
  - 新値: 212
  - 比率: 212 / 192 = 1.1042
  - 理論値: 1.02^5 = 1.1041
  - **誤差 0.0001 で完全一致。修正は正しい**
  - さらに y=1〜4 も `192 * 1.02^y` に一致（196 / 200 / 204 / 208）
- **シナリオ別の最終資産変化方向（最終年 endAssets, calcRetirementSimWithOpts 標準）**:
  - A 田中葵 2090: 20,809 → 19,755 万（-1,054 万、-5.1%）※年金期間が長いため緩やか
  - B 鈴木健太: `calcIntegratedSim` 20年目以降で `totalWealth` が 約25%減（例 2038 年 1187 → 867）
  - C 山本誠: `calcScenarioFullTimeline` 終盤が大きく下方修正（FIRE シナリオで現役期支出が主要因）
  - D 中村博 55歳: 現役期短いがインフレ係数が大きく、終盤資産は大幅減
  - E 林菜緒 2091: 2,999 → **-259 万（赤字転落）**／2092: 3,060 → **-264 万**。シングルマザー低収入シナリオで、従来はインフレ無視により架空黒字化していたのが実態に即した「老後資金不足」として可視化された
- **テスト結果**: 155/155 グリーン
- **方向の評価**: 期待通り、これまで「1.5〜2 倍過大」とされた最終資産が下方修正された。特に E シナリオで現役時代のインフレ進行が退職期の貯蓄不足を招き、`endAssets` が負値に転落。これは本来のリスクシグナルであり、修正前は見落とされていた深刻な問題。契約額固定の `mortgage` と `scholarship` はインフレ対象外で、`leMortgage` 値はシナリオ B で従来通り（住宅ローン amortization の結果のみ変化）。NaN/Infinity/負数なし（負の `endAssets` はロジック上の意味ある値）
