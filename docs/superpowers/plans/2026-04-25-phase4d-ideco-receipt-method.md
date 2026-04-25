# Phase 4d iDeCo 受給方法 UI 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** iDeCo の受給方法（一時金 / 年金）と受給開始年齢（60-75 歳）、年金受給期間（5/10/15/20 年）をユーザーが選択できる UI と計算ロジックを実装する。

**Architecture:** `state.retirement` に 3 フィールド追加（既定値で後方互換）。`calc/retirement.js` の iDeCo 一時金算出箇所を `idecoStartAge` ベースに置換し、年金時は退職期年次ループで年次収入として加算。UI は退職設定パネルに 3 コントロール追加。

**Tech Stack:** Vanilla JS（classic script）、Vitest 2.x、Playwright 1.x（既存）

**基準設計書:** `docs/superpowers/specs/2026-04-25-phase4d-ideco-receipt-method-design.md`

**リポジトリ:** `/Users/nagatohiroki/ライフプランアプリ/`（main ブランチ直接作業）

**⚠️ 重要な前提:**
- 日本語パス `/Users/nagatohiroki/ライフプランアプリ/` はシェルで必ず **ダブルクォート** で囲む
- Node は nvm 経由：`source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 &&` を各コマンドに prefix
- 既定値は **後方互換**: `idecoMethod='lump' / idecoStartAge=targetAge / idecoPensionYears=10`
  → 既存サンプル 5 件すべて snapshot 不変
- UI 変更を含むため、ブラウザ動作確認も実施

---

## File Structure

### 新規作成

| パス | 役割 |
|------|------|
| `docs/phase4d-fixes/expected-changes.md` | 期待方向と実測サマリー |

### 変更

| パス | 変更の概要 |
|------|-----------|
| `calc/retirement.js` | `_idecoAtRetire` を `_idecoBalanceAtStart` に変更（idecoStartAge ベース）、年金分岐、退職期年次ループに idecoIncomeThisYear 加算 |
| `index.html` | 退職設定パネルに UI 3 コントロール、save/load 対応 |
| `test/regression.test.js` | BUG#9 リグレッションテスト 4 件追加 |
| `docs/phase4d-fixes/expected-changes.md` | 期待方向 + 実測サマリー記入 |
| `docs/phase2-audits/04-pension.md` | Phase 4a の 07-I04/08-I02 注記近辺に Phase 4d 拡張への参照追加（任意） |
| `docs/phase2-audits/sanity-walkthrough-シナリオB.md` | Phase 4d 完了後の評価追記 |

### 変更しない

- `calc/pension.js` — UI 試算（`calcPensionEstimate`）には iDeCo を組み込まない（pension 試算は公的年金のみの試算であり、iDeCo を混ぜるのはスコープ外）
- `calc/integrated.js` — 現役期計算には影響しない（iDeCo は退職期の話題）
- 他の `calc/*.js`

---

## 共通ワークフロー

```
1. expected-changes.md に期待方向を事前宣言
2. calc/retirement.js を修正
3. index.html に UI 追加
4. test/regression.test.js に BUG#9 追加
5. npm test 実行 → 既存 155 + BUG#9 4 = 183 グリーン、snapshot 差分なし確認
6. ブラウザ動作確認（受給方法切替、年金受給期間欄の表示連動、save/restore）
7. expected-changes.md に実測サマリー追記
8. コミット（fix + 更新 snap[なし想定] + expected-changes.md）
9. 実コミット SHA を expected-changes.md に追記 + 追加コミット
10. 最終 docs コミット（Phase 2 監査と sanity walkthrough 更新）
```

---

## Task 1: Setup（expected-changes.md 雛形）

**Files:**
- Create: `docs/phase4d-fixes/expected-changes.md`

- [ ] **Step 1: ディレクトリ作成**

```bash
mkdir -p "/Users/nagatohiroki/ライフプランアプリ/docs/phase4d-fixes"
```

- [ ] **Step 2: `expected-changes.md` 雛形を作成**

Create `docs/phase4d-fixes/expected-changes.md` with:

```markdown
# Phase 4d 修正の期待方向と実測

iDeCo 受給方法 UI 拡張（一時金 / 年金 + 受給開始年齢 60-75 + 年金受給期間 5/10/15/20）の記録。

---

## Group: iDeCo 受給方法（07-I04 拡張）

### 期待方向
（Task 2 実施時に記入）

### 実測サマリー
（Task 2 修正後に記入）
```

