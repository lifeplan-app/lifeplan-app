# Phase 4c Important UI変更あり8件 修正 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 2 監査で検出された Important 残 8 件（UI 変更を含む）を 6 グループに分けて解消する。Phase 4c 完了時点で監査検出 Important は全 40 件が解決状態となる。

**Architecture:** Phase 4b と同じグループ化ワークフロー。`calc/*.js` の純粋関数と `index.html` の UI / グルー層を組み合わせて修正し、`docs/phase4c-fixes/expected-changes.md` に期待方向と実測を記録。

**Tech Stack:** Vanilla JS（classic script）、Vitest 2.x、Playwright 1.x（既存）

**基準設計書:** `docs/superpowers/specs/2026-04-25-phase4c-important-fixes-design.md`

**リポジトリ:** `/Users/nagatohiroki/ライフプランアプリ/`（main ブランチ直接作業）

**⚠️ 重要な前提:**
- 日本語パス `/Users/nagatohiroki/ライフプランアプリ/` はシェルで必ず **ダブルクォート** で囲む
- Node は nvm 経由：`source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 &&` を各コマンドに prefix
- UI 変更を含む（Phase 4b と違い、`index.html` も一部修正する）
- G9b で snapshot 差分が大きく出る可能性あり（現役期の配偶者控除が効くため）
- 各グループで「期待方向」を事前宣言 → `git diff` 目視 → `test:update` の順守
- UI 変更のみのタスク（G10-scenario）は snapshot 変化なし（単体テストでも検証不可のため、動作確認は index.html を開いて手動実施）

---

## File Structure

### 新規作成

| パス | 役割 |
|------|------|
| `docs/phase4c-fixes/expected-changes.md` | 6 グループの期待方向と実測サマリー |

### 変更

| パス | 変更の概要 |
|------|-----------|
| `calc/mortgage.js` | G10-quick: NaN ガード・イベント順序固定 / G10-refi: refi.cost 加算 / G10-housing: 子育て特例 uplift |
| `calc/income-expense.js` | G7: continueGrowth フラグ適用 / G9b: calcSpouseDeduction ヘルパ追加 |
| `calc/retirement.js` | G9b: Phase 4b 支出側近似の削除 |
| `calc/integrated.js` | G9b: Phase 4b 支出側近似（annualIncome ×1.005）の削除 |
| `index.html` | G7: cashFlowEvent モーダルに continueGrowth / G9b: calcTakeHome 配偶者控除 / G10-refi: refi 諸費用欄 / G10-housing: 子育て特例トグル・頭金フィールド / G10-scenario: 「メインプランに適用」ボタン |
| `test/regression.test.js` | 各グループで `[BUG#n]` リグレッションテスト追加 |
| `test/__snapshots__/scenario-snapshot.test.js.snap` | G9b で意図的に更新される可能性あり |
| `docs/phase4c-fixes/expected-changes.md` | 各グループで実測サマリー追記 |
| `docs/phase2-audits/02-income-expense.md` | 最終 Task で 02-I03 に Resolved 注記 |
| `docs/phase2-audits/05-mortgage.md` | 最終 Task で 05-I01〜I06 に Resolved 注記 |
| `docs/phase2-audits/06-partner-retirement.md` | 最終 Task で 06-I02 本実装の注記更新 |
| `docs/phase2-audits/sanity-walkthrough-シナリオB.md` | 最終 Task で Phase 4c 完了後の評価追記 |

### 変更しない

- `calc/utils.js`, `calc/asset-growth.js`, `calc/life-events.js`, `calc/pension.js`, `calc/scenarios.js`
- `test/helpers/*.js`（sandbox の state shim は既存形で充足）

---

## 共通ワークフロー（Task 2 以降で繰り返す）

```
1. expected-changes.md に Group N の「期待方向」を事前宣言
2. calc/*.js と index.html を修正
3. test/regression.test.js にリグレッションテスト追加（計算側の修正がある場合）
4. npm test 実行 → 新規テスト＋既存 155 が通ることを確認
5. snapshot 差分発生なら git diff test/__snapshots__/ で方向確認 → npm run test:update
6. expected-changes.md に実測サマリー追記
7. コミット（fix + 更新 snap + expected-changes.md）
8. 実コミット SHA を expected-changes.md に追記 + 追加コミット
```

---

## Task 1: Setup（expected-changes.md 雛形）

**Files:**
- Create: `docs/phase4c-fixes/expected-changes.md`

- [ ] **Step 1: ディレクトリ作成**

Run:
```bash
mkdir -p "/Users/nagatohiroki/ライフプランアプリ/docs/phase4c-fixes"
```

- [ ] **Step 2: `expected-changes.md` 雛形を作成**

Create `docs/phase4c-fixes/expected-changes.md` with:

```markdown
# Phase 4c 修正の期待方向と実測

Important 8 件を 6 グループに分けて修正した記録。
実施順序: G10-quick → G7 → G9b → G10-refi → G10-housing → G10-scenario
（計算のみ・バグ修正 → UI 拡張へ段階的に進行）。

---

## Group 10-quick: 住宅ローン計算バグ修正（05-I05, 05-I06）

### 期待方向
（Task 2 実施時に記入）

### 実測サマリー
（Task 2 修正後に記入）

---

## Group 7: income_change 昇給継続フラグ（02-I03）

### 期待方向
（Task 3 実施時に記入）

### 実測サマリー
（Task 3 修正後に記入）

---

## Group 9b: calcTakeHome 配偶者控除本実装（06-I02）

### 期待方向
（Task 4 実施時に記入）

### 実測サマリー
（Task 4 修正後に記入）

---

## Group 10-refi: 借換諸費用（05-I04）

### 期待方向
（Task 5 実施時に記入）

### 実測サマリー
（Task 5 修正後に記入）

---

## Group 10-housing: 子育て特例＋頭金（05-I01, 05-I02）

### 期待方向
（Task 6 実施時に記入）

### 実測サマリー
（Task 6 修正後に記入）

---

## Group 10-scenario: シナリオ連動（05-I03）

### 期待方向
（Task 7 実施時に記入）

### 実測サマリー
（Task 7 修正後に記入）
```

- [ ] **Step 3: コミット**

Run:
```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add docs/phase4c-fixes/expected-changes.md && git commit -m "chore(phase4c): scaffold expected-changes tracking"
```

---

## Task 2: G10-quick（05-I05 NaN 伝播 + 05-I06 イベント順序）

**Files:**
- Modify: `calc/mortgage.js:21-69`（`calcMortgageSchedule`）
- Modify: `test/regression.test.js` — 2 件の BUG ケース追加

### 2-1. 期待方向の宣言

- [ ] **Step 1: `expected-changes.md` の Group 10-quick 「期待方向」を記入**

Edit `docs/phase4c-fixes/expected-changes.md` の Group 10-quick セクションに以下を追記：

```markdown
### 期待方向
- **05-I05**: `principal × r ≥ monthly` で `newN` が `NaN` / `Infinity` になる場合、即完済扱い（`principal = 0, endYear = year`）にフォールバック。
- **05-I06**: 同年に `refi` と `prepay` が混在する場合、常に `refi → prepay` の順で処理する（既存の `sort((a,b)=>a.year-b.year)` は年のみでソートし同年内順不定）。

### 想定される snapshot 差分
既存 5 シナリオのうち、NaN 発症条件（極端に低い monthly）や同年 refi+prepay を持つサンプルは皆無のため **snapshot 差分なし**。リグレッションテスト（test/regression.test.js）で挙動を固定する。
```

### 2-2. テスト先行（TDD）

- [ ] **Step 2: `test/regression.test.js` に failing test を追加**

Append at the bottom of `test/regression.test.js`:

```javascript
// ─── BUG#2 (Phase 4c): 繰上返済で利息 ≥ 月額のケースの NaN 伝播 ──────────
// 修正前: principal × r ≥ monthly のとき log(M / (M − P×r)) が NaN
//   → endYear = year + NaN → ループ継続条件 false 評価で残りスケジュール消失
// 修正後: NaN/Infinity 検出時は即完済扱い（principal = 0, endYear = year）
describe('[BUG#2] 繰上返済 NaN ガード（Phase 4c 05-I05）', () => {
  let calcMortgageSchedule;
  beforeAll(() => {
    loadCalc('utils.js');
    loadCalc('mortgage.js');
    sb = getSandbox();
    calcMortgageSchedule = sb.calcMortgageSchedule;
  });

  it('繰上返済額が大きく利息 ≥ 月額になっても NaN を生成せず schedule を閉じる', () => {
    sb.state.lifeEvents = {
      mortgage: {
        amount: 3000, startYear: 2026, term: 35, rate: 1.5,
        events: [
          // 1 年目に極端に大きな繰上（残 100 万相当まで一気に返すが、method='payment' で月額が過小再計算されるケース）
          { year: 2026, type: 'prepay', amount: 2900, method: 'payment' },
          // 2 年目に借換で月額をわずかに（利息未満になる条件）
          { year: 2027, type: 'refi', newRate: 1.5, newTerm: 30 },
          { year: 2027, type: 'prepay', amount: 50, method: 'period' },
        ]
      }
    };
    const schedule = calcMortgageSchedule();
    // 結果: すべての entry が Number であり NaN を含まない
    for (const [, v] of schedule.entries()) {
      expect(Number.isFinite(v.monthlyPayment)).toBe(true);
      expect(Number.isFinite(v.principalEnd)).toBe(true);
    }
  });
});

// ─── BUG#3 (Phase 4c): 同年複数イベントの順序依存 ──────────
// 修正前: events.sort((a,b)=>a.year-b.year) は年のみでソート → 同年内は登録順
// 修正後: 同年内は refi → prepay の順に安定ソート
describe('[BUG#3] 同年 refi+prepay の順序固定（Phase 4c 05-I06）', () => {
  let calcMortgageSchedule;
  beforeAll(() => {
    loadCalc('utils.js');
    loadCalc('mortgage.js');
    sb = getSandbox();
    calcMortgageSchedule = sb.calcMortgageSchedule;
  });

  it('同じ年に prepay と refi が両方あるとき、登録順に関わらず refi → prepay の順で処理される', () => {
    // 登録順を変えた 2 通りで結果が一致することを確認
    const commonBase = { amount: 3000, startYear: 2026, term: 30, rate: 2.0 };
    const eventsRefiFirst = [
      { year: 2030, type: 'refi', newRate: 1.0, newTerm: 25 },
      { year: 2030, type: 'prepay', amount: 300, method: 'period' },
    ];
    const eventsPrepayFirst = [
      { year: 2030, type: 'prepay', amount: 300, method: 'period' },
      { year: 2030, type: 'refi', newRate: 1.0, newTerm: 25 },
    ];
    sb.state.lifeEvents = { mortgage: { ...commonBase, events: eventsRefiFirst } };
    const a = calcMortgageSchedule();
    sb.state.lifeEvents = { mortgage: { ...commonBase, events: eventsPrepayFirst } };
    const b = calcMortgageSchedule();
    // 2030 年の principalEnd が一致すれば順序固定が効いている
    expect(a.get(2030).principalEnd).toBeCloseTo(b.get(2030).principalEnd, 1);
  });
});
```

- [ ] **Step 3: テスト実行で失敗確認**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npx vitest run test/regression.test.js 2>&1 | tail -20
```

Expected: BUG#2（NaN）は NaN が漏れて失敗、BUG#3 は現状結果が一致しないため失敗。

### 2-3. 実装

- [ ] **Step 4: `calc/mortgage.js` の `calcMortgageSchedule` を修正**

Edit `calc/mortgage.js:29`（events sort）と L46-48（newN 計算）:

**Before (L29):**
```javascript
  const events = (m.events || []).slice().sort((a, b) => a.year - b.year);
```

**After (L29):**
```javascript
  // [Phase 4c 05-I06] 同年内は refi → prepay の順に固定
  const eventOrder = { refi: 0, prepay: 1 };
  const events = (m.events || []).slice().sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return (eventOrder[a.type] ?? 99) - (eventOrder[b.type] ?? 99);
  });
```

**Before (L44-48):**
```javascript
        } else {
          // 期間短縮型：同monthly額で残期間再計算
          const r = rate / 100 / 12;
          const newN = r === 0 ? Math.ceil(principal / monthly)
            : Math.ceil(Math.log(monthly / (monthly - principal * r)) / Math.log(1 + r));
          endYear = year + Math.ceil(newN / 12);
        }
```

**After (L44-54):**
```javascript
        } else {
          // 期間短縮型：同monthly額で残期間再計算
          // [Phase 4c 05-I05] principal×r ≥ monthly のとき newN が NaN/Infinity になるため即完済扱いにフォールバック
          const r = rate / 100 / 12;
          let newN;
          if (r === 0) {
            newN = Math.ceil(principal / monthly);
          } else if (principal * r >= monthly) {
            // 利息が月額以上 → 返済不能状態、即完済にフォールバック
            principal = 0;
            endYear = year;
            continue;
          } else {
            newN = Math.ceil(Math.log(monthly / (monthly - principal * r)) / Math.log(1 + r));
          }
          if (!Number.isFinite(newN)) {
            principal = 0;
            endYear = year;
            continue;
          }
          endYear = year + Math.ceil(newN / 12);
        }
```

- [ ] **Step 5: テスト実行でパス確認**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npm test 2>&1 | tail -10
```

Expected: 157/157 passing（既存 155 + 新規 2）。snapshot 差分なし。

### 2-4. 記録・コミット

- [ ] **Step 6: `expected-changes.md` に実測サマリーを記入**

Edit Group 10-quick の「実測サマリー」に以下を追記：

```markdown
### 実測サマリー
- snapshot 差分: **なし**（既存 5 シナリオに該当条件のイベント未登録）
- regression.test.js に BUG#2/#3 を追加して挙動固定
- テスト: 157/157 グリーン（155 + 新規 2）
```

- [ ] **Step 7: コミット**

Run:
```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add calc/mortgage.js test/regression.test.js docs/phase4c-fixes/expected-changes.md && git commit -m "fix(phase4c): mortgage prepayment NaN guard and same-year event order (05-I05/I06)"
```

- [ ] **Step 8: 実 SHA を expected-changes.md に追記**

Run:
```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git log -1 --format=%H
```

Edit `docs/phase4c-fixes/expected-changes.md` の Group 10-quick サマリーに `- 実コミット: <SHA 7桁>` を追記。

Run:
```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add docs/phase4c-fixes/expected-changes.md && git commit -m "docs(phase4c): record Group 10-quick actual SHA"
```

---

## Task 3: G7（02-I03 income_change 昇給継続フラグ）

**Files:**
- Modify: `calc/income-expense.js:95-138`（`getIncomeForYearWithGrowth`）
- Modify: `index.html`（cashFlowEvent 編集モーダル、type:income_change 関連）
- Modify: `test/regression.test.js` — BUG#4 追加

### 3-1. 期待方向の宣言

- [ ] **Step 1: `expected-changes.md` の Group 7 「期待方向」を記入**

Edit `docs/phase4c-fixes/expected-changes.md` の Group 7 セクションに以下を追記：

```markdown
### 期待方向
- `cashFlowEvents[{type:'income_change'}]` に `continueGrowth: boolean` を追加（既定 `false`）。
- `continueGrowth === true` の場合、イベント額 `baseIncome` を起点に `× pow(1 + growthRate, yr − eventYear)` を適用。`incomeGrowthUntilAge` 超過年は昇給停止。
- 既存サンプル 5 シナリオはすべて `continueGrowth` 未指定 → `false` 扱い → 従来挙動を維持 → snapshot 差分なし。
```

### 3-2. テスト先行

- [ ] **Step 2: `test/regression.test.js` に failing test を追加**

Append at the bottom:

```javascript
// ─── BUG#4 (Phase 4c): income_change 適用時に昇給が完全停止 ──────────
// 修正前: hasOverride が true のとき selfIncome = baseIncome（以降の昇給なし）
// 修正後: continueGrowth: true なら baseIncome × pow(1+g, yr−eventYear) を適用
describe('[BUG#4] income_change 昇給継続フラグ（Phase 4c 02-I03）', () => {
  let getIncomeForYearWithGrowth;
  beforeAll(() => {
    loadCalc('utils.js');
    loadCalc('asset-growth.js');
    loadCalc('income-expense.js');
    sb = getSandbox();
    getIncomeForYearWithGrowth = sb.getIncomeForYearWithGrowth;
  });

  it('continueGrowth: false（既定）では転職後の収入が固定される（後方互換）', () => {
    const currentYear = new Date().getFullYear();
    sb.state.profile = { birth: `${currentYear - 30}-01-01` };
    sb.state.finance = { income: 40, bonus: 0, incomeGrowthRate: 3, incomeGrowthUntilAge: 55 };
    sb.state.retirement = {};
    sb.state.cashFlowEvents = [{
      type: 'income_change', startAge: 40, monthlyAmount: 50, bonusAmount: 0
      // continueGrowth 未指定
    }];
    const atAge40 = getIncomeForYearWithGrowth(currentYear + 10); // 40 歳
    const atAge50 = getIncomeForYearWithGrowth(currentYear + 20); // 50 歳
    expect(atAge40).toBeCloseTo(600, 0); // 50×12
    expect(atAge50).toBeCloseTo(600, 0); // 固定（従来挙動）
  });

  it('continueGrowth: true のとき転職後も昇給率が適用される', () => {
    const currentYear = new Date().getFullYear();
    sb.state.profile = { birth: `${currentYear - 30}-01-01` };
    sb.state.finance = { income: 40, bonus: 0, incomeGrowthRate: 3, incomeGrowthUntilAge: 55 };
    sb.state.retirement = {};
    sb.state.cashFlowEvents = [{
      type: 'income_change', startAge: 40, monthlyAmount: 50, bonusAmount: 0,
      continueGrowth: true,
    }];
    const atAge40 = getIncomeForYearWithGrowth(currentYear + 10); // イベント年
    const atAge50 = getIncomeForYearWithGrowth(currentYear + 20); // +10 年後
    expect(atAge40).toBeCloseTo(600, 0); // 50×12
    // 600 × 1.03^10 ≈ 806.35
    expect(atAge50).toBeCloseTo(600 * Math.pow(1.03, 10), 0);
  });
});
```

