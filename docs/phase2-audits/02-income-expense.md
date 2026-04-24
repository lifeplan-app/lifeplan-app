# 監査レポート：収入・支出の経年変化（ⓗ）

- **対象領域**: ⓗ 年次収入・支出の進展（`getIncomeForYear` / `getIncomeForYearWithGrowth` / `getExpenseForYear` / `getRecurringExpenseForYear` / `getOneTimeForYear`）
- **監査日**: 2026-04-24
- **信頼度判定**: ❌ 要対応

## 対象範囲

- `getIncomeForYear(yr)` (`index.html:6738-6752`) — 年額収入の基本値（本人のみ、昇給なし）
- `getIncomeForYearWithGrowth(yr)` (`index.html:17097-17172`) — 昇給率・リタイア・パートナー収入を合算した年額収入
- `getExpenseForYear(yr)` (`index.html:6755-6779`) — 生活費 + アセット積立を合算した年額支出（B方式）
- `getRecurringExpenseForYear(year)` (`index.html:6782-6797`) — 繰り返し支出の当年ヒット額
- `getOneTimeForYear(yr)` (`index.html:6800-6818`) — 当年の一時収支（一時収入 − 一時支出 − 計画支出 − 繰り返し支出）
- `calcAge` (`index.html:6671-6680`)・`ageToYear` (`index.html:6730-6735`) — 年齢⇔年の換算補助
- `state.finance.{income, bonus, expense, inflationRate, incomeGrowthRate, incomeGrowthUntilAge, partnerIncome, partnerBonus, partnerGrowthRate, partnerGrowthUntilAge}`
- `state.cashFlowEvents[]`（`income_change` / `expense_change` / `one_time_income` / `one_time_expense`）
- `state.expenses[]`（一時支出計画、`year` + `amount`）
- `state.recurringExpenses[]`（繰り返し支出、`startYear` / `endYear` / `intervalYears` / `excludeYears` / `overrideAmounts`）

**呼び出し元（抜粋）**:
- ダッシュボード月次CF (`index.html:11193-11197`)
- 財務バナー (`index.html:11461-11462`)
- ライフイベントキャッシュフローグラフ (`index.html:13966-13971`)
- ダッシュボード繰り返し支出ミニグラフ (`index.html:13736`)
- 統合シミュレーション `calcIntegratedSim` (`index.html:14260-14262`)
- リタイアシミュレーション内の繰り返し支出 (`index.html:17565`, `18358`, `18620`)

## 1. 関数の目的と入出力

### getIncomeForYear(yr)
- **目的**: 指定暦年 `yr` の「本人の年額基本収入」（万円）を返す。`cashFlowEvents` の `income_change` があればその値で**置換**する。
- **入力**: `yr: number`（暦年）。`state.finance.{income, bonus}` と `state.cashFlowEvents[]` を参照。
- **戻り値**: `number`（万円/年、未丸め）。

### getIncomeForYearWithGrowth(yr)
- **目的**: 本人の昇給モデル + リタイア・セミリタイア反映 + パートナー収入・昇給・リタイア反映を合算した年額収入。
- **入力**: `yr`。`state.finance.{incomeGrowthRate, incomeGrowthUntilAge, partnerIncome, partnerBonus, partnerGrowthRate, partnerGrowthUntilAge}` と `state.retirement.{type, targetAge, semiEndAge, semiMonthlyIncome, partnerType, partnerTargetAge, partnerSemiEndAge, partnerSemiMonthlyIncome}` を参照。
- **戻り値**: `number`（本人 + パートナー、万円/年）。`cashFlowEvents.income_change` 該当年は本人分の昇給モデルをスキップして `getIncomeForYear(yr)` の値（イベント額）をそのまま使う。

### getExpenseForYear(yr)
- **目的**: 生活費（`finance.expense × 12`）+ その年に有効なアセットの年間積立合計（`monthly × 12 + annualBonus`）を返す。コメント「B方式」は「アセット積立額を支出側に含めて `calcAssetGrowth` との二重計算を避ける設計」を指す（`index.html:6769-6776`）。
- **入力**: `yr`。`cashFlowEvents.expense_change` があれば **base を置換**（アセット積立は引き続き加算）。
- **戻り値**: `number`（万円/年）。

