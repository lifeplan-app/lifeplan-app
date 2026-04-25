# Phase 4h 退職所得控除 5/19 年ルール 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** 退職金と iDeCo 一時金の年差で退職所得控除を別枠 / 合算分岐させる。

**Architecture:** `calc/retirement.js` に `calcSeveranceWith519Rule` 関数追加。年差 ≥ 19 (退職金先) または ≥ 5 (iDeCo 先) で 2 回独立に控除を計算、それ以外は合算。`calcSeveranceDeduction` は変更しない。

**Tech Stack:** Vanilla JS、Vitest 2.x

**基準設計書:** `docs/superpowers/specs/2026-04-25-phase4h-severance-separation-rule-design.md`

**リポジトリ:** `/Users/nagatohiroki/ライフプランアプリ/`（main ブランチ直接作業）

**前提:**
- 日本語パス は **ダブルクォート** で囲む
- Node nvm prefix: `source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 &&`
- UI 変更なし（既存 severanceAge / idecoStartAge を活用）
- snapshot 想定: 既存全件 gap ≈ 0 → 不変

---

## File Structure

### 新規

| パス | 役割 |
|------|------|
| `docs/phase4h-fixes/expected-changes.md` | 期待方向 + 実測サマリー |

### 変更

| パス | 変更概要 |
|------|---------|
| `calc/retirement.js` | `calcSeveranceWith519Rule` 関数追加、2 箇所で置換 |
| `test/regression.test.js` | BUG#13 6 件追加 |
| `docs/phase2-audits/sanity-walkthrough-シナリオB.md` | Phase 4h 評価追記 |

---

## Task 1: Setup

- [ ] **Step 1: ディレクトリ + 雛形**

```bash
mkdir -p "/Users/nagatohiroki/ライフプランアプリ/docs/phase4h-fixes"
```

Create `docs/phase4h-fixes/expected-changes.md`:

```markdown
# Phase 4h 修正の期待方向と実測

退職所得控除の 5/19 年ルール実装記録。

---

## Group: 5/19 年ルール

### 期待方向
（Task 2 実施時に記入）

### 実測サマリー
（Task 2 修正後に記入）
```

- [ ] **Step 2: コミット**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add docs/phase4h-fixes/expected-changes.md && git commit -m "chore(phase4h): scaffold expected-changes tracking"
```

---

## Task 2: 5/19 年ルール実装 + tests

### 2-1. 期待方向

- [ ] **Step 1: 期待方向記入**

Replace placeholder:
```markdown
### 期待方向
- `calc/retirement.js` に `calcSeveranceWith519Rule(severance, severanceAge, severanceServiceYears, idecoLumpsum, idecoStartAge, idecoEnrollYears)` 関数追加
- 判定:
  - 両方 0 → 0
  - 片方のみ → calcSeveranceDeduction 単独呼び出し
  - 両方あり、severanceAge < idecoStartAge かつ gap ≥ 19 → 別枠（19 年ルール）
  - 両方あり、idecoStartAge < severanceAge かつ gap ≥ 5 → 別枠（5 年ルール）
  - それ以外 → 合算（既存挙動）
