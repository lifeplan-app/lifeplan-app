# Phase SP-3-A: 連携系 Critical 修正 完了

**完了日**: 2026-04-26
**対象**: SP-LP 監査検出 Critical 2 + Important 1

## 修正内容

| ID | 重要度 | 修正前 | 修正後 |
|---|---|---|---|
| Fix-1 | Critical | モーダル表示中の lp snapshot で上書き | 確定時に再読み込み + diff 警告 |
| Fix-2 | Critical | 連携前値の記録なし、解除不可 | _spendingExpensePrev 記録 + 解除ボタン |
| Fix-3 | Important | irregular_variable も recurringExpenses に書込 | irregular_fixed のみに限定 |

## 変更ファイル

- `spending/index.html` — `doSyncToLifeplan` / `renderSync` の更新および `unsyncFromLifeplan` の新規追加

## テスト

- ユニットテスト: 284/284 グリーン（変更箇所は UI 統合層のため新規ユニットテストなし）。
- ブラウザでの手動動作確認をユーザーに依頼。

## ブラウザ確認ポイント

1. 別タブで lifeplan 編集 → 連携モーダル confirm → 警告ダイアログ表示
2. 連携実行後、UI に「連携を解除」ボタンが表示される（連携サマリー直下）
3. 「連携を解除」クリック → finance.expense が元値に戻る
4. irregular_variable カテゴリ（特別費）の suggestion を承認しても recurringExpenses に追加されない

## 実装メモ

### Fix-1 stale-lp race
- `doSyncToLifeplan` の冒頭で localStorage を再読み込みし、モーダル表示時の snapshot (`lpAtOpen`) と
  `JSON.stringify` 比較。差分時は `confirm()` でユーザーへ確認。
- 確認後は新しい `lp = lpNow` を以降の処理で使用。

### Fix-2 ロールバック対応
- 初回連携時に `lp._spendingExpensePrev = lp.finance.expense ?? null` を記録（再連携時は既存 prev を保持）。
- `unsyncFromLifeplan` 関数で `_spendingExpensePrev` を `finance.expense` に書き戻し、
  `_spendingCatId` 付きの `recurringExpenses` を削除、メタデータを全削除。
- `renderSync()` の連携済みステータス領域に「連携を解除」ボタンを追加。
- `window.unsyncFromLifeplan` を関数定義直後に登録（onclick ハンドラ用）。

### Fix-3 irregular_variable スキップ
- `doSyncToLifeplan` の approved フィルタを `cat.domain === 'irregular_fixed'` 限定に変更。
- `irregular_variable` の自動連携は SP-3-B 以降で別途検討。

## SP-3-A 完了

SP-2 監査の最深刻 3 件を解消。残 SP-LP Important 4 件 + Minor 3 件 + 他領域は SP-3-B 以降で対応。

## commit

- `ade7ded` fix(phase-sp-3a): 連携系 Critical 2 件 + Important 1 件を修正
- `(TBD)` docs(phase-sp-3a): 完了ドキュメント
