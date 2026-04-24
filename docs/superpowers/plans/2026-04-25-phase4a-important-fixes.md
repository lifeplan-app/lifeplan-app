# Phase 4a Important 高影響 14 件 修正 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 2 監査で検出された Important 43 件のうち、高影響・構造関連の 14 件を解消する。Phase 1 スナップショットは意図的に更新される。

**Architecture:** Phase 2.5 と同じグループ化ワークフロー。`calc/*.js`（Phase 3/3.5 で分離済み）を領域別に修正し、`docs/phase4-fixes/expected-changes.md` に期待方向と実測を記録。

**Tech Stack:** Vanilla JS（classic script）、Vitest 2.x、Playwright 1.x（既存）

**基準設計書:** `docs/superpowers/specs/2026-04-25-phase4a-important-fixes-design.md`

**リポジトリ:** `/Users/nagatohiroki/ライフプランアプリ/`（main ブランチ直接作業）

**⚠️ 重要な前提:**
- 日本語パス `/Users/nagatohiroki/ライフプランアプリ/` はシェルで必ず **ダブルクォート** で囲む
- Node は nvm 経由：`source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 &&` を各コマンドに prefix
- UI 変更は一切行わない（計算ロジック修正のみ）
- iDeCo 受給方法は「60 歳で全額一時金受取」をデフォルト固定
- 各グループで snapshot 差分が生じる（意図通り）。`git diff` 目視で期待方向確認後に `test:update` 実行

---

## File Structure

### 新規作成

| パス | 想定行数 | 役割 |
|------|---------|------|
| `docs/phase4-fixes/expected-changes.md` | 約 80 行（6 セクション雛形） | 各グループの期待方向と実測サマリー |

### 変更

| パス | 変更の概要 |
|------|-----------|
| `calc/pension.js` | G1: `adjustRate(pensionAge)` 追加、`_calcPensionCore` に `birthYear` 引数、手取率階層テーブル、`KOKUMIN_FULL_MONTHLY` を 7.06 に更新 |
| `calc/asset-growth.js` | G2: `calcCapitalGainsTax(amount, taxType)` 追加 |
| `calc/mortgage.js` | G2: `calcResidentTax(taxableIncomeMan)` 追加（`calcIncomeTaxAmount` の隣） |
| `calc/retirement.js` | G3+G4: iDeCo 一時金化、NISA 温存順序、`calcSeveranceDeduction`、`cashFloor` override、`returnMod` 非対称解消、配当・取崩の税引き |
| `calc/integrated.js` | G2+G11: 清算税引き、`_inputMode==='gross'` 整合性、`opts.noLoan` 控除除外 |
| `test/__snapshots__/scenario-snapshot.test.js.snap` | 全グループで意図的に更新 |
| `docs/phase4-fixes/expected-changes.md` | 各グループで実測サマリー追記 |
| `docs/phase2-audits/*.md` | 最終 Task で該当 14 Important に Resolved 注記 |
| `docs/phase2-audits/sanity-walkthrough-シナリオB.md` | 最終 Task で Phase 4a 完了後の評価追記 |

### 変更しない

- `index.html`（UI 変更なし）
- `test/*.test.js`（テスト自体は不変、snapshot のみ変動）
- `test/helpers/*.js`
- `calc/utils.js`, `calc/income-expense.js`, `calc/life-events.js`, `calc/scenarios.js`

---

## 共通ワークフロー（Task 2 以降で繰り返す）

```
1. expected-changes.md に Group N の「期待方向」を事前宣言
2. calc/*.js を修正
3. npm test 実行 → Phase 1 snapshot 赤化確認
4. git diff test/__snapshots__/ 目視 → 方向一致確認・想定外変動なし
5. npm run test:update で snapshot 承認
6. npm test 再実行 → 155/155 グリーン
7. expected-changes.md に実測サマリー追記
8. コミット（fix + 更新 snap + expected-changes.md）
9. 実コミット SHA を expected-changes.md に追記 + 追加コミット
```

---

## Task 1: Setup（expected-changes.md 雛形 + 実施順序確認）

**Files:**
- Create: `docs/phase4-fixes/expected-changes.md`

**狙い:** Phase 4a のトラッキング基盤を用意。以降 Task 2〜6 はこれに追記していく。