### getRecurringExpenseForYear(year)
- **目的**: `state.recurringExpenses[]` を走査し、当年が `(year − startYear) % intervalYears === 0` かつ `startYear ≤ year ≤ endYear` かつ `excludeYears` に含まれない場合に、`overrideAmounts[year]` があれば優先、なければ `amount` を合算。
- **戻り値**: `number`（万円、当年に実発生する金額の合計。`amount / intervalYears` の年換算ではない）。

### getOneTimeForYear(yr)
- **目的**: 当年に発生する一時収支 = `cashFlowEvents` の `one_time_income` 合計 − `one_time_expense` 合計 − `state.expenses[]` の当年計画支出 − `getRecurringExpenseForYear(yr)`。
- **戻り値**: `number`（正=収入超、負=支出超、万円）。

## 2. 使用している計算式

### 2.1 本人の昇給モデル（`index.html:17105-17124`）

```js
const growthRate  = (parseFloat(state.finance.incomeGrowthRate) || 0) / 100;
const untilAge    = parseInt(state.finance.incomeGrowthUntilAge) || 50;
const selfBase    = (state.finance.income || 0) * 12 + (state.finance.bonus || 0);
// ...
const selfGrowthYears = Math.max(0, Math.min(yearsElapsed, untilAge - currentAge));
selfIncome = selfBase * Math.pow(1 + growthRate, selfGrowthYears);
```

- 数式: `I_self(yr) = (income×12 + bonus) × (1 + g)^min(yr−yr_now, untilAge − age_now)`
- `untilAge` に達した年以降は停止時点の額に固定（`Math.min` により `selfGrowthYears` が上限でサチる）。
- **成長モードは固定率（`fixed_rate`）のみ**。年齢ピーク型の曲線 (`curve`) や段階的（S字型）賃金カーブは存在しない。

### 2.2 パートナーの昇給モデル（`index.html:17147-17153`）

```js
const partnerGrowthRate = (parseFloat(state.finance.partnerGrowthRate) || 0) / 100;
const partnerUntilAge   = parseInt(state.finance.partnerGrowthUntilAge) || untilAge;
// ...
const partnerGrowthYears = Math.max(0, Math.min(yearsElapsed, partnerUntilAge - currentAge));
partnerIncomeThisYear = partnerBase * Math.pow(1 + partnerGrowthRate, partnerGrowthYears);
```

- 本人と同じ数式。**ただし `partnerUntilAge − currentAge` の `currentAge` は本人の年齢** (`calcAge()` = `state.profile.birth` 基準、`index.html:17100`)。**パートナー生年は `partnerBirthYear` として別に取得しているのに昇給年数計算には使われていない**（§6 `02-C01` 参照）。

### 2.3 `cashFlowEvents.income_change` 置換（`index.html:17110-17121`）

```js
const baseIncome  = getIncomeForYear(yr);
const hasOverride = (state.cashFlowEvents || []).some(e => e.type === 'income_change' && yr >= startYr && (endYr == null || yr < endYr));
if (hasOverride) {
  selfIncome = baseIncome; // cashFlowEventsの値をそのまま使用
}
```

- `income_change` イベントが該当すると、本人分の昇給モデルは**完全にスキップ**され、イベントで指定した `monthlyAmount × 12 + bonusAmount` で置換される（以後の昇給なし）。
- 複数の `income_change` が同時ヒットした場合、`sort((a,b) => a.startAge − b.startAge)` の後ループで上書きするため、**最後のイベントが勝つ**（`index.html:6742-6750`）。

### 2.4 生活費のアセット積立加算（B方式）（`index.html:6769-6776`）

```js
const assetAnnualTotal = (state.assets || []).reduce((s, a) => {
  const isActive = (!a.startYear || yr >= a.startYear) && (!a.endYear || yr <= a.endYear);
  return s + (isActive ? (a.monthly || 0) * 12 + (a.annualBonus || 0) : 0);
}, 0);
result += assetAnnualTotal;
```

- アセット積立（`monthly × 12 + annualBonus`）を生活費側の「支出」として加算する。`calcAssetGrowth` は同じ積立を資産側に積み上げるため、**この支出加算により「同じお金を2箇所で計上しない」よう辻褄を合わせている**（コメント「B方式」）。
- `calcIntegratedSim` (`index.html:13976-13989`) では逆に `pureExp = exp − allAssetContrib` を計算し直してグラフ表示用に分離している。

### 2.5 繰り返し支出ヒット判定（`index.html:6782-6797`）

```js
const iv = parseInt(e.intervalYears) || 1;
// ...
if ((year - sy) % iv === 0) {
  const override = (e.overrideAmounts || {})[String(year)];
  return total + (override != null ? override : (parseFloat(e.amount) || 0));
}
```