- `calcRetirementSim`/`calcRetirementSimWithOpts` の severance 計算を新関数に置換
- 既存サンプル全件 gap ≈ 0 → snapshot 不変
- 別枠時の節税効果: 退職金 + iDeCo 一時金両方ある高所得者で大きい
```

### 2-2. テスト先行

- [ ] **Step 2: BUG#13 6 件追加**

Append at the END of `test/regression.test.js`:

```javascript
// ─── BUG#13 (Phase 4h): 退職所得控除 5/19 年ルール ──────────
// 修正前: severance + iDeCo lump はすべて合算で控除適用
// 修正後: 受給年差 ≥ 19 (退職先) or ≥ 5 (ideco先) で別枠計算
describe('[BUG#13] 退職所得控除 5/19 年ルール（Phase 4h）', () => {
  let calcSeveranceWith519Rule, calcSeveranceDeduction, localSb;
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
    calcSeveranceWith519Rule = localSb.calcSeveranceWith519Rule;
    calcSeveranceDeduction = localSb.calcSeveranceDeduction;
  });

  it('severance のみ（iDeCo lump=0）→ 単独 calcSeveranceDeduction と同等', () => {
    // 退職金 2000 万、勤続 38 年
    const result = calcSeveranceWith519Rule(2000, 65, 38, 0, 65, 30);
    const expected = calcSeveranceDeduction(2000, 0, 38);
    expect(result).toBeCloseTo(expected, 2);
  });

  it('iDeCo lump のみ（severance=0）→ idecoEnrollYears で控除適用', () => {
    // iDeCo 一時金 800、enroll 35 年
    const result = calcSeveranceWith519Rule(0, 0, 0, 800, 65, 35);
    const expected = calcSeveranceDeduction(0, 800, 35);
    expect(result).toBeCloseTo(expected, 2);
  });

  it('退職金先（60 歳）+ iDeCo 後（80 歳、gap 20）→ 19 年ルール適用、別枠', () => {
    // 退職金 2000 万 (sv 38)、iDeCo 800 万 (enroll 35)
    const result = calcSeveranceWith519Rule(2000, 60, 38, 800, 80, 35);
    const sNet = calcSeveranceDeduction(2000, 0, 38);
    const iNet = calcSeveranceDeduction(0, 800, 35);
    expect(result).toBeCloseTo(sNet + iNet, 2);
    // 合算より大きい（節税効果あり）
    const combined = calcSeveranceDeduction(2000, 800, 38);
    expect(result).toBeGreaterThanOrEqual(combined);
  });

  it('退職金先 + iDeCo 後（gap 10、19 年未満）→ ルール非該当、合算', () => {
    const result = calcSeveranceWith519Rule(2000, 60, 38, 800, 70, 35);
    const expected = calcSeveranceDeduction(2000, 800, 38);
    expect(result).toBeCloseTo(expected, 2);
  });

  it('iDeCo 先（60 歳）+ 退職金後（70 歳、gap 10）→ 5 年ルール適用、別枠', () => {
    const result = calcSeveranceWith519Rule(2000, 70, 38, 800, 60, 35);
    const sNet = calcSeveranceDeduction(2000, 0, 38);
    const iNet = calcSeveranceDeduction(0, 800, 35);
    expect(result).toBeCloseTo(sNet + iNet, 2);
  });

  it('iDeCo 先 + 退職金後（gap 3、5 年未満）→ ルール非該当、合算', () => {
    const result = calcSeveranceWith519Rule(2000, 65, 38, 800, 62, 35);
    const expected = calcSeveranceDeduction(2000, 800, 38);
    expect(result).toBeCloseTo(expected, 2);
  });
});
```

- [ ] **Step 3: テスト失敗確認**

```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npx vitest run test/regression.test.js -t "BUG#13" 2>&1 | tail -15
```

Expected: 全件失敗（calcSeveranceWith519Rule 未定義）。

### 2-3. 関数追加

- [ ] **Step 4: `calc/retirement.js` に `calcSeveranceWith519Rule` 追加**

Find the existing `calcSeveranceDeduction` function (around L285-310). Add a new function RIGHT AFTER it:

```javascript

