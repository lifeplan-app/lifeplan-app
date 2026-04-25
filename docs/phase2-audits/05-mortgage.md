# 監査レポート：住宅ローン元利均等返済・住宅ローン控除（ⓓ）

- **対象領域**: ⓓ 住宅ローンの月次返済額・年次スケジュール・年次返済負担・住宅ローン控除（住宅借入金等特別控除）の算出
- **監査日**: 2026-04-24
- **信頼度判定**: ❌ 要対応

## 対象範囲

- `calcMonthlyPayment(principal, annualRate, remainingMonths)` (`index.html:12547-12553`) — 元利均等返済の月額を返す純関数。
- `calcMortgageSchedule()` (`index.html:12555-12605`) — `state.lifeEvents.mortgage` を見て、暦年 → `{ monthlyPayment, principalStart, principalEnd }` の `Map` を返す。繰上返済 `prepay` と借換 `refi` イベントを反映。
- `calcMortgage()` (`index.html:12607-12641`) — UI のシミュレーションボタン連動で、入力値を `state.lifeEvents.mortgage` に同期しつつ月額・総返済額・利息総額・控除サマリーを描画。
- `updateMortgageDeductResult()` (`index.html:12643-12701`) — 控除適用期間中の年次控除額（年末残高×0.7%、上限 31.5 万円/年）と累計還付額の UI プレビュー。
- `calcMortgageDeduction(year, balance)` (`index.html:17223-17231`) — 統合シミュレーションと退職シミュレーションの両方が呼ぶ年次控除額算出関数。
- 住宅ローン控除フィールド: `leMortgageDeductStart` / `leMortgageDeductYears`（`0`/`10`/`13` の 3 択、既定 13）(`index.html:2865-2883`)。
- 控除ループの呼出し元:
  - 統合シミュレーション `calcIntegratedSim` (`index.html:14275-14295`) — 現役期に適用。**年末残高は `principal × (1 − elapsed/term)` の線形近似**（`calcMortgageSchedule` 未使用）。
  - 退職シミュレーション `calcRetirementSim` (`index.html:17542-17601`) — `calcMortgageSchedule()` の `principalEnd` を使用（厳密）。
  - ストレステスト `calcStressTestSim` (`index.html:18381-18390`) — こちらも **線形近似**。
- `state.lifeEvents.mortgage` のフィールド: `amount`（借入額, 万円）/ `rate`（年利, %）/ `term`（返済期間, 年）/ `rateType`（`fixed` or `variable`）/ `startYear`（借入開始年）/ `monthlyPayment`（表示用キャッシュ）/ `deductStart`（控除開始年）/ `deductYears`（控除期間, 年）/ `events[]`（`{ type: 'prepay'|'refi', year, amount?, method?, newRate?, newTerm? }`）。
- **`downPayment` フィールドは主経路に存在しない**（住居シナリオ比較 `lifeScenario` だけが `sc.downPayment` を持つ）。

## 1. 関数の目的と入出力

### 1.1 `calcMonthlyPayment(principal, annualRate, remainingMonths)`

- **目的**: 元利均等返済の月返済額（万円/月）を計算する純関数。
- **入力**:
  - `principal`: 借入残高（万円）
  - `annualRate`: 年利（%）—例 `1.5`
  - `remainingMonths`: 残回数
- **戻り値**: `number`（万円/月）。`principal = 0` または `remainingMonths = 0` は `0` を返す。`annualRate = 0` は `principal / remainingMonths` を返す（ゼロ除算回避）。

### 1.2 `calcMortgageSchedule()`

- **目的**: 繰上返済・借換を反映した年次返済スケジュールを算出。
- **入力**: `state.lifeEvents.mortgage.{amount, startYear, term, rate, events}`。
- **戻り値**: `Map<year, { monthlyPayment: number, principalStart: number, principalEnd: number }>`。金額はすべて万円。`amount` / `startYear` / `term` のいずれかが欠けると空 Map を返す。
- `events` は年順にソート後、各暦年の最初に処理。`prepay.method === 'payment'` は「返済額軽減型」（期間据置、月額再計算）、それ以外（`'period'` など）は「期間短縮型」（月額据置、残期間再計算）。`refi` は金利 `newRate` と残期間 `newTerm` で `monthly` を再計算。

### 1.3 `calcMortgage()` / `updateMortgageDeductResult()`

- `calcMortgage()` は UI の `leMortgage*` 入力から `amount` / `rate` / `term` / `startYear` / `deductStart` / `deductYears` を読み、`state.lifeEvents.mortgage` を `Object.assign` で上書きし、月額・総返済・利息総額を描画。
- `updateMortgageDeductResult()` は `deductStart` から `deductStart + deductYears − 1` までの各年について、`calcMortgageSchedule().get(yr).principalEnd × 0.007` と `31.5` のうち小さい方を合算し、初年度・平均・累計を表示。**0.7% と 31.5 万円/年の上限はハードコード**（`index.html:12665`, `17230`）。

### 1.4 `calcMortgageDeduction(year, balance)`

- `year >= deductStart && year <= deductStart + deductYears - 1` の範囲で `Math.min(balance × 0.007, 31.5)`、範囲外は `0`。
- 控除期間は `state.lifeEvents.mortgage.deductYears` 固定。**「所得税額」や「住民税」との突合はなし**で、納税額に関係なく「年末残高 × 0.7%（上限 31.5 万円）」を丸ごとキャッシュフローに還付として加算する。

## 2. 使用している計算式

### 2.1 元利均等返済の月額（`calcMonthlyPayment` at `index.html:12548-12553`）

```js
function calcMonthlyPayment(principal, annualRate, remainingMonths) {
  if (!principal || !remainingMonths) return 0;
  const r = annualRate / 100 / 12;
  return r === 0 ? principal / remainingMonths
    : principal * r * Math.pow(1+r, remainingMonths) / (Math.pow(1+r, remainingMonths) - 1);
}
```

