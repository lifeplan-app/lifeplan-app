# Phase 5e-a: 支出管理アプリ セキュリティ監査

**実施日**: 2026-04-26
**対象**:
- `spending/index.html`（5,256 行）
- `spending/calc/*.js`（5 モジュール: aggregate / csv-parser / suggest / sync / utils）
- `spending/schema.js`（268 行）
- `spending/affiliate-config.js`（68 行）
- `spending/load-data.html`（152 行）
- `spending/manifest.json`
- `_headers` / `netlify.toml`（CSP・追加ヘッダー）
- `sw.js`（共通 Service Worker）

**前提**: Phase 5a で lifeplan 側監査・Phase 5b/5c で対応済（R1 鍵正直化、R2 noopener、R3 escape 適用、R4 import 検証）。本監査は spending 側を網羅し、共通インフラ（CSP・SRI・SW）と spending 固有のリスク（CSV インポート、ライフプラン連携、Premium）を確認する。

---

## サマリー

| ID | リスク | 重要度 | 受容/要対応 |
|---|---|---|---|
| **R1**  | エクスポート JSON が平文・無警告 | 🟡 Important | 要対応（5e-b） |
| **R2**  | `target="_blank"` の `rel="noopener noreferrer"` 漏れ 3 箇所 + `window.open` 1 箇所 | 🟡 Important | 要対応（5e-b） |
| **R3**  | `escHtml` 不在 + `innerHTML` 56 箇所中ユーザー入力経路 8〜10 箇所が未エスケープ → 確実な XSS 経路 | 🔴 Critical | 要対応（5e-b/5e-c） |
| **R4**  | `importSpendingData` のサイズ上限・スキーマ検証・プロト汚染対策なし | 🟡 Important | 要対応（5e-b） |
| **R5**  | CSP は有効、外部 CDN は Chart.js のみ（SRI 済）。`unsafe-inline` 受容継続 | 🟢 Minor | 受容 |
| **R6**  | `keepRawMonths=3` で raw を null 化、`spending_v1` 容量・iOS ITP 影響 | 🟢 Minor | 別フェーズ |
| **R7**  | spending 側に PDF 出力なし（OS 印刷経路のみ） | 🟢 Minor | 受容 |
| **R8**  | `isPremium()` は localStorage 改竄で容易にバイパス可（クライアント完結なので構造的問題） | 🟡 Important | 設計上受容 / 要表記 |
| **R9**  | `syncToLifeplan` / `unsyncFromLifeplan` が壊れた spending state で `lifeplan_v1` を破壊しうる | 🟡 Important | 要対応（5e-c） |
| **R10** | `PREMIUM_WAITLIST_URL` で運営メアドが平文露出（スパムリスク） | 🟡 Important | 要対応（任意） |
| **R11** | `load-data.html` は CSP の対象だがスキーマ検証が浅い（`categories`/`months` 存在チェックのみ） | 🟢 Minor | 要対応（5e-b） |
| **R12** | Service Worker が cross-origin（cdnjs）レスポンスを無条件キャッシュ | 🟢 Minor | 別フェーズ |

**集計**: Critical **1** / Important **6** / Minor **5**

---

## 1. 監査対象 / 脅威モデル

### 守るもの
- 個人の支出明細（明細テキストには店名・メモ等の私的情報を含むことがある）
- `localStorage['spending_v1']` のデータ
- `localStorage['lifeplan_v1']`（spending 側の sync 機能で書き込み権を持つ）
- 想定外の外部送信ゼロ

### 攻撃面（spending 固有）
- ✅ バックエンドなし（CSP `connect-src 'none'`）
- ⚠️ **CSV インポート経路**：第三者から渡された CSV / JSON エクスポートファイルから攻撃 payload 流入
- ⚠️ **JSON インポート経路**（`importSpendingData` / `importSpendingDataOnboarding` / `load-data.html`）
- ⚠️ **ライフプラン連携経由**：spending 側で書き込んだ `lifeplan_v1` が lifeplan 側で読まれる
- ⚠️ **Premium バイパス**：DevTools / localStorage 編集で `premiumPlan: 'paid'` を設定可能

