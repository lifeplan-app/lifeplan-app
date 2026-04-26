# Phase SP-3-C 完了報告

**完了日**: 2026-04-26
**実施者**: Claude (auto mode)
**計画**: `docs/superpowers/plans/2026-04-26-phase-sp-3c-residual-fixes.md`

## 概要

Phase SP-2 監査の Important 残 5 件 + SP-LP-01 設計確定の計 6 件を実装。

## 修正サマリー

| Fix | 監査 ID | コミット | 内容 |
|---|---|---|---|
| Fix-G | SP-CSV-08-A | `986acb5` | `parseMFCSV` / `parseZaimCSV` の戻り値を `{ entries, skipped }` に変更し、通知に「N行パース失敗」を表示 |
| Fix-I | SP-CSV-04   | `d449056` | `mf-normal.csv` フィクスチャを実 MF ME 形式（正値 + `入/出` 列）に更新 |
| Fix-J | SP-CL-05    | `5b99927` | `insurance_ratio.check` も `state.income?.monthly` を参照（`avgCheck` と統一） |
| Fix-K | SP-LP-04 item 2 | `183c2b7` | `setAvgMonths` / `setIrregularYears` で `irregularSuggestions[].approved` をリセット |
| Fix-L | SP-LP-01    | `3ed4a11` | sync 確認モーダルに「特別費は自動連携対象外」注記を追加（設計確定） |
| Fix-H | SP-CSV-08-B | `e37e386` | `handleCSVFile` で `fmt === 'unknown'` 時に `confirm` ダイアログ |

## 主要変更ファイル

- `spending/calc/csv-parser.js`: parseMFCSV / parseZaimCSV シグネチャ変更
- `spending/index.html`: handleCSVFile / confirmImport / SUGGESTION_TRIGGERS / setAvgMonths / setIrregularYears / syncToLifeplan
- `test/spending/csv-parser.test.js`: 全 call site を `const { entries } = ...` に更新 + 新規テスト 2 件
- `test/spending/snapshot.test.js`: parseMFCSV / parseZaimCSV call site を destructure に更新
- `test/spending/fixtures/mf-normal.csv`: ヘッダに `入/出` 列追加 + 金額を正値化

## テスト件数推移

| Phase | 件数 |
|---|---|
| Phase SP-3-B 完了時 | 294 |
| Phase SP-3-C 完了時 | **296** |

新規テスト 2 件（skipped 行数返却の検証）を追加。既存の snapshot は意味的に同等のため不変。

## 手動検証推奨ポイント（ブラウザ）

実際の挙動はブラウザで確認推奨:

1. **Fix-G (skipped 通知)**: CSV インポート完了後の通知に `N件インポート / N件重複スキップ / N行パース失敗` 形式が表示されることを確認
2. **Fix-H (unknown confirm)**: 形式不明な CSV を読み込ませて confirm ダイアログが出ること、キャンセルで処理が中断されること
3. **Fix-J (insurance_ratio)**: `state.income?.monthly` を設定した状態で保険料が 15% を超えると改善提案が出ること（CSV 由来の `d.income` ではなくユーザー設定値で判定）
4. **Fix-K (approval リセット)**: 不定期費用の連携モーダルで「集計期間ボタン」を切り替えると承認チェックが自動的に外れること
5. **Fix-L (sync モーダル注記)**: ライフプラン連携の確認モーダルに「※ 特別費（一回限りの支出）は自動連携対象外です」の注記が出ること（特別費カテゴリが存在する場合）

## SP-3 シリーズ完了状況

| Phase | 内容 | 状態 |
|---|---|---|
| SP-3-A | Critical 2 件 + Important 1 件 | 完了 |
| SP-3-B | Important 6 件 | 完了 |
| SP-3-C | Important 5 件 + SP-LP-01 設計確定 | 完了 |
| 残 | Minor のみ（影響軽微・選別） | 未着手 |

Phase SP-3 シリーズ全体としての Critical / Important 残件は本フェーズで完了。