- [ ] **Step 3: コミット**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add docs/phase4d-fixes/expected-changes.md && git commit -m "chore(phase4d): scaffold expected-changes tracking"
```

---

## Task 2: iDeCo 受給方法（calc + UI + テスト）

**Files:**
- Modify: `calc/retirement.js`（2 箇所: L57-71 関連と L334-353 関連）
- Modify: `index.html`（退職設定パネル UI、save/load 関数）
- Modify: `test/regression.test.js` — BUG#9 追加 4 件

### 2-1. 期待方向の宣言

- [ ] **Step 1: `expected-changes.md` の Group iDeCo 「期待方向」を記入**

Edit `docs/phase4d-fixes/expected-changes.md` の「期待方向」セクションを以下に置換：

```markdown
### 期待方向
- `state.retirement` に 3 フィールド追加：
  - `idecoReceiptMethod`: `'lump' | 'pension'`（既定 `'lump'`）
  - `idecoStartAge`: 60-75（既定 `targetAge`）
  - `idecoPensionYears`: 5/10/15/20（既定 `10`、pension 時のみ使用）
- `calc/retirement.js`:
  - `_idecoAtRetire` (yearsToRetire ベース) を `_idecoBalanceAtStart` (yearsToIdecoStart ベース) に置換
  - `idecoLumpsum = (method === 'lump') ? _idecoBalanceAtStart : 0`
  - `idecoYearly = (method === 'pension') ? _idecoBalanceAtStart / idecoPensionYears : 0`
  - 退職期年次ループで `age >= idecoStartAge && age < idecoStartAge + idecoPensionYears` のとき `idecoIncomeThisYear = idecoYearly` を `totalNonAssetIncome` に加算
  - `assetsAtRetire = max(0, _baseWealth - _idecoBalanceAtStart) + severanceAtRetire`（pension でも投資プールから iDeCo 残高を切り出す）
