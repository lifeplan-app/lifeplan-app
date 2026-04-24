# Phase 4b Important UI変更不要18件 修正 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 2 監査で検出された Important 43 件のうち、Phase 4a で未対応かつ UI 変更不要の 18 件を 6 グループに分けて解消する。Phase 1 スナップショットは意図的に更新される。

**Architecture:** Phase 4a と同じグループ化ワークフロー。`calc/*.js`（Phase 3/3.5 で分離済み）を領域別に修正し、`docs/phase4b-fixes/expected-changes.md` に期待方向と実測を記録。

**Tech Stack:** Vanilla JS（classic script）、Vitest 2.x、Playwright 1.x（既存）

**基準設計書:** `docs/superpowers/specs/2026-04-25-phase4b-important-fixes-design.md`

**リポジトリ:** `/Users/nagatohiroki/ライフプランアプリ/`（main ブランチ直接作業）

**⚠️ 重要な前提:**
- 日本語パス `/Users/nagatohiroki/ライフプランアプリ/` はシェルで必ず **ダブルクォート** で囲む
- Node は nvm 経由：`source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 &&` を各コマンドに prefix
- UI 変更は一切行わない（計算ロジック修正のみ）
- 各グループで snapshot 差分が生じる（意図通り）
- 各グループで「期待方向」を事前宣言 → `git diff` 目視 → `test:update` の順守

---

## File Structure

### 新規作成

| パス | 役割 |
|------|------|
| `docs/phase4b-fixes/expected-changes.md` | 6 グループの期待方向と実測サマリー |

### 変更

| パス | 変更の概要 |
|------|-----------|
| `calc/asset-growth.js` | G8: 課税口座税引き近似、noNewContrib ガード、振替フォールバック |
| `calc/integrated.js` | G12: cash_reserved 隔離、_wInvestReturn 再計算 / G6: インフレ統一 / G9: 配偶者控除近似、パートナー退職後国民年金 |
| `calc/retirement.js` | G6: インフレ統一 / G9: パートナー昇給、加給年金、退職後国民年金 |
| `calc/life-events.js` | G5: 8 件のライフイベント費用修正 |
| `test/__snapshots__/scenario-snapshot.test.js.snap` | 全グループで意図的に更新 |
| `docs/phase4b-fixes/expected-changes.md` | 各グループで実測サマリー追記 |
| `docs/phase2-audits/*.md` | 最終 Task で該当 18 Important に Resolved 注記 |
| `docs/phase2-audits/sanity-walkthrough-シナリオB.md` | 最終 Task で Phase 4b 完了後の評価追記 |

### 変更しない

- `index.html`（UI 変更なし）
- `test/*.test.js`（テスト自体は不変、snapshot のみ変動）
- `test/helpers/*.js`
- `calc/utils.js`, `calc/income-expense.js`, `calc/mortgage.js`, `calc/pension.js`, `calc/scenarios.js`

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

## Task 1: Setup（expected-changes.md 雛形）

**Files:**
- Create: `docs/phase4b-fixes/expected-changes.md`

- [ ] **Step 1: ディレクトリ作成**

Run:
```bash
mkdir -p "/Users/nagatohiroki/ライフプランアプリ/docs/phase4b-fixes" && ls "/Users/nagatohiroki/ライフプランアプリ/docs/phase4b-fixes"
```

- [ ] **Step 2: `expected-changes.md` 雛形を作成**

Create `docs/phase4b-fixes/expected-changes.md` with:

```markdown
# Phase 4b 修正の期待方向と実測

Important 18 件を 6 グループに分けて修正した記録。
実施順序: G12 → G6 → G8 → G9 → G5（影響小 → 影響大）。

---

## Group 12: 投資プール残タスク（07-I02, 07-I03）

### 期待方向
（Task 2 実施時に記入）

### 実測サマリー
（Task 2 修正後に記入）

---

## Group 6: インフレ変数統一（02-I02）

### 期待方向
（Task 3 実施時に記入）

### 実測サマリー
（Task 3 修正後に記入）

---

## Group 8: 旧 NISA/振替（01-I01, 01-I02, 01-I03）

### 期待方向
（Task 4 実施時に記入）

### 実測サマリー
（Task 4 修正後に記入）

---

## Group 9: パートナー関連（06-I01, 06-I02, 06-I03, 06-I04）

### 期待方向
（Task 5 実施時に記入）

### 実測サマリー
（Task 5 修正後に記入）

---

## Group 5: ライフイベント費用（03-I01, 03-I02, 03-I03, 03-I05, 03-I06, 03-I07, 03-I09, 03-I10）

### 期待方向
（Task 6 実施時に記入）

### 実測サマリー
（Task 6 修正後に記入）
```

- [ ] **Step 3: コミット**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add docs/phase4b-fixes/expected-changes.md && git commit -m "chore(phase4b): scaffold expected-changes tracking"
```

---

## Task 2: Group 12 — 投資プール残タスク（07-I02, 07-I03）

**Files:**
- Modify: `calc/integrated.js`
- Modify: `docs/phase4b-fixes/expected-changes.md`

**狙い:** ウォーミングアップ。影響軽微な 2 件から。

### 07-I02: `cash_reserved` 隔離不足

`calc/integrated.js` の `_CASH_T` セットから `cash_reserved` を分離。生活費赤字補填対象から除外する。

Read で `_CASH_T` 定義を確認。現状 `new Set(['cash','cash_emergency','cash_special','cash_reserved','cash_surplus','savings','deposit'])` のような形。これを以下に変更：

```js
// [Phase 4b 07-I02] cash_reserved は用途決定済み資金のため生活費赤字補填対象外
const _CASH_T = new Set(['cash','cash_emergency','cash_special','cash_surplus','savings','deposit']);
const _CASH_RESERVED_T = new Set(['cash_reserved']);
```

`cash_reserved` のアセットは `cashPool` には加算するが、`virtualCash`（赤字補填判定）計算からは除外。または、新サブプール `reservedPool` として表示のみ保持する形でも可（実装者判断）。

### 07-I03: `_wInvestReturn` 時点固定 → 年次再計算

現状は `calcIntegratedSim` の年次ループ外で 1 回だけ計算。ループ内で「投資プール構成（`_investGD[i].data[y]` による）の時価加重」で毎年再計算する。

```js
// [Phase 4b 07-I03] 年次再計算（初年度時価ではなく、積立後の現在時価で加重）
const _wInvestReturnDynamic = (y) => {
  const totalNow = _investGD.reduce((s, g) => s + (g.data[y] || 0), 0);
  if (totalNow <= 0) return _wInvestReturn;
  return _investGD.reduce((s, g) => {
    const rate = (g.asset.return != null ? g.asset.return
      : (g.asset.annualReturn != null ? g.asset.annualReturn : 3)) / 100;
    return s + (g.data[y] || 0) * rate;
  }, 0) / totalNow;
};
```

ループ内で `_investDeficit *= (1 + _wInvestReturn)` を `_investDeficit *= (1 + _wInvestReturnDynamic(y))` に置換。初年度は既存値と一致するよう実装。

### Task 2 手順

- [ ] **Step 1: 期待方向を `expected-changes.md` に追記**

Edit で Group 12 `### 期待方向` を以下に置換：

```
- **対象**: 
  - 07-I02: cash_reserved をメインの現金プールから隔離（生活費赤字補填対象外）
  - 07-I03: _wInvestReturn を年次再計算（初年度時価加重ではなく毎年の時価加重）
- **期待される snapshot 差分**:
  - サンプルに `cash_reserved` タイプのアセットがあれば snapshot 変化（cashPool 減少、赤字補填が cash_reserved を侵食しない）
  - NISA 積立で投資プール構成が変わるシナリオ（特に若年層）で、長期（15年以上）の `_wInvestReturn` が上昇（NISA が積立で増え高リターン銘柄比率が上がる場合）→ 機会損失複利が増える方向
- **確認ポイント**: 
  - サンプルの `cash_reserved` アセット確認
  - 初年度 snapshot が既存と一致（初年度の `_wInvestReturn` は同じ）
```

