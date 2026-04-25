# Phase 4i Minor 項目選別修正 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Minor 5 件（01-M04, 02-M01, 02-M05, 04-M07, 05-M05）を一括修正。

**Architecture:** いずれも数行の小修正。calc 側 4 件 + UI 側 1 件。snapshot 影響は 02-M01（既定 50→55）でのみ生じる可能性あり。

**Tech Stack:** Vanilla JS、Vitest 2.x

**基準設計書:** `docs/superpowers/specs/2026-04-25-phase4i-minor-fixes-design.md`

**リポジトリ:** `/Users/nagatohiroki/ライフプランアプリ/`（main ブランチ直接作業）

**前提:**
- 日本語パス は **ダブルクォート** で囲む
- Node nvm prefix: `source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 &&`
- UI 修正は createElement + textContent で XSS 安全に

---

## File Structure

### 新規

| パス | 役割 |
|------|------|
| `docs/phase4i-fixes/expected-changes.md` | 期待方向 + 実測サマリー |

### 変更

| パス | 変更概要 |
|------|---------|
| `calc/asset-growth.js` | 01-M04: ideco.note 更新 |
| `calc/income-expense.js` | 02-M01: incomeGrowthUntilAge 既定 50→55 / 02-M05: Math.abs ガード |
| `calc/pension.js` | 04-M07: avgIncome 負値防御 |
| `index.html` | 02-M01: 同既定値変更 / 05-M05: UI 警告メッセージ追加（createElement） |
| `test/regression.test.js` | BUG#14 リグレッション 4 件 |

---

## Task 1: Setup

- [ ] **Step 1: ディレクトリ + 雛形**

```bash
mkdir -p "/Users/nagatohiroki/ライフプランアプリ/docs/phase4i-fixes"
```

Create `docs/phase4i-fixes/expected-changes.md`:

```markdown
# Phase 4i 修正の期待方向と実測

Minor 5 件選別修正の記録（01-M04, 02-M01, 02-M05, 04-M07, 05-M05）。

---

## Group: Minor calc fixes

### 期待方向
（Task 2 実施時に記入）

### 実測サマリー
（Task 2 修正後に記入）

---

## Group: 05-M05 mortgage deductStart UI

### 期待方向
（Task 3 実施時に記入）

### 実測サマリー
（Task 3 修正後に記入）
```