- 数式: `M = P × r × (1+r)^n / ((1+r)^n − 1)`、月利 `r = annualRate / 100 / 12`、n = `remainingMonths`。
- 単位は `principal` と同じ（万円入力なら万円/月、円入力なら円/月）。

### 2.2 年次ローンスケジュール（`calcMortgageSchedule` at `index.html:12556-12605`）

```js
let monthly = calcMonthlyPayment(principal, rate, (endYear - startYear) * 12);
for (let year = startYear; year < endYear && principal > 0.01; year++) {
  // イベント処理（この年の開始時）
  for (const ev of events) {
    if (ev.type === 'prepay') {
      const amt = parseFloat(ev.amount) || 0;
      principal = Math.max(0, principal - amt);
      if (ev.method === 'payment') {
        const remaining = (endYear - year) * 12;
        monthly = calcMonthlyPayment(principal, rate, remaining);
      } else {
        // 期間短縮型
        const r = rate / 100 / 12;
        const newN = r === 0 ? Math.ceil(principal / monthly)
          : Math.ceil(Math.log(monthly / (monthly - principal * r)) / Math.log(1 + r));
        endYear = year + Math.ceil(newN / 12);
      }
    } else if (ev.type === 'refi') {
      rate = parseFloat(ev.newRate) || rate;
      const newTerm = parseInt(ev.newTerm) || (endYear - year);
      endYear = year + newTerm;
      monthly = calcMonthlyPayment(principal, rate, newTerm * 12);
    }
  }
  const r = rate / 100 / 12;
  let p = principal;
  for (let mo = 0; mo < 12 && p > 0.01; mo++) {
    const interest = p * r;
    const principalPay = Math.min(p, monthly - interest);
    p -= principalPay;
  }
  schedule.set(year, { monthlyPayment: monthly, principalStart: principal, principalEnd: Math.max(0, p) });
  principal = Math.max(0, p);
}
```

- 毎月ループで「利息 = 残高 × 月利」「元金分 = 月額 − 利息（ただし残高上限）」の正攻法。
- 期間短縮型の残回数は `newN = ⌈log(M / (M − P×r)) / log(1+r)⌉`（一般に元利均等の完済回数を解く公式）。

### 2.3 控除額（`calcMortgageDeduction` at `index.html:17223-17231`）

```js
function calcMortgageDeduction(year, balance) {
  const p = getRetirementParams();
  if (!p.mortgageDeductStart || !p.mortgageDeductYears || !balance) return 0;
  const endYear = p.mortgageDeductStart + p.mortgageDeductYears - 1;
  if (year < p.mortgageDeductStart || year > endYear) return 0;
  return Math.min(balance * 0.007, 31.5);
}
```

- 数式: `deduction = min(balance × 0.007, 31.5)` 万円/年。範囲外は 0。
- 上限 31.5 万円は「`4500 万 × 0.007 = 31.5`」から逆算した**長期優良住宅・低炭素住宅**の借入限度額 4,500 万円ケースの控除上限。**他の住宅種別（一般住宅 2,000 万、ZEH 3,500 万、省エネ 3,000 万）で必要な上限は切り替わらない**（§3.3）。

### 2.4 統合シミュレーションの残高推定（`calcIntegratedSim` at `index.html:14275-14285`）

```js
const mortgageBalanceInteg = (() => {
  const m = state.lifeEvents?.mortgage || {};
  const principal = parseFloat(m.amount) || 0;
  const startYr = parseInt(m.startYear) || currentYear;
  const term = parseInt(m.term) || 35;
  const elapsed = yr - startYr;
  if (elapsed < 0 || elapsed >= term || !principal) return 0;
  return principal * (1 - elapsed / term);
})();
const annualMortgageDeduct = y === 0 ? 0 : calcMortgageDeduction(yr, mortgageBalanceInteg);
```

- 数式: `balance_approx = principal × (1 − elapsed / term)` の**線形減衰**。`calcMortgageSchedule` は呼ばない。
- 同じ線形式が `calcStressTestSim` (`index.html:18381-18389`) にも複製されている。

## 3. 標準との突合

### 3.1 元利均等返済の公式との一致

- **標準**: `M = P × r × (1+r)^n / ((1+r)^n − 1)`（月利 `r = 年利 / 12`、n = 総回数）。
  - 出典: 三井住友銀行「住宅ローン金利の計算方法」 <https://www.smbc.co.jp/kojin/jutaku_loan/column/kinri_calculation/>
  - 出典: keisan.casio.jp「ローン返済（毎月払い）」 <https://keisan.casio.jp/exec/system/1256183644>
  - 出典: SBI マネープラザ「金利から利息を計算する方法」 <https://mponline.sbi-moneyplaza.co.jp/housingloan/articles/20200903risokukeisan.html>
- **本コード** (`index.html:12550-12552`): `r = annualRate / 100 / 12` で月利、`principal * r * Math.pow(1+r, n) / (Math.pow(1+r, n) - 1)`。
- **判定**: ✅ 一致。月利換算、公式ともに標準通り。
- **検算（P = 3,000 万、annualRate = 1.5、term = 35 年 = 420 回）**:
  - `r = 1.5 / 100 / 12 = 0.00125`
  - `(1+r)^n = 1.00125^420`; `ln(1.00125) ≈ 0.0012492`; `420 × 0.0012492 = 0.52465`; `e^0.52465 ≈ 1.68996`
  - `M = 3000 × 0.00125 × 1.68996 / (1.68996 − 1) = 3000 × 0.00125 × 1.68996 / 0.68996 = 6.3374 / 0.68996 ≈ 9.1849 万円/月`
  - 三井住友銀行シミュレーター：3,000 万円・35 年・1.5% で月額 **91,855 円 ≈ 9.186 万円**（端数処理で誤差 ±1 円）。 → **一致**。

