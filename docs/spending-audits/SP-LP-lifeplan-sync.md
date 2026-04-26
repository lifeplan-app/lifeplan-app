# SP-LP 監査レポート: ライフプラン連携（Lifeplan Sync）

**監査日**: 2026-04-26  
**フェーズ**: SP-2（3 領域監査）  
**対象領域**: ライフプラン連携  
**監査者**: Agent (Claude Sonnet 4.6)

---

## サマリー

| ID | 観点 | 重大度 | 判定 |
|---|---|---|---|
| SP-LP-01 | `syncToLifeplan` 書き込み先の妥当性 | Important | 一部乖離あり |
| SP-LP-02 | 円→万円変換の累積誤差 | Minor | 設計は適切、軽微な二重丸めあり |
| SP-LP-03 | lifeplan_v1 既存データ保護 | **Critical** | 複数の問題あり |
| SP-LP-04 | `irregularSuggestions[]` 承認フローと反映タイミング | Important | 設計上の欠陥あり |
| SP-LP-05 | `linkedToLifeplan` フラグの状態遷移整合性 | Important | 一方向のみ、解除フローなし |

**集計**: Critical 1件 / Important 3件 / Minor 1件 / ✅ 0件

---

## SP-LP-01: `syncToLifeplan` 書き込み先の妥当性

### 現状コード

**`spending/calc/sync.js` L1–38** — `calcSyncValues()` は純粋関数として月次合計を集計する。戻り値:

```
{
  monthlyFixedRaw,  // 住宅・家族除外前の月次固定費平均（円）
  monthlyFixed,     // 住宅・家族除外後の月次固定費平均（円）
  monthlyVariable,  // 月次変動費平均（円）
  monthlyTotal,     // monthlyFixed + monthlyVariable（円）
  irregularFixed,   // 不定期固定費の月平均（円） ← 使われない
  irregularVariable,// 不定期変動費の月平均（円） ← 使われない
  housingAvg,
  familyAvg,
  basedOnMonths,
}
```

**`spending/index.html` L3621** — 実際の書き込み:

```javascript
lp.finance.expense = manYen;             // ← finance.expense に月次のみ
// (略)
lp.recurringExpenses[existingIdx] = entry; // ← recurringExpenses にユーザー承認済み不定期費用
```

**CLAUDE.md マッピング表**（連携マッピングセクション）:

| spending_v1 | → | lifeplan_v1 | 変換 |
|---|---|---|---|
| `domainTotals.monthly_fixed + monthly_variable` の月平均 | → | `finance.expense` | ÷10000 |
| `irregular_fixed` エントリ（年払い保険・車検等） | → | `recurringExpenses[]` | ÷10000、ユーザー承認後 |
| `irregular_variable` 大額エントリ | → | `expenses[]` | ÷10000、ユーザー承認後 |

### 検出ズレ

**[Important] `expenses[]` への書き込みが未実装**

CLAUDE.md スキーマは `irregular_variable` の大額エントリを `lifeplan_v1.expenses[]`（一時支出リスト）に書き込むと定義している。しかし `doSyncToLifeplan()` は `irregular_variable` カテゴリも `irregular_fixed` と同じく `recurringExpenses[]` に書き込む（L3631）。

```javascript
// index.html L3630–3631
const irCats = state.categories.filter(c =>
  c.domain === 'irregular_fixed' || c.domain === 'irregular_variable'
);
```

`irregular_variable`（特別費：旅行・冠婚葬祭等）を「繰り返し支出」として `recurringExpenses[]` に入れると、ライフプランシミュレーションで **毎年発生するキャッシュアウト** として計算されてしまう。一時支出は `expenses[]` に入れるべき。

**[Minor] `calcSyncValues()` の `irregularFixed` / `irregularVariable` 戻り値が未使用**

`calcSyncValues()` は `irregularFixed` と `irregularVariable` を計算して返す（L12–13）が、呼び出し元（`renderSync()` L3316, `syncToLifeplan()` L3561）でこれらの値を利用しない。不定期費用の連携金額は `doSyncToLifeplan()` 内で `calcIrregularAmounts()` を再計算している。計算の重複があり、将来的な乖離リスクがある。

