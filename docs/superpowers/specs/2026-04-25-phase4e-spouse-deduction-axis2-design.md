# Phase 4e: 06-I02 軸2（本人高所得者逓減）設計書

**作成日**: 2026-04-25
**前提**: Phase 4d 完了（iDeCo 受給方法 UI、`940d23b`）

## 目的

Phase 4c で実装した `calcSpouseDeduction` (軸1=パートナー所得逓減 + 軸3=老人加算) に、未対応だった **軸2=本人高所得者逓減**（合計所得 900/950/1000 万円ライン）を追加し、配偶者控除実装を 100% 完成させる。Phase 2 監査の Important 残課題を完全に解消。

## スコープ

### 対象機能

- `calcSpouseDeduction` に本人合計所得（`selfTotalIncomeMan`）引数を追加（optional）
- 国税庁 No.1191 / No.1195 の本人所得逓減ルール実装：
  - 本人合計所得 ≤ 900 万: 控除満額（× 1.0）
  - 900 万 < x ≤ 950 万: 控除 × 2/3
  - 950 万 < x ≤ 1000 万: 控除 × 1/3
  - x > 1000 万: 控除 0
- `calcTakeHome` (index.html) で本人合計所得を計算して渡す

### 対象外

- 厳密な合計所得計算（配当所得、不動産所得、譲渡所得などの加算）→ 給与所得のみで近似
- UI フィールド追加（`state.finance.income / bonus` の既存値から導出）
- リタイア期計算側への 軸2 反映（calcTakeHome は現役期試算 UI 経由のみ。Phase 4b/4c で支出側の近似は削除済み）

## データモデル

新規フィールドなし。既存 `state.finance.income / bonus` から本人年間額面を計算し、`calcTakeHome` 内で:

```javascript
const selfTotalIncomeMan = Math.max(0, grossAnnual - salaryDeduction);
```

を渡す（合計所得 = 給与収入 − 給与所得控除、簡略）。

## 計算ロジック

### `calcSpouseDeduction` シグネチャ拡張

```javascript
function calcSpouseDeduction(partnerAnnualIncomeMan, partnerAge, selfTotalIncomeMan) {
  // 軸1 + 軸3 の既存ロジックで { incomeTaxDeduction, residentTaxDeduction } を算出（変更なし）
  // ...

  // [Phase 4e 06-I02 軸2] 本人高所得者逓減
  const selfInc = parseFloat(selfTotalIncomeMan) || 0;
  let highIncomeMultiplier = 1;
  if (selfInc > 1000) highIncomeMultiplier = 0;
  else if (selfInc > 950) highIncomeMultiplier = 1/3;
  else if (selfInc > 900) highIncomeMultiplier = 2/3;

  incomeTaxDeduction = Math.round(incomeTaxDeduction * highIncomeMultiplier);
  residentTaxDeduction = Math.round(residentTaxDeduction * highIncomeMultiplier);

  return { incomeTaxDeduction, residentTaxDeduction };
}
```

`selfTotalIncomeMan` 未指定 / NaN → multiplier = 1 → 軸1+軸3 のみ → 既存挙動。

### `calcTakeHome` (index.html) からの呼び出し

```javascript
// 本人合計所得 = 給与収入 - 給与所得控除（社保・基礎控除は除外、軸2 判定はこのレベル）
const selfTotalIncome = Math.max(0, grossAnnual - salaryDeduction);
const spouseDeduction = (typeof calcSpouseDeduction === 'function')
  ? calcSpouseDeduction(partnerTotalIncome, partnerAge, selfTotalIncome)
  : { incomeTaxDeduction: 0, residentTaxDeduction: 0 };
```

### NTA 値との照合

| 本人合計所得 | パートナー所得 ≤ 48 / 配偶者控除 | パートナー所得 100 / 配偶者特別控除 |
|---|---|---|
| ≤ 900 万 | 38 / 33（満額） | 36 / 33 |
| 900-950 | 26 / 22（×2/3） | 24 / 22 |
| 950-1000 | 13 / 11（×1/3） | 12 / 11 |
| > 1000 | 0 / 0 | 0 / 0 |

`Math.round(x * 2/3)` and `Math.round(x * 1/3)` give NTA-correct values for all 軸1 tier values (38/36/31/26/21/16/11/6/3 → 26/24/21/17/14/11/7/4/2 [×2/3] → 13/12/10/9/7/5/4/2/1 [×1/3]). 老人加算（48/38）も同様に逓減される。

## 後方互換

- `calcSpouseDeduction` の第3引数は optional → undefined → multiplier=1 → 既存テスト全件 pass
- `calcTakeHome` 内の呼び出しは新シグネチャに更新だが、UI 試算機能のみで使用（既存サンプルの統合シミュレーション snapshot には影響なし、UI 試算は snapshot 化されていない）
- 既存サンプル 5 件は本人年収 < 900 万 → multiplier=1 → 既存挙動と一致 → snapshot 不変

## エラーハンドリング

- `selfTotalIncomeMan` が undefined / NaN / 負値 → `parseFloat(...) || 0` で 0 扱い → multiplier=1（軸2 適用なし）
- 既存の `partnerAnnualIncomeMan` / `partnerAge` のフォールバックは変更なし

## テスト戦略

`test/regression.test.js` の BUG#5 describe ブロック（Phase 4c 06-I02 本実装）に新規 it() を追記、または BUG#10 として独立追加：

1. `selfTotalIncome` 未指定 → 既存挙動（軸1+軸3 のみ、軸2 影響なし）
2. 本人 850 万 → 満額（multiplier=1）
3. 本人 920 万 → ×2/3（38→26、33→22）
4. 本人 980 万 → ×1/3（38→13、33→11）
5. 本人 1050 万 → 0/0
6. 老人加算 + 本人 920 万 → 48×2/3=32 / 38×2/3=25

snapshot 想定: 既存サンプル全件で本人年収 < 900 万 → 全ケース multiplier=1 → snapshot 不変

## commit 構成

1. `chore(phase4e): scaffold expected-changes tracking`
2. `fix(phase4e): calcSpouseDeduction 軸2 self-income tiered reduction (06-I02)`
3. `docs(phase4e): record actual SHA`
4. `docs(phase4e): mark related notes complete`

合計 **約 4 commits**（Phase 4d と同規模）。

## 完了条件

- [ ] `calcSpouseDeduction` に第3引数 `selfTotalIncomeMan` 追加 + 軸2 multiplier 適用
- [ ] `calcTakeHome` (index.html) で本人合計所得を渡す
- [ ] `test/regression.test.js` に 軸2 リグレッションテスト 6 件追加（183 → 189 想定）
- [ ] 既存 snapshot 不変
- [ ] `docs/phase4e-fixes/expected-changes.md` に期待方向 + 実測記録
- [ ] `docs/phase2-audits/06-partner-retirement.md` の 06-I02 注記を「完全実装」に更新

## Phase 4f 以降の候補

- 一時金 + 年金併用受給（iDeCo）
- 5/19 年ルール（厳密な退職所得控除別枠化）
- 年金受給期間中の運用継続（annuity 計算）
- Minor 63 件の選別修正
- 新規 UI 機能（PDF 出力等）