- `(year − startYear) % intervalYears === 0` の年に **1回分の金額** を加算。`amount / intervalYears` の年換算ではないため、単年の支出としてはスパイクする。

### 2.6 インフレ率

**本コードでは `state.finance.inflationRate`（既定 2%）は `getIncomeForYear/ForYearWithGrowth`・`getExpenseForYear` の計算には一切使われていない**。使用箇所は以下のみ:

- `renderPortfolio` の「実質値表示」トグル (`index.html:9020-9023, 10014-10016`) — 表示係数 `1 / (1+i)^y`。
- ダッシュボード「前提条件」バナーのテキスト (`index.html:16170, 20632`) — 表示のみ。
- リタイア期の退職後シミュレーションで `state.retirement.inflationRate`（既定 1.5%）を使って `expenseChangeFactor = ((1+i)(1−decay))^i` を適用 (`index.html:17556, 18351`)。

つまり**リタイア前（現役期）の生活費はインフレで伸びない**。`calcIntegratedSim` はリタイア前の年次支出をそのまま名目（現在の `finance.expense × 12`）で扱う（`index.html:14261`）。

## 3. 標準との突合

### 3.1 昇給の複利適用

- **標準**: 賃金の将来値は `FV = PV × (1 + r)^n` で計算するのが FP 教科書の標準形。
- **参考データ（日本 2025 年春闘）**:
  - 連合 最終集計: 賃上げ率（定昇込み）**5.25%**（34年ぶり高水準、2年連続5%台）
    - 出典: 日本経済新聞「見えぬ実質賃金プラス定着 連合最終集計25年5.25%」 <https://www.nikkei.com/article/DGXZQOUA30AZ00Q5A630C2000000/>
    - 出典: JILPT ビジネス・レーバー・トレンド <https://www.jil.go.jp/kokunai/blt/backnumber/2025/10/shuntou_01.html>
  - 厚生労働省「2025年民間主要企業春季賃上げ要求・妥結状況」: 平均賃上げ率 **5.52%**（平均賃上額 18,629円）
  - 経団連 大手企業最終集計: **5.39%**
    - 出典: <https://www.keidanren.or.jp/journal/times/2025/0828_06.html>
- **本コード**: 固定複利 `selfBase × (1+g)^n` で一致。
- **判定**: ✅ 数式は一致。**ただし `incomeGrowthRate` の UI 既定値が 0%/年**（`state.finance` には既定値なし。`updateIncomeGrowthPreview` で `|| 0` になる）で、ユーザーが入力しない限り昇給ゼロで計算される。2025 年の 5%台水準は特殊な一時現象だが、長期平均でも 1〜2%程度はほぼ確実に発生する（§6 `02-I01`）。

### 3.2 賃金カーブ（年齢プロファイル）

- **標準**: 厚生労働省「令和6年賃金構造基本統計調査」によれば、一般男性労働者の年齢階級別所定内給与は **20〜24 歳を 100 とすると 55〜59 歳で 189.6**（=ピーク）、その後下降。女性は **45〜49 歳が 129.2**（低めのピーク）。
  - 出典: 厚生労働省「令和6年賃金構造基本統計調査」 <https://www.mhlw.go.jp/toukei/itiran/roudou/chingin/kouzou/z2024/dl/14.pdf>
  - 出典: JILPT 図5 賃金カーブ <https://www.jil.go.jp/kokunai/statistics/timeseries/html/g0405.html>
- **本コード**: 固定率モデルのみ。`untilAge`（既定 50 歳）までは一定率で上がり続け、その後はサチらせる「階段型」。**55〜59 歳ピーク以降の下降は表現できない**。
- **判定**: ⚠️ 差異（意図した簡略化）。既定 `untilAge = 50` は実態の 55〜59 歳ピークより 5〜9 年早い（§6 `02-M01`）。

**検算**: 初年収 500万・g=2%・`untilAge=50`・現在年齢 30 歳として
- 本コード: `500 × 1.02^20 = 500 × 1.485947 ≈ 742.97 万円` @50歳以降
- 年率 2% で 20 年複利は `1.02^20 ≈ 1.486` 倍、年率 1% で `1.01^20 ≈ 1.220` 倍。厚労省「令和6年賃金構造基本統計調査」の男性年齢階級別倍率（20〜24歳 = 100 基準）は 55〜59 歳で 189.6 がピーク。横断面データのためインフレ・コーホート効果の補正は別途必要だが、「30〜50 歳」の範囲については本コードの 2%/年（1.486 倍）と同程度のオーダーで大きく外れていないことだけ確認できる。ピーク後の下降局面は本コードでは表現不可。

