# Phase 4c 修正の期待方向と実測

Important 8 件を 6 グループに分けて修正した記録。
実施順序: G10-quick → G7 → G9b → G10-refi → G10-housing → G10-scenario
（計算のみ・バグ修正 → UI 拡張へ段階的に進行）。

---

## Group 10-quick: 住宅ローン計算バグ修正（05-I05, 05-I06）

### 期待方向
- **05-I05**: `principal × r ≥ monthly` で `newN` が `NaN` / `Infinity` になる場合、即完済扱い（`principal = 0, endYear = year`）にフォールバック。
- **05-I06**: 同年に `refi` と `prepay` が混在する場合、常に `refi → prepay` の順で処理する（既存の `sort((a,b)=>a.year-b.year)` は年のみでソートし同年内順不定）。

### 想定される snapshot 差分
既存 5 シナリオのうち、NaN 発症条件（極端に低い monthly）や同年 refi+prepay を持つサンプルは皆無のため **snapshot 差分なし**。リグレッションテスト（test/regression.test.js）で挙動を固定する。

### 実測サマリー
- snapshot 差分: **なし**（既存 5 シナリオに該当条件のイベント未登録）
- regression.test.js に BUG#2/#3 を追加して挙動固定
- テスト: 157/157 グリーン（155 + 新規 2）
- 実コミット: c196760

---

## Group 7: income_change 昇給継続フラグ（02-I03）

### 期待方向
- `cashFlowEvents[{type:'income_change'}]` に `continueGrowth: boolean` フィールドを追加（既定 `false`）。
- `continueGrowth === true` のとき、イベント年を起点に `× pow(1 + growthRate, yr − eventYear)` を適用。`incomeGrowthUntilAge` 超過年は昇給停止。
- 既存サンプル 5 シナリオはすべて `continueGrowth` 未指定 → `false` 扱い → 従来挙動を維持 → snapshot 差分なし。
- UI: cashFlowEvent 編集モーダルに「転職・昇給後も昇給率を継続する」チェックボックスを追加。

### 実測サマリー
- snapshot 差分: **なし**（既存 5 サンプルは `continueGrowth` 未指定）
- UI: index.html の `renderCFETypeFields` / `saveCFEvent` に continueGrowth 取り扱いを追加
- テスト: 160/160 グリーン（157 + 新規 BUG#4 3 件）
- 実コミット: 424b271

---

## Group 9b: calcTakeHome 配偶者控除本実装（06-I02）

### 期待方向
- `calcSpouseDeduction(partnerAnnualIncomeMan, partnerAge)` を `calc/income-expense.js` に新設。軸1（パートナー所得逓減）+ 軸3（70歳以上老人加算）。
- `calcTakeHome` (index.html) で課税所得から所得税分を減算、住民税は別途逓減控除を適用。
- `calc/integrated.js` L66-71/L98-100 の Phase 4b 近似 `annualIncome *= 1.005` を削除。
- snapshot 影響: `_inputMode === 'gross'` AND `partnerAnnualIncome ≤ 103` のシナリオでのみ `annualIncome` 値が +0.5% 補正分だけ減る方向。サンプル B/D（net モード）は不変。
- 既存 5 サンプルが該当条件を持たなければ snapshot 差分なし。持つ場合は退職前資産が微減方向。

### 実測サマリー
- snapshot 差分: **なし**（既存 5 サンプルに gross モード + partnerAnnualIncome ≤ 103 の組み合わせなし）
- `calcSpouseDeduction` 新設（calc/income-expense.js 末尾）
- `calcTakeHome` (index.html L16072+) に配偶者控除統合 — gross モードでパートナー低所得時に税額減
- Phase 4b 近似削除: `calc/integrated.js` L66-71 + L98-100
- テスト: 168/168 グリーン（160 + BUG#5 8 件）
- 実コミット: ee6e24e

---

## Group 10-refi: 借換諸費用（05-I04）

### 期待方向
- `events[{type:'refi'}]` に `cost` フィールド追加（万円、既定 0）。
- `calcMortgageSchedule` の戻り値 `schedule.get(yr)` に `refiCost` を含める。
- `calc/life-events.js` の住居費集計（L169-181 付近）で `costs.mortgage += scheduleEntry.refiCost` を加算（繰上有無・一括返済の各分岐に共通適用）。
- 既存サンプル 5 シナリオに `refi` イベントがなければ snapshot 差分なし。
- UI: refi 編集フォームに「諸費用（万円）」入力欄を追加。

### 実測サマリー
- snapshot 差分: なし（既存 5 シナリオに refi イベント未登録）
- `calcMortgageSchedule` 戻り値に `refiCost` 追加
- `calc/life-events.js` で refiCost を住居費に加算
- UI: refi 編集フォームに「諸費用（万円）」欄追加（addMortgageEvent / editMortgageEvent / saveMortgageEvent / updateMortgageEvent 対応）
- テスト: 171/171 グリーン（168 + BUG#6 3 件）
- 実コミット: 23b155c

---

## Group 10-housing: 子育て特例＋頭金（05-I01, 05-I02）

