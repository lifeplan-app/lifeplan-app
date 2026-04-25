# Phase 4e 修正の期待方向と実測

配偶者控除軸2（本人高所得者逓減）の実装記録。

---

## Group: 06-I02 軸2 本人高所得者逓減

### 期待方向
- `calcSpouseDeduction(partnerAnnualIncomeMan, partnerAge, selfTotalIncomeMan)` の第3引数を追加（optional、未指定で multiplier=1=軸2 影響なし）
- 本人合計所得逓減：
  - ≤ 900 万: × 1.0
  - 900 < x ≤ 950: × 2/3
  - 950 < x ≤ 1000: × 1/3
  - x > 1000: × 0
- 軸1 + 軸3 で算出した控除額に multiplier を乗算、`Math.round` で整数化
- `calcTakeHome` (index.html) で `selfTotalIncome = max(0, grossAnnual − salaryDeduction)` を計算して渡す
- snapshot 影響: 既存サンプル全件本人年収 < 900 万 → multiplier=1 → snapshot 不変
- UI 変更なし（既存 `state.finance.income / bonus` から導出）

### 実測サマリー
- snapshot 差分: **なし**（既存サンプル全件本人年収 < 900 万）
- `calcSpouseDeduction` シグネチャに第3引数追加、軸2 multiplier 適用
- `calcTakeHome` で `selfTotalIncome = max(0, grossAnnual - salaryDeduction)` を計算して渡す
- テスト: 189/189 グリーン（183 + BUG#10 6 件）
