# Phase 4c: UI 変更を含む Important 修正 設計書

**作成日**: 2026-04-25
**前提**: Phase 4b 完了（Important 18 件解決、`24f52f3`）

## 目的

Phase 2 監査で検出された Important のうち、UI 変更を含む 8 件を修正する。Phase 4c 完了時点で監査検出 Important 43 件中 40 件が解決状態となる。

## スコープ

### 対象 Important（8 件）

| ID | 監査ファイル | 概要 | 修正種別 |
|---|---|---|---|
| 02-I03 | `02-income-expense.md` | `cashFlowEvents.income_change` 適用時に本人の昇給モデルが完全停止 | UI+計算 |
| 05-I01 | `05-mortgage.md` | 子育て世帯・若者夫婦世帯の借入限度額上乗せ措置（令和 6・7 年）未対応 | UI+計算 |
| 05-I02 | `05-mortgage.md` | 頭金の計上導線がなく購入当年の一時支出が抜ける | UI+計算 |
| 05-I03 | `05-mortgage.md` | シナリオ比較の決定がメインシミュレーションに連動しない | UI |
| 05-I04 | `05-mortgage.md` | 借換え `refi` が諸費用を計上しない | UI+計算 |
| 05-I05 | `05-mortgage.md` | 繰上返済で利息 ≥ 月額のケースに NaN 伝播バグ | 計算のみ |
| 05-I06 | `05-mortgage.md` | `events[]` 同年複数イベントの順序依存 | 計算のみ |
| 06-I02 | `06-partner-retirement.md` | 配偶者控除・配偶者特別控除を `calcTakeHome` 本体へ本実装（Phase 4b は支出側近似） | 計算のみ |

### 対象外

- **iDeCo 受給方法 UI**（一時金 / 年金 / 併用 × 受給年齢 60-75 歳）: 優先度低。Phase 4d 以降で検討。
- **06-I02 軸2（本人高所得者逓減、900/950/1000 万円）**: 影響ユーザー限定的。Phase 4d 以降で検討。
- **Minor 項目 63 件**: 別軸タスク。

## グループ構成

実装は 6 グループに分割。計算のみ・バグ修正を先行、UI 変更を後回しにする。

| 順序 | グループ | Important | 主要ファイル |
|---|---|---|---|
| 1 | G10-quick | 05-I05, 05-I06 | `calc/mortgage.js` |
| 2 | G7 | 02-I03 | `calc/income-expense.js`, `index.html` |
| 3 | G9b | 06-I02 | `calc/income-expense.js` or `calc/utils.js`, `calc/retirement.js`（近似削除） |
| 4 | G10-refi | 05-I04 | `calc/mortgage.js`, `index.html` |
| 5 | G10-housing | 05-I01, 05-I02 | `calc/mortgage.js`, `index.html` |
| 6 | G10-scenario | 05-I03 | `index.html` のみ |

## 各グループの設計

### G10-quick（05-I05 + 05-I06）

**05-I05 NaN 伝播**
- 場所: `calc/mortgage.js` の繰上返済スケジュール再計算（`newN = log(M / (M − P × r)) / log(1 + r)`）
- 修正: `newN` が `NaN` または `Infinity` の場合、即完済扱い（`principal = 0, endYear = year`）にフォールバック。
- 発症条件: `principal × r ≥ monthly` のとき（借換えで月額を極端に下げたケースなど）。

**05-I06 同年複数イベント順序**
- 場所: `calc/mortgage.js` の `events[]` 処理ループ
- 修正: 同年に複数イベントがある場合、`refi → prepay` の順で安定ソートしてから処理。
- 理由: 借換えで金利・期間が変わった後に繰上返済を当てるのが実務順。

### G7（02-I03 income_change 昇給継続）

**データ構造追加**
- `cashFlowEvents[{type:'income_change'}]` に `continueGrowth: boolean` フィールド追加。
- 既定値: `false`（後方互換、従来挙動を維持）。

**計算ロジック**
- 場所: `calc/income-expense.js` の `getIncomeForYearWithGrowth`（L143 付近）
- 修正: `hasOverride && continueGrowth` のとき、`baseIncome × pow(1+g, yr−eventYear)` を適用。
  - `g = state.finance.incomeGrowthRate / 100`
  - `incomeGrowthUntilAge` 超過年は従来通り昇給停止。

**UI 変更**
- cashFlowEvent 編集モーダル（`index.html`、`type: income_change` のエントリ編集箇所）にチェックボックス「転職・昇給後も昇給率を継続する」を追加。
- helper テキスト: 「チェックなし = イベント額が以後の年収として固定 / あり = イベント額を起点に昇給率が継続」。