- [ ] **Step 2: サンプルの `cash_reserved` 確認**

```bash
grep -l '"type": "cash_reserved"' "/Users/nagatohiroki/ライフプランアプリ/sample_data/"*.json
```

結果を報告に含める。

- [ ] **Step 3: `calc/integrated.js` を修正**

Read で `calc/integrated.js` を把握し、上記修正を適用。

- [ ] **Step 4-6: `npm test` → diff 目視 → test:update**

```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npm test 2>&1 | tail -10
```

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git diff test/__snapshots__/scenario-snapshot.test.js.snap | head -50
```

```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npm run test:update && npm test 2>&1 | tail -5
```

- [ ] **Step 7: 実測サマリー追記**

```
- **commit SHA**: （Step 8 で追記）
- **snapshot 差分行数**: 約 N 行
- **サンプルの `cash_reserved`**: (実測)
- **シナリオ別変化**: 
- **方向の評価**: 期待通り / 想定外
```

- [ ] **Step 8: コミット**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add calc/integrated.js test/__snapshots__/scenario-snapshot.test.js.snap docs/phase4b-fixes/expected-changes.md && git commit -m "fix(phase4b): cash_reserved isolation and dynamic wInvestReturn (07-I02/07-I03)"
```

- [ ] **Step 9: SHA 補完コミット**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git log -1 --format=%h
```

Edit で SHA 補完、コミット：

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add docs/phase4b-fixes/expected-changes.md && git commit -m "docs(phase4b): record Group 12 actual SHA"
```

---

## Task 3: Group 6 — インフレ変数統一（02-I02）

**Files:**
- Modify: `calc/integrated.js`
- Modify: `calc/retirement.js`
- Modify: `docs/phase4b-fixes/expected-changes.md`

**狙い:** `finance.inflationRate`（2%）と `retirement.inflationRate`（1.5%）の二重管理を統一。

### 修正方針

**後方互換を維持する統一戦略**：

1. `calc/integrated.js`（現役期インフレ・Phase 2.5 09-C01 で導入）: `state.finance?.inflationRate ?? 2` を使用（現状維持）
2. `calc/retirement.js`（退職期インフレ）: `state.retirement?.inflationRate` が明示設定されていればそちら、未設定/null なら `state.finance?.inflationRate ?? 2` にフォールバック

```js
// [Phase 4b 02-I02] インフレ変数統一
// retirement.inflationRate が明示設定なら優先、未設定なら finance.inflationRate を継承
function _getInflationRate(state) {
  const r = state.retirement || {};
  const f = state.finance || {};
  if (r.inflationRate != null && r.inflationRate !== '') {
    return parseFloat(r.inflationRate) / 100;
  }
  return (parseFloat(f.inflationRate) || 2) / 100;
}
```

両ファイルでこのヘルパを使う（classic script なので `calc/retirement.js` に定義して `calc/integrated.js` からも呼べる）。

### Task 3 手順

- [ ] **Step 1: 期待方向追記**

```
- **対象**: 02-I02 インフレ変数二重管理の解消
- **期待される snapshot 差分**:
  - サンプルが `retirement.inflationRate` を明示設定していれば従来通り（フォールバックなし）、差分ゼロの可能性
  - サンプルが未設定なら `finance.inflationRate`（2%）に切替 → 退職期支出が **微増**（従来 1.5% → 2%）
  - シナリオBの退職期 annualExpense が 30 年で 1.5^30 ≈ 1.56 → 2^30 ≈ 1.81 へ、約 16% 増
- **確認ポイント**: サンプルの `retirement.inflationRate` 設定を事前 grep
```

- [ ] **Step 2: サンプル設定確認**

