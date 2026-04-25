# Phase 4i: Minor 項目選別修正 設計書

**作成日**: 2026-04-25
**前提**: Phase 4h 完了（5/19 年ルール、`5b5b46b`）

## 目的

Phase 2 監査で検出された Minor 63 件のうち、簡潔で価値の高い 5 件を修正する。各項目は数行〜数十行の小修正で計算精度の積み上げに貢献。

## 対象 5 件

| ID | 監査ファイル | 概要 | 修正種別 |
|---|---|---|---|
| **01-M04** | `01-asset-growth.md` | iDeCo 拠出限度額 2026/12 改正（会社員企業年金なし: 月 2.3→6.2 万円） | 計算定数更新 |
| **02-M01** | `02-income-expense.md` | `incomeGrowthUntilAge` 既定値 50→55（賃金構造ピーク整合） | 既定値更新 |
| **02-M05** | `02-income-expense.md` | `one_time_expense` 符号チェック（負値入力で二重マイナス問題） | 防御コード追加 |
| **04-M07** | `04-pension.md` | `avgIncome` 負値防御（負値で厚生年金が負値になるバグ） | 防御コード追加 |
| **05-M05** | `05-mortgage.md` | `deductStart < startYear` バリデーション欠落（実害なしだが UI 一貫性） | UI バリデーション |

## スコープ外

Minor 63 件のうち本フェーズで扱わない 58 件は Phase 4j 以降で個別検討。価値分散を避けるため、機能拡張寄り (NISA 売却枠復活、年金免除期間、変動金利シナリオ等) や UI 表示改善 (4% ルール呼称、内訳表示) は別フェーズへ。

## 各修正の詳細

### 01-M04 iDeCo 拠出限度額 2026/12 改正

**現状**: `calc/asset-growth.js:17` の ASSET_TYPES.ideco に `monthlyLimit: 2.3` がハードコード。

**修正**: 年度依存テーブル化は範囲外。コメント注記でユーザーに改正情報を伝える。
- `monthlyLimit: 2.3` 維持（既存サンプルの後方互換）
- `note` を「会社員(企業年金なし)：月2.3万円。2026年12月以降は月6.2万円に引き上げ予定。掛金全額所得控除。60歳まで原則引出不可。」に更新

**理由**: 限度額自動切替は影響範囲広く（年度別 UI 表示・既存データ遡及・期間別計算）、簡潔修正対象外。注記更新で意識喚起のみ。

### 02-M01 incomeGrowthUntilAge 既定値 50→55

**現状**: `calc/income-expense.js:104` で `parseInt(state.finance.incomeGrowthUntilAge) || 50`。`index.html:9333` で同じく `|| 50`。

**修正**: 両方 `|| 55` に変更。賃金構造基本統計調査ピークは男 55-59 歳。

**snapshot 影響**: 既存サンプルの `incomeGrowthUntilAge` を確認 → 既存値が既定（50）に依存しているならば snapshot 変動。

### 02-M05 one_time_expense 符号チェック

**現状**: `calc/income-expense.js:79` の `total - (e.amount || 0)` は `e.amount < 0` のとき二重マイナスで収入扱いとなる。

**修正**: `total - Math.abs(e.amount || 0)` に変更。一時支出は常に絶対値を引く。

**snapshot 影響**: 既存サンプル全件 amount > 0 → snapshot 不変。

### 04-M07 avgIncome 負値防御

**現状**: `calc/pension.js:23-24`:
```javascript
if (employType === 'employee' && koseiYears > 0 && avgIncome > 0) {
  const hyojunGekkyu = Math.min(avgIncome / 12, 65);
```
条件 `avgIncome > 0` で 0/負値が排除されているように見えるが、実は **0 で関数が分岐するだけ**で、その先でガードが必要なのは UI 直接入力経路。

詳細確認: 条件 `avgIncome > 0` で十分なため実は防御済み。**監査の指摘は誤検出 or 過剰防御要望**。確認の上 no-op とするか、`Math.max(0, avgIncome)` を追加。

**修正**: 防御コードとして `const hyojunGekkyu = Math.min(Math.max(0, avgIncome) / 12, 65);` を追加（深層防御）。

### 05-M05 deductStart < startYear バリデーション

**現状**: `index.html:2890` の `leMortgageDeductStart` 入力欄に `min="2000"` のみ。`startYear` < `deductStart` チェックなし。

**修正**: `calcMortgage()` 関数内（`leMortgageStartYear` / `leMortgageDeductStart` 読込時）に警告メッセージ表示。実害なし（balance=0 → deduction=0）だが UI 一貫性向上。

具体的には `mortgageDeductResult` 表示エリアに警告を追加：
```javascript
if (deductStart && startYear && parseInt(deductStart) < parseInt(startYear)) {
  warningMsg = '⚠️ 控除開始年が借入開始年より前です。借入前の年は控除されません。';
}
```

## データモデル

新規フィールドなし。既存データに破壊的変更なし。

## テスト戦略

`test/regression.test.js` に BUG#14 として：

1. 02-M01: `incomeGrowthUntilAge` 未指定で 55 fallback 確認（55-30=25年昇給、既定 50 比+5年複利）
2. 02-M05: `one_time_expense` 負値で `Math.abs` 適用、収入化されない
3. 04-M07: `avgIncome` 負値で hyojunGekkyu が 0 にクランプ
4. 01-M04: ASSET_TYPES.ideco.note に「2026年12月以降」が含まれる
5. 05-M05: index.html UI のため統合テストでは確認不可、手動確認

snapshot 想定: 02-M01 の既定値変更で既存サンプルが影響を受ける可能性 → 要確認

## commit 構成

1. `chore(phase4i): scaffold expected-changes tracking`
2. `fix(phase4i): minor calc fixes (01-M04, 02-M01, 02-M05, 04-M07)`
3. `fix(phase4i): mortgage deductStart UI validation (05-M05)`
4. `docs(phase4i): record actual SHA + completion summary`

合計 **約 4 commits**。

## 完了条件

- [ ] 01-M04 ノート更新
- [ ] 02-M01 既定値 50→55
- [ ] 02-M05 Math.abs ガード
- [ ] 04-M07 Math.max(0, ...) 深層防御
- [ ] 05-M05 UI バリデーション警告
- [ ] BUG#14 リグレッションテスト 4 件追加
- [ ] snapshot 差分確認・更新
- [ ] `docs/phase4i-fixes/expected-changes.md` 記録
