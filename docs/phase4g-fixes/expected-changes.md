# Phase 4g 修正の期待方向と実測

iDeCo 一時金+年金 併用受給（mixed mode）の実装記録。

---

## Group: iDeCo Mixed Receipt

### 期待方向
- `idecoReceiptMethod` に `'mixed'` 値追加
- `state.retirement.idecoLumpRatio`（0-100, 既定 50）を新規追加
- `calc/retirement.js` 2 箇所で mixed 分岐：
  - `idecoLumpsum = balance × (lumpRatio/100)` (mixed 時)
  - `_idecoPensionPortion = balance × (1 - lumpRatio/100)` (mixed 時)
  - `idecoYearly` は `_idecoPensionPortion` を annuity formula にかける
- UI: 退職パネルに「併用」ラジオ + 一時金比率（0-100%）入力欄追加
- 既存サンプル全件 `idecoMethod` 未指定 → 'lump' 既定 → snapshot 不変
- mixed 0% = pension 同等、mixed 100% = lump 同等の連続性を保証

### 実測サマリー
- snapshot 差分: **なし**（既存サンプル全件 idecoMethod 未指定 → 'lump' 既定）
- `calc/retirement.js` 2 箇所で mixed 分岐 + idecoLumpRatio 適用
- UI: 退職パネルに「併用」ラジオ + 一時金比率（0-100%）入力欄追加
- save/render に idecoLumpRatio 対応
- onIdecoMethodChange を 3 状態（lump / pension / mixed）対応に拡張
- テスト: 201/201 グリーン（196 + BUG#12 5 件）
- 実コミット: 35620a8

---

## 完了総括（2026-04-25）

### 達成事項

- iDeCo 一時金+年金 併用受給 (mixed mode) 実装
- 一時金比率 0-100% 自由指定（5% 刻み UI）
- mixed 0%/100% で pension/lump と完全連続
- テスト: 201/201 グリーン（+5 件 BUG#12）
- 既存 snapshot 不変
- commit 構成: setup 1 + fix 1 + SHA record 1 + 最終 docs 1 = 計 4 コミット

### 実装上の重要な発見

1. **idecoIncomeThisYear の mixed 対応**: 年次ループの条件を `pension || mixed` に拡張。これがないと mixed 経路で年金部分が totalNonAssetIncome に加算されず silent data loss 発生。
2. **lumpRatio の falsy 0 問題**: `parseInt(...) || 50` は 0% 入力を 50 に上書きしてしまう。明示的 null/NaN チェック (`(v != null && !isNaN(parseInt(v))) ? parseInt(v) : 50`) に修正。

### iDeCo 受給機能の完成度

- 受給方法: 一時金 / 年金 / **併用**（Phase 4g で完成）
- 受給開始年齢: 60-75 歳（Phase 4d）
- 年金受給期間: 5/10/15/20 年（Phase 4d）
- annuity 計算: 受給期間中の運用継続反映（Phase 4f）
- 配偶者控除との連動: 3 軸完全実装（Phase 4c/4e）

### Phase 4h 以降への橋渡し

- 5/19 年ルール（厳密な退職所得控除別枠化、退職金と iDeCo 一時金の年差別控除）
- Minor 63 件選別（出典更新、helper テキスト等）
- 新規 UI 機能（PDF 出力、シナリオ共有 URL 等）
