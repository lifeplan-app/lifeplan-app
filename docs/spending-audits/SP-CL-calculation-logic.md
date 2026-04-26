# SP-CL: 計算ロジック領域監査

**実施日**: 2026-04-26
**前提**: Phase SP-1 完了（spending/calc/*.js 5モジュール、284 ユニットテストグリーン）
**監査者**: Claude (Phase SP-2)
**対象ファイル**:
- `spending/calc/utils.js`
- `spending/calc/aggregate.js`
- `spending/calc/sync.js`
- `spending/calc/suggest.js`
- `spending/index.html`（月次ナビゲーション・年次集計・予算ロジック・不定期費用・提案トリガー・importedEntryIds 管理）

---

## サマリー

| 重要度 | 件数 |
|---|---|
| 🔴 Critical | 1 |
| 🟡 Important | 3 |
| 🟢 Minor | 2 |
| ✅ 検証済（問題なし） | 2 |
| **計** | 8 |

---

## 監査項目

### SP-CL-01: toManYen 丸め誤差

**該当コード**: `spending/calc/utils.js:8-10`

```javascript
export function toManYen(yen) {
  return Math.round(yen / 10000 * 10) / 10;
}
```

（`spending/schema.js:150` にも同一実装が重複存在）

```javascript
export const toManYen = (yen) => Math.round(yen / 10000 * 10) / 10;
```

**期待挙動**:
- 円を「万円・小数1桁」に変換する。ユーザー向け表示と lifeplan_v1 書き込み（`finance.expense`）に使われる。
- `CLAUDE.md` にも `Math.round(yen / 10000 * 10) / 10` として明記されている。
- 特殊値（`NaN`, `Infinity`, `null`, `undefined`）を渡した場合に `NaN` や `Infinity` が lifeplan に書き込まれないことが望ましい。

**検出**:

1. **実装は仕様通り**（half-up 四捨五入、1/10 万円精度）。JS `Math.round` は負の値では −0.5 が下方向（例: `Math.round(-0.5) === 0`）だが、支出金額が正値前提なので実用上影響なし。

2. **特殊値ガードなし**: `toManYen(NaN)` → `NaN`、`toManYen(null)` → `NaN`、`toManYen(undefined)` → `NaN` がそのまま返る。呼び出し元（`spending/index.html:3270`, `3576`, `3636` 等）は数値前提で呼んでいるが、入力が未設定・空の場合は NaN が lifeplan に書き込まれるリスクがある。

3. **`schema.js` と `calc/utils.js` に同一関数が重複定義**されており、将来の定義不一致を招く可能性がある。

**重要度**: 🟢 Minor

**修正方針**:
- `toManYen` に `if (!isFinite(yen) || yen == null) return 0;` ガードを追加（または呼び出し元でバリデーション）。
- `schema.js:150` の重複定義を `calc/utils.js` からの再 export に統一。

---

### SP-CL-02: 月次集計の境界（タイムゾーン）

**該当コード**: `spending/calc/utils.js:16-27`（`parseDate`）および `spending/index.html:1806-1814`（`getCurrentMonthKey`, `changeMonth`）

```javascript
export function parseDate(str) {
  if (!str) return null;
  const m = str.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  ...
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}
```

```javascript
function getCurrentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function changeMonth(delta) {
  const [y, m] = currentMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  renderDashboard();
}
```

**期待挙動**:
- 月次集計は「YYYY-MM」キーで管理され、エントリの `date` フィールド（`YYYY-MM-DD` 文字列）の先頭7文字で月を判定する（`spending/index.html:2838`）。文字列スライスのため `Date` オブジェクトのタイムゾーン変換を経由しない。
- `getCurrentMonthKey` はローカル時刻を使い `new Date().getFullYear()` / `getMonth()` を呼ぶ。JST ではローカル == 想定ユーザー時刻なので実害なし。
- `changeMonth` は `new Date(y, m-1+delta, 1)` でローカル月演算するため月末境界バグなし（Date の繰り越し処理は正常）。

**検出**:
- CSV エントリの月キー割当て（`e.date.slice(0, 7)`、`spending/index.html:2838`）は文字列操作のみで Date 変換を行わないため、タイムゾーン影響を受けない。
- `parseDate` はCSV文字列の `YYYY/MM/DD` or `YYYY-MM-DD` を正規表現でパースし、Date オブジェクトを一切生成しないため UTCシフト問題なし。
- 閏月（2月末、12月→1月繰り越し）は `new Date(y, m-1+delta, 1)` の自動繰り越しで正しく処理される。

**重要度**: ✅ 検証済（問題なし）

---

### SP-CL-03: 不定期支出の年換算

**該当コード**: `spending/index.html:3400-3410`（`calcIrregularAmounts`）、`spending/index.html:3387-3397`（`getIrregularKeys`）

```javascript
function calcIrregularAmounts(keys, irCats) {
  const catAmounts = {};
  for (const k of keys) {
    const d = state.months[k];
    for (const cat of irCats) {
      catAmounts[cat.id] = (catAmounts[cat.id] || 0) + (d.categoryTotals?.[cat.id] || 0);
    }
  }
  const nYears = keys.length / 12 || (1 / 12);
  return { catAmounts, nYears: Math.max(nYears, 1 / 12) };
}
```

`doSyncToLifeplan` での使用:
```javascript
const nYears  = Math.max(irrKeys.length / 12, 1 / 12);   // index.html:3629
const annualManYen = Math.round(toManYen(catTotal / nYears) * scale * 10) / 10;  // :3644
```

**期待挙動**:
- 不定期支出は「記録期間の実績合計 ÷ 実データ月数（ヶ月を年換算）」で年額を算出し、ライフプランの `recurringExpenses.amount`（万円/年）に設定する。
- CLAUDE.md のスキーマでは `recurringExpenses[].intervalYears`（何年ごとに発生）が設定可能だが、ここでは `intervalYears: 1`（毎年）に固定している。

**検出（2件）**:

1. **`intervalYears` は常に 1 固定**（`spending/index.html:3653`）: ライフプランスキーマの `recurringExpenses.intervalYears` は「何年ごとに発生」を表す。車検（2年ごと）や固定資産税（年1回）などを一律 `intervalYears: 1` として連携すると、ライフプラン側の計算が「実際の支払頻度 × 当該金額」を毎年計上してしまい、**多年ごとの費用を過大に計上する**可能性がある。
   - ただし、現状の `amount` フィールドは年平均額（実績合計 ÷ 記録年数）で算出しているため、`intervalYears: 1` との組み合わせで「毎年その平均額が発生」という扱いになり、トータルで見ると収束する場合もある。ライフプラン側の `recurringExpenses` の解釈（`amount × 1/intervalYears` か `amount そのまま`）に依存する。

2. **`nYears` の計算精度問題**: `keys.length / 12` はヶ月数を12で割って年換算しているが、データが例えば7ヶ月しかない場合 `nYears ≈ 0.583` となり、その期間内に「年1回の不定期費用」が1回だけ含まれていれば年額が `実績額 / 0.583 ≈ 実績額 × 1.71` と過大評価される。逆に2回含まれれば过小評価。occurrence-based（実際の発生回数で割る）とヶ月割り（単純な月数按分）で最大 ±100% 以上の乖離が起き得る。

**重要度**: 🟡 Important（`intervalYears` 固定 + occurrence vs 月割り乖離が組み合わさると lifeplan の長期シミュレーション誤差に直結）

**修正方針**:
- `intervalYears` は UI で選択できるか、カテゴリ定義に持たせるか、あるいはライフプラン連携確認モーダルでユーザーが指定できるようにする。
- `nYears` は「実データ期間内に何回発生したか」ではなく月数按分であることを UI 上でも明示する注記を追加するか、occurrence-based への変更を検討する。

---

### SP-CL-04: 重複エントリ検知（importedEntryIds の整合性）

**該当コード**: `spending/index.html:2892-2944`（`confirmImport`）、`spending/index.html:3124-3146`（手動入力保存）

重複チェックの核心:
```javascript
const existingIds = new Set(existing.importedEntryIds || []);
const newEntries = entries.filter(e => !existingIds.has(e.id));
skipped += entries.length - newEntries.length;
imported += newEntries.length;

const allEntries = [...(existing.entries || []), ...newEntries];
const agg = aggregateEntries(allEntries, state.categories);

existing.entries = allEntries;
existing.importedEntryIds = [...existingIds, ...newEntries.map(e => e.id)];
Object.assign(existing, agg);
```

上書き（overwrite）時:
```javascript
state.months[mk] = {
  income: 0, categoryTotals: {}, domainTotals: {},
  totalExpense: 0, entries: [], importedEntryIds: [],
  importedAt: new Date().toISOString(), isManual: false,
};
// → 直後に existingIds = new Set([]) で全エントリをnewEntriesとして処理
```

手動入力時（`spending/index.html:3146`）:
```javascript
existing.importedEntryIds = [...(existing.importedEntryIds || []), entry.id];
```

**期待挙動**:
- 再インポート時に既存IDとの差分のみ追加し、重複をスキップする。
- `importedEntryIds` は生エントリ（`entries`）がプルーニングされた後も全期間保持され、再インポート防止に機能し続ける。

**検出**:

1. **上書き後の重複チェックが無効になる**（🔴 Critical 候補）: 上書きモードでは `importedEntryIds: []` にリセットした直後に通常の差分チェックに進む（`existingIds` が空集合）。したがってインポート済み全エントリが `newEntries` として扱われ、同一CSVを「上書き」で再インポートするとスキップカウントが0になり正常に動作する。これは意図通り（上書きは既存データを完全置換）であるため **バグではなく仕様**。UI には「既存データを削除して再インポート」と明示されている（`spending/index.html:2861`）。

2. **手動入力エントリを `importedEntryIds` に登録している**（`spending/index.html:3146`）: 手動入力の ID は `'manual_' + Date.now()` 形式（`:3133`）で、CSVのID（Money Forwardの場合は一意IDが付与される）と名前空間が異なる。`importedEntryIds` がCSV重複防止専用として設計されているなら、手動入力を混入させると配列が肥大化する。ただし重複防止の論理的整合性は壊れていない（手動エントリはCSV再インポートで重複しない）。

3. **`entries` が `null`（プルーニング済み）の古い月に再インポートした場合**: プルーニング後は `entries === null` だが、`importedEntryIds` は保持されているため差分チェックは正常に機能する。`allEntries = [...(existing.entries || []), ...newEntries]` で `entries || []` が `null` を正しく空配列にフォールバックしているため問題なし。ただし、プルーニング済み月に手動エントリを追加した場合は `entries` が `null` から `[entry]` に戻る（スキーマ的には entries が null → 再び保持される）。設計上の考慮不足の可能性あり。

**重要度**: 🟢 Minor（仕様通りの動作が多く、手動エントリの importedEntryIds 登録は軽微な設計上の疑問点）

**修正方針**:
- 手動エントリを `importedEntryIds` に追加する必要がない場合は削除し、配列の責務を「CSVインポート重複防止」に特化させる。
- プルーニング済み月への手動追加は `isManual: true` フラグで区別するドキュメントコメントを追加。

---

### SP-CL-05: 改善提案閾値の根拠と現状値

**該当コード**: `spending/index.html:1466-1618`（`SUGGESTION_TRIGGERS`）

主要トリガー:
```javascript
// 通信費: 月 8,000円超
check: (d) => (d.categoryTotals?.telecom || 0) > 8000,

// 保険料: 収入の 15%超（単月チェック）
check: (d) => d.income > 0 && (d.categoryTotals?.insurance || 0) / d.income > 0.15,
// 平均チェック（3ヶ月）
avgCheck: (avg) => {
  const income = state.income?.monthly || 0;
  return income > 0 && (avg.cats.insurance || 0) / income > 0.15;
},

// サブスク: 月 5,000円超
check: (d) => (d.categoryTotals?.subscr || 0) > 5000,

// 固定費率: 月収の 60%超
check: (d) => { const income = state.income?.monthly || 0; return income > 0 && (d.domainTotals?.monthly_fixed || 0) / income > 0.6; },

// 食費: 月収の 25%超
check: (d) => { const income = state.income?.monthly || 0; return income > 0 && (d.categoryTotals?.food || 0) / income > 0.25; },
```

**期待挙動**:
- CLAUDE.md の「マネタイズ方針」に「通信費 > 8,000円/月 → 格安SIM提案」「保険料 > 収入の 15% → 保険見直し提案」と明記されており、仕様は文書化されている。
- FP実務基準では保険料の目安は月収の5〜10%（生保文化センター等の一般目安）。15% はやや高め。

**検出（2件）**:

1. **`insurance_ratio` の `check` vs `avgCheck` で収入の参照先が異なる**（🟡 Important）:
   - 単月チェック（`check`）: `d.income`（CSV記録収入、月によって0の場合あり）
   - 3ヶ月平均チェック（`avgCheck`）: `state.income?.monthly`（設定値）
   
   同一トリガーで参照する収入が「記録収入」と「設定値」で非一致。記録収入がある月では `d.income` で判定、3ヶ月平均では `state.income.monthly` で判定するため、**記録収入が設定値と大きく異なる場合に提案発火条件が不一致**になる。例えば「1月は収入記録あり（高め）、2月3月は未記録（`income: 0`）」の場合、単月チェックは1月のみ有効でその他は `income === 0` で発火せず、avgCheck は設定月収で常時判定される。

2. **`deficit` トリガーが `check` のみで `avgCheck` なし**（🟢 Minor、設計上の一貫性欠如）: 赤字検知（`d.income > 0 && d.totalExpense > d.income`）は `avgCheck` を持たず単月のみ。3ヶ月平均での継続赤字検知ができないが、設計方針として単月警告は妥当とも言える。

3. **閾値の根拠は CLAUDE.md に記載あり**（`通信費 8,000円`、`保険料 15%`）。FP的には15%は高め（標準は5〜10%）だが、より早期に気づかせるための意図的な設定と解釈できる。アフィリエイト連携のビジネス判断として許容範囲。

**重要度**: 🟡 Important（`insurance_ratio` の収入参照不一致）

**修正方針**:
- `insurance_ratio` の `check` と `avgCheck` で収入の参照先を統一する。
  - 案A: `avgCheck` も `d.income`ベースに統一（直近3ヶ月の月次 `income` 平均を算出して判定）。
  - 案B: `check` も `state.income?.monthly`（設定値）を優先参照する。
  - 推奨: 案A（実績データ優先）か、実績が0の場合に設定値フォールバックする形。

---

### SP-CL-06: `calcSavingsImpact` の積立期間・運用率

**該当コード**: `spending/calc/suggest.js:31-51`

```javascript
export function calcSavingsImpact(monthlySavings, lifeplan = null) {
  let years = 30;
  let rate = 0.03;
  if (lifeplan) {
    if (lifeplan.profile?.birth) {
      const age = new Date().getFullYear() - parseInt(lifeplan.profile.birth.split('-')[0]);
      years = Math.max(5, 75 - age);
    }
    if (lifeplan.assets?.length) {
      const totalBal = lifeplan.assets.reduce((s, a) => s + (a.amount || 0), 0);
      if (totalBal > 0) {
        const wr = lifeplan.assets.reduce((s, a) => s + (a.return || 0) * (a.amount || 0), 0) / totalBal;
        if (wr > 0 && wr < 20) rate = wr / 100;
      }
    }
  }
  const r12 = rate / 12;
  const n = years * 12;
  const fv = monthlySavings * ((Math.pow(1 + r12, n) - 1) / r12);
  return { amount: Math.round(fv / 10000), years, rate: Math.round(rate * 1000) / 10 };
}
```

**期待挙動**:
- 節約額を運用に回した場合の将来価値を複利計算で提示する。
- ライフプランデータがある場合、ユーザーの年齢から積立期間、資産の加重平均利回りから運用率を決定する。
- ライフプランの `assets[].return` は `%` 単位（例: `5` = 5%）で保存されており、`wr / 100` で比率に変換している（CLAUDE.md スキーマより）。

**検出（2件）**:

1. **年齢計算が誕生日を考慮しない**（🟢 Minor）: `new Date().getFullYear() - parseInt(birth.split('-')[0])` は生年のみで月日を無視する。誕生月前に計算すると年齢が1歳低く計算され、`years = 75 - age` が1大きくなる。影響は積立期間±1年（FV差は〜3%程度）。

2. **積立期間の上限 `75歳` は lifeplan 側の設定と非連携**（🟡 Important）: ライフプランアプリには `finance.simYears`（シミュレーション年数）や `retirement` オブジェクトがあるが、`calcSavingsImpact` はそれらを参照せず `75歳` をハードコードしている。ユーザーが70歳退職シナリオや80歳まで働くシナリオを設定していても、このインパクト試算は常に「75歳まで」として算出される。ライフプランの設定と乖離する。

3. **`wr` の算出ロジックは正しい**（加重平均利回り、`spending/calc/suggest.js:41-43`）。ただし資産残高が0（`totalBal === 0`）の場合は 3% にフォールバックする。

4. **`rate` の単位変換**: `assets[].return` は `%` 単位（例 5）が lifeplan スキーマの定義。`wr / 100` で正しく比率に変換している。`wr < 20` の上限ガード（20% 超は異常値として無視）も妥当。

**重要度**: 🟡 Important（積立期間が lifeplan シミュレーション設定と非連携）

**修正方針**:
- `lifeplan.retirement.retirementAge` や `lifeplan.finance.simYears` が設定されている場合はそれを優先して積立期間を算出する。
- 年齢計算を `new Date()` の月日まで考慮した精算に修正（`spending/calc/suggest.js:36`）。

---

### SP-CL-07: カテゴリ別予算チェックロジック

**該当コード**: `spending/index.html:2316-2393`（`renderBudgetSummary`, `openBudgetModal`, `saveBudgetModal`）、`spending/index.html:3749-3778`（`renderBudgetAlertBanner`）

```javascript
function renderBudgetSummary(categoryTotals) {
  ...
  const totalBudget = catsWithBudget.reduce((s, c) => s + c.budget, 0);
  const totalActual = catsWithBudget.reduce((s, c) => s + (categoryTotals[c.id] || 0), 0);
  const pct = Math.round(totalActual / totalBudget * 100);
  const overCount = catsWithBudget.filter(c => (categoryTotals[c.id] || 0) > c.budget).length;
  ...
}

function saveBudgetModal() {
  for (const cat of state.categories) {
    const input = document.getElementById('bm_' + cat.id);
    if (input) cat.budget = parseInt(input.value) || null;
  }
  ...
}
```

予算アラートバナー:
```javascript
const overCats = state.categories.filter(c =>
  c.budget && (categoryTotals[c.id] || 0) > c.budget
);
```

提案トリガー（`budget_over`）:
```javascript
id: 'budget_over',
check: (d) => {
  const over = state.categories.filter(c => c.budget && (d.categoryTotals?.[c.id] || 0) > c.budget);
  return over.length >= 2;  // 2カテゴリ以上で発火
},
```

**期待挙動**:
- カテゴリ別予算はユーザーが月予算（円）を設定し、当月のカテゴリ集計と比較する。
- 不定期費用（`irregular_fixed`, `irregular_variable`）に予算を設定した場合、月ごとの発生は不均一（発生月に集中、非発生月は0）であり、月次比較が実態を反映しない。

**検出**:

1. **不定期費用カテゴリ（`annual`, `special`）の月次予算比較が意味をなしにくい**: 予算モーダル（`openBudgetModal`）はすべてのドメインのカテゴリを同列に表示し、`irregular_fixed` や `irregular_variable` のカテゴリにも月次予算を設定できる。しかし年払い保険料や車検等は特定月にのみ計上されるため、「月予算 ÷ 月額」の比較では発生月に必ず超過し、非発生月は0になる。UIには何も注記がない。

2. **予算比較は `categoryTotals`（月次実績）vs `c.budget`（月予算）で正しく実装されている**。演算ロジックに誤りはない。`pct = totalActual / totalBudget * 100` の `totalBudget` が0になるケースは `if (!catsWithBudget.length) return` ガードで保護されている。

3. **`budget_over` 提案トリガーは「2カテゴリ以上超過」で発火**: 閾値2は任意設定で根拠不明。1カテゴリ超過でも重要情報だが、1超過では提案バナーが出ない（ただし `renderBudgetAlertBanner` は1超過でも別途バナー表示するため補完されている）。

**重要度**: 🟡 Important（不定期費用カテゴリへの月次予算設定が misleading だが、計算ロジック自体に誤りはない）

**修正方針**:
- 予算設定モーダルで `irregular_fixed` / `irregular_variable` ドメインのカテゴリには「月次予算の設定は推奨しません（年払い費用のため）」等の注記を追加する。
- あるいは `irregular_*` カテゴリを予算設定対象から除外するオプションを検討。

---

### SP-CL-08: 年次ビュー集計と月次合計の整合性

**該当コード**: `spending/index.html:1858-1879`（`getAnnualData`）、`spending/index.html:1882-1958`（`renderAnnualView`）

```javascript
function getAnnualData(year) {
  const presentKeys = Object.keys(state.months).filter(k => k.startsWith(`${year}-`));
  if (presentKeys.length === 0) return null;

  let income = 0, totalExpense = 0;
  const domainTotals    = {};
  const categoryTotals  = {};
  const monthlyBreakdown = [];

  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, '0')}`;
    const md  = getMonthData(state.months, key);
    const exp = md?.totalExpense || 0;
    income       += md?.income || 0;
    totalExpense += exp;

    Object.entries(md?.domainTotals   || {}).forEach(([d, v]) => { domainTotals[d]   = (domainTotals[d]   || 0) + v; });
    Object.entries(md?.categoryTotals || {}).forEach(([c, v]) => { categoryTotals[c] = (categoryTotals[c] || 0) + v; });
    monthlyBreakdown.push({ month: m, key, expense: exp, domainTotals: { ...(md?.domainTotals || {}) } });
  }

  return { year, income, totalExpense, domainTotals, categoryTotals, monthlyBreakdown, monthCount: presentKeys.length };
}
```

月次集計（`aggregateEntries`、`spending/calc/aggregate.js:4-19`）:
```javascript
export function aggregateEntries(entries, categories) {
  ...
  for (const e of entries) {
    if (e.isIncome) { income += e.amount; continue; }
    const cat = catMap[e.categoryId];
    if (!cat) continue;
    categoryTotals[e.categoryId] = (categoryTotals[e.categoryId] || 0) + e.amount;
    domainTotals[cat.domain] = (domainTotals[cat.domain] || 0) + e.amount;
    totalExpense += e.amount;
  }
  ...
}
```

**期待挙動**:
- 年次ビューの `totalExpense` = 各月の `totalExpense` の単純合計
- 年次ビューの `domainTotals` = 各月の `domainTotals` の合計
- 年次ビューの `categoryTotals` = 各月の `categoryTotals` の合計

**検出**:

1. **年次合計 = 月次合計の加算で正しく一致**する。`getAnnualData` は `state.months[key].totalExpense` / `domainTotals` / `categoryTotals` を月ごとに加算しており、各月の値は `aggregateEntries` の戻り値を `Object.assign(existing, agg)` で設定したもの。再集計ではなく保存済み値を使うため一致が保証される。

2. **`monthCount`（データのある月数）**: `presentKeys.length`（実際にキーが存在する月数）を返す。年次ビューの「月平均」（`:1936`）は `data.monthCount` で割るため、データがない月（0円）を除いた正しい平均になる。例えば1〜3月のデータのみなら3で割る。これは UX 上合理的（空月で薄まらない）。

3. **フォールバック収入（`annualFallbackIncome = getMonthlyBase() * 12`）**: データがない月の収入を 0 として加算するため年次実績収入は月次実績収入の単純合計に一致する。設定値フォールバックは「記録収入が0」の場合のみ UI 表示で使われ、集計値には影響しない。

**重要度**: ✅ 検証済（問題なし）

---

## 統合所感

### 緊急対応（Critical 相当）

実は今回の監査では Classic-Critical 級（計算が完全に破綻するバグ）は検出されなかった。重要度分類を見直すと:

- **最も影響が大きい問題は SP-CL-03（不定期支出の年換算）**: データ期間が12ヶ月未満の場合、`nYears < 1` となり年額が大幅に過大評価される。例えば7ヶ月データで1回の車検（¥80,000）があると `nYears = 0.583`、年額 = ¥137,000 相当に膨らむ。ライフプランの長期シミュレーションに直結する値のため、実用上最優先での修正を推奨。

### Phase SP-3 優先度順

| 優先度 | 項目 | 理由 |
|---|---|---|
| 1 | SP-CL-03 | lifeplan シミュレーション誤差に直結。データ少ない初期ユーザーで必ず発生 |
| 2 | SP-CL-05 | `insurance_ratio` の収入参照不一致。トリガー条件が見た目と異なる場合がある |
| 3 | SP-CL-06 | `calcSavingsImpact` の積立期間が lifeplan 設定と非連携 |
| 4 | SP-CL-07 | 不定期カテゴリへの月次予算設定が misleading（UI注記追加） |
| 5 | SP-CL-01 | `toManYen` の特殊値ガードと重複定義整理 |
| 6 | SP-CL-04 | 手動エントリの `importedEntryIds` 登録設計レビュー |

### Snapshot への影響

- SP-CL-03 修正（`nYears` 計算または occurrence-based への変更）はスナップショットに影響する可能性あり（`irregularAnnualTotal` の期待値が変化）。
- SP-CL-05 修正（収入参照統一）は `calcSuggestionAvg` の戻り値には影響しないが、提案発火判定ロジックに影響する。ブラウザテストで確認要。
- SP-CL-06 修正（積立期間計算）は `calcSavingsImpact` の戻り値に直接影響するため snapshot / unit test 更新が必要。