### G9b（06-I02 `calcTakeHome` 本実装）

**新規ヘルパ**
- `calcSpouseDeduction(partnerIncome, partnerAge)` を `calc/income-expense.js` または `calc/utils.js` に新設。
- 返り値: `{ incomeTaxDeduction: 万円, residentTaxDeduction: 万円 }`
- 軸1（パートナー合計所得による逓減）:
  - ≤ 48 万: 所得税 38 / 住民税 33
  - 48 ≤ x ≤ 95: 38 / 33（配偶者特別控除 満額）
  - 95 < x ≤ 100: 36 / 33
  - 100 < x ≤ 105: 31 / 31
  - 105 < x ≤ 110: 26 / 26
  - 110 < x ≤ 115: 21 / 21
  - 115 < x ≤ 120: 16 / 16
  - 120 < x ≤ 125: 11 / 11
  - 125 < x ≤ 130: 6 / 6
  - 130 < x ≤ 133: 3 / 3
  - \> 133 万: 0 / 0
- 軸3（老人配偶者加算）: `partnerAge >= 70` かつパートナー合計所得 ≤ 48 万 のとき 所得税 +10（38→48）/ 住民税 +5（33→38）。

**`calcTakeHome` 統合**
- `calcTakeHome` 内の課税所得計算で `taxableIncome -= spouseDeduction.incomeTaxDeduction` 等を適用。
- `partnerAge` は評価対象年（`calcTakeHome` が受け取る `year` 引数、あるいは年次ループの現在年）と `state.profile.partnerBirth` から算出: `partnerAge = year − partnerBirthYear`（年の途中判定は簡略化して年始時点）。`calcIntegratedSim` から年次ループ内で呼ばれる場合は year-indexed に、UI 試算ボタンから呼ばれる場合は「現時点」で評価する。

**Phase 4b 近似の削除**
- `calc/retirement.js` で Phase 4b に追加した「リタイア期の世帯支出側で逓減控除を減じる」近似ブロックを削除。
- 重複計上を防ぐため、`calcTakeHome` が一本化した正とする。

### G10-refi（05-I04 借換諸費用）

**データ構造追加**
- `events[{type:'refi'}]` に `cost: number`（万円、既定 0）を追加。

**計算ロジック**
- 場所: `calc/mortgage.js` の refi 処理
- 修正: refi 年に `costs.mortgage += refi.cost`（`costs.mortgage` は `calcMortgageSchedule` 出力の年次 map）。

**UI 変更**
- refi イベント編集欄に「諸費用（万円）」入力欄を追加。
- helper テキスト: 「保証料戻し・事務手数料・登記費用の合計。30〜80 万円が相場。」

### G10-housing（05-I01 + 05-I02）

**05-I01 子育て特例**

- データ: `state.lifeEvents.mortgage.isChildCareHousehold: boolean`（既定 `false`）
- 有効条件: `mortgage.purchaseYear` が 2024 または 2025（令和 6・7 年入居）
- 計算: `calcMortgageDeduction` 内で上乗せ +500 万円を各 `HOUSING_TYPES` の limit に加算。
  - `general`: 対象外（制度外）
  - `long_term`, `low_carbon`: 5000 → 5500
  - `zeh`: 4500 → 5000
  - `energy_saving`: 4000 → 4500
- UI: 住居パネルにチェックボックス「子育て世帯・若者夫婦世帯（令和 6・7 年入居特例）」。

**05-I02 頭金**

- データ追加: `state.lifeEvents.mortgage.price`（物件価格、万円）、`state.lifeEvents.mortgage.downPayment`（頭金、万円）
- 既存 `mortgage.amount`（借入額）は維持（= `price − downPayment`、ただし入力は独立）。
- UI: 住居パネルに「物件価格（万円）」「頭金（万円）」入力欄を追加。
- `expenses[]` 自動追記:
  - 保存時に `{ source: 'mortgage-downpayment', name: '住宅購入頭金', year: purchaseYear, amount: downPayment }` を追記。
  - 同一 source + year のエントリが既にあれば `amount` を上書き（in-place update）。
  - 頭金 0 または未指定の場合は追記しない。既存エントリがあれば削除。

### G10-scenario（05-I03 シナリオ連動）

- UI: scenarioComp パネルの各シナリオカードに「このシナリオをメインプランに適用」ボタンを追加。
- クリック時の挙動:
  1. 確認ダイアログ「現在の住居計画（購入年・物件価格・頭金・金利・期間）が上書きされます。続行しますか？」
  2. OK で `state.lifeEvents.mortgage` に scenario のフィールドを転記（`purchaseYear`, `price`, `downPayment`, `loanRate`, `loanYears`, `housingType`）。
  3. 既存 `events[]`（refi/prepay）は保持（scenario 側に同等フィールドはないため）。
  4. 頭金 `expenses[]` エントリを G10-housing と同じロジックで再生成。
