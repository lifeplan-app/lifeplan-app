# Phase 4c 修正の期待方向と実測

Important 8 件を 6 グループに分けて修正した記録。
実施順序: G10-quick → G7 → G9b → G10-refi → G10-housing → G10-scenario
（計算のみ・バグ修正 → UI 拡張へ段階的に進行）。

---

## Group 10-quick: 住宅ローン計算バグ修正（05-I05, 05-I06）

### 期待方向
- **05-I05**: `principal × r ≥ monthly` で `newN` が `NaN` / `Infinity` になる場合、即完済扱い（`principal = 0, endYear = year`）にフォールバック。
- **05-I06**: 同年に `refi` と `prepay` が混在する場合、常に `refi → prepay` の順で処理する（既存の `sort((a,b)=>a.year-b.year)` は年のみでソートし同年内順不定）。

### 想定される snapshot 差分
既存 5 シナリオのうち、NaN 発症条件（極端に低い monthly）や同年 refi+prepay を持つサンプルは皆無のため **snapshot 差分なし**。リグレッションテスト（test/regression.test.js）で挙動を固定する。

### 実測サマリー
- snapshot 差分: **なし**（既存 5 シナリオに該当条件のイベント未登録）
- regression.test.js に BUG#2/#3 を追加して挙動固定
- テスト: 157/157 グリーン（155 + 新規 2）
- 実コミット: c196760

---

## Group 7: income_change 昇給継続フラグ（02-I03）

### 期待方向
- `cashFlowEvents[{type:'income_change'}]` に `continueGrowth: boolean` フィールドを追加（既定 `false`）。
- `continueGrowth === true` のとき、イベント年を起点に `× pow(1 + growthRate, yr − eventYear)` を適用。`incomeGrowthUntilAge` 超過年は昇給停止。
- 既存サンプル 5 シナリオはすべて `continueGrowth` 未指定 → `false` 扱い → 従来挙動を維持 → snapshot 差分なし。
- UI: cashFlowEvent 編集モーダルに「転職・昇給後も昇給率を継続する」チェックボックスを追加。

### 実測サマリー
- snapshot 差分: **なし**（既存 5 サンプルは `continueGrowth` 未指定）
- UI: index.html の `renderCFETypeFields` / `saveCFEvent` に continueGrowth 取り扱いを追加
- テスト: 160/160 グリーン（157 + 新規 BUG#4 3 件）
- 実コミット: 424b271

---

## Group 9b: calcTakeHome 配偶者控除本実装（06-I02）

### 期待方向
- `calcSpouseDeduction(partnerAnnualIncomeMan, partnerAge)` を `calc/income-expense.js` に新設。軸1（パートナー所得逓減）+ 軸3（70歳以上老人加算）。
- `calcTakeHome` (index.html) で課税所得から所得税分を減算、住民税は別途逓減控除を適用。
- `calc/integrated.js` L66-71/L98-100 の Phase 4b 近似 `annualIncome *= 1.005` を削除。
- snapshot 影響: `_inputMode === 'gross'` AND `partnerAnnualIncome ≤ 103` のシナリオでのみ `annualIncome` 値が +0.5% 補正分だけ減る方向。サンプル B/D（net モード）は不変。
- 既存 5 サンプルが該当条件を持たなければ snapshot 差分なし。持つ場合は退職前資産が微減方向。

### 実測サマリー
- snapshot 差分: **なし**（既存 5 サンプルに gross モード + partnerAnnualIncome ≤ 103 の組み合わせなし）
- `calcSpouseDeduction` 新設（calc/income-expense.js 末尾）
- `calcTakeHome` (index.html L16072+) に配偶者控除統合 — gross モードでパートナー低所得時に税額減
- Phase 4b 近似削除: `calc/integrated.js` L66-71 + L98-100
- テスト: 168/168 グリーン（160 + BUG#5 8 件）
- 実コミット: ee6e24e

---

## Group 10-refi: 借換諸費用（05-I04）

### 期待方向
（Task 5 実施時に記入）

### 実測サマリー
（Task 5 修正後に記入）

---

## Group 10-housing: 子育て特例＋頭金（05-I01, 05-I02）

### 期待方向
（Task 6 実施時に記入）

### 実測サマリー
（Task 6 修正後に記入）

---

## Group 10-scenario: シナリオ連動（05-I03）

### 期待方向
（Task 7 実施時に記入）

### 実測サマリー
（Task 7 修正後に記入）
