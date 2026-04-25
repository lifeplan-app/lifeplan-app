# Phase 4f: iDeCo 年金受給時の運用継続（annuity 計算）設計書

**作成日**: 2026-04-25
**前提**: Phase 4e 完了（配偶者控除 3 軸完全実装、`c04cb7b`）

## 目的

Phase 4d で iDeCo 年金受給時に「balance ÷ pensionYears」の定額計算を採用したが、これは「年金受給期間中は運用利回り 0%」という保守的な簡略化だった。実態は受給期間中も残高に利回りが乗るため、利回りを考慮した年金現価係数式（annuity formula）で精度を向上させる。

## スコープ

### 対象機能

- `calc/retirement.js` の年金時 `idecoYearly` 計算式を annuity formula に変更
- iDeCo アセットの加重平均利回りを使用
- r=0 フォールバック維持

### 対象外

- UI 変更なし（既存の受給開始年齢・受給期間設定を流用）
- 一時金/年金 切替ロジック変更なし
- 退職所得控除側ロジック変更なし

## 計算ロジック

### 現状（Phase 4d、保守的簡略）

```javascript
const idecoYearly = (idecoMethod === 'pension') ? _idecoBalanceAtStart / idecoPensionYears : 0;
```

例: balance 1200 万、10 年 → 120 万/年（定額）、合計 1200 万

### 新方式（Phase 4f、annuity）

```javascript
// 加重平均利回り（iDeCo 各アセットの annualReturn を残高加重で平均）
function calcIdecoWeightedRate(assets, yearsToIdecoStart) {
  let totalBal = 0, weightedRateSum = 0;
  (assets || []).filter(a => a.type === 'ideco').forEach(a => {
    const rate = ((a.annualReturn != null ? a.annualReturn : (ASSET_TYPES[a.type]?.defaultReturn ?? 4))) / 100;
    const monthly = a.monthly || 0;
    let bal = a.currentVal || 0;
    for (let y = 0; y < yearsToIdecoStart; y++) bal = bal * (1 + rate) + monthly * 12;
    totalBal += bal;
    weightedRateSum += bal * rate;
  });
  return totalBal > 0 ? weightedRateSum / totalBal : 0;
}

// idecoYearly with annuity
const r = _idecoWeightedRate;
const n = idecoPensionYears;
const idecoYearly = (idecoMethod === 'pension')
  ? (r > 0
      ? _idecoBalanceAtStart * r / (1 - Math.pow(1 + r, -n))
      : _idecoBalanceAtStart / n)
  : 0;
```

### 数値例

balance 1200 万、10 年、r=4%:
- annuity: `1200 × 0.04 / (1 − 1.04^-10) = 48 / 0.3244 ≈ 147.95 万/年`
- 合計: 1479.5 万（複利分 +279.5 万）

balance 1200 万、10 年、r=0%:
- フォールバック: `1200 / 10 = 120 万/年`（既存挙動維持）

## 後方互換

- 既存サンプル 5 件はすべて pension method 未指定 → 既存 `idecoMethod !== 'pension'` 経路 → annuity 計算は無効 → snapshot 不変
- 新規ユーザーが pension を選んだ場合は既存より受給額が増える（より実態に近い）

## エラーハンドリング

- `r === 0` → balance / n フォールバック（既存と同じ）
- iDeCo アセットがない → totalBal=0 → r=0 → balance / n（balance も 0）→ 0 万/年
- `idecoPensionYears = 0`（バリデーション後はあり得ないが念のため）→ 既存の `||10` フォールバックで防がれる

## 実装

`calc/retirement.js` の **2 箇所**（`calcRetirementSim` と `calcRetirementSimWithOpts`）両方で：

1. 既存 `_idecoBalanceAtStart`（または `_idecoBalanceAtStartSim`）の reduce ループに、加重平均利回り計算を追加
2. `idecoYearly`（pension 時のみ）の計算式を annuity formula に置換

両関数で同じパターン。

## テスト戦略

`test/regression.test.js` に BUG#11 として追加：

1. annuity rate 計算: 単一 iDeCo asset、known return → 期待 idecoYearly 値
2. annuity rate=0 fallback: return 0% で従来挙動維持（balance/n）
3. 複数 iDeCo asset の加重平均
4. balance × n の合計受給額が balance を超える（複利効果確認）

snapshot 想定: 既存サンプル全件 pension 未指定 → 影響なし

## commit 構成

1. `chore(phase4f): scaffold expected-changes tracking`
2. `fix(phase4f): iDeCo annuity formula with weighted return rate`
3. `docs(phase4f): record actual SHA + walkthrough`

合計 **約 3 commits**（小規模 phase）。

## 完了条件

- [ ] `calc/retirement.js` 2 箇所で annuity formula 適用
- [ ] r=0 フォールバック維持
- [ ] 加重平均利回り計算（複数 iDeCo asset 対応）
- [ ] BUG#11 4 件追加（192 → 196 グリーン）
- [ ] 既存 snapshot 不変
- [ ] `docs/phase4f-fixes/expected-changes.md` 記録
- [ ] サニティウォークスルー B に Phase 4f 評価追記

## Phase 4g 以降の候補

- iDeCo 一時金 + 年金 併用受給
- 5/19 年ルール
- Minor 63 件選別
- 新規 UI 機能（PDF 出力等）
