# Phase 4g iDeCo 一時金+年金 併用受給 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** iDeCo 受給方法に「併用」（mixed）を追加。一時金部分は退職所得控除、年金部分は annuity formula で計算。

**Architecture:** `state.retirement` に `idecoLumpRatio` (0-100) を追加。`idecoReceiptMethod` に `'mixed'` 値を追加。`calc/retirement.js` 2 箇所で mixed 分岐を追加し、idecoLumpsum と _idecoPensionPortion を比率分割。`index.html` の 2-radio を 3-radio に拡張、比率入力欄を mixed 時のみ表示。

**Tech Stack:** Vanilla JS、Vitest 2.x

**基準設計書:** `docs/superpowers/specs/2026-04-25-phase4g-ideco-mixed-receipt-design.md`

**リポジトリ:** `/Users/nagatohiroki/ライフプランアプリ/`（main ブランチ直接作業）

**前提:**
- 日本語パス は **ダブルクォート** で囲む
- Node nvm prefix: `source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 &&`
- 既定値 (idecoMethod=lump, idecoLumpRatio=50) で snapshot 不変
- UI 動作確認はブラウザで実施

---

## File Structure

### 新規

| パス | 役割 |
|------|------|
| `docs/phase4g-fixes/expected-changes.md` | 期待方向 + 実測サマリー |

### 変更

| パス | 変更概要 |
|------|---------|
| `calc/retirement.js` | 2 箇所で mixed 分岐 + idecoLumpRatio 適用 |
| `index.html` | 退職パネル UI（3-radio + 比率欄）、save/render 拡張、onIdecoMethodChange 拡張 |
| `test/regression.test.js` | BUG#12 5 件追加 |
| `docs/phase2-audits/sanity-walkthrough-シナリオB.md` | Phase 4g 完了評価追記 |

---

## Task 1: Setup

- [ ] **Step 1: ディレクトリ + 雛形**

```bash
mkdir -p "/Users/nagatohiroki/ライフプランアプリ/docs/phase4g-fixes"
```

Create `docs/phase4g-fixes/expected-changes.md`:

```markdown
# Phase 4g 修正の期待方向と実測

iDeCo 一時金+年金 併用受給（mixed mode）の実装記録。

---

## Group: iDeCo Mixed Receipt

### 期待方向
（Task 2 実施時に記入）

### 実測サマリー
（Task 2 修正後に記入）
```

- [ ] **Step 2: コミット**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add docs/phase4g-fixes/expected-changes.md && git commit -m "chore(phase4g): scaffold expected-changes tracking"
```

---

## Task 2: Mixed mode 実装 + UI + tests

### 2-1. 期待方向

- [ ] **Step 1: expected-changes.md 期待方向**

Replace placeholder with:
```markdown
### 期待方向
- `idecoReceiptMethod` に `'mixed'` 値追加
- `state.retirement.idecoLumpRatio`（0-100, 既定 50）を新規追加
- `calc/retirement.js` 2 箇所で mixed 分岐：
  - `idecoLumpsum = balance × (lumpRatio/100)` (mixed 時)
  - `_idecoPensionPortion = balance × (1 - lumpRatio/100)` (mixed 時)
  - `idecoYearly` は `_idecoPensionPortion` を annuity formula にかける