### 期待方向
**05-I01 子育て特例:**
- `state.lifeEvents.mortgage.isChildCareHousehold: boolean`（既定 false）追加。
- `mortgage.startYear` が 2024 または 2025 のときに限り有効。
- general 以外の `HOUSING_TYPES` の limit に +500 万を加算。
- 既存サンプルに 2024/2025 startYear で isChildCareHousehold=true のデータなし → snapshot 変化なし。

**05-I02 頭金:**
- `mortgage.price`（物件価格、万円）、`mortgage.downPayment`（頭金、万円）フィールド追加。
- 保存時に `syncDownPaymentExpense` で `expenses[]` に `source: 'mortgage-downpayment'` のエントリを追加 / 上書き / 削除。
- 既存サンプルに price/downPayment 未指定 → 自動追記なし → snapshot 変化なし。

**Note**: 仕様書では `mortgage.purchaseYear` と書かれていたが、コードベースの既存規約に合わせて `mortgage.startYear` を使用する（同一の意味、購入年＝借入開始年）。

### 実測サマリー
- snapshot 差分: なし（既存 5 サンプルに price/downPayment/isChildCareHousehold 未指定）
- UI: 住居パネルに「物件価格」「頭金」入力 + 子育て特例チェックボックス追加
- `syncDownPaymentExpense` 追加で頭金 expenses エントリを source タグ付きで管理
- テスト: 179/179 グリーン（171 + BUG#7 4 件 + BUG#8 4 件）
- 実コミット: 1b1726f

---

## Group 10-scenario: シナリオ連動（05-I03）

### 期待方向
- `state.lifeScenario.housing.scenarios[]` の各カードに「このシナリオをメインプランに適用」ボタン追加。
- クリック時:
  1. confirm ダイアログ
  2. type に応じて `state.lifeEvents.housingType` / `mortgage` / `rent` を上書き
  3. `syncDownPaymentExpense` で頭金 expenses エントリを整合
  4. save() + 再描画
- 既存 `state.lifeEvents.mortgage.events[]`（refi/prepay）はスプレッド演算子で保持。
- snapshot 対象外（UI 操作のみ）。動作確認はブラウザで手動。

### 実測サマリー
- snapshot 差分: **なし**（UI 操作のみ、snapshot 対象外）
- UI: housing scenario カードに「メインプランに適用」ボタン追加
- `applyHousingScenarioToPlan(idx)`: 確認ダイアログ → type 別 housingType/mortgage/rent 転記 → 頭金 expenses 再生成 → save → 再描画
- type 'rent' のときは持ち家頭金 expenses を削除する（housingType 切替整合）
- テスト: 179/179 グリーン維持
- 実コミット: 9034d3f

---

## 完了総括（2026-04-25）

### 達成事項

- **6 グループ・8 Important 解決**:
  - G10-quick (2件): 05-I05, 05-I06 — `c196760`
  - G7 (1件): 02-I03 — `424b271`
  - G9b (1件): 06-I02 — `ee6e24e`
  - G10-refi (1件): 05-I04 — `23b155c`
  - G10-housing (2件): 05-I01, 05-I02 — `1b1726f`
  - G10-scenario (1件): 05-I03 — `9034d3f`
- **テスト**: 179/179 グリーン（Phase 4b 末 155 → +20 件のリグレッションテスト 2/3/8/3/4/4 = 24 件追加 → ※実数 179 = baseline 155 + 各タスク追加分の合計、内訳は Group 期待方向に記録）
- **コミット構成**: setup 1 + fix 6 + SHA record 6 + 中間 test fix 1 + 最終 docs 1 = 計 15 コミット

### 実測インパクト（5 シナリオ合計）

- **G10-quick**: snapshot 差分なし、リグレッションテストで挙動固定（無限ループ防止）
- **G7**: snapshot 差分なし、後方互換のみ（既存サンプルは continueGrowth 未指定）
- **G9b**: snapshot 差分なし（既存サンプルが gross+lowPartner 条件を満たさず Phase 4b 近似が元々無効）
- **G10-refi**: snapshot 差分なし（既存サンプルに refi イベントなし）
- **G10-housing**: snapshot 差分なし（既存サンプルに新フィールド未指定）
- **G10-scenario**: snapshot 対象外（UI 操作のみ）

### Phase 4c 完了で残存する Important

- **なし**（Phase 2 監査で検出された Important 43 件すべて解決状態）

### Phase 4d 以降への橋渡し

- **iDeCo 受給方法 UI**: 一時金 / 年金 / 併用 × 受給年齢 60-75 歳選択（Phase 4a `07-I04`/`08-I02` の発展）
- **06-I02 軸2**: 本人高所得者逓減（合計所得 900/950/1000 万円ライン）
- **Minor 項目 63 件の選別修正**: 出典コメント更新、境界値、UI helper 拡充
- **新規 UI 機能候補**: PDF 出力、シナリオ共有 URL など

### 補足

- Phase 4c の最終 commit `docs(phase4c): mark Importants resolved and update walkthrough` で Phase 2 監査レポート 3 ファイルへの Resolved 注記、サニティウォークスルーの Phase 4c 評価追記、本ファイルの 完了総括 を反映。
