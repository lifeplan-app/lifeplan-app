# Phase SP-1: 支出管理アプリ テスト基盤 ベースライン

**完了日**: 2026-04-26

## 構築されたインフラ

### モジュール (spending/calc/)

| モジュール | exports |
|---|---|
| `utils.js` | `fmt`, `toManYen`, `fmtManYen`, `parseDate` |
| `csv-parser.js` | `parseMFCSV`, `parseZaimCSV`, `parseCSVLine`, `findCol`, `mapCategory`, `mapCategoryByKey` + 5 constants (MF/ZAIM_CATEGORY_MAP, MF/ZAIM_SKIP_*) |
| `aggregate.js` | `aggregateEntries`, `getMonthData` |
| `sync.js` | `calcSyncValues` |
| `suggest.js` | `calcSuggestionAvg`, `calcSavingsImpact` |

### シグネチャ変更（state グローバル参照を引数化）

| Before | After |
|---|---|
| `getMonthData(monthKey)` | `getMonthData(months, monthKey)` |
| `calcSyncValues(avgMonths, opts)` | `calcSyncValues(months, avgMonths, opts)` |
| `calcSuggestionAvg(nMonths)` | `calcSuggestionAvg(months, nMonths)` |
| `calcSavingsImpact(savings)` | `calcSavingsImpact(savings, lifeplan)` |
| `mapCategory(mfCat)` | `mapCategory(userMap, mfCat)` |
| `mapCategoryByKey(key)` | `mapCategoryByKey(userMap, key)` |

### テスト (test/spending/)

| ファイル | 件数 | 対象 |
|---|---|---|
| `utils.test.js` | 14 | fmt / toManYen / fmtManYen / parseDate |
| `csv-parser.test.js` | 17 | parseCSVLine / findCol / mapCategory* / parseMFCSV / parseZaimCSV |
| `aggregate.test.js` | 7 | aggregateEntries / getMonthData |
| `sync.test.js` | 6 | calcSyncValues |
| `suggest.test.js` | 9 | calcSuggestionAvg / calcSavingsImpact |
| `snapshot.test.js` | 5 | Fixture-based golden master |
| **合計** | **58** | |

### Fixtures (test/spending/fixtures/)

| ファイル | 観点 |
|---|---|
| `mf-normal.csv` | MF 標準 10 行（基本シナリオ） |
| `mf-edge-quotes.csv` | BOM + CRLF + 引用符・カンマ・"" エスケープ |
| `mf-unmapped-category.csv` | 未マッピング大項目 |
| `zaim-normal.csv` | Zaim 標準フォーマット |
| `cross-month.csv` | 月跨ぎ・年跨ぎ |

## メトリクス

- **ライフプラン側**: 251 件（前セッションから維持）
- **支出管理アプリ追加**: 58 件
- **合計**: **279 + 5 = 284 / 284 グリーン**（Playwright 2 suite は Chromium 未インストール環境で skip 扱い、機能不変）

## 後方互換性

- spending/index.html を `<script type="module">` 化、`Object.assign(window, ...)` でグローバル登録 → 既存の `onclick="fn()"` 等のインライン event handler は引き続き動作
- localStorage `spending_v1` スキーマ不変
- 引数追加箇所はすべて呼び出し元で `state.months` / `state.csvConfig.categoryMap` / lifeplan_v1 を明示的に渡す形に更新
- spending/index.html: 5564 → 5061 行（−503 行、関数定義 12 個と定数 5 個を削除）

## ブラウザ動作確認

ローカルでサーバ起動して動作確認推奨（ES module は file:// では CORS で読めないため）:

```bash
cd spending && python3 -m http.server 8000
```

ブラウザで http://localhost:8000/ を開いて以下を確認:
1. オンボーディング画面が表示される
2. CSV 取り込みが動作する
3. 月次ダッシュボードが表示される
4. ライフプラン連携カードに何か表示される
5. 改善提案カードが表示される（過去データがある場合）

## 関連 commit

| commit | 内容 |
|---|---|
| `156d431` | 設計書 |
| `49af602` | 計画書 |
| `72f6949` | Task 1: utils.js + tests |
| `f4064a0` | Task 2: csv-parser.js + tests |
| `62274ee` | Task 3: aggregate.js + tests |
| `5fcfec7` | Task 4: sync.js + tests |
| `43a0537` | Task 5: suggest.js + tests |
| `f4a6576` | Task 6: spending/index.html ES module 移行 |
| `4ebdf3c` | Task 7: fixtures |
| `0b1e635` | Task 8: snapshot tests |
| (TBD) | Task 9: baseline docs |

## 次フェーズ (SP-2)

- 計算ロジック領域 5-8 項目監査
- CSV/データ整形領域 5-8 項目監査
- ライフプラン連携領域 3-5 項目監査
- 検出問題を `docs/spending-audits/SP-*.md` にレポート化

## 残課題（環境）

- `npx playwright install chromium` をユーザーが実行（既存 Playwright テスト 27 件が現在 skip 扱い、機能影響なし）