```bash
grep -l 'retirement.*inflationRate\|"inflationRate"' "/Users/nagatohiroki/ライフプランアプリ/sample_data/"*.json
```

結果を期待方向に反映。

- [ ] **Step 3: `calc/retirement.js` に `_getInflationRate` 追加**

`calcRetirementSimWithOpts` の外に配置。関数本体は上記コード。

既存の `retirement.inflationRate` 参照箇所を `_getInflationRate(state)` に置換。

- [ ] **Step 4: `calc/integrated.js` で同ヘルパ使用**

Phase 2.5 09-C01 で追加した現役期インフレ計算箇所（`const inflationRate = ...`）を `_getInflationRate(state)` 経由に統一。

- [ ] **Step 5-9: test → diff → update → commit**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add calc/integrated.js calc/retirement.js test/__snapshots__/scenario-snapshot.test.js.snap docs/phase4b-fixes/expected-changes.md && git commit -m "fix(phase4b): unify inflation rate across finance/retirement (02-I02)"
```

SHA record コミットも追加。

---

## Task 4: Group 8 — 旧 NISA/振替（01-I01, 01-I02, 01-I03）

**Files:**
- Modify: `calc/asset-growth.js`
- Modify: `docs/phase4b-fixes/expected-changes.md`

### 01-I01: 課税口座の毎年課税近似 → 含み益ベース近似

現状 `effectiveReturn(annualReturn, taxType)` で `tokutei` なら `annualReturn * (1 - TAX_RATE)` として複利適用（毎年課税）。これを「税引前複利運用 + 年次の含み益増加分に実効税率を適用」に近似。

Phase 4a で導入した `calcCapitalGainsTax` を活用。`calcAssetGrowth` 内で年次の利息相当を税引前で計算し、**運用益部分だけに税率を適用**する近似：

```js
// [Phase 4b 01-I01] 課税口座は「税引前複利 + 年次の利益部分に税」の近似
// 完全な売却時一括課税は Phase 5 で検討
// 現状の effectiveReturn 分岐はそのまま使うが、`tokutei` の扱いを精密化
```

具体的には、`calcAssetGrowth` の値更新式で、毎年の「前年比増加分のうち利益部分」にだけ `TAX_RATE` を適用する形に変える。実装量を抑えるため、Phase 5 相当の完全実装は避け、**年次キャッシュフローから微調整する簡易近似**に留める。

**注意:** Phase 1 snapshot 影響が大きい修正。期待方向で「シナリオ C/D の長期資産が NISA/iDeCo 以外のプール分だけ微増」と宣言し、差分目視で妥当性確認。

### 01-I02: 旧 NISA noNewContrib の非 UI 経路ガード

`calc/asset-growth.js` の `calcAssetGrowth` 内で：

```js
// [Phase 4b 01-I02] 旧 NISA は期間終了後は新規積立不可（UI ガードの非 UI 経路フォールバック）
const assetType = ASSET_TYPES[a.type];
if (assetType?.noNewContrib && a.endYear && yr > a.endYear) {
  annualContrib = 0;
}
```

既存のロジック（`monthlyContrib` / `annualBonus` 処理）の直前に挿入。

### 01-I03: 振替サイクルのフォールバック取りこぼし

`calc/asset-growth.js` の `calcAllAssetGrowth` 内の `_wastedContribsByYear` 補正ロジックを精密化。Read で現状コードを把握し、トポロジカル順の外側で発生する振替（サイクル疑いがある場合）も `_wastedContribsByYear` に正しく記録されるよう修正。

実装は最小限：サイクル検出時のフォールバック（`extraMap[targetId]` への加算を諦めて `_wastedContribsByYear[y]` に加算する経路）を既存コードで確認し、漏れがあれば補完。

### Task 4 手順

- [ ] **Step 1: 期待方向追記**

```
- **対象**: 
  - 01-I01: 課税口座の毎年課税近似を「税引前複利+年次利益税」の簡易改善
  - 01-I02: 旧 NISA noNewContrib 非 UI 経路ガード
  - 01-I03: 振替サイクル _wastedContribsByYear 補正漏れ