- [ ] **Step 1: ディレクトリ作成**

Run:
```bash
mkdir -p "/Users/nagatohiroki/ライフプランアプリ/docs/phase4-fixes" && ls "/Users/nagatohiroki/ライフプランアプリ/docs/phase4-fixes"
```

- [ ] **Step 2: `expected-changes.md` 雛形を作成**

Create `docs/phase4-fixes/expected-changes.md` with:

```markdown
# Phase 4a 修正の期待方向と実測

Important 14 件を 5 グループに分けて修正した記録。
実施順序: G11 → G4 → G1 → G2 → G3（影響小 → 影響大）。

---

## Group 11: 統合シム（09-I01, 09-I03）

### 期待方向
（Task 2 実施時に記入）

### 実測サマリー
（Task 2 修正後に記入）

---

## Group 4: 退職計算（08-I03, 08-I04, 08-I05）

### 期待方向
（Task 3 実施時に記入）

### 実測サマリー
（Task 3 修正後に記入）

---

## Group 1: 年金制度対応（04-I01, 04-I02, 04-I03, 04-I04）

### 期待方向
（Task 4 実施時に記入）

### 実測サマリー
（Task 4 修正後に記入）

---

## Group 2: 清算時の税引き（07-I01, 08-I01, 09-I02）

### 期待方向
（Task 5 実施時に記入）

### 実測サマリー
（Task 5 修正後に記入）

---

## Group 3: NISA 温存取崩順序 + iDeCo 一時金化（07-I04, 08-I02）

### 期待方向
（Task 6 実施時に記入）

### 実測サマリー
（Task 6 修正後に記入）
```

- [ ] **Step 3: コミット**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add docs/phase4-fixes/expected-changes.md && git commit -m "chore(phase4a): scaffold expected-changes tracking"
```

---

## Task 2: Group 11 — 統合シム（09-I01, 09-I03）

**Files:**
- Modify: `calc/integrated.js`
- Modify: `docs/phase4-fixes/expected-changes.md`

**狙い:** ウォーミングアップ。影響軽微な 2 件から。

### 09-I03: opts.noLoan 住宅ローン控除除外

現状 `calc/integrated.js` の年次ループ内で `annualMortgageDeduct = y === 0 ? 0 : calcMortgageDeduction(yr, mortgageBalanceInteg)` のような記述（事前 grep で確認）。これを `(y === 0 || opts.noLoan) ? 0 : calcMortgageDeduction(...)` に変更。

### 09-I01: 収入税引きの一貫性

`_inputMode === 'gross'` 時の収入計算と配当 `dividendCashout` の税引きの順序整理。`calc/integrated.js` 年次ループで以下を修正：

- `annualIncome` は `getIncomeForYearWithGrowth(yr)` の戻り値そのまま（現状）
- `_inputMode === 'gross'` の場合、`state.finance._inputMode` を参照して手取率 `NET_RATIO`（既定 0.78）を `annualIncome` に乗算
- `annualDividendCashout` は既に `calc/asset-growth.js` 内で税引き済みの配当額を渡している場合、二重適用しないよう確認

実装詳細は実コード Read で決定。

### Task 2 手順

- [ ] **Step 1: 期待方向を `expected-changes.md` に追記**

Edit で Group 11 `### 期待方向` を以下に置換：

```
- **対象**: 
  - 09-I01: gross モード時の収入一貫税引き
  - 09-I03: opts.noLoan 時の住宅ローン控除除外
- **期待される snapshot 差分**:
  - 既存サンプル 5 件は `_inputMode === 'net'` を使用（事前 grep で確認）→ 09-I01 は差分ゼロの想定
  - 既存サンプルで `opts.noLoan=true` を渡すケースは calcScenarioSim など限られた経路 → 09-I03 は一部シナリオで `leMortgage` が名目フィールドだけ変動する可能性
- **確認ポイント**: 差分が小さいか、ある場合は明確に gross モード or noLoan 経由
```

- [ ] **Step 2: 事前 grep でサンプルデータの `_inputMode` を確認**

```bash
grep -l '"_inputMode": "gross"' "/Users/nagatohiroki/ライフプランアプリ/sample_data/"*.json
```

Expected: マッチなし（全サンプルが `net` or 未設定）。その場合 09-I01 の snapshot 差分はゼロになる。