- [ ] **Step 2: コミット**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add docs/phase4i-fixes/expected-changes.md && git commit -m "chore(phase4i): scaffold expected-changes tracking"
```

---

## Task 2: Calc 側 Minor 4 件 + tests

**目的**: 01-M04, 02-M01, 02-M05, 04-M07 を一括修正。

### 2-1. 期待方向

- [ ] **Step 1: 期待方向記入**

Edit `docs/phase4i-fixes/expected-changes.md`. Replace `（Task 2 実施時に記入）` (under "Minor calc fixes") with:

```markdown
### 期待方向
- **01-M04**: `calc/asset-growth.js` の `ASSET_TYPES.ideco.note` に「2026年12月以降は月6.2万円に引き上げ予定」を追記
- **02-M01**: `calc/income-expense.js:104` と `index.html:9333` の `incomeGrowthUntilAge || 50` → `|| 55`（賃金統計ピーク整合）
- **02-M05**: `calc/income-expense.js:79` の `total - (e.amount || 0)` → `total - Math.abs(e.amount || 0)`
- **04-M07**: `calc/pension.js:24` の `Math.min(avgIncome / 12, 65)` → `Math.min(Math.max(0, avgIncome) / 12, 65)`（深層防御）
- snapshot 影響: 02-M01 が既存サンプルで効く可能性。サンプルが `incomeGrowthUntilAge` 明示指定なら不変、未指定で既定 50 依存なら影響あり
```

### 2-2. テスト先行

- [ ] **Step 2: BUG#14 4 件追加**

Append at the END of `test/regression.test.js`:

```javascript
// ─── BUG#14 (Phase 4i): Minor 計算修正一括（01-M04, 02-M01, 02-M05, 04-M07） ──────────
describe('[BUG#14] Phase 4i Minor calc fixes', () => {
  let localSb, getIncomeForYearWithGrowth, getOneTimeForYear, _calcPensionCore, ASSET_TYPES;
  beforeAll(() => {
    loadCalc('utils.js');
    loadCalc('asset-growth.js');
    loadCalc('income-expense.js');
    loadCalc('pension.js');
    localSb = getSandbox();
    getIncomeForYearWithGrowth = localSb.getIncomeForYearWithGrowth;
    getOneTimeForYear = localSb.getOneTimeForYear;
    _calcPensionCore = localSb._calcPensionCore;
    ASSET_TYPES = localSb.ASSET_TYPES;
  });

  it('01-M04: ASSET_TYPES.ideco.note は 2026年12月の改正に言及', () => {
    expect(ASSET_TYPES.ideco.note).toMatch(/2026年12月/);
  });

  it('02-M01: incomeGrowthUntilAge 未指定なら 55 fallback', () => {
    const cy = new Date().getFullYear();
    localSb.state = {
      profile: { birth: `${cy - 30}-01-01` },
      finance: { income: 40, bonus: 0, incomeGrowthRate: 2 },
      retirement: {},
      cashFlowEvents: [],
    };
    // currentAge=30 → cy+25 で min(25, 55-30)=25 年（既定 55 が効く）
    const at25y = getIncomeForYearWithGrowth(cy + 25);
    expect(at25y).toBeCloseTo(480 * Math.pow(1.02, 25), 0);
    // currentAge=30 → cy+30 で min(30, 55-30)=25 年（55 で停止、26 年成長しない）
    const at30y = getIncomeForYearWithGrowth(cy + 30);
    expect(at30y).toBeCloseTo(480 * Math.pow(1.02, 25), 0);
  });

  it('02-M05: one_time_expense の負値が二重マイナスにならない（Math.abs）', () => {
    const cy = new Date().getFullYear();
    localSb.state = {
      profile: { birth: `${cy - 30}-01-01` },
      finance: { income: 40, bonus: 0 },
      cashFlowEvents: [
        { type: 'one_time_expense', startAge: 31, amount: -100 }, // 負値（誤入力）
      ],
      expenses: [],
      recurringExpenses: [],
    };
    // 31 歳の年は one_time_expense -100 → Math.abs → 100 を引く（収入化しない）
    const result = getOneTimeForYear(cy + 1);
    // expected: -100（一時支出として計上）。修正前は +100（収入化）
    expect(result).toBe(-100);
  });

  it('04-M07: avgIncome 負値で hyojunGekkyu が 0 クランプ → 厚生年金 0', () => {
    const result = _calcPensionCore('employee', 30, -500, 40);
    // avgIncome < 0 だが、koseiYears > 0 で employee 経路に入る
    // 修正後: hyojunGekkyu = Math.min(Math.max(0, -500)/12, 65) = 0 → koseiMonthly 0
    expect(result.koseiMonthly).toBe(0);
  });
});
```

- [ ] **Step 3: テスト失敗確認**

```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npx vitest run test/regression.test.js -t "BUG#14" 2>&1 | tail -15
```

Expected: 全 4 件失敗（修正未適用）。注意: 04-M07 の元コード `if (... && avgIncome > 0)` ガードがあるため、avgIncome=-500 では brunch に入らず koseiMonthly=0 となり、テストはパスする可能性あり。修正後も同じ結果。これは過剰防御なので結果同じで問題なし。

### 2-3. 実装

- [ ] **Step 4: 01-M04 — `calc/asset-growth.js:17` ideco.note 更新**

Find:
```javascript
  ideco:          { label: 'iDeCo',                       emoji: '🏛️', color: '#8B5CF6', bg: '#EDE9FE', defaultReturn: 4,   monthlyLimit: 2.3, note: '会社員(企業年金なし)：月2.3万円。掛金全額所得控除。60歳まで原則引出不可。' },
```

Replace with:
```javascript
  ideco:          { label: 'iDeCo',                       emoji: '🏛️', color: '#8B5CF6', bg: '#EDE9FE', defaultReturn: 4,   monthlyLimit: 2.3, note: '会社員(企業年金なし)：月2.3万円。2026年12月以降は月6.2万円に引き上げ予定。掛金全額所得控除。60歳まで原則引出不可。' },