- **期待される snapshot 差分**:
  - 01-I01: 課税口座（特定口座）資産があるシナリオ（C 山本誠、D 中村博）で長期 endAssets が微増（+1〜3%）
  - 01-I02: サンプルに旧 NISA（nisa_old_tsumitate, nisa_old_general）があれば差分。なければゼロ
  - 01-I03: サイクル発生サンプルがあれば差分。通常なら差分ゼロ
- **確認ポイント**: サンプルの 旧 NISA 有無を事前 grep
```

- [ ] **Step 2: サンプルの旧 NISA 確認**

```bash
grep -l '"type": "nisa_old' "/Users/nagatohiroki/ライフプランアプリ/sample_data/"*.json
```

- [ ] **Step 3-9: 実装 → test → diff → update → commit**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add calc/asset-growth.js test/__snapshots__/scenario-snapshot.test.js.snap docs/phase4b-fixes/expected-changes.md && git commit -m "fix(phase4b): old NISA guard, transfer cycle fallback, tax deferred approx (01-I01/I02/I03)"
```

---

## Task 5: Group 9 — パートナー関連（06-I01, 06-I02, 06-I03, 06-I04）

**Files:**
- Modify: `calc/retirement.js`
- Modify: `calc/integrated.js`
- Modify: `docs/phase4b-fixes/expected-changes.md`

### 06-I01: リタイア期パートナー就労収入凍結（昇給未反映）

`calc/retirement.js` の `calcRetirementSimWithOpts` 内、`partnerWorkIncome` 計算で `partnerGrowthRate` を累積適用。

現状 `_partnerBaseAnnual` を「UI 入力値そのまま」使っているはず。これを、同年度までの経過年数（`yearsElapsed`）に基づいて昇給適用：

```js
// [Phase 4b 06-I01] パートナー就労収入に昇給累積適用
const partnerGrowthRate = (parseFloat(state.finance?.partnerGrowthRate) || 0) / 100;
const partnerUntilAge = parseInt(state.finance?.partnerGrowthUntilAge) || partnerCurrentAge + 30;
const partnerGrowthYears = Math.max(0, Math.min(
  partnerUntilAge - partnerCurrentAge,
  age - partnerCurrentAge  // 退職シミュ開始年からの経過
));
const _partnerBaseAnnualWithGrowth = _partnerBaseAnnual * Math.pow(1 + partnerGrowthRate, partnerGrowthYears);
partnerWorkIncome = _partnerBaseAnnualWithGrowth;
```

Phase 2.5 の `02-C01 / 06-C01` で `partnerCurrentAge` は `getIncomeForYearWithGrowth` に定義済み。`calcRetirementSimWithOpts` 側でも同じパターンを使う。

### 06-I02: 配偶者控除近似

`calc/integrated.js` で gross モード時の本人収入計算後、配偶者収入が 103 万円以下（厳密には合計所得 48 万円以下）なら本人の課税所得から 38 万円を控除する近似：

```js
// [Phase 4b 06-I02] 配偶者控除の近似（合計所得 48 万円以下で 38 万円控除）
// 厳密実装は calcTakeHome 改修が必要（Phase 4c 候補）
const partnerAnnualIncome = (parseFloat(state.finance?.partnerIncome) || 0) * 12
                          + (parseFloat(state.finance?.partnerBonus) || 0);
if (state.finance?._inputMode === 'gross' && partnerAnnualIncome <= 103) {
  // 本人課税所得から 38 万円控除の近似：本人 annualIncome に係数 0.995 程度を乗算
  // 正確な税率連動は Phase 4c
  // 本フェーズでは「パートナー無収入シナリオで本人 annualIncome を 1% 程度増える」影響を出すだけ
  annualIncome *= 1.005;  // 簡易近似（実効税率 15-20% × 38 万控除 ≈ 5-8 万円/年 ≈ 本人年収 500 万で 1-1.5%）
}
```