- [ ] **Step 3: `calc/integrated.js` を修正**

Read で `calc/integrated.js` 全体を確認し、以下の 2 箇所を修正：

1. `annualMortgageDeduct` 代入行に `opts.noLoan` 条件を追加
2. `_inputMode === 'gross'` の場合の `annualIncome` 調整を追加（gross モードの時だけ手取率乗算）

- [ ] **Step 4: `npm test` → diff 目視 → test:update**

```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npm test 2>&1 | tail -10
```

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git diff test/__snapshots__/scenario-snapshot.test.js.snap | head -50
```

期待方向と一致確認（差分ゼロまたは軽微）。

```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npm run test:update && npm test 2>&1 | tail -5
```

- [ ] **Step 5: 実測サマリー追記 + コミット**

expected-changes.md に実測追記：

```
- **commit SHA**: （Step 6 で追記）
- **snapshot 差分行数**: 約 N 行
- **変化の主なフィールド**: （あれば）`leMortgage`, `totalWealth` 等
- **シナリオ別変化**: 
  - A/B/C/D/E: （差分あり/なし）
- **方向の評価**: 期待通り / 想定外
```

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add calc/integrated.js test/__snapshots__/scenario-snapshot.test.js.snap docs/phase4-fixes/expected-changes.md && git commit -m "fix(phase4a): integrate sim consistency for gross mode and noLoan deduction (09-I01/09-I03)"
```

- [ ] **Step 6: SHA 補完コミット**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git log -1 --format=%h
```
で SHA 取得、Edit で expected-changes.md の `（Step 6 で追記）` を実 SHA に置換、追加コミット：

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add docs/phase4-fixes/expected-changes.md && git commit -m "docs(phase4a): record Group 11 actual SHA"
```

---

## Task 3: Group 4 — 退職計算（08-I03, 08-I04, 08-I05）

**Files:**
- Modify: `calc/retirement.js`
- Modify: `docs/phase4-fixes/expected-changes.md`

**狙い:** 退職所得控除・cashFloor・returnMod 対称化。G3 の iDeCo 一時金化で退職所得控除ロジックを再利用するため先行実装。

### 08-I03: 退職所得控除

`calc/retirement.js` に以下の関数を新設（`calcRetirementSimWithOpts` の前に配置）：

```js
// [Phase 4a 08-I03] 退職金・iDeCo 一時金の退職所得控除適用
// 引数: severance 退職金（万円）, idecoLumpsum iDeCo 一時金（万円、G3 で渡される・本 Task では 0 でOK）, serviceYears 勤続年数
// 戻り値: 税引後額（万円）
function calcSeveranceDeduction(severance, idecoLumpsum, serviceYears) {
  const total = severance + (idecoLumpsum || 0);
  if (total <= 0) return 0;
  // 退職所得控除枠（国税庁 No.1420）
  // 勤続20年以下: 40万円 × 勤続年数（最低80万円）
  // 勤続20年超: 800万円 + 70万円 × (勤続年数 - 20)
  const deduction = serviceYears <= 20
    ? Math.max(80, 40 * serviceYears)
    : 800 + 70 * (serviceYears - 20);
  const taxableRaw = Math.max(0, total - deduction);
  // 退職所得は 1/2 に圧縮
  const taxable = taxableRaw / 2;
  // 簡易所得税（calcIncomeTaxAmount を使いたいが mortgage.js 経由の循環避けるためインライン）
  // 万円単位の速算表
  let incomeTax = 0;
  if (taxable <= 195) incomeTax = taxable * 0.05;
  else if (taxable <= 330) incomeTax = taxable * 0.10 - 9.75;
  else if (taxable <= 695) incomeTax = taxable * 0.20 - 42.75;
  else if (taxable <= 900) incomeTax = taxable * 0.23 - 63.6;
  else if (taxable <= 1800) incomeTax = taxable * 0.33 - 153.6;
  else if (taxable <= 4000) incomeTax = taxable * 0.40 - 279.6;
  else incomeTax = taxable * 0.45 - 479.6;
  incomeTax = Math.max(0, incomeTax);
  const residentTax = Math.max(0, taxable * 0.10);
  return total - incomeTax - residentTax;
}
```

