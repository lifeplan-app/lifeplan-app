# Phase 4q 修正の期待方向と実測

贈与計画シミュレーション統合（F2）の記録。

## 期待方向

- `getGiftExpenseForYear(year)` を `calc/income-expense.js` に追加
- `getOneTimeForYear` 内で `getGiftExpenseForYear(year)` を減算（既存 `expenses[]` 減算と同じパターン）
- 既存サンプル D のみ giftPlans 1 件 → D の snapshot 変動（贈与年に oneTime 大支出）
- 他 4 サンプルは影響なし（giftPlans 空）

## 実測サマリー
- snapshot 差分: シナリオ D のみ変動（贈与年で oneTime 減 = 支出大）
  - `oneTime: -125 → -235`（110万円の贈与額が正しく減算）
  - 5 snapshot テスト × 5 シナリオD サブテスト、211 hunks
- `getGiftExpenseForYear` 追加（calc/income-expense.js）
- `getOneTimeForYear` で giftPlans を減算
- 他 4 サンプル不変
- テスト: 229/229 グリーン (226 + BUG#19 3 件)
- メインコミット SHA: 210ff86