### 3.3 インフレの複利適用

- **標準**: 将来価値 = 現在価値 × (1 + 物価上昇率)^n（FP 技能検定・資産運用手引の標準形）
- **日本 CPI 実績**:
  - 2024 年平均（2020 年基準 総合）: **108.7**（前年比 +2.7%）
  - 2025 年 9 月 総合指数: **112.0**（前年比 +2.9%）、コア CPI +2.9%、コアコア CPI +3.0%
    - 出典: 総務省統計局 CPI <https://www.stat.go.jp/data/cpi/1.html>
    - 出典: 総務省統計局「消費者物価指数 全国（最新の年平均結果の概要）」 <https://www.stat.go.jp/data/cpi/sokuhou/nen/index-z.html>
    - 出典: アイ・エヌ情報センター「2025年10月 全国消費者物価指数データ推移」 <https://www.indb.co.jp/news/economy_2510_cpizenkoku/>
- **本コード**: 現役期（リタイア前）の `getExpenseForYear` は **インフレを反映しない**。
- **判定**: ❌ 不整合。実在する 2%台のインフレを `finance.inflationRate`（既定 2%）として保持していながら、現役期シミュレーションの支出計算では使っていない。`realFactor` は表示変換（名目→実質）のみで、計算本体は名目固定。これは一貫性のないモデル（§6 `02-C01` / §6 `02-I02`）。

**検算（基準年 = 今年（2026）、`finance.inflationRate = 2%` 想定、月間生活費 25 万円）**:
- 20 年後の実質同等支出（名目）: `25 × 12 × 1.02^20 = 300 × 1.485947 ≈ 445.78 万円/年`
- 本コードは 20 年後も `25 × 12 = 300 万円/年` のまま
- **過少評価**: `(445.78 − 300) / 445.78 ≈ 32.69%`
- 30 年後の同じ検算: `300 × 1.02^30 = 300 × 1.811362 ≈ 543.41 万円/年` → 本コードは 300 万円 → 過少評価 `(543.41 − 300) / 543.41 ≈ 44.79%`

### 3.4 給与所得控除と手取り

- **標準**: 給与所得控除は年収帯別に異なる（国税庁タックスアンサー No.1410 <https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1410.htm>）。
  - 162.5 万以下: 55万円
  - 162.5〜180 万: 収入 × 40% − 10 万
  - 180〜360 万: 収入 × 30% + 8 万
  - 360〜660 万: 収入 × 20% + 44 万
  - 660〜850 万: 収入 × 10% + 110 万
  - 850 万超: 195 万（定額）
- **本コード**: 収入は「手取り（`net`）」または「額面（`gross`）」をユーザーが選んで入力する（`_inputMode` フラグ、`index.html:17080-17093`）。`gross` を選択すると別途手取り換算が行われる（本監査対象外）。
- **判定**: `getIncomeForYear` 自体は控除計算を行わない（入力された `income`/`bonus` をそのまま使う）。昇給時の「年収が上がると控除カーブで手取りが変わる」効果は考慮されない。**この監査領域では問題外として扱うが、将来タスク ⓐ 統合シミュレーション監査で扱う**（§6 `02-M02`）。

### 3.5 ボーナスの位置づけ

- **標準（FP テキスト）**: 年収 = 月収 × 12 + 賞与。昇給率は「月額基本給の伸び率」として適用するのが一般的だが、ボーナスも同じ率で伸びる想定が簡便法。
- **本コード**: `selfBase = income × 12 + bonus` に対して同じ `g` で複利。ボーナスが月収と**同じ昇給率で成長**する想定。`cashFlowEvents.income_change` でも `monthlyAmount × 12 + bonusAmount` を丸ごと置換するため、ボーナスは独立に編集可能。
- **判定**: ✅ 一般的簡便法として妥当。

### 3.6 パートナー収入の扱い

- **標準**: FP のキャッシュフロー表では配偶者収入は通常別枠で管理し、本人とは独立した昇給率・退職年齢を適用。
- **本コード**: `partnerGrowthRate` / `partnerGrowthUntilAge` を別に持ち、リタイア・セミリタイアも別変数（`partnerType`, `partnerTargetAge`, `partnerSemiEndAge`, `partnerSemiMonthlyIncome`）で管理。**ただし `partnerGrowthYears` の計算に本人の `currentAge` を使っているバグがある**（§3.2・§6 `02-C01`）。
- **判定**: 設計は標準的だが実装に欠陥。