**注意:** 本格実装は Phase 4c。本 Task は近似として最小影響で入れる。

### 06-I03: パートナー退職後の国民年金保険料未計上

`calc/integrated.js` と `calc/retirement.js` のパートナー退職後判定に、60 歳未満なら国民年金保険料 17,510 円/月 × 12 = 21.012 万円/年を年次支出に加算：

```js
// [Phase 4b 06-I03] パートナー退職後で 60 歳未満なら国民年金保険料を加算
const partnerRetireYear = ...; // 既存の判定
const partnerAge60Year = partnerBirthYear ? partnerBirthYear + 60 : null;
if (partnerRetireYear && yr >= partnerRetireYear && partnerAge60Year && yr < partnerAge60Year) {
  annualExpense += 21.012; // 万円/年
}
```

### 06-I04: 加給年金・振替加算

本人が厚生年金 20 年以上 + 配偶者 65 歳未満で加給年金約 40 万円/年を加算。`calc/retirement.js` の pensionAnnual 計算に追加：

```js
// [Phase 4b 06-I04] 加給年金（簡易）：本人が 65 歳到達後、配偶者 65 歳未満なら 40 万円/年
const hasKakyu = age >= 65 && partnerCurrentAge + (age - currentAge) < 65;
if (hasKakyu) {
  pensionAnnual += 40;
}
```

### Task 5 手順

- [ ] **Step 1: 期待方向追記**

```
- **対象**: 
  - 06-I01: リタイア期パートナー就労収入に昇給累積適用（20 年で 48% 増）
  - 06-I02: 配偶者控除の簡易近似（gross モードのみ）
  - 06-I03: パートナー退職後 60 歳未満の国民年金保険料 21 万円/年
  - 06-I04: 加給年金（本人 65-配偶者 65 期間で 40 万円/年）
- **期待される snapshot 差分**:
  - シナリオ B 鈴木健太（パートナーあり）でリタイア後のパートナー就労収入増（06-I01）、年齢差があれば加給年金（06-I04）
  - シナリオ C 山本誠（パートナーあり）で同様
  - 06-I02 は全サンプル net モードのため差分ゼロ
  - 06-I03 はパートナー 60 歳未満退職のケース限定
- **確認ポイント**: サンプル 5 件の partnerTargetAge とパートナー年齢差
```

- [ ] **Step 2: サンプル確認**

```bash
grep -A1 'partnerTargetAge\|partnerBirth' "/Users/nagatohiroki/ライフプランアプリ/sample_data/"*.json | head -20
```

- [ ] **Step 3-9: 実装 → test → diff → update → commit**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add calc/retirement.js calc/integrated.js test/__snapshots__/scenario-snapshot.test.js.snap docs/phase4b-fixes/expected-changes.md && git commit -m "fix(phase4b): partner retirement income growth, spouse deduction, 国民年金, 加給年金 (06-I01/I02/I03/I04)"
```

---

## Task 6: Group 5 — ライフイベント費用（03-I01/I02/I03/I05/I06/I07/I09/I10）

**Files:**
- Modify: `calc/life-events.js`
- Modify: `docs/phase4b-fixes/expected-changes.md`

**狙い:** Phase 4b で最大の修正グループ。8 件のライフイベント費用キャリブレーション。

### 03-I05: 公立幼稚園 6 万円 → 18.46 万円

`EDU_COST.kindergarten.public` の値更新。文科省令和 5 年度「子供の学習費調査」基準。

### 03-I01: 介護一時費用 47.2 万円

`calcLECostByYear` の介護計算に、介護開始年（`care.startAge` 到達年）に一時費用 47.2 万円を加算：

```js
// [Phase 4b 03-I01] 介護一時費用（平均 47.2 万円、生命保険文化センター 2024）
if (care && care.startAge && ageAtYear === care.startAge) {
  const oneTimeFee = parseFloat(care.oneTimeFee) || 47.2;
  costs.care += oneTimeFee;
}
```

### 03-I02: `maternityMonths` 旧互換パスの賞与除外

旧互換パスを Read で特定し、`monthly × 12` を使う際にボーナス部分を除外。

### 03-I03: 奨学金利息補正

JASSO 第二種の金利 1.641% を反映した返済期間補正：

```js
// [Phase 4b 03-I03] JASSO 第二種の利息を反映
const scholarshipInterestRate = 0.01641;
// 奨学金残高が利息分も含むと仮定し、返済期間を利息補正
// 簡易: 返済月額・総額が同じ前提で、実質的に 1 年程度長く返済が続く
```

実装は簡易的に：「`scType === 'jasso_2'` なら返済終了年を + 1 年」が最小実装。

### 03-I06: 保育料所得連動（最小実装）

保育料を `state.finance.income`（月収、万円）から 3 段階切替：

```js
// [Phase 4b 03-I06] 保育料所得連動（最小実装）
const monthlyIncome = parseFloat(state.finance?.income) || 0;
const annualIncomeForNursery = monthlyIncome * 12;  // 年収（万円）
const nurseryCost = annualIncomeForNursery >= 800 ? 54
                  : annualIncomeForNursery >= 500 ? 30
                  : 20;  // 万円/年、公立保育園の目安