- UI: 退職パネルに「併用」ラジオ + 一時金比率（0-100%）入力欄追加
- 既存サンプル全件 `idecoMethod` 未指定 → 'lump' 既定 → snapshot 不変
- mixed 0% = pension 同等、mixed 100% = lump 同等の連続性を保証
```

### 2-2. テスト先行

- [ ] **Step 2: BUG#12 5 件追加**

Append at the END of `test/regression.test.js`:

```javascript
// ─── BUG#12 (Phase 4g): iDeCo 一時金+年金 併用受給 ──────────
// 修正前: idecoReceiptMethod は 'lump' or 'pension' のみ
// 修正後: 'mixed' 値追加 + idecoLumpRatio (0-100) で比率分割
describe('[BUG#12] iDeCo 一時金+年金 併用受給（Phase 4g）', () => {
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

  function setupBaseState(method = 'mixed', ratio = 50) {
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
        idecoReceiptMethod: method, idecoStartAge: 65, idecoPensionYears: 10,
        idecoLumpRatio: ratio,
      },
      lifeEvents: { housingType: 'mortgage', mortgage: {}, rent: {}, care: {}, scholarships: [], children: [] },
      cashFlowEvents: [], expenses: [], recurringExpenses: [],
    };
  }

  it('mixed 50%: 一時金 50% / 年金 50% で受給合計が pure pension の半分強', () => {
    setupBaseState('mixed', 50);
    const sim = calcRetirementSimWithOpts({});
    const at65 = sim.find(d => d.age === 65);
    // balance ≈ 324、年金部分 ≈ 162 → annuity ≈ 162 × 0.04 / (1-1.04^-10) ≈ 19.99
    expect(at65.totalNonAssetIncome ?? 0).toBeGreaterThan(15);
    expect(at65.totalNonAssetIncome ?? 0).toBeLessThan(25);
  });

  it('mixed 0% は pension 単独と同等', () => {
    setupBaseState('mixed', 0);
    const simMixed = calcRetirementSimWithOpts({});
    setupBaseState('pension');
    const simPension = calcRetirementSimWithOpts({});
    const mixed65 = simMixed.find(d => d.age === 65)?.totalNonAssetIncome ?? 0;
    const pension65 = simPension.find(d => d.age === 65)?.totalNonAssetIncome ?? 0;
    expect(mixed65).toBeCloseTo(pension65, 0);
  });

  it('mixed 100% は lump 単独と同等', () => {
    setupBaseState('mixed', 100);
    const simMixed = calcRetirementSimWithOpts({});
    setupBaseState('lump');
    const simLump = calcRetirementSimWithOpts({});
    // どちらも年金加算なしで totalNonAssetIncome ≈ 0
    const mixed65 = simMixed.find(d => d.age === 65)?.totalNonAssetIncome ?? 0;
    const lump65 = simLump.find(d => d.age === 65)?.totalNonAssetIncome ?? 0;
    expect(mixed65).toBeCloseTo(lump65, 0);
  });

  it('mixed の年金額は pension 単独より少ない（pensionPortion が balance より小さいため）', () => {
    setupBaseState('mixed', 50);
    const simMixed = calcRetirementSimWithOpts({});
    setupBaseState('pension');
    const simPension = calcRetirementSimWithOpts({});
    const mixed65 = simMixed.find(d => d.age === 65)?.totalNonAssetIncome ?? 0;
    const pension65 = simPension.find(d => d.age === 65)?.totalNonAssetIncome ?? 0;
    expect(mixed65).toBeLessThan(pension65);
    // 50% なら pure pension の概ね半分
    expect(mixed65).toBeCloseTo(pension65 / 2, 0);
  });

  it('idecoLumpRatio 範囲外（150）はクランプして 100 として動作（lump 同等）', () => {
    setupBaseState('mixed', 150);
    const simClamped = calcRetirementSimWithOpts({});
    setupBaseState('mixed', 100);
    const simExpected = calcRetirementSimWithOpts({});
    const clamped65 = simClamped.find(d => d.age === 65)?.totalNonAssetIncome ?? 0;
    const expected65 = simExpected.find(d => d.age === 65)?.totalNonAssetIncome ?? 0;
    expect(clamped65).toBeCloseTo(expected65, 0);
  });
});
```

- [ ] **Step 3: テスト失敗確認**

```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npx vitest run test/regression.test.js -t "BUG#12" 2>&1 | tail -15
```

Expected: ほとんど失敗（mixed 未対応で 'mixed' は不明な値 → idecoMethod が undefined 扱いか、エラー）。

### 2-3. calc/retirement.js 修正

- [ ] **Step 4: calcRetirementSim ブロック修正**

Find existing block in `calcRetirementSim` (around L57-82, after Phase 4f changes):

```javascript
  const idecoMethodSim = (r.idecoReceiptMethod === 'pension') ? 'pension' : 'lump';
