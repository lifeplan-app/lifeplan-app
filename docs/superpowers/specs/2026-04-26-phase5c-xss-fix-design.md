# Phase 5c: XSS 脆弱性修正 設計書

**作成日**: 2026-04-26
**前提**: Phase 5a 監査で R3（HTML 直書き API + escape ヘルパ適用率 16%）を Medium-High リスクとして検出。Phase 5b で Quick Win 完了済み（246/246 グリーン）。

## 目的

`innerHTML` 経由でユーザー入力フィールド（profile.name, assets[].name, expenses[].name 等）が未エスケープのまま描画され、`.lifeplan` インポート経由の XSS 攻撃が可能な状態を解消する。

## スコープ

### 対象（Tier 1: ユーザー入力テキストフィールド）

`${...field}` 形式の template literal 補間で、以下の field 名が現れ、かつ escHtml() で囲まれていない箇所：

| フィールド | 対象数 |
|---|---|
| `${...name}` | 45 件（50 中 5 件は既に保護済み） |
| `${...title}` | 8 件（12 中 4 件は保護済み） |
| `${...note}` | 2 件（6 中 4 件は保護済み） |
| `${...memo}` | 2 件（3 中 1 件は保護済み） |
| **合計** | **約 57 件** |

実装時に grep 結果を再確認し、誤検出（`item.toLowerCase()` の `.name` プロパティ等とは無関係なケース）と漏れ（複合プロパティ `${item.profile?.name}` 等）を補正する。

### 対象外

- onclick/onchange 等のインライン event handler 内の id 文字列（304 箇所、Phase 5a で受容判定済み）
- inline style 属性（2,344 箇所、同上）
- 残り 84% の innerHTML 全件レビュー（Phase 5a で「ユーザー入力を含むものを抽出」と方針決定済み、Tier 1 で実効防御可能）
- createElement+textContent への構造的移行（コスト過大、escHtml ラッピングで同等防御）

## アプローチ

**escHtml ラッピング方式**: 既存の template literal 内で `${item.name}` を `${escHtml(item.name)}` に置換する最小変更方式。

### なぜ escHtml ラッピング か

- 既存の 30 箇所の保護パターンと整合（一貫性）
- 計算ロジック未触（`calc/*.js` への影響ゼロ）
- レンダリング動作不変（XSS payload は `&lt;` 等にエスケープされる）
- diff が読みやすく、レビューしやすい
- 後方互換性 100%（ユーザーが入力した日本語・記号はそのまま表示される）

## 修正パターン

### 基本パターン

```javascript
// Before:
html += `<div class="card">${item.name}</div>`;

// After:
html += `<div class="card">${escHtml(item.name)}</div>`;
```

### null/undefined ガード

`escHtml()` は `String(s)` で正規化済みのため、`null`/`undefined` は `'null'`/`'undefined'` 文字列に変換される。これは挙動変更となるため、null チェック付きの既存パターンが多い：

```javascript
// 既存パターン（保持）:
${item.name ? escHtml(item.name) : ''}
${item.note ? `<small>${escHtml(item.note)}</small>` : ''}
```

### 属性値内の補間

属性値（`title="..."`, `data-name="..."` 等）内のユーザー入力も対象：

```javascript
// Before:
`<div title="${item.name}">`

// After:
`<div title="${escHtml(item.name)}">`
```

## エッジケース

1. **絵文字・emoji**: escHtml は ASCII エスケープのみ → emoji は素通し（既存挙動と整合）
2. **空文字列**: `escHtml('') === ''` → 表示変化なし
3. **数値フィールド**: 対象外（数値は `toLocaleString()` 等で別途整形済み）
4. **既に escHtml 済の箇所**: 二重エスケープ防止のためスキップ（grep で `escHtml(...field)` を除外）
5. **HTML を意図的に含む箇所**（icon SVG、emoji 等の定数）: 対象外（ユーザー入力ではない）

## テスト戦略

### BUG#23: XSS payload 注入テスト

`test/regression.test.js` に以下 5 件追加：