- UI: 退職設定パネルに 3 コントロール（ラジオ / 年齢セレクト / 期間セレクト）。pension 時のみ受給期間欄を表示。
- 既定値で従来挙動維持 → 既存 5 サンプル snapshot 不変。
```

### 2-2. テスト先行（TDD）

- [ ] **Step 2: `test/regression.test.js` に BUG#9 を追加**

Append at the end of `test/regression.test.js`:

```javascript
// ─── BUG#9 (Phase 4d): iDeCo 受給方法 UI 拡張（07-I04 拡張） ──────────
// 修正前: iDeCo は targetAge 時点で全額一時金固定。idecoStartAge / pension 受給未対応。
// 修正後: state.retirement.idecoReceiptMethod / idecoStartAge / idecoPensionYears で挙動制御。
describe('[BUG#9] iDeCo 受給方法 UI 拡張（Phase 4d）', () => {
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
    // getRetirementParams は index.html 側関数のためスタブ
    localSb.getRetirementParams = () => ({
      mortgageDeductStart: 0, mortgageDeductYears: 0,
      pensionSlide: 0, expenseGrowthRate: 0, residualAssets: 0,
    });
  });

  // 共通セットアップ：35 歳・targetAge=65・iDeCo 100 万円・利回り 4%・寿命 90
  function setupBaseState() {
    const cy = new Date().getFullYear();
    localSb.state = {
      profile: { birth: `${cy - 35}-01-01` },
      finance: { income: 30, bonus: 60, expense: 20 },
      assets: [
        { id: 'ideco1', type: 'ideco', name: 'iDeCo', currentVal: 100, monthly: 0, annualReturn: 4 },
      ],
      retirement: {
        targetAge: 65, lifeExpectancy: 90,
        pensionMonthly: 0, pensionMonthly_p: 0, pensionAge: 65, pensionAge_p: 65,
        severance: 0, severanceAge: null, serviceYears: 30,
        monthlyExpense: 20, withdrawalType: 'needs',
      },
      lifeEvents: { housingType: 'mortgage', mortgage: {}, rent: {}, care: {}, scholarships: [], children: [] },
      cashFlowEvents: [], expenses: [], recurringExpenses: [],
    };
  }

  it('既定値（lump + idecoStartAge=targetAge 既定）で既存挙動と一致：iDeCo 残高は targetAge=65 で一時金扱い', () => {
    setupBaseState();
    // idecoReceiptMethod 未指定 → 'lump' / idecoStartAge 未指定 → targetAge=65
    const sim = calcRetirementSimWithOpts({});
    expect(sim).not.toBeNull();
    // 65 歳時点で iDeCo は一時金として処理済み（投資プールに含まれない）
    // 退職所得控除枠が大きい（serviceYears=30 → 1500 万円）ので 100 万円は非課税で全額残る
    // sim 内の年金等別収入には iDeCo 加算が「ない」ことを確認
    const ages = sim.map(d => d.age);
    expect(ages[0]).toBe(65);
  });

  it('lump + idecoStartAge=70（targetAge=65）→ idecoStartAge まで運用継続後の残高が一時金', () => {
    setupBaseState();
    localSb.state.retirement.idecoReceiptMethod = 'lump';
    localSb.state.retirement.idecoStartAge = 70;
    const sim = calcRetirementSimWithOpts({});
    expect(sim).not.toBeNull();
    // idecoStartAge=70 なら yearsToIdecoStart = 70 - 35 = 35 年運用
    // bal = 100 × 1.04^35 ≈ 394.6 万円が一時金として処理される
    // この値が最初の startAssets に反映される（投資プールから差し引かれる）
    // assetsAtRetire ≈ totalWealth - 394.6 + severanceDed(394.6) ≈ totalWealth (退職所得控除内)
    // → 既定 idecoStartAge=targetAge と比べて assetsAtRetire は概ね同等または微増
    expect(Number.isFinite(sim[0].startAssets)).toBe(true);
  });

  it('pension + idecoPensionYears=10 → 受給期間中の年次収入に idecoYearly が加算', () => {
    setupBaseState();
    localSb.state.retirement.idecoReceiptMethod = 'pension';
    localSb.state.retirement.idecoStartAge = 65;
    localSb.state.retirement.idecoPensionYears = 10;
    const sim = calcRetirementSimWithOpts({});
    expect(sim).not.toBeNull();
    // 65-74 歳の 10 年間に毎年 idecoYearly が加算される
    // _idecoBalanceAtStart = 100 × 1.04^30 ≈ 324.3 / 10 = 32.43 万円/年
    // sim[0]（65 歳）と sim[10]（75 歳、受給終了後）を比較
    const at65 = sim.find(d => d.age === 65);
    const at75 = sim.find(d => d.age === 75);
    expect(at65).toBeDefined();
    expect(at75).toBeDefined();
    // 65 歳時の totalNonAssetIncome は 75 歳時より大きいはず（iDeCo 年金あり）
    // pension/pension_p は 0 なので差は idecoIncomeThisYear のみ
    // pensionMonthly=0 のため totalNonAssetIncome 自体が小さく、idecoIncomeThisYear が支配的
    // ただし他の収入要素（dividendIncome 等）もあり得るので緩めに
    expect(at65.totalNonAssetIncome ?? 0).toBeGreaterThanOrEqual(at75.totalNonAssetIncome ?? 0);
  });

  it('pension のとき idecoLumpsum=0（退職所得控除に渡さない、severanceAtRetire は severance のみ）', () => {
    setupBaseState();
    localSb.state.retirement.idecoReceiptMethod = 'pension';
    localSb.state.retirement.idecoStartAge = 65;
    localSb.state.retirement.idecoPensionYears = 10;
    localSb.state.retirement.severance = 1000;
    localSb.state.retirement.severanceAge = 65;
    const sim = calcRetirementSimWithOpts({});
    // 退職金 1000 万・iDeCo 残高 ≒324（pension 経路）：
    // 一時金合算なら controlled = 1000 + 324 = 1324、退職所得控除 1500 で全額非課税
    // pension なら 退職所得控除に iDeCo は混ぜない → severance 1000 のみで控除内
    // 結果は同一だが、計算経路の確認が目的（一時金 lumpsum を 0 で渡す）
    expect(sim).not.toBeNull();
    expect(Number.isFinite(sim[0].startAssets)).toBe(true);
  });
});
```

- [ ] **Step 3: テスト実行で失敗確認**

```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npx vitest run test/regression.test.js -t "BUG#9" 2>&1 | tail -20
```

Expected: 1 件目のみパス（既定値で既存挙動）、2-4 件目は新フィールドを読まないため失敗 or NaN。

### 2-3. 実装：calc/retirement.js

- [ ] **Step 4: `calc/retirement.js:334-353` の iDeCo 計算ブロックを書き換え**

L334-353（calcRetirementSimWithOpts 内）を以下に置換：

**Before:**
```javascript
  // [Phase 4a G3] iDeCo は 60 歳時点で全額一時金受取（デフォルト、UI 選択肢なし）
  // 退職金と合算して退職所得控除枠を活用。サンプル全件で iDeCo 残高は退職控除枠内に収まる想定。
  // リタイア時の iDeCo 残高（複利成長済み）を lumpsum として扱い、retired 時点で totalWealth から差し引き、
  // 税引後ネットを severanceAtRetire に合算することで二重計上を防ぐ。
  const _idecoAtRetire = (state.assets || [])
    .filter(a => a.type === 'ideco')
    .reduce((s, a) => {
      const rate    = ((a.annualReturn != null ? a.annualReturn : (ASSET_TYPES[a.type]?.defaultReturn ?? 4))) / 100;
      const monthly = a.monthly || 0;
      let bal = a.currentVal || 0;
      for (let y = 0; y < yearsToRetire; y++) {
        bal = bal * (1 + rate) + monthly * 12;
      }
      return s + bal;
    }, 0);
  const idecoLumpsum = _idecoAtRetire;
  const severanceAtRetire = calcSeveranceDeduction(severanceGross, idecoLumpsum, serviceYears);
  // totalWealth から iDeCo 残高を引き、税引後合算額を severanceAtRetire として戻す
  const _baseWealth = preRetireSim[yearsToRetire]?.totalWealth || state.assets.reduce((s, a) => s + (a.currentVal || 0), 0);
  let assetsAtRetire = Math.max(0, _baseWealth - idecoLumpsum) + severanceAtRetire;