- [ ] **Step 3: テスト実行で失敗確認**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npx vitest run test/regression.test.js -t "BUG#4" 2>&1 | tail -15
```

Expected: 2 個目のテスト（continueGrowth: true）が失敗（転職後も固定になる）。

### 3-3. 実装（計算）

- [ ] **Step 4: `calc/income-expense.js:95-138` の `getIncomeForYearWithGrowth` の本人収入ブロックを修正**

Edit `calc/income-expense.js:107-118`:

**Before:**
```javascript
  // cashFlowEvents（転職・副業等）で上書きがある場合はそちら優先
  const baseIncome  = getIncomeForYear(yr);
  const hasOverride = (state.cashFlowEvents || []).some(e => {
    if (e.type !== 'income_change') return false;
    const startYr = ageToYear(e.startAge);
    const endYr = (e.endAge != null && e.endAge !== '') ? ageToYear(e.endAge) : null;
    return yr >= startYr && (endYr == null || yr < endYr);
  });

  let selfIncome;
  if (hasOverride) {
    selfIncome = baseIncome; // cashFlowEventsの値をそのまま使用
```

**After:**
```javascript
  // cashFlowEvents（転職・副業等）で上書きがある場合はそちら優先
  const baseIncome  = getIncomeForYear(yr);
  // [Phase 4c 02-I03] 適用中の income_change イベントを取得（continueGrowth 判定用）
  const activeIncomeChange = (state.cashFlowEvents || []).find(e => {
    if (e.type !== 'income_change') return false;
    const startYr = ageToYear(e.startAge);
    const endYr = (e.endAge != null && e.endAge !== '') ? ageToYear(e.endAge) : null;
    return yr >= startYr && (endYr == null || yr < endYr);
  });
  const hasOverride = !!activeIncomeChange;

  let selfIncome;
  if (hasOverride) {
    // [Phase 4c 02-I03] continueGrowth: true のときイベント起点で昇給を継続
    if (activeIncomeChange.continueGrowth) {
      const eventStartYr = ageToYear(activeIncomeChange.startAge);
      const ageAtYr = currentAge + yearsElapsed;
      const postEventYears = Math.max(0, Math.min(yr - eventStartYr, untilAge - (currentAge + (eventStartYr - currentYear))));
      selfIncome = baseIncome * Math.pow(1 + growthRate, postEventYears);
    } else {
      selfIncome = baseIncome; // 従来挙動：以後固定
    }
```

- [ ] **Step 5: テスト実行でパス確認**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npm test 2>&1 | tail -10
```

Expected: 158/158 passing（157 + BUG#4 の 2 件）。既存 snapshot 変化なし。

### 3-4. 実装（UI）

- [ ] **Step 6: `index.html` の cashFlowEvent 編集モーダルに continueGrowth チェックボックスを追加**

現在のファイル構造を把握するため、以下を実行：

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && grep -n "income_change\|cashFlowEvents\|saveCashFlowEvent\|editCashFlowEvent" index.html | head -30
```

該当する type: income_change の編集フォーム（通常は `<div id="cashFlowEventModal">` などの要素内）に以下を追記:

- 「月収（万円）」「賞与（万円）」の後ろにチェックボックス：

```html
<!-- [Phase 4c 02-I03] income_change の昇給継続フラグ -->
<div class="form-row" id="cashFlowContinueGrowthRow" style="display:none">
  <label style="display:flex;align-items:center;gap:6px;font-size:13px">
    <input type="checkbox" id="cashFlowContinueGrowth">
    転職・昇給後も昇給率（上の「昇給率」設定）を継続する
  </label>
  <div style="font-size:11px;color:var(--text-muted);margin-top:4px">
    未チェック = イベント額が以後固定 ／ チェックあり = イベント額を起点に年率 g で複利加算
  </div>
</div>
```

表示制御：`type === 'income_change'` のときに `cashFlowContinueGrowthRow.style.display = ''` にする。既存の type 切替ロジック（`onchange`）に分岐追加。

保存ロジック（`saveCashFlowEvent` 等）で `type === 'income_change'` のときのみ `continueGrowth: checkbox.checked` を entry に含める。

読み込みロジック（編集モーダルを開く側）で `entry.continueGrowth === true` の場合だけチェックを入れる（既定は外れた状態）。

**注意:** 既存の cashFlowEvent UI は index.html 内に散在するため、以下のキーワードで該当箇所を特定してから最小限のパッチを当てること：

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && grep -n "cashFlowEventType\|cfeType\|cf-event\|currentCashFlowEvent" index.html | head -20
```

- [ ] **Step 7: ブラウザで動作確認**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && python3 -m http.server 8000 > /tmp/phase4c-server.log 2>&1 &
```

ブラウザで `http://localhost:8000/index.html` を開き:
1. ライフイベント > キャッシュフローイベント > 新規追加 > 種別「収入変化」
2. 「継続昇給」チェックボックスが表示されること
3. チェック＆保存後、再編集でチェック状態が復元されること

完了後サーバ停止:
```bash
pkill -f "python3 -m http.server" 2>/dev/null
```

### 3-5. 記録・コミット

- [ ] **Step 8: `expected-changes.md` に実測サマリーを記入**

```markdown
### 実測サマリー
- snapshot 差分: **なし**（既存サンプルは `continueGrowth` 未指定）
- UI: cashFlowEvent 編集モーダルに「継続昇給」チェックボックス追加
- テスト: 158/158 グリーン（新規 BUG#4 2 件）
- 動作確認: ブラウザで UI 操作 → localStorage に `continueGrowth: true` が保存・復元されることを確認
```

- [ ] **Step 9: コミット**

Run:
```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add calc/income-expense.js index.html test/regression.test.js docs/phase4c-fixes/expected-changes.md && git commit -m "fix(phase4c): income_change continueGrowth flag (02-I03)"
```

- [ ] **Step 10: 実 SHA を expected-changes.md に追記**

Run:
```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git log -1 --format=%H
```

Edit expected-changes に SHA 7 桁を追記 → コミット:
```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add docs/phase4c-fixes/expected-changes.md && git commit -m "docs(phase4c): record Group 7 actual SHA"
```

---

## Task 4: G9b（06-I02 `calcTakeHome` 配偶者控除本実装）

**Files:**
- Modify: `calc/income-expense.js` — `calcSpouseDeduction` 新規追加
- Modify: `calc/integrated.js:66-100` — Phase 4b 近似（`annualIncome *= 1.005`）を削除
- Modify: `calc/retirement.js:544-595` — Phase 4b で追加された支出側近似の有無を確認・削除
- Modify: `index.html:16043-16094`（`calcTakeHome`）— 配偶者控除を課税所得に反映
- Modify: `test/regression.test.js` — BUG#5 追加

### 4-1. 期待方向の宣言

- [ ] **Step 1: `expected-changes.md` の Group 9b 「期待方向」を記入**

```markdown
### 期待方向
- `calcSpouseDeduction(partnerAnnualIncomeMan, partnerAge)` を `calc/income-expense.js` に新設：
  - 軸1（パートナー合計所得）: ≤48 → 38/33、段階逓減、>133 → 0/0
  - 軸3（老人加算）: partnerAge ≥ 70 かつ所得 ≤48 で所得税 +10（38→48）/住民税 +5（33→38）
- `calcTakeHome` で `taxableIncome -= spouseDeduction.incomeTax` → incomeTax 計算、住民税も同様。
- `calc/integrated.js` L98-100 の Phase 4b 近似 `annualIncome *= 1.005` を削除。
- `calc/retirement.js` の Phase 4b 支出側近似（06-I02 関連）を確認・削除（実在する場合）。
- snapshot 影響: gross モード + パートナー低所得シナリオでは手取り増。net モードやパートナー無収入のシナリオでは差なし。サンプル B/D（net モード）は変化なし、gross モードのサンプルがあれば変化する。
```

- [ ] **Step 2: 既存 Phase 4b 支出側近似の実在確認**

Run:
```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && grep -n "配偶者控除\|spouseDeduct\|Phase 4b.*06-I02\|applySpouseDeduction" calc/integrated.js calc/retirement.js
```

結果を expected-changes の「期待方向」末尾に記録し、削除対象の L 番号を控える。

### 4-2. テスト先行（calcSpouseDeduction）

- [ ] **Step 3: `test/regression.test.js` に failing test を追加**

```javascript
// ─── BUG#5 (Phase 4c): calcSpouseDeduction 本実装 ──────────
// 修正前: 配偶者控除は tax 計算に反映されず、Phase 4b で支出側に +0.5% 近似のみ
// 修正後: calcSpouseDeduction(partnerIncome, partnerAge) が控除額を返し、calcTakeHome で反映
describe('[BUG#5] 配偶者控除本実装（Phase 4c 06-I02）', () => {
  let calcSpouseDeduction;
  beforeAll(() => {
    loadCalc('utils.js');
    loadCalc('asset-growth.js');
    loadCalc('income-expense.js');
    sb = getSandbox();
    calcSpouseDeduction = sb.calcSpouseDeduction;
  });

  it('パートナー合計所得 0 万円なら 所得税 38 / 住民税 33 万円の控除', () => {
    const r = calcSpouseDeduction(0, 40);
    expect(r.incomeTaxDeduction).toBe(38);
    expect(r.residentTaxDeduction).toBe(33);
  });

  it('パートナー合計所得 48 万円（103 万円収入相当）なら 満額控除', () => {
    const r = calcSpouseDeduction(48, 40);
    expect(r.incomeTaxDeduction).toBe(38);
    expect(r.residentTaxDeduction).toBe(33);
  });

  it('パートナー合計所得 95 万円以下まで配偶者特別控除も満額', () => {
    const r = calcSpouseDeduction(95, 40);
    expect(r.incomeTaxDeduction).toBe(38);
    expect(r.residentTaxDeduction).toBe(33);
  });

  it('パートナー合計所得 100 万円なら 所得税 36', () => {
    const r = calcSpouseDeduction(100, 40);
    expect(r.incomeTaxDeduction).toBe(36);
  });

  it('パートナー合計所得 133 万円超なら 0', () => {
    const r = calcSpouseDeduction(135, 40);
    expect(r.incomeTaxDeduction).toBe(0);
    expect(r.residentTaxDeduction).toBe(0);
  });

  it('老人配偶者（70歳以上）かつ所得 48 万円以下なら 所得税 48 / 住民税 38', () => {
    const r = calcSpouseDeduction(0, 70);
    expect(r.incomeTaxDeduction).toBe(48);
    expect(r.residentTaxDeduction).toBe(38);
  });

  it('老人配偶者でも所得 48 万円超なら老人加算なし', () => {
    const r = calcSpouseDeduction(60, 75);
    expect(r.incomeTaxDeduction).toBe(38); // 軸1 のみ
    expect(r.residentTaxDeduction).toBe(33);
  });

  it('partnerAge が null / NaN なら老人加算を無効化', () => {
    const r = calcSpouseDeduction(0, null);
    expect(r.incomeTaxDeduction).toBe(38);
    expect(r.residentTaxDeduction).toBe(33);
  });
});
```

- [ ] **Step 4: テスト実行で失敗確認**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npx vitest run test/regression.test.js -t "BUG#5" 2>&1 | tail -10
```

Expected: 全 8 件失敗（関数未定義）。

### 4-3. 実装（calcSpouseDeduction）

- [ ] **Step 5: `calc/income-expense.js` の末尾に `calcSpouseDeduction` を追加**

Append at the end of `calc/income-expense.js`:

```javascript
// ===== [Phase 4c 06-I02] 配偶者控除・配偶者特別控除（本実装） =====
// 国税庁 No.1191 / No.1195 準拠（2026年4月時点）
// partnerAnnualIncomeMan: パートナーの年間合計所得（万円、給与所得控除後）
// partnerAge: パートナーの年齢（歳、null/NaN なら老人加算を無効化）
// 戻り値: { incomeTaxDeduction: 万円, residentTaxDeduction: 万円 }
function calcSpouseDeduction(partnerAnnualIncomeMan, partnerAge) {
  const inc = parseFloat(partnerAnnualIncomeMan) || 0;
  let incomeTaxDeduction, residentTaxDeduction;

  // 軸1: パートナー合計所得による逓減（基本 38/33 → 段階 → 0/0）
  if (inc <= 95) {
    incomeTaxDeduction = 38;
    residentTaxDeduction = 33;
  } else if (inc <= 100) {
    incomeTaxDeduction = 36;
    residentTaxDeduction = 33;
  } else if (inc <= 105) {
    incomeTaxDeduction = 31;
    residentTaxDeduction = 31;
  } else if (inc <= 110) {
    incomeTaxDeduction = 26;
    residentTaxDeduction = 26;
  } else if (inc <= 115) {
    incomeTaxDeduction = 21;
    residentTaxDeduction = 21;
  } else if (inc <= 120) {
    incomeTaxDeduction = 16;
    residentTaxDeduction = 16;
  } else if (inc <= 125) {
    incomeTaxDeduction = 11;
    residentTaxDeduction = 11;
  } else if (inc <= 130) {
    incomeTaxDeduction = 6;
    residentTaxDeduction = 6;
  } else if (inc <= 133) {
    incomeTaxDeduction = 3;
    residentTaxDeduction = 3;
  } else {
    incomeTaxDeduction = 0;
    residentTaxDeduction = 0;
  }

  // 軸3: 老人配偶者加算（partnerAge ≥ 70 かつ 所得 ≤ 48）
  const age = Number.isFinite(partnerAge) ? partnerAge : null;
  if (age !== null && age >= 70 && inc <= 48) {
    incomeTaxDeduction += 10; // 38 → 48
    residentTaxDeduction += 5; // 33 → 38
  }

  return { incomeTaxDeduction, residentTaxDeduction };
}
```

- [ ] **Step 6: テスト実行でパス確認**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npx vitest run test/regression.test.js -t "BUG#5" 2>&1 | tail -15
```

Expected: 全 8 件パス。

### 4-4. 実装（calcTakeHome 統合）

- [ ] **Step 7: `index.html:16043-16094` の `calcTakeHome` を修正**

Edit to add spouse deduction logic before the taxable income calculation:

**Before (L16064-16065):**
```javascript
  // 課税所得 (基礎控除48万円を加算)
  const taxableIncome = Math.max(0, grossAnnual - salaryDeduction - socialIns - 48);
```

**After (L16064-16080):**
```javascript
  // [Phase 4c 06-I02] 配偶者控除・配偶者特別控除（calcSpouseDeduction は calc/income-expense.js）
  // パートナー合計所得の推定: パートナー年間額面×(1 - 給与所得控除率の概算)
  //   ざっくり: 年収 103 万以下 → 合計所得 48 万以下、年収 201.6 万 → 合計所得 133 万
  //   ここでは簡略化して partnerAnnualIncomeMan = max(0, パートナー年間額面 − 55)
  const partnerGrossAnnual = (parseFloat(state.finance?.partnerIncome) || 0) * 12
                           + (parseFloat(state.finance?.partnerBonus) || 0);
  const partnerTotalIncome = Math.max(0, partnerGrossAnnual - 55); // 給与所得控除 最低 55 万円
  const partnerBirthStr = state.profile?.partnerBirth;
  const partnerBirthYear = partnerBirthStr ? new Date(partnerBirthStr).getFullYear() : null;
  const partnerAge = partnerBirthYear ? (new Date().getFullYear() - partnerBirthYear) : null;
  const spouseDeduction = (typeof calcSpouseDeduction === 'function')
    ? calcSpouseDeduction(partnerTotalIncome, partnerAge)
    : { incomeTaxDeduction: 0, residentTaxDeduction: 0 };

  // 課税所得 (基礎控除48万円 + 配偶者控除)
  const taxableIncome = Math.max(0, grossAnnual - salaryDeduction - socialIns - 48 - spouseDeduction.incomeTaxDeduction);
```

**Before (L16077-16078):**
```javascript
  // 住民税
  const residentTax = Math.round(Math.max(0, taxableIncome - 43) * 0.10 * 10) / 10;
```

**After (L16077-16078):**
```javascript
  // 住民税（基礎控除 43 万円 + 配偶者控除 住民税版）
  const residentTax = Math.round(Math.max(0, taxableIncome - 43 + spouseDeduction.incomeTaxDeduction - spouseDeduction.residentTaxDeduction) * 0.10 * 10) / 10;
```

**注意:** `taxableIncome` は既に 所得税の配偶者控除を引いているため、住民税計算では一旦戻して住民税版を引く。

### 4-5. Phase 4b 近似の削除

- [ ] **Step 8: `calc/integrated.js:66-100` の Phase 4b 近似を削除**

Edit `calc/integrated.js:66-71` と L98-100:

**Delete L66-71（期待する削除対象）:**
```javascript
  // [Phase 4b 06-I02] 配偶者控除の簡易近似（gross モード限定）
  // 厳密実装は calcTakeHome 改修が必要（Phase 4c 候補）
  // 簡易近似：gross モードで partnerAnnualIncome ≤ 103 万円なら本人 annualIncome に +0.5%
  const _partnerAnnualIncomeIS = (parseFloat(state.finance?.partnerIncome) || 0) * 12
                               + (parseFloat(state.finance?.partnerBonus) || 0);
  const _applySpouseDeduction = state.finance?._inputMode === 'gross' && _partnerAnnualIncomeIS <= 103;
```

**Delete L98-100（期待する削除対象）:**
```javascript
    // [Phase 4b 06-I02] 配偶者控除の簡易近似（gross モードで配偶者収入 ≤ 103 万円）
    // 配偶者控除枠 38 万円 × 実効税率 15-20% ≈ 5.7-7.6 万円/年 → 本人 annualIncome 500 万円想定で +0.5% 程度
    if (_applySpouseDeduction) annualIncome *= 1.005;
```

跡地にコメント:
```javascript
    // [Phase 4c 06-I02] 配偶者控除は calcTakeHome 本体で taxableIncome から減算するため
    // ここでの近似（Phase 4b の annualIncome *= 1.005）は削除した。
```

- [ ] **Step 9: `calc/retirement.js` の Phase 4b 支出側近似を確認・削除**

Step 2 で実在を確認済み。該当箇所があれば削除。なければこの Step をスキップ。

該当キーワード: `06-I02`、`配偶者控除`、`spouseDeduct`。

**※ 注**: `calc/retirement.js:544` 付近の `_partnerBaseAnnual` 関連は 06-I01（パートナー昇給）/06-I03（国民年金）の実装であり、06-I02 の近似ではない。削除しないこと。

### 4-6. 全テスト実行

- [ ] **Step 10: 全テスト実行 → snapshot 差分があれば `test:update`**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npm test 2>&1 | tail -15
```

**Expected**:
- 既存 5 シナリオは net モード + パートナー低所得が皆無 → 通常は snapshot 差分なし
- gross モード + パートナー低所得のシナリオがあれば annualIncome が変化 → snapshot 更新必要

snapshot 差分がある場合：
```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git diff test/__snapshots__/ | head -50
```

方向（手取り増方向の差分があるか）を確認 → OK なら：
```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && npm run test:update
cd "/Users/nagatohiroki/ライフプランアプリ" && npm test 2>&1 | tail -5
```

### 4-7. UI 動作確認

- [ ] **Step 11: ブラウザで calcTakeHome の動作確認**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && python3 -m http.server 8000 > /tmp/phase4c-server.log 2>&1 &
```

ブラウザで:
1. 収入・資産タブ > 手取り試算（gross モード）
2. パートナー年収 100 万円に設定 → 手取り試算ボタン押下
3. 配偶者控除が適用され、所得税・住民税が減っていることを確認
4. パートナー年収 200 万円に変更 → 控除が逓減していることを確認

サーバ停止:
```bash
pkill -f "python3 -m http.server" 2>/dev/null
```

### 4-8. 記録・コミット

- [ ] **Step 12: `expected-changes.md` に実測サマリー記入**

```markdown
### 実測サマリー
- snapshot 差分: [なし / あり+要約]
- Phase 4b 近似削除: calc/integrated.js L66-71, L98-100
- UI: calcTakeHome に配偶者控除反映 → パートナー年収連動で所得税・住民税が減る
- テスト: 166/166 グリーン（158 + BUG#5 の 8 件）
- 動作確認: gross モード + パートナー年収 100 万で控除 38/33 が効くことをブラウザで確認
```

- [ ] **Step 13: コミット**

Run:
```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add calc/income-expense.js calc/integrated.js index.html test/regression.test.js docs/phase4c-fixes/expected-changes.md
# snapshot 差分があれば以下も：
cd "/Users/nagatohiroki/ライフプランアプリ" && git add test/__snapshots__/ 2>/dev/null
cd "/Users/nagatohiroki/ライフプランアプリ" && git commit -m "fix(phase4c): calcTakeHome 配偶者控除 proper implementation (06-I02)"
```

- [ ] **Step 14: 実 SHA 記録**

Run:
```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git log -1 --format=%H
```

expected-changes に SHA を追記 → コミット:
```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add docs/phase4c-fixes/expected-changes.md && git commit -m "docs(phase4c): record Group 9b actual SHA"
```

---

## Task 5: G10-refi（05-I04 借換諸費用）

**Files:**
- Modify: `calc/mortgage.js:50-55`（`calcMortgageSchedule` の refi 処理、costs 戻し値追加）
- Modify: `index.html`（refi イベント編集欄）
- Modify: `calc/integrated.js` / `calc/retirement.js` — costs.mortgage 取得側（refi.cost を加算する経路）
- Modify: `test/regression.test.js` — BUG#6 追加

### 5-1. 期待方向の宣言

- [ ] **Step 1: `expected-changes.md` の Group 10-refi 「期待方向」を記入**

```markdown
### 期待方向
- `events[{type:'refi'}]` に `cost` フィールド追加（万円、既定 0）。
- `calcMortgageSchedule` の戻り値 `schedule.get(yr)` に `refiCost` を含める（既存 `monthlyPayment` / `principalStart` / `principalEnd` と並ぶ）。
- 統合シム・退職シム側で refi 年の住居費に `refiCost` を加算（現状は月次返済のみ）。
- 既存サンプル 5 シナリオに `refi` イベントがなければ snapshot 差分なし。
```

### 5-2. テスト先行

- [ ] **Step 2: `test/regression.test.js` に failing test 追加**

```javascript
// ─── BUG#6 (Phase 4c): 借換諸費用の計上 ──────────
describe('[BUG#6] refi 諸費用の計上（Phase 4c 05-I04）', () => {
  let calcMortgageSchedule;
  beforeAll(() => {
    loadCalc('utils.js');
    loadCalc('mortgage.js');
    sb = getSandbox();
    calcMortgageSchedule = sb.calcMortgageSchedule;
  });

  it('refi.cost が schedule の該当年に refiCost として含まれる', () => {
    sb.state.lifeEvents = {
      mortgage: {
        amount: 3000, startYear: 2026, term: 30, rate: 2.0,
        events: [
          { year: 2030, type: 'refi', newRate: 1.0, newTerm: 25, cost: 50 },
        ]
      }
    };
    const schedule = calcMortgageSchedule();
    expect(schedule.get(2030).refiCost).toBe(50);
    expect(schedule.get(2029).refiCost || 0).toBe(0);
  });

  it('refi.cost 未指定は 0 扱い', () => {
    sb.state.lifeEvents = {
      mortgage: {
        amount: 3000, startYear: 2026, term: 30, rate: 2.0,
        events: [
          { year: 2030, type: 'refi', newRate: 1.0, newTerm: 25 },
        ]
      }
    };
    const schedule = calcMortgageSchedule();
    expect(schedule.get(2030).refiCost || 0).toBe(0);
  });
});
```

- [ ] **Step 3: テスト実行で失敗確認**

```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npx vitest run test/regression.test.js -t "BUG#6" 2>&1 | tail -10
```

Expected: 1 件目失敗（refiCost が undefined）。

### 5-3. 実装（calc）

- [ ] **Step 4: `calc/mortgage.js:50-55` の refi 処理と戻り値を修正**

Edit `calc/mortgage.js:50-55`:

**Before:**
```javascript
      } else if (ev.type === 'refi') {
        rate = parseFloat(ev.newRate) || rate;
        const newTerm = parseInt(ev.newTerm) || (endYear - year);
        endYear = year + newTerm;
        monthly = calcMonthlyPayment(principal, rate, newTerm * 12);
      }
```

**After:**
```javascript
      } else if (ev.type === 'refi') {
        rate = parseFloat(ev.newRate) || rate;
        const newTerm = parseInt(ev.newTerm) || (endYear - year);
        endYear = year + newTerm;
        monthly = calcMonthlyPayment(principal, rate, newTerm * 12);
        // [Phase 4c 05-I04] refi 諸費用（保証料戻し・事務手数料・登記費用等）を記録
        yearlyRefiCost = (yearlyRefiCost || 0) + (parseFloat(ev.cost) || 0);
      }
```

Edit `calc/mortgage.js:32` (ループ冒頭に yearlyRefiCost リセット):

**Before:**
```javascript
  for (let year = startYear; year < endYear && principal > 0.01; year++) {
    // イベント処理（この年の開始時）
    for (const ev of events) {
```

**After:**
```javascript
  for (let year = startYear; year < endYear && principal > 0.01; year++) {
    let yearlyRefiCost = 0;
    // イベント処理（この年の開始時）
    for (const ev of events) {
```

Edit `calc/mortgage.js:65` (schedule.set に refiCost 追加):

**Before:**
```javascript
    schedule.set(year, { monthlyPayment: monthly, principalStart: principal, principalEnd: Math.max(0, p) });
```

**After:**
```javascript
    schedule.set(year, { monthlyPayment: monthly, principalStart: principal, principalEnd: Math.max(0, p), refiCost: yearlyRefiCost });
```

- [ ] **Step 5: 統合シム・退職シム側で refiCost を住居費に加算**

現在の住居費取得箇所を特定:

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && grep -n "monthlyPayment\s*\*\s*12\|_retMortgageSchedule\.get\|mortgageSchedule\.get" calc/integrated.js calc/retirement.js | head -20
```

該当箇所（年次ループ内で `schedule.get(yr).monthlyPayment * 12` を costs/expense に加算している箇所）で、併せて `+ (schedule.get(yr)?.refiCost || 0)` を加算するパッチを当てる。

例（想定される形）:

**Before:**
```javascript
const mortgageCost = (schedule.get(yr)?.monthlyPayment || 0) * 12;
```

**After:**
```javascript
const mortgageCost = (schedule.get(yr)?.monthlyPayment || 0) * 12
                   + (schedule.get(yr)?.refiCost || 0); // [Phase 4c 05-I04]
```

### 5-4. 実装（UI）

- [ ] **Step 6: `index.html` の refi イベント編集欄に「諸費用」入力を追加**

現在の refi 入力 UI を特定:
```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && grep -n "newRate\|newTerm\|refi" index.html | head -15
```

該当する refi 編集フォーム（`<input>` で newRate / newTerm を持つ箇所）の直後に:

```html
<div class="form-group">
  <label>諸費用（万円）</label>
  <input type="number" id="mortgageRefiCost" min="0" value="0" step="1">
  <div class="hint">保証料戻し・事務手数料・登記費用の合計。30〜80 万円が相場。</div>
</div>
```

保存・読み込みロジック（refi イベント保存箇所）で `cost: parseFloat(input.value) || 0` を含める / `input.value = entry.cost || 0` で復元。

### 5-5. 全テスト実行

- [ ] **Step 7: テスト実行**

```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npm test 2>&1 | tail -10
```

Expected: 168/168 グリーン（166 + BUG#6 の 2 件）。既存サンプルに refi なしなら snapshot 変化なし。

snapshot 差分があれば目視確認 → `test:update`。

### 5-6. 記録・コミット

- [ ] **Step 8: `expected-changes.md` に実測サマリー記入**

```markdown
### 実測サマリー
- snapshot 差分: [なし / あり+要約]
- `calcMortgageSchedule` 戻り値に `refiCost` を追加
- UI: refi 編集フォームに「諸費用」欄追加
- テスト: 168/168 グリーン（新規 BUG#6 2 件）
```

- [ ] **Step 9: コミット**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add calc/mortgage.js calc/integrated.js calc/retirement.js index.html test/regression.test.js docs/phase4c-fixes/expected-changes.md && git commit -m "fix(phase4c): refi cost field (05-I04)"
```

snapshot 更新があれば:
```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add test/__snapshots__/ && git commit --amend --no-edit
```

- [ ] **Step 10: 実 SHA 記録**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git log -1 --format=%H
```

expected-changes に SHA 追記 → コミット:
```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add docs/phase4c-fixes/expected-changes.md && git commit -m "docs(phase4c): record Group 10-refi actual SHA"
```

---

## Task 6: G10-housing（05-I01 子育て特例 + 05-I02 頭金）

**Files:**
- Modify: `calc/mortgage.js:100-132`（`calcMortgageDeduction` の HOUSING_TYPES + 子育て特例分岐）
- Modify: `index.html`（住居パネル mortgage フォーム）
- Modify: `test/regression.test.js` — BUG#7, BUG#8 追加

### 6-1. 期待方向の宣言

- [ ] **Step 1: `expected-changes.md` の Group 10-housing 「期待方向」を記入**

```markdown
### 期待方向
**05-I01 子育て特例:**
- `state.lifeEvents.mortgage.isChildCareHousehold: boolean`（既定 false）、`mortgage.purchaseYear` が 2024/2025 のときに限り有効。
- `HOUSING_TYPES` の limit に +500 万を加算（general は対象外）。
- 既存サンプルに 2024/2025 購入で isChildCareHousehold=true のデータなし → snapshot 変化なし。

**05-I02 頭金:**
- `mortgage.price`（物件価格、万円）、`mortgage.downPayment`（頭金、万円）フィールド追加。
- 保存時に `expenses[]` に `{ source: 'mortgage-downpayment', name: '住宅購入頭金', year: purchaseYear, amount: downPayment }` を追記（重複は in-place update、downPayment ≤ 0 は削除）。
- 既存サンプルに price/downPayment 未指定 → 自動追記なし → snapshot 変化なし。
```

### 6-2. テスト先行

- [ ] **Step 2: `test/regression.test.js` に failing test 追加**

```javascript
// ─── BUG#7 (Phase 4c): 子育て特例 uplift ──────────
describe('[BUG#7] 子育て特例 uplift（Phase 4c 05-I01）', () => {
  let calcMortgageDeduction;
  beforeAll(() => {
    loadCalc('utils.js');
    loadCalc('mortgage.js');
    sb = getSandbox();
    calcMortgageDeduction = sb.calcMortgageDeduction;
    // getRetirementParams は index.html 側関数のためスタブ
    sb.getRetirementParams = () => ({ mortgageDeductStart: 2024, mortgageDeductYears: 13 });
  });

  it('令和 6 年(2024) 入居 + 子育て特例 + 認定住宅なら limit 5500 万', () => {
    sb.state.lifeEvents = {
      mortgage: { housingType: 'long_term', purchaseYear: 2024, isChildCareHousehold: true }
    };
    sb.state.finance = { income: 50, bonus: 100 };
    // balance 5500 → 5500×0.007 = 38.5、deductCap 十分大なら 38.5 が出る
    const d = calcMortgageDeduction(2024, 5500);
    expect(d).toBeCloseTo(5500 * 0.007, 1);
  });

  it('2024 入居 + 子育て特例なしなら limit 5000 万（認定住宅）', () => {
    sb.state.lifeEvents = {
      mortgage: { housingType: 'long_term', purchaseYear: 2024, isChildCareHousehold: false }
    };
    sb.state.finance = { income: 50, bonus: 100 };
    const d = calcMortgageDeduction(2024, 5500);
    // 控除対象は 5000 に頭打ち
    expect(d).toBeCloseTo(5000 * 0.007, 1);
  });

  it('2026 入居 + 子育て特例（制度対象外）なら uplift 無効', () => {
    sb.state.lifeEvents = {
      mortgage: { housingType: 'long_term', purchaseYear: 2026, isChildCareHousehold: true }
    };
    sb.state.finance = { income: 50, bonus: 100 };
    // mortgageDeductStart を 2026 に合わせて Stub し直し
    sb.getRetirementParams = () => ({ mortgageDeductStart: 2026, mortgageDeductYears: 13 });
    const d = calcMortgageDeduction(2026, 5500);
    expect(d).toBeCloseTo(5000 * 0.007, 1); // uplift 適用されない
  });
});
```

- [ ] **Step 3: テスト実行で失敗確認**

```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npx vitest run test/regression.test.js -t "BUG#7" 2>&1 | tail -10
```

Expected: 1 件目が失敗（uplift 未実装で 35 万（5000×0.007）のまま）。

### 6-3. 実装（calc）

- [ ] **Step 4: `calc/mortgage.js:107-116` の HOUSING_TYPES と loanLimit 算出に子育て特例を追加**

Edit `calc/mortgage.js:107-116`:

**Before:**
```javascript
  // 住宅種別ごとの借入限度額（万円、2026年4月・国税庁 No.1211-1 準拠）
  const HOUSING_TYPES = {
    general:       { limit: 2000 },
    long_term:     { limit: 5000 },
    low_carbon:    { limit: 5000 },
    zeh:           { limit: 4500 },
    energy_saving: { limit: 4000 },
  };
  const housingType = m.housingType || 'general';
  const loanLimit = HOUSING_TYPES[housingType]?.limit ?? 2000;
  const controlledBalance = Math.min(balance, loanLimit);
```

**After:**
```javascript
  // 住宅種別ごとの借入限度額（万円、2026年4月・国税庁 No.1211-1 準拠）
  const HOUSING_TYPES = {
    general:       { limit: 2000 },
    long_term:     { limit: 5000 },
    low_carbon:    { limit: 5000 },
    zeh:           { limit: 4500 },
    energy_saving: { limit: 4000 },
  };
  const housingType = m.housingType || 'general';
  let loanLimit = HOUSING_TYPES[housingType]?.limit ?? 2000;
  // [Phase 4c 05-I01] 子育て世帯・若者夫婦世帯の借入限度額上乗せ措置（令和 6・7 年入居、general は対象外）
  const purchaseYear = parseInt(m.purchaseYear) || 0;
  if (m.isChildCareHousehold && housingType !== 'general' && (purchaseYear === 2024 || purchaseYear === 2025)) {
    loanLimit += 500;
  }
  const controlledBalance = Math.min(balance, loanLimit);
```

- [ ] **Step 5: テスト実行でパス確認**

```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npx vitest run test/regression.test.js -t "BUG#7" 2>&1 | tail -10
```

Expected: 3 件すべてパス。

### 6-4. 05-I02 頭金：テスト先行（UI ロジックの純粋部分）

- [ ] **Step 6: `test/regression.test.js` に BUG#8（頭金 expenses 自動追記ロジック）のテスト追加**

頭金の `expenses[]` 追記ロジックは index.html 内に書かれることが多いが、純粋関数として `calc/mortgage.js` に `syncDownPaymentExpense(expenses, mortgage)` を切り出すのが望ましい。テストはこの関数を対象に書く。

```javascript
// ─── BUG#8 (Phase 4c): 頭金を expenses[] に自動同期 ──────────
describe('[BUG#8] 頭金自動同期（Phase 4c 05-I02）', () => {
  let syncDownPaymentExpense;
  beforeAll(() => {
    loadCalc('utils.js');
    loadCalc('mortgage.js');
    sb = getSandbox();
    syncDownPaymentExpense = sb.syncDownPaymentExpense;
  });

  it('downPayment と purchaseYear が揃っていれば新規エントリ追加', () => {
    const expenses = [];
    const m = { price: 3500, downPayment: 500, purchaseYear: 2028 };
    const result = syncDownPaymentExpense(expenses, m);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      source: 'mortgage-downpayment',
      name: '住宅購入頭金',
      year: 2028,
      amount: 500,
    });
  });

  it('既存エントリがあれば in-place update（重複追加しない）', () => {
    const expenses = [{ source: 'mortgage-downpayment', name: '住宅購入頭金', year: 2028, amount: 400 }];
    const m = { price: 3500, downPayment: 500, purchaseYear: 2028 };
    const result = syncDownPaymentExpense(expenses, m);
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(500); // 更新された
  });

  it('downPayment が 0 / 未指定なら既存エントリを削除', () => {
    const expenses = [{ source: 'mortgage-downpayment', name: '住宅購入頭金', year: 2028, amount: 500 }];
    const m = { price: 3500, downPayment: 0, purchaseYear: 2028 };
    const result = syncDownPaymentExpense(expenses, m);
    expect(result).toHaveLength(0);
  });

  it('ユーザー追加の他 expenses は保持（source 判定）', () => {
    const expenses = [{ name: '車購入', year: 2027, amount: 200 }];
    const m = { price: 3500, downPayment: 500, purchaseYear: 2028 };
    const result = syncDownPaymentExpense(expenses, m);
    expect(result).toHaveLength(2);
    expect(result.some(e => e.source === 'mortgage-downpayment')).toBe(true);
    expect(result.some(e => e.name === '車購入')).toBe(true);
  });
});
```

- [ ] **Step 7: テスト実行で失敗確認**

```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npx vitest run test/regression.test.js -t "BUG#8" 2>&1 | tail -10
```

Expected: 4 件すべて失敗（`syncDownPaymentExpense` 未定義）。

### 6-5. 実装（calc 側関数）

- [ ] **Step 8: `calc/mortgage.js` の末尾に `syncDownPaymentExpense` を追加**

Append at the end of `calc/mortgage.js`:

```javascript
// [Phase 4c 05-I02] 頭金を expenses[] に自動同期
// - downPayment > 0 と purchaseYear が揃っていれば mortgage-downpayment エントリを追加 or 更新
// - downPayment ≤ 0 または purchaseYear 未指定なら既存エントリを削除
// 戻り値: 新しい expenses 配列（元配列は非破壊）
function syncDownPaymentExpense(expenses, mortgage) {
  const purchaseYear = parseInt(mortgage?.purchaseYear) || 0;
  const downPayment = parseFloat(mortgage?.downPayment) || 0;
  const without = (expenses || []).filter(e => e.source !== 'mortgage-downpayment');
  if (!purchaseYear || downPayment <= 0) {
    return without; // 削除扱い
  }
  return [
    ...without,
    {
      source: 'mortgage-downpayment',
      name: '住宅購入頭金',
      year: purchaseYear,
      amount: downPayment,
    },
  ];
}
```

- [ ] **Step 9: テスト実行でパス確認**

```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npx vitest run test/regression.test.js -t "BUG#8" 2>&1 | tail -10
```

Expected: 4 件すべてパス。

### 6-6. 実装（UI）

- [ ] **Step 10: `index.html` の住居パネル mortgage フォームを修正**

現在の mortgage フォームを特定:
```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && grep -n "housingType\|mortgageAmount\|mortgageTerm\|purchaseYear\|housingPanelMortgage" index.html | head -20
```

該当する `<div id="housingPanelMortgage">` 内の「借入額」「金利」欄の近く（購入年の後）に以下を挿入:

```html
<!-- [Phase 4c 05-I02] 物件価格・頭金 -->
<div class="form-group">
  <label>物件価格（万円）</label>
  <input type="number" id="mortgagePrice" min="0" step="10" placeholder="3500">
  <div class="hint">借入額 = 物件価格 − 頭金（手動で整合を取ってください）</div>