// [Phase 4h] 退職所得控除の 5/19 年ルール: 退職金と iDeCo 一時金の受給年差が
//   ≥ 19 年（退職金先）or ≥ 5 年（iDeCo 先）なら別枠で控除適用、それ以外は合算
// 出典: 国税庁 No.1420（退職所得）、所得税法施行令 69 条等
function calcSeveranceWith519Rule(severance, severanceAge, severanceServiceYears, idecoLumpsum, idecoStartAge, idecoEnrollYears) {
  const sAmt = parseFloat(severance) || 0;
  const iAmt = parseFloat(idecoLumpsum) || 0;
  if (sAmt <= 0 && iAmt <= 0) return 0;
  if (sAmt > 0 && iAmt <= 0) return calcSeveranceDeduction(sAmt, 0, severanceServiceYears);
  if (sAmt <= 0 && iAmt > 0) return calcSeveranceDeduction(0, iAmt, idecoEnrollYears);

  const sAge = parseFloat(severanceAge) || 0;
  const iAge = parseFloat(idecoStartAge) || 0;
  // 年齢不明 → 合算（保守的）
  if (!sAge || !iAge) {
    return calcSeveranceDeduction(sAmt, iAmt, severanceServiceYears);
  }
  const gap = Math.abs(iAge - sAge);
  const severanceFirst = sAge < iAge;
  const idecoFirst = iAge < sAge;
  // 19 年ルール（退職金先・iDeCo 後）or 5 年ルール（iDeCo 先・退職金後）
  if ((severanceFirst && gap >= 19) || (idecoFirst && gap >= 5)) {
    const sNet = calcSeveranceDeduction(sAmt, 0, severanceServiceYears);
    const iNet = calcSeveranceDeduction(0, iAmt, idecoEnrollYears);
    return sNet + iNet;
  }
  // 同年 or ルール不適用 → 合算（既存挙動）
  return calcSeveranceDeduction(sAmt, iAmt, severanceServiceYears);
}
```

- [ ] **Step 5: BUG#13 全件パス確認**

```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npx vitest run test/regression.test.js -t "BUG#13" 2>&1 | tail -10
```

Expected: 6/6 パス。

### 2-4. 呼び出し側を置換

- [ ] **Step 6: `calcRetirementSim` 内の severance 計算置換**

Find the existing block in `calcRetirementSim` (around L80-82, after Phase 4f/4g changes):

```javascript
  const idecoLumpsumSim =
      (idecoMethodSim === 'lump')  ? _idecoBalanceAtStartSim
    : (idecoMethodSim === 'mixed') ? _idecoBalanceAtStartSim * idecoLumpRatioSim
    :                                 0;
  const severanceAtRetire = calcSeveranceDeduction(severanceGross, idecoLumpsumSim, serviceYears);
```

Replace just the `severanceAtRetire =` line with:

```javascript
  // [Phase 4h] 5/19 年ルール: 退職金と iDeCo 一時金の年差で別枠 / 合算分岐
  const _idecoEnrollYearsSim = Math.max(1, idecoStartAgeSim - 22);
  const severanceAtRetire = calcSeveranceWith519Rule(
    severanceGross, severanceAge, serviceYears,
    idecoLumpsumSim, idecoStartAgeSim, _idecoEnrollYearsSim
  );
```

- [ ] **Step 7: `calcRetirementSimWithOpts` 内の severance 計算置換**

Find the equivalent block in `calcRetirementSimWithOpts` (around L407, after Phase 4f/4g changes):

```javascript
  const severanceAtRetire = calcSeveranceDeduction(severanceGross, idecoLumpsum, serviceYears);
```

Replace with:

```javascript
  // [Phase 4h] 5/19 年ルール: 退職金と iDeCo 一時金の年差で別枠 / 合算分岐
  const _idecoEnrollYears = Math.max(1, idecoStartAge - 22);
  const severanceAtRetire = calcSeveranceWith519Rule(
    severanceGross, severanceAge, serviceYears,
    idecoLumpsum, idecoStartAge, _idecoEnrollYears
  );
