# Phase 4p 修正の期待方向と実測

保険料シミュレーション統合（F1）の記録。

## 期待方向

- `getInsurancePremiumsForYear(year)` を `calc/income-expense.js` に追加
- `calc/integrated.js` の現役期年次ループで `annualExpense` に保険料年額加算
- `calc/retirement.js` の退職期年次ループで `totalAnnualExpense` に保険料年額加算
- 既存サンプル全件で保険料が反映 → 支出増 → endAssets 減 (snapshot 変動)
  - A: 年 3.6 万 / B: 年 24 万 / C: 年 18 万 / D: 年 39.6 万 / E: 年 18 万
- 30-50 年の累計で数百〜千万円規模の差

## 実測サマリー
- snapshot 差分: 全 5 シナリオで支出増 / endAssets 減（期待方向通り）
- `getInsurancePremiumsForYear` 追加（calc/income-expense.js）
- `calc/integrated.js` の現役期 annualExpense に加算
- `calc/retirement.js` の退職期 totalAnnualExpense に加算
- テスト: 226/226 グリーン (220 + BUG#18 6 件)