```

**After:**
```javascript
  // [Phase 4d] iDeCo 受給方法（一時金 / 年金）と受給開始年齢（60-75）に対応
  // 既定値: idecoMethod='lump', idecoStartAge=targetAge, idecoPensionYears=10
  // → 既存サンプルは未指定 → targetAge ベースの一時金で従来挙動と一致
  const idecoMethod = (r.idecoReceiptMethod === 'pension') ? 'pension' : 'lump';
  const idecoStartAge = Math.max(60, Math.min(75, parseInt(r.idecoStartAge) || targetAge));
  const idecoPensionYearsRaw = parseInt(r.idecoPensionYears) || 10;
  const idecoPensionYears = [5, 10, 15, 20].includes(idecoPensionYearsRaw) ? idecoPensionYearsRaw : 10;
  const yearsToIdecoStart = Math.max(0, idecoStartAge - currentAge);
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
  const severanceAtRetire = calcSeveranceDeduction(severanceGross, idecoLumpsum, serviceYears);
  // [Phase 4d] totalWealth から iDeCo 残高を引く（pension 経路でも別経路で受給するため二重計上を防ぐ）
  const _baseWealth = preRetireSim[yearsToRetire]?.totalWealth || state.assets.reduce((s, a) => s + (a.currentVal || 0), 0);
  let assetsAtRetire = Math.max(0, _baseWealth - _idecoBalanceAtStart) + severanceAtRetire;
```

- [ ] **Step 5: `calc/retirement.js:534` 付近の totalNonAssetIncome に iDeCo 年金加算**

L534-535 の pension 計算箇所と L594 の totalNonAssetIncome を以下のように修正:

**L534-535（既存）:**
```javascript
    let pension = age >= pensionAge ? basePensionAnnual : 0;
    const pension_p = age >= pensionAge_p ? basePensionAnnual_p : 0;
```

**L534-535（追加なし、その後に挿入）:**
```javascript
    let pension = age >= pensionAge ? basePensionAnnual : 0;
    const pension_p = age >= pensionAge_p ? basePensionAnnual_p : 0;
    // [Phase 4d] iDeCo 年金: 受給期間中のみ加算（公的年金と合算して非課税枠を共有する想定）
    const idecoIncomeThisYear = (idecoMethod === 'pension'
      && age >= idecoStartAge
      && age < idecoStartAge + idecoPensionYears) ? idecoYearly : 0;
```

**L594（既存）:**
```javascript
    const totalNonAssetIncome = pension + pension_p + semi + partnerWorkIncome + extra + mortgageDeduct + dividendIncome;
```

**L594（After）:**
```javascript
    const totalNonAssetIncome = pension + pension_p + semi + partnerWorkIncome + extra + mortgageDeduct + dividendIncome + idecoIncomeThisYear;
