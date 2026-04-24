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
（Group 2 実施時に記入）

### 実測サマリー
（Group 2 修正後に記入）

---

## Group 3: 住宅ローン控除の構造修正（05-C01 / C02 / C03）

### 期待方向
（Group 3 実施時に記入）

### 実測サマリー
（Group 3 修正後に記入）

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
