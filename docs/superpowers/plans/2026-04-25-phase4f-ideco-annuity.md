# Phase 4f iDeCo Annuity 計算 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** iDeCo 年金受給時の年額計算を annuity formula に置換、利回り考慮で精度向上。

**Architecture:** `calc/retirement.js` の 2 箇所で `idecoYearly = balance/n` を `balance × r / (1 - (1+r)^-n)` に変更（r=0 フォールバック維持）。加重平均利回りを iDeCo アセット群から計算。

**Tech Stack:** Vanilla JS、Vitest 2.x

**基準設計書:** `docs/superpowers/specs/2026-04-25-phase4f-ideco-annuity-design.md`

**リポジトリ:** `/Users/nagatohiroki/ライフプランアプリ/`（main ブランチ直接作業）

**前提:**
- 日本語パス は **ダブルクォート** で囲む
- Node nvm prefix: `source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 &&`
- 既存サンプル 5 件は pension method 未指定 → snapshot 不変

---

## File Structure

### 新規

| パス | 役割 |
|------|------|
| `docs/phase4f-fixes/expected-changes.md` | 期待方向と実測サマリー |

### 変更

| パス | 変更概要 |
|------|---------|
| `calc/retirement.js` | 2 箇所（calcRetirementSim L57- と calcRetirementSimWithOpts L334- 付近）で加重平均利回り + annuity formula 適用 |
| `test/regression.test.js` | BUG#11 リグレッションテスト 4 件 |
| `docs/phase2-audits/sanity-walkthrough-シナリオB.md` | Phase 4f 完了評価追記 |

### 変更しない

- `index.html`（UI 変更なし）
- 他の `calc/*.js`

---

## Task 1: Setup

- [ ] **Step 1: ディレクトリ作成 + 雛形**

```bash
mkdir -p "/Users/nagatohiroki/ライフプランアプリ/docs/phase4f-fixes"
```

Create `docs/phase4f-fixes/expected-changes.md`:

```markdown
# Phase 4f 修正の期待方向と実測

iDeCo 年金受給時の運用継続（annuity 計算）の実装記録。

---

## Group: iDeCo Annuity 計算

### 期待方向
（Task 2 実施時に記入）

### 実測サマリー
（Task 2 修正後に記入）
```

- [ ] **Step 2: コミット**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add docs/phase4f-fixes/expected-changes.md && git commit -m "chore(phase4f): scaffold expected-changes tracking"
```

---

## Task 2: Annuity 実装 + tests

### 2-1. 期待方向

- [ ] **Step 1: expected-changes.md の期待方向を記入**

Replace placeholder:
```markdown
### 期待方向
- `calc/retirement.js` 2 箇所で iDeCo 加重平均利回り計算を追加
- 年金時 idecoYearly を annuity formula に変更:
  - r > 0: `idecoYearly = balance × r / (1 − (1+r)^-n)`
  - r === 0: balance / n（既存フォールバック）
