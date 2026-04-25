# Phase 4h 修正の期待方向と実測

退職所得控除の 5/19 年ルール実装記録。

---

## Group: 5/19 年ルール

### 期待方向
- `calc/retirement.js` に `calcSeveranceWith519Rule(severance, severanceAge, severanceServiceYears, idecoLumpsum, idecoStartAge, idecoEnrollYears)` 関数追加
- 判定:
  - 両方 0 → 0
  - 片方のみ → calcSeveranceDeduction 単独呼び出し
  - 両方あり、severanceAge < idecoStartAge かつ gap ≥ 19 → 別枠（19 年ルール）
  - 両方あり、idecoStartAge < severanceAge かつ gap ≥ 5 → 別枠（5 年ルール）
  - それ以外 → 合算（既存挙動）
- `calcRetirementSim`/`calcRetirementSimWithOpts` の severance 計算を新関数に置換
- 既存サンプル全件 gap ≈ 0 → snapshot 不変
- 別枠時の節税効果: 退職金 + iDeCo 一時金両方ある高所得者で大きい

### 実測サマリー
- snapshot 差分: なし
- `calc/retirement.js` に `calcSeveranceWith519Rule` 追加（27 行）
- 2 箇所で `calcSeveranceDeduction` 呼び出しを新関数に置換
- idecoEnrollYears は `Math.max(1, idecoStartAge - 22)` で自動推定
- テスト: 207/207 グリーン（201 + BUG#13 6 件）
- 実コミット: 363d432

---

## 完了総括（2026-04-25）

### 達成事項

- 退職所得控除の 5/19 年ルール実装
- 受給年差で別枠 / 合算を自動判定
- 既存 calcSeveranceDeduction 維持（後方互換）
- テスト: 207/207 グリーン（+6 件 BUG#13）
- 既存 snapshot 不変
- commit 構成: setup 1 + fix 1 + SHA record 1 + 最終 docs 1 = 計 4 コミット

### 設計上の選択

- idecoEnrollYears = `Math.max(1, idecoStartAge - 22)`（自動推定、UI 入力なし）
- 5/19 年ルールは現行制度（2024 年時点）。9/20 年ルール改正は 2026 年以降施行予定で別フェーズで対応可能
- 年齢不明（severanceAge=0 や idecoStartAge=0）→ 合算フォールバック（保守的）

### Phase 4i 以降への橋渡し

- Minor 63 件選別（出典更新、helper テキスト等）
- 新規 UI 機能（PDF 出力、シナリオ共有 URL 等）
- 9/20 年ルール（2026 改正）への対応（thresholds を named constants 化推奨）