---

## SP-LP-02: 円→万円変換の累積誤差

### 現状コード

**`spending/calc/utils.js` L8–10**:

```javascript
export function toManYen(yen) {
  return Math.round(yen / 10000 * 10) / 10;  // 小数1桁・四捨五入
}
```

**`spending/calc/sync.js` L31**:

```javascript
monthlyTotal: monthlyFixed + monthlyVariable,  // 合算してから返す（円）
```

**`spending/index.html` L3576**:

```javascript
const manYen = toManYen(vals.monthlyTotal);  // 合算後に1回だけ万円変換
```

### 検証

変換は **正しい設計** である。CLAUDE.md の「連携時の変換式」に示す通り、

```javascript
// 期待動作
const avgMonthlyExpense = (mfSum + mvSum) / n;      // 円で平均
state.finance.expense = toManYen(avgMonthlyExpense); // 変換は1回
```

実装は `monthlyFixed + monthlyVariable` を円のまま合算し、最後に `toManYen()` を1回だけ適用している。カテゴリ別に先に万円変換してから合算する「分割変換」ではないため、**積み上げ誤差は最小**。

**[Minor] 不定期費用の annualManYen に二重丸めが発生**

`doSyncToLifeplan()` L3644:

```javascript
const annualManYen = Math.round(toManYen(catTotal / nYears) * scale * 10) / 10;
```

`toManYen()` 内部で既に `Math.round(... * 10) / 10` しているため、外側の `Math.round(... * 10) / 10` は二重丸めとなる。`scale` が整数でない場合、例えば

- `toManYen(50000 / 1)` = `5.0`
- `5.0 * 1.05` = `5.25` → 外側の丸めで `5.3`（これ自体は1操作で計算可能）

金額差は最大 ±0.05 万円（500円）。ライフプランのシミュレーション精度では実害は小さいが、`toManYen` の責務が呼び出し元でも繰り返されており、将来の改修で混乱する可能性がある。

**結論**: SP-LP-02 の主要懸念（複数月平均で四捨五入が積み重なる）は発生していない。ただし不定期費用連携時に Minor な二重丸めあり。

---

## SP-LP-03: lifeplan_v1 既存データ保護

### 現状コード

**`spending/index.html` L3564–3606** (`syncToLifeplan`):

```javascript
let lp;
try {
  const saved = localStorage.getItem('lifeplan_v1');
  lp = saved ? JSON.parse(saved) : null;
} catch(e) { lp = null; }
// ... 確認モーダル組み立て ...
_pendingSyncParams = { vals, lp, manYen, excludeHousing, excludeFamily };
```

**L3614–3668** (`doSyncToLifeplan`):

```javascript
const { vals, lp, manYen, ... } = params;  // ← syncToLifeplan() 時点の lp スナップショット
if (!lp.finance) lp.finance = {};
lp.finance.expense = manYen;               // ← 上書き（マージなし）
// ...
localStorage.setItem('lifeplan_v1', JSON.stringify(lp));
```

### 検出ズレ

**[Critical] lifeplan_v1 の読み取りと書き込みの間に stale data race がある**

`lp` オブジェクトは `syncToLifeplan()` 呼び出し時点（モーダルを開いた時刻）に `localStorage` からパースされ、`_pendingSyncParams` に格納される。その後ユーザーがモーダルを確認している間（数秒〜数分）、別のタブやウィンドウでライフプランアプリを操作し `lifeplan_v1` を更新した場合、古い `lp` スナップショットを `doSyncToLifeplan()` で上書きし、**ユーザーのライフプラン変更が消滅**する。

例:
1. 支出管理アプリで「連携する」ボタン押下 → `lp` を読み込む（`finance.income = 35`）
2. 別タブでライフプランを開き、収入を `40` に変更して保存 → `lifeplan_v1.finance.income = 40`
3. 確認モーダルで「✅ 連携する」 → 古い `lp`（`income=35`）を `localStorage.setItem` で書き込む
4. 結果: `finance.income` が `35` に巻き戻る

**修正方針**: `doSyncToLifeplan()` 冒頭で `localStorage.getItem('lifeplan_v1')` を再取得し、パースし直してから変更を適用する。