## 4. 仮定・制約

1. **現在年 = 実行時年**: `new Date().getFullYear()` に依存。`ageToYear` も同じ。12/31→1/1 境界で初期年が 1 年ズレるほか、`calcAge` は月日まで見るが `ageToYear` は年のみ比較のため、**同じ人物について「今年の年齢」と「`ageToYear(e.startAge)` が返す年」で 1 年ズレが発生する日が年初にある**。
2. **`incomeGrowthUntilAge` の既定値 50**: `|| 50` のフォールバック（`index.html:17106`）。UI で未入力のまま放置すると 50 歳でサチる。
3. **固定率 `fixed_rate` のみ**: 年齢ピーク型・S字カーブ・段階的昇進モデルは存在しない。
4. **`partnerGrowthUntilAge` の既定値**: `|| untilAge`（本人の値）。**パートナーの性別・職種の違いを想定していない**。
5. **生活費のインフレ反映なし（現役期）**: §3.3 参照。`finance.inflationRate` は計算には使われず、表示の実質変換にのみ使われる。`retirement.inflationRate`（既定 1.5%）はリタイア後のみ適用。**2 つのインフレ率が別変数として並立し、既定値も異なる**（2% vs 1.5%）のも混乱を招く。
6. **アセット積立の生活費計上（B方式）**: 積立金は支出として差し引く設計。NISA 上限到達・目標達成で実際には投資に回らなかった分は `growthData._wastedContribsByYear` で補正されるが、これは `calcIntegratedSim` 内でのみ行われる。`getExpenseForYear` 単体で呼ぶ上位関数（ダッシュボード月次CF 等）は補正を受けない。
7. **`expense_change` と `expense` の関係**: `expense_change` は base を**置換**するが、アセット積立（`assetAnnualTotal`）は引き続き加算される。支出変化イベントで「生活費だけ変えたい」場合は正しいが、ユーザー側の期待と合っているか UI の注記次第。
8. **リタイア・セミリタイアの境界**: `retireYear` は `birthYear + retireAge` の年初から適用（`yr >= retireYear`）。誕生日ベースの月次境界は表現されない。
9. **`one_time_income` / `one_time_expense`**: `ageToYear(e.startAge) === yr` の単年ヒット。`endAge` は無視される（1 回限り）。

## 5. エッジケース

1. **`incomeGrowthRate = 0`**: `Math.pow(1, n) = 1` で成長なし。正しく動く。
2. **`untilAge − currentAge < 0`**（既に停止年齢を超えた人）: `Math.max(0, ...)` で 0 → 初年度から昇給なし。正しい。
3. **`untilAge = 50` 既定で `currentAge > 50`**: 同上、昇給なし。若い入力者向けの既定値としては妥当だが、50 歳超の入力者は明示的に設定しないと既定で昇給が消える点を認識する必要あり。
4. **`income_change` 複数ヒット**: 並び替え後ループの最後が勝つ。**タイブレークは `startAge` の数値昇順のみ**で、同年のイベントは配列順依存になる。
5. **`income_change` の `endAge` 未指定**: `endYr = null` → 以後ずっと。`endAge` 指定時は `yr < endYr`（終了年自体は除外）。
6. **`expense_change` と `finance.expense` の両方を使ったあと、`expense_change` の期間が終わる**: `result` はループ内で **イベントが一致した最後の値で更新**。期間が終了した年には **どのイベントも該当しないため `base`（初期値）に戻る**。`expense_change` で期間指定しつつ「期間後は新しい水準に留まる」想定だと誤る。`index.html:6760` の `let result = base` が起点で、イベントがヒットしない年はリセットされる動きになっている。
7. **`cashFlowEvents` の `income_change` と `incomeGrowthRate` 同居**: `hasOverride` が true になった瞬間、本人の昇給モデルは無効化。転職イベント後の昇給は**イベントの月額を後から手動でもう 1 件刻まない限り停止**する。
8. **`recurringExpenses` の `intervalYears = 0`**: `parseInt(e.intervalYears) || 1` で 1 に補正。
9. **`excludeYears` の型**: `(e.excludeYears || []).includes(year)` → number の厳格比較。`year` は number で入る一方、`excludeYears` に文字列が混入すると `includes` は一致しない。UI 保存ロジックが number で保存する限り問題にならないが、`importData` 経路は本監査の範囲外（`index.html:6789`）。
10. **`overrideAmounts[year]` の null チェック**: `override != null` で null/undefined 両方を除外、0 円オーバーライドは「その年だけ 0 円」として有効扱い。
11. **`one_time_expense` に `amount` が負**: `total - (e.amount || 0)` で二重マイナス → 収入扱いになる。UI 側で正の数しか入らないよう保証されているか別途確認要。
12. **`getOneTimeForYear` の内部で `getRecurringExpenseForYear(yr)` を減算**: 上位から `getOneTimeForYear + getRecurringExpenseForYear` と両方呼ぶと**繰り返し支出が 2 回引かれる**。`calcIntegratedSim` は `oneTime` のみ使うので問題ないが、`getRecurringExpenseForYear` を独立に呼ぶ箇所（`index.html:13736, 17565, 18358, 18620`）と `getOneTimeForYear` が同じ関数内で並行呼び出しされていないかは上位監査（タスク 10）での点検対象。

