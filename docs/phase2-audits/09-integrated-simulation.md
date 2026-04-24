# 監査レポート：統合キャッシュフローシミュレーション（ⓐ）

- **対象領域**: ⓐ 現役期統合シミュレーション — `calcIntegratedSim(years, opts)` が `calcAllAssetGrowth` / `getIncomeForYearWithGrowth` / `getExpenseForYear` / `getOneTimeForYear` / `calcLECostByYear` / `calcMortgageDeduction` を組み合わせ、現金プール / 投資プール / 年次キャッシュフロー / 清算履歴を返す統合ハブ関数。
- **監査日**: 2026-04-24
- **信頼度判定**: ❌ 要対応

## 対象範囲

- `calcIntegratedSim(years, opts)` (`index.html:14225-14340`) — 本関数本体（116 行）
  - 二プール分類 `_CASH_T` / `_cashGD` / `_investGD` (`index.html:14234-14236`)
  - 加重平均投資リターン `_wInvestReturn` (`index.html:14238-14246`)
  - 累積清算額 `_investDeficit` と機会損失複利 (`index.html:14248, 14302`)
  - 配当受取（cashout）抽出 `cashoutAssets` (`index.html:14252-14254`)
  - 年次ループ (`index.html:14256-14337`)
  - キャッシュフロー累積式 (`index.html:14293-14295`)
  - 仮想現金プール＋清算ロジック (`index.html:14305-14315`)
  - 返却フィールド 15 種 (`index.html:14320-14336`)
- 依存関数:
  - `calcAllAssetGrowth(assets, years)` (`index.html:8810`) — NISA 2 パス + `_wastedContribsByYear` (`index.html:8999`)
  - `getIncomeForYearWithGrowth(yr)` (`index.html:17097-17172`)
  - `getExpenseForYear(yr)` (`index.html:6755-6779`) — ★B 方式: アセット積立を支出側から差し引く
  - `getOneTimeForYear(yr)` (`index.html:6800-6818`) — cashFlowEvents + `state.expenses[]` + `getRecurringExpenseForYear`
  - `calcLECostByYear(year, opts)` (`index.html:13011`)
  - `calcMortgageDeduction(year, balance)` (`index.html:17224-17231`)
- 呼び出し元: `renderScenarioOverview` / `renderAssetChart` / `runIntegratedSim` 等 UI 側（`index.html` 全域）。Phase 1 スナップショット `test/scenario-snapshot.test.js` のテスト対象最重要関数。

## 1. 関数の目的と入出力

### 目的

**現役期（退職前）** の年次家計シミュレーションを返すハブ関数。収入・支出・ライフイベント・一時収支・配当受取・住宅ローン控除を年次で積算し、資産を「現金プール」「投資プール」の二つに分けて可視化する。現金プールが年末でマイナスになると自動で投資プールから清算して補填し、清算額には翌年以降「機会損失複利（`_wInvestReturn`）」が乗る。

### 入力

- 引数: `years` (数値, 既定 `state.finance?.simYears || 20`)、`opts` (LE 除外フラグ `noChild/noLoan/noCare/noScholarship` 等)
- 依存する `state`: `state.assets[]`, `state.finance`（`income, bonus, expense, inflationRate, incomeGrowthRate, incomeGrowthUntilAge, partnerIncome, ...`), `state.lifeEvents`（`children / mortgage / rent / care / scholarships / housingType`）, `state.profile.birth`, `state.retirement`（`targetAge`, `type`, `semiMonthlyIncome` など）、`state.cashFlowEvents[]`, `state.expenses[]`, `state.recurringExpenses[]`

### 戻り値

`Array` 長さ `years + 1`（`y=0` は現在、`y=1..years` は将来）。各要素は以下 15 フィールド（万円、四捨五入済み）:

| フィールド | 意味 |
|---|---|
| `year` | 暦年（`currentYear + y`） |
| `annualIncome` | 本人 + パートナーの年収（昇給・リタイア反映） |
| `annualExpense` | 生活費 `×12` + アセット月積立・ボーナスの年額（B 方式） |
| `leCost` | `childcare + education + mortgage + care + scholarship` 合算 |
| `oneTime` | 一時収支（cashFlowEvents / expenses / recurringExpenses の net） |
| `dividendCashout` | 配当受取モードのアセットの税引後配当（特定・一般は 20.315% 控除）|
| `mortgageDeduct` | 住宅ローン控除 `min(balance × 0.007, 31.5)` |
| `cashFlow` | **清算調整後** の累積キャッシュフロー |
| `liquidation` | その年の投資清算額 |
| `cashAssetBase` | 現金系アセットの年末残高（成長後・清算前） |
| `investAssetBase` | 投資系アセットの年末残高（成長後・清算前） |
| `cashPool` | `max(0, cashAssetBase + cashFlow)` |
| `investPool` | `max(0, investAssetBase - _investDeficit)` |
| `assetTotal` / `totalWealth` | `cashPool + investPool`（同一値） |

