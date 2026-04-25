# Phase 4f 修正の期待方向と実測

iDeCo 年金受給時の運用継続（annuity 計算）の実装記録。

---

## Group: iDeCo Annuity 計算

### 期待方向
- `calc/retirement.js` 2 箇所で iDeCo 加重平均利回り計算を追加
- 年金時 idecoYearly を annuity formula に変更:
  - r > 0: `idecoYearly = balance × r / (1 − (1+r)^-n)`
  - r === 0: balance / n（既存フォールバック）
- 既存サンプル全件 pension method 未指定 → snapshot 不変
- 新規受給ユーザーは複利効果分（4% × 10 年で約 +23%）受給額増

### 実測サマリー
- snapshot 差分: **なし**（既存サンプル全件 pension method 未指定）
- `calc/retirement.js` 2 箇所で `_idecoStats` reduce + annuity formula 適用
- 加重平均利回り計算は残高 reduce と一体化（パフォーマンス影響なし）
- テスト: 196/196 グリーン（192 + BUG#11 4 件）
- `test/helpers/load-calc.js` に `_loadedFiles` ガードを追加（const 二重宣言エラー回避）
- 実コミット: bbfcb51