```

- [ ] **Step 5: 02-M01 — incomeGrowthUntilAge 既定 50→55**

`calc/income-expense.js:104`:

Find:
```javascript
  const untilAge    = parseInt(state.finance.incomeGrowthUntilAge) || 50;
```

Replace with:
```javascript
  // [Phase 4i 02-M01] 既定値 50→55（賃金構造基本統計調査ピーク整合）
  const untilAge    = parseInt(state.finance.incomeGrowthUntilAge) || 55;
```

`index.html:9333`:

Find:
```javascript
    incomeGrowthUntilAge: parseInt(document.getElementById('finIncomeGrowthUntilAge').value) || 50,
```

Replace with:
```javascript
    incomeGrowthUntilAge: parseInt(document.getElementById('finIncomeGrowthUntilAge').value) || 55,
```

- [ ] **Step 6: 02-M05 — Math.abs ガード**

`calc/income-expense.js:79`:

Find:
```javascript
      if (e.type === 'one_time_expense') return total - (e.amount || 0);
```

Replace with:
```javascript
      if (e.type === 'one_time_expense') return total - Math.abs(e.amount || 0);
```

- [ ] **Step 7: 04-M07 — avgIncome 負値防御**

`calc/pension.js:24`:

Find:
```javascript
    const hyojunGekkyu = Math.min(avgIncome / 12, 65);
```

Replace with:
```javascript
    // [Phase 4i 04-M07] 深層防御: avgIncome 負値を 0 にクランプ
    const hyojunGekkyu = Math.min(Math.max(0, avgIncome) / 12, 65);