### 既存防御（共通）
- ✅ CSP: `default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; frame-ancestors 'none'`（`/*` 適用 → spending にも有効）
- ✅ HTTPS 強制（netlify.toml）
- ✅ X-Frame-Options / X-Content-Type-Options / Referrer-Policy / Permissions-Policy
- ✅ Chart.js は SRI（`integrity` + `crossorigin` + `referrerpolicy`）
- ✅ 動的コード評価関数（eval/Function/setTimeout(string)）不使用

---

## 2. 検出リスク

### 🔴 R3: escape ヘルパ不在 + ユーザー入力 innerHTML 経路に複数の XSS 脆弱性

**該当箇所**: `spending/index.html` 内 56 件の `innerHTML` 使用のうち、以下がユーザー入力（自由テキスト）を未エスケープで埋め込む。

| 行 | 内容 | 入力源 |
|---|---|---|
| **L2278〜2325** `renderCatList` | `${c.emoji} ${c.name}` をテンプレートに直挿入 | カスタムカテゴリ名・絵文字（`addCustomCategory`） |
| **L2604〜2659** `renderLedgerList` | `${e.description}`, `${cat.emoji} ${cat.name}` を直挿入 | CSV `description` / 手動入力 |
| **L2627** | `<div ...>${e.description || ...}</div>` | CSV 由来の自由テキスト |
| **L2810** `openMappingModal` | `<option value="${c.id}">${c.emoji} ${c.name}</option>` | カスタムカテゴリ名・絵文字 |
| **L2815** | `<span class="map-from">${cat}</span>` および `data-mf="${cat}"` | CSV 由来の MF カテゴリ名 |
| **L2900** `showImportPreview` | `${y}年${m}月` までは静的だが、`${monthList}` 内に CSV カテゴリ等は入らない（OK） | — |
| **L4322** `buildWizardSteps.displayName` | `` `${e.mfCategory} › ${e.mfSubCategory}` `` | CSV カテゴリ名（後段 4407 で textContent に格納のため XSS 不発） |
| **L4424〜4431** `wizardDataSummary` | `${exText}` = CSV `description` の連結 | CSV 由来 |
| **L4496〜4499** `renderWizardResult` | `<option ...>${c.emoji} ${c.name}</option>` | カスタム入力 |
| **L4643〜4651** `renderBonusList` | `<input ... value="${b.label}">` | ボーナス名（手入力） — **属性内クォート脱出 XSS** |
| **L4886, 4892, 4906** `renderMappingSettings` | `<option value="${c.id}">${c.emoji} ${c.name}</option>` および `<span ...>${key}</span>` | カスタム入力 / CSV 由来 mapping key |
| **L4978〜4988** `openCatSettings` | `${cat.emoji}`, `${cat.name}` を innerHTML 経由 | カスタム入力 |
| **L5086** `addCustomCategory` の確認は notification（`textContent` 系）→ 無害 | — | — |

**検証**:
```bash
grep -nE "escHtml|escapeHtml" spending/index.html
# (出力 0 件 — エスケープ関数が一切定義されていない)
```

**影響**:
1. **属性内 XSS**（最危険）: `renderBonusList` の `value="${b.label}"` に `" onfocus="alert(1)` を注入されると、ボーナスリスト再描画時に即時実行
2. **自由テキスト XSS**: 第三者から「サンプル CSV ですよ」と渡されたファイルに `<script>` や `<img onerror>` を仕込めば、インポート → 月次台帳表示時に発動
3. **JSON エクスポートされたデータを別端末/別ユーザーに渡す（共有）** ユースケースで連鎖被害

**重要度**: 🔴 **Critical**
- ユーザー入力（カスタムカテゴリ名、ボーナス名、CSV description）が UI に再表示される全パスにエスケープ無し
- Phase 5a の lifeplan 側でも escape ヘルパ存在＋適用率 16% で R3 として識別された問題が、spending 側では「ヘルパが存在しない」状態で更に悪化