```

`EDU_COST.nursery.public` の代わりに使用。private は現状値維持。

### 03-I07: 育休給付 181 日目以降 50%

`calcLeaveReduction` で 180 日境界を設ける：

```js
// [Phase 4b 03-I07] 育休給付 180 日で 67% → 50% に変化
const leaveMonths = Math.min(p.leaveMonths || 0, 12);
const firstHalfMonths = Math.min(leaveMonths, 6); // 〜180 日
const secondHalfMonths = Math.max(0, leaveMonths - 6); // 181 日以降
const reduction = monthly * (firstHalfMonths * (1 - 0.67) + secondHalfMonths * (1 - 0.50));
```

### 03-I09: 出産年重複（育休+保育費排他）

育休期間中（`age === 0` かつ `leaveMonths > 0`）の年は `nursery` 費用を 0 に：

```js
// [Phase 4b 03-I09] 育休期間中は保育費計上しない
if (age === 0 && (p.mom?.leaveMonths || p.dad?.leaveMonths)) {
  costs.nursery = 0;  // 当年 nursery 費用を打ち消す
}
```

### 03-I10: 双子育休 2 倍計上 → reduce 集約

`children` 配列を `birthYear` で reduce：

```js
// [Phase 4b 03-I10] 同一 birthYear の子は 1 組として扱う（双子対応）
const childrenGrouped = (le.children || []).reduce((acc, c) => {
  const existing = acc.find(g => g.birthYear === c.birthYear);
  if (existing) {
    // 教育費・保育費は人数分加算（× 2 など）、育休は 1 回分
    existing.count += 1;
    existing.plans.push(c);
  } else {
    acc.push({ birthYear: c.birthYear, count: 1, plans: [c] });
  }
  return acc;
}, []);
```

各グループ処理で育休減収は 1 回、教育費・保育費は `count` 倍で集約。

### Task 6 手順

- [ ] **Step 1: 期待方向追記**

```
- **対象**: 03-I01/I02/I03/I05/I06/I07/I09/I10 の 8 件
- **期待される snapshot 差分**:
  - 最大規模の変化予想：
    - 03-I05 幼稚園 +12 万 × 3 年 = 36 万/子
    - 03-I06 保育料 所得帯で ±14〜34 万/年
    - 03-I07 育休給付 長期育休で +20-30 万/年減収少なく
    - 03-I01 介護一時費用 47.2 万
  - シナリオ B/C/D/E（子持ち）で 30-40 歳の資産伸び鈍化（教育費増）
  - シナリオ D 中村博（親介護想定あれば）介護開始年に一時費用ジャンプ
- **確認ポイント**:
  - EDU_COST.kindergarten.public の値更新
  - サンプルの birthYear 重複（双子）・介護設定確認
  - 予想される金額規模を事前計算