加えて `result._liquidationEvents` に清算発生年の配列が付く。

## 2. 使用している計算式

### 2.1 年次キャッシュフロー累積式（`index.html:14293-14295`）

```js
const cashFlow = y === 0
  ? 0
  : result[y-1].cashFlow + annualIncome - annualExpense - totalLE + oneTime
                         + annualDividendCashout + annualMortgageDeduct + wastedContribs;
```

- `y=0` はスタート地点で**年次流入**をゼロ扱いにする（`currentVal` に今年支払い済み分が含まれている前提で二重計上を防ぐコメント `index.html:14288-14289`）。
- `wastedContribs` は NISA 枠超過で実際に投資されなかった積立額を**支出側で差し引かれていた分**の補正として加算（`index.html:14290-14291`）。

### 2.2 プール合算と清算（`index.html:14298-14318`）

```js
const cashAssetBase   = _cashGD.reduce((s, g) => s + (g.data[y] || 0), 0);
const investAssetBase = _investGD.reduce((s, g) => s + (g.data[y] || 0), 0);
if (y > 0) _investDeficit *= (1 + _wInvestReturn);
const virtualCash = cashAssetBase + cashFlow;
let liquidationThisYear = 0;
let adjustedCashFlow = cashFlow;
if (y > 0 && virtualCash < 0) {
  liquidationThisYear = -virtualCash;
  _investDeficit += liquidationThisYear;
  adjustedCashFlow = cashFlow + liquidationThisYear;
  _liquidationEvents.push({ y, yr, amount: Math.round(liquidationThisYear) });
}
const cashPool   = Math.max(0, cashAssetBase + adjustedCashFlow);
const investPool = Math.max(0, investAssetBase - _investDeficit);
```

### 2.3 配当受取キャッシュフロー（`index.html:14264-14273`）

```js
const DIV_TAX_RATE = 0.20315;
const annualDividendCashout = y === 0 ? 0 : cashoutAssets.reduce((s, a) => {
  const gd = growthData.find(g => g.asset.id === a.id);
  const prevVal = gd ? (gd.data[y - 1] || 0) : 0;
  const grossDiv = prevVal * (a.dividendYield / 100);
  const isTaxable = (a.taxType === 'tokutei' || a.taxType === 'ippan');
  const netDiv = isTaxable ? grossDiv * (1 - DIV_TAX_RATE) : grossDiv;
  return s + netDiv;
}, 0);
```

- 前年末残高 `prevVal` に `dividendYield` を乗算 → 特定・一般のみ 20.315% 控除（NISA/iDeCo は全額） → `cashFlow` に加算。

### 2.4 住宅ローン控除（`index.html:14276-14285`）

```js
const mortgageBalanceInteg = (() => {
  const m = state.lifeEvents?.mortgage || {};
  const principal = parseFloat(m.amount) || 0;
  const startYr = parseInt(m.startYear) || currentYear;
  const term = parseInt(m.term) || 35;
  const elapsed = yr - startYr;
  if (elapsed < 0 || elapsed >= term || !principal) return 0;
  return principal * (1 - elapsed / term);    // ← 線形近似
})();
const annualMortgageDeduct = y === 0 ? 0 : calcMortgageDeduction(yr, mortgageBalanceInteg);
```

- **残高は線形近似** `principal × (1 − elapsed/term)`。Task 6 `05-C03`（元利均等との差 +5〜10%）がここで本番発現する。
- 控除は `min(balance × 0.007, 31.5)` で `cashFlow` に**加算**（税還付はキャッシュフロー流入扱い）。

### 2.5 キャッシュフロー恒等式（監査の核）

各年次の資産変化は以下で近似される:

```
Δ totalWealth[y]
  ≈ (annualIncome[y] − annualExpense[y] − leCost[y] + oneTime[y]
      + dividendCashout[y] + mortgageDeduct[y] + wastedContribs[y])
    + ΔcashAssetBase[y] + ΔinvestAssetBase[y]
    − (_investDeficit[y] − _investDeficit[y-1])
```

投資プールの毎年の成長は `ΔinvestAssetBase` に包含（`_investGD[i].data[y]` 自体が複利成長済みの残高）、現金プールの利子（ごく僅か）は `ΔcashAssetBase` に包含される。

### 2.6 恒等式の数値検算（シナリオ A 田中葵 26 歳独身）

スナップショット `test/__snapshots__/scenario-snapshot.test.js.snap:3-122` から実数値を取り出し、恒等式が 1 万円以内で成り立つかを検算:

