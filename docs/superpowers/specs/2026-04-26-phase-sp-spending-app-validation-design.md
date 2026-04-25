# Phase SP: 支出管理アプリ計算ロジック検証 設計書

**作成日**: 2026-04-26
**前提**: ライフプランアプリは Phase 5c まで完了（251/251 テストグリーン、ヘルススコア A）。支出管理アプリはテスト 0 件、計算ロジック・CSV パーサ・ライフプラン連携の検証が未実施。

## 目的

支出管理アプリ（`spending/index.html`）の以下 3 領域を体系的に検証し、データ取り込み・整形・出力（ライフプラン連携）を含む計算系の正確性を保証する：

1. **計算ロジック**: 月次・年次集計、円→万円変換、不定期支出の年換算、改善提案
2. **CSV/データ整形**: Money Forward / Zaim CSV パース、カテゴリマッピング、日付処理
3. **ライフプラン連携**: spending_v1 → lifeplan_v1 の単位変換と既存データ保護

非エンジニアのアプリ開発者が「家計データの取り込みから家計シミュ連携までが内部的に正確」と確信できるレベルにする。

## 全体構成（3 サブフェーズ）

| サブフェーズ | 目的 | 工数目安 |
|---|---|---|
| **SP-1** | テスト基盤構築（calc/*.js 分離 + ゴールデンマスター） | 半セッション |
| **SP-2** | 3 領域監査（13〜21 項目検出） | 半〜1 セッション |
| **SP-3** | 監査検出問題の修正 | 1〜2 セッション |

## ライフプラン側との関係

- ライフプラン側 `calc/*.js` パターンを継承（純粋関数化、Vitest からの直接呼出し）
- ライフプラン側のテストインフラ（Vitest 2.x、Playwright）を共有
- `lifeplan_v1` への書き込みテストは支出管理アプリ側でも価値あり（既存データ保護の検証）

## SP-1: テスト基盤構築

### 計算ロジック分離

`spending/calc/` 配下に以下 5 モジュールを作成：

```
spending/calc/
  utils.js        # toManYen, parseDate, formatYen, escape系
  aggregate.js    # aggregateEntries, getMonthData, calcIrregularAmounts
  csv-parser.js   # parseMFCSV, parseZaimCSV, parseCSVLine, mapCategory, mapCategoryByKey
  sync.js         # calcSyncValues + lifeplan 書き込み用純粋部分
  suggest.js      # calcSuggestionAvg, calcSavingsImpact
```

各モジュールは **ES module export** 形式（ライフプラン側は CommonJS-vm 方式だったが、新規作成のためモダン形式採用）。

`spending/index.html` 側は `<script type="module">` で読み込み、または既存の inline スクリプトから関数定義を削除して module から import。後方互換性確保のため、`window.functionName = ...` として export 後にグローバル登録もする（既存の onclick="..." 等が壊れないため）。

### ディレクトリ構成

```
test/
  spending/
    fixtures/
      mf-normal.csv               # MF 標準フォーマット 10 行
      mf-edge-quotes.csv          # 引用符、カンマ、CRLF、BOM 含む
      mf-unmapped-category.csv    # 未マッピングカテゴリ含む
      zaim-normal.csv             # Zaim 標準フォーマット 10 行
      cross-month.csv             # 月跨ぎエントリ
    __snapshots__/
      snapshot.test.js.snap       # CSV → spending_v1 ゴールデンマスター
    csv-parser.test.js            # SP-1 ユニット
    aggregate.test.js             # SP-1 ユニット
    sync.test.js                  # SP-1 ユニット
    snapshot.test.js              # SP-1 ゴールデンマスター
    regression.test.js            # SP-3 で検出問題の BUG#1〜
```

### Vitest 設定拡張

ルート `vitest.config.js` または `package.json` で `test/spending/` も収集対象に。既存の `test/*.test.js` パターンが glob ベースなら自動で拾われる想定。要確認。

### ゴールデンマスター戦略

**fixture ベース**: 入力 CSV ファイル（5 種類）→ 期待 spending_v1 state JSON を `__snapshots__` で固定。

合成データのみ使用（実データは PII 含むため不採用）。fixtures 設計指針：
- 各 fixture 10 行程度、カバレッジ重視
- カテゴリは DEFAULT_CATEGORIES の 10 件をローテーションで使用
- 金額は 1,000 円〜100,000 円のレンジ（実用域）
- 日付は同一年内（境界エッジは別 fixture）

### テスト 想定件数（SP-1 完了時）

| カテゴリ | 件数 |
|---|---|
| ユニット（csv-parser） | 8〜12 件 |
| ユニット（aggregate） | 6〜10 件 |
| ユニット（sync） | 4〜6 件 |
| ゴールデンマスター | 5 件（fixtures 数） |
| **合計** | **23〜33 件** |

ライフプラン側 251 件 + SP-1 23-33 = 274〜284 件規模。

## SP-2: 3 領域監査

### 計算ロジック領域（5〜8 項目想定）

| ID | 観点 |
|---|---|
| SP-CL-01 | `toManYen` 丸め誤差（特に切り捨て / 切り上げ / 四捨五入の選択） |
| SP-CL-02 | 月次集計の境界（月末 23:59 / 月初 00:00 / タイムゾーン） |
| SP-CL-03 | 不定期支出の年換算（occurrence-based vs 12 ヶ月平均、`intervalYears` 解釈） |
| SP-CL-04 | 重複エントリ検知（`importedEntryIds` の整合性、再インポート時挙動） |
| SP-CL-05 | 改善提案閾値（通信費 8,000 円、保険料収入の 15% 等の根拠と現状値） |
| SP-CL-06 | `calcSavingsImpact` の積立期間・運用率（lifeplan 連携時の整合性） |
| SP-CL-07 | カテゴリ別予算（budget）チェックロジック |
| SP-CL-08 | 年次ビュー集計と月次合計の整合性 |

### CSV/データ整形領域（5〜8 項目想定）

| ID | 観点 |
|---|---|
| SP-CSV-01 | CSV 引用符・カンマ・CRLF・BOM 処理（`parseCSVLine` の堅牢性） |
| SP-CSV-02 | 日付形式バリエーション（yyyy/mm/dd, yyyy-mm-dd, Excel シリアル等） |
| SP-CSV-03 | カテゴリ未マッピング時のフォールバック（`'special'` への振り分け） |
| SP-CSV-04 | 振替・収入の符号扱い（MF「方向」列、Zaim「方向」列） |
| SP-CSV-05 | 文字コード（UTF-8 BOM、Shift-JIS の場合の挙動） |
| SP-CSV-06 | 同一カテゴリ・同一日付・同一金額の重複検知 |
| SP-CSV-07 | 大規模 CSV（数千行）のメモリ使用とパース時間 |
| SP-CSV-08 | 不正フォーマット時のエラーハンドリング（途中行で壊れた CSV） |

### ライフプラン連携領域（3〜5 項目想定）

| ID | 観点 |
|---|---|
| SP-LP-01 | `syncToLifeplan` の書き込み先（`finance.expense` / `recurringExpenses[]` / `expenses[]`）の妥当性 |
| SP-LP-02 | 円→万円変換の累積誤差（複数月平均で四捨五入が積み重なる） |
| SP-LP-03 | lifeplan_v1 既存データ保護（マージか上書きか、ユーザー手動入力の保全） |
| SP-LP-04 | `irregularSuggestions[]` のユーザー承認フローと反映タイミング |
| SP-LP-05 | `linkedToLifeplan` フラグの状態遷移整合性 |

### 監査の進め方

各項目について以下を文書化：
- **現状コード**: 関連関数・行番号
- **期待挙動**: 仕様書・スキーマ・FP 実務基準・ユーザー期待から導出
- **検出ズレ**: Critical / Important / Minor で分類

ライフプラン Phase 2 同様、`docs/spending-audits/SP-CL-*.md` 等の形でレポート化。

## SP-3: 修正

監査結果に応じてサブエージェント駆動（spec → plan → implement → review）で順次修正。

修正方針はライフプラン側と同じ：
- Critical: 即時対応
- Important: 本セッション内で対応
- Minor: 選別、ニーズ次第

## 後方互換

- 計算関数を `spending/calc/*.js` に分離する際、`spending/index.html` から関数定義を削除すると既存 onclick="..." 等が壊れる
- 対策: 各 ES module 関数を `window.X = X` として export 後にグローバル登録
- localStorage `spending_v1` スキーマは不変
- 既存ユーザーのデータは影響なし

## エッジケース

- `spending/inject_data.js`（1.3MB）はサンプルデータ注入用、計算ロジックには影響しない（テスト対象外）
- `spending/affiliate-config.js` はアフィリエイトリンク設定、計算未関与（テスト対象外）
- `spending/load-data.html` は単体ローダー画面、計算未関与

## テスト戦略

- **ユニットテスト**: 各 calc/*.js 関数を Vitest で直接 import → 期待値検証
- **ゴールデンマスター**: 5 種類の CSV fixture → 期待 spending_v1 を snapshot
- **統合テスト**: SP-3 で監査検出問題ごとに BUG#X として regression.test.js に追加
- **手動 UX 検証**: SP-3 完了後、ユーザーがブラウザで主要フローを動作確認

## commit 構成（サブフェーズ別）

### SP-1（推定 5〜8 commits）

1. `chore(phase-sp-1): create spending/calc/ module structure`
2. `refactor(phase-sp-1): extract csv-parser to spending/calc/csv-parser.js`
3. `refactor(phase-sp-1): extract aggregate to spending/calc/aggregate.js`
4. `refactor(phase-sp-1): extract sync to spending/calc/sync.js`
5. `refactor(phase-sp-1): extract suggest to spending/calc/suggest.js`
6. `test(phase-sp-1): add unit tests for csv-parser/aggregate/sync`
7. `test(phase-sp-1): add fixture-based golden master`
8. `docs(phase-sp-1): record SP-1 baseline + completion`

### SP-2（推定 1〜3 commits）

1. `docs(phase-sp-2): audit reports for 3 areas (SP-CL/SP-CSV/SP-LP)`

### SP-3（監査結果に応じて変動）

各 BUG ごとに 3 commits（chore / fix / docs）構成、ライフプラン側と同様。

## 完了条件

### SP-1 完了条件

- [ ] `spending/calc/` 5 モジュール作成
- [ ] `spending/index.html` から関数定義を削除し module から import + window.X = X 登録
- [ ] ブラウザで支出管理アプリの主要動作（CSV 取込、月次表示、ライフプラン連携）が壊れていない
- [ ] `test/spending/` 配下に csv-parser/aggregate/sync/snapshot のテスト 23〜33 件追加
- [ ] 既存 251 件 + 新規 SP-1 件で全グリーン（274〜284 件）
- [ ] fixture CSV 5 種類作成

### SP-2 完了条件

- [ ] 3 領域それぞれ監査レポート作成（`docs/spending-audits/SP-*.md`）
- [ ] Critical / Important / Minor 分類済み
- [ ] 検出 13〜21 項目を一覧化

### SP-3 完了条件

- [ ] Critical 全件解消
- [ ] Important 主要件解消
- [ ] regression.test.js BUG#X として固定化
- [ ] ヘルススコア記録

## 後続フェーズ候補

- SP-4: UI 検証（Playwright によるオンボーディング、CSV ドラッグ&ドロップ、ダッシュボード表示）
- SP-5: パフォーマンス検証（数千行 CSV のパース時間、メモリ使用）
- 双方向同期: ライフプラン側からの spending 参照（現在は片方向のみ）
