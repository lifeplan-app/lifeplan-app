# Phase 4e 修正の期待方向と実測

配偶者控除軸2（本人高所得者逓減）の実装記録。

---

## Group: 06-I02 軸2 本人高所得者逓減

### 期待方向
- `calcSpouseDeduction(partnerAnnualIncomeMan, partnerAge, selfTotalIncomeMan)` の第3引数を追加（optional、未指定で multiplier=1=軸2 影響なし）
- 本人合計所得逓減：
  - ≤ 900 万: × 1.0
  - 900 < x ≤ 950: × 2/3
  - 950 < x ≤ 1000: × 1/3
  - x > 1000: × 0
- 軸1 + 軸3 で算出した控除額に multiplier を乗算、`Math.round` で整数化
- `calcTakeHome` (index.html) で `selfTotalIncome = max(0, grossAnnual − salaryDeduction)` を計算して渡す
- snapshot 影響: 既存サンプル全件本人年収 < 900 万 → multiplier=1 → snapshot 不変
- UI 変更なし（既存 `state.finance.income / bonus` から導出）

### 実測サマリー
- snapshot 差分: **なし**（既存サンプル全件本人年収 < 900 万）
- `calcSpouseDeduction` シグネチャに第3引数追加、軸2 multiplier 適用
- `calcTakeHome` で `selfTotalIncome = max(0, grossAnnual - salaryDeduction)` を計算して渡す
- テスト: 189/189 グリーン（183 + BUG#10 6 件）
- 実コミット: 47337fb

---

## 完了総括（2026-04-25）

### 達成事項

- `calcSpouseDeduction` 軸2 実装（本人高所得者逓減 900/950/1000 万）
- 配偶者控除実装の **3 軸完成**（軸1 partner 所得逓減 + 軸2 本人所得逓減 + 軸3 老人加算）
- テスト: 192/192 グリーン（+9 件 BUG#10、boundary 含む）
- 既存 snapshot 不変
- commit 構成: setup 1 + fix 1 + SHA record 1 + ceil 修正 1 + boundary 追加 1 + 最終 docs 1 = 計 6 コミット

### Phase 2 監査関連

- 06-I02 注記を Phase 4c 部分実装 → Phase 4e 完全実装に追記
- サニティウォークスルー B に Phase 4e 完了評価を追記

### 教訓

- 仕様書の `Math.round` 想定が NTA 表値（端数 .33→切り上げ）と不整合だった → `Math.ceil` 統一に修正
- 境界値（900 / 950 / 1000）テスト追加で `>` semantics をロック

### Phase 4f 以降への橋渡し

- iDeCo 一時金 + 年金 併用受給（比率指定）
- 5/19 年ルール（厳密な退職所得控除別枠化）
- 年金受給期間中の運用継続（annuity 計算）
- Minor 63 件の選別修正
- 新規 UI 機能（PDF 出力、シナリオ共有 URL 等）