</div>
<div class="form-group">
  <label>頭金（万円）</label>
  <input type="number" id="mortgageDownPayment" min="0" step="10" placeholder="500">
  <div class="hint">購入年の支出として <code>expenses[]</code> に自動追記されます</div>
</div>
<!-- [Phase 4c 05-I01] 子育て特例 -->
<div class="form-group">
  <label style="display:flex;align-items:center;gap:6px">
    <input type="checkbox" id="mortgageChildCareHousehold">
    子育て世帯・若者夫婦世帯（令和 6・7 年入居特例）
  </label>
  <div class="hint">認定住宅・ZEH・省エネ住宅の借入限度額が +500 万円されます</div>
</div>
```

保存ロジック（mortgage 保存関数）で新フィールドを書き込み:

```javascript
state.lifeEvents.mortgage.price = parseFloat(document.getElementById('mortgagePrice').value) || 0;
state.lifeEvents.mortgage.downPayment = parseFloat(document.getElementById('mortgageDownPayment').value) || 0;
state.lifeEvents.mortgage.isChildCareHousehold = document.getElementById('mortgageChildCareHousehold').checked;
// [Phase 4c 05-I02] 頭金を expenses[] に自動同期
state.expenses = syncDownPaymentExpense(state.expenses, state.lifeEvents.mortgage);
```

読み込みロジックで DOM に復元:

```javascript
document.getElementById('mortgagePrice').value = m.price || '';
document.getElementById('mortgageDownPayment').value = m.downPayment || '';
document.getElementById('mortgageChildCareHousehold').checked = !!m.isChildCareHousehold;
```

### 6-7. 全テスト実行

- [ ] **Step 11: テスト実行**

```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npm test 2>&1 | tail -10
```

Expected: 175/175 グリーン（168 + BUG#7/8 の 7 件）。既存 snapshot 変化なし。

### 6-8. ブラウザ動作確認

- [ ] **Step 12: ブラウザで動作確認**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && python3 -m http.server 8000 > /tmp/phase4c-server.log 2>&1 &
```