| 移行 | Δ total | flow 項（income−exp−le+oneTime+div+mortDeduct）| Δ cashBase | Δ investBase | 合計 | 誤差 |
|---|---:|---:|---:|---:|---:|---:|
| 2026→2027 | +3 | 323−192−120+(−35)+0+0 = **−24** | 92−80 = +12 | 49−35 = +14 | **+2** | +1 |
| 2027→2028 | +32 | 333−192−136+0+0+0 = **+5** | 104−92 = +12 | 63−49 = +14 | **+31** | +1 |
| 2028→2029 | +15 | 300−192−121+0+0+0 = **−13** | 116−104 = +12 | 78−63 = +15 | **+14** | +1 |
| 2029→2030 | +105 | 406−192−137+0+0+0 = **+77** | 128−116 = +12 | 94−78 = +16 | **+105** | 0 |
| 2030→2031 | +121 | 406−192−122+0+0+0 = **+92** | 141−128 = +13 | 111−94 = +17 | **+122** | +1 |

- **結果**: 恒等式は**成立**（誤差 ±1 万円、`Math.round` による各フィールドの四捨五入起因）。
- シナリオ A は清算ゼロ（`liquidation: 0`）、`_investDeficit = 0` の期間なので第 3 項は不要。**清算が発生した場合の検算は本レポート 6 章 `09-I02` で別途扱う**。
- `wastedContribs` は本スナップショットでは顕在化しない（NISA 上限未到達かつ目標達成なし）ため項にゼロを仮定。

### 2.7 cashFlow の「清算調整済み」性質（混乱しやすい仕様）

戻り値 `cashFlow` は `adjustedCashFlow = cashFlow + liquidationThisYear` で**清算分を足し戻した値**（`index.html:14313, 14322`）。したがって清算が起きた年でも `cashFlow >= -cashAssetBase`（`cashPool >= 0` になる最小値）に圧縮される。**素のキャッシュフローを得るには `cashFlow − liquidation` を自前で計算する必要がある**。

## 3. 標準との突合

### 3.1 キャッシュフロー表の基本構造（FP 教科書）

- **日本 FP 協会『ファイナンシャル・プランナーのためのキャッシュフロー表作成の手引き』**（<https://www.jafp.or.jp/personal_finance/know/lifeplan/cashflow/>）では、キャッシュフロー表は「収入 − 支出 = 年間収支」「前年末貯蓄残高 ×（1 + 運用利率）＋ 年間収支 = 当年末貯蓄残高」を年次で積上げる。
- **金融庁『つみたて NISA Meetup 資料 — 人生設計とお金』**（<https://www.fsa.go.jp/policy/nisa2/>）のワークシートも同構造（収入・支出・貯蓄残高の 3 行レイアウト）。
- **本コード**: 収支 (`annualIncome − annualExpense − leCost + oneTime + ...`) を `cashFlow` として**累積**し、**アセット残高は別軸で成長**させ、合算時に「仮想現金プール」がマイナスなら投資を清算する。FP 教科書の「貯蓄残高 ×（1 + 運用利率）＋ 収支」をプール分割で置き換えた変形。**構造的に等価**だが、以下の差異あり:
  - **運用益は `cashFlow` に明示されない**（資産残高の増分として暗黙に入る）。FP 表の「運用益行」が独立項目として出ない。
  - **支出からアセット積立を引く「B 方式」** (`getExpenseForYear` `index.html:6769-6776`) は、FP 教科書の「貯蓄額 = 収入 − 支出」と分離する方式とは異なる。本コードでは **積立額は支出に含め、資産成長で戻す**二重会計構造。結果は同じだが、`annualExpense` の値が「生活費＋投資積立」を含むため、**UI 上「年間支出」ラベルをそのまま表示するとユーザーが誤解するリスク**（`09-M01`）。
- **判定**: ✅ 構造は FP 教科書と整合、⚠️ 「運用益を表示項目に持たない」「annualExpense に積立が含まれる」の UI 表示面は要注意。

### 3.2 税引後キャッシュフロー

- **FP 実務**: 家計シミュレーションでは**手取りベース**（所得税・住民税・社保控除後）で収入を扱うのが標準。日本 FP 協会のキャッシュフロー表テンプレートも「可処分所得」列を設ける。
- **本コード**: `state.finance._inputMode === 'net'` なら手取り、`'gross'` なら額面ベース。`getIncomeForYearWithGrowth` は `state.finance.income` を単純 12 倍するのみで**入力モードの切替は上流 UI 任せ**。ただし `dividendCashout` だけは特定・一般口座に 20.315% を自動適用。**収入本体の税引きと配当の税引きで粒度が違う**（本体はユーザー任せ、配当は自動）。
- **判定**: ⚠️ 一貫性を欠く（本体は手動、配当は自動）。`09-I01` で記録。

### 3.3 住宅ローン残高の減り方（元利均等 vs 線形近似）