## 6. 検出された問題（深刻度付き）

### 🔴 Critical

- **`02-C01` パートナーの昇給年数計算に本人年齢を使っている**
  - `getIncomeForYearWithGrowth` (`index.html:17152`):
    ```js
    const partnerGrowthYears = Math.max(0, Math.min(yearsElapsed, partnerUntilAge - currentAge));
    ```
  - `currentAge` は `calcAge()`（本人、`index.html:17100`）である。パートナーの生年 `partnerBirthYear` は別途取得している (`index.html:17144`) のに、**昇給年数の上限 `partnerUntilAge − currentAge` には反映されていない**。
  - **数値例（本人 30 歳 / パートナー 40 歳 / `partnerUntilAge = 50` / `partnerGrowthRate = 3%` / 基本年収 400 万）**:
    - コードの計算: `partnerGrowthYears = min(yearsElapsed, 50 − 30) = min(yearsElapsed, 20)` → パートナーが 50 歳になる **10 年後** を超えても `partnerGrowthYears` はまだ `yearsElapsed` として増え、**20 年後（=パートナー 60 歳）まで昇給が続く**。
    - 正しい計算: `50 − 40 = 10 年後` で停止すべき。
    - 20 年後のパートナー年収（本コード）: `400 × 1.03^20 ≈ 722.44 万円`
    - 20 年後のパートナー年収（正しい）: `400 × 1.03^10 ≈ 537.57 万円`（10 年目以降は停止）
    - **過大評価**: `(722.44 − 537.57) / 537.57 ≈ 34.39%`（20 年後時点、本人より年上のパートナーのケース）
  - 逆に本人よりパートナーが若い場合（例: 本人 40 歳・パートナー 30 歳・`partnerUntilAge = 50`）:
    - コードの計算: `min(yearsElapsed, 50 − 40) = min(yearsElapsed, 10)` → **10 年後（=パートナー 40 歳）で停止してしまう**。
    - 正しい: `50 − 30 = 20` → パートナーは 50 歳まで昇給。
    - 10 年後のパートナー年収（本コード）: `400 × 1.03^10 ≈ 537.57 万円`（以後停止）
    - 20 年後のパートナー年収（正しい）: `400 × 1.03^20 ≈ 722.44 万円`
    - **過少評価**: `(722.44 − 537.57) / 722.44 ≈ 25.59%`（20 年後時点、本人より年下のパートナー）
  - **影響**: 夫婦の年齢差が大きいほど誤差が拡大。FIRE 達成年・退職資金必要額にバイアスが入る。年下パートナーなら保守側、年上パートナーなら楽観側。
  - **修正方針**: `partnerGrowthYears = Math.max(0, Math.min(yearsElapsed, partnerUntilAge − partnerCurrentAge))`（`partnerCurrentAge` を追加する）。`state.profile.partnerBirth` から算出可能。

### 🟡 Important