**修正方針**:
- (A) `escHtml(s)` を `spending/calc/utils.js` に追加してモジュール経由で利用
- (B) 上記の 8〜10 箇所を escape 適用 or `textContent`/`createElement` 化
- (C) lint で `${.+\.(name|description|emoji|label|mfCategory|mfSubCategory)}` パターンを innerHTML 内で検知するリグレッション

---

### 🔴/🟡 R1: JSON エクスポートが平文・無警告

**該当箇所**: `exportSpendingData()` (L5104〜5120)

```javascript
const json = JSON.stringify(state, null, 2);
const blob = new Blob([json], { type: 'application/json' });
// ファイル名: spending_backup_YYYYMMDD.json
```

**現状**:
- 平文 JSON（暗号化なし）。lifeplan 側の `.lifeplan` は AES-GCM「難読化」が掛かっているのに対し、spending 側は素のまま。
- ファイル内容: 全明細テキスト（店舗名・メモ）、収入額、ボーナス、`premiumTrialStart`、`lifeplanSync` メタデータ
- UI 上に「機密情報なので取扱注意」表示なし

**影響**:
- ファイル誤送信 / クラウド共有 / メール添付で第三者に直接読まれる
- lifeplan 側より明細テキストの個人情報密度が高い（店舗名から行動範囲推定可能）

**重要度**: 🟡 Important（lifeplan 側の鍵ハードコードは 5b で「正直化」で対応済み。spending 側は更に弱い「平文」状態）

**修正方針**:
- (A) UI に「このファイルには支出明細が含まれます。取扱に注意してください」警告を表示
- (B) lifeplan 側と同じ難読化（不要に複雑化するため非推奨）
- (C) エクスポート前に「明細を含む / 含まない（集計のみ）」を選択させる機能（プライバシー重視ユーザー向け）

---

### 🟡 R2: `target="_blank"` の `rel="noopener noreferrer"` 漏れ

**該当箇所**:
- L744: `<a href="../legal.html#disclaimer" target="_blank">` — rel なし
- L746: `<a href="../legal.html" target="_blank">` — rel なし
- L2512: `<a href="../legal.html#disclaimer" target="_blank">` — rel なし
- L2486: 改善提案 CTA — `rel="sponsored noopener noreferrer"` あり ✅
- L3885: `window.open(PREMIUM_WAITLIST_URL, '_blank')` — `noopener` フラグなし

**現状**: 内部リンク（legal.html）3 件 + `window.open` 1 件で reverse tabnabbing 対策が漏れている。`window.open` の戻り値を使っていないので `,'noopener'` を第3引数に追加すべき。

**重要度**: 🟡 Important（内部リンクのみなので即座の悪用は困難。ただし legal.html を将来的に独立リソースとした場合や、affiliate 静的 HTML 経由で攻撃成立しうる）

**修正方針**:
1. L744, L746, L2512: `rel="noopener noreferrer"` 追加
2. L3885: `window.open(PREMIUM_WAITLIST_URL, '_blank', 'noopener')`

---

### 🟡 R4: JSON インポート（`importSpendingData` / `importSpendingDataOnboarding`）の検証不足

**該当箇所**: L5122〜5170

```javascript
const imported = JSON.parse(e.target.result);
if (!imported || typeof imported !== 'object') throw new Error('不正なデータ形式');
// ...
Object.assign(state, imported);  // ← 全プロパティを spread
```

**現状**:
- `JSON.parse` の例外は catch 済み ✅
- 型チェックは「object であるか」のみ
- ファイルサイズ上限なし → 数百 MB の JSON を読み込ませれば DoS 可能
- スキーマ検証なし → `{categories: 'string'}` 等の型不整合で実行時例外
- プロトタイプ汚染対策なし: `__proto__`, `constructor`, `prototype` キーが state に注入されうる
  - 現行の `JSON.parse` は `__proto__` をデータプロパティとしてセットするため Object.prototype 汚染は起きないが、`Object.assign(state, imported)` で `state.__proto__` のシャドーや `state.constructor` 上書きは発生しうる
- `_version` チェックなし → 将来スキーマと衝突した古いデータも素通り

