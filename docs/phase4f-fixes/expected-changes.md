# Phase 4f 修正の期待方向と実測

iDeCo 年金受給時の運用継続（annuity 計算）の実装記録。

---

## Group: iDeCo Annuity 計算

### 期待方向
- `calc/retirement.js` 2 箇所で iDeCo 加重平均利回り計算を追加
- 年金時 idecoYearly を annuity formula に変更:
  - r > 0: `idecoYearly = balance × r / (1 − (1+r)^-n)`
  - r === 0: balance / n（既存フォールバック）
- 既存サンプル全件 pension method 未指定 → snapshot 不変
- 新規受給ユーザーは複利効果分（4% × 10 年で約 +23%）受給額増

### 実測サマリー
- snapshot 差分: **なし**（既存サンプル全件 pension method 未指定）
- `calc/retirement.js` 2 箇所で `_idecoStats` reduce + annuity formula 適用
- 加重平均利回り計算は残高 reduce と一体化（パフォーマンス影響なし）
- テスト: 196/196 グリーン（192 + BUG#11 4 件）
- `test/helpers/load-calc.js` に `_loadedFiles` ガードを追加（const 二重宣言エラー回避）
- 実コミット: bbfcb51

---

## 完了総括（2026-04-25）

### 達成事項

- iDeCo 年金受給時の annuity 計算実装（年金現価係数式）
- 加重平均利回り計算（複数 iDeCo asset 対応、終了時残高で加重）
- r=0 フォールバック維持（後方互換）
- テスト: 196/196 グリーン（+4 件 BUG#11）
- 既存 snapshot 不変
- commit 構成: setup 1 + fix 1 + SHA record 1 + 最終 docs 1 = 計 4 コミット

### 設計上の選択

- 加重平均利回りは **アセット個別の `annualReturn`** をベースに計算（年金受給期間専用の rate ではなく、accumulation 期と同じ rate 系を使用）
- 加重は **受給開始時残高**（terminal balance）で実施。複数 iDeCo asset の「最終ミックス」を反映
- r=0 のとき balance/n フォールバック（既存 Phase 4d 挙動を保持）

### テスト基盤の変更

- `test/helpers/load-calc.js` に `_loadedFiles` Set を追加し、同じ calc ファイルの再評価を防止（`const` 再宣言エラー回避）
- 影響: BUG#11 と既存 BUG#9 のように同一 calc を別の describe block でロードする場合に必要
- 互換性: 既存テストの挙動に影響なし（初回ロード時の挙動は変わらず、リセットを期待するテストは現存しない）
- 将来検討: 必要なら `loadCalc(filename, { force: true })` オプションでリセット可能化

### Phase 4g 以降への橋渡し

- iDeCo 一時金 + 年金 併用受給（比率指定）
- 5/19 年ルール（厳密な退職所得控除別枠化）
- Minor 63 件選別
- 新規 UI 機能（PDF 出力、シナリオ共有 URL 等）