既存の `severanceAtRetire` 代入箇所（`calc/retirement.js:40, 261` 付近）とループ内の `severanceThisYear` 扱い箇所（`:387-388` 付近）を、`calcSeveranceDeduction(severance, 0, serviceYears)` を通した税引後額に置換。勤続年数 `serviceYears` はひとまず `state.retirement.serviceYears` が未設定なら `targetAge - 22` で近似（UI 追加なし）。

### 08-I04: cashFloor 残高判定

`calc/retirement.js` 内の `depleted` 判定で、`cashFloor` ロック分を除外せず。該当箇所は `:17779` 相当の `depleted: endAssets <= 0 || isFundingShortfall || criticalPoolDepleted` (Phase 2.5 08-C01 で導入) の周辺。

### 08-I05: returnMod 非対称解消

`calcRetirementSimWithOpts(opts = {})` で `opts.returnModStock`（既存 `returnMod` のエイリアス）と `opts.returnModCash`（新規）を追加。現金プールの利回り（生活防衛資金・目的別等の `annualReturn` フィールド）にも乗算。

### Task 3 手順

- [ ] **Step 1: 期待方向追記**

```
- **対象**:
  - 08-I03: 退職金の退職所得控除（iDeCo 一時金は G3 で渡される・本 Task では severance のみ）
  - 08-I04: cashFloor 残高の depleted 判定
  - 08-I05: returnMod の現金プールへの対称化
- **期待される snapshot 差分**:
  - シナリオ D 中村博（退職金 2,200 万想定）で `endAssets` が **-180 万円程度**（退職所得控除で税圧縮後の実効額）
  - シナリオ B 鈴木健太の退職金も影響あり
  - 08-I04 の depleted 判定変更は既存サンプルで発火するケース限定
  - 08-I05 は `returnMod !== 0` の 楽観/悲観 snapshot で現金プール利回りが動く
- **確認ポイント**: シナリオ D の退職金税引き効果を手計算で検算（勤続年数 × 40 万 or 800 + 70 × (勤続 - 20)）
```