- **標準（住宅金融支援機構ローンシミュレーション）**: <https://www.jhf.go.jp/loan/yushi/simulation/>。元利均等返済では、初期は利息比率が高く元金の減りが遅い。**線形近似より残高が 5〜10% 大きく**なる傾向（Task 6 `05-C03` で実測）。
- **本コード**: `principal × (1 − elapsed/term)` の線形近似（`index.html:14282-14283`）。
- **判定**: ❌ **Task 6 `05-C03` をそのまま継承**。統合内では「控除額が過小」になる方向で効く（残高線形は実残高より小さい → 控除も小さい）。影響は年 1〜3 万円程度 × 13 年。

### 3.4 NISA 枠到達後の扱い（wastedContribs 補正の妥当性）

- **設計意図**: NISA 枠が埋まると `calcAllAssetGrowth` 内で `overflow` が発生し、`nisaOverflowTargetId` が設定されていれば振替先に流れる。振替先未設定の場合は純粋に「投資されなかった」分 → `wastedContribsByYear` に記録。
- **`calcIntegratedSim` の対処**: `annualExpense` には「予定していた積立額」が含まれる（B 方式、`index.html:6771-6776`）が、実際には積立されないので `cashFlow` で戻す（`index.html:14292`）。
- **整合性**: ✅ ダブル控除を防ぐために必要な補正。ただし UI からは**この補正が発生したことが見えない**（`wastedContribs` は返却フィールドに含まれない）。`09-M02` で記録。

## 4. 仮定・制約

1. **年次粒度**: 月内のキャッシュフロー変動（ボーナス支給タイミング、賞与月に大型支出を合わせる等）は粒度外。
2. **y=0 は「今の残高そのもの」**: `cashFlow[0] = 0` として `totalWealth[0] = 現金アセット残高 + 投資アセット残高`。初年度の収入・支出は翌年（y=1）に反映開始。ユーザー感覚と 1 年ずれる可能性。
3. **現金プールは金利ゼロ扱い**: `_cashGD` の `data[y]` は `calcAllAssetGrowth` で成長するが、預金型（`cash`, `deposit` 等）は `annualReturn` が 0〜0.1% 想定。
4. **清算は「現金プールがマイナス → 投資から補填」のみ**: 流動性不足のみ考慮。税務上の譲渡益税・NISA 非課税などは**未反映**（`09-I03`）。
5. **投資清算の機会損失複利**: 清算した資産は**即日売却したと仮定**し、以降の機会損失は加重平均利回り `_wInvestReturn` で複利増加。実務では NISA の非課税枠や含み益の有無で最適な清算順序は変わるが、単一リターンで近似。
6. **パートナー昇給の上限年齢**: Task 3 `02-C01` の「パートナー昇給停止年齢は本人年齢基準」バグが `getIncomeForYearWithGrowth` 経由で再現（`index.html:17148, 17152`）。
7. **支出のインフレ**: `getExpenseForYear` は現役期の **`state.finance.expense` をインフレ適用せず**そのまま 12 倍（Task 3 `02-I01`）。`calcIntegratedSim` の `annualExpense` も同様。退職後シミュ（`calcRetirementSimWithOpts`）だけが `(1+inflationRate)` を適用する非対称。
8. **ライフイベント費用のインフレ**: `calcLECostByYear` は教育費・介護費を**名目額で固定**（Task 4 `03-I08`）。20 年後の大学費用も現在値のまま。
9. **住宅ローン残高**: 線形近似（`05-C03`）。
10. **パートナー支出変化**: Task 7 `06-C02` の `partnerExpenseChange` は退職後シミュ専用で、**現役期の `calcIntegratedSim` には反映されない**（経路分離）。
11. **配当受取モード**: `dividendMode === 'cashout'` かつ `dividendYield > 0` のみ `dividendCashout` に計上。`reinvest` モードは `indexPool` の複利に含まれる。
12. **住宅ローン控除の開始年・年数**: `getRetirementParams` の `mortgageDeductStart / mortgageDeductYears` に依存（Task 6 `05-I01`: 制度最新化されていない）。

## 5. エッジケース

