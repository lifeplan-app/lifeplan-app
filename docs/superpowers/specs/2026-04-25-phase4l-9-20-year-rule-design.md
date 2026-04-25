# Phase 4l: 2026 税制改正 9/20 年ルール対応 設計書

**作成日**: 2026-04-25
**前提**: Phase 4k 完了（PDF 拡張、`cb0f38d`）

## 目的

2025 年税制改正で退職所得控除の 5/19 年ルールが **9/20 年ルール** に変更された（2026/01/01 以後の支払いから適用）。Phase 4h で実装した 5/19 年ルール判定を年依存にし、改正後の受給に対しては自動的に新しい閾値で計算する。

## 背景

| ケース | 現行（〜2025） | 改正後（2026〜） |
|---|---|---|
| 退職金先 + iDeCo 後 | 19 年で別枠 | **20 年で別枠** |
| iDeCo 先 + 退職金後 | 5 年で別枠 | **9 年で別枠** |

改正適用条件: **退職手当等の支払日が 2026/01/01 以後**（退職金または iDeCo 一時金）

## スコープ

### 対象

- `calc/retirement.js` の `calcSeveranceWith519Rule` を引数で閾値を受け取れるよう拡張（既定値は現行 5/19、後方互換）
- 呼び出し元（`calcRetirementSim`, `calcRetirementSimWithOpts`）で受給年を計算し、閾値を選択して渡す

### 対象外

- iDeCo 拠出限度額の年月依存（Phase 4i 01-M04 でノート更新済み、計算自体は上限超過してもブロックしないため影響軽微）
- ユーザー手動オーバーライド UI（自動判定で十分）

## 計算ロジック

### 閾値判定

```javascript
// 後の方の受給年 ≥ 2026 なら新ルール
const severanceReceiptYear = birthYear + severanceAge;
const idecoReceiptYear = birthYear + idecoStartAge;
const laterReceiptYear = Math.max(severanceReceiptYear, idecoReceiptYear);
const isPost2026 = laterReceiptYear >= 2026;

const sevFirstThreshold = isPost2026 ? 20 : 19;
const idecoFirstThreshold = isPost2026 ? 9 : 5;
```

### 関数シグネチャ拡張

```javascript
function calcSeveranceWith519Rule(
  severance, severanceAge, severanceServiceYears,
  idecoLumpsum, idecoStartAge, idecoEnrollYears,
  severanceFirstThreshold = 19,  // [Phase 4l] 改正後 20
  idecoFirstThreshold = 5         // [Phase 4l] 改正後 9
) {
  // ... 既存ロジック
  if ((severanceFirst && gap >= severanceFirstThreshold) || (idecoFirst && gap >= idecoFirstThreshold)) {
    // 別枠
  }
}
```

引数省略時は 19/5（後方互換）→ 既存 BUG#13 テストはそのまま pass。

### 呼び出し側

```javascript
// 受給年計算
const _birthYearVal = _birthYear || (currentYear - currentAge);
const _sevReceiptYear = _birthYearVal + (parseFloat(r.severanceAge) || 0);
const _idecoReceiptYear = _birthYearVal + (parseInt(r.idecoStartAge) || 0);
const _laterReceiptYear = Math.max(_sevReceiptYear, _idecoReceiptYear);
const _isPost2026 = _laterReceiptYear >= 2026;
const _sevThreshold = _isPost2026 ? 20 : 19;
const _idecoThreshold = _isPost2026 ? 9 : 5;

const severanceAtRetire = calcSeveranceWith519Rule(
  severanceGross, severanceAge, serviceYears,
  idecoLumpsum, idecoStartAge, _idecoEnrollYears,
  _sevThreshold, _idecoThreshold
);
```

## 後方互換

- 関数引数追加は optional（既定 19/5）→ 既存 BUG#13 6 件は変更なしで pass
- 呼び出し側で受給年 < 2026 のサンプル → 19/5 自動選択（既存挙動）
- 受給年 ≥ 2026 のサンプル → 20/9 適用（新挙動）
- 既存 5 サンプルは退職金/iDeCo 受給年が 2026 年以前か近傍 → 詳細確認要

## エラーハンドリング

- birthYear 不明 → 既存 fallback（`currentYear - currentAge`）使用
- 受給年計算が NaN → 既定 19/5（保守的）

## テスト戦略

`test/regression.test.js` に BUG#16 として：

1. 受給年 2025 → 5/19 ルール適用（既存 BUG#13 と整合）
2. 受給年 2026 → 9/20 ルール適用、退職金先 gap=19 → 合算（旧 19 → 別枠だったが新 20 → 合算）
3. 受給年 2026 → 退職金先 gap=20 → 別枠
4. 受給年 2026 → iDeCo 先 gap=5 → 合算（旧 5 → 別枠だったが新 9 → 合算）
5. 受給年 2026 → iDeCo 先 gap=9 → 別枠

snapshot 想定: 既存サンプル全件で gap=0 → どちらの閾値でも合算 → snapshot 不変

## commit 構成

1. `chore(phase4l): scaffold expected-changes`
2. `fix(phase4l): apply 9/20 year rule for post-2026 retirements`
3. `docs(phase4l): record actual SHA + completion`

合計 **約 3 commits**。

## 完了条件

- [ ] `calcSeveranceWith519Rule` 引数拡張（後方互換維持）
- [ ] 呼び出し元 2 箇所で受給年判定 + 閾値選択
- [ ] BUG#16 5 件追加（213 → 218 グリーン）
- [ ] 既存 snapshot 不変
- [ ] `docs/phase4l-fixes/expected-changes.md` 記録

## Phase 4m 候補

- チャート画像埋め込み (PDF)
- 残 Minor 5-7 件選別