**[Critical] `lp.finance.expense` を無条件に上書きする（非可逆）**

`lp.finance.expense = manYen` は現在値の確認なしに上書きする（L3621）。確認モーダルには現在値と新規値のプレビューが表示されるが、いったん「連携する」を押すと連携前の値に戻す手段がない。

- 連携前のバックアップ（`lp._spendingExpense` が 1 点書き込まれるが L3665、これは **連携後の値** を記録するもので「連携前の値」ではない）
- 連携解除フローが存在しない（後述 SP-LP-05）

**修正方針**: `lp._preSpendingExpense = currentExpense` として連携前の値を保存し、「連携を解除する」フロー（SP-LP-05）で復元できるようにする。

**[Important] lifeplan_v1 が存在しない時の動作が通知のみ**

`syncToLifeplan()` L3570–3574:

```javascript
if (!lp) {
  showNotification('ライフプランアプリのデータが見つかりません。先にライフプランアプリを開いてください。');
  updateLifeplanConnCard(vals.monthlyTotal);
  return;
}
```

ライフプランアプリ未利用ユーザーへの案内は通知メッセージのみ。`updateLifeplanConnCard()` L3237–3247 では `conn-disconnected` カードに「ライフプランアプリを一度開いてデータを作成してください」と表示し、同期ボタンを `disabled` にするため、**繰り返し連携を試みることはできない**（適切な防御）。ただし通知は数秒で消えるため、初回ユーザーには説明が不十分な可能性がある。

**[Minor] `recurringExpenses` の既存ユーザー手動エントリに対する保護**

連携済みの項目は `_spendingCatId` で識別されるため（L3646）、支出管理アプリ由来のエントリのみ更新・追加される（L3658–3659）。ユーザーがライフプランアプリで手動登録した `recurringExpenses` エントリ（`_spendingCatId` なし）は変更されない。この点の設計は適切。

**[Minor] `localStorage.setItem` が try/catch で保護されていない**

L3668:

```javascript
localStorage.setItem('lifeplan_v1', JSON.stringify(lp));
```

`localStorage` が容量超過（`QuotaExceededError`）でこの書き込みが失敗した場合、`state.lifeplanSync` は更新済み（L3670–3677）だが `lifeplan_v1` は更新されない。次回ロード時に `state.settings.linkedToLifeplan === true` でありながら `lifeplan_v1.finance.expense` が古い値のまま、という非整合が残る。

---

## SP-LP-04: `irregularSuggestions[]` のユーザー承認フローと反映タイミング

### 現状コード

**承認フロー** (`spending/index.html` L3524–3553):

1. `renderIrregularList()` が不定期費用カテゴリをチェックボックス形式でレンダリング
2. ユーザーがチェック → `toggleIrregularApproval(catId, checked)` 呼び出し
3. `state.lifeplanSync.irregularSuggestions` に `{ categoryId, name, amount: 0, intervalYears: 1, approved: true/false }` を追加・更新
4. `saveState()` で `spending_v1` に保存

**反映タイミング** (`doSyncToLifeplan()` L3624):

```javascript
const approved = (state.lifeplanSync.irregularSuggestions || []).filter(s => s.approved);
```

### 検出ズレ

**[Important] `irregularSuggestions[].amount` が常に `0` のまま保存される**

`toggleIrregularApproval()` L3548:

```javascript
sug = { categoryId: catId, name: cat?.name || catId, amount: 0, intervalYears: 1, approved: false };
```

`amount: 0` で初期化される。承認時に `amount` を計算して格納する処理がない。

実際の連携金額は `doSyncToLifeplan()` 内で `catTotal / nYears` から動的に計算される（L3640–3644）ため、最終的な書き込み値は正しい。しかし `spending_v1` に保存される `state.lifeplanSync.irregularSuggestions[].amount` は常に `0` であり、スキーマ（CLAUDE.md）の定義

```
amount: number,  // 万円（年額）
```

と乖離している。この `amount` フィールドを後続コードが読み取った場合（例: 連携プレビューの再表示）、`0` が返る。