```

### 2-5. 全テスト

- [ ] **Step 8: 全テスト実行**

```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npm test 2>&1 | tail -10
```

Expected: 207/207 green (201 + BUG#13 6 件), no snapshot updates.

If snapshot diff → 既存サンプルのうち severanceAge と idecoStartAge の差で 5/19 ルールに該当するケースがある可能性。差分を確認 → 期待方向と一致するか判断 → `npm run test:update`。

### 2-6. 記録・コミット

- [ ] **Step 9: 実測サマリー記入**

```markdown
### 実測サマリー
- snapshot 差分: [なし / あり+要約]
- `calc/retirement.js` に `calcSeveranceWith519Rule` 追加（27 行）
- 2 箇所で `calcSeveranceDeduction` 呼び出しを新関数に置換
- idecoEnrollYears は `Math.max(1, idecoStartAge - 22)` で自動推定
- テスト: 207/207 グリーン（201 + BUG#13 6 件）
```

- [ ] **Step 10: コミット + SHA**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add calc/retirement.js test/regression.test.js docs/phase4h-fixes/expected-changes.md && git commit -m "fix(phase4h): apply 5/19 year rule for separate retirement deduction"
```

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git log -1 --format=%h
```

Append `- 実コミット: <SHA 7桁>` to 実測サマリー → commit:
```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add docs/phase4h-fixes/expected-changes.md && git commit -m "docs(phase4h): record actual SHA"
```

---

## Task 3: 完了総括 + サニティ

- [ ] **Step 1: サニティウォークスルー追記**

Edit `docs/phase2-audits/sanity-walkthrough-シナリオB.md`. Append at end:

```markdown

## Phase 4h 完了後の再評価（2026-04-25）

Phase 4h で退職所得控除の 5/19 年ルールが実装され、退職金と iDeCo 一時金の受給戦略最適化に対応：

### 修正された主要な機能拡張

- **5/19 年ルール** (`<Task 2 fix SHA>`):
  - `calcSeveranceWith519Rule` 関数追加
  - 受給年差 ≥ 19 年（退職金先）or ≥ 5 年（iDeCo 先）で控除を別枠適用
  - それ以外は合算（既存挙動維持）
  - シナリオ B は severance/iDeCo 同年 → 合算 → snapshot 不変

### 判定の更新

- **Phase 4g 完了後**: ✅ 妥当（iDeCo 受給戦略の柔軟性が完成）
- **Phase 4h 完了後**: ✅ 妥当（退職所得控除の精度向上、両税優遇の最適活用シミュレーション可能）
- **残存**: Minor 63 件、Phase 4i 候補（UI 機能拡張 PDF 出力等）
```

- [ ] **Step 2: 完了総括追加**

Edit `docs/phase4h-fixes/expected-changes.md`. Append at end:

```markdown

---

## 完了総括（2026-04-25）

### 達成事項

- 退職所得控除の 5/19 年ルール実装
- 受給年差で別枠 / 合算を自動判定
- 既存 calcSeveranceDeduction 維持（後方互換）
- テスト: 207/207 グリーン（+6 件 BUG#13）
- 既存 snapshot 不変
- commit 構成: setup 1 + fix 1 + SHA record 1 + 最終 docs 1 = 計 4 コミット

### 設計上の選択

- idecoEnrollYears = `Math.max(1, idecoStartAge - 22)`（自動推定、UI 入力なし）
- 5/19 年ルールは現行制度（2024 年時点）。9/20 年ルール改正は 2026 年以降施行予定で別フェーズで対応可能
- 年齢不明（severanceAge=0 や idecoStartAge=0）→ 合算フォールバック（保守的）

### Phase 4i 以降への橋渡し

- Minor 63 件選別（出典更新、helper テキスト等）
- 新規 UI 機能（PDF 出力、シナリオ共有 URL 等）
- 9/20 年ルール（2026 改正）への対応
```

- [ ] **Step 3: 最終コミット**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add docs/phase2-audits/sanity-walkthrough-シナリオB.md docs/phase4h-fixes/expected-changes.md && git commit -m "docs(phase4h): record completion summary and update walkthrough"
```

---

## 完了条件

- [ ] Task 1〜3 完了
- [ ] `calcSeveranceWith519Rule` 関数追加
- [ ] 2 箇所で置換
- [ ] BUG#13 6 件追加（201 → 207 グリーン）
- [ ] 既存 snapshot 不変
- [ ] commit 履歴 約 4 件
