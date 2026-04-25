# Phase 5c: XSS 脆弱性修正 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ユーザー入力フィールド（name/title/note/memo）の未エスケープ template literal 補間 約 57 件に `escHtml()` を適用し、`.lifeplan` インポート経由の XSS 攻撃経路を封じる。

**Architecture:** 単一 HTML ファイルの index.html 内 template literal 内で `${item.name}` のような補間を `${escHtml(item.name)}` に置換する最小変更方式。`escHtml()` は既存ヘルパ（index.html:11407）。計算ロジック (`calc/*.js`) には触らない。

**Tech Stack:** Vanilla JS, Vitest 2.x, vm.runInContext sandbox, 既存の `escHtml()` ヘルパ

**前提**: 設計書 `docs/superpowers/specs/2026-04-26-phase5c-xss-fix-design.md` を必ず参照のこと。

---

### Task 1: 期待方向ドキュメント + 影響箇所 dump

**Files:**
- Create: `docs/phase5c-fixes/expected-changes.md`

- [ ] **Step 1: 影響箇所を grep で dump**

```bash
mkdir -p docs/phase5c-fixes
{
  echo "# Phase 5c 影響箇所 dump"
  echo
  echo "## ${...name} 未保護"
  grep -nE '\$\{[^}]*\.name[^a-zA-Z]' index.html | grep -v "escHtml"
  echo
  echo "## ${...title} 未保護"
  grep -nE '\$\{[^}]*\.title[^a-zA-Z]' index.html | grep -v "escHtml"
  echo
  echo "## ${...note} 未保護"
  grep -nE '\$\{[^}]*\.note[^a-zA-Z]' index.html | grep -v "escHtml"
  echo
  echo "## ${...memo} 未保護"
  grep -nE '\$\{[^}]*\.memo[^a-zA-Z]' index.html | grep -v "escHtml"
} > docs/phase5c-fixes/affected-sites.txt
```

- [ ] **Step 2: expected-changes.md を作成**

```markdown
# Phase 5c: XSS 修正 期待される変更

**前提**: Phase 5a 監査 R3、Phase 5b 完了（246/246）

## 変更対象

| field | grep 件数 | 既保護 | 未保護（修正対象） |
|---|---|---|---|
| `${...name}` | 50 | 5 | ~45 |
| `${...title}` | 12 | 4 | ~8 |
| `${...note}` | 6 | 4 | ~2 |
| `${...memo}` | 3 | 1 | ~2 |
| 合計 | 71 | 14 | **~57** |

実際の修正件数は実装後に再 grep して確定する。

## 期待される動作変化

- 通常の日本語入力（asset.name="現金" 等）: 表示変化なし
- 特殊文字 `&`/`<`/`>`/`"`: HTML エンティティに置換
- XSS payload `<script>alert(1)</script>`: `&lt;script&gt;alert(1)&lt;/script&gt;` として安全描画

## snapshot 影響

既存 5 サンプルは特殊文字を含まない想定 → snapshot 不変見込み
変動した場合は内容確認後 update

## 計算ロジック影響