**`load-data.html` (L91〜97)** の `applyData` も同等：
```javascript
if (!data.categories) throw new Error('"categories" がありません');
if (!data.months) throw new Error('"months" がありません');
data._onboardingDone = true;
localStorage.setItem('spending_v1', JSON.stringify(data));
```
最低限のチェックだけで型・サイズ・プロト汚染対策なし。

**影響**:
- DoS（ブラウザ固まる）
- インポート後の表示パスで R3 と組み合わせて XSS 連鎖
- `state.__proto__` を上書きされると後続コードの挙動を破壊しうる

**重要度**: 🟡 Important

**修正方針** (lifeplan 側 5b と同じ手法):
- ファイルサイズ上限（例: 10MB — sample data が約 1.3MB なので）
- `JSON.parse` 後に `__proto__` / `constructor` / `prototype` のキーを再帰的に削除
- `_version === 'spending_v1'` を要求
- `categories` が配列、`months` がオブジェクトであるか型検証
- `Object.assign(state, imported)` の代わりに既知キーのみコピー（明示的 allowlist）

---

### 🟢 R5: CSP / 外部リソース

**現状**:
```
default-src 'self'
script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com
style-src 'self' 'unsafe-inline'
img-src 'self' data:
connect-src 'none'
frame-ancestors 'none'
```
`/*` 適用ルールなので `/spending/` 配下にも有効 ✅

**spending 内のスクリプト**:
- L29: Chart.js 4.4.1 from cdnjs（SRI 完備）
- L31: `affiliate-config.js`（同一オリジン）
- L1415: `<script type="module">` 本体
- L5248: `<script>` ServiceWorker 登録（インラインだが `unsafe-inline` 許可済）

**確認結果**: ✅ 検証済 — `connect-src 'none'` で fetch/XHR をブロック、Chart.js 以外の外部 CDN なし、SW は same-origin のみ。`unsafe-inline` 受容（lifeplan 側 R5 と同じ判断）。

**重要度**: 🟢 Minor

---

### 🟢 R6: localStorage 容量・iOS ITP

**該当箇所**: `loadState` (L1689) / `saveState` (L1743)

**現状**:
- `keepRawMonths=3` で 4 ヶ月以上前の `entries` を `null` 化（`schema.js: pruneRawEntries`）→ 容量逓減対策あり
- `saveState` は QuotaExceededError を catch して通知 ✅
- ただし `pruneRawEntries` を呼ぶ箇所が確認できず（schema.js に定義のみ）→ **要確認**
- iOS Safari の ITP（7 日 localStorage 揮発）への明示的対策なし

**影響**:
- データ永続性の可用性問題のみ。漏洩リスクとは無関係
- `pruneRawEntries` 未呼び出しなら長期運用で 5MB 上限に到達する可能性

**重要度**: 🟢 Minor（lifeplan 側 R6 と同じ判断。別フェーズで IndexedDB 移行検討）

---

### 🟢 R7: PDF / エクスポート経由の漏洩

**該当箇所**: spending 側の関数を grep した範囲では PDF 出力機能は実装されていない（`html2canvas`/`jsPDF` も import なし）。

**確認結果**: ✅ spending 側に PDF 出力なし。エクスポート経由の漏洩は R1（JSON）のみで R7 は空集合。

**重要度**: 🟢 Minor

---

### 🟡 R8: Premium バイパス耐性（spending 固有）

**該当箇所**: `isPremium()` (L3847〜3856)

```javascript
function isPremium() {
  const s = state.settings;
  if (s.premiumPlan === 'paid') return true;
  if (s.premiumPlan === 'trial' && s.premiumTrialStart) {
    const elapsed = (Date.now() - new Date(s.premiumTrialStart).getTime()) / 86400000;
    return elapsed < PREMIUM_TRIAL_DAYS;
  }
  return false;
}
```

**現状**:
- 判定ソースは `state.settings.premiumPlan` のみ
- 署名検証なし、サーバ照会なし（CSP `connect-src 'none'` の制約上、サーバ照会はそもそも不可能）
- `isPremium()` を信頼している箇所: `renderPremiumTrend` (L4061), `renderPremiumSim` (L4168) の 2 ヶ所
- 攻撃手順: DevTools → `state.settings.premiumPlan = 'paid'; saveState()` → ブラウザリロードで全プレミアム機能が解放される