ブラウザで:
1. ライフイベント > 住宅 > ローン設定
2. 「物件価格 3500」「頭金 500」「子育て特例チェック」「購入年 2024」を入力
3. 保存後、`state.expenses[]` に「住宅購入頭金 2024 500万円」が自動追加されていることを開発者ツール（Application > Local Storage）で確認
4. 住宅ローン控除が変化している（認定住宅 5500 limit で控除増）ことを確認

サーバ停止:
```bash
pkill -f "python3 -m http.server" 2>/dev/null
```

### 6-9. 記録・コミット

- [ ] **Step 13: `expected-changes.md` に実測サマリー記入**

```markdown
### 実測サマリー
- snapshot 差分: [なし / あり+要約]
- UI: 住居パネルに「物件価格」「頭金」「子育て特例」3 フィールド追加
- `syncDownPaymentExpense` で頭金 expenses エントリを source タグ付きで管理（重複回避）
- テスト: 175/175 グリーン（新規 BUG#7/8 7 件）
- 動作確認: ブラウザで頭金入力 → expenses 自動追加 → localStorage 検証
```

- [ ] **Step 14: コミット**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add calc/mortgage.js index.html test/regression.test.js docs/phase4c-fixes/expected-changes.md && git commit -m "fix(phase4c): childcare household uplift and downpayment field (05-I01/I02)"
```

snapshot 更新あれば:
```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add test/__snapshots__/ && git commit --amend --no-edit
```

- [ ] **Step 15: 実 SHA 記録**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git log -1 --format=%H
```