- [ ] **Step 2〜6: 修正 → test → diff 目視 → test:update → コミット → SHA 補完**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add calc/retirement.js test/__snapshots__/scenario-snapshot.test.js.snap docs/phase4-fixes/expected-changes.md && git commit -m "fix(phase4a): severance tax deduction, cashFloor, returnMod symmetry (08-I03/I04/I05)"
```

---

## Task 4: Group 1 — 年金制度対応（04-I01, 04-I02, 04-I03, 04-I04）

**Files:**
- Modify: `calc/pension.js`
- Modify: `calc/retirement.js`（04-I02 の pensionAnnual 適用）
- Modify: `docs/phase4-fixes/expected-changes.md`

### 04-I04: 満額 2026 年度 7.06 万へ更新

`calc/pension.js:14` の `const KOKUMIN_FULL_MONTHLY = 6.8;` を `const KOKUMIN_FULL_MONTHLY = 7.06;` に変更。コメントも 2026 年度に更新。

### 04-I01: 2003 年 3 月以前の乗率 7.125/1000

`_calcPensionCore` に第 5 引数 `birthYear` を追加：

```js
function _calcPensionCore(employType, koseiYears, avgIncome, kokuminYears, birthYear) {
  const kokuminMonths = Math.min(kokuminYears * 12, 480);
  const kokuminMonthly = Math.round(KOKUMIN_FULL_MONTHLY * (kokuminMonths / KOKUMIN_FULL_MONTHS) * 10) / 10;
  let koseiMonthly = 0;
  if (employType === 'employee' && koseiYears > 0 && avgIncome > 0) {
    const hyojunGekkyu = Math.min(avgIncome / 12, 65);
    const totalMonths = koseiYears * 12;
    // [Phase 4a 04-I01] 2003 年 3 月以前の加入月数を 7.125/1000、以降を 5.481/1000 で分割計算
    let oldMonths = 0;
    if (birthYear) {
      // 入社 22 歳想定で 2003-03 時点の加入月数を推定
      const employmentStartYear = birthYear + 22;
      if (employmentStartYear < 2003 || (employmentStartYear === 2003 /* 3月前入社は複雑なので年単位で近似 */)) {
        oldMonths = Math.max(0, Math.min((2003 - employmentStartYear) * 12 + 3, totalMonths));
      }
    }
    const newMonths = totalMonths - oldMonths;
    const annualOld = hyojunGekkyu * (7.125 / 1000) * oldMonths;
    const annualNew = hyojunGekkyu * (5.481 / 1000) * newMonths;
    koseiMonthly = Math.round((annualOld + annualNew) / 12 * 10) / 10;
  }
  const grossTotal = Math.round((kokuminMonthly + koseiMonthly) * 10) / 10;
  // [Phase 4a 04-I03] 手取率を年金額階層別に
  const netRatio = grossTotal * 12 <= 150 ? 0.95
                 : grossTotal * 12 <= 300 ? 0.90
                 : grossTotal * 12 <= 500 ? 0.85
                 : 0.82;
  const netTotal = Math.round(grossTotal * netRatio * 10) / 10;
  return { kokuminMonthly, koseiMonthly, grossTotal, netTotal, kokuminMonths };
}
```

### 04-I02: 繰下げ率反映

`calc/pension.js` に `adjustRate(pensionAge)` を追加：

```js
// [Phase 4a 04-I02] 繰下げ・繰上げ率（60-75 歳）
function adjustRate(pensionAge) {
  const BASE_AGE = 65;
  const months = (pensionAge - BASE_AGE) * 12;
  if (months < 0) return Math.max(0, 1 + months * 0.004); // 繰上げ -0.4%/月
  return 1 + months * 0.007; // 繰下げ +0.7%/月
}
```

`calc/retirement.js:342-344` 付近の `basePensionAnnual` / `basePensionAnnual_p` 計算で、`adjustRate(pensionAge)` を乗算：

```js
const pensionAge = parseInt(r.pensionAge) || 65;
const pensionAge_p = parseInt(r.pensionAge_p) || 65;
const basePensionAnnual = (parseFloat(r.pensionMonthly) || 0) * 12 * adjustRate(pensionAge) * (1 + pensionMod) * (1 - params.pensionSlide);
const basePensionAnnual_p = (parseFloat(r.pensionMonthly_p) || 0) * 12 * adjustRate(pensionAge_p) * (1 + pensionMod) * (1 - params.pensionSlide);
```

同様に `calc/retirement.js:61-62` の退職前用 `pensionAnnual` も更新。

### Task 4 手順

- [ ] **Step 1: 期待方向追記**

```
- **対象**: 04-I01/I02/I03/I04（年金4件）
- **期待される snapshot 差分**:
  - 全シナリオで基礎年金部分 +3.8%（6.8 → 7.06）
  - 40 代以上シナリオ（C 山本誠 45歳、D 中村博 55歳）で厚生年金区間の一部が 7.125/1000 適用 → わずかに増
  - 手取率階層別適用で低所得シナリオ（E 林菜緒）は +4% 程度、高所得シナリオは -2%
  - `state.retirement.pensionAge` が 65 以外に設定されているサンプルがあれば繰下げ率も効く（現状サンプルは 65 固定の想定）
- **確認ポイント**: シナリオ D の厚生年金 2003 年 3 月区間の計算を手計算で検算
```

- [ ] **Step 2〜6: 修正 → test → diff 目視 → test:update → コミット → SHA 補完**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add calc/pension.js calc/retirement.js test/__snapshots__/scenario-snapshot.test.js.snap docs/phase4-fixes/expected-changes.md && git commit -m "fix(phase4a): pension 2003 split, deferral rate, net ratio, 2026 base (04-I01/I02/I03/I04)"
```

---

## Task 5: Group 2 — 清算時の税引き（07-I01, 08-I01, 09-I02）

**Files:**
- Modify: `calc/asset-growth.js`（`calcCapitalGainsTax` 新設）
- Modify: `calc/mortgage.js`（`calcResidentTax` 新設）
- Modify: `calc/integrated.js`（清算税引き）
- Modify: `calc/retirement.js`（配当・取崩税引き）
- Modify: `docs/phase4-fixes/expected-changes.md`

### 共通ヘルパ新設

`calc/asset-growth.js` に追加：