### 3.2 月次残高推移（`calcMortgageSchedule` の内部ループ）

- **標準**: 毎月「利息 = 前残高 × 月利」を確定 → 「元金返済 = 月額 − 利息」→ 残高を更新。
  - 出典: エクセルサプリ「エクセルで利息計算！住宅ローンにも使える元利均等返済方式」 <https://excel.resocia.jp/aggregation/1590/>
- **本コード** (`index.html:12596-12600`): まさにその式で 12 回/年 を回す。
- **判定**: ✅ 一致。正攻法の償却スケジュール。
- **検算（P = 3,000 万、r = 0.00125、M = 9.1849 万）、1 年後残高**:
  - 解析式: `残高_k = P × (1+r)^k − M × ((1+r)^k − 1)/r`、k = 12。
  - `(1+r)^12 = 1.00125^12 ≈ 1.01510`
  - `P × 1.01510 = 3045.29`
  - `M × (1.01510 − 1)/0.00125 = 9.1849 × 0.01510 / 0.00125 = 9.1849 × 12.0827 = 110.98`
  - 残高 = `3045.29 − 110.98 = 2934.31 万円`
  - 本コードの 12 回ループでもこの値に収束する（逐次計算と解析式は同値）。

### 3.3 住宅ローン控除の控除率・控除期間・借入限度額（2026 年時点）

- **標準**:
  - 控除率: **0.7%**（令和 4 年 (2022 年) 以降入居の一律）。
  - 控除期間: **新築・買取再販** = 13 年、**既存住宅（中古）** = 10 年（令和 6・7 年入居の省エネ基準不適合・一般住宅は 0 年すなわち対象外）。
  - 借入限度額（新築、令和 6・7 年入居、子育て特例非該当の場合）:
    - 認定住宅（長期優良・低炭素）: **4,500 万円** × 0.007 = **31.5 万円/年**
    - ZEH 水準省エネ住宅: **3,500 万円** × 0.007 = **24.5 万円/年**
    - 省エネ基準適合住宅: **3,000 万円** × 0.007 = **21.0 万円/年**
    - その他の住宅（一般住宅・新築）: **借入限度額 0 円**（令和 6 年以降、省エネ基準を満たさない新築は**原則適用外**）
  - 子育て世帯・若者夫婦世帯の特例（令和 6・7 年入居）: 認定 5,000 万 / ZEH 4,500 万 / 省エネ 4,000 万（令和 4・5 年水準）。
    - 出典: 国税庁 No.1211-1「住宅の新築等をし、令和 4 年以降に居住の用に供した場合」 <https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1211-1.htm>
    - 出典: 国土交通省「住宅ローン減税の制度内容が変更されます！～令和 6 年度税制改正～」 <https://www.mlit.go.jp/report/press/house02_hh_000189.html>
    - 出典: 国土交通省「住宅：住宅ローン減税」 <https://www.mlit.go.jp/jutakukentiku/house/jutakukentiku_house_tk2_000017.html>
    - 出典: 国土交通省「住宅ローン減税の子育て世帯等に対する借入限度額の上乗せ措置等を令和 7 年も引き続き実施します」 <https://www.mlit.go.jp/report/press/house02_hh_000206.html>
- **本コード**:
  - 控除率 0.7% はハードコード（`index.html:12665`, `17230`）。
  - 控除期間は UI 上「0年 / 10年 / 13年」の 3 択固定、**住宅種別セレクタは存在しない**。`deductYears` 既定 13。
  - 上限 31.5 万円も**ハードコード**。種別切替 UI なし。
  - **借入限度額（上限 × 0.7%）の自動判定は一切なし**。ユーザーが `amount` に 5,000 万円を入力すれば、コードは「年末残高 5,000 万 × 0.007 = 35 万円」を計算した後に `min(35, 31.5) = 31.5 万円` で丸める（実質 4,500 万円に強制下押し）。逆に「一般住宅・新築・非省エネ」なら本来控除 0 だが、コードは平然と 0.7% を適用して税還付を還元する。
- **判定**: ⚠️ → ❌ 複数層の欠落。
  - 控除率 0.7% は 2022–2025 年の居住対応で一致（令和 6・7 年も据え置き）。
  - 31.5 万円の上限値は**長期優良住宅・認定住宅想定のみ**で正しく、他の 3 種別では**過大**。
  - 一般住宅の令和 6 年以降の**適用除外**が実装されていない（§6 `05-C01`）。
  - 子育て世帯特例（認定 5,000 万円 × 0.7% = 35 万円/年）に届かない（§6 `05-I01`）。

### 3.4 住宅ローン控除の「所得税から引ききれない分を住民税から」ルール

- **標準**: 控除額を所得税額から控除し、控除しきれなかった額は翌年度の個人住民税から控除。ただし**住民税からの控除上限**は「前年分の所得税の課税総所得金額等の **5%、かつ 97,500 円**（令和 4 年以降入居）」。
  - 出典: 総務省「所得税から住宅ローン控除額を引ききれなかった方」 <https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/090929.html>
  - 出典: 国税庁 No.1211-1 <https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1211-1.htm>
- **本コード**: `mortgageDeduct` を `totalNonAssetIncome` (`index.html:17609`) および累積キャッシュフロー (`index.html:14295`) にそのまま加算。
  - **年間の所得税額・住民税額の試算を一切していない**。ユーザーの年収が低く「所得税 + 住民税（上限 9.75 万円）< 控除可能額」となる場合でも、差分を無視して全額キャッシュフローに加算する。
  - 例: 年収 300 万円・配偶者控除・扶養なしで所得税約 5.5 万円・住民税約 11.8 万円と仮定すると、合計の実質還付上限は「所得税 5.5 万 + min(住民税, 9.75 万) = 5.5 + 9.75 = 15.25 万円」程度。借入残高 3,000 万円（控除額 21 万円）でも**現実には約 15.25 万円しか戻らない**。本コードは 21 万円を還付として加算してしまう。