1. **`state.assets = []`**: `growthData = []`、`cashAssetBase = investAssetBase = 0`、`_wInvestReturn = 0.05`（デフォルト）。`cashFlow` は積上げるが `virtualCash < 0` 判定で清算発動 → しかし `_investGD = []` なので `investPool` も 0。**`cashPool` 単独で赤字累積**し、負の `cashPool` は `max(0, ...)` で 0 クランプ。年次 `cashFlow` は負のまま累積する（清算分で `adjustedCashFlow` を 0 に近づけるが、清算対象なしなので無意味な補正）。
2. **全アセットが投資系（現金 0）**: `_cashGD = []`、`cashAssetBase = 0`。y=1 でキャッシュフローがマイナスなら即清算発動 → 毎年ほぼ全額を投資から取り崩す → `_investDeficit` 急増 → `investPool` は名目成長の累積を上回って急減。**現金を持たないポートフォリオでは機会損失複利が厳しく効く**。
3. **全アセットが現金系（投資 0）**: `_investGD = []`、`_totalInvestVal = 0`、`_wInvestReturn = 0.05`（フォールバック）。清算は発動しないが `investPool` は常に 0。`cashPool` が赤字なら `max(0, ...)` で 0。
4. **`cashFlow[y-1]` が大きな正値 & `annualExpense` が急減**: `virtualCash > 0` で清算なし。`cashPool` に流入が蓄積される一方、`investPool` は名目成長のみ。意図通り。
5. **配当受取アセットの `prevVal = 0`（y=1）**: `growthData[i].data[0] = currentVal` なので `prevVal = currentVal`。y=1 の配当は現在値の利回り × 12 と等価。問題なし。ただし y=0 では `annualDividendCashout = 0`（`y === 0 ? 0 : ...`）なので初年度の配当が落ちる。
6. **`mortgageBalanceInteg` が `term` ちょうど**: `elapsed === term` で `return 0`。控除も 0。境界条件は OK。
7. **`mortgageBalanceInteg` が負値**: `elapsed > term` で早期に `return 0`。負値は発生しない。
8. **`wastedContribsByYear[y]` が非常に大きい**: NISA 1800 万円枠到達後、積立を続ける設定の場合、`wastedContribs` は毎年フル積立額が計上される。**cashFlow に加算されすぎて `cashPool` が過大**になる懸念。B 方式の前提（`annualExpense` に積立が含まれる）は正しいので論理的に整合するが、**ユーザーが積立を減らすべきか判断する指標が UI に出ない**（`09-M02` 参照）。
9. **`opts.noLoan = true`（住宅シミュ除外）**: `calcLECostByYear` で `mortgage = 0` になるが、`mortgageBalanceInteg` と `annualMortgageDeduct` は**opts を見ない**（`index.html:14276-14285` は `state.lifeEvents.mortgage` を直接参照）。**控除だけ計上されてローン負担は計上されない**不整合（`09-I04`）。
10. **`state.profile.birth` 未設定**: `calcAge()` が `null` or NaN。`getIncomeForYearWithGrowth` 内の `birthYear` は `null`、`retireYear = null`、セミ・フルリタイア判定が効かず **退職後も収入が継続する**。Task 3 `02-I08` で既出の脆弱性が統合でも再現。

## 6. 検出された問題（深刻度付き）

### 🔴 Critical

- **`09-C01` 現役期シミュレーション全体に「生活費・LE 費用のインフレ非適用」が伝播し、長期プロジェクションで購買力が過大評価される**
  - 統合シミュの `annualExpense = getExpenseForYear(yr)` は `state.finance.expense * 12 + アセット積立額`（`index.html:6755-6778`）で、**インフレ率を一切掛けない**。Task 3 `02-I01` の確認通り、現役期は名目固定。
  - 同様に `calcLECostByYear` の教育費・介護費も名目固定（Task 4 `03-I08`）。
  - **しかし `calcRetirementSimWithOpts`（退職後）は `(1 + inflationRate)` を毎年適用する**（`index.html:17597` 付近）。→ **退職接続時点で「年間支出」が段差的に跳ね上がる**ように見える UX バグ。
  - 数値影響（シナリオ B 鈴木健太 35 歳共働きで推定）: インフレ 2% × 30 年（35→65 歳）で**購買力差 81%**。現役期の `annualExpense` 24 万円/月 × 12 = 288 万円/年 → 30 年後実質価値 160 万円/年。**逆に言えば、退職時資産要件は 80% 過小に計算**されている可能性。
  - Task 3 `02-I01` + Task 4 `03-I08` は個別領域では Important 扱いだったが、**統合ハブでこの非対称性が同時に作用し、かつ退職接続で可視化される**ため、`calcIntegratedSim` 側ではより深刻な Critical として扱う。
  - 改善案: `getExpenseForYear(yr)` の末尾で `(1 + inflationRate)^(yr − currentYear)` を乗算、かつ `calcLECostByYear` の教育費に同倍率を適用。**2 関数の同時修正が必須**（片方だけ直すと合計がおかしくなる）。
  - 出典: 日本 FP 協会キャッシュフロー表テンプレート（インフレ列は必須）<https://www.jafp.or.jp/personal_finance/know/lifeplan/cashflow/>、金融庁「老後 2000 万円報告書」補足資料でも年率 1〜2% のインフレ前提。

### 🟡 Important