```js
// [Phase 4a 07-I01] 譲渡益・配当に対する実効税率
// taxType: 'nisa' | 'ideco' | 'tokutei' | 'cash'
function calcCapitalGainsTax(amount, taxType) {
  if (taxType === 'nisa' || taxType === 'ideco' || taxType === 'cash') return 0;
  return amount * TAX_RATE; // TAX_RATE = 0.20315
}
```

`calc/mortgage.js` の `calcIncomeTaxAmount` 直後に追加：

```js
// [Phase 4a 08-I01] 住民税概算（課税所得 × 10%、調整控除省略）
function calcResidentTax(taxableIncomeMan) {
  if (taxableIncomeMan <= 0) return 0;
  return Math.max(0, taxableIncomeMan * 0.10);
}
```

### 07-I01 + 09-I02: `calc/integrated.js` 清算税引き

年次ループ内の `liquidationThisYear` 計算後、加重実効税率で割り戻す。投資プールの `taxType` 構成比から加重平均を算出：

```js
// [Phase 4a 07-I01/09-I02] 清算額を税引後ネット必要額から額面に換算
if (liquidationThisYear > 0) {
  const totalInvestVal = _investGD.reduce((s, g) => s + (g.asset.currentVal || 0), 0);
  const weightedTax = totalInvestVal > 0
    ? _investGD.reduce((s, g) => {
        const tt = g.asset.taxType || TAX_TYPE_DEFAULT[g.asset.type] || 'tokutei';
        const rate = (tt === 'nisa' || tt === 'ideco' || tt === 'cash') ? 0 : TAX_RATE;
        return s + (g.asset.currentVal || 0) * rate;
      }, 0) / totalInvestVal
    : TAX_RATE;
  // 額面必要額 = ネット / (1 - weightedTax)
  liquidationThisYear = liquidationThisYear / Math.max(0.01, 1 - weightedTax);
}
```

既存の `_investDeficit += liquidationThisYear` はこの額面版を積み上げる。

### 08-I01: `calc/retirement.js` 配当・取崩の税引き

`dividendPool` 配当収入と 4 プール取崩額に `calcCapitalGainsTax` を適用。詳細は実コード Read で決定。

### Task 5 手順

- [ ] **Step 1: 期待方向追記**

```
- **対象**: 07-I01 / 08-I01 / 09-I02（清算・配当の税引き 3 件同根）
- **期待される snapshot 差分**:
  - 清算発生シナリオ（E 林菜緒など）で `liquidation` が **額面 +25% 増**（税引後 → 額面換算）
  - `investPool` の減少が速くなる方向
  - 長期資産（endAssets）は **-5〜-10%** 減方向
  - NISA 比率が高いシナリオほど税引き影響は小さい
- **確認ポイント**: E の清算年を確認、Phase 2.5 Group 5 で導入した `investPoolHealthy` ガードとの整合性
```

- [ ] **Step 2〜6: 修正 → test → diff 目視 → test:update → コミット → SHA 補完**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add calc/asset-growth.js calc/mortgage.js calc/integrated.js calc/retirement.js test/__snapshots__/scenario-snapshot.test.js.snap docs/phase4-fixes/expected-changes.md && git commit -m "fix(phase4a): apply tax on liquidation/dividend/withdrawal (07-I01/08-I01/09-I02)"
```

---

## Task 6: Group 3 — NISA 温存取崩順序 + iDeCo 一時金化（07-I04, 08-I02）

**Files:**
- Modify: `calc/retirement.js`
- Modify: `docs/phase4-fixes/expected-changes.md`

### iDeCo 一時金化（60 歳固定・08-I03 と連携）

`calcRetirementSimWithOpts` 冒頭で：

```js
// [Phase 4a G3] iDeCo は 60 歳時点で全額一時金受取（デフォルト）
// G4 08-I03 の退職所得控除と合算する
const IDECO_LUMP_AGE = 60;
const idecoLumpsum = state.assets
  .filter(a => a.type === 'ideco')
  .reduce((s, a) => s + (a.currentVal || 0), 0);