1. **profile.name**: `state.profile.name = '<script>alert(1)</script>'` をセット → renderProfileCard() 等の出力 HTML に `&lt;script&gt;` で含まれること
2. **assets[].name**: `state.assets[0].name = '<img src=x onerror=alert(1)>'` をセット → 資産一覧 HTML に `&lt;img` でエスケープされること
3. **expenses[].name**: `state.expenses[0].name = '"><script>alert(1)</script>'` をセット → 一時支出一覧 HTML に `&quot;` でエスケープされること
4. **cashFlowEvents[].title**: `state.cashFlowEvents[0].title = '<svg onload=alert(1)>'` をセット → cash flow event 一覧で escape されること
5. **recurringExpenses[].note**: `state.recurringExpenses[0].note = '<iframe src=javascript:alert(1)>'` をセット → 繰り返し支出一覧で escape されること

各テストの実装方針：
- 既存の `loadCalc()` パターンと同様、`vm.runInContext` で sandbox 内で render 関数を呼び出し（必要に応じて DOM stub を sandbox に注入）
- もしくは escHtml() の単体テスト（5 種の payload に対して期待値を検証）を最小実装として代替

### snapshot 影響

- 既存 5 サンプルシナリオ: profile.name, asset.name 等は通常の日本語文字列のみ → escHtml 適用後も同じ HTML 出力 → snapshot 不変想定
- 万一 snapshot 変動した場合は内容確認後 update（特殊文字 `&` を含むサンプルがある場合は `&` → `&amp;` に変わる）

### XSS リグレッションの可視化

`docs/phase5c-fixes/expected-changes.md` に修正前後の例を記録：
```
Before: <div>${item.name}</div>
After:  <div>${escHtml(item.name)}</div>
Effect: name="<script>" → "&lt;script&gt;" として安全に描画
```

## 後方互換

- 通常のユーザー入力（日本語・英数字・絵文字）→ escHtml 通過後も視覚的に同一
- HTML を意図的に含めていたユーザー → 描画方式変化（ただしそういうユーザーはおらず、含めていた場合は XSS 経路として正しく封じる）
- localStorage `lifeplan_v1` スキーマは不変
- 計算ロジックには影響なし（escHtml は表示用のみ）

## 実装手順

1. **準備**: `docs/phase5c-fixes/expected-changes.md` 作成、影響箇所一覧 dump
2. **修正パス 1（name）**: `${...name}` 未保護 45 件を `${escHtml(...name)}` に置換
3. **修正パス 2（title/note/memo）**: 残り 12 件を同様に置換
4. **テスト追加**: BUG#23 5 件
5. **動作確認**: `npm test` 全グリーン
6. **手動 XSS 試験**: ブラウザで profile.name に `<script>alert(1)</script>` を入力 → アラートが出ないこと、HTML タブで `&lt;script&gt;` で表示されること
7. **commit**: 3 commits 構成

## commit 構成

1. `chore(phase5c): scaffold expected-changes`
2. `fix(phase5c): apply escHtml to user-input fields (R3 XSS prevention)`
3. `docs(phase5c): record actual SHA + completion`

合計 **3 commits**。

## 完了条件

- [ ] `${...name|title|note|memo}` 形式の未保護補間 約 57 件に escHtml 適用
- [ ] BUG#23 として 5 件の XSS payload 注入テスト追加（246 → 251 グリーン）
- [ ] 既存 snapshot 不変（または特殊文字含むサンプルがあれば期待方向で update）
- [ ] 手動 XSS 試験で payload がエスケープされることを確認
- [ ] `docs/phase5c-fixes/expected-changes.md` 記録

## ヘルススコア更新予定

- セキュリティ: B+ → **A-**（XSS 防御強化、Phase 5a 検出 R1/R2/R3/R4 すべて対応完了）
- 計算精度: A（不変）
- テストカバレッジ: A → **A**（251/251）

## Phase 5d 候補（次）

- 暗号化強化: PBKDF2 + AES-GCM のパスワードベース暗号化（オプション、ユーザーニーズ次第）