- **`09-I01` 収入本体の税引き（所得税・住民税・社保）が `_inputMode` 設定に完全依存し、配当だけ自動税引きするため一貫性がない**
  - `getIncomeForYearWithGrowth` は `state.finance.income`（月額）× 12 を返すのみ（`index.html:17107`）。ユーザーが「手取り入力」か「額面入力」かを `_inputMode` で明示する設計だが、UI からは切替が見えにくく、かつ**どちらで入れたか判別するフラグはあるが `calcIntegratedSim` は参照しない**。
  - 一方 `dividendCashout` は特定・一般に対して 20.315% を**自動控除**。→ 本体が gross で入っていても配当だけ手取りになる**混合**状態が起こりうる。
  - 年金収入は `calcRetirementSimWithOpts` 側で扱われるため統合では無関係だが、パートナー収入も同じく手動。
  - **改善案**: `calcIntegratedSim` 冒頭で `_inputMode === 'gross'` の場合のみ `annualIncome` に一律の手取率（例: 0.78）を掛ける。あるいは gross 入力時は UI で警告を出す。
  - 出典: 日本 FP 協会 <https://www.jafp.or.jp/personal_finance/know/lifeplan/cashflow/>（「可処分所得」列の標準形）。

- **`09-I02` 投資清算時、`liquidationThisYear` は税引前額面でプールから差し引かれ、譲渡益税・含み益比率が考慮されない（Task 8 `07-I01` の再確認）**
  - `liquidationThisYear = -virtualCash` を `_investDeficit` に加算し、**同額を `investAssetBase` から引く**。実際には特定口座から 100 万円売却すると含み益 × 20.315% が税で引かれ、手取りは 100 万円未満 → 不足分をさらに売らなければならない。
  - **数値例**: `virtualCash = -100` 万円、清算対象プール全体が含み益 50% 想定 → 実効税率 10.16%（=50% × 20.315%）→ 手取り 89.84 万円 → 不足が 10.16 万円残る。**本コードは税コストをゼロ扱い**にするため、実際より投資プールの持ちが **10% 程度良く**見える。
  - 恒等式検算には直接影響しないが（`_investDeficit` の記録は額面）、シナリオ B のような清算発生ケースで `investPool` が実態より 5〜10% 過大表示される。
  - Task 8 `07-I01` と同一問題の**統合シミュ本体での発現**。`07-I01` は「投資プール」の内部処理の記述、`09-I02` は「統合フロー全体で見たときの UX 影響」の記述。
  - 改善案: `state.assets[].taxType` と `state.assets[].nisaBasis` から含み益比率を推定し、`effectiveTax = 含み益比率 × 0.20315` で清算額を scale up。

- **`09-I03` 住宅ローン控除は `state.lifeEvents.mortgage` を直接読むが、`opts.noLoan=true` での除外対象外**
  - `calcLECostByYear(yr, opts)` は `opts.noLoan` で住宅負担を除外できるが、**統合シミュの `annualMortgageDeduct` は opts を見ずに `state.lifeEvents.mortgage` を直接読む**（`index.html:14276-14285`）。→ シナリオ比較で「住宅なしシミュ」を作ると**ローン支払いゼロなのに控除だけ 31.5 万円/年計上**される。
  - 影響: `calcIntegratedSim` を `noLoan: true` で呼び出すのは `renderAlternativeScenarios` の「住宅取得しない場合」等。ここで `mortgageDeduct` が継続計上 → `cashFlow` 過大 → 「住宅なしシナリオの方が控除分だけ得」という**逆転表示**。
  - 改善案: `const annualMortgageDeduct = (y === 0 || opts.noLoan) ? 0 : calcMortgageDeduction(yr, mortgageBalanceInteg);` の 1 行修正。

- **`09-I04` 投資プール枯渇後の「幻影機会損失複利」（Task 8 `07-C01` の統合シミュ内での発現確認）**
  - `_investDeficit *= (1 + _wInvestReturn)` は**毎年無条件**で適用される（`index.html:14302`）。しかし一度 `investAssetBase < _investDeficit` になると `investPool = max(0, ...)` で 0 に張り付き、**その後も `_investDeficit` だけが指数成長**する。
  - 結果として:
    - `investAssetBase` は小さな成長を続ける（積立継続の場合）
    - `_investDeficit` は `_wInvestReturn` で毎年増加
    - 差は広がり続け、**理論上は永遠に `investPool = 0` のまま**
  - Task 8 `07-C01` で詳細指摘済み。本監査では**統合ハブ側で発生する**ことの再確認。恒等式検算（§2.6）の誤差は ±1 万円に収まっているが、清算が発生するシナリオでは検算が破綻する可能性（§2.6 は清算ゼロシナリオ A のみで検算）。
  - **シナリオ C / D では清算発生しうる**ため Task 11 でサニティチェック推奨。
  - 改善案: `_investDeficit` の上限を `investAssetBase + 清算済み額` にキャップ、または `investPool = 0` 到達時点で `_investDeficit` をフリーズ。