- 既存サンプル全件 pension method 未指定 → snapshot 不変
- 新規受給ユーザーは複利効果分（4% × 10 年で約 +23%）受給額増
```

### 2-2. テスト先行

- [ ] **Step 2: BUG#11 4 件追加**

Append at the END of test/regression.test.js:

```javascript
// ─── BUG#11 (Phase 4f): iDeCo 年金受給時の annuity 計算 ──────────
// 修正前: idecoYearly = balance / pensionYears（運用無視で保守的）
// 修正後: annuity formula = balance × r / (1 − (1+r)^-n)、r=0 フォールバック
describe('[BUG#11] iDeCo annuity 計算（Phase 4f）', () => {
  let calcRetirementSimWithOpts, localSb;
  beforeAll(() => {
    loadCalc('utils.js');
    loadCalc('asset-growth.js');
    loadCalc('income-expense.js');
    loadCalc('life-events.js');
    loadCalc('mortgage.js');
    loadCalc('pension.js');
    loadCalc('integrated.js');
    loadCalc('retirement.js');
    localSb = getSandbox();
    calcRetirementSimWithOpts = localSb.calcRetirementSimWithOpts;
    localSb.getRetirementParams = () => ({
      mortgageDeductStart: 0, mortgageDeductYears: 0,
      pensionSlide: 0, expenseGrowthRate: 0, residualAssets: 0,
    });
  });

  function setupBaseState(idecoReturn = 4) {
    const cy = new Date().getFullYear();
    localSb.state = {
      profile: { birth: `${cy - 35}-01-01` },
      finance: { income: 30, bonus: 60, expense: 20 },
      assets: [
        { id: 'ideco1', type: 'ideco', name: 'iDeCo', currentVal: 100, monthly: 0, annualReturn: idecoReturn },
      ],
      retirement: {
        targetAge: 65, lifeExpectancy: 90,
        pensionMonthly: 0, pensionMonthly_p: 0, pensionAge: 65, pensionAge_p: 65,
        severance: 0, severanceAge: null, serviceYears: 30,
        monthlyExpense: 20, withdrawalType: 'needs',
        idecoReceiptMethod: 'pension', idecoStartAge: 65, idecoPensionYears: 10,
      },
      lifeEvents: { housingType: 'mortgage', mortgage: {}, rent: {}, care: {}, scholarships: [], children: [] },
      cashFlowEvents: [], expenses: [], recurringExpenses: [],
    };
  }

  it('annuity formula: r=4%, balance ≈ 324（30 年複利）, n=10 → idecoYearly ≈ 39.99', () => {
    setupBaseState(4);
    const sim = calcRetirementSimWithOpts({});
    const at65 = sim.find(d => d.age === 65);
    // balance = 100 × 1.04^30 ≈ 324.34
    // annuity: 324.34 × 0.04 / (1 - 1.04^-10) ≈ 324.34 × 0.04 / 0.3244 ≈ 39.99
    // pensionMonthly=0, pensionMonthly_p=0 のため totalNonAssetIncome は idecoIncomeThisYear 主体
    // dividendIncome は 0（iDeCo は dividendYield なし）
    expect(at65.totalNonAssetIncome ?? 0).toBeGreaterThan(35);
    expect(at65.totalNonAssetIncome ?? 0).toBeLessThan(45);
  });

  it('annuity r=0% fallback: balance / n（既存挙動）', () => {
    setupBaseState(0);
    const sim = calcRetirementSimWithOpts({});
    const at65 = sim.find(d => d.age === 65);
    // r=0 なら fallback: balance=100（成長なし）/ 10 = 10
    expect(at65.totalNonAssetIncome ?? 0).toBeGreaterThanOrEqual(9);
    expect(at65.totalNonAssetIncome ?? 0).toBeLessThanOrEqual(11);
  });

  it('受給期間中の合計受給額 > balance（複利効果確認）', () => {
    setupBaseState(4);
    const sim = calcRetirementSimWithOpts({});
    // 65-74 歳の 10 年間の totalNonAssetIncome 合計
    let total = 0;
    for (let age = 65; age <= 74; age++) {
      const row = sim.find(d => d.age === age);
      if (row) total += row.totalNonAssetIncome || 0;
    }
    // balance ≈ 324、annuity 合計 ≈ 399.9 → balance より大
    expect(total).toBeGreaterThan(324);
  });

  it('受給期間外（75 歳以降）は idecoIncomeThisYear=0', () => {
    setupBaseState(4);
    const sim = calcRetirementSimWithOpts({});
    const at75 = sim.find(d => d.age === 75);
    // pensionMonthly=0 + pension_p=0 + ideco 受給終了 → totalNonAssetIncome は他の小さい要素のみ
    expect(at75.totalNonAssetIncome ?? 0).toBeLessThan(5);
  });
});
```

- [ ] **Step 3: テスト失敗確認**

```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npx vitest run test/regression.test.js -t "BUG#11" 2>&1 | tail -15
```

Expected: 1 件目失敗（既存 balance/n=32.4 で範囲外）、3 件目失敗（合計≈324 で balance と等しい）、2/4 件目はパスの可能性あり。

### 2-3. 実装

- [ ] **Step 4: `calc/retirement.js` の 2 箇所変更**

#### 4a. calcRetirementSim（L57-78 付近）

既存 `_idecoBalanceAtStartSim` の reduce ブロックを、加重平均利回り計算と一体化させる：

Find the existing block in `calcRetirementSim`:
```javascript
  const _idecoBalanceAtStartSim = (state.assets || [])
    .filter(a => a.type === 'ideco')
    .reduce((s, a) => {
      const rate    = ((a.annualReturn != null ? a.annualReturn : (ASSET_TYPES[a.type]?.defaultReturn ?? 4))) / 100;
      const monthly = a.monthly || 0;
      let bal = a.currentVal || 0;
      for (let y = 0; y < yearsToIdecoStartSim; y++) {
        bal = bal * (1 + rate) + monthly * 12;
      }
      return s + bal;
    }, 0);
  const idecoLumpsumSim = (idecoMethodSim === 'lump') ? _idecoBalanceAtStartSim : 0;
