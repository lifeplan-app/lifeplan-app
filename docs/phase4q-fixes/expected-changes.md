# Phase 4q 修正の期待方向と実測

贈与計画シミュレーション統合（F2）の記録。

## 期待方向

- `getGiftExpenseForYear(year)` を `calc/income-expense.js` に追加
- `getOneTimeForYear` 内で `getGiftExpenseForYear(year)` を減算（既存 `expenses[]` 減算と同じパターン）
- 既存サンプル D のみ giftPlans 1 件 → D の snapshot 変動（贈与年に oneTime 大支出）
- 他 4 サンプルは影響なし（giftPlans 空）

## 実測サマリー
（修正後に記入）