**影響**:
- **意図された設計**：完全クライアント完結アーキテクチャの結果なので、これは構造上の制約であり「脆弱性」ではない
- ただし、UI/コミュニケーション上「チート可能であること」を運営側が認識して値付け（マネタイズ）戦略を立てる必要

**重要度**: 🟡 Important（脆弱性というより設計選択の問題）

**修正方針**:
- (A) 受容（クライアントのみで完結する設計を維持）
- (B) サーバ + JWT 検証導入（CSP `connect-src` 緩和必要 → アーキテクチャ変更）
- (C) 短期トライアルの多重発動防止のみ実装（`premiumTrialStart` を 1 度設定したら以後無効化）

---

### 🟡 R9: ライフプラン連携経由の `lifeplan_v1` 破壊リスク

**該当箇所**:
- `syncToLifeplan` (L3614〜3669)
- `doSyncToLifeplan` (L3676〜3787)
- `unsyncFromLifeplan` (L3790〜3837)
- `updateLifeplanConnCard` (L3258)
- `_lpForSavings` 一時取得 (L2470)

**現状**:
1. `syncToLifeplan` は `JSON.parse(localStorage.getItem('lifeplan_v1'))` を catch 付きで読む ✅
2. その lp に対して `lp.finance.expense = manYen` で書き込み、`localStorage.setItem('lifeplan_v1', JSON.stringify(lp))` で全置換
3. **読み取った lp のスキーマ検証なし** → `lp` が壊れていても（例：オブジェクトでなかった場合は parse でエラーになるが、配列だった場合 `.finance` プロパティが追加されて構造汚染）そのまま書き戻す
4. `_spendingExpensePrev`, `_spendingSyncedAt`, `_spendingExpense`, `_spendingBasedOn` という `_` プレフィックスメタを追加 → 命名衝突リスク
5. `unsyncFromLifeplan` は `recurringExpenses.filter(r => !r._spendingCatId)` で削除するが、ユーザーが手動で `_spendingCatId` 入りエントリを作っていたら誤削除しうる
6. `JSON.stringify(lpAtOpen) !== JSON.stringify(lpNow)` の競合検出は実装済み ✅

**影響**:
- spending 側の state が R4 経路で破壊された場合、`syncToLifeplan` で `lifeplan_v1` も連鎖破壊される
- 予期しない `vals.monthlyTotal` (NaN, Infinity) が `lp.finance.expense` に書き込まれる可能性

**重要度**: 🟡 Important

**修正方針**:
- 書き込み前に `manYen` が `Number.isFinite(manYen) && manYen >= 0` を検証
- `lp` が plain object であることを `Array.isArray` で否定検証
- `_spendingCatId` の代わりに `Symbol` または UUID prefix を使う

---

### 🟡 R10: `PREMIUM_WAITLIST_URL` のメアド露出

**該当箇所**: L3844

```javascript
const PREMIUM_WAITLIST_URL = 'mailto:higawarilunch912@gmail.com?subject=...&body=...';
```

**現状**:
- 運営者個人 Gmail アドレスが index.html ソース内で平文露出
- 本日付（2026-04-26）の context にも `higawarilunch912@gmail.com` が記載されている → 同一アドレスの可能性
- mailto URL のスパムボット採取リスク（GitHub クローラ等）
- subject/body は固定文字列でユーザー入力が混入する経路は見当たらない（インジェクションリスクは低）

**影響**:
- メアドへのスパム/フィッシング標的化
- 運営者個人アドレス露出（ビジネス拡大時に変更コスト発生）

**重要度**: 🟡 Important（プライバシー寄りの問題）

**修正方針**:
- (A) 運営専用ドメインのメアドへ移行（`waitlist@<domain>` 等）
- (B) メアドではなく Google Form / Airtable Form 等の URL に変更（ASP/フォームサービス経由）
- (C) Cloudflare の email obfuscation 機能を利用（ただし `mailto:` は obfuscate しないので限定的）