SHA 追記 → コミット:
```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add docs/phase4c-fixes/expected-changes.md && git commit -m "docs(phase4c): record Group 10-housing actual SHA"
```

---

## Task 7: G10-scenario（05-I03 シナリオ連動）

**Files:**
- Modify: `index.html`（scenarioComp パネルのレンダリング + `applyScenarioToPlan` 追加）

### 7-1. 期待方向の宣言

- [ ] **Step 1: `expected-changes.md` の Group 10-scenario 「期待方向」を記入**

```markdown
### 期待方向
- scenarioComp パネルの各シナリオカードに「このシナリオをメインプランに適用」ボタン追加。
- クリック時:
  1. 確認ダイアログ
  2. `state.lifeEvents.mortgage` に scenario フィールドを転記（purchaseYear, price, downPayment, loanRate, loanYears, housingType）
  3. 既存 `events[]` は保持
  4. `syncDownPaymentExpense` で expenses[] の頭金エントリを再生成
- snapshot 対象外（UI 操作のみ）、ユニットテストも難しいため動作確認は手動ブラウザ。
```

### 7-2. 実装

- [ ] **Step 2: `index.html` に `applyScenarioToPlan(scenarioIndex)` 関数を追加**

現在の scenarioComp 関連コードを特定:
```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && grep -n "scenarioComp\|housingOptions\|renderScenarios" index.html | head -20
```

