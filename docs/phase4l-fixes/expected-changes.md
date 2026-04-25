# Phase 4l 修正の期待方向と実測

2026 税制改正 9/20 年ルール対応の記録。

## Group: 9/20 年ルール

### 期待方向
- `calcSeveranceWith519Rule` に第 7/8 引数 (severanceFirstThreshold, idecoFirstThreshold) 追加（既定 19/5、後方互換）
- 呼び出し元 (calcRetirementSim, calcRetirementSimWithOpts) で受給年から閾値選択：
  - max(sevReceiptYear, idecoReceiptYear) ≥ 2026 → 20/9
  - else → 19/5（既存挙動）
- 既存 BUG#13 6 件は引数省略で 19/5 → pass 維持
- 既存 5 サンプルは gap=0 → どちらの閾値でも合算 → snapshot 不変

### 実測サマリー
（修正後に記入）
