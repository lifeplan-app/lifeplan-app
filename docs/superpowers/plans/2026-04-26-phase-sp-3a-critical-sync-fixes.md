# Phase SP-3-A: 連携系 Critical 修正 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Phase SP-2 監査で検出した連携系 Critical 2 件 + Important 1 件を修正し、ユーザーデータ破壊リスクを解消する。

**Architecture:** spending/index.html の `syncToLifeplan` / `doSyncToLifeplan` / `closeSyncConfirmModal` 周辺（L3556-3696）を修正。新規ヘルパ関数 `unsyncFromLifeplan` を追加し、UI に「連携解除」ボタンを設置。

**Tech Stack:** Vanilla JS (既存 ES module). 計算ロジックは触らない（spending/calc/* 不変）。

---

## 修正対象（3 件）

| ID | 重要度 | 内容 |
|---|---|---|
| Fix-1 | 🔴 Critical (SP-LP) | `doSyncToLifeplan` の stale-lp race（モーダル表示中に別タブで lifeplan 編集 → 古い snapshot で上書き） |
| Fix-2 | 🔴 Critical (SP-LP) | `finance.expense` のロールバック経路なし → 連携前値を記録 + 解除ボタン追加 |
| Fix-3 | 🟡 Important (SP-LP) | `irregular_variable` カテゴリが `recurringExpenses[]`（毎年計上）に書込 → スキップ |

## Fix-1: stale-lp race 解消

### 問題

`syncToLifeplan()` でモーダル表示時に `lp` を localStorage から読み snapshot として `_pendingSyncParams.lp` に保存。`doSyncToLifeplan()` 確定時にその snapshot を `JSON.stringify` で localStorage に書き戻す。間に別タブでライフプランが編集されると、その編集が無音で消える。

### 修正方針

`doSyncToLifeplan()` の冒頭で localStorage を**再読み込み**し、`_pendingSyncParams.lp` と diff。差分があれば確認ダイアログで警告。

### 修正コード（spending/index.html:3614 付近）

```javascript
function doSyncToLifeplan() {
  const params = _pendingSyncParams;
  closeSyncConfirmModal();
  if (!params) return;
  const { vals, lp: lpAtOpen, manYen, excludeHousing, excludeFamily } = params;

  // [Fix-1] モーダル表示中に lifeplan_v1 が編集されていないか確認
  let lpNow;
  try {
    const saved = localStorage.getItem('lifeplan_v1');
    lpNow = saved ? JSON.parse(saved) : null;
  } catch(e) { lpNow = null; }
  if (!lpNow) {
    showNotification('ライフプランデータが見つかりません');
    return;
  }
  if (JSON.stringify(lpAtOpen) !== JSON.stringify(lpNow)) {
    if (!confirm('別タブまたは別操作でライフプランデータが更新されています。\n最新の状態に対して連携を実行しますか？\n（キャンセルすると連携を中止します）')) {
      return;
    }
  }
  const lp = lpNow;  // 以降は最新値で更新

  if (!lp.finance) lp.finance = {};
  // ... 以降は既存ロジック（lp.finance.expense = manYen 等）
}
```

## Fix-2: ロールバック経路追加

### 問題

連携で `lp.finance.expense` を上書きする際、連携前値の記録がない。`lp._spendingExpense` は新規値を記録するのみで、ユーザーが連携を取り消したくても元の値に戻せない。

### 修正方針

1. 初回連携時のみ、連携前の `finance.expense` を `lp._spendingExpensePrev` に記録（再連携時は上書きしない）
2. 新規関数 `unsyncFromLifeplan()` を追加し、`_spendingExpensePrev` を `finance.expense` に書き戻して連携メタデータを削除
3. UI に「連携解除」ボタンを追加（連携済み状態の時のみ表示）

### 修正コード A: doSyncToLifeplan に prev 記録を追加（L3621 周辺）

```javascript
  if (!lp.finance) lp.finance = {};

  // [Fix-2] 初回連携時の元値を保存（再連携時は既存の prev を保持）
  if (lp._spendingExpensePrev === undefined) {
    lp._spendingExpensePrev = lp.finance.expense ?? null;
  }
  lp.finance.expense = manYen;
```

### 修正コード B: 新規関数 unsyncFromLifeplan（doSyncToLifeplan の直後に追加）

```javascript
function unsyncFromLifeplan() {
  if (!confirm('ライフプラン連携を解除し、月間生活費を連携前の値に戻しますか？\n（自動追加された不定期費用も削除されます）')) return;

  let lp;
  try {
    const saved = localStorage.getItem('lifeplan_v1');
    lp = saved ? JSON.parse(saved) : null;
  } catch(e) { lp = null; }
  if (!lp) {
    showNotification('lifeplan_v1 が見つかりません');
    return;
  }

  // finance.expense を連携前値に戻す
  if (lp._spendingExpensePrev !== undefined) {
    if (lp._spendingExpensePrev === null) {
      // 連携前は未設定だった → 削除
      if (lp.finance) delete lp.finance.expense;
    } else {
      if (!lp.finance) lp.finance = {};
      lp.finance.expense = lp._spendingExpensePrev;
    }
  }

  // 自動追加された recurringExpenses を削除（_spendingCatId マークで判定）
  if (Array.isArray(lp.recurringExpenses)) {
    lp.recurringExpenses = lp.recurringExpenses.filter(r => !r._spendingCatId);
  }

  // 連携メタデータを全削除
  delete lp._spendingSyncedAt;
  delete lp._spendingExpense;
  delete lp._spendingExpensePrev;
  delete lp._spendingBasedOn;

  localStorage.setItem('lifeplan_v1', JSON.stringify(lp));

  // spending 側 state も clean
  state.settings.linkedToLifeplan   = false;
  state.lifeplanSync.syncedAt       = null;
  state.lifeplanSync.monthlyExpense = null;
  state.lifeplanSync.basedOnMonths  = [];
  saveState();

  showNotification('ライフプラン連携を解除しました');
  renderSync();
  if (typeof updateLifeplanConnCard === 'function') updateLifeplanConnCard();
}
```

### 修正コード C: UI に「連携解除」ボタン

`renderSync()` 内で連携済み（`state.settings.linkedToLifeplan === true`）の時に表示するボタンを追加。具体的位置は `renderSync()` の出力 HTML を読んで判断（L? 付近）。

```bash
grep -n "function renderSync" spending/index.html
```

ボタン HTML 例:
```html
<button class="btn btn-outline" style="font-size:12px;padding:6px 12px" onclick="unsyncFromLifeplan()">連携を解除</button>
```

または、`syncAfterLink` 領域（L3682）内の連携完了メッセージの隣に解除リンクを並べる。

### Object.assign(window, …) に unsyncFromLifeplan 追加

L1416 付近の `Object.assign(window, {...})` ブロックに `unsyncFromLifeplan` を追加（onclick から呼び出すため）。
**ただし** `unsyncFromLifeplan` は spending/index.html 内の関数で、ES module の import ではない（state を直接触る）。`<script type="module">` 内で定義されているため、明示的に `window.unsyncFromLifeplan = unsyncFromLifeplan;` の登録が必要。または、関数定義を ES module の外側に出すかどうかは実装側の判断。

実装ガイド: spending/index.html の他の onclick ハンドラ（例: `syncToLifeplan`, `doSyncToLifeplan`, `activatePremiumTrial`）がどう登録されているかを grep で確認 → 同じパターンに従う。

```bash
grep -nE "window\.(syncToLifeplan|doSyncToLifeplan|activatePremiumTrial)" spending/index.html
```

## Fix-3: irregular_variable をスキップ

### 問題

承認済み suggestion を `recurringExpenses[]`（毎年計上）に書き込んでいるが、`domain === 'irregular_variable'` のカテゴリ（旅行・結婚式等の一回限りの特別費）まで毎年計上扱いになり、長期予測が膨張する。

CLAUDE.md の連携マッピング表では `irregular_variable` → `expenses[]`（一回限り）が想定だが、過去支出を将来 expenses として登録するのは別の問題（年指定が困難、シミュレーション意図不明）。

### 修正方針

irregular_variable の自動連携をスキップする保守的選択。ユーザーが将来支出として計画したい場合は手動で lifeplan.expenses[] に追加する運用とする。

将来 SP-3-B 以降で「irregular_variable は計上対象外」を UI で明示するなどの拡張を検討。

### 修正コード（spending/index.html:3624 周辺）

```javascript
  // 承認済み不定期費用を recurringExpenses に追加
  // [Fix-3] irregular_variable は一回限りの特別費なので毎年計上扱いにせずスキップ
  const approved = (state.lifeplanSync.irregularSuggestions || []).filter(s => {
    if (!s.approved) return false;
    const cat = state.categories.find(c => c.id === s.categoryId);
    if (!cat) return false;
    return cat.domain === 'irregular_fixed';  // fixed のみ連携対象
  });
  if (approved.length > 0) {
    // ... 既存ロジック（recurringExpenses への書き込み）
  }
```

---

### Task 1: Fix-1 stale-lp race 修正

**Files:**
- Modify: `spending/index.html` (around L3614-3621)

- [ ] **Step 1: doSyncToLifeplan の冒頭に lp 再読み込みと diff チェック追加**

上記 Fix-1 修正コードを Edit で適用。
- old_string: `function doSyncToLifeplan() { ... const { vals, lp, manYen, excludeHousing, excludeFamily } = params;` の該当ブロック
- new_string: 上記の lpAtOpen 命名に変更 + lpNow 再読み込み + diff 確認 + `const lp = lpNow;`

- [ ] **Step 2: 動作確認方針**

`doSyncToLifeplan` は実 localStorage を要するためユニットテストは難しい（Node 環境では localStorage 不在）。代わりに：
- Vitest テストは追加しない（統合テスト範囲）
- ブラウザでの手動確認をユーザーに依頼（コンソールで `localStorage.lifeplan_v1` を直接書き換え → 連携実行 → 警告表示確認）

- [ ] **Step 3: 既存テスト走らせ pass 確認**

```bash
source ~/.nvm/nvm.sh && npm test 2>&1 | tail -5
```

期待: 284/284 pass（変更は spending/index.html のみ、calc/* 不変）。

---

### Task 2: Fix-2 ロールバック対応追加

**Files:**
- Modify: `spending/index.html`

- [ ] **Step 1: doSyncToLifeplan に `_spendingExpensePrev` 保存ロジック追加**

L3621 の `lp.finance.expense = manYen;` 直前に Fix-2 修正コード A を追加。

- [ ] **Step 2: unsyncFromLifeplan 関数を追加**

`doSyncToLifeplan` の直後（L3697 周辺、function PREMIUM 直前）に Fix-2 修正コード B（unsyncFromLifeplan 関数）を挿入。

- [ ] **Step 3: window グローバル登録**

L1416 付近の `Object.assign(window, {...})` に `unsyncFromLifeplan` を追加。または、`<script type="module">` 内で `window.unsyncFromLifeplan = unsyncFromLifeplan;` を直接記述。実装は他の onclick ハンドラ（syncToLifeplan 等）の登録パターンに合わせる。

- [ ] **Step 4: UI に「連携解除」ボタン追加**

`renderSync()` 関数内で連携済み時の出力 HTML に解除ボタンを追加。具体的位置は実装者の判断（連携サマリーの下、または連携完了メッセージの右側）。シンプルなテキストリンクで OK：

```html
<button class="btn btn-outline" style="font-size:11px;padding:4px 10px;margin-top:8px" onclick="unsyncFromLifeplan()">連携を解除</button>
```

- [ ] **Step 5: テスト確認**

```bash
source ~/.nvm/nvm.sh && npm test 2>&1 | tail -5
```

期待: 284/284 pass（変更は UI のみ）。

---

### Task 3: Fix-3 irregular_variable スキップ

**Files:**
- Modify: `spending/index.html`

- [ ] **Step 1: approved フィルタを修正**

L3624 の `const approved = (state.lifeplanSync.irregularSuggestions || []).filter(s => s.approved);` を Fix-3 のコードに置換。

- [ ] **Step 2: テスト確認**

```bash
source ~/.nvm/nvm.sh && npm test 2>&1 | tail -5
```

期待: 284/284 pass。

---

### Task 4: 動作確認 + 統合 commit

- [ ] **Step 1: 全テスト確認**

```bash
source ~/.nvm/nvm.sh && npm test 2>&1 | tail -5
```

期待: 284 unit tests pass。

- [ ] **Step 2: 静的整合性チェック**

```bash
echo "=== 新規追加関数 ==="
grep -n "function unsyncFromLifeplan" spending/index.html
echo "=== window 登録 ==="
grep -n "unsyncFromLifeplan" spending/index.html
echo "=== Fix-1/2/3 マーカー ==="
grep -n "\[Fix-[123]\]" spending/index.html
```

期待:
- `unsyncFromLifeplan` の関数定義 1 箇所 + window 登録 1 箇所 + onclick 内 1 箇所
- `[Fix-1]` / `[Fix-2]` / `[Fix-3]` のコメント 3 箇所以上

- [ ] **Step 3: 統合 commit**

```bash
git add spending/index.html
git commit -m "$(cat <<'EOF'
fix(phase-sp-3a): 連携系 Critical 2 件 + Important 1 件を修正

[Fix-1] doSyncToLifeplan の stale-lp race 解消
- モーダル表示時の lp snapshot ではなく、確定時に localStorage を再読み込み
- 差分があれば confirm ダイアログでユーザーに警告
- 別タブでの lifeplan 編集が黙って上書きされる Critical 問題を解消

[Fix-2] finance.expense のロールバック経路追加
- 初回連携時に lp._spendingExpensePrev に連携前値を記録
- 新規関数 unsyncFromLifeplan() を追加し、解除時に元値に復元
- 自動追加した recurringExpenses (_spendingCatId 付き) も削除
- UI の連携サマリーに「連携を解除」ボタンを追加

[Fix-3] irregular_variable の毎年計上問題を修正
- 一回限りの特別費（旅行・結婚式等）が recurringExpenses[]
  （毎年計上）に書き込まれ長期予測が膨張する問題を解消
- 連携対象を irregular_fixed のみに絞る（保守的対応）
- irregular_variable の自動連携は SP-3-B 以降で別途検討

機能変更:
- ライフプラン連携時に「連携を解除」ボタンが UI 表示される
- 連携前値が lp._spendingExpensePrev に記録される
- irregular_variable カテゴリが auto-sync 対象外になる

Phase SP-2 監査の SP-LP 領域 Critical 2 件 + Important 1 件
（recurringExpenses 誤配置）を解消。
EOF
)"
```

---

### Task 5: ドキュメント更新

- [ ] **Step 1: docs/spending-fixes/phase-sp-3a-completion.md を作成**

```markdown
# Phase SP-3-A: 連携系 Critical 修正 完了

**完了日**: 2026-04-26
**対象**: SP-LP 監査検出 Critical 2 + Important 1

## 修正内容

| ID | 重要度 | 修正前 | 修正後 |
|---|---|---|---|
| Fix-1 | 🔴 Critical | モーダル表示中の lp snapshot で上書き | 確定時に再読み込み + diff 警告 |
| Fix-2 | 🔴 Critical | 連携前値の記録なし、解除不可 | _spendingExpensePrev 記録 + 解除ボタン |
| Fix-3 | 🟡 Important | irregular_variable も recurringExpenses に書込 | irregular_fixed のみに限定 |

## テスト

ユニットテスト: 284/284 グリーン（変更箇所は UI 統合層のため新規ユニットテストなし）。
ブラウザでの手動動作確認をユーザーに依頼。

## ブラウザ確認ポイント

1. 別タブで lifeplan 編集 → 連携モーダル confirm → 警告ダイアログ表示
2. 連携実行後、UI に「連携を解除」ボタンが表示される
3. 「連携を解除」クリック → finance.expense が元値に戻る
4. irregular_variable カテゴリ（特別費）の suggestion を承認しても recurringExpenses に追加されない

## SP-3-A 完了

SP-2 監査の最深刻 3 件を解消。残 SP-LP Important 4 件 + Minor 3 件 + 他領域は SP-3-B 以降で対応。

## commit

`(TBD)` fix(phase-sp-3a): 連携系 Critical 2 件 + Important 1 件を修正
`(TBD)` docs(phase-sp-3a): 完了ドキュメント
```

- [ ] **Step 2: commit**

```bash
mkdir -p docs/spending-fixes
git add docs/spending-fixes/phase-sp-3a-completion.md
git commit -m "docs(phase-sp-3a): 完了ドキュメント"
```

## 完了条件

- [ ] Fix-1: stale-lp race 解消（diff 確認ダイアログ）
- [ ] Fix-2: ロールバック対応（unsyncFromLifeplan + UI ボタン）
- [ ] Fix-3: irregular_variable スキップ
- [ ] 全 284 ユニットテスト pass
- [ ] 静的整合性チェック pass
- [ ] ドキュメント記録
- [ ] 2 commits