```

- [ ] **Step 2: サンプルの care / twins / maternity 確認**

```bash
grep -E 'startAge\|birthYear\|leaveMonths\|maternityMonths' "/Users/nagatohiroki/ライフプランアプリ/sample_data/"*.json | head -30
```

- [ ] **Step 3-9: 実装 → test → diff → update → commit**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add calc/life-events.js test/__snapshots__/scenario-snapshot.test.js.snap docs/phase4b-fixes/expected-changes.md && git commit -m "fix(phase4b): life event costs calibration 8 items (03-I01-I10 except I04/I08)"
```

---

## Task 7: 最終検証と Phase 2 監査レポート注記

**Files:**
- Modify: `docs/phase2-audits/*.md` — 18 Important に Resolved 注記
- Modify: `docs/phase2-audits/sanity-walkthrough-シナリオB.md` — Phase 4b 完了後の再評価追記
- Modify: `docs/phase4b-fixes/expected-changes.md` — 完了総括

### 注記対象マッピング

| 監査ファイル | Important ID | コミット SHA |
|------------|-------------|------------|
| `01-asset-growth.md` | 01-I01, 01-I02, 01-I03 | Task 4 fix SHA |
| `02-income-expense.md` | 02-I02 | Task 3 fix SHA |
| `03-life-events.md` | 03-I01, I02, I03, I05, I06, I07, I09, I10 | Task 6 fix SHA |
| `06-partner-retirement.md` | 06-I01, 06-I02, 06-I03, 06-I04 | Task 5 fix SHA |
| `07-two-pool-model.md` | 07-I02, 07-I03 | Task 2 fix SHA |

### Task 7 手順

- [ ] **Step 1: 全テスト最終確認**

```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npm test 2>&1 | tail -5
```

Expected: 155/155 グリーン。

- [ ] **Step 2: Phase 4b 全コミット SHA 取得**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git log --oneline 5da098c..HEAD
```

- [ ] **Step 3: Phase 2 監査レポート 5 ファイルに Resolved 注記追加**

各 Important の該当セクションに `（**[Resolved in Phase 4b commit <SHA>]**）` 形式で注記追加。

- [ ] **Step 4: サニティウォークスルー更新**

`docs/phase2-audits/sanity-walkthrough-シナリオB.md` の末尾に Phase 4b 完了後の再評価セクションを追加。

- [ ] **Step 5: `expected-changes.md` に完了総括**

- [ ] **Step 6: 最終コミット**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add docs/phase2-audits/ docs/phase4b-fixes/expected-changes.md && git commit -m "docs(phase4b): mark Importants resolved and update walkthrough"
```

---

## 完了条件

- [ ] Task 1〜7 完了
- [ ] `calc/` の 4 ファイル修正済み（`asset-growth.js`, `integrated.js`, `retirement.js`, `life-events.js`）
- [ ] `docs/phase4b-fixes/expected-changes.md` に 6 グループの期待・実測記録
- [ ] `npm test` で 155/155 グリーン
- [ ] Phase 2 監査レポート 5 ファイルに 18 件の Resolved 注記
- [ ] サニティウォークスルーに Phase 4b 評価追記
- [ ] コミット履歴 約 14 件（setup 1 + fix 6 + SHA record 6 + 最終 1）

## Phase 4c への橋渡し

Phase 4b 完了後、残り Important 7 件（UI 変更が必要）:

- **G7 income_change モデル**: 02-I03
- **G10 住宅ローン UI**: 05-I01（子育て特例）、05-I02（頭金）、05-I03（シナリオ連動）
- **G10 住宅ローン計算**: 05-I04（借換諸費用）、05-I05（NaN 伝播）、05-I06（同年複数イベント順序）
- **06-I02 本格実装**: 近似を calcTakeHome に本実装

加えて iDeCo 受給方法 UI 化（一時金/年金/併用・60-75 歳選択）も Phase 4c で検討可能。