- **`09-I05` パートナー昇給の停止年齢が「本人年齢基準」で計算されている（Task 3 `02-C01` の統合内での発現）**
  - `getIncomeForYearWithGrowth` 内:
    ```js
    const partnerGrowthYears = Math.max(0, Math.min(yearsElapsed, partnerUntilAge - currentAge));
    ```
    → `partnerUntilAge` はパートナーの年齢だが、そこから引く `currentAge` は**本人の年齢**。パートナーと年齢差があると停止タイミングがずれる。
  - 影響: シナリオ B（鈴木健太 35 歳 + パートナー 32 歳想定）のようなケースで、パートナーの昇給停止が本人より 3 年ずれて早く終わる（本人より年下の場合）。`calcIntegratedSim` の `annualIncome` に**数十万円/年レベル**の誤差が積み上がる。
  - Task 3 `02-C01` で Critical 指摘済み。統合ハブの `annualIncome` 計算に直結するため、本監査でも Important 以上に扱う。
  - 改善案: `partnerGrowthYears = Math.min(yearsElapsed, partnerUntilAge − partnerCurrentAge)` に変更（`partnerCurrentAge = calcPartnerAge()` 相当を導入）。

### 🟢 Minor

- **`09-M01` `annualExpense` フィールドに「投資積立額」が含まれるため、UI 表示時に生活費と混同される恐れ**
  - `getExpenseForYear` は B 方式（`index.html:6769-6776`）で、`assetAnnualTotal = Σ (monthly × 12 + annualBonus)` を生活費に**加算**して返す。`calcIntegratedSim` の `annualExpense` もこの値をそのまま使用。
  - UI で「年間支出」として表示すると、**実際には「生活費 + 投資積立」の合計**が出るため、「積立ている分も支出扱い」の混乱を招く。
  - 積立は `cashAssetBase` / `investAssetBase` の成長として戻るので**帳尻は合う**が、説明なく見せるとユーザー混乱。
  - 改善案: `annualExpense` を `baseExpense` と `assetContribution` に分離、UI で別列表示。

- **`09-M02` `wastedContribs` 補正が UI から見えず、NISA 枠到達後の挙動が不透明**
  - `wastedContribs` は `cashFlow` に加算されるが、戻り値フィールドに含まれない（`index.html:14320-14336`）。
  - NISA 1800 万円到達後は毎年「積立しようとした額」が `cashFlow` に戻るため **cashPool が膨らむ**が、UI 上は「想定通り積立した」ように見える。
  - 改善案: 戻り値に `wastedContribs` フィールドを追加し、UI で「NISA 枠到達により ◯ 万円/年が現金に回りました」と明示。

- **`09-M03` 配当受取アセットの `prevVal` 取得時、振替イベント発生年の値がずれる可能性**
  - `annualDividendCashout` は `growthData.find(g => g.asset.id === a.id).data[y-1]` を使う。`calcAllAssetGrowth` の振替（overflowTargetId）で前年にアセット残高が人為的に動いた場合、`prevVal` は振替後の値になる。
  - 振替「元」アセットの残高が下がり、「先」アセットの配当利回りに影響するが、**アセットをまたぐ振替では配当利回り設定も別々**なので、「元」アセットの利回りで「先」アセットを計算する問題は発生しない（別アセットとして独立）。
  - 実害は限定的だが、振替モデルと配当モデルが**別の前提で動いている**ことが明文化されていない。

- **`09-M04` `y=0` のみ `annualDividendCashout = 0` / `annualMortgageDeduct = 0`**
  - 初年度を「現在地」として扱う設計は妥当だが、配当・控除も 0 扱いなので**現在年の家計実感と一致しない**。「今年は配当 40 万もらった」のに表示上 0。
  - 影響軽微（翌年から正常表示）だが、初年度比較でユーザーに誤解を与える。
  - 改善案: `y=0` でも配当・控除を計上するか、または UI で「y=0 は残高表示のみ」と注記。

- **`09-M05` 加重平均投資リターン `_wInvestReturn` のフォールバックが 0.05（5%）**
  - `_totalInvestVal === 0` のとき `_wInvestReturn = 0.05`（`index.html:14246`）。投資アセット未登録時の清算機会損失計算に使われる。
  - しかし `_investGD = []` のとき清算は発生しない（`_investGD.reduce(...) = 0` → `investAssetBase = 0` → 清算してもプールが無い）ため、この定数は実質**ダミー**。
  - 実害なしだが、コードレビューで「なぜ 5%？」という疑問が湧く。コメントで「投資アセット未登録時のフォールバック（実害なし）」と明記する改善余地。

- **`09-M06` `result._liquidationEvents` が配列に直付けされており、JSON シリアライズで失われる**
  - `result._liquidationEvents = [...]` は配列プロパティ（`index.html:14338`）。`JSON.stringify(result)` では欠落。localStorage 永続化や CSV エクスポート経路で「清算履歴が消える」可能性。
  - 改善案: `{ data: result, liquidationEvents: [...] }` の形でラップして返す。