- **判定**: ⚠️ 少なくとも「低所得層・共働きでない片働き世帯」で**年間最大 6〜16 万円の過大推計**が継続する。`02-C01`（所得税概算未実装）・`05-C02`（本監査）の両方で同根。税額シミュレーションのハブ関数が存在しないため、構造的欠陥（§6 `05-C02`）。
- **数値検算（年収 500 万・独身・標準的控除のみ、借入 3,500 万、1 年目）**:
  - 控除可能額: `3500 × 0.007 = 24.5 万円`（ZEH 水準と仮定）
  - 課税所得（源泉徴収票ベース概算）: 500 × 0.75 − 48 − 55 ≈ 272 万円
  - 所得税（税率 10%、控除 97,500 円）: `272 × 0.10 − 9.75 = 17.45 万円`
  - 住民税控除上限: `min(272 × 0.05, 9.75) = min(13.6, 9.75) = 9.75 万円`
  - 実還付合計: `min(17.45, 24.5) + min(max(24.5 − 17.45, 0), 9.75) = 17.45 + 7.05 = 24.5 万円` → この年は**たまたま控除額を全額使い切り**。
  - しかし年収 350 万なら所得税 ≈ 7 万、住民税上限 9.75 → 合計 16.75 万、控除額 24.5 万と差 7.75 万円が**消化できず欠損**。本コードはこれを見逃し年間 7.75 万円（控除期間 13 年で最大 100 万円オーダー）を過大計上する。

### 3.5 繰上返済（期間短縮型・返済額軽減型）の計算