- **`02-I01` 現役期の生活費インフレが適用されない（`finance.inflationRate` が計算未使用）**
  - `finance.inflationRate`（既定 2%、`index.html:2660, 9714`）は保存・表示されるが、`getExpenseForYear` および `calcIntegratedSim` の pre-retirement ループでは**一切掛け合わされない**。リタイア後のシミュレーションのみ `retirement.inflationRate`（既定 1.5%、別変数）を使う。
  - **数値例（月間生活費 25 万 / `finance.inflationRate = 2%` / シミュレーション 20 年）**:
    - 初年度 生活費: `25 × 12 = 300 万円`
    - 20 年後の実質同等（正しい名目）: `300 × 1.02^20 = 300 × 1.485947 ≈ 445.78 万円`
    - 本コードでの 20 年後: `300 万円`（不変）
    - **過少評価**: `(445.78 − 300) / 445.78 ≈ 32.69%`
  - 30 年シミュレーションでは `300 × 1.02^30 ≈ 543.41 万円` 対 `300 万円` → 過少評価 `≈ 44.79%`。
  - **影響**: 現役期の年間収支・累計手元現金・FIRE 到達年の判定が**楽観側に大きく振れる**。収入側は `incomeGrowthRate`（ユーザー明示入力）で伸びる一方、支出は据え置きになるため、「貯蓄余力」が体系的に過大推計される。
  - 判例的影響: 生活費 25 万・初年収 500 万・昇給 2% のケースで `finance.inflationRate = 2%` のとき、収入と支出が同率で伸びるなら実質貯蓄率は一定に保たれるべきだが、本コードでは支出が固定されるため貯蓄率が時間とともに**機械的に拡大**する。
  - **修正方針**: `getExpenseForYear(yr)` の `base` に `Math.pow(1 + (state.finance.inflationRate ?? 2)/100, yr − currentYear)` を掛ける。ただし呼び出し側（`calcIntegratedSim` の `pureExp` 分離など）にも波及するため影響範囲大。または少なくとも `calcIntegratedSim` の年次ループ側で `annualExpense × infFactor` とするのが最小侵襲。

- **`02-I02` 2 つのインフレ率が既定値も用途も別になっている**
  - `state.finance.inflationRate`（既定 2%、`index.html:2660`）: 表示の実質変換のみ。
  - `state.retirement.inflationRate`（既定 1.5%、`index.html:14650, 17192`）: リタイア後シミュレーションの支出複利に使用。
  - **問題点**: ユーザーが UI で片方だけ変えた場合、現役期表示と退職期計算で不整合。また `02-I01` の修正が行われると、3 つの用途で 2 種類の既定値が使われる状態になりさらに混乱する。
  - **修正方針**: 単一のインフレ率に統一するか、UI で「現役期・退職期で異なる値を使う」ことを明示。あるいは `finance.inflationRate` をマスターとし、`retirement.inflationRate` は optional なオーバーライドとして扱う。

- **`02-I03` `cashFlowEvents.income_change` 適用時に本人の昇給モデルが完全停止**
  - `hasOverride` が true になると、`selfIncome = baseIncome`（イベントの額そのまま、以後の昇給なし、`index.html:17119-17120`）。
  - **想定されるユーザー操作**: 「40 歳で転職して年収 600 万になる」を登録 → 40 歳以降の年収が **永久に 600 万のまま**。昇給率 `g` は 40 歳以降の転職後キャリアには全く効かない。
  - **影響**: 若いうちに転職イベントを登録するほど生涯年収が過少推計される。50 歳 `untilAge` まで 10 年昇給機会を失う計算。`g = 2%` なら 10 年で `1.02^10 ≈ 1.219` 倍 → 転職後年収が機械的に 18% 過少推計される可能性。
  - **修正方針**: 選択肢A: `income_change` イベントに「その後も昇給を続けるか」のフラグを持たせる。選択肢B: イベントの base を出発点にして `pow(1+g, yr−eventYear)` を適用。UI 意図の明確化と合わせて設計が必要。

### 🟢 Minor

- **`02-M01` `incomeGrowthUntilAge` 既定値 50 が賃金構造基本統計調査のピーク（55〜59 歳）より早い**
  - 既定値 50 歳は、公的統計上のピーク年齢（男性 55〜59 歳、女性 45〜49 歳、<https://www.mhlw.go.jp/toukei/itiran/roudou/chingin/kouzou/z2024/dl/14.pdf>）と完全には整合しない。
  - 性別・職種による分岐もない。
  - 影響は小さい（最大 9 年の昇給機会損失）が、UI の helper テキストで「典型値は 55 歳前後」と案内するか、既定値を 55 に変えるのが妥当。

- **`02-M02` 年収変化に伴う給与所得控除・税区分変化が未反映**
  - 本コードの `getIncomeForYear` は「手取り or 額面」の 1 値をそのまま年次適用するだけで、昇給で年収帯が変わったときの控除カーブ（国税庁 No.1410、<https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1410.htm>）は適用されない。
  - 手取り入力モード (`_inputMode = 'net'`) で使っている限り、ユーザーが大きな昇給を想定すると実質的な手取りとの乖離が発生する。
  - 上位の税計算（タスク ⓐ 統合シミュレーション）の範疇のため本監査では指摘のみ。