## 7. 結論

- **信頼度**: ❌ 要対応
- **一言サマリー**: **恒等式 `Δ totalWealth ≈ flow + ΔcashBase + ΔinvestBase` はスナップショット実数値（シナリオ A 5 年分）で ±1 万円以内で成立**（§2.6 表）、統合の構造は FP 教科書のキャッシュフロー表と等価。しかし Task 3 `02-I01`（現役期インフレ非適用）と Task 4 `03-I08`（LE 費用インフレ非適用）が**同時に `calcIntegratedSim` で発現し、退職後シミュ `calcRetirementSimWithOpts` は逆にインフレ適用する非対称**が `09-C01` として Critical。加えて Important 5 件（`09-I01` 収入税引き混在、`09-I02` 清算税引き未反映 = `07-I01` 再現、`09-I03` noLoan 時の控除計上ミス、`09-I04` 投資枯渇後の幻影機会損失 = `07-C01` 統合内発現、`09-I05` パートナー昇給年齢バグ = `02-C01` 統合内発現）。
- **Cross-reference 整理（Task 10 の核心）**:

| 前タスク | Issue ID | 統合内発現 | 本監査 ID |
|---|---|---|---|
| Task 2 ⓖ | `01-I01`（課税口座毎年課税近似）| `calcAllAssetGrowth` 経由で `cashAssetBase` / `investAssetBase` に反映 | 継承（再記載なし） |
| Task 3 ⓗ | `02-C01`（パートナー昇給年齢バグ）| `annualIncome` に直接発現 | `09-I05`（重点再記載）|
| Task 3 ⓗ | `02-I01`（現役期インフレ非適用）| `annualExpense` に発現 | `09-C01`（Critical へ昇格）|
| Task 4 ⓘ | `03-I08`（LE 費用インフレ非適用）| `leCost` に発現 | `09-C01`（同 Critical に統合）|
| Task 5 ⓒ | `04-C01`（`calcPensionEstimate` 重複）| 現役期では不使用、統合では遮断 | 伝播なし |
| Task 6 ⓓ | `05-C03`（住宅ローン残高線形近似）| `mortgageBalanceInteg` で発現 → 控除額に影響 | §3.3 参照 |
| Task 6 ⓓ | `05-I01`（控除制度未最新化）| `calcMortgageDeduction` で発現 | 継承 |
| Task 7 ⓔ | `06-C02`（partnerExpenseChange 反映経路）| **統合では反映されない**（退職後シミュ専用）| 意図的分離 |
| Task 8 ⓕ | `07-C01`（投資プール枯渇後の幻影）| `_investDeficit` の無限成長 | `09-I04`（重点再記載）|
| Task 8 ⓕ | `07-I01`（清算税引前額面）| `liquidationThisYear` の額面処理 | `09-I02`（重点再記載）|
| Task 9 ⓑ | `08-C01`（中間プール枯渇隠蔽）| 現役期は 2 プールのみで該当せず | 退職シミュ側の問題 |

- **信頼度 ❌ 要対応 の根拠**: `09-C01` は現役期全体の `annualExpense` と `leCost` のインフレ非適用 × 退職後との接続非対称を指摘する構造バグで、**長期プロジェクションの核心指標（退職時資産要件、FIRE 成否判定）を歪める**。Phase 2 他タスクと同じく Critical ≥ 1 → ❌ 判定。
- **恒等式検算**: **passed**（シナリオ A 5 移行分、誤差 ±1 万円 = `Math.round` 起因）。ただし清算が発生するシナリオ（シナリオ B/C/D の可能性）では `09-I04` の幻影機会損失により検算が破綻する懸念 → Task 11 でシナリオ B をサニティチェック推奨。
- **申し送り（Task 11 / 12 向け）**:
  - Task 11 では **シナリオ B**（鈴木健太 35 歳共働き住宅ローン）で以下の追加検算を:
    1. `liquidation > 0` の年があるか → `09-I02` / `09-I04` の影響確認
    2. `mortgageDeduct` の年次推移が `principal × (1 − elapsed/term) × 0.007` の線形に沿うか → `05-C03` / `09-C01` 継承確認
    3. `cashFlow`（清算調整後）が清算発生年に平坦化していないか
  - Task 12 のサマリでは **`09-C01` を Phase 2 全体の最優先改修項目**として提示（2 関数同時修正が必要）。
  - Phase 3 改修時は `getExpenseForYear` / `calcLECostByYear` / `calcRetirementSimWithOpts` の 3 関数の**インフレ適用ルールを統一**すること（現役期も退職後も同じ `(1 + inflationRate)^n` を使う）を最優先要件とする。
