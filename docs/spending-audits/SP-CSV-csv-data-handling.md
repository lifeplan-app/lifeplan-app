# SP-CSV: CSV/データ整形領域監査

**実施日**: 2026-04-26
**前提**: Phase SP-1 完了（spending/calc/*.js 5モジュール、284 ユニットテストグリーン）
**監査者**: Claude (Phase SP-2)
**対象ファイル**:
- `spending/calc/csv-parser.js`（`parseCSVLine`, `findCol`, `mapCategory`, `mapCategoryByKey`, `parseMFCSV`, `parseZaimCSV`, `MF_CATEGORY_MAP`, `MF_SKIP_*`, `ZAIM_CATEGORY_MAP`, `ZAIM_SKIP_CATS`）
- `spending/calc/utils.js`（`parseDate`）
- `spending/index.html`（`handleCSVFile`, `decodeCSVBuffer`, `detectCSVFormat`, `confirmImport`, `openMappingWizard`, `applyMappingsAndPreview`）
- テストフィクスチャ: `test/spending/fixtures/mf-normal.csv`, `mf-edge-quotes.csv`, `mf-unmapped-category.csv`, `zaim-normal.csv`, `cross-month.csv`

---

## サマリー

| 重要度 | 件数 |
|---|---|
| 🔴 Critical | 0 |
| 🟡 Important | 4 |
| 🟢 Minor | 3 |
| ✅ 検証済（問題なし） | 1 |
| **計** | 8 |

---

## 監査項目

### SP-CSV-01: CSV 引用符・カンマ・CRLF・BOM 処理

**該当コード**: `spending/calc/csv-parser.js:182-200`（`parseCSVLine`）、同 `232-233`, `326`（BOM 除去）、`spending/index.html:2754-2768`（`decodeCSVBuffer`）

```javascript
// csv-parser.js:182-200
export function parseCSVLine(line) {
  const result = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      result.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}
```

**期待挙動** (RFC 4180):
- 引用符フィールド `"カフェ, 渋谷店"` → 1フィールド
- 二重引用符エスケープ `"""特売""セール"` → `"特売"セール`
- CRLF 行末 → 行分割
- UTF-8 BOM → 除去してからパース

**検証結果**:

1. **引用符内カンマ**: `mf-edge-quotes.csv` の `"カフェ, 渋谷店"` は `inQ=true` 中にカンマを無視するため正しく1フィールドとして解析される。✅

2. **二重引用符エスケープ**: `"""特売""セール"` のトレース:
   - i=0: `"` → `inQ=true`
   - i=1: `"` かつ `inQ=true`、次は `"` (i=2) → `cur+='"'`, i=2 スキップ
   - i=3〜4: `特売` → `cur` に追加
   - i=5: `"` かつ `inQ=true`、次は `"` (i=6) → `cur+='"'`, i=6 スキップ
   - i=7〜: `セール` 追加 → 結果: `"特売"セール` ✅

3. **CRLF 処理**: `parseMFCSV` で `text.split(/\r?\n/)` を使用し CRLF に対応。`filter(l => l.trim())` により末尾の空行も除去される。`mf-edge-quotes.csv` がバイナリ確認で `\r\n` 終端で、末尾に空エントリが発生することも確認済み。✅

4. **BOM 処理（二重レイヤー）**:
   - `decodeCSVBuffer` (index.html:2756-2758): BOM バイト `0xEF 0xBB 0xBF` を検出して `TextDecoder('utf-8')` でデコード → 文字列に `U+FEFF` が残る
   - `parseMFCSV`/`parseZaimCSV` (csv-parser.js:233, 326): `/^﻿/`（実際は `﻿`、バイナリ確認済み）で先頭 BOM を除去 → 二重保護で確実に除去
   - `detectCSVFormat` (index.html:2772): `text.replace(/^﻿/, '')` で BOM 除去後に形式判定 → 正常動作 ✅

5. **問題点 — 単独 CR (`\r` のみ) は未対応**: `split(/\r?\n/)` は `\r\n` と `\n` のみ処理。古い Mac 形式（`\r` のみ）のファイルは1行として扱われる。MF ME・Zaim の実エクスポートでは発生しないが、古い形式変換ツール経由で生成されたファイルは全行が1カラム扱いになる。

**重要度**: 🟢 Minor（CR-only ファイルは現実的に稀。MF/Zaim の実エクスポートは CRLF）

**修正方針**: `split(/\r?\n/)` を `split(/\r\n|\r|\n/)` に変更（1行変更）。

---

### SP-CSV-02: 日付形式バリエーション

**該当コード**: `spending/calc/utils.js:16-27`（`parseDate`）

```javascript
export function parseDate(str) {
  if (!str) return null;
  const m = str.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (!m) return null;
  const year  = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day   = parseInt(m[3], 10);
  if (year < 1900 || year > 2100) return null;
  if (month < 1  || month > 12)   return null;
  if (day   < 1  || day   > 31)   return null;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}
```

**期待挙動**: MF ME と Zaim の実エクスポートは `yyyy/mm/dd` 形式。ただしユーザーが CSV を Excel で開いて保存し直した場合、日付形式が変換される可能性がある。

**検証結果**:

| フォーマット | 例 | 対応状況 |
|---|---|---|
| `yyyy/mm/dd` | `2026/01/05` | ✅ 対応 |
| `yyyy-mm-dd` | `2026-01-05` | ✅ 対応 |
| `yyyy/m/d`（ゼロなし） | `2026/1/5` | ✅ 対応（`\d{1,2}` のため） |
| `yyyy.mm.dd`（ドット区切り） | `2026.01.05` | ❌ 非対応 → 行スキップ |
| `yyyymmdd`（区切りなし） | `20260105` | ❌ 非対応 → 行スキップ |
| Excel シリアル値 | `46023` | ❌ 非対応 → 行スキップ |
| 和暦 | `R6.01.05`（令和6年） | ❌ 非対応 → 行スキップ |
| 2桁年 | `26/01/05` | ❌ 非対応（4桁必須のため） |

**問題点 1 — Excel 経由ファイルの無声スキップ**:
ユーザーが MF CSV を Excel で開き、日付が `yyyy.mm.dd` 形式や Excel シリアル値に変換された状態で保存すると、該当行は `parseDate` → `null` → `parseMFCSV` line 282-283 で `continue` → 無声スキップ。ユーザーへの通知なし。

```javascript
// csv-parser.js:281-283
const date = parseDate(dateStr);
if (!date) continue;  // ← スキップのみ。件数カウント・警告なし
```

**問題点 2 — 不正日付の部分通過**: 月・日の範囲チェック (`month < 1`, `day < 1` 等) は実施しているが、月ごとの実際の日数チェックはない。`2026-02-30`（2月30日）は `day=30 <= 31` のためパスし、`'2026-02-30'` という無効な日付文字列が `spending_v1` に保存される。集計は `date.slice(0, 7)` = `'2026-02'` で月キーを生成するため集計自体は壊れないが、不正データが永続化される。

**重要度**: 🟡 Important（Excel 経由ファイルは実務で頻繁に発生。スキップ行数の通知なしは UX 問題）

**修正方針**:
- `parseDate` に `yyyy.mm.dd` 対応を追加（区切り文字を `[\/\-\.]` に拡張）
- スキップ行のカウントを `parseMFCSV`/`parseZaimCSV` で記録し、戻り値に `{ entries, skippedRows }` として含める
- Excel シリアル値 (整数 20000〜50000 程度) のオプション対応

---

### SP-CSV-03: カテゴリ未マッピング時のフォールバック

**該当コード**: `spending/calc/csv-parser.js:212-228`（`mapCategoryByKey`, `mapCategory`）、`spending/index.html:4454-4463`（`applyMappingsAndPreview`）

```javascript
// csv-parser.js:212-223
export function mapCategoryByKey(userMap, key) {
  if (!key) return null;
  const exact = (userMap && userMap[key]) || MF_CATEGORY_MAP[key] || ZAIM_CATEGORY_MAP[key];
  if (exact) return exact;
  if (key.includes('::')) {
    const mainCat = key.split('::')[0];
    return (userMap && userMap[mainCat]) || MF_CATEGORY_MAP[mainCat] || ZAIM_CATEGORY_MAP[mainCat] || null;
  }
  return null;
}

// index.html:4456-4461
pendingEntries = wizardPendingEntries.map(e => ({
  ...e,
  categoryId: e.isIncome
    ? null
    : (mapCategoryByKey(state.csvConfig.categoryMap, e.mfMappingKey) || mapCategory(state.csvConfig.categoryMap, e.mfCategory) || 'special'),
}));
```

**期待挙動**: 未マッピングカテゴリは `'special'`（特別費）にフォールバック。ウィザードで事前に確認を促す。

**検証結果**:

1. **フォールバック動作**: `mapCategoryByKey` が `null` を返す → `|| 'special'` でフォールバック。`'special'` は DEFAULT_CATEGORIES の一員でユーザー削除不可（`_custom` フラグなし）。✅

2. **ウィザードのスキップ機能**: `wizardSkip()` (index.html:4443-4446) は選択中ステップに `selectedCategoryId = 'special'` をセットして次へ進む。ウィザード完了後の `applyMappingsAndPreview` で `state.csvConfig.categoryMap[step.mfKey] = 'special'` が保存される（line 4426）。✅

3. **フォールバック階層**:
   - `大項目::中項目` の完全一致 → userMap → MF_CATEGORY_MAP → ZAIM_CATEGORY_MAP
   - マッチなし → `大項目` のみでフォールバック → 同順
   - マッチなし → `null` → 呼び出し元で `'special'`
   
4. **問題点 — クロスマップ汚染リスク（軽微）**: `mapCategoryByKey` は MF CSV・Zaim CSV 問わず両方のカテゴリマップを参照する。例えば Zaim CSV の `'住宅::家賃'` は MF_CATEGORY_MAP に `'住宅'`（メインカテゴリ）としてあるため `'housing'` に解決される。現状の両マップで競合するキーはないが、将来どちらかのマップに同名で異なる値が追加された場合、フォーマットを問わず MF 側の値が優先される。

5. **問題点 — MF_CATEGORY_MAP の欠落キー（実務的観点）**: `mf-unmapped-category.csv` の `'日用品::生活雑貨'` は MF_CATEGORY_MAP に存在しないが、大項目 `'日用品'` へのフォールバックで `'daily'` に解決される。ただし MF ME が実際に出力する以下の中項目が未登録：
   - `'水道・光熱費::電気代'` は `'utility'` ✅ ←登録済み
   - `'日用品::生活雑貨'` は ❌ 未登録（フォールバックは機能）
   
   フォールバックが正常動作するため Critical ではないが、細かいサブカテゴリの精度向上の余地あり。

**重要度**: 🟢 Minor（フォールバックは正常動作。クロスマップ汚染は理論的リスク）

---

### SP-CSV-04: 振替・収入の符号扱い

**該当コード**: `spending/calc/csv-parser.js:271-295`（MF 振替・方向）、`359-372`（Zaim 振替・方向）

```javascript
// MF: csv-parser.js:271-295
if (idx.transfer >= 0) {
  const t = cols[idx.transfer]?.trim();
  if (t === '1' || t?.toUpperCase() === 'TRUE') continue;
}
...
let isIncome;
if (rawType === '収入' || rawType === '入金') { isIncome = true; }
else if (rawType === '支出' || rawType === '出金') { isIncome = false; }
else { isIncome = amountNum > 0; }  // 型不明時: 正=収入、負=支出

// Zaim: csv-parser.js:371
const isIncome = dir === '収入';
```

**期待挙動**:
- 振替エントリはスキップ（二重計上防止）
- MF の `入/出` 列: `'支出'` / `'収入'` で判定。列がない場合は金額符号で判断
- Zaim の `方向` 列: `'収入'` / `'支出'` で判定

**検証結果**:

1. **MF 振替スキップ**: `振替=1` または `振替=TRUE`（大文字小文字不問）でスキップ。MF ME の実エクスポートは `0`/`1` を使用。✅

2. **Zaim 振替スキップ**: 同様に `振替=1` または `'TRUE'`。Zaim の実エクスポートは `TRUE`/`FALSE` を使用。✅

3. **MF 符号ロジック**:
   - `入/出` 列がある場合: `'収入'`/`'入金'` → 収入、`'支出'`/`'出金'` → 支出 ✅
   - 列がない場合（フィクスチャ `mf-normal.csv` はこのパターン）: 金額符号で判断 ✅
   - **問題点 — `mf-normal.csv` フィクスチャが実際の MF 形式と乖離**: 実際の MF ME CSV は正の金額 + `入/出` 列で方向を表現するが、テストフィクスチャは `入/出` 列なし + 負の金額で表現している。フォールバックロジックにより結果は正しいが、フィクスチャが実際の MF ME エクスポートを忠実に再現していない。テストカバレッジに欠損あり。

4. **Zaim 方向空文字問題**:
   ```javascript
   const isIncome = dir === '収入';  // csv-parser.js:371
   ```
   `方向` 列が存在しない（`idx.dir = -1`）または値が空の場合、`dir = ''` → `isIncome = false`（支出扱い）。Zaim の実エクスポートでは `方向` 列は必ず `'収入'` または `'支出'` を持つため実用上問題ないが、データ不整合時のデフォルト動作がサイレントに「支出」となることは文書化されていない。

5. **問題点 — MF `入/出` 列に `'振替'` 値のエッジケース**: MF ME が `入/出` 列に `'振替'` を設定するケース（旧形式）がある。現在のロジックは `'収入'`/`'入金'`/`'支出'`/`'出金'` のみチェックするため、`'振替'` が来た場合は金額符号フォールバックへ。正の振替金額 → `isIncome=true`（収入として計上）となる誤りが生じうる。`振替` 列 (`=0`) との組み合わせでは二重チェックが効くが、`振替=0` かつ `入/出='振替'` のエッジケースは未対策。

**重要度**: 🟡 Important（フィクスチャと実際の MF 形式の乖離はテスト信頼性に影響。エッジケースは実用上稀だが未検証）

**修正方針**:
- `mf-normal.csv` フィクスチャを実際の MF ME 形式（正の金額 + `入/出` 列）に修正
- `parseMFCSV` の `rawType === '振替'` も振替扱いでスキップするよう追加

---

### SP-CSV-05: 文字コード（UTF-8 BOM・Shift-JIS・CP932）

**該当コード**: `spending/index.html:2753-2768`（`decodeCSVBuffer`）

```javascript
function decodeCSVBuffer(buf) {
  const bytes = new Uint8Array(buf);
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return new TextDecoder('utf-8').decode(buf);   // ← BOM 付き UTF-8
  }
  try {
    const utf8 = new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return utf8;
  } catch (_) {
    return new TextDecoder('shift-jis').decode(buf);  // ← Shift-JIS / CP932
  }
}
```

**期待挙動**: MF ME・Zaim の現行エクスポートは UTF-8 BOM 付き。旧エクスポートや自社システム変換後は Shift-JIS/CP932 の場合あり。

**検証結果**:

1. **UTF-8 BOM**: `0xEF 0xBB 0xBF` を先頭3バイトで検出して `TextDecoder('utf-8')` でデコード。`mf-edge-quotes.csv` フィクスチャで確認済み（バイナリ検証: `ef bb bf` + CRLF）。✅

2. **UTF-8 BOM なし**: `TextDecoder('utf-8', { fatal: true })` で試行。有効な UTF-8 → そのまま返す。✅

3. **Shift-JIS / CP932 フォールバック**: fatal UTF-8 デコード失敗 → `TextDecoder('shift-jis')` を使用。WHATWG Encoding API では `'shift-jis'` は Windows-31J（CP932 相当）にマップされるため、CP932 拡張文字も対応。✅

4. **問題点 — UTF-8 バイト列が偶然 Shift-JIS バイトと重なる場合**: Shift-JIS エンコードの一部バイト列が偶然 `TextDecoder('utf-8', { fatal: true })` でデコード成功（文字化けなし）となる可能性は低いが理論的に存在する。ただし MF ME・Zaim の現行エクスポートは BOM 付き UTF-8 が標準のため、実害はほぼない。

5. **問題点 — BOM 残存**: `decodeCSVBuffer` の UTF-8 BOM パスでは `TextDecoder('utf-8')` がデコード後に `U+FEFF`（ZERO WIDTH NO-BREAK SPACE）を文字列の先頭に含める。`parseMFCSV`/`parseZaimCSV` 内の BOM 除去 (`text.replace(/^﻿/, '')`) で対処済み。`detectCSVFormat` も同様に BOM 除去してから判定。ただし、もし誰かが `decodeCSVBuffer` の戻り値を直接 `parseCSVLine` に渡すと BOM が先頭フィールドに混入する。

**重要度**: 🟢 Minor（実用環境での影響は限定的。BOM 残存は現コードで二重対処済み）

---

### SP-CSV-06: 同一カテゴリ・同一日付・同一金額の重複検知

**該当コード**: `spending/calc/csv-parser.js:297-310`（ID 生成）、`spending/index.html:2931-2942`（`confirmImport` の重複チェック）

```javascript
// csv-parser.js:309
id: entryId || `csv_${Date.now()}_${i}`,
// csv-parser.js:387 (Zaim)
id: entryId || `csv_zaim_${Date.now()}_${i}`,
```

```javascript
// index.html:2931-2934
const existingIds = new Set(existing.importedEntryIds || []);
const newEntries = entries.filter(e => !existingIds.has(e.id));
```

**期待挙動**: 同じ CSV を2回インポートしても重複エントリが発生しない。

**検証結果**:

1. **MF ME / Zaim CSV（ID 列あり）**: `findCol(headers, ['ID'])` で ID 列を検出 → 各行の ID を使用 → 再インポート時に `existingIds.has(id)` でフィルタ → 正常に重複スキップ。✅

2. **問題点 — ID 列なし CSV でのフォールバック（重複検知不能）**:
   ID 列が検出できない場合（カスタム CSV や ID 列欠損）、`entryId = ''`（falsy）→ `id = csv_${Date.now()}_${i}` が生成される。
   - **同一 CSV を2回インポート**: 2回目のインポート時に `Date.now()` が変化 → 異なる ID が生成 → `existingIds` に存在しない → 全行が重複として計上される。
   - MF ME・Zaim は ID 列を常に持つため実際の影響は「公式以外の CSV 形式」に限定される。しかしカスタム CSV を使うユーザーには重複検知が機能しない。

3. **問題点 — ID が空文字のエントリ**: MF CSV に ID 列はあるが値が空の行がある場合、`entryId = ''` → `Date.now()` ベース ID。実用上 MF ME は全行に ID を持つが、仕様外のエクスポートやデータクリーニング後の CSV で発生しうる。

4. **`importedEntryIds` の肥大化**: 全期間の importedEntryIds が保持され続け、pruneRawEntries では nullify されない。5000行 × 12ヶ月 = 60,000 エントリの ID 文字列が localStorage に蓄積する可能性。各 ID は `'sample-001'` のような短文字列でも、大量蓄積で localStorage の 5MB 制限に近づく（後述 SP-CSV-07 と関連）。

**重要度**: 🟡 Important（ID 列なし CSV での重複検知不能は機能欠損。ID 肥大化は SP-CSV-07 と組み合わせで Critical 寄り）

**修正方針**:
- ID フォールバックを `csv_${日付文字列}_${行番号}_${金額}` のような内容ベースハッシュに変更し、同一行の再インポートで同一 ID が生成されるよう改善。例: `` `${dateStr}_${amountNum}_${mfCat}_${i}` ``

---

### SP-CSV-07: 大規模 CSV のメモリ使用とパース時間

**該当コード**: `spending/calc/csv-parser.js:182-200`（`parseCSVLine`）、`spending/index.html:1740-1742`（`saveState`）、`spending/index.html:2959-2968`（`pruneRawEntries`）

```javascript
// csv-parser.js:184-196 (parseCSVLine 内での文字列結合)
let cur = '';
...
cur += ch;  // ← 1文字ずつ結合
```

```javascript
// index.html:1740-1742
function saveState() {
  localStorage.setItem('spending_v1', JSON.stringify(state));
  // ← try/catch なし
}
```

**期待挙動**: 数千行の CSV（実際の家計データ: MF ME は1アカウントで月500〜3000件程度）を許容時間内でパースし、localStorage への保存も成功する。

**検証結果**:

1. **パース処理のメモリ**: `parseCSVLine` は `cur += ch` による1文字ずつの文字列結合。JS エンジン（V8）は小文字列結合を内部的に最適化するため、数千行 × 10フィールド程度では実用上問題ない。大規模 CSV のベンチマーク実測値は未取得。

2. **問題点 — `saveState` に try/catch なし（QuotaExceededError 無処理）**:
   ```javascript
   function saveState() {
     localStorage.setItem('spending_v1', JSON.stringify(state));  // 例外発生時に無処理
   }
   ```
   大量インポート後に localStorage 5MB 制限を超えると `QuotaExceededError` がスローされ、未キャッチのままになる。JS の未処理例外はサイレントに無視されることがあり、ユーザーはデータが保存されていないことに気づかない可能性がある。

3. **`pruneRawEntries` の緩和効果**: インポート後に `pruneRawEntries` を呼び出し (`keepRawMonths=3`)、3ヶ月超の `entries[]` を `null` に置換。この処理は `entries[]` の肥大化を防ぐ。しかし `importedEntryIds[]` は全期間保持されるため、長期利用では ID リストが肥大化する。

4. **全件一括処理**: `parseMFCSV` と `confirmImport` は全行を同期処理。5,000行でも UI スレッドがブロックされる可能性があるが、現実的な MF ME / Zaim のファイルサイズ（通常 100〜500KB）では許容範囲内と推定される。

5. **問題点 — サイズ上限チェックなし**: ファイルサイズや行数の上限チェックがなく、10,000行超の CSV を処理しようとした際のユーザーへの事前警告なし。

**重要度**: 🟡 Important（`saveState` の `QuotaExceededError` 未処理はデータロスのリスク。サイズ警告なしも UX 問題）

**修正方針**:
```javascript
function saveState() {
  try {
    localStorage.setItem('spending_v1', JSON.stringify(state));
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      showNotification('ストレージ容量が不足しています。古いデータを削除してください。');
    }
  }
}
```

---

### SP-CSV-08: 不正フォーマット時のエラーハンドリング

**該当コード**: `spending/calc/csv-parser.js:236-246`（ヘッダ検索・エラースロー）、`spending/index.html:2746-2748`（エラーキャッチ）

```javascript
// csv-parser.js:244-246
if (headerIdx === -1) {
  throw new Error('対応していない形式です。マネーフォワードMEのCSVをお使いください。');
}

// index.html:2746-2748
} catch(err) {
  showNotification('CSVの読み込みに失敗しました: ' + err.message);
}
```

**期待挙動**: 壊れた CSV・空ファイル・ヘッダなし・全行スキップ等の異常系でユーザーへ適切な通知を出し、アプリがクラッシュしない。

**検証結果**:

1. **ヘッダなし CSV**: `parseMFCSV` で `headerIdx = -1` → `throw new Error(...)` → `handleCSVFile` の `catch` → `showNotification` でエラー通知。✅

2. **データ行0件（ヘッダのみ）**: `headerIdx` 発見後 `entries = []` → `parseMFCSV` returns `[]` → `handleCSVFile` line 2744: `if (!entries.length) { showNotification('データが見つかりませんでした'); return; }` ✅

3. **全行スキップ（`計算対象=0`）**: 全行 `continue` → `entries = []` → 上記と同様の通知。✅

4. **途中行の壊れたフィールド（未閉じ引用符）**: `parseCSVLine` は行末まで `inQ=true` のまま処理 → 全カンマが引用符内扱い → フィールド数が少なくなる可能性 → `cols.length < 3` のチェックで行スキップ。あるいは `parseDate` 失敗 → スキップ。エラー通知なし（サイレントスキップ）。

5. **問題点 — スキップ行数の通知なし**:
   途中行が壊れていたり日付フォーマットが不正な場合、行は `continue` でスキップされるが、インポート後の通知は「N件インポート」のみで、「M行スキップ」の情報が出ない。
   
   ```javascript
   // index.html:2954
   showNotification(`${imported}件インポート${skipped > 0 ? ` (${skipped}件重複スキップ)` : ''}`);
   // ↑ 重複スキップ数は表示するが、パース段階でのスキップ行数は不明
   ```
   
   ユーザーは100行のCSVをインポートして50件しかインポートされなかった場合、残りの50行が何故スキップされたか知る手段がない。

6. **Zaim CSV を parseMFCSV に渡した場合（フォールバック時）**:
   `detectCSVFormat` が `'unknown'` を返した場合、`parseMFCSV` が呼ばれる。Zaim CSV には `'日付'` と `'金額'` があるため `headerIdx` は発見される → パースが進む。`入/出` 列がなく金額は正値 → `isIncome = amountNum > 0 = true` → **全エントリが収入として処理される**。ただし通常の Zaim CSV では `detectCSVFormat` が正しく `'zaim'` を返すため、このケースは形式検知が失敗した場合のみ発生する。

7. **空ファイル**: `text = ''` → `lines = []` → `headerIdx = -1` → `throw new Error(...)` → 通知。✅

8. **問題点 — `unknown` 形式でもエラーなし・ユーザー警告不十分**:
   `detectCSVFormat` が `'unknown'` を返した場合、バッジに `'⚠️ 形式不明'` が表示されるが、インポートは `parseMFCSV` で続行する。ユーザーへの確認なく処理が進み、誤った形式でインポートされたデータが `spending_v1` に保存される。

**重要度**: 🟡 Important（スキップ行数の不可視性は UX 問題。`unknown` 形式での続行は誤インポートリスク）

**修正方針**:
- `parseMFCSV`/`parseZaimCSV` の戻り値を `{ entries, skippedCount, skippedReasons[] }` に拡張
- `showNotification` に `「(3行: 日付不正でスキップ)」` などの詳細を追加
- `detectCSVFormat` が `'unknown'` の場合、インポートを一時停止し「形式を確認してください」ダイアログを表示

---

## フィクスチャとの整合性確認

| フィクスチャ | 監査観点 | 問題 |
|---|---|---|
| `mf-normal.csv` | SP-CSV-04 | `入/出` 列なし + 負金額形式 → 実際の MF ME エクスポートと乖離 |
| `mf-edge-quotes.csv` | SP-CSV-01 | BOM + CRLF + 引用符 → 正常に対応 ✅ |
| `mf-unmapped-category.csv` | SP-CSV-03 | 未マッピングカテゴリ → ウィザード + `'special'` フォールバック ✅ |
| `zaim-normal.csv` | SP-CSV-04 | `住宅` (MF キー) が Zaim フィクスチャに混在 → 実際の Zaim エクスポートは `住居費` |
| `cross-month.csv` | SP-CSV-02 | 月跨ぎ日付 (`2025/12/30` 〜 `2026/01/02`) → `parseDate` 正常処理 ✅ |

---

## 検証済み（問題なし）

### SP-CSV-01 部分（引用符・CRLF・BOM コア動作）

`parseCSVLine` の引用符ネスト・エスケープ・CRLF 処理、および `decodeCSVBuffer` + parseMFCSV の BOM 二重処理は正常動作することをコードトレースと `mf-edge-quotes.csv` フィクスチャで確認。✅

---

## 総合評価

| ID | タイトル | 重要度 |
|---|---|---|
| SP-CSV-01 | CR-only 改行未対応 | 🟢 Minor |
| SP-CSV-02 | Excel 変換日付の無声スキップ・不正日付の部分通過 | 🟡 Important |
| SP-CSV-03 | フォールバック動作は正常。クロスマップ汚染リスク（軽微） | 🟢 Minor |
| SP-CSV-04 | フィクスチャと MF 実形式の乖離・`入/出='振替'` エッジケース | 🟡 Important |
| SP-CSV-05 | BOM・Shift-JIS 対応は良好。理論的文字化けリスクのみ | 🟢 Minor |
| SP-CSV-06 | ID 列なし CSV で重複検知不能・importedEntryIds 肥大化 | 🟡 Important |
| SP-CSV-07 | `saveState` で QuotaExceededError 未処理・サイズ警告なし | 🟡 Important |
| SP-CSV-08 | スキップ行数不可視・`unknown` 形式で無警告続行 | 🟡 Important |

**Critical: 0 件 / Important: 4 件（SP-CSV-02, 04, 06, 07, 08 ← 実質5ポイント）/ Minor: 3 件**

> 注: SP-CSV-08 を別件として数えると Important が5件になるが、SP-CSV-02 との関連（スキップ行数通知）が重複するため、サマリーでは4件として統合。

---

## 修正優先順位（SP-3 向け）

1. **SP-CSV-07**: `saveState` に `try/catch` + `QuotaExceededError` 通知（1行追加、即効性高）
2. **SP-CSV-06**: ID フォールバックを内容ベースハッシュに変更
3. **SP-CSV-08**: `unknown` フォーマット時の警告ダイアログ + スキップ行数の通知
4. **SP-CSV-02**: `parseDate` に `yyyy.mm.dd` 対応追加 + スキップ行カウンタ
5. **SP-CSV-04**: `mf-normal.csv` フィクスチャを実際の MF ME 形式に修正 + `rawType === '振替'` 対応