---

### 🟢 R11: `load-data.html` のスキーマ検証が浅い

**該当箇所**: `load-data.html` L91〜97

```javascript
function applyData(data) {
  if (!data || typeof data !== 'object') throw new Error('不正なデータ形式です');
  if (!data.categories) throw new Error('"categories" がありません');
  if (!data.months) throw new Error('"months" がありません');
  data._onboardingDone = true;
  localStorage.setItem('spending_v1', JSON.stringify(data));
}
```

**現状**:
- 存在チェックのみ。型・要素数・プロト汚染対策なし
- 直接 `localStorage.setItem` するため、その後の `index.html` で `JSON.parse` した瞬間に壊れたデータが state に流入

**重要度**: 🟢 Minor（R4 と同じ問題が別ファイルにある）

**修正方針**: R4 と同じ allowlist 方式の検証を `applyData` にも適用

---

### 🟢 R12: Service Worker の cross-origin キャッシュ

**該当箇所**: `sw.js` L4〜10, L52〜62

**現状**:
- `PRECACHE` に `https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js` を含める
- `fetch` ハンドラは `res.type === 'opaque'` を除外しているがそれ以外は無条件キャッシュ

**影響**:
- CSP/SRI で署名済み Chart.js 自体は安全だが、SW 経由の opaque キャッシュ汚染ベクトルとして将来的なリスク要素

**重要度**: 🟢 Minor（別フェーズで対応可）

---

## 3. 統計

- 検出: **Critical 1 / Important 6 / Minor 5**（合計 12 件）
- lifeplan 側で fix 済（共通インフラの恩恵）:
  - CSP / 各種ヘッダー（spending にも自動適用）
  - HTTPS 強制
  - SRI（Chart.js）
- spending 固有の主要課題:
  - **`escHtml` 不在**（lifeplan 側にはある）→ 直ちに移植要
  - **JSON 平文エクスポート**（lifeplan 側は AES-GCM「難読化」あり）
  - **CSV インポート起点の XSS 経路**（spending 固有）
  - **Premium バイパス**（spending 固有のマネタイズ機能）
  - **lifeplan 連携の双方向書き込み**（spending → lifeplan）

---

## 4. 優先度マトリクス

| ID | リスク | 重要度 | 修正規模 | 計算ロジック影響 | 推奨 |
|---|---|---|---|---|---|
| R3 | escHtml 不在 + 未エスケープ innerHTML | 🔴 Critical | 中（escHtml 追加 + 8〜10 箇所適用）| なし | **5e-b 必須** |
| R1 | エクスポート JSON 平文・無警告 | 🟡 Important | 極小（UI 警告追加）| なし | **5e-b** |
| R2 | noopener 漏れ 4 箇所 | 🟡 Important | 極小 | なし | **5e-b** |
| R4 | import 検証不足 | 🟡 Important | 小〜中 | なし | **5e-b** |
| R10 | 運営メアド露出 | 🟡 Important | 極小（URL 差し替え） | なし | **5e-b** |
| R8 | Premium バイパス | 🟡 Important | 大（アーキ変更）or 受容 | あり（プレミアム判定） | 受容 / 設計判断 |
| R9 | lifeplan 連携経由破壊 | 🟡 Important | 中（型検証追加）| なし | **5e-c** |
| R11 | load-data.html 検証浅 | 🟢 Minor | 極小 | なし | **5e-b** |
| R5 | CSP unsafe-inline | 🟢 Minor | 大（インライン除去） | なし | 受容 |
| R6 | localStorage 容量・ITP | 🟢 Minor | 中（IndexedDB 移行）| なし | 別フェーズ |
| R7 | PDF 漏洩 | 🟢 Minor | 該当なし | — | 該当なし |
| R12 | SW cross-origin キャッシュ | 🟢 Minor | 小 | なし | 別フェーズ |

---

## 5. 推奨 Phase 5e-b 対応プラン（Quick Win）

**所要時間**: 3〜4 時間
**影響**: 計算ロジック影響なし