// 退職年齢が IDECO_LUMP_AGE 以上なら退職時に一時金化、そうでない場合も 60 歳時点で cashPool に合流
// 簡易的に「退職年で iDeCo 一時金を severance と合算」として扱う
const severanceWithIdeco = severance + idecoLumpsum;
const taxedAfterDeduction = calcSeveranceDeduction(severanceWithIdeco, 0, serviceYears);
```

既存の `severanceAtRetire` 計算をこの `taxedAfterDeduction` を使う形に書き換え（severance のみの場合と同じ関数で処理）。

### NISA 温存順序（07-I04 + 08-I02）

`indexPool` を 2 サブプールに分離：

```js
// [Phase 4a 07-I04] 投資プールを税制別に分離
let indexTaxablePool = state.assets
  .filter(a => !_CASH_TYPES_RET.has(a.type) && (a.taxType || TAX_TYPE_DEFAULT[a.type]) === 'tokutei' && !_isDivPool(a))
  .reduce((s, a) => s + (a.currentVal || 0), 0);
let indexNisaPool = state.assets
  .filter(a => !_CASH_TYPES_RET.has(a.type) && (a.taxType || TAX_TYPE_DEFAULT[a.type]) === 'nisa' && !_isDivPool(a))
  .reduce((s, a) => s + (a.currentVal || 0), 0);
// iDeCo は既に一時金化済みなので投資プールに残さない
```

取崩順序：`cashPool → dividendPool → indexTaxablePool → indexNisaPool → emergencyPool`（Phase 2 監査の推奨順）。

既存の `indexPool` 変数を `indexTaxablePool + indexNisaPool` の合計として扱う。UI 戻り値の `indexPool` は既存互換のため合計値を出力。

### Task 6 手順

- [ ] **Step 1: 期待方向追記**

```
- **対象**: 07-I04 / 08-I02（NISA 温存取崩順序）+ iDeCo 一時金化（G4 08-I03 と連携）
- **期待される snapshot 差分**:
  - iDeCo を含むシナリオ（C 山本誠、D 中村博など）で退職年に iDeCo 残高が cashPool に合流 → **初年 endAssets が -100〜-500 万円**（退職所得控除税引き込み）
  - 以降の取崩順序変更で、長期では **特定口座を先消費 + NISA を温存** → 手取りが +5〜+10% 増方向
  - 既存 `indexPool` 出力は `indexTaxable + indexNisa` の合計値として維持（UI 互換）
  - Phase 2.5 の 08-C01 で導入した `criticalPoolDepleted` 判定が新プール構造でも動くか確認
- **確認ポイント**: iDeCo を持つシナリオ C/D で 60 歳年の cashPool ジャンプを確認、勤続年数 (`targetAge - 22`) での退職所得控除の枠内かチェック
```

- [ ] **Step 2〜6: 修正 → test → diff 目視 → test:update → コミット → SHA 補完**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add calc/retirement.js test/__snapshots__/scenario-snapshot.test.js.snap docs/phase4-fixes/expected-changes.md && git commit -m "fix(phase4a): iDeCo lump sum at 60, NISA preserve order (07-I04/08-I02)"
```

---

## Task 7: 最終検証と Phase 2 監査レポート注記

**Files:**
- Modify: `docs/phase2-audits/02-income-expense.md`, `04-pension.md`, `05-mortgage.md`, `07-two-pool-model.md`, `08-retirement-withdrawal.md`, `09-integrated-simulation.md` — 該当 Important に `[Resolved in Phase 4a commit XXXX]` 注記追加
- Modify: `docs/phase2-audits/sanity-walkthrough-シナリオB.md` — Phase 4a 完了後の再評価追記
- Modify: `docs/phase4-fixes/expected-changes.md` — 完了総括

**狙い:** Phase 4a の完了宣言と、Phase 2 監査レポートへの Resolved 注記。

### 注記対象（14 件）

- `04-pension.md`: 04-I01, 04-I02, 04-I03, 04-I04（Task 4 の SHA）
- `07-two-pool-model.md`: 07-I01, 07-I04（Task 5 と Task 6 の SHA）
- `08-retirement-withdrawal.md`: 08-I01, 08-I02, 08-I03, 08-I04, 08-I05（Task 5, 6, 3 の SHA）
- `09-integrated-simulation.md`: 09-I01, 09-I02, 09-I03（Task 2 と Task 5 の SHA）

### Task 7 手順

- [ ] **Step 1: 全テスト最終確認**

```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npm test 2>&1 | tail -5
```

Expected: 155/155 グリーン。

