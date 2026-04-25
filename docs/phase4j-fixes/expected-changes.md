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