```

- [ ] **Step 8: テスト実行**

```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npm test 2>&1 | tail -15
```

Expected: 211/211 green (207 + BUG#14 4 件) もしくは snapshot 差分発生。

snapshot 差分が出たら確認:
```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git diff test/__snapshots__/ | head -80
```

差分は 02-M01 の既定値変更（50→55）の影響と予想。既存サンプルの `incomeGrowthUntilAge` を確認:
```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && grep -l "incomeGrowthUntilAge" sample_data/*.json
```

各サンプルが明示指定していれば snapshot 不変。既定 50 に依存するサンプルがあれば snapshot 変動 → 期待方向通りで `npm run test:update`。

### 2-4. 記録・コミット

- [ ] **Step 9: 実測サマリー記入**

Edit `docs/phase4i-fixes/expected-changes.md` の Minor calc fixes 実測サマリー:

```markdown
### 実測サマリー
- snapshot 差分: [なし / あり+要約]
- 4 件すべて修正済み
- テスト: 211/211 グリーン（207 + BUG#14 4 件）
```

- [ ] **Step 10: コミット**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add calc/asset-growth.js calc/income-expense.js calc/pension.js index.html test/regression.test.js docs/phase4i-fixes/expected-changes.md
# snapshot 更新時:
cd "/Users/nagatohiroki/ライフプランアプリ" && git add test/__snapshots__/ 2>/dev/null
cd "/Users/nagatohiroki/ライフプランアプリ" && git commit -m "fix(phase4i): minor calc fixes (01-M04, 02-M01, 02-M05, 04-M07)"
```

---

## Task 3: 05-M05 mortgage deductStart UI バリデーション

### 3-1. 期待方向

- [ ] **Step 1: 期待方向記入**

Edit `docs/phase4i-fixes/expected-changes.md`. Replace `（Task 3 実施時に記入）` with:

```markdown
### 期待方向
- `index.html` の `calcMortgage()` 関数内で `deductStart < startYear` を検出した時、`mortgageDeductResult` エリアに警告メッセージを表示
- 既存の控除計算は変更なし（balance=0 → deduction=0 で実害なし）
- 単に UI 一貫性向上のみ
- 警告は createElement + textContent で XSS 安全に
- snapshot 影響なし（UI のみ）
```

### 3-2. 実装

- [ ] **Step 2: `calcMortgage()` を特定**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && grep -n "function calcMortgage\b\|mortgageDeductResult" index.html | head -10
```

`function calcMortgage()` 内で `mortgageDeductResult` 表示要素に書き込みしている箇所を確認。

- [ ] **Step 3: 警告ロジック追加**

`calcMortgage()` 内で `mortgageDeductResult` を更新する箇所の直後（または既存の表示処理の終了後）に以下を追加：

```javascript
// [Phase 4i 05-M05] deductStart < startYear 警告（XSS 安全に createElement + textContent 使用）
const _deductStart = parseInt(document.getElementById('leMortgageDeductStart').value) || 0;
const _startYear = parseInt(document.getElementById('leMortgageStartYear').value) || 0;
if (_deductStart && _startYear && _deductStart < _startYear) {
  const warnEl = document.getElementById('mortgageDeductResult');
  if (warnEl) {
    const warnDiv = document.createElement('div');
    warnDiv.style.color = '#EF4444';
    warnDiv.style.marginTop = '4px';
    warnDiv.style.fontSize = '11px';
    warnDiv.textContent = '⚠️ 控除開始年が借入開始年より前です。借入前の年は控除されません。';
    warnEl.appendChild(warnDiv);
  }
}
```

設置位置: 既存の `mortgageDeductResult` 内容書き換え後（既存内容を消さずに追記）。実装者は `calcMortgage()` 内を読んで適切な位置に挿入。

注意: 既存挙動が `mortgageDeductResult.innerHTML = ...` で内容を毎回上書きしている場合、警告も毎回再生成されるよう、上書き処理の **直後** に上記ロジックを置く。

- [ ] **Step 4: ブラウザで動作確認**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && python3 -m http.server 8000 > /tmp/phase4i-server.log 2>&1 &
```

ブラウザで:
1. ライフイベント > 住宅 > 借入開始年 = 2030
2. 控除適用居住開始年 = 2025
3. 警告メッセージが表示される確認

```bash
pkill -f "python3 -m http.server" 2>/dev/null
```

- [ ] **Step 5: 全テスト実行**

```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npm test 2>&1 | tail -5
```

Expected: 211/211 green、snapshot 差分なし（UI のみ）。

- [ ] **Step 6: 実測サマリー + コミット**

Edit `docs/phase4i-fixes/expected-changes.md` の 05-M05 実測サマリー:

```markdown
### 実測サマリー
- UI 警告メッセージ追加（calcMortgage 内、createElement + textContent で安全に）
- snapshot 差分: なし（UI のみ）
- ブラウザ動作確認済み
```

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add index.html docs/phase4i-fixes/expected-changes.md && git commit -m "fix(phase4i): mortgage deductStart UI validation (05-M05)"
```

---

## Task 4: 完了総括

- [ ] **Step 1: 完了総括追加**

Edit `docs/phase4i-fixes/expected-changes.md`. Append at end:

```markdown

---

## 完了総括（2026-04-25）

### 達成事項

- Minor 5 件修正（01-M04, 02-M01, 02-M05, 04-M07, 05-M05）
- テスト: 211/211 グリーン（+4 件 BUG#14）
- commit 構成: setup 1 + calc fix 1 + UI fix 1 + 完了 docs 1 = 計 4 コミット

### 残存 Minor 58 件

簡潔修正不可な項目（NISA 売却枠復活、変動金利シナリオ、年金免除期間等）は Phase 4j 以降または機能拡張フェーズで個別検討。

### Phase 4j 候補

- 新規 UI 機能（PDF 出力、シナリオ共有 URL 等）
- 9/20 年ルール改正対応（2026 改正）
- iDeCo 拠出限度額 2026/12 以降の自動切替
```

- [ ] **Step 2: 最終コミット**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add docs/phase4i-fixes/expected-changes.md && git commit -m "docs(phase4i): record completion summary"
```

---

## 完了条件

- [ ] Task 1〜4 完了
- [ ] 5 Minor items 修正
- [ ] 211/211 グリーン
- [ ] snapshot 差分（02-M01 由来）が出る場合は test:update + 期待方向と整合確認
- [ ] commit 約 4 件
