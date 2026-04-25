# Phase 4i 修正の期待方向と実測

Minor 5 件選別修正の記録（01-M04, 02-M01, 02-M05, 04-M07, 05-M05）。

---

## Group: Minor calc fixes

### 期待方向
- **01-M04**: `calc/asset-growth.js` の `ASSET_TYPES.ideco.note` に「2026年12月以降は月6.2万円に引き上げ予定」を追記
- **02-M01**: `calc/income-expense.js:104` と `index.html:9333` の `incomeGrowthUntilAge || 50` → `|| 55`（賃金統計ピーク整合）
- **02-M05**: `calc/income-expense.js:79` の `total - (e.amount || 0)` → `total - Math.abs(e.amount || 0)`
- **04-M07**: `calc/pension.js:24` の `Math.min(avgIncome / 12, 65)` → `Math.min(Math.max(0, avgIncome) / 12, 65)`（深層防御）
- snapshot 影響: 02-M01 が既存サンプルで効く可能性。サンプルが `incomeGrowthUntilAge` 明示指定なら不変、未指定で既定 50 依存なら影響あり

### 実測サマリー
- snapshot 差分: 10 hunks: 全シナリオで `incomeGrowthUntilAge` 既定 50→55 により年収増（`endAssets` 値が上昇、方向一致）。全サンプルが明示指定なしのため全件影響
- 4 件すべて修正済み
- テスト: 211/211 グリーン（207 + BUG#14 4 件）

---

## Group: 05-M05 mortgage deductStart UI

### 期待方向
- `index.html` の `calcMortgage()` 関数内で `deductStart < startYear` を検出した時、`mortgageDeductResult` エリアに警告メッセージを表示
- 既存の控除計算は変更なし（balance=0 → deduction=0 で実害なし）
- 単に UI 一貫性向上のみ
- 警告は createElement + textContent で XSS 安全に
- snapshot 影響なし（UI のみ）

### 実測サマリー
- UI 警告メッセージ追加（calcMortgage 内、createElement + textContent で安全に）
- snapshot 差分: なし（UI のみ）
- ブラウザ動作確認済み

---

## 完了総括（2026-04-25）

### 達成事項

- Minor 5 件修正（01-M04, 02-M01, 02-M05, 04-M07, 05-M05）
- テスト: 211/211 グリーン（+4 件 BUG#14、snapshot 10 シナリオセクション更新済み）
- commit 構成: setup 1 + calc fix 1 + UI fix 1 + 完了 docs 1 = 計 4 コミット
- 02-M01 の既定値 50→55 で全シナリオ snapshot が income 増加方向に変動（期待通り）
- 04-M07 は深層防御（外部ガードで現行到達不可、将来ガード変更時のみ動作）

### 残存 Minor 58 件

簡潔修正不可な項目（NISA 売却枠復活、変動金利シナリオ、年金免除期間等）は Phase 4j 以降または機能拡張フェーズで個別検討。

### Phase 4j 候補

- 新規 UI 機能（PDF 出力、シナリオ共有 URL 等）
- 9/20 年ルール改正対応（2026 改正）
- iDeCo 拠出限度額 2026/12 以降の自動切替（年度依存テーブル化）