ゼロ（escHtml は表示用、calc/*.js 未触）

## 実際の SHA（実装後記載）

- chore: TBD
- fix: TBD
- docs: TBD

## 実際の修正件数（実装後記載）

- ${...name}: TBD 件
- ${...title}: TBD 件
- ${...note}: TBD 件
- ${...memo}: TBD 件
- 合計: TBD 件

## テスト

BUG#23 として 5 件追加。最終テスト数: 246 → 251 グリーン目標。
```

- [ ] **Step 3: commit**

```bash
git add docs/phase5c-fixes/
git commit -m "chore(phase5c): scaffold expected-changes + affected-sites dump"
```

---

### Task 2: name フィールドの escHtml 適用

**Files:**
- Modify: `index.html`（45 件前後の `${...name}` 補間）

- [ ] **Step 1: 修正対象を grep で確定**

```bash
grep -nE '\$\{[^}]*\.name[^a-zA-Z]' index.html | grep -v "escHtml" > /tmp/phase5c-name-sites.txt
wc -l /tmp/phase5c-name-sites.txt
```

期待件数: 約 45 件

- [ ] **Step 2: 各サイトを Edit で修正**

各サイトを Read で確認し、ユーザー入力経由かを判定:

**修正対象（ユーザー入力経由）の例:**
```javascript
// Before
html += `<div class="card-title">${item.name}</div>`;
// After
html += `<div class="card-title">${escHtml(item.name)}</div>`;
```

**修正不要（プログラム制御の値）の例:**
```javascript
// 修正不要: ASSET_TYPES.cash.name のような定数
${ASSET_TYPES[item.type].name}

// 修正不要: 関数名そのもの
${func.name}

// 修正不要: window.location.name のようなブラウザ API
```

判定基準:
- `state.profile.name`, `state.assets[].name`, `state.expenses[].name` 等の **state 起源** → 修正
- `assets[].name`, `item.name`, `e.name`, `g.name`, `s.name`, `child.name` 等のループ変数で state 由来 → 修正
- `ASSET_TYPES[..].name`, `INSURANCE_TYPES[..].name`, 定数 object のプロパティ → 修正不要
- 関数定義 `function ${name}` → 修正不要

判定に迷うものは **修正側に倒す**（escHtml 多重適用は害なし、防御を優先）。

- [ ] **Step 3: テスト実行**

```bash
source ~/.nvm/nvm.sh && npm test
```

期待: 246/246 グリーン（snapshot 不変）。snapshot が変動した場合は内容確認、特殊文字を含むサンプルがあれば期待方向として update。

- [ ] **Step 4: 手動 XSS 試験**

ブラウザでアプリを開き、以下を試す:
1. プロフィール → 名前に `<script>alert('xss')</script>` を入力 → 保存
2. ヘッダーや表示箇所で alert が**出ない**こと、`&lt;script&gt;` 表示になること

---

### Task 3: title/note/memo フィールドの escHtml 適用

**Files:**
- Modify: `index.html`（合計 12 件前後）

- [ ] **Step 1: title 8 件を修正**

```bash
grep -nE '\$\{[^}]*\.title[^a-zA-Z]' index.html | grep -v "escHtml"
```

各サイトを Edit で `${escHtml(...title)}` に置換。

判定基準は Task 2 と同じ（state 起源の cashFlowEvents[].title 等が対象）。

- [ ] **Step 2: note 2 件を修正**

```bash
grep -nE '\$\{[^}]*\.note[^a-zA-Z]' index.html | grep -v "escHtml"
```

期待: 6 件中既保護 4 件除いた 2 件。

- [ ] **Step 3: memo 2 件を修正**

```bash
grep -nE '\$\{[^}]*\.memo[^a-zA-Z]' index.html | grep -v "escHtml"
```

期待: 3 件中既保護 1 件除いた 2 件。

- [ ] **Step 4: テスト実行**

```bash
source ~/.nvm/nvm.sh && npm test
```

期待: 246/246 グリーン

---

### Task 4: BUG#23 XSS payload 注入テスト追加

**Files:**
- Modify: `test/regression.test.js`

- [ ] **Step 1: テスト方針確定**

`escHtml` 関数自体は `index.html` 内に定義され、`calc/*.js` には export されていない。テスト方法は 2 案:

**案 A: escHtml 単体テスト（推奨）**
- `vm.runInContext` で escHtml 関数だけを sandbox に注入
- 各 XSS payload に対して期待値を検証
- 5 件のテストケース

**案 B: 描画関数の統合テスト**
- Playwright でブラウザ起動 → state 注入 → render → DOM 検証
- コスト高、CI 影響大

**案 A を採用**: シンプル、信頼性高、既存 vm.runInContext パターンと整合。

- [ ] **Step 2: BUG#23 5 件を実装**

`test/regression.test.js` 末尾に追加:

```javascript
// ============================================================================
// BUG#23: XSS payload escape (Phase 5c)
// ----------------------------------------------------------------------------
// 背景: Phase 5a 監査で R3 として検出。innerHTML 経由でユーザー入力フィールド
// (profile.name, assets[].name 等) が未エスケープのまま描画される問題。
// Phase 5c で escHtml() を全 ~57 箇所に適用。本テストは escHtml 関数自体の
// 防御能力を XSS payload に対して検証する。
// ============================================================================

describe('BUG#23: escHtml XSS payload defense', () => {
  // index.html の escHtml 関数定義を sandbox にロード
  function loadEscHtml() {
    const fs = require('fs');
    const path = require('path');
    const vm = require('vm');
    const html = fs.readFileSync(
      path.join(process.cwd(), 'index.html'),
      'utf8'
    );
    // escHtml 関数の定義を抽出
    const match = html.match(/function escHtml\(s\)\s*\{[^}]+\}/);
    if (!match) throw new Error('escHtml not found in index.html');
    const sb = {};
    vm.createContext(sb);
    vm.runInContext(match[0], sb);
    return sb.escHtml;
  }

  it('1. <script>タグを含む payload をエスケープする', () => {
    const escHtml = loadEscHtml();
    const payload = '<script>alert(1)</script>';
    const result = escHtml(payload);
    expect(result).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(result).not.toContain('<script>');
  });

  it('2. <img onerror=...> 系 payload をエスケープする', () => {
    const escHtml = loadEscHtml();
    const payload = '<img src=x onerror=alert(1)>';
    const result = escHtml(payload);
    expect(result).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(result).not.toContain('<img');
  });

  it('3. 属性値ブレイク用 quote をエスケープする', () => {
    const escHtml = loadEscHtml();
    const payload = '"><script>alert(1)</script>';
    const result = escHtml(payload);
    expect(result).toContain('&quot;');
    expect(result).toContain('&lt;script&gt;');
  });

  it('4. <svg onload=...> 系 payload をエスケープする', () => {
    const escHtml = loadEscHtml();
    const payload = '<svg onload=alert(1)>';
    const result = escHtml(payload);
    expect(result).toBe('&lt;svg onload=alert(1)&gt;');
    expect(result).not.toContain('<svg');
  });

  it('5. & を含む通常テキストは &amp; にエスケープされる（二重エスケープ防止のため最初の置換）', () => {
    const escHtml = loadEscHtml();
    const payload = 'Tom & Jerry <html>';
    const result = escHtml(payload);
    expect(result).toBe('Tom &amp; Jerry &lt;html&gt;');
    // & が先に置換されるため、後続の &lt; が &amp;lt; に二重エスケープされない
  });
});
```

- [ ] **Step 3: テスト実行**

```bash
source ~/.nvm/nvm.sh && npm test
```

期待: 246 → **251** グリーン。

---

### Task 5: 完了確認 + commit

- [ ] **Step 1: 実際の修正件数を確認**

```bash
echo "=== 修正後の未保護件数 ==="
for f in 'name' 'title' 'note' 'memo'; do
  count=$(grep -cE "\\\$\{[^}]*\.${f}[^a-zA-Z]" index.html | grep -v "escHtml" | wc -l)
  total=$(grep -cE "\\\$\{[^}]*\.${f}[^a-zA-Z]" index.html)
  protected=$(grep -cE "escHtml\([^)]*\.${f}\)" index.html)
  echo "${f}: total=${total} protected=${protected}"
done
```

期待: 各フィールドで unprotected ≈ 0（state 由来でない定数のみ残る想定）。

- [ ] **Step 2: 全テスト最終確認**

```bash
source ~/.nvm/nvm.sh && npm test
```

期待: **251/251** グリーン

- [ ] **Step 3: 修正本体を commit**

```bash
git add index.html test/regression.test.js
git commit -m "fix(phase5c): apply escHtml to user-input fields (R3 XSS prevention)

Phase 5a で R3 として検出した escHtml 未適用問題に対応。
ユーザー入力フィールド (state.profile.name, assets[].name, expenses[].name,
cashFlowEvents[].title, recurringExpenses[].note 等) の template literal
補間 ~57 箇所に escHtml() を適用。

これにより \`.lifeplan\` インポート経由の XSS payload が描画時に
HTML エンティティへエスケープされ、攻撃経路が封じられる。

BUG#23 として 5 件の XSS payload 注入テストを追加。
246 → 251 グリーン。"
```

- [ ] **Step 4: SHA を expected-changes.md に記録 + commit**

```bash
# expected-changes.md の TBD を実際の SHA で置換 (Edit で対応)
git add docs/phase5c-fixes/expected-changes.md
git commit -m "docs(phase5c): record actual SHA + completion"
```

---

## 完了条件

- [ ] `${...name|title|note|memo}` 形式の未保護補間 約 57 件に escHtml 適用
- [ ] BUG#23 5 件追加（246 → 251 グリーン）
- [ ] 既存 snapshot 不変
- [ ] 手動 XSS 試験で payload エスケープ確認
- [ ] `docs/phase5c-fixes/expected-changes.md` 記録
- [ ] 3 commits（chore + fix + docs）