```

Replace with:
```javascript
  // [Phase 4f] iDeCo 残高と加重平均利回りを同時計算（annuity 用）
  const _idecoStatsSim = (state.assets || [])
    .filter(a => a.type === 'ideco')
    .reduce((acc, a) => {
      const rate    = ((a.annualReturn != null ? a.annualReturn : (ASSET_TYPES[a.type]?.defaultReturn ?? 4))) / 100;
      const monthly = a.monthly || 0;
      let bal = a.currentVal || 0;
      for (let y = 0; y < yearsToIdecoStartSim; y++) {
        bal = bal * (1 + rate) + monthly * 12;
      }
      return { totalBal: acc.totalBal + bal, weightedRateSum: acc.weightedRateSum + bal * rate };
    }, { totalBal: 0, weightedRateSum: 0 });
  const _idecoBalanceAtStartSim = _idecoStatsSim.totalBal;
  const _idecoWeightedRateSim = _idecoStatsSim.totalBal > 0 ? _idecoStatsSim.weightedRateSum / _idecoStatsSim.totalBal : 0;
  const idecoLumpsumSim = (idecoMethodSim === 'lump') ? _idecoBalanceAtStartSim : 0;
```

(`calcRetirementSim` は idecoYearly を計算しないため、ここでは weightedRate は集計だけ。実際の年金加算は calcRetirementSimWithOpts 内の年次ループ。)

#### 4b. calcRetirementSimWithOpts（L334-353 付近）

Find the existing block:
```javascript
  const _idecoBalanceAtStart = (state.assets || [])
    .filter(a => a.type === 'ideco')
    .reduce((s, a) => {
      const rate    = ((a.annualReturn != null ? a.annualReturn : (ASSET_TYPES[a.type]?.defaultReturn ?? 4))) / 100;
      const monthly = a.monthly || 0;
      let bal = a.currentVal || 0;
      for (let y = 0; y < yearsToIdecoStart; y++) {
        bal = bal * (1 + rate) + monthly * 12;
      }
      return s + bal;
    }, 0);
  // [Phase 4d] 一時金は退職所得控除に渡し、年金は 0 を渡す（控除に含めない）
  const idecoLumpsum = (idecoMethod === 'lump') ? _idecoBalanceAtStart : 0;
  const idecoYearly = (idecoMethod === 'pension') ? _idecoBalanceAtStart / idecoPensionYears : 0;
```

Replace with:
```javascript
  // [Phase 4f] iDeCo 残高と加重平均利回りを同時計算（annuity 用）
  const _idecoStats = (state.assets || [])
    .filter(a => a.type === 'ideco')
    .reduce((acc, a) => {
      const rate    = ((a.annualReturn != null ? a.annualReturn : (ASSET_TYPES[a.type]?.defaultReturn ?? 4))) / 100;
      const monthly = a.monthly || 0;
      let bal = a.currentVal || 0;
      for (let y = 0; y < yearsToIdecoStart; y++) {
        bal = bal * (1 + rate) + monthly * 12;
      }
      return { totalBal: acc.totalBal + bal, weightedRateSum: acc.weightedRateSum + bal * rate };
    }, { totalBal: 0, weightedRateSum: 0 });
  const _idecoBalanceAtStart = _idecoStats.totalBal;
  const _idecoWeightedRate = _idecoStats.totalBal > 0 ? _idecoStats.weightedRateSum / _idecoStats.totalBal : 0;
  // [Phase 4d] 一時金は退職所得控除に渡し、年金は 0 を渡す（控除に含めない）
  const idecoLumpsum = (idecoMethod === 'lump') ? _idecoBalanceAtStart : 0;
  // [Phase 4f] 年金額は annuity formula で算出（受給期間中の運用継続を反映）。r=0 は balance/n フォールバック。
  const idecoYearly = (idecoMethod === 'pension')
    ? (_idecoWeightedRate > 0
        ? _idecoBalanceAtStart * _idecoWeightedRate / (1 - Math.pow(1 + _idecoWeightedRate, -idecoPensionYears))
        : _idecoBalanceAtStart / idecoPensionYears)
    : 0;