```

Replace with:
```javascript
  // [Phase 4g] mixed 受給対応（一時金 + 年金 併用）
  const idecoMethodSim = (r.idecoReceiptMethod === 'pension') ? 'pension'
                       : (r.idecoReceiptMethod === 'mixed') ? 'mixed'
                       : 'lump';
  const idecoLumpRatioSim = (idecoMethodSim === 'mixed')
    ? Math.max(0, Math.min(100, parseInt(r.idecoLumpRatio) || 50)) / 100
    : null;
```

Then find:
```javascript
  const idecoLumpsumSim = (idecoMethodSim === 'lump') ? _idecoBalanceAtStartSim : 0;
```

Replace with:
```javascript
  // [Phase 4g] 一時金部分: lump=全額, mixed=ratio分, pension=0
  const idecoLumpsumSim =
      (idecoMethodSim === 'lump')  ? _idecoBalanceAtStartSim
    : (idecoMethodSim === 'mixed') ? _idecoBalanceAtStartSim * idecoLumpRatioSim
    : 0;
```

(`calcRetirementSim` doesn't compute idecoYearly — only `calcRetirementSimWithOpts` does. So no further changes here.)

- [ ] **Step 5: calcRetirementSimWithOpts ブロック修正**

Find existing block (around L334-385, after Phase 4f changes):

```javascript
  const idecoMethod = (r.idecoReceiptMethod === 'pension') ? 'pension' : 'lump';
```

Replace with:
```javascript
  // [Phase 4g] mixed 受給対応（一時金 + 年金 併用）
  const idecoMethod = (r.idecoReceiptMethod === 'pension') ? 'pension'
                    : (r.idecoReceiptMethod === 'mixed') ? 'mixed'
                    : 'lump';
  const idecoLumpRatio = (idecoMethod === 'mixed')
    ? Math.max(0, Math.min(100, parseInt(r.idecoLumpRatio) || 50)) / 100
    : null;
```

Then find:
```javascript
  // [Phase 4d] 一時金は退職所得控除に渡し、年金は 0 を渡す（控除に含めない）
  const idecoLumpsum = (idecoMethod === 'lump') ? _idecoBalanceAtStart : 0;
  // [Phase 4f] 年金額は annuity formula で算出（受給期間中の運用継続を反映）。r=0 は balance/n フォールバック。
  const idecoYearly = (idecoMethod === 'pension')
    ? (_idecoWeightedRate > 0
        ? _idecoBalanceAtStart * _idecoWeightedRate / (1 - Math.pow(1 + _idecoWeightedRate, -idecoPensionYears))
        : _idecoBalanceAtStart / idecoPensionYears)
    : 0;
```

Replace with:
```javascript
  // [Phase 4d/4g] 一時金部分（退職所得控除に渡す金額）
  const idecoLumpsum =
      (idecoMethod === 'lump')  ? _idecoBalanceAtStart
    : (idecoMethod === 'mixed') ? _idecoBalanceAtStart * idecoLumpRatio
    :                              0;
  // [Phase 4g] 年金部分（annuity の元本）
  const _idecoPensionPortion =
      (idecoMethod === 'pension') ? _idecoBalanceAtStart
    : (idecoMethod === 'mixed')   ? _idecoBalanceAtStart * (1 - idecoLumpRatio)
    :                                0;
  // [Phase 4f] 年金額は annuity formula で算出（受給期間中の運用継続を反映）。r=0 は balance/n フォールバック。
  const idecoYearly = (_idecoPensionPortion > 0)
    ? (_idecoWeightedRate > 0
        ? _idecoPensionPortion * _idecoWeightedRate / (1 - Math.pow(1 + _idecoWeightedRate, -idecoPensionYears))
        : _idecoPensionPortion / idecoPensionYears)
    : 0;
