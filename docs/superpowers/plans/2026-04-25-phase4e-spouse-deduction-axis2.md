# Phase 4e 配偶者控除軸2 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** `calcSpouseDeduction` に本人合計所得引数（軸2 = 高所得者逓減）を追加し、配偶者控除実装を完成させる。

**Architecture:** Phase 4c 実装の `calcSpouseDeduction(partnerInc, partnerAge)` に optional 第3引数 `selfTotalIncomeMan` を追加。本人合計所得 900/950/1000 万円ラインで multiplier (1, 2/3, 1/3, 0) を控除額に乗算。`calcTakeHome` から本人合計所得を計算して渡す。

**Tech Stack:** Vanilla JS、Vitest 2.x

**基準設計書:** `docs/superpowers/specs/2026-04-25-phase4e-spouse-deduction-axis2-design.md`

**リポジトリ:** `/Users/nagatohiroki/ライフプランアプリ/`（main ブランチ直接作業）

**⚠️ 重要な前提:**
- 日本語パス は **ダブルクォート** で囲む
- Node は nvm 経由：`source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 &&` を prefix
- 既定 (selfTotalIncomeMan 未指定) で multiplier=1 → 既存テスト・snapshot 不変
- UI 変更なし（既存 `state.finance.income / bonus` から導出）

---

## File Structure

### 新規

| パス | 役割 |
|------|------|
| `docs/phase4e-fixes/expected-changes.md` | 期待方向と実測サマリー |

### 変更

| パス | 変更概要 |
|------|---------|
| `calc/income-expense.js` | `calcSpouseDeduction` に第3引数 + 軸2 multiplier ロジック追加 |
| `index.html` | `calcTakeHome` 内で `selfTotalIncome` を計算して `calcSpouseDeduction` に渡す |
| `test/regression.test.js` | BUG#10 リグレッションテスト 6 件追加 |
| `docs/phase2-audits/06-partner-retirement.md` | 06-I02 注記を「完全実装」表現に更新 |

### 変更しない

- 他の `calc/*.js`
- 統合シミュ・退職シミュ（calcTakeHome は UI 試算経由のみ）

---

## Task 1: Setup（expected-changes.md 雛形）

- [ ] **Step 1: ディレクトリ作成**

```bash
mkdir -p "/Users/nagatohiroki/ライフプランアプリ/docs/phase4e-fixes"
```

- [ ] **Step 2: 雛形作成**

Create `docs/phase4e-fixes/expected-changes.md` with:

```markdown
# Phase 4e 修正の期待方向と実測

配偶者控除軸2（本人高所得者逓減）の実装記録。

---

## Group: 06-I02 軸2 本人高所得者逓減

### 期待方向
（Task 2 実施時に記入）

### 実測サマリー
（Task 2 修正後に記入）
```

- [ ] **Step 3: コミット**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add docs/phase4e-fixes/expected-changes.md && git commit -m "chore(phase4e): scaffold expected-changes tracking"
```

---

## Task 2: calcSpouseDeduction 軸2 + calcTakeHome 統合 + テスト

**Files:**
- Modify: `calc/income-expense.js` — `calcSpouseDeduction` 関数末尾に軸2 multiplier ロジック追加
- Modify: `index.html` — `calcTakeHome` 内の `calcSpouseDeduction` 呼び出しに第3引数 `selfTotalIncome` を追加
- Modify: `test/regression.test.js` — BUG#10 6 件追加

### 2-1. 期待方向の宣言

- [ ] **Step 1: `expected-changes.md` の Group 期待方向を記入**

Edit `docs/phase4e-fixes/expected-changes.md` の `（Task 2 実施時に記入）` を以下に置換：

```markdown
### 期待方向
- `calcSpouseDeduction(partnerAnnualIncomeMan, partnerAge, selfTotalIncomeMan)` の第3引数を追加（optional、未指定で multiplier=1=軸2 影響なし）
- 本人合計所得逓減：
  - ≤ 900 万: × 1.0
  - 900 < x ≤ 950: × 2/3
  - 950 < x ≤ 1000: × 1/3
  - x > 1000: × 0