```

- [ ] **Step 5: テスト全件パス確認**

```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npm test 2>&1 | tail -10
```

Expected: 196/196 グリーン（192 + BUG#11 4 件）、no snapshot updates pending.

If snapshot changes, STOP — defaults aren't preserving back-compat (samples don't use pension method).

### 2-4. 記録・コミット

- [ ] **Step 6: 実測サマリー記入**

```markdown
### 実測サマリー
- snapshot 差分: **なし**（既存サンプル全件 pension method 未指定）
- `calc/retirement.js` 2 箇所で `_idecoStats` reduce + annuity formula 適用
- 加重平均利回り計算は残高 reduce と一体化（パフォーマンス影響なし）
- テスト: 196/196 グリーン（192 + BUG#11 4 件）
```

- [ ] **Step 7: コミット**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add calc/retirement.js test/regression.test.js docs/phase4f-fixes/expected-changes.md && git commit -m "fix(phase4f): iDeCo annuity formula with weighted return rate"
```

---

## Task 3: 完了総括 + サニティ更新

### 3-1. サニティウォークスルー

- [ ] **Step 1: サニティウォークスルーに Phase 4f セクション追加**

Edit `docs/phase2-audits/sanity-walkthrough-シナリオB.md`. Append at end:

```markdown

## Phase 4f 完了後の再評価（2026-04-25）

Phase 4f で iDeCo 年金受給時の annuity 計算が実装され、運用継続を反映した精度向上：

### 修正された主要な機能拡張

- **iDeCo Annuity 計算** (`<Task 2 fix SHA>`):
  - 年金時 `idecoYearly` を `balance × r / (1 − (1+r)^-n)` に変更
  - r=0 フォールバック維持（既存挙動）
  - 加重平均利回りを iDeCo アセット群から計算（複数 asset 対応）
  - 例: balance 1200 万 × 4% × 10 年 → 既存 120 → 新 約 148 万/年（+23%）
  - シナリオ B は pension method 未指定 → snapshot 不変

### 判定の更新

- **Phase 4e 完了後**: ✅ 妥当（配偶者控除 3 軸完全実装）
- **Phase 4f 完了後**: ✅ 妥当（iDeCo 年金額の精度向上、複利効果反映）
- **残存**: Minor 63 件、Phase 4g 候補（iDeCo 一時金+年金併用、5/19 年ルール、UI 機能拡張等）
```

### 3-2. 完了総括

- [ ] **Step 2: expected-changes.md に完了総括追加**

```markdown

---

## 完了総括（2026-04-25）

### 達成事項

- iDeCo 年金受給時の annuity 計算実装（年金現価係数式）
- 加重平均利回り計算（複数 iDeCo asset 対応）
- r=0 フォールバック維持（後方互換）
- テスト: 196/196 グリーン（+4 件 BUG#11）
- 既存 snapshot 不変
- commit 構成: setup 1 + fix 1 + 最終 docs 1 = 計 3 コミット

### 設計上の選択

- 加重平均利回りは **アセット個別の `annualReturn`** をベースに計算（年金受給期間専用の rate ではなく、accumulation 期と同じ rate 系を使用）
- r=0 のとき balance/n フォールバック（既存 Phase 4d 挙動を保持）

### Phase 4g 以降への橋渡し

- iDeCo 一時金 + 年金 併用受給（比率指定）
- 5/19 年ルール（厳密な退職所得控除別枠化）
- Minor 63 件選別
- 新規 UI 機能（PDF 出力、シナリオ共有 URL 等）
```

### 3-3. 最終コミット

- [ ] **Step 3: 最終コミット**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add docs/phase2-audits/sanity-walkthrough-シナリオB.md docs/phase4f-fixes/expected-changes.md && git commit -m "docs(phase4f): record completion summary and update walkthrough"
```

---

## 完了条件

- [ ] Task 1〜3 完了
- [ ] `calc/retirement.js` 2 箇所 annuity 適用
- [ ] BUG#11 4 件追加（192 → 196 グリーン）
- [ ] 既存 snapshot 不変
- [ ] commit 履歴 3 件