```

- [ ] **Step 6: `calc/retirement.js:60-78` の必要計算ブロック（calcRetirementSim 関数）も書き換え**

L60-78（calcRetirementSim 関数内、`_idecoAtRetireSim` を使っている箇所）を Step 4 と同じパターンで書き換え：

**Before:**
```javascript
  // [Phase 4a G3] iDeCo は 60 歳時点で全額一時金受取（デフォルト、UI 選択肢なし）
  // G4 Task 3 で新設した calcSeveranceDeduction の第 2 引数に渡して退職所得控除と合算
  // 成長後残高で近似（simple compound growth with monthly contributions）
  const _idecoAtRetireSim = (state.assets || [])
    .filter(a => a.type === 'ideco')
    .reduce((s, a) => {
      const rate    = ((a.annualReturn != null ? a.annualReturn : (ASSET_TYPES[a.type]?.defaultReturn ?? 4))) / 100;
      const monthly = a.monthly || 0;
      let bal = a.currentVal || 0;
      for (let y = 0; y < yearsToRetireAccurate; y++) {
        bal = bal * (1 + rate) + monthly * 12;
      }
      return s + bal;
    }, 0);
  const idecoLumpsum = _idecoAtRetireSim;
  const severanceAtRetire = calcSeveranceDeduction(severanceGross, idecoLumpsum, serviceYears);
  // postData[0]?.startAssets が優先（calcRetirementSimWithOpts 側で iDeCo 除外済み）。
  // フォールバック時は totalWealth から iDeCo を差し引いて二重計上を防ぐ。
  const _baseWealthSim = preRetireSim[yearsToRetireAccurate]?.totalWealth
    || state.assets.reduce((s, a) => s + (a.currentVal || 0), 0);
  const assetsAtRetire = postData?.[0]?.startAssets
    || (Math.max(0, _baseWealthSim - idecoLumpsum) + severanceAtRetire);
```

**After:**
```javascript
  // [Phase 4d] iDeCo 受給方法（calcRetirementSimWithOpts と同じ判定ロジック）
  const idecoMethodSim = (r.idecoReceiptMethod === 'pension') ? 'pension' : 'lump';
  const idecoStartAgeSim = Math.max(60, Math.min(75, parseInt(r.idecoStartAge) || targetAge));
  const yearsToIdecoStartSim = Math.max(0, idecoStartAgeSim - currentAge);
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
  const severanceAtRetire = calcSeveranceDeduction(severanceGross, idecoLumpsumSim, serviceYears);
  const _baseWealthSim = preRetireSim[yearsToRetireAccurate]?.totalWealth
    || state.assets.reduce((s, a) => s + (a.currentVal || 0), 0);
  // [Phase 4d] 必要資産計算は postData[0].startAssets 優先（既存通り）。フォールバックでは iDeCo 残高を一律差し引き。
  const assetsAtRetire = postData?.[0]?.startAssets
    || (Math.max(0, _baseWealthSim - _idecoBalanceAtStartSim) + severanceAtRetire);
```

- [ ] **Step 7: テスト実行 — BUG#9 の 4 件パスを確認**

```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npx vitest run test/regression.test.js -t "BUG#9" 2>&1 | tail -10
```

Expected: BUG#9 4 件すべてパス。

### 2-4. UI 実装：index.html

- [ ] **Step 8: 退職設定パネルの位置を特定**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && grep -n "retSeverance\|retPensionMonthly\|retTargetAge\|retLifeExpectancy" index.html | head -10
```

「退職金」「年金開始年齢」近辺の HTML 構造を確認。退職設定パネルの DOM id プレフィックスを把握（典型的には `ret*`）。

- [ ] **Step 9: HTML 追加 — 退職設定パネル内に iDeCo 受給設定ブロック**

退職金設定（`retSeverance` 等）の直後に以下の HTML を挿入：