- [ ] **Step 2: Phase 4a 全コミット SHA 取得**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git log --oneline 0a6a910..HEAD
```

各 Task の fix コミット SHA をメモ。

- [ ] **Step 3: Phase 2 監査レポート 6 ファイルに Resolved 注記追加**

各 Important の該当セクションに `（**[Resolved in Phase 4a commit <SHA>]**）` 形式で注記を追加。Phase 2.5 最終 Task と同じパターン。

- [ ] **Step 4: サニティウォークスルー更新**

`docs/phase2-audits/sanity-walkthrough-シナリオB.md` の末尾に「Phase 4a 完了後の再評価」セクションを追加：

```markdown
## Phase 4a 完了後の再評価（2026-04-25）

Phase 4a で Important 14 件が修正された結果、シナリオ B の挙動が以下のように変わった：

### 修正された主要な問題

- **04-I01/I02/I03/I04** (`<SHA>`): 年金制度対応で pension 値が全シナリオで +2-3%、退職期資産に影響
- **07-I01/08-I01/09-I02** (`<SHA>`): 清算・配当の税引きで長期資産 -5〜-10%
- **07-I04/08-I02** (`<SHA>`): NISA 温存順序で税効率 +5〜+10% 手取り増
- **08-I03/I04/I05** (`<SHA>`): 退職所得控除で退職金税引き適用
- **09-I01/I03** (`<SHA>`): 統合シム一貫性

### 判定の更新

- **Phase 2.5 完了時**: ✅ 妥当（Critical 10 件解消）
- **Phase 4a 完了後**: ✅ 妥当（Important 14 件も解消、より現実的な数値）
- **残存懸念**: Important 25 件（G5-G10）は Phase 4b 以降
```

- [ ] **Step 5: `expected-changes.md` に完了総括を追加**

末尾に：

```
---

## Phase 4a 完了総括

- **修正 Important**: 14 件 / 43 件
- **コミット数**: 約 12（1 setup + 5 fix + 5 SHA record + 1 最終）
- **全テスト**: 155/155 グリーン維持
- **snapshot 差分**: 意図通り更新済み

### Phase 4b への引き継ぎ

残り Important 25 件：
- G5 ライフイベント費用（7 件）
- G6 インフレ変数統一（1 件）
- G7 income_change モデル（1 件）
- G8 旧 NISA/振替（3 件）
- G9 パートナー関連（4 件）
- G10 住宅ローン残タスク（6 件）
- Minor 63 件（Phase 4c 以降候補）
```

- [ ] **Step 6: 最終コミット**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add docs/phase2-audits/ docs/phase4-fixes/expected-changes.md && git commit -m "docs(phase4a): mark Importants resolved and update walkthrough"
```

---

## 完了条件のまとめ

- [ ] Task 1-7 すべて完了
- [ ] `calc/pension.js`, `calc/asset-growth.js`, `calc/mortgage.js`, `calc/retirement.js`, `calc/integrated.js` の 5 ファイルが修正済み
- [ ] `docs/phase4-fixes/expected-changes.md` に全 5 グループの期待方向・実測が記録
- [ ] `npm test` で 155/155 グリーン
- [ ] Phase 2 監査レポート 6 ファイルに 14 件の Resolved 注記
- [ ] サニティウォークスルーに Phase 4a 評価追記
- [ ] コミット履歴 約 12 件（setup 1 + fix 5 + SHA record 5 + 最終 1）

## Phase 4b 以降への橋渡し

Phase 4a 完了後、残り Important 25 件：

- **G5 ライフイベント費用（7 件）**: `03-I01/I02/I05/I06/I07/I09/I10` → `calc/life-events.js`
- **G6 インフレ変数統一（1 件）**: `02-I02` → `calc/income-expense.js`
- **G7 income_change（1 件）**: `02-I03` → `calc/income-expense.js`
- **G8 旧 NISA/振替（3 件）**: `01-I01/I02/I03` → `calc/asset-growth.js`
- **G9 パートナー関連（4 件）**: `06-I01/I02/I03/I04` → `calc/integrated.js` / `calc/retirement.js`
- **G10 住宅ローン残タスク（6 件）**: `05-I01/I02/I03/I04/I05/I06` → `calc/mortgage.js`

Phase 4c で iDeCo 受給方法の UI 化（一時金/年金/併用選択）を希望なら別途計画。