- **`02-M03` 繰り返し支出の `excludeYears` の型ずれリスク**
  - `(e.excludeYears || []).includes(year)` は厳格比較（`===`）。`year` は number だが、保存形式によっては文字列混入の可能性（JSON import/旧データ経路）。UI の保存ロジックで number として保存する実装を保持している限り問題ないが、`importData` 経路は未検証。

- **`02-M04` `getIncomeForYear` の複数 `income_change` イベント重複時のタイブレークが配列順依存**
  - `sort((a,b) => a.startAge − b.startAge)` は同年イベントで安定ソートを前提に置いているが、V8 は ES2019 以降安定ソートを保証する一方、タイ時の順序は「配列順のまま」になる。**UI で同年にイベントを 2 個入れた場合、後に入力した方が勝つか最初に入力した方が勝つかは実装依存**。通常問題にはならないが、明確な優先順位（例: 最新の登録を優先）を定義すべき。

- **`02-M05` `one_time_expense` の符号チェックなし**
  - `total - (e.amount || 0)` は `amount < 0` で二重マイナス → 収入として扱われる。UI 側の入力検証が外れると挙動が変わる。

- **`02-M06` 年境界（12/31→1/1）で `ageToYear` と `calcAge` の 1 年ズレ**
  - `calcAge` は月日を考慮するが `ageToYear(age) = currentYear + (age − ca)` は年単位しか見ない。早生まれ・遅生まれの 1 月頭のタイミングで「今年の年齢」と「`ageToYear(age)` が返す年」が合わない日が年初に発生しうる。影響軽微だが境界テストは推奨。

- **`02-M07` `getOneTimeForYear` の内部で `getRecurringExpenseForYear` を減算している**
  - 呼び出し側が `getOneTimeForYear + getRecurringExpenseForYear` と並べて両方引くと**二重計上**になる。`calcIntegratedSim` (`index.html:14261-14262`) は `oneTime` しか使わないので OK だが、グラフ描画側で両方引く箇所がないか（`getRecurringExpenseForYear` の独立呼び出し `index.html:13736, 17565, 18358, 18620` と併用される箇所）は継続監査が望ましい。

## 7. 結論

- **信頼度**: ❌ 要対応
- **一言サマリー**: 複利昇給・ボーナス合算・繰り返し支出・一時収支の**数式レベルは標準的な FP 計算と整合**しているものの、(1) パートナー昇給年数に**本人年齢**を使う実装バグ (`02-C01`)、(2) **現役期の生活費にインフレが一切適用されない** (`02-I01`)、(3) インフレ率変数が `finance.inflationRate` と `retirement.inflationRate` の**二重管理・既定値不一致** (`02-I02`)、(4) 転職イベント後に本人の昇給モデルが完全停止する設計 (`02-I03`)、という 4 つの問題が**直接的に年次収支・FIRE 達成年の推計に大きなバイアス**を与える。
- **信頼度 ❌ 要対応 の根拠**: `02-C01` は **設計上の単純バグ**であり夫婦年齢差 10 年で ≈25〜34% の過大/過少見積もり（20 年後時点）を生む。`02-I01` は `finance.inflationRate` を保持しながら計算に使わないというモデルの内部矛盾で、20 年シミュレーションで支出を 約 32.7%（既定 2%・20 年）、30 年で 約 44.8%（既定 2%・30 年）過少推計する。どちらも他領域の監査（`01-I01` 等）より直接的で、単独で `❌` 判定に足る。
- **申し送り**:
  - `02-C01` はタスク 7（ⓔ パートナーのリタイア）と併せて **1 か所の修正で両方の副作用が直せる可能性**があるため、タスク 7 で計算経路を総点検する。
  - `02-I01` / `02-I02` はタスク 10（ⓐ 統合シミュレーション監査）に申し送り。現役期のキャッシュフロー表・累計手元現金・FIRE 達成年に系統誤差として効くため、タスク 11 のサニティウォークスルーで「20 年後の生活費が 300 万のまま表示される」ことを実画面で確認すること。
  - `02-I03` は UI 仕様の意思決定を要する（「転職後も昇給するか」をユーザーに聞くか既定を決める）ため、監査の範囲では問題提起のみ。