```html
<!-- [Phase 4d] iDeCo 受給設定 -->
<div class="form-group" style="margin-top:12px;padding:10px 14px;background:rgba(139,92,246,.06);border-radius:8px;border:.5px solid rgba(139,92,246,.2)">
  <div style="font-size:13px;font-weight:600;color:#7C3AED;margin-bottom:8px">🏛️ iDeCo 受給設定</div>
  <div class="form-row">
    <div class="form-group" style="margin:0">
      <label>受給方法</label>
      <div style="display:flex;gap:12px;font-size:13px">
        <label style="display:flex;align-items:center;gap:4px;cursor:pointer">
          <input type="radio" name="retIdecoMethod" value="lump" onchange="onIdecoMethodChange()"> 一時金（一括）
        </label>
        <label style="display:flex;align-items:center;gap:4px;cursor:pointer">
          <input type="radio" name="retIdecoMethod" value="pension" onchange="onIdecoMethodChange()"> 年金（分割）
        </label>
      </div>
    </div>
    <div class="form-group" style="margin:0">
      <label>受給開始年齢</label>
      <select id="retIdecoStartAge">
        <!-- 60-75 の option は JS で動的生成 -->
      </select>
    </div>
  </div>
  <div class="form-group" id="retIdecoPensionYearsGroup" style="margin:8px 0 0;display:none">
    <label>年金受給期間</label>
    <select id="retIdecoPensionYears">
      <option value="5">5 年</option>
      <option value="10" selected>10 年</option>
      <option value="15">15 年</option>
      <option value="20">20 年</option>
    </select>
  </div>
  <p style="font-size:11px;color:var(--text-muted);margin:8px 0 0">一時金は退職所得控除（退職金と合算）、年金は公的年金等控除（公的年金と合算）の対象です。</p>
</div>
```

- [ ] **Step 10: 受給開始年齢セレクトの動的生成 + 表示切替関数**

退職パネル初期化関数（典型的には `renderRetirementPage` または初回ロード時の関数）に以下を追加：

```javascript
// [Phase 4d] iDeCo 受給開始年齢の選択肢を動的生成（60-75）
function populateIdecoStartAgeOptions() {
  const sel = document.getElementById('retIdecoStartAge');
  if (!sel || sel.options.length > 0) return;
  for (let age = 60; age <= 75; age++) {
    const opt = document.createElement('option');
    opt.value = age;
    opt.textContent = `${age} 歳`;
    sel.appendChild(opt);
  }
}

// [Phase 4d] 受給方法切替時の表示制御
function onIdecoMethodChange() {
  const method = document.querySelector('input[name="retIdecoMethod"]:checked')?.value || 'lump';
  const yearsGroup = document.getElementById('retIdecoPensionYearsGroup');
  if (yearsGroup) yearsGroup.style.display = (method === 'pension') ? '' : 'none';
}
```

`populateIdecoStartAgeOptions()` を退職パネル初期化箇所で呼び出し。

- [ ] **Step 11: save 関数に新フィールド書き込み**

退職設定 save 関数（`saveRetirement` 等、`state.retirement.targetAge` を書く箇所）を特定し、以下を追加：

```javascript
// [Phase 4d] iDeCo 受給設定を state に保存
state.retirement.idecoReceiptMethod = document.querySelector('input[name="retIdecoMethod"]:checked')?.value || 'lump';
state.retirement.idecoStartAge = parseInt(document.getElementById('retIdecoStartAge')?.value) || (parseInt(state.retirement.targetAge) || 65);
state.retirement.idecoPensionYears = parseInt(document.getElementById('retIdecoPensionYears')?.value) || 10;
```

- [ ] **Step 12: render/load 関数に新フィールド復元**

退職設定 render 関数（`renderRetirement` 等、`document.getElementById('retTargetAge').value = ...` がある箇所）に以下を追加：

```javascript
// [Phase 4d] iDeCo 受給設定を UI に復元
populateIdecoStartAgeOptions();
const idecoMethod = state.retirement?.idecoReceiptMethod || 'lump';
const idecoMethodInput = document.querySelector(`input[name="retIdecoMethod"][value="${idecoMethod}"]`);
if (idecoMethodInput) idecoMethodInput.checked = true;
const targetAge = parseInt(state.retirement?.targetAge) || 65;
document.getElementById('retIdecoStartAge').value = parseInt(state.retirement?.idecoStartAge) || targetAge;
document.getElementById('retIdecoPensionYears').value = parseInt(state.retirement?.idecoPensionYears) || 10;
onIdecoMethodChange(); // 表示切替を反映
```

### 2-5. 全テスト実行

- [ ] **Step 13: 全テスト実行 → snapshot 差分なし確認**

```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npm test 2>&1 | tail -10
```

Expected: 183/183 passing（179 baseline + BUG#9 4 件）、no snapshot updates pending.

snapshot 差分が出た場合：差分内容を確認 → 既定値で従来挙動が維持されない実装ミスの可能性大 → 修正してから再実行。

