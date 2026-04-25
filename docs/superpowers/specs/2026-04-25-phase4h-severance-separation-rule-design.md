# Phase 4h: 退職所得控除の 5/19 年ルール 設計書

**作成日**: 2026-04-25
**前提**: Phase 4g 完了（iDeCo 併用受給、`f398a7b`）

## 目的

退職金と iDeCo 一時金を別年で受給した場合、年差が一定以上なら退職所得控除を **別枠** で適用できる税制ルール（5/19 年ルール）を実装する。現状はすべて合算扱いで、別枠適用すべきケースで控除が重複適用されず税負担が過大に出る。

## スコープ

### 対象機能

- 退職金 (severanceAge) と iDeCo 一時金 (idecoStartAge) の年差を自動判定
- 別枠適用条件:
  - **19 年ルール**: 退職金が先、iDeCo が後で、年差 ≥ 19 年 → 別枠
  - **5 年ルール**: iDeCo が先、退職金が後で、年差 ≥ 5 年 → 別枠
  - それ以外 → 合算（現状動作維持）
- 別枠時は `calcSeveranceDeduction` を 2 回独立に呼ぶ：
  - 退職金単独: serviceYears 使用
  - iDeCo 単独: idecoEnrollYears = `idecoStartAge - 22`（既存 serviceYears デフォルトと同じ近似）

### 対象外

- 9 年/20 年ルール（2025 税制改正大綱、2026 年以降施行予定）→ 現行 5/19 を採用
- iDeCo 加入期間の UI 入力（自動推定で十分）
- 退職金受給年齢の細かい刻み（既存 severanceAge を流用）

## 数値例

退職金 2000 万円（serviceYears=38）+ iDeCo 一時金 800 万円（idecoEnrollYears=35）:

**合算（現状）**:
- 控除 = 800 + 70 × (38-20) = 2060 万円（serviceYears は退職金の 38 年）
- taxable = max(0, 2800 - 2060) / 2 = 370 万円
- 税 = 約 86 万円

**別枠（19 年ルール適用、退職金先・iDeCo 後 19 年）**:
- 退職金: 控除 2060 万 → taxable = max(0, 2000-2060) / 2 = 0 → 税 0
- iDeCo: 控除 800 + 70 × (35-20) = 1850 万 → taxable = max(0, 800-1850) / 2 = 0 → 税 0
- 税 = 0 円（節税 約 86 万円）

別枠の方が控除を 2 回使えるため節税効果あり。

## データモデル

新規フィールドなし。既存の `severanceAge`, `idecoStartAge`, `serviceYears` を活用。

`idecoEnrollYears`（自動推定）= `idecoStartAge - 22`、最低 1 年。

## 計算ロジック

`calc/retirement.js` の `calcRetirementSimWithOpts`（および `calcRetirementSim`）の severance 計算箇所を以下に変更：

```javascript
function calcSeveranceWith519Rule(severance, severanceAge, severanceServiceYears, idecoLumpsum, idecoStartAge, idecoEnrollYears) {
  // 両方ゼロまたは未指定なら 0
  if (severance <= 0 && idecoLumpsum <= 0) return 0;

  // 退職金のみ
  if (severance > 0 && idecoLumpsum <= 0) {
    return calcSeveranceDeduction(severance, 0, severanceServiceYears);
  }
  // iDeCo のみ
  if (severance <= 0 && idecoLumpsum > 0) {
    return calcSeveranceDeduction(0, idecoLumpsum, idecoEnrollYears);
  }

  // 両方あり: 5/19 年ルール判定
  const sAge = parseFloat(severanceAge) || 0;
  const iAge = parseFloat(idecoStartAge) || 0;
  // どちらか不明なら合算（保守的）
  if (!sAge || !iAge) {
    return calcSeveranceDeduction(severance, idecoLumpsum, severanceServiceYears);
  }
  const gap = Math.abs(iAge - sAge);
  // 退職金が先、iDeCo が後 → 19 年ルール
  if (sAge < iAge && gap >= 19) {
    const sNet = calcSeveranceDeduction(severance, 0, severanceServiceYears);
    const iNet = calcSeveranceDeduction(0, idecoLumpsum, idecoEnrollYears);
    return sNet + iNet;
  }
  // iDeCo が先、退職金が後 → 5 年ルール
  if (iAge < sAge && gap >= 5) {
    const sNet = calcSeveranceDeduction(severance, 0, severanceServiceYears);
    const iNet = calcSeveranceDeduction(0, idecoLumpsum, idecoEnrollYears);
    return sNet + iNet;
  }
  // 同年 or ルール不適用 → 合算（既存挙動）
  return calcSeveranceDeduction(severance, idecoLumpsum, severanceServiceYears);
}
```

