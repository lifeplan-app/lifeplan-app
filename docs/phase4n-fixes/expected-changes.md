# Phase 4n 修正の期待方向と実測

5 件 Minor 一括修正（04-M03, 02-M03, 06-M05, 07-M01, 08-M02）。

## 期待方向
- 04-M03: 標準報酬月額下限 8.8 万円でクランプ
- 02-M03: excludeYears の型ずれ防御
- 06-M05: partnerSemiEndAge 未入力時 lifeExpectancy フォールバック
- 07-M01: per-asset 5% デフォルトに統一
- 08-M02: 4% ルールラベルを Vanguard Dynamic 系と明記

snapshot 影響:
- 04-M03: 既存サンプルは avgIncome > 105.6 万/年 → 影響なし
- 02-M03: 既存データは number 統一 → 影響なし
- 06-M05: 既存サンプルに partnerType='semi' で partnerSemiEndAge 未入力なし想定 → 影響なし
- 07-M01: per-asset デフォルトは ASSET_TYPES でカバーされるため通常到達せず → 影響なし
- 08-M02: UI ラベルのみ → snapshot 対象外

## 実測サマリー
- snapshot 差分: なし（全 25 シナリオ差分なし）
- 5 件すべて修正済み
- テスト: 220/220 グリーン (218 + BUG#17 2 件)
- 実コミット: 353f4ca