- 実装場所: `index.html` の `scenarioComp` レンダリング/保存ロジック。`state.lifeEvents.mortgage` への書き戻し関数を追加（例 `applyScenarioToPlan(scenarioIndex)`）。

## テスト戦略

- 各グループ完了時に `npm test` で 155/155 を維持確認。
- snapshot 差分は `test:update` で更新し、`expected-changes.md` に差分要約を記録。
- 新規追加フィールドはすべて optional + 安全な既定値を持つため、既存サンプル 5 シナリオは未指定のまま従来挙動を維持。
- **snapshot 変化予測**:
  - G10-quick: 変化なし（該当条件のサンプルなし）
  - G7: 変化なし（既存 `income_change` は `continueGrowth: undefined` で従来挙動）
  - G9b: **大きく変化する可能性あり**（現役期の手取りに配偶者控除が効く → パートナー低所得シナリオで手取り増）
  - G10-refi: 変化なし（既存 refi に `cost` 未指定で 0）
  - G10-housing: 変化なし（`isChildCareHousehold: undefined`、`price`/`downPayment: undefined`）
  - G10-scenario: snapshot 対象外（UI 操作のみ）

## 後方互換

- 既存 `lifeplan_v1` localStorage データは破壊的変更なし。新フィールド未指定で従来挙動を継続。
- Phase 4b の支出側配偶者控除近似は G9b で削除されるため、Phase 4b で効いていた近似控除が消える分、リタイア期の世帯支出が元に戻る。代わりに現役期〜リタイア期を通じて `calcTakeHome` の本実装控除が効くため、総合精度は Phase 4b よりも向上。

## エラーハンドリング

- `calcMortgageDeduction` で `mortgage.purchaseYear` が未定義 or 2024/2025 外のとき `isChildCareHousehold` は無視（既存挙動と同等）。
- 頭金 `expenses[]` の重複チェック: `source === 'mortgage-downpayment'` かつ同じ `year` のエントリは in-place update。
- シナリオ適用（05-I03）で `state.lifeEvents.mortgage` が null/undefined の場合は新規オブジェクトを作成。
- `calcSpouseDeduction` に渡す `partnerAge` が NaN/undefined の場合は軸3（老人加算）を無効化。

## commit 構成

Phase 4b と同パターン:

1. `chore(phase4c): scaffold expected-changes tracking`（setup）
2. `fix(phase4c): mortgage prepayment NaN guard and same-year event order (05-I05/I06)`
3. `docs(phase4c): record Group 10-quick actual SHA`
4. `fix(phase4c): income_change continueGrowth flag (02-I03)`
5. `docs(phase4c): record Group 7 actual SHA`
6. `fix(phase4c): calcTakeHome 配偶者控除 proper implementation (06-I02)`
7. `docs(phase4c): record Group 9b actual SHA`
8. `fix(phase4c): refi cost field (05-I04)`
9. `docs(phase4c): record Group 10-refi actual SHA`
10. `fix(phase4c): childcare household uplift and downpayment field (05-I01/I02)`
11. `docs(phase4c): record Group 10-housing actual SHA`
12. `fix(phase4c): apply scenario to main plan (05-I03)`
13. `docs(phase4c): record Group 10-scenario actual SHA`
14. `docs(phase4c): mark Importants resolved and update walkthrough`

合計 **14 コミット**（Phase 4b と同規模）。

## 完了条件

- [ ] 6 グループ × 8 Important すべて実装済み
- [ ] 155/155 テストグリーン
- [ ] `docs/phase4c-fixes/expected-changes.md` に 6 グループの方向・実測記録
- [ ] 監査ファイル 3 つ（`02-income-expense.md`、`05-mortgage.md`、`06-partner-retirement.md`）に Resolved 注記追加
- [ ] `docs/phase2-audits/sanity-walkthrough-シナリオB.md` に Phase 4c 再評価セクション追記

## Phase 4d 以降への橋渡し

Phase 4c 完了時点で監査検出 Important はすべて解決。以降の候補:

- iDeCo 受給方法 UI（一時金 / 年金 / 併用 × 受給年齢 60-75 歳）
- 06-I02 軸2（本人高所得者逓減、900/950/1000 万円ライン）
- Minor 項目 63 件の選別修正
- 新規 UI 機能（PDF 出力、シナリオ共有 URL など）
