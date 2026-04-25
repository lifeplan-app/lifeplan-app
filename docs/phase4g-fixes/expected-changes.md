# Phase 4g 修正の期待方向と実測

iDeCo 一時金+年金 併用受給（mixed mode）の実装記録。

---

## Group: iDeCo Mixed Receipt

### 期待方向
- `idecoReceiptMethod` に `'mixed'` 値追加
- `state.retirement.idecoLumpRatio`（0-100, 既定 50）を新規追加
- `calc/retirement.js` 2 箇所で mixed 分岐：
  - `idecoLumpsum = balance × (lumpRatio/100)` (mixed 時)
  - `_idecoPensionPortion = balance × (1 - lumpRatio/100)` (mixed 時)
  - `idecoYearly` は `_idecoPensionPortion` を annuity formula にかける
- UI: 退職パネルに「併用」ラジオ + 一時金比率（0-100%）入力欄追加
- 既存サンプル全件 `idecoMethod` 未指定 → 'lump' 既定 → snapshot 不変
- mixed 0% = pension 同等、mixed 100% = lump 同等の連続性を保証

### 実測サマリー
- snapshot 差分: **なし**（既存サンプル全件 idecoMethod 未指定 → 'lump' 既定）
- `calc/retirement.js` 2 箇所で mixed 分岐 + idecoLumpRatio 適用
- UI: 退職パネルに「併用」ラジオ + 一時金比率（0-100%）入力欄追加
- save/render に idecoLumpRatio 対応
- onIdecoMethodChange を 3 状態（lump / pension / mixed）対応に拡張
- テスト: 201/201 グリーン（196 + BUG#12 5 件）
- 実コミット: 35620a8