```

- [ ] **Step 6: テスト実行 — BUG#12 全件パス確認**

```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npx vitest run test/regression.test.js -t "BUG#12" 2>&1 | tail -10
```

Expected: 5/5 パス。

### 2-4. UI 拡張

- [ ] **Step 7: 受給方法ラジオに「併用」追加 + 一時金比率欄追加**

Find the existing 退職パネル iDeCo block in index.html (around L3508-3540):

```html
      <div class="form-group" style="margin:0 0 8px">
        <label>受給方法</label>
        <div style="display:flex;gap:16px;font-size:13px;margin-top:4px">
          <label style="display:flex;align-items:center;gap:4px;cursor:pointer">
            <input type="radio" name="retIdecoMethod" value="lump" onchange="onIdecoMethodChange();saveRetirementField()"> 一時金（一括）
          </label>
          <label style="display:flex;align-items:center;gap:4px;cursor:pointer">
            <input type="radio" name="retIdecoMethod" value="pension" onchange="onIdecoMethodChange();saveRetirementField()"> 年金（分割）
          </label>
        </div>
      </div>
```

Replace with:
```html
      <div class="form-group" style="margin:0 0 8px">
        <label>受給方法</label>
        <div style="display:flex;gap:16px;font-size:13px;margin-top:4px;flex-wrap:wrap">
          <label style="display:flex;align-items:center;gap:4px;cursor:pointer">
            <input type="radio" name="retIdecoMethod" value="lump" onchange="onIdecoMethodChange();saveRetirementField()"> 一時金（一括）
          </label>
          <label style="display:flex;align-items:center;gap:4px;cursor:pointer">
            <input type="radio" name="retIdecoMethod" value="pension" onchange="onIdecoMethodChange();saveRetirementField()"> 年金（分割）
          </label>
          <label style="display:flex;align-items:center;gap:4px;cursor:pointer">
            <input type="radio" name="retIdecoMethod" value="mixed" onchange="onIdecoMethodChange();saveRetirementField()"> 併用
          </label>
        </div>
      </div>
```

Find the existing `retIdecoPensionYearsGroup`:

```html
        <div class="form-group" id="retIdecoPensionYearsGroup" style="margin:0;display:none">
          <label>年金受給期間</label>
          <select id="retIdecoPensionYears" onchange="saveRetirementField()">
```

Add a new `retIdecoLumpRatioGroup` AFTER the year selector group (before closing `</div>` of the form-row):

```html
        <div class="form-group" id="retIdecoLumpRatioGroup" style="margin:0;display:none">
          <label>一時金比率（%）</label>
          <input type="number" id="retIdecoLumpRatio" min="0" max="100" step="5" value="50" onchange="saveRetirementField()" oninput="saveRetirementField()">
          <p style="font-size:11px;color:var(--text-muted);margin:4px 0 0">残り（100%−一時金比率）が年金部分。0% で純年金、100% で純一時金。</p>
        </div>
```

Note: ensure this is inside the `form-row` div that contains `retIdecoPensionYearsGroup`. If the form-row is restrictive, the new group can be a sibling outside the form-row.

- [ ] **Step 8: onIdecoMethodChange 拡張**

Find existing function:
```javascript
function onIdecoMethodChange() {
  const method = document.querySelector('input[name="retIdecoMethod"]:checked')?.value || 'lump';
  const yearsGroup = document.getElementById('retIdecoPensionYearsGroup');
  if (yearsGroup) yearsGroup.style.display = (method === 'pension') ? '' : 'none';
}
```

Replace with:
```javascript
function onIdecoMethodChange() {
  const method = document.querySelector('input[name="retIdecoMethod"]:checked')?.value || 'lump';
  const yearsGroup = document.getElementById('retIdecoPensionYearsGroup');
  const ratioGroup = document.getElementById('retIdecoLumpRatioGroup');
  // [Phase 4g] pension or mixed のとき年金受給期間欄を表示
  if (yearsGroup) yearsGroup.style.display = (method === 'pension' || method === 'mixed') ? '' : 'none';
  // [Phase 4g] mixed のときのみ一時金比率欄を表示
  if (ratioGroup) ratioGroup.style.display = (method === 'mixed') ? '' : 'none';
}
```

- [ ] **Step 9: saveRetirement 拡張**

Find existing block (around L14127-14130 ish):
```javascript
    idecoReceiptMethod: document.querySelector('input[name="retIdecoMethod"]:checked')?.value || 'lump',
    idecoStartAge: parseInt(document.getElementById('retIdecoStartAge')?.value) || (parseFloat(document.getElementById('retTargetAge').value) || 65),
    idecoPensionYears: parseInt(document.getElementById('retIdecoPensionYears')?.value) || 10,