- **標準**:
  - **返済額軽減型**: 繰上返済後の残債 P' に対して、残期間据え置きで月額 M' を再計算 `M' = P' × r × (1+r)^n / ((1+r)^n − 1)`（n は残回数）。
  - **期間短縮型**: 月額 M 据え置きで残回数 n' を求める。`n' = log(M / (M − P' × r)) / log(1 + r)`（整数回数に切り上げ）。
  - 出典: 住宅金融普及協会「繰上返済と借換え（一部繰上返済）」 <https://www.sumai-info.com/loan-knowledge/life_simulate_redemption.html>
  - 出典: ノムコム「繰上返済とは（期間短縮型・返済額軽減型）」 <https://www.nomu.com/loan/knowledge/smp/movedup.html>
  - 出典: keisan.site「繰上げローン返済」 <https://keisan.site/exec/system/1256183302>
- **本コード** (`index.html:12575-12585`):
  - 返済額軽減型は `method === 'payment'` の分岐で `calcMonthlyPayment(principal, rate, remaining)` を再実行。標準通り。
  - 期間短縮型は `newN = ⌈log(M / (M − P × r)) / log(1 + r)⌉`、`endYear = year + ⌈newN / 12⌉`。標準通り。
- **判定**: ✅ 数学的には一致。
- **仕様上の留意**:
  - 期間短縮型で `endYear` を「年単位」に切り上げ → 最終年の月額返済回数が 12 ヶ月に満たない可能性があるが、`calcMortgageSchedule` の内部 12 ヶ月ループは `p > 0.01` で早期終了するので最終年の過大計上は発生しない。
  - 繰上返済手数料（銀行によって 0〜数万円）は全く加味されない（§6 `05-M01`）。
  - `method` の `'period'`（期間短縮型）以外の値・未指定の場合もすべて else 分岐で期間短縮型として処理される (`index.html:12579`)。`calcLECostByYear` 側の UI では `method === 'payment'` を返済額軽減型として明示するが、デフォルト値の欠落時の挙動が UI と一致するかは要確認（§6 `05-M02`）。

### 3.6 統合シミュレーションでの残高線形近似 vs 償却残高

- **標準**: 元利均等返済の k ヶ月経過時の残高は `P_k = P × (1+r)^k − M × ((1+r)^k − 1) / r` で、**初期は元金減少が遅く、末期に急減**する凹形。
- **本コード** (`index.html:14276-14284`, `18381-18389`): `P_k = P × (1 − k_year / term)` の**線形減衰**近似。
- **判定**: ❌ 控除額計算で誤差が無視できない。
- **数値検算（P = 3,000 万、年利 1.5%、35 年、1 年経過時点）**:
  - 線形近似: `3000 × (1 − 1/35) = 3000 × 0.97143 = 2914.29 万円`
  - 償却正解: `3000 × 1.01510 − 9.1849 × 12.0827 = 3045.29 − 110.98 = 2934.31 万円`
  - 差: `2934.31 − 2914.29 = 20.02 万円`（線形が **0.68% 過少**）
- **数値検算（同条件、10 年経過）**:
  - 線形近似: `3000 × (1 − 10/35) = 3000 × 0.71429 = 2142.86 万円`
  - 償却正解: `P × (1+r)^120 − M × ((1+r)^120 − 1) / r = 3000 × 1.16204 − 9.1849 × 129.634 = 3486.11 − 1190.66 = 2295.45 万円`
  - 差: `2295.45 − 2142.86 = 152.59 万円`（線形が **6.65% 過少**）
- **数値検算（同条件、13 年経過 = 控除最終年）**:
  - `(1+r)^156 = exp(156 × 0.0012492) = exp(0.19488) = 1.21513`
  - 線形近似: `3000 × (1 − 13/35) = 3000 × 0.62857 = 1885.71 万円`
  - 償却正解: `3000 × 1.21513 − 9.1849 × (1.21513 − 1)/0.00125 = 3645.39 − 9.1849 × 172.10 = 3645.39 − 1580.75 = 2064.64 万円`
  - 差: `2064.64 − 1885.71 = 178.93 万円`（線形が **8.67% 過少**）
- **控除インパクト**: 控除額は `balance × 0.007` なので、13 年目で 178.93 × 0.007 = **1.25 万円/年の過少計上**、13 年積算で最大約 10 万円オーダーの過少差異。
- **さらに**: 統合シミュレーション `calcIntegratedSim` は繰上返済・借換も**一切反映しない**（`events[]` を参照しない線形式）ので、繰上返済が登録されていても現役期の控除は線形モデルのまま。これは退職シミュレーション（`calcMortgageSchedule` 使用）と**算出値が食い違う**恒常的乖離（§6 `05-C03`）。

### 3.7 `downPayment` の扱い（タスク 4 からの申し送り `03-M05`）

- タスク 4 監査 `03-M05`: 「`le.mortgage.downPayment` と `state.expenses[]` の二重カウント懸念」。
- **検証結果**: `state.lifeEvents.mortgage` の主経路（`calcMortgage()` / `calcMortgageSchedule()` / `calcIntegratedSim` / `calcRetirementSim`）には **`downPayment` フィールド自体が存在しない**。
  - `downPayment` を参照するのは `state.lifeScenario.housingOptions[]`（住居選択シナリオ比較、`index.html:5711-5813`, `21796-22147`）**のみ**。これは退職時点の資産から一度だけ `deduction` として差し引く独立経路で、メインの統合・退職シミュレーションとは**連動しない別エンジン**。
  - UI の住居計画フォーム（`#housingPanelMortgage`, `index.html:2835-2884`）には頭金入力フィールドすら存在しない。ユーザーが「借入額」だけを入力する想定。
  - 購入総額ではなく**借入額（`amount`）を直接入力**させる設計のため、頭金は `state.expenses[]` に「住宅購入時の一時支出」として別登録するのが UI 想定上の導線。
- **判定**: タスク 4 の `03-M05` は **`downPayment` の二重カウントは発生しない**（フィールドがそもそも主経路にない）が、**別の問題が 2 つ**浮上。
  - **`05-I02` 購入諸費用・頭金の計上導線が不透明**: ユーザーは物件価格 3,500 万・頭金 500 万・借入 3,000 万のケースで `amount = 3000` を入力する必要があるが、UI のラベルは「借入額（万円）」と書かれているだけで、**頭金の別途登録を促す注記はない**。`state.expenses[]` 側では「カテゴリ: 一時支出」で手入力する必要があり、ユーザーが購入当年の資産減少を忘れて過大シミュレーションする温床。
  - **`05-I03` シナリオ比較 (`lifeScenario`) の `downPayment` はシナリオ間で整合せず、本編シミュレーションに反映されない**: `lifeScenario.housingOptions[].downPayment` を変更しても `state.lifeEvents.mortgage` / `state.expenses[]` は書き換わらない。ユーザーがシナリオ比較で「頭金 1,000 万が最適」と判断しても、その知見がメインのプランに反映されない。
- **タスク 4 `03-M05` への回答**: **二重カウントは発生しないが、逆に「計上漏れ」がしばしば発生する**。フェーズ 3 で UI に頭金入力欄を追加する際に `expenses[]` への自動同期ロジックが必要。

## 4. 仮定・制約

1. **元利均等返済のみサポート**。元金均等返済（毎月の元金返済額が一定、初期返済額が大きい）は非対応（§6 `05-M03`）。
2. **固定金利想定**。`rateType = 'variable'` を選べるがシミュレーションは年利固定のまま（金利上昇シナリオの反映なし、§6 `05-M04`）。
3. **ボーナス返済非対応**。月額のみ。
4. **返済期間は整数年**（内部は月次計算だが入力は年単位）。
5. **住宅ローン控除は「年末残高 × 0.7%、上限 31.5 万円/年」のハードコード**で住宅種別非対応。
6. **控除可能額 = 実還付額と同値視**。所得税・住民税の納付額を考慮せず、税引き後キャッシュフローに直接加算（§3.4）。
7. **統合シミュレーションの残高は線形近似**で、退職シミュレーションの償却残高と食い違う（§3.6）。
8. **繰上返済手数料 0 円**（§3.5）。
9. **借換時の諸費用（事務手数料、登記費用、保証料精算）は 0 円**（借換イベント `refi` には `newRate` と `newTerm` しかない、§6 `05-I04`）。
10. **団信保険料は別建て**: 本コードには団信関連フィールドなし。実際の金融機関では金利に 0.1〜0.3% 加算されるケース（がん団信等）があるが、ユーザーが `rate` に加算して入力する前提。

## 5. エッジケース

1. **`annualRate = 0`**: `calcMonthlyPayment` は `principal / remainingMonths` で線形返済。無利子の親族融資を表現可能。✅
2. **`principal = 0` / `remainingMonths = 0`**: `calcMonthlyPayment` は 0 を返す。✅
3. **`amount` 未設定 / `startYear` 未設定 / `term` 未設定**: `calcMortgageSchedule` は空 Map を返す。呼出し側は `schedule.get(yr)` が `undefined` で 0 として扱う。✅
4. **繰上返済で `amount` が残高以上**: `principal = Math.max(0, principal - amt)` で 0 に張り付く。期間短縮型の `log(M / (M − P×r))` で `P = 0` なら `log(M / M) = log(1) = 0` → `newN = 0` → `endYear = year` で即完済扱い。✅
5. **繰上返済で `principal * r >= monthly`（利息が月額を食い尽くす）**: `log(M / (M − P×r))` の分母が 0 以下になり NaN または -Infinity。`endYear = year + Math.ceil(NaN / 12) = year + NaN` → ループ条件 `year < endYear` は `NaN` との比較で **false**、ループが停止し以降の年次エントリーが消える（§6 `05-I05`）。
6. **借換 `refi` で `newTerm` 未設定**: `parseInt(undefined) || (endYear - year)` で残期間据え置き。✅
7. **`deductStart` が `startYear` より前**: UI 上は入力可能。`calcMortgageDeduction` は `year >= deductStart` で判定するので、借入前の年も控除加算される可能性（`balance = 0` で 0 になるので実害はないが UI エラーが望ましい、§6 `05-M05`）。
8. **`deductYears = 10` と `13` の切替のみ**: 15 年（中古・買取再販の特例）や 20 年（かつての特例）には対応しない（§6 `05-M06`）。
9. **`events[]` が同年に複数 `prepay` + `refi`**: for-of ループで**配列順**に処理。ソート基準は `year` のみで type 優先度はない。`refi` が先なら金利変更後に繰上、`prepay` が先なら旧金利で繰上 → **順序依存で結果が異なる**（§6 `05-I06`）。
10. **`rate = 0` の繰上返済**: 期間短縮型分岐で `r === 0` → `newN = ⌈principal / monthly⌉`。✅
11. **`events[].year` が借入期間外**: for ループの外側 `for year = startYear; year < endYear` で到達しないのでスキップ。ただし「借入開始前に繰上返済」のような矛盾入力のバリデーションなし。
12. **控除期間中にローン完済**: `calcMortgageSchedule` が `principal > 0.01` で早期終了するため、完済後の年は `schedule.get(yr) = undefined` → `balance = 0` → `calcMortgageDeduction` が 0 を返す。✅
13. **控除期間中に借換え（`refi`）**: `calcMortgageSchedule` は残高を引き継いで新金利で続行。控除は同じ残高 × 0.7% で継続加算されるが、**実務上は借換え後に借入銀行変更が生じると**控除継続のための再適用手続き（税務署への借換届出）**が必要**な点は税務論点として別（§6 `05-M07`）。

## 6. 検出された問題（深刻度付き）

### 🔴 Critical

- **`05-C01` 住宅種別・借入限度額の自動判定が未実装で、一般住宅・新築に控除を不正付与**

  > **[Resolved in Phase 2.5 commit `65950e9`]** （詳細: `docs/phase2-5-fixes/expected-changes.md` の Group 3。05-C01 / 05-C02 / 05-C03 を同コミットでまとめて修正）

  - 2026 年時点の制度では、新築の**一般住宅（省エネ基準非適合）は控除対象外**。しかし本コードは `deductYears > 0` なら住宅種別を問わず `balance × 0.007` を加算する。UI に住宅種別セレクタが無い（`10 年 / 13 年` だけ）ため、ユーザーが「13 年を選べばお得」と思って選択した結果、**本来控除ゼロのケースで 13 年間最大 273 万円の架空還付**をキャッシュフローに積む可能性。
  - 数値インパクト（借入 3,000 万・一般新築・1.5%・35 年、本来 0 円のはずが）:
    - 13 年累計控除（線形残高・本コード）: 1 年目 21 万 + ... + 13 年目 ≈ 13.2 万、平均 17 万 × 13 年 ≈ **221 万円の架空還付**
  - 出典: 国税庁 No.1211-1 <https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1211-1.htm>
  - 出典: 国土交通省「住宅：住宅ローン減税」 <https://www.mlit.go.jp/jutakukentiku/house/jutakukentiku_house_tk2_000017.html>
  - **修正方針**: UI に住宅種別セレクタ（一般 / 省エネ / ZEH / 認定 / 子育て特例）を追加し、借入限度額・控除期間・2026 年以降の一般住宅除外ルールを表引きで設定。

- **`05-C02` 所得税・住民税の納税額考慮なしで控除全額をキャッシュフロー加算（低所得で過大還付）**

  > **[Resolved in Phase 2.5 commit `65950e9`]** （詳細: `docs/phase2-5-fixes/expected-changes.md` の Group 3）

  - §3.4 参照。`calcMortgageDeduction` は「控除可能額」をそのまま **`totalNonAssetIncome` / `cashFlow` に加算**。実還付は `min(所得税, 控除額) + min(所得税から引ききれない分, min(課税所得×5%, 9.75 万))` のはずが、後者の試算が存在しない。
  - 数値インパクト（年収 350 万、借入 3,500 万・ZEH・1.5%・35 年、1 年目）:
    - 本コードの控除加算: `24.5 万円`
    - 実還付上限: 所得税 ≈ 7 万 + 住民税上限 9.75 万 = `16.75 万円`
    - 過大: `(24.5 − 16.75) = 7.75 万円/年 ≈ 31.6% 過大`
    - 13 年累計（単純平均 7 万円乖離）: 約 **90 万円の架空還付**
  - 出典: 総務省「所得税から住宅ローン控除額を引ききれなかった方」 <https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/090929.html>
  - **修正方針**: `calcIncomeTax(year)` と `calcResidentTax(year)` のヘルパを作り、`min(控除額, 所得税 + min(課税所得×0.05, 9.75))` で取り決める。`02-C01` との統合修正案。

- **`05-C03` 統合シミュレーションの残高が線形近似で、退職シミュレーションと恒常乖離**

  > **[Resolved in Phase 2.5 commit `65950e9`]** （詳細: `docs/phase2-5-fixes/expected-changes.md` の Group 3）

  - §3.6 参照。現役期（統合シミュレーション）と退職後（退職シミュレーション）で**別の残高式**を使い、同じ暦年の控除額が食い違う。しかも統合シミュレーション側は**繰上返済・借換を無視**する線形式なので、ユーザーが繰上返済イベントを登録しても現役期の控除には一切反映されない。
  - 数値インパクト（繰上 500 万を 5 年目に登録、以降の 13 年目時点）:
    - 統合シミュレーション（線形、繰上無視）: 残高 1,885 万、控除 13.2 万
    - 退職シミュレーション（償却 + 繰上反映）: 残高 約 1,500 万想定、控除 10.5 万
    - 差: 2.7 万円/年、かつ**キャッシュフロー積算でも差が出る**
  - **修正方針**: `calcIntegratedSim` 内で `calcMortgageSchedule()` を呼び出し、`schedule.get(yr)?.principalEnd` を残高として使う。`calcStressTestSim` も同様に差し替え。計算コストは初回 1 回分の Map 生成のみなので影響軽微。

### 🟡 Important

- **`05-I01` 子育て世帯・若者夫婦世帯の借入限度額上乗せ措置（令和 6・7 年）未対応**

  > **[Resolved in Phase 4c commit `1b1726f`]** （詳細: `docs/phase4c-fixes/expected-changes.md` の Group 10-housing）

  - 認定住宅 5,000 万 × 0.007 = **35 万円/年**、ZEH 4,500 万 × 0.007 = **31.5 万円/年**、省エネ 4,000 万 × 0.007 = **28 万円/年**の特例。本コードはすべて 31.5 万円上限で頭打ち。
  - 数値インパクト（子育て特例・認定 5,000 万・1.5%・35 年、1 年目）:
    - 本コード上限: `min(4898 × 0.007, 31.5) = min(34.29, 31.5) = 31.5 万円`（本来は 34.29 万円が満額還付対象）
    - 不足: `34.29 − 31.5 = 2.79 万円/年`、13 年累計最大約 36 万円の過少推計
  - 出典: 国土交通省「住宅ローン減税の子育て世帯等に対する借入限度額の上乗せ措置等を令和 7 年も引き続き実施します」 <https://www.mlit.go.jp/report/press/house02_hh_000206.html>
  - **修正方針**: `05-C01` と同時に UI で「子育て特例適用あり」トグルを用意し、上限を動的に切替。

- **`05-I02` 頭金の計上導線がなく、ユーザーが購入当年の一時支出を忘れる設計**

  > **[Resolved in Phase 4c commit `1b1726f`]** （詳細: `docs/phase4c-fixes/expected-changes.md` の Group 10-housing）

  - タスク 4 `03-M05` の検証結果として新たに浮上。UI ラベルが「借入額」であり、物件価格や頭金を促すフィールドがない。ユーザーは `state.expenses[]` に「住宅購入時の頭金」を別途登録しなければ、購入当年の資産減少がシミュレーションに反映されない。
  - 数値インパクト（物件 3,500 万 / 頭金 500 万 / 借入 3,000 万、頭金登録忘れ）:
    - 正しい購入年キャッシュフロー: `−500 万円`（頭金）＋ 借入 0（融資は資産ではない）
    - 本コード（`expenses[]` 未登録時）: 購入年の資産減少ゼロ。資産が 500 万円分過大推移。
  - **修正方針**: `#housingPanelMortgage` に「物件価格」「頭金」欄を追加し、購入年に `expenses[]` へ自動追記（または仮想計上）。UI に「別途頭金を `state.expenses[]` に登録してください」と注記を出すだけでもリスク軽減。

- **`05-I03` シナリオ比較 (`lifeScenario.housingOptions[]`) の決定がメインシミュレーションに連動しない**

  > **[Resolved in Phase 4c commit `9034d3f`]** （詳細: `docs/phase4c-fixes/expected-changes.md` の Group 10-scenario）

  - `sc.downPayment` / `sc.purchasePrice` / `sc.loanRate` を変更してもメインの `state.lifeEvents.mortgage` / `state.expenses[]` に反映されない別エンジン。ユーザーがシナリオ比較で「頭金 1,000 万が最適」と判断しても、メインプランに適用するには手動で住居計画フォームを書き換える必要がある。
  - 数値インパクト: プラン転記漏れによる「試算と実計画の乖離」。具体額化は困難だが、ユーザー体験上の致命的割れ目。
  - **修正方針**: シナリオ比較画面に「このシナリオをメインプランに適用」ボタンを追加し、`state.lifeScenario` の選択結果を `state.lifeEvents` へコピーする `applyScenarioToPlan()` を実装。

- **`05-I04` 借換え `refi` が諸費用（保証料戻し・事務手数料・登記費用）を計上しない**

  > **[Resolved in Phase 4c commit `23b155c`]** （詳細: `docs/phase4c-fixes/expected-changes.md` の Group 10-refi）

  - 実際の借換えは 30〜80 万円の諸費用が発生。本コードは `rate` と `term` の変更のみ。
  - 数値インパクト（2,000 万残債で借換え、諸費用 50 万無視）: **初年度に 50 万円の過少計上**。
  - 出典: SBI 新生銀行「住宅ローンの繰り上げ返済はした方がいい？」 <https://www.sbishinseibank.co.jp/retail/housing/column/vol162.html>
  - **修正方針**: `refi` イベントに `cost` フィールドを追加し、`costs.mortgage` に当年分として加算。

- **`05-I05` 繰上返済で利息 ≥ 月額のケースに NaN 伝播バグ**

  > **[Resolved in Phase 4c commit `c196760`]** （詳細: `docs/phase4c-fixes/expected-changes.md` の Group 10-quick）

  - §5-5 参照。`P × r ≥ M` だと `log(M / (M − P × r))` が NaN → `endYear = year + NaN` → ループ継続条件が false 評価で**スケジュールの残りが消失**。繰上返済額が**非常に大きい**ケースや、かつて借換えで **M を小さくしすぎた**ケースで発症。
  - 数値インパクト（`P = 3,000 万、r = 1.5% 月利 0.00125、M = 3.5 万円 （借換えで極端に月額を下げた）`）: `P × r = 3.75 万 > M = 3.5 万` → NaN → 控除計算も残りすべて欠落。
  - **修正方針**: 繰上返済額の上限チェック（`principal * r < monthly` の保証、あるいは `newN` が Finite であることを確認）を入れ、NaN の場合は即完済（`principal = 0, endYear = year`）扱いにする。

- **`05-I06` `events[]` 同年複数イベントの順序依存**

  > **[Resolved in Phase 4c commit `c196760`]** （詳細: `docs/phase4c-fixes/expected-changes.md` の Group 10-quick）

  - §5-9 参照。同じ暦年に `refi` と `prepay` が両方登録された場合、配列順が挙動を決める。ユーザー UI が登録順を制御できない場合、再計算の都度結果が変わるリスク。
  - **修正方針**: 年内の処理順を「`refi` → `prepay`」に固定（または逆）し、UI に「先に借換え、その後に繰上」の順序を明示。

### 🟢 Minor

- **`05-M01` 繰上返済手数料 0 円のハードコード**
  - 銀行によって 0〜3.3 万円 (ネット完結) 、窓口 11〜55 万円。完全無視。
  - **修正方針**: `prepay.fee` を追加。

- **`05-M02` `prepay.method` のデフォルト挙動が UI と乖離する可能性**
  - コードは `method === 'payment'` なら返済額軽減型、それ以外（`'period'` / `undefined`）は期間短縮型。UI は `'period'` を明示入力させているが、外部インポートデータで未指定なら一律期間短縮型になる。
  - **修正方針**: `method` のバリデーションとデフォルト値を明示。

- **`05-M03` 元金均等返済の非対応**
  - 地方銀行・JA バンクの一部は元金均等返済を提供。初期返済額が大きく手元資金を圧迫する点を試算できない。
  - **修正方針**: `repaymentType: 'level' | 'principal'` フィールドを追加し、`calcMonthlyPayment` に分岐を追加。

- **`05-M04` 変動金利 `rateType = 'variable'` が UI 上は選択可能だが金利推移シナリオは未実装**
  - 現状は選択しても固定金利と同じ挙動。UI の誤誘導。
  - **修正方針**: `'variable'` 選択時に金利上昇シナリオ（+0.25%/5 年など）を提示するサブフォームを実装。

- **`05-M05` `deductStart` < `startYear` のバリデーション欠落**
  - 入居前年の控除入力が可能。実害は少ないが UI エラー化が望ましい。

- **`05-M06` 控除期間が 10 / 13 年の 2 択のみ**
  - かつての 15 年選択制度や令和 4 年以降の買取再販特例（10 年）、中古住宅（10 年固定）などの区別が表現できない。
  - **修正方針**: `05-C01` と同時に住宅種別で自動判定。

- **`05-M07` 借換え後の控除継続のための「再適用手続き」に関する注記なし**
  - 借換えで銀行が変わると、税務署への「（特定増改築等）住宅借入金等特別控除の再適用の手続」必要。UI 注記だけでも有益。

- **`05-M08` 繰上返済・借換の UI 入力にシミュレーション結果の内訳表示（支払利息短縮額）が不足**
  - 三井住友銀行・JA バンクのシミュレーターは「短縮期間 X 年 Y ヶ月、軽減利息 Z 万円」を出す。本アプリは `renderMortgageBalanceTable()` を持つが、軽減利息の比較対照は出ない。
  - 出典: JA バンク「住宅ローンシミュレーション（繰上返済）」 <https://www.jabank.org/money/homeloan_kuriage/>

## 7. 結論

- **信頼度**: ❌ 要対応
- **一言サマリー**: 元利均等返済の月額・月次元本償却・繰上返済・借換えの**数学的コアは完全に標準通り** (`05-C/I/M` のどこにも純粋な計算ミスはない) だが、住宅ローン控除が **(1) 住宅種別による借入限度額・控除期間の切替未実装** (2026 年以降の一般住宅除外や子育て特例を誤適用)、**(2) 所得税・住民税の納付額を考慮せず控除可能額をそのままキャッシュフローに加算** (低所得層で 30% 級の過大還付)、**(3) 現役期の残高推定が線形近似で繰上返済を無視** (退職シミュレーションと恒常乖離) の 3 つの構造的欠陥を抱え、**控除期間 13 年累計で最大 100〜270 万円オーダーの虚偽還付**を計上しうる。頭金についてはタスク 4 で懸念されていた二重計上は発生しない（主経路に `downPayment` フィールド自体がない）ものの、**逆に購入当年の一時支出の計上漏れ**が起きやすい UI 設計上の別問題として顕在化。
- **信頼度 ❌ 要対応 の根拠**: Critical 3 件のうち `05-C01`（住宅種別未実装）と `05-C02`（税額考慮なし）は単独でシミュレーション結果の**将来資産残高を 100 万円超単位で歪める**。`05-C03`（線形近似）は事後的な分析でしか露呈しないが、**内部整合性が破綻している**点で深刻。Important 6 件を含めてフェーズ 3 で 1.5〜2 スプリント相当のリファクタが必要。
- **申し送り**:
  - **タスク 4 `03-M05` 検証結果（二重カウント）**: **発生しない**（`state.lifeEvents.mortgage` に `downPayment` フィールドが存在しない）。ただし**新規指摘 `05-I02` で「頭金計上漏れ」という逆方向の問題**を Important として挙げた。フェーズ 3 で UI に頭金欄を追加する際、`state.expenses[]` 自動同期ロジックを実装する必要がある。
  - `05-C02`（所得税・住民税の考慮）は `02-C01`（所得税概算未実装）と同根。タスク 10（ⓐ 統合シミュレーション監査）で `calcIncomeTax` ヘルパ新設案を一体議論すること。
  - `05-C03`（線形近似）は `calcIntegratedSim` / `calcStressTestSim` の共通修正で解決可能。`calcMortgageSchedule()` の呼び出しを 1 箇所で統一し、`Map` を引数で受け渡す設計変更が望ましい。
  - `05-C01` の住宅種別セレクタ追加は UI マスタデータ（借入限度額テーブル）を伴うため、**フェーズ 3 の先頭で実施**すれば `05-I01`（子育て特例）も同時解消できる。
  - タスク 11（シナリオ B サニティウォークスルー）では「一般住宅 / 新築 / 2026 年入居」シナリオで架空還付の有無を確認。また「極端な借換え（月額下げすぎ）」で `05-I05` の NaN 伝播を再現テストすること。
