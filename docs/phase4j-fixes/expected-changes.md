# Phase 4j 修正の期待方向と実測

03-M07 奨学金計上漏れバグ修正の記録。

## Group: 03-M07 Scholarship borrowedAmount=0 fallback

### 期待方向
- `calc/life-events.js:217` の endYear 自動計算で borrowedAmount=0 時に sy-1 が返るバグを修正
- 修正: borrowedAmount > 0 なら従来計算、そうでなければ sy + 14 (15 年デフォルト) にフォールバック
- 既存サンプルはすべて borrowedAmount を明示指定 → snapshot 不変想定

### 実測サマリー
- snapshot 差分: なし
- `calc/life-events.js:217` 付近で endYear 自動計算ロジックを 3-way 分岐化
- borrowedAmount=0 時に 15 年デフォルトフォールバック
- テスト: 213/213 グリーン（211 + BUG#15 2 件）

---

## 完了総括（2026-04-25）

### 達成事項

- 03-M07 奨学金計上漏れバグ修正
- テスト: 213/213 グリーン（+2 件 BUG#15）
- 既存 snapshot 不変
- commit: 1 fix commit + 1 docs commit

### Phase 4 シリーズ全体の累積成果

Phase 1（snapshot lock-in）→ Phase 2（audit）→ Phase 2.5（Critical 10 件）→ Phase 3/3.5（モジュール抽出）→ Phase 4a/b/c（Important 全 40 件）→ Phase 4d-4j（機能拡張・精度向上）。

最終テスト数 213、Phase 2 監査の Critical/Important すべて解決済み + Minor 6 件解消（5 件 in 4i + 03-M07 in 4j）。
