# Phase 4k: PDF レポート機能拡張 設計書

**作成日**: 2026-04-25
**前提**: Phase 4j 完了 + UI 後追い修正、`3d1afbf`

## 目的

既存 PDF レポート（`printLifePlan()`）に、Phase 4c〜4j で追加した新フィールド・新ロジックの結果を反映させ、計算精度向上をユーザーが PDF 出力で確認・共有できるようにする。

## 現状（既存 PDF）

`index.html:6120-6372` の `printLifePlan()` が出力する内容:
- ヘッダー（プロファイル、作成日）
- 財務サマリー（総資産、月収支、配当）
- 資産一覧
- 目標一覧
- 保険一覧
- 出口戦略シミュレーション（リタイア年齢、リタイア時総資産、取り崩し方式、余命、年次推移 20 行）

**反映されていない Phase 4c-4j 項目**:
- iDeCo 受給設定（受給方法 / 開始年齢 / 期間 / 一時金比率）
- 退職所得控除 5/19 年ルール 判定結果
- 住宅ローン詳細（物件価格 / 頭金 / 子育て特例 / refi.cost / 繰上返済）
- ライフイベント（子供、介護、奨学金等）

## スコープ

### 対象（Phase 4k）

1. **出口戦略セクション拡張**: iDeCo 受給設定 + 5/19 年ルール判定の表示
2. **住宅ローン詳細セクション新設**: 物件価格 / 頭金 / 子育て特例 / 借換・繰上返済イベント
3. **ライフイベント概要セクション新設**: 子供 / 介護 / 奨学金

### 対象外（Phase 4l 以降）

- チャート画像埋め込み（html2canvas 等のライブラリ追加が必要）
- 年次キャッシュフロー全期間表示（既存は 20 年抜粋のみ）
- 多言語対応

## データソース

すべて既存 `state` から取得：
- `state.retirement.idecoReceiptMethod` / `idecoStartAge` / `idecoPensionYears` / `idecoLumpRatio`
- `state.retirement.severanceAge` / `severance`
- `state.lifeEvents.mortgage.price` / `downPayment` / `isChildCareHousehold` / `events`
- `state.lifeEvents.children` / `care` / `scholarships`

## 計算ロジック（PDF 表示用）

### 出口戦略の iDeCo 受給設定行

```
受給方法: 一時金 / 年金 / 併用
受給開始年齢: 60-75 歳
年金受給期間: 5/10/15/20 年（年金/併用のみ表示）
一時金比率: 0-100%（併用のみ表示）
```

### 5/19 年ルール 判定行

```
退職金受取年齢: ${severanceAge}
iDeCo 受給開始年齢: ${idecoStartAge}
年差: ${gap}（退職金先 / iDeCo 先 / 同年）
適用ルール: 別枠（19年ルール）/ 別枠（5年ルール）/ 合算（既定）
```

### 住宅ローン詳細

```
物件価格 / 頭金 / 借入額（mortgage.price / downPayment / amount）
子育て特例: 適用あり（令和X年入居） / 適用なし
借換・繰上返済イベント: events[] 一覧（年・種別・金額・諸費用）
```

### ライフイベント概要

```
子供: ${count} 人（出生年: ${birthYears}）
介護: ${startYear}-${endYear}, 月 ${monthlyFee} 万円
奨学金: ${count} 件, 合計返済額 ${total} 万円
```

## UI/HTML

`printLifePlan()` 内の HTML テンプレートを拡張：
1. 既存の `retSection` HTML に iDeCo + 5/19 年ルール表示行を追加
2. 新セクション `mortgageSection` を追加（assetsHtml の後、retSection の前）
3. 新セクション `lifeEventsSection` を追加（mortgageSection の後）

## 後方互換

- 新セクションは該当データがあるときのみ表示（empty なら省略）
- 既存出力に破壊的変更なし

## テスト戦略

PDF 出力は手動テストのみ（自動化困難）。確認項目：
1. iDeCo 受給設定が一時金/年金/併用で正しく表示
2. 5/19 年ルール判定が正しく表示
3. 住宅ローン詳細が物件価格・頭金あり/なしで正しく表示
4. 子供・介護・奨学金が空のときセクション省略

`npm test` は変更なし（PDF は test 範囲外）。

## commit 構成

1. `feat(phase4k): expand PDF report with iDeCo / 5-19 rule / mortgage / life events`

合計 **1-2 commits**。

## 完了条件

- [ ] PDF 出口戦略に iDeCo 受給設定行追加
- [ ] PDF に 5/19 年ルール判定行追加
- [ ] PDF に住宅ローン詳細セクション追加
- [ ] PDF にライフイベント概要セクション追加
- [ ] 既存 213/213 テスト維持
- [ ] ブラウザで PDF 出力 → 手動確認

## Phase 4l 以降

- チャート画像埋め込み（複数キャプチャライブラリ追加）
- 年次キャッシュフロー全期間表示（ページ分割）
- シナリオ共有 URL（state 圧縮 + base64 hash）
- 2026 税制改正対応