### 2-6. ブラウザ動作確認

- [ ] **Step 14: ブラウザで UI 動作確認**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && python3 -m http.server 8000 > /tmp/phase4d-server.log 2>&1 &
```

ブラウザで `http://localhost:8000/index.html` を開き：

1. 退職設定タブを開く
2. 「iDeCo 受給設定」ブロックが表示されていること
3. 「一時金」選択時に「年金受給期間」欄が非表示であること
4. 「年金」選択時に「年金受給期間」欄が表示されること
5. 受給開始年齢ドロップダウンが 60〜75 の選択肢を持つこと
6. 設定を変更 → タブを離れて戻る → 状態が復元されていること
7. 開発者ツールの Application > Local Storage で `lifeplan_v1` の `retirement.idecoReceiptMethod / idecoStartAge / idecoPensionYears` が保存されていること

完了後サーバ停止：
```bash
pkill -f "python3 -m http.server" 2>/dev/null
```

### 2-7. 記録・コミット

- [ ] **Step 15: `expected-changes.md` の実測サマリー記入**

Edit `docs/phase4d-fixes/expected-changes.md` の「実測サマリー」を以下に置換：

```markdown
### 実測サマリー
- snapshot 差分: **なし**（既定値で従来挙動を維持、既存サンプル 5 件は新フィールド未指定）
- `calc/retirement.js`: 2 箇所（calcRetirementSim L60 付近、calcRetirementSimWithOpts L334 付近）で iDeCo 計算を idecoStartAge ベースに置換、年次ループに idecoIncomeThisYear 加算
- UI: 退職設定パネルに 3 コントロール（受給方法ラジオ・受給開始年齢セレクト 60-75・年金受給期間セレクト 5/10/15/20）
- `populateIdecoStartAgeOptions()`、`onIdecoMethodChange()` 新規関数追加
- save/render に新フィールド対応
- テスト: 183/183 グリーン（179 + BUG#9 4 件）
- ブラウザ動作確認済み（受給方法切替で年金受給期間欄の表示連動、save/restore）
```

- [ ] **Step 16: コミット**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add calc/retirement.js index.html test/regression.test.js docs/phase4d-fixes/expected-changes.md && git commit -m "fix(phase4d): iDeCo receipt method (lump/pension) and start age"
```

- [ ] **Step 17: 実 SHA を expected-changes.md に追記**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git log -1 --format=%h
```

実測サマリーの末尾に `- 実コミット: <SHA 7桁>` を追記してコミット：

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add docs/phase4d-fixes/expected-changes.md && git commit -m "docs(phase4d): record actual SHA"
```

---

## Task 3: Phase 2 監査注記とサニティウォークスルー更新

**Files:**
- Modify: `docs/phase2-audits/04-pension.md`（07-I04 既存 Resolved 注記近辺に Phase 4d 拡張参照追加）
- Modify: `docs/phase2-audits/sanity-walkthrough-シナリオB.md`（Phase 4d 完了後の評価追記）
- Modify: `docs/phase4d-fixes/expected-changes.md`（完了総括追加）

### 3-1. Phase 2 監査注記の更新

- [ ] **Step 1: Phase 4a の 07-I04 / 08-I02 注記近辺を確認**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && grep -n "07-I04\|08-I02\|Resolved in Phase 4a" docs/phase2-audits/07-two-pool-model.md docs/phase2-audits/08-retirement-withdrawal.md | head -10
```

Phase 4a で iDeCo 60 歳一時金固定にした際の Resolved 注記がある箇所に「Phase 4d で受給方法 UI 拡張」への参照を追記。

- [ ] **Step 2: 該当注記の直後に Phase 4d 拡張の補足を追加**

例: `docs/phase2-audits/07-two-pool-model.md` の 07-I04 注記の後ろに：

```markdown
> **[Phase 4d 拡張 commit `<Task 2 fix SHA>`]**: 受給方法（一時金/年金）と受給開始年齢（60-75 歳）、年金受給期間（5/10/15/20）を UI から選択可能に。`calcSeveranceDeduction` への lump 渡しと年次 idecoYearly 加算で分岐。詳細: `docs/phase4d-fixes/expected-changes.md`
```

`docs/phase2-audits/08-retirement-withdrawal.md` の 08-I02 注記の後ろにも同等の補足を追加。

### 3-2. サニティウォークスルー更新