**[Important] 承認フラグが連携期間（`irregularAvgYears`）と紐付いていない**

ユーザーが「直近1年」で承認したカテゴリは `approved: true` と記録される。その後「全期間」に切り替えた場合でも同じ `approved: true` が維持され、自動的に連携対象になる。期間変更時に承認状態をリセットするロジックがないため、**ユーザーが意図しない期間のデータで連携される可能性**がある。

例:
- 「直近1年」で `annual`（年間固定費）を承認 → `approved: true`
- 集計期間を「全期間」に変更（金額が変わる場合あり）
- 連携ボタンを押す → `approved: true` のまま全期間の金額で連携

確認モーダル（L3597–3600）に「不定期費用 N件も一緒に連携します」とは表示されるが、どの期間の金額かを明示しない。

**[Minor] 連携確認モーダルの表示（L3597）と実際の連携ロジック（L3624）で `approved` の取得タイミングが異なる**

```javascript
// syncToLifeplan() L3597 — モーダル表示時
const approved = (state.lifeplanSync.irregularSuggestions || []).filter(s => s.approved);

// doSyncToLifeplan() L3624 — 実際の連携時
const approved = (state.lifeplanSync.irregularSuggestions || []).filter(s => s.approved);
```

モーダルを開いた後に別タブでチェックボックスを操作する（実際にはシングルページ操作なので非現実的だが）可能性を除けば実害はない。ただし `lp` の stale 問題（SP-LP-03）と構造的に同じパターン。

---

## SP-LP-05: `linkedToLifeplan` フラグの状態遷移整合性

### 現状コード

**初期化** (`spending/index.html` L1667):

```javascript
settings: {
  ...
  linkedToLifeplan: false,
}
```

**`true` に設定** (L3677):

```javascript
state.settings.linkedToLifeplan = true;
```

**`false` に戻す箇所**:

```bash
$ grep -n "linkedToLifeplan\s*=\s*false" spending/index.html
(結果なし)
```

`linkedToLifeplan` が `false` に戻る処理は存在しない。

### 検出ズレ

**[Important] 連携解除フローが存在しない**

一度連携すると `state.settings.linkedToLifeplan` は永続的に `true` のままとなる。ユーザーが「連携を解除したい」場合の手順がアプリ内に存在しない。

影響:
1. **ライフプラン側の `finance.expense` が連携前の値に戻らない**。連携後の値がそのまま残る。ユーザーが手動で元の値を覚えていなければ復元不能。
2. **UI 上の「連携済み」表示が解除できない**。`syncBtn.classList.remove('pulse')` は `syncedAt2` の有無で制御されるが（L3302–3305）、`syncedAt` もリセットされない。

**[Important] `linkedToLifeplan` と `lifeplanSync.syncedAt` の二重管理**

連携状態を表すフラグが 2 つ存在する:
- `state.settings.linkedToLifeplan` — boolean
- `state.lifeplanSync.syncedAt` — ISO timestamp (null = 未連携)

`updateLifeplanConnCard()` は `syncedAt` を参照（L3257, L3296）、連携ボタンのパルスは `syncedAt2`（= `syncedAt`）で制御（L3296–3305）。`linkedToLifeplan` フラグ単体を参照している箇所は L3677 の代入のみで、実際の UI 制御には使われていない。

- **`linkedToLifeplan` は実質的に使われていない冗長なフラグ**である
- 将来のコード変更で `linkedToLifeplan` を参照する機能が追加されると、`syncedAt` との乖離が問題化する

**[Minor] `syncedAt` は現在時刻（UTC）で保存されるが、UI 表示はローカル時刻**

`syncedAt` は `new Date().toISOString()`（UTC）で保存（L3663）。表示時は `new Date(syncedAt)` でローカル時刻に変換（L3372）。JST 環境では問題なく動作するが、タイムゾーン依存があることを注記。

---

## データフロー全体図