シナリオ比較パネルのレンダリング箇所（各シナリオカードを生成しているループ）にボタンを追加:

```html
<button class="btn btn-primary btn-sm" onclick="applyScenarioToPlan(${idx})">
  このシナリオをメインプランに適用
</button>
```

`applyScenarioToPlan` 本体を該当セクションの関数群に追加:

```javascript
// [Phase 4c 05-I03] シナリオをメインプラン(state.lifeEvents.mortgage) に転記
function applyScenarioToPlan(scenarioIndex) {
  const sc = (state.scenarioComp?.housingOptions || [])[scenarioIndex];
  if (!sc) return;
  if (!confirm('現在の住居計画（購入年・物件価格・頭金・金利・期間）が上書きされます。続行しますか？')) return;
  state.lifeEvents = state.lifeEvents || {};
  const existing = state.lifeEvents.mortgage || {};
  state.lifeEvents.mortgage = {
    ...existing, // events[] や housingType など既存を保持
    purchaseYear: sc.purchaseYear ?? existing.purchaseYear,
    price: sc.price ?? existing.price,
    downPayment: sc.downPayment ?? existing.downPayment,
    rate: sc.loanRate ?? existing.rate,
    term: sc.loanYears ?? existing.term,
    housingType: sc.housingType ?? existing.housingType,
    // amount は price − downPayment で再計算
    amount: (sc.price != null && sc.downPayment != null)
      ? Math.max(0, sc.price - sc.downPayment)
      : existing.amount,
  };
  // [Phase 4c 05-I02 連動] 頭金 expenses エントリを再生成
  state.expenses = syncDownPaymentExpense(state.expenses || [], state.lifeEvents.mortgage);
  saveState();
  showNotification('メインプランに適用しました');
  // 住居パネルを再描画（既存の描画関数名に合わせて呼ぶ）
  if (typeof renderHousingPanel === 'function') renderHousingPanel();
  if (typeof renderLifePlan === 'function') renderLifePlan();
}
```