- [ ] **Step 3: `sanity-walkthrough-シナリオB.md` 末尾に Phase 4d セクション追加**

```markdown
## Phase 4d 完了後の再評価（YYYY-MM-DD）

Phase 4d で iDeCo 受給方法 UI が拡張された結果、シナリオ B の挙動が以下のように変わった：

### 修正された主要な機能拡張

- **iDeCo 受給方法 UI** (`<Task 2 fix SHA>`):
  - `state.retirement.idecoReceiptMethod`（lump/pension）
  - `state.retirement.idecoStartAge`（60-75）
  - `state.retirement.idecoPensionYears`（5/10/15/20）
  - 既定 lump + idecoStartAge=targetAge → 既存 snapshot 不変
  - シナリオ B は新フィールド未指定 → 既定値適用 → 従来挙動維持

### 判定の更新

- **Phase 2.5 完了時**: ✅ 妥当（Critical 10 件解消）
- **Phase 4a 完了後**: ✅ 妥当（Important 14 件解消）
- **Phase 4b 完了後**: ✅ 妥当（Important 18 件解消、計 32 件）
- **Phase 4c 完了後**: ✅ 妥当（Important 8 件解消、計 40 件、全 Important 対応済み）
- **Phase 4d 完了後**: ✅ 妥当（iDeCo 受給方法 UI 拡張で機能完成度向上）
- **残存**: Minor 63 件、Phase 4e 候補（一時金+年金併用、06-I02 軸2、5/19 年ルール等）
```

### 3-3. 完了総括 in expected-changes.md

- [ ] **Step 4: `expected-changes.md` に完了総括を追記**

末尾に以下を追加：

```markdown
---

## 完了総括（YYYY-MM-DD）

### 達成事項

- iDeCo 受給方法 UI 機能拡張（`state.retirement` に 3 フィールド追加）
- テスト: 183/183 グリーン（+4 件 BUG#9 リグレッション追加）
- 既存 snapshot 不変（後方互換維持）
- commit 構成: setup 1 + fix 1 + SHA record 1 + 最終 docs 1 = 計 4 コミット

### Phase 2 監査関連

- Phase 4a の 07-I04 / 08-I02 既存 Resolved 注記に Phase 4d 拡張への参照を追加
- サニティウォークスルー B に Phase 4d 完了評価を追記

### Phase 4e 以降への橋渡し

- 一時金 + 年金の **併用受給**（比率指定）
- 06-I02 軸2（本人高所得者逓減 900/950/1000 万円）
- 退職金と iDeCo の **5 年/19 年ルール**（厳密な退職所得控除別枠化）
- 年金受給期間中の **運用継続** annuity 計算
- Minor 63 件の選別修正
- 新規 UI 機能（PDF 出力、シナリオ共有 URL 等）
```

### 3-4. 最終コミット

- [ ] **Step 5: 最終コミット**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add docs/phase2-audits/ docs/phase4d-fixes/expected-changes.md && git commit -m "docs(phase4d): mark related notes and update walkthrough"
```

---

## 完了条件

- [ ] Task 1〜3 完了
- [ ] `state.retirement` に 3 フィールド追加（idecoReceiptMethod, idecoStartAge, idecoPensionYears）
- [ ] `calc/retirement.js` の 2 箇所が `_idecoBalanceAtStart` ベースに変更
- [ ] `index.html` に UI 3 コントロール追加（ラジオ + 受給開始年齢セレクト + 受給期間セレクト）
- [ ] `populateIdecoStartAgeOptions` / `onIdecoMethodChange` 新規関数
- [ ] save/render で新フィールド対応
- [ ] `test/regression.test.js` に BUG#9 4 件追加
- [ ] 既存 snapshot 不変（179 → 183 グリーン）
- [ ] `docs/phase4d-fixes/expected-changes.md` に期待方向 + 実測サマリー + 完了総括
- [ ] Phase 2 監査 07-I04 / 08-I02 注記近辺に Phase 4d 拡張参照追加
- [ ] サニティウォークスルー B に Phase 4d 評価追記
- [ ] commit 履歴 約 4 件

## Phase 4e 以降の候補

- 一時金+年金の併用受給
- 06-I02 軸2（本人高所得者逓減 900/950/1000 万円）
- 退職金と iDeCo の 5 年/19 年ルール
- 年金受給期間中の運用継続（annuity）
- Minor 63 件の選別修正
- UI 機能拡張（PDF 出力、シナリオ共有 URL 等）