1. **R3-A**: `spending/calc/utils.js` に `escHtml(s)` を追加（lifeplan 側と同じ実装）
   ```javascript
   export const escHtml = (s) => String(s ?? '')
     .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
     .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
   ```
2. **R3-B**: 上記の 8〜10 箇所に escHtml 適用 / textContent 化
   - 最優先: L4643（属性内 XSS）
   - 高優先: L2627（CSV description）, L2810/L4886/L4906（カスタムカテゴリ）, L4424（wizard examples）
3. **R2**: L744 / L746 / L2512 に `rel="noopener noreferrer"` 追加、L3885 を `window.open(url, '_blank', 'noopener')` に
4. **R1**: `exportSpendingData` 実行時の notification を「明細を含むファイルです。取扱に注意してください」に変更
5. **R4**:
   - サイズ上限 10MB 検査
   - `__proto__` / `constructor` / `prototype` キー除去（`_sanitizeImported` ヘルパ）
   - `_version === 'spending_v1'` 要求
   - allowlist 方式で `Object.assign` 置換
6. **R10**: `PREMIUM_WAITLIST_URL` を Google Form 等の URL に差し替え（必要なら別 issue で）
7. **R11**: `load-data.html` の `applyData` を R4 と同じ検証に揃える

**リグレッション**:
- `npm test`（spending 側スナップショット）
- 手動テスト: カスタムカテゴリ名に `<img onerror=alert(1)>` を入れて表示崩壊しないことを確認
- 手動テスト: ボーナス名に `" autofocus onfocus="alert(1)` を入れて XSS 不発を確認

---

## 6. Phase 5e-c 候補（深掘り）

1. **R3 の網羅的適用**: 残り 56 件の innerHTML を全レビューし、escape 漏れがないか確認するリグレッションテスト
2. **R9**: `syncToLifeplan` / `unsyncFromLifeplan` に型検証 layer を追加（`Number.isFinite`, plain object 検査）
3. **R8 の運用判断**: Premium バイパス可能であることを前提に、UI 上「お試し有料化」「正規購入」表示分けで誠実性を担保

---

## 7. 残課題 / 別フェーズ

- **R5**（CSP unsafe-inline 除去）: 大規模リファクタ。ROI 低い
- **R6**（IndexedDB 移行）: 容量・ITP 対策。lifeplan 側と共通の課題
- **R12**（SW cross-origin キャッシュ）: 影響範囲限定的

---

## 8. ヘルススコア

| 状態 | スコア | 根拠 |
|---|---|---|
| 現状（spending） | **C+** | 共通インフラは A-（CSP/SRI/HTTPS）だが spending 固有で escape ヘルパ不在＋平文エクスポート＋検証不足が複合 |
| 5e-b 完了後 | **B** | XSS 経路封鎖・noopener・import 検証・正直化 |
| 5e-c 完了後 | **B+** | 連携経路の型検証 |
| 5e-c+ 完了後 | **A-** | （Premium 設計判断 / IndexedDB / CSP 強化のいずれか）|

---

## 9. 監査の所感

### 良い点
- 共通インフラ（CSP、SRI、HTTPS、各種ヘッダー）は spending にも自動適用されており、lifeplan 側 5a/5b/5c の成果が効いている
- ES Module 化（Phase SP-1）により計算ロジックが分離されて static analysis しやすい
- `JSON.parse` 周りの try/catch が適切に配置されている
- `JSON.stringify(lpAtOpen) !== JSON.stringify(lpNow)` による楽観的ロックの実装あり
- CSV パーサーが `MF_SKIP_KEYS` で振替・二重計上を skip する設計

### 改善余地
- **`escHtml` 不在は構造的問題** — lifeplan 側で既に解決済の知見が spending に移植されていない（Phase SP-1 の module 化時に utils.js へ追加すべきだった）
- 平文 JSON エクスポートと「機密扱い」表示の不在
- Premium 判定が完全にクライアント完結 — マネタイズ戦略上、運営として「バイパス可能」を許容するか要決定
- ライフプラン連携の双方向データフロー（特に `_spendingCatId` などのマーカープロパティ）に契約検証なし