### 既存 calcSeveranceDeduction との関係

`calcSeveranceDeduction` は変更しない。新ヘルパー `calcSeveranceWith519Rule` がそれを 1〜2 回呼び出す形でルール適用を制御。

### 呼び出し側の置換

`calc/retirement.js` の 2 箇所：
- `calcRetirementSim` (~L82): `severanceAtRetire = calcSeveranceDeduction(severanceGross, idecoLumpsumSim, serviceYears);` → `calcSeveranceWith519Rule(...)`
- `calcRetirementSimWithOpts` (~L407): 同等

引数: severance=severanceGross, severanceAge=severanceAge, severanceServiceYears=serviceYears, idecoLumpsum=idecoLumpsum (or Sim), idecoStartAge=idecoStartAge (or Sim), idecoEnrollYears=Math.max(1, idecoStartAge - 22)

## 後方互換

- 既存サンプル全件 idecoMethod 未指定 → 'lump' 既定 → idecoStartAge = targetAge
- 退職金がある場合 severanceAge は targetAge 付近（多くは同年）
- gap = 0 → ルール非該当 → 合算（既存挙動）→ snapshot 不変
- 例外: severanceAge と idecoStartAge を異なる年に設定し、かつ gap ≥ 5 のサンプルがあれば snapshot 変動（要事前確認）

## エラーハンドリング

- severanceAge / idecoStartAge が 0 / null / undefined → 合算（保守的フォールバック）
- gap が NaN になる入力 → 合算
- idecoEnrollYears が 0 や負 → `Math.max(1, ...)` で最低 1 年

## 修正ファイル

| パス | 変更内容 |
|---|---|
| `calc/retirement.js` | `calcSeveranceWith519Rule` 関数追加、2 箇所の severance 計算で呼び出し置換 |
| `test/regression.test.js` | BUG#13 リグレッション 6 件追加 |

## テスト戦略

`test/regression.test.js` に BUG#13 として：

1. severance のみ → 既存挙動（calcSeveranceDeduction 単独呼び出しと同等）
2. iDeCo lump のみ → idecoEnrollYears で別途控除適用
3. 退職金先 (severanceAge=60) + iDeCo 後 (idecoStartAge=80, gap=20) → 19 年ルール適用、別枠
4. 退職金先 + iDeCo 後 (gap=10) → ルール非該当、合算
5. iDeCo 先 (idecoStartAge=60) + 退職金後 (severanceAge=70, gap=10) → 5 年ルール適用、別枠
6. iDeCo 先 + 退職金後 (gap=3) → ルール非該当、合算

snapshot 想定: 既存サンプル全件で severanceAge ≈ idecoStartAge ≈ targetAge → gap ≈ 0 → snapshot 不変

## commit 構成

1. `chore(phase4h): scaffold expected-changes tracking`
2. `fix(phase4h): apply 5/19 year rule for separate retirement deduction`
3. `docs(phase4h): record actual SHA + completion summary`

合計 **約 3 commits**（小規模 phase）。

## 完了条件

- [ ] `calcSeveranceWith519Rule` 関数追加
- [ ] `calc/retirement.js` 2 箇所で置換
- [ ] BUG#13 6 件追加（201 → 207 グリーン）
- [ ] 既存 snapshot 不変
- [ ] `docs/phase4h-fixes/expected-changes.md` 記録
- [ ] サニティウォークスルー B に Phase 4h 評価追記

## Phase 4i 以降の候補

- Minor 63 件選別
- 新規 UI 機能（PDF 出力、シナリオ共有 URL 等）
