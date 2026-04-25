# Phase 4h 修正の期待方向と実測

退職所得控除の 5/19 年ルール実装記録。

---

## Group: 5/19 年ルール

### 期待方向
- `calc/retirement.js` に `calcSeveranceWith519Rule(severance, severanceAge, severanceServiceYears, idecoLumpsum, idecoStartAge, idecoEnrollYears)` 関数追加
- 判定:
  - 両方 0 → 0
  - 片方のみ → calcSeveranceDeduction 単独呼び出し
  - 両方あり、severanceAge < idecoStartAge かつ gap ≥ 19 → 別枠（19 年ルール）
  - 両方あり、idecoStartAge < severanceAge かつ gap ≥ 5 → 別枠（5 年ルール）
  - それ以外 → 合算（既存挙動）
- `calcRetirementSim`/`calcRetirementSimWithOpts` の severance 計算を新関数に置換
- 既存サンプル全件 gap ≈ 0 → snapshot 不変
- 別枠時の節税効果: 退職金 + iDeCo 一時金両方ある高所得者で大きい

### 実測サマリー
- snapshot 差分: なし
- `calc/retirement.js` に `calcSeveranceWith519Rule` 追加（27 行）
- 2 箇所で `calcSeveranceDeduction` 呼び出しを新関数に置換
- idecoEnrollYears は `Math.max(1, idecoStartAge - 22)` で自動推定
- テスト: 207/207 グリーン（201 + BUG#13 6 件）