- 軸1 + 軸3 で算出した控除額に multiplier を乗算、`Math.round` で整数化
- `calcTakeHome` (index.html) で `selfTotalIncome = max(0, grossAnnual − salaryDeduction)` を計算して渡す
- snapshot 影響: 既存サンプル全件本人年収 < 900 万 → multiplier=1 → snapshot 不変
- UI 変更なし（既存 `state.finance.income / bonus` から導出）
```

### 2-2. テスト先行

- [ ] **Step 2: BUG#10 テスト追加**

Append at the END of `test/regression.test.js`:

```javascript
// ─── BUG#10 (Phase 4e): 配偶者控除 軸2 本人高所得者逓減（06-I02 完全実装） ──────────
// 修正前: calcSpouseDeduction は軸1（パートナー所得）+ 軸3（老人加算）のみ
// 修正後: 第3引数 selfTotalIncomeMan で本人高所得者逓減（900/950/1000 万）を適用
describe('[BUG#10] 配偶者控除 軸2 本人高所得者逓減（Phase 4e 06-I02）', () => {
  let calcSpouseDeduction, localSb;
  beforeAll(() => {
    loadCalc('utils.js');
    loadCalc('asset-growth.js');
    loadCalc('income-expense.js');
    localSb = getSandbox();
    calcSpouseDeduction = localSb.calcSpouseDeduction;
  });

  it('selfTotalIncome 未指定なら軸2 適用なし（軸1+軸3 のみ）', () => {
    const r = calcSpouseDeduction(0, 40);
    expect(r.incomeTaxDeduction).toBe(38);
    expect(r.residentTaxDeduction).toBe(33);
  });

  it('本人 850 万（≤ 900）は満額', () => {
    const r = calcSpouseDeduction(0, 40, 850);
    expect(r.incomeTaxDeduction).toBe(38);
    expect(r.residentTaxDeduction).toBe(33);
  });

  it('本人 920 万（900-950）は ×2/3 → 26/22', () => {
    const r = calcSpouseDeduction(0, 40, 920);
    expect(r.incomeTaxDeduction).toBe(26); // 38 × 2/3 ≈ 25.33 → round 26
    expect(r.residentTaxDeduction).toBe(22); // 33 × 2/3 = 22
  });

  it('本人 980 万（950-1000）は ×1/3 → 13/11', () => {
    const r = calcSpouseDeduction(0, 40, 980);
    expect(r.incomeTaxDeduction).toBe(13); // 38 × 1/3 ≈ 12.67 → round 13
    expect(r.residentTaxDeduction).toBe(11); // 33 × 1/3 = 11
  });

  it('本人 1050 万（> 1000）は 0/0', () => {
    const r = calcSpouseDeduction(0, 40, 1050);
    expect(r.incomeTaxDeduction).toBe(0);
    expect(r.residentTaxDeduction).toBe(0);
  });

  it('老人加算 + 本人 920 万 → 48×2/3=32 / 38×2/3=25', () => {
    const r = calcSpouseDeduction(0, 70, 920);
    expect(r.incomeTaxDeduction).toBe(32); // 48 × 2/3 = 32
    expect(r.residentTaxDeduction).toBe(25); // 38 × 2/3 ≈ 25.33 → round 25
  });
});
```

- [ ] **Step 3: テスト実行で失敗確認**

```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npx vitest run test/regression.test.js -t "BUG#10" 2>&1 | tail -15
```

Expected: 1, 2 件目（軸2 影響なしケース）はパス、3-6 件目は失敗（軸2 未実装）。

### 2-3. 実装

- [ ] **Step 4: `calc/income-expense.js` の calcSpouseDeduction を修正**

シグネチャを `(partnerAnnualIncomeMan, partnerAge, selfTotalIncomeMan)` に変更し、関数の `return` 直前に軸2 multiplier 適用ロジックを追加。

具体的には、`function calcSpouseDeduction(partnerAnnualIncomeMan, partnerAge) {` を `function calcSpouseDeduction(partnerAnnualIncomeMan, partnerAge, selfTotalIncomeMan) {` に変更。

`return { incomeTaxDeduction, residentTaxDeduction };` の直前に以下を挿入：

```javascript
  // [Phase 4e 06-I02 軸2] 本人高所得者逓減（合計所得 900/950/1000 万円ライン）
  // 国税庁 No.1191 / No.1195: 本人合計所得別の控除逓減
  const selfInc = parseFloat(selfTotalIncomeMan) || 0;
  let highIncomeMultiplier = 1;
  if (selfInc > 1000) highIncomeMultiplier = 0;
  else if (selfInc > 950) highIncomeMultiplier = 1/3;
  else if (selfInc > 900) highIncomeMultiplier = 2/3;
  if (highIncomeMultiplier !== 1) {
    incomeTaxDeduction = Math.round(incomeTaxDeduction * highIncomeMultiplier);
    residentTaxDeduction = Math.round(residentTaxDeduction * highIncomeMultiplier);
  }
```

`incomeTaxDeduction` と `residentTaxDeduction` が `let` 宣言済みであることを確認（Phase 4c の実装でそうなっているはず）。もし `const` 宣言なら `let` に変更が必要。

- [ ] **Step 5: テスト実行 — BUG#10 6 件パス確認**

```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npx vitest run test/regression.test.js -t "BUG#10" 2>&1 | tail -10
```

Expected: 6 件すべてパス。

### 2-4. calcTakeHome 統合

- [ ] **Step 6: `index.html` の `calcTakeHome` 内 `calcSpouseDeduction` 呼び出しに第3引数追加**

`calcTakeHome` 関数内の以下の行を見つける（おおよそ L16080 付近）：

```javascript
  const spouseDeduction = (typeof calcSpouseDeduction === 'function')
    ? calcSpouseDeduction(partnerTotalIncome, partnerAge)
    : { incomeTaxDeduction: 0, residentTaxDeduction: 0 };
```

直前に本人合計所得計算を追加し、第3引数を渡すよう変更：

```javascript
  // [Phase 4e 06-I02 軸2] 本人合計所得 = 給与収入 - 給与所得控除
  const selfTotalIncome = Math.max(0, grossAnnual - salaryDeduction);
  const spouseDeduction = (typeof calcSpouseDeduction === 'function')
    ? calcSpouseDeduction(partnerTotalIncome, partnerAge, selfTotalIncome)
    : { incomeTaxDeduction: 0, residentTaxDeduction: 0 };
```

`grossAnnual` と `salaryDeduction` は同関数内ですでに計算されているはず（Phase 4c の実装で）。

### 2-5. 全テスト

- [ ] **Step 7: 全テスト実行**

```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npm test 2>&1 | tail -10
```

Expected: 189/189 グリーン（183 + BUG#10 6 件）、no snapshot updates pending.

### 2-6. ブラウザ動作確認

- [ ] **Step 8: ブラウザ動作確認（任意）**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && python3 -m http.server 8000 > /tmp/phase4e-server.log 2>&1 &
```

ブラウザで:
1. 収入と支出 タブ → 手取り試算（gross モード）
2. 月収 80 万 + ボーナス 200 万（年収 1160 万）→ パートナー年収 100 万 で試算
3. 軸2 で本人 1000 万超 → 配偶者控除 0 → 所得税・住民税が増える方向に変化することを確認
4. 月収 60 万 + ボーナス 100 万（年収 820 万）→ 同パートナー条件で試算
5. 軸2 影響なし → 控除フル適用

```bash
pkill -f "python3 -m http.server" 2>/dev/null
```

### 2-7. 記録・コミット

- [ ] **Step 9: 実測サマリー記入**

```markdown
### 実測サマリー
- snapshot 差分: **なし**（既存サンプル全件本人年収 < 900 万）
- `calcSpouseDeduction` シグネチャに第3引数追加、軸2 multiplier 適用
- `calcTakeHome` で `selfTotalIncome = max(0, grossAnnual - salaryDeduction)` を計算して渡す
- テスト: 189/189 グリーン（183 + BUG#10 6 件）
```

- [ ] **Step 10: コミット**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add calc/income-expense.js index.html test/regression.test.js docs/phase4e-fixes/expected-changes.md && git commit -m "fix(phase4e): calcSpouseDeduction 軸2 self-income tiered reduction (06-I02)"
```

- [ ] **Step 11: 実 SHA を expected-changes.md に追記**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git log -1 --format=%h
```

実測サマリーに `- 実コミット: <SHA 7桁>` 追加 → コミット：

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add docs/phase4e-fixes/expected-changes.md && git commit -m "docs(phase4e): record actual SHA"
```

---

## Task 3: 監査注記更新と完了総括

**Files:**
- Modify: `docs/phase2-audits/06-partner-retirement.md` — 06-I02 注記更新（Phase 4c 部分実装 → Phase 4e 完全実装）
- Modify: `docs/phase4e-fixes/expected-changes.md` — 完了総括追加

### 3-1. 06-I02 注記更新

- [ ] **Step 1: `docs/phase2-audits/06-partner-retirement.md` の 06-I02 注記更新**

既存の Phase 4c 注記（commit `ee6e24e` への参照）の直後に Phase 4e 完全実装の `>` 行を追記：

既存:
```markdown
- **`06-I02` 配偶者控除・配偶者特別控除が税計算に反映されていない**

  > **[Resolved in Phase 4c commit `ee6e24e`]**（`calcTakeHome` 本体へ `calcSpouseDeduction` を組込み、配偶者合計所得別の逓減・老人加算に対応。Phase 4b の支出側近似は削除済。軸2（本人高所得者逓減）は Phase 4d 以降で検討。詳細: `docs/phase4c-fixes/expected-changes.md` の Group 9b。Phase 4b 暫定対応は `33f50dd`）
```

直後に追加:
```markdown
  > **[Phase 4e 完全実装 commit `<Task 2 fix SHA>`]**: 軸2（本人高所得者逓減 900/950/1000 万円ライン）を実装。`calcSpouseDeduction` 第3引数 `selfTotalIncomeMan` で本人合計所得別 multiplier (1, 2/3, 1/3, 0) を適用。これで配偶者控除の 3 軸（パートナー所得逓減・老人加算・本人高所得者逓減）すべて対応完了。詳細: `docs/phase4e-fixes/expected-changes.md`
```

### 3-2. 完了総括

- [ ] **Step 2: `expected-changes.md` 末尾に完了総括追加**

```markdown
---

## 完了総括（2026-04-25）

### 達成事項

- `calcSpouseDeduction` 軸2 実装（本人高所得者逓減 900/950/1000 万）
- 配偶者控除実装の 3 軸完成（軸1 partner 所得 + 軸2 本人所得 + 軸3 老人加算）
- テスト: 189/189 グリーン（+6 件 BUG#10）
- 既存 snapshot 不変
- commit 構成: setup 1 + fix 1 + SHA record 1 + 最終 docs 1 = 計 4 コミット

### Phase 2 監査関連

- 06-I02 注記を Phase 4c 部分実装 → Phase 4e 完全実装に更新

### Phase 4f 以降への橋渡し

- 一時金 + 年金併用受給（iDeCo）
- 5/19 年ルール（厳密な退職所得控除別枠化）
- 年金受給期間中の運用継続（annuity 計算）
- Minor 63 件の選別修正
- 新規 UI 機能（PDF 出力、シナリオ共有 URL 等）
```

### 3-3. 最終コミット

- [ ] **Step 3: 最終コミット**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add docs/phase2-audits/06-partner-retirement.md docs/phase4e-fixes/expected-changes.md && git commit -m "docs(phase4e): mark 06-I02 fully resolved and update tracking"
```

---

## 完了条件

- [ ] Task 1〜3 完了
- [ ] `calc/income-expense.js` の `calcSpouseDeduction` 第3引数 + 軸2 multiplier
- [ ] `index.html` の `calcTakeHome` から `selfTotalIncome` を渡す
- [ ] `test/regression.test.js` BUG#10 6 件追加（183 → 189 グリーン）
- [ ] 既存 snapshot 不変
- [ ] 06-I02 注記更新（部分実装 → 完全実装）
- [ ] commit 履歴 約 4 件
