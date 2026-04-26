# Phase SP-3-B: Important 修正 6 件 完了

**完了日**: 2026-04-26
**対象**: SP-CSV-02 / SP-CSV-06 / SP-CSV-07 / SP-CL-03 / SP-CL-06 / SP-LP-04

## 修正一覧

| Fix | 監査 ID | commit | テスト | UI 影響 |
|---|---|---|---|---|
| Fix-A | SP-CSV-07 | 23ae383 | 既存 | エラー通知追加 |
| Fix-B | SP-CSV-06 | 6961bcf | +2 | なし |
| Fix-C | SP-CSV-02 | 232d673 | +4 | なし |
| Fix-D | SP-CL-03 | cc1ade2 | 既存 | 短期データの不定期費用年額が変化 |
| Fix-E | SP-CL-06 | 60aafd2 | +3 | 節約インパクト試算の年数が lifeplan 設定に追従 |
| Fix-F | SP-LP-04 | 4415af5 | 既存 | irregularSuggestions に年額が記録される |

## メトリクス

- 修正前: 284 ユニットテスト
- 修正後: 293 ユニットテスト
- snapshot: 不変（fixture は 12 ヶ月未満データなし、parseDate 形式追加は既存 fixture 影響なし）

## 挙動変化

- **12ヶ月未満データの不定期費用**: 過大評価（× 1.71 等）が解消され、12 ヶ月実績ベースに固定
- **calcSavingsImpact 表示年数**: lifeplan 設定（simYears / targetAge）に応じて 30y / 40y / 65-age など可変
- **CSV 再インポート**: ID 列なしの場合でも重複が検知される
- **`yyyy.mm.dd` 形式の CSV 日付**: 取り込み可能に
- **localStorage 容量超過時**: 通知バナー表示、無音失敗を解消

## 残課題（SP-3-C 候補）

- SP-CSV-04: フィクスチャと実 MF 形式の乖離（test only）
- SP-CSV-08: スキップ行数の通知 + unknown 形式警告
- SP-CL-05: insurance_ratio 単月/平均の income 参照不整合
- SP-LP-01: irregular_variable → expenses[] 完全実装
- SP-LP-04 item 2: 集計期間変更時の承認フラグリセット

## ブラウザ確認推奨

- localStorage を一杯にして大規模 CSV インポート → エラー通知が出るか
- ID 列なし CSV を 2 回インポート → 2 回目で重複スキップされるか
- yyyy.mm.dd 形式の CSV を読込 → 行が認識されるか
- 不定期費用カテゴリにチェック → 連携モーダルで万円単位の年額が表示されるか（amount を表示する UI があれば）
- ライフプラン側で simYears を変更 → 改善提案カードの「N 年で◯万円」表示が変わるか