```

Add a 4th line right after `idecoPensionYears`:
```javascript
    idecoReceiptMethod: document.querySelector('input[name="retIdecoMethod"]:checked')?.value || 'lump',
    idecoStartAge: parseInt(document.getElementById('retIdecoStartAge')?.value) || (parseFloat(document.getElementById('retTargetAge').value) || 65),
    idecoPensionYears: parseInt(document.getElementById('retIdecoPensionYears')?.value) || 10,
    idecoLumpRatio: parseInt(document.getElementById('retIdecoLumpRatio')?.value),
```

(The parseInt without default is intentional — if the field is empty the value is NaN which the calc clamps; if user has never opened mixed mode the field may be unfilled. The calc fallback to 50 handles undefined/NaN.)

- [ ] **Step 10: renderRetirementPage 拡張**

Find existing block:
```javascript
  populateIdecoStartAgeOptions();
  const _idecoMethod = r.idecoReceiptMethod || 'lump';
  const _idecoMethodInput = document.querySelector(`input[name="retIdecoMethod"][value="${_idecoMethod}"]`);
  if (_idecoMethodInput) _idecoMethodInput.checked = true;
  const _targetAgeForIdeco = parseInt(r.targetAge) || 65;
  document.getElementById('retIdecoStartAge').value = parseInt(r.idecoStartAge) || _targetAgeForIdeco;
  document.getElementById('retIdecoPensionYears').value = parseInt(r.idecoPensionYears) || 10;
  onIdecoMethodChange();
```

Add idecoLumpRatio restore right before `onIdecoMethodChange()`:
```javascript
  populateIdecoStartAgeOptions();
  const _idecoMethod = r.idecoReceiptMethod || 'lump';
  const _idecoMethodInput = document.querySelector(`input[name="retIdecoMethod"][value="${_idecoMethod}"]`);
  if (_idecoMethodInput) _idecoMethodInput.checked = true;
  const _targetAgeForIdeco = parseInt(r.targetAge) || 65;
  document.getElementById('retIdecoStartAge').value = parseInt(r.idecoStartAge) || _targetAgeForIdeco;
  document.getElementById('retIdecoPensionYears').value = parseInt(r.idecoPensionYears) || 10;
  // [Phase 4g] 一時金比率
  const _ratioEl = document.getElementById('retIdecoLumpRatio');
  if (_ratioEl) _ratioEl.value = (r.idecoLumpRatio != null && !isNaN(parseInt(r.idecoLumpRatio))) ? parseInt(r.idecoLumpRatio) : 50;
  onIdecoMethodChange();
```

### 2-5. 全テスト実行

- [ ] **Step 11: 全テスト**

```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npm test 2>&1 | tail -10
```

Expected: 201/201 green (196 + BUG#12 5 件), no snapshot updates pending.

If snapshot changes appear, STOP — back-compat broken.

### 2-6. ブラウザ動作確認（任意）

- [ ] **Step 12: ブラウザ確認**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && python3 -m http.server 8000 > /tmp/phase4g-server.log 2>&1 &
```

ブラウザで:
1. 退職タブ → iDeCo 受給設定で「併用」選択
2. 一時金比率欄 + 年金受給期間欄が両方表示されることを確認
3. 「一時金」選択 → 両方非表示
4. 「年金」選択 → 年金受給期間のみ表示
5. 設定保存 → タブ離脱 → 再度開いて状態復元確認
6. localStorage の `lifeplan_v1.retirement.idecoLumpRatio` を開発者ツールで確認

```bash
pkill -f "python3 -m http.server" 2>/dev/null
```

### 2-7. 記録・コミット

- [ ] **Step 13: 実測サマリー記入**

```markdown
### 実測サマリー
- snapshot 差分: **なし**（既存サンプル全件 idecoMethod 未指定 → 'lump' 既定）
- `calc/retirement.js` 2 箇所で mixed 分岐 + idecoLumpRatio 適用
- UI: 退職パネルに「併用」ラジオ + 一時金比率（0-100%）入力欄追加
- save/render に idecoLumpRatio 対応
- onIdecoMethodChange を 3 状態（lump / pension / mixed）対応に拡張
- テスト: 201/201 グリーン（196 + BUG#12 5 件）
```

