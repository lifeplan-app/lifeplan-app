# Phase 4d 修正の期待方向と実測

iDeCo 受給方法 UI 拡張（一時金 / 年金 + 受給開始年齢 60-75 + 年金受給期間 5/10/15/20）の記録。

---

## Group: iDeCo 受給方法（07-I04 拡張）

### 期待方向
- `state.retirement` に 3 フィールド追加：
  - `idecoReceiptMethod`: `'lump' | 'pension'`（既定 `'lump'`）
  - `idecoStartAge`: 60-75（既定 `targetAge`）
  - `idecoPensionYears`: 5/10/15/20（既定 `10`、pension 時のみ使用）
- `calc/retirement.js`:
  - `_idecoAtRetire` (yearsToRetire ベース) を `_idecoBalanceAtStart` (yearsToIdecoStart ベース) に置換
  - `idecoLumpsum = (method === 'lump') ? _idecoBalanceAtStart : 0`
  - `idecoYearly = (method === 'pension') ? _idecoBalanceAtStart / idecoPensionYears : 0`
  - 退職期年次ループで `age >= idecoStartAge && age < idecoStartAge + idecoPensionYears` のとき `idecoIncomeThisYear = idecoYearly` を `totalNonAssetIncome` に加算
  - `assetsAtRetire = max(0, _baseWealth - _idecoBalanceAtStart) + severanceAtRetire`（pension でも投資プールから iDeCo 残高を切り出す）
- UI: 退職設定パネルに 3 コントロール（ラジオ / 年齢セレクト / 期間セレクト）。pension 時のみ受給期間欄を表示。
- 既定値で従来挙動維持 → 既存 5 サンプル snapshot 不変。

### 実測サマリー
- snapshot 差分: **なし**（既定値で従来挙動を維持、既存サンプル 5 件は新フィールド未指定）
- `calc/retirement.js`: 2 箇所（calcRetirementSim L60 付近、calcRetirementSimWithOpts L334 付近）で iDeCo 計算を idecoStartAge ベースに置換、年次ループに idecoIncomeThisYear 加算
- UI: 退職設定パネルに 3 コントロール（受給方法ラジオ・受給開始年齢セレクト 60-75・年金受給期間セレクト 5/10/15/20）
- `populateIdecoStartAgeOptions()`、`onIdecoMethodChange()` 新規関数追加
- save/render に新フィールド対応
- テスト: 183/183 グリーン（179 + BUG#9 4 件）