```
[CSV エントリ]
    ↓ parseMFCSV / parseZaimCSV
[spending_v1.months['YYYY-MM'].categoryTotals]
    ↓ calcSyncValues()
[monthlyTotal (円)] = monthlyFixed + monthlyVariable (各月平均)
    ↓ toManYen()
[manYen (万円)]
    ↓ doSyncToLifeplan() — 確認モーダル経由
[lifeplan_v1.finance.expense = manYen]  ← 上書き（非マージ）

[spending_v1.months['YYYY-MM'].categoryTotals[irregular_*]]
    ↓ calcIrregularAmounts()
[catAmounts[catId] / nYears (円/年)]
    ↓ toManYen() + scale係数 + Math.round(...*10)/10 (二重丸め)
[annualManYen (万円)]
    ↓ ユーザー承認済みのみ
[lifeplan_v1.recurringExpenses[] upsert]  ← _spendingCatId でキー一致判定
```

---

## 重大度別まとめ

### Critical（即時対応推奨）

1. **SP-LP-03**: `doSyncToLifeplan()` が `syncToLifeplan()` 時点の stale な `lp` スナップショットを書き込む。`doSyncToLifeplan()` 冒頭で `localStorage` を再取得すべき。

2. **SP-LP-03**: 連携前の `finance.expense` 値が保存されず、連携解除時に復元不能。`lp._preSpendingExpense = currentExpense` を書き込み、解除フローで参照する設計が必要。

### Important（本セッション内対応推奨）

3. **SP-LP-01**: `irregular_variable` カテゴリが `recurringExpenses[]` に書き込まれている。CLAUDE.md スキーマでは `expenses[]`（一時支出）への書き込みが期待される。

4. **SP-LP-04**: `irregularSuggestions[].amount` が常に `0` のまま保存される（スキーマ定義との乖離）。

5. **SP-LP-04**: 集計期間変更時に承認フラグがリセットされない。

6. **SP-LP-05**: 連携解除フローがなく、`linkedToLifeplan` が `false` に戻る経路が存在しない。

7. **SP-LP-05**: `linkedToLifeplan` フラグが UI 制御に使われておらず、`syncedAt` と二重管理になっている。

### Minor（選別対応）

8. **SP-LP-02**: 不定期費用の `annualManYen` 計算に二重丸め。実害は ±500 円以内。

9. **SP-LP-03**: `localStorage.setItem('lifeplan_v1', ...)` が try/catch で保護されていない。

10. **SP-LP-05**: `syncedAt` は UTC 保存・ローカル表示でタイムゾーン依存。

---

## ファイル・行番号リファレンス

| 問題 | ファイル | 行番号 |
|---|---|---|
| `calcSyncValues` 戻り値 | `spending/calc/sync.js` | L27–37 |
| `toManYen` 実装 | `spending/calc/utils.js` | L8–10 |
| `syncToLifeplan` 関数 | `spending/index.html` | L3558–3607 |
| `doSyncToLifeplan` 関数 | `spending/index.html` | L3614–3696 |
| `lp` stale 読み取り | `spending/index.html` | L3564–3568 |
| `lp.finance.expense` 上書き | `spending/index.html` | L3620–3621 |
| `irregular_variable` → `recurringExpenses` 誤書き込み | `spending/index.html` | L3630–3631, L3658–3659 |
| 二重丸め | `spending/index.html` | L3644 |
| `toggleIrregularApproval` (`amount: 0`) | `spending/index.html` | L3543–3553 |
| `linkedToLifeplan = true` のみ | `spending/index.html` | L3677 |
| `localStorage.setItem` try/catch なし | `spending/index.html` | L3668 |

---

## 方法論上の注記

- `doSyncToLifeplan()` の stale-lp 問題は、単一タブ操作では再現しにくい（シングルページアプリ）。しかしスマートフォンでのタブ切り替え（バックグラウンドでライフプランを保存 → フォアグラウンドに戻って連携確認）では再現可能。
- `expenses[]` への書き込み未実装は CLAUDE.md スキーマとの明示的な乖離であるため、仕様変更なのか実装漏れなのかを確認が必要。現状コードが実用上の「設計変更」であれば CLAUDE.md の更新が必要。
- `localStorage.setItem` の QuotaExceededError は、支出管理データが大規模になった場合（数千エントリ × 複数月）に発生する可能性がある。

---

*レポート作成: 2026-04-26 / Phase SP-2*