- [ ] **Step 14: コミット + SHA 記録**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add calc/retirement.js index.html test/regression.test.js docs/phase4g-fixes/expected-changes.md && git commit -m "fix(phase4g): iDeCo mixed receipt method (lump + pension)"
```

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git log -1 --format=%h
```

Append `- 実コミット: <SHA 7桁>` to 実測サマリー → コミット:
```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add docs/phase4g-fixes/expected-changes.md && git commit -m "docs(phase4g): record actual SHA"
```

---

## Task 3: 完了総括 + サニティ

- [ ] **Step 1: サニティウォークスルー追記**

Edit `docs/phase2-audits/sanity-walkthrough-シナリオB.md`. Append at end:

```markdown

## Phase 4g 完了後の再評価（2026-04-25）

Phase 4g で iDeCo 一時金 + 年金 併用受給が実装され、両税優遇活用ニーズに対応：

### 修正された主要な機能拡張

- **iDeCo Mixed Receipt** (`<Task 2 fix SHA>`):
  - `idecoReceiptMethod` に `'mixed'` 値追加
  - `idecoLumpRatio` フィールド追加（0-100%、既定 50）
  - 一時金部分は退職所得控除、年金部分は annuity formula
  - mixed 0% = pension 同等、mixed 100% = lump 同等の連続性
  - シナリオ B は idecoMethod 未指定 → snapshot 不変

### 判定の更新

- **Phase 4f 完了後**: ✅ 妥当（annuity 計算で精度向上）
- **Phase 4g 完了後**: ✅ 妥当（iDeCo 受給戦略の柔軟性が完成）
- **残存**: Minor 63 件、Phase 4h 候補（5/19 年ルール、UI 機能拡張等）
```

- [ ] **Step 2: 完了総括追加**

Edit `docs/phase4g-fixes/expected-changes.md`. Append at end:

```markdown

---

## 完了総括（2026-04-25）

### 達成事項

- iDeCo 一時金+年金 併用受給 (mixed mode) 実装
- 一時金比率 0-100% 自由指定（5% 刻み UI）
- mixed 0%/100% で pension/lump と完全連続
- テスト: 201/201 グリーン（+5 件 BUG#12）
- 既存 snapshot 不変
- commit 構成: setup 1 + fix 1 + SHA record 1 + 最終 docs 1 = 計 4 コミット

### iDeCo 受給機能の完成度

- 受給方法: 一時金 / 年金 / **併用**（Phase 4g で完成）
- 受給開始年齢: 60-75 歳（Phase 4d）
- 年金受給期間: 5/10/15/20 年（Phase 4d）
- annuity 計算: 受給期間中の運用継続反映（Phase 4f）
- 配偶者控除との連動: 3 軸完全実装（Phase 4c/4e）

### Phase 4h 以降への橋渡し

- 5/19 年ルール（厳密な退職所得控除別枠化、退職金と iDeCo 一時金の年差別控除）
- Minor 63 件選別（出典更新、helper テキスト等）
- 新規 UI 機能（PDF 出力、シナリオ共有 URL 等）
```

- [ ] **Step 3: 最終コミット**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add docs/phase2-audits/sanity-walkthrough-シナリオB.md docs/phase4g-fixes/expected-changes.md && git commit -m "docs(phase4g): record completion summary and update walkthrough"
```

---

## 完了条件

- [ ] Task 1〜3 完了
- [ ] `idecoReceiptMethod === 'mixed'` 値追加
- [ ] `idecoLumpRatio` フィールド追加
- [ ] `calc/retirement.js` 2 箇所で mixed 分岐
- [ ] UI 3-radio + 一時金比率欄 + onIdecoMethodChange 拡張
- [ ] save/render 新フィールド対応
- [ ] BUG#12 5 件追加（196 → 201 グリーン）
- [ ] 既存 snapshot 不変
- [ ] commit 履歴 約 4 件