**注意:** `state.scenarioComp?.housingOptions` のプロパティ名は実コードに合わせて確認すること。`renderHousingPanel` / `renderLifePlan` も実コードに存在する再描画関数名に合わせる。

### 7-3. テスト実行（snapshot 対象外、既存テストだけ確認）

- [ ] **Step 3: テスト実行**

```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npm test 2>&1 | tail -5
```

Expected: 175/175 グリーン維持。snapshot 変化なし。

### 7-4. ブラウザ動作確認

- [ ] **Step 4: ブラウザで動作確認**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && python3 -m http.server 8000 > /tmp/phase4c-server.log 2>&1 &
```

ブラウザで:
1. シナリオ比較パネルに 2 つ以上のシナリオを登録
2. 片方のシナリオの「メインプランに適用」ボタン押下
3. 確認ダイアログ表示 → OK
4. ライフイベント > 住宅 パネルを開いて、転記されたことを確認
5. 開発者ツールの Application > Local Storage で `state.expenses` に頭金エントリが更新されていることを確認

サーバ停止:
```bash
pkill -f "python3 -m http.server" 2>/dev/null
```

### 7-5. 記録・コミット

- [ ] **Step 5: `expected-changes.md` に実測サマリー記入**

```markdown
### 実測サマリー
- snapshot 差分: **なし**（UI 操作のみ、snapshot 対象外）
- UI: scenarioComp の各カードに「メインプランに適用」ボタン追加
- `applyScenarioToPlan(idx)`: 確認ダイアログ → mortgage 転記 → 頭金 expenses 再生成 → saveState → 再描画
- テスト: 175/175 グリーン維持
- 動作確認: ブラウザでシナリオ適用 → 住居パネル転記 → localStorage で確認
```

- [ ] **Step 6: コミット**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add index.html docs/phase4c-fixes/expected-changes.md && git commit -m "fix(phase4c): apply scenario to main plan (05-I03)"
```

- [ ] **Step 7: 実 SHA 記録**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git log -1 --format=%H
```

SHA 追記 → コミット:
```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add docs/phase4c-fixes/expected-changes.md && git commit -m "docs(phase4c): record Group 10-scenario actual SHA"
```

---

## Task 8: 最終検証と Phase 2 監査レポート注記

**Files:**
- Modify: `docs/phase2-audits/02-income-expense.md`（02-I03 に Resolved 注記）
- Modify: `docs/phase2-audits/05-mortgage.md`（05-I01〜I06 に Resolved 注記）
- Modify: `docs/phase2-audits/06-partner-retirement.md`（06-I02 の Phase 4b 近似注記を Phase 4c 本実装に更新）
- Modify: `docs/phase2-audits/sanity-walkthrough-シナリオB.md`（Phase 4c 再評価セクション追加）
- Modify: `docs/phase4c-fixes/expected-changes.md`（完了総括追加）

### 注記対象マッピング

| 監査ファイル | Important ID | コミット SHA |
|------------|-------------|------------|
| `02-income-expense.md` | 02-I03 | Task 3 fix SHA |
| `05-mortgage.md` | 05-I01, 05-I02 | Task 6 fix SHA |
| `05-mortgage.md` | 05-I03 | Task 7 fix SHA |
| `05-mortgage.md` | 05-I04 | Task 5 fix SHA |
| `05-mortgage.md` | 05-I05, 05-I06 | Task 2 fix SHA |
| `06-partner-retirement.md` | 06-I02（既存注記の更新） | Task 4 fix SHA |

### 手順

- [ ] **Step 1: 全テスト最終確認**

```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npm test 2>&1 | tail -5
```

Expected: 175/175 グリーン。

- [ ] **Step 2: Phase 4c 全コミット SHA 取得**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git log --oneline bda578f..HEAD
```

各 Group の fix コミット SHA を控える。

- [ ] **Step 3: Phase 2 監査レポート 3 ファイルに Resolved 注記追加**

各 Important 見出しの直後に以下の形式で追記：

```markdown
- **`<ID>` <見出し>**

  > **[Resolved in Phase 4c commit `<SHA>`]** （詳細: `docs/phase4c-fixes/expected-changes.md` の <Group>）

  - <以下既存内容>
```

06-I02 については既存の Phase 4b 注記を以下に更新（本実装への到達を示す）:

```markdown
- **`06-I02` 配偶者控除・配偶者特別控除が税計算に反映されていない**

  > **[Resolved in Phase 4c commit `<Task 4 SHA>`]**（`calcTakeHome` 本体へ `calcSpouseDeduction` を組込み、配偶者合計所得別の逓減・老人加算に対応。Phase 4b の支出側近似は削除。軸2（本人高所得者逓減）は Phase 4d 以降で検討。詳細: `docs/phase4c-fixes/expected-changes.md` の G9b）
```

- [ ] **Step 4: サニティウォークスルー更新**

`docs/phase2-audits/sanity-walkthrough-シナリオB.md` の末尾に追加:

```markdown
## Phase 4c 完了後の再評価（YYYY-MM-DD）

Phase 4c で UI 変更を含む Important 8 件が修正された結果、シナリオ B の挙動が以下のように変わった：

### 修正された主要な問題

- **05-I05/05-I06** (<SHA>): 住宅ローン計算バグ修正（NaN ガード、同年イベント順序固定）
- **02-I03** (<SHA>): income_change 昇給継続フラグ
- **06-I02 本実装** (<SHA>): calcTakeHome に配偶者控除を本実装、Phase 4b 近似を削除
- **05-I04** (<SHA>): refi 諸費用フィールド追加
- **05-I01/05-I02** (<SHA>): 子育て特例・頭金フィールド追加
- **05-I03** (<SHA>): シナリオ連動ボタン追加

### 判定の更新

- **Phase 2.5 完了時**: ✅ 妥当（Critical 10 件解消）
- **Phase 4a 完了後**: ✅ 妥当（Important 14 件解消）
- **Phase 4b 完了後**: ✅ 妥当（Important 18 件解消、計 32 件）
- **Phase 4c 完了後**: ✅ 妥当（Important 8 件解消、計 40 件、全 Important 対応済み）
- **残存**: Minor 63 件、Phase 4d 候補（iDeCo 受給方法 UI、06-I02 軸2）
```

- [ ] **Step 5: `expected-changes.md` に完了総括**

末尾に追加:

```markdown
---

## 完了総括（YYYY-MM-DD）

### 達成事項
- 6 グループ・8 Important 解決（02-I03, 05-I01〜I06, 06-I02 本実装）
- テスト: 175/175 グリーン（+20 件のリグレッションテスト追加）
- commit 構成: setup 1 + fix 6 + SHA record 6 + 最終 docs 1 = 計 14 コミット

### 残存する Important
- **なし**（Phase 2 監査で検出された Important 43 件すべて解決）

### Phase 4d 以降への橋渡し
- iDeCo 受給方法 UI（一時金 / 年金 / 併用 × 受給年齢 60-75 歳）
- 06-I02 軸2（本人高所得者逓減、900/950/1000 万円ライン）
- Minor 項目 63 件の選別修正
```

- [ ] **Step 6: 最終コミット**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add docs/phase2-audits/ docs/phase4c-fixes/expected-changes.md && git commit -m "docs(phase4c): mark Importants resolved and update walkthrough"
```

---

## 完了条件

- [ ] Task 1〜8 完了
- [ ] `calc/mortgage.js`, `calc/income-expense.js`, `calc/integrated.js`, `index.html` 修正済み
- [ ] `docs/phase4c-fixes/expected-changes.md` に 6 グループの期待・実測記録
- [ ] `npm test` で 175/175 グリーン（155 baseline + 20 新規リグレッションテスト）
- [ ] Phase 2 監査レポート 3 ファイルに 8 Important の Resolved 注記
- [ ] サニティウォークスルーに Phase 4c 完了評価追記
- [ ] コミット履歴 約 14 件（setup 1 + fix 6 + SHA record 6 + 最終 1）

## Phase 4d 以降の候補

- iDeCo 受給方法 UI（一時金 / 年金 / 併用 × 受給年齢 60-75 歳選択）
- 06-I02 軸2（本人高所得者逓減: 900/950/1000 万円）
- Minor 項目 63 件の選別修正
- UI 機能拡張（PDF 出力、シナリオ共有 URL 等）
