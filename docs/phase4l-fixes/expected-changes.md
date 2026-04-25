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
- snapshot 差分: なし（既存サンプルは gap=0 で合算、閾値変更の影響なし）
- 関数引数 + 2 箇所の呼び出し元更新
- テスト: 218/218 グリーン (213 + BUG#16 5 件)
- 実コミット: d16663a
