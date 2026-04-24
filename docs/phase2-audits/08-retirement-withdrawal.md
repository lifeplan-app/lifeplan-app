# 監査レポート：出口戦略・4プール取り崩し（ⓑ）

- **対象領域**: ⓑ 退職後シミュレーション — `calcRetirementSim` / `calcRetirementSimWithOpts` の4プール（emergency / cash / index / dividend）取り崩し、退職金、年金、楽観・悲観シナリオ
- **監査日**: 2026-04-24
- **信頼度判定**: ❌ 要対応

## 対象範囲

- `calcRetirementSim()` (`index.html:15295-15506`) — 標準シナリオ入口
- `calcRetirementSimWithOpts(opts)` (`index.html:17429-17787`) — 4プール取り崩しの本体（最長約 360 行のループ）
  - プール定義 `_CASH_TYPES_RET` / `_CASH_NORMAL_TYPES` (`index.html:17458-17459`)
  - 高配当判定 `_isDivPool` (`index.html:17462`)
  - 初期残高比率 `_emergRatio / _cashRatio / _divRatio / _indexRatio` (`index.html:17468-17471`)
  - 生活防衛枠の上限キャップ付き複利 `_emergAtRetire` (`index.html:17497-17511`)
  - 取り崩し順序分岐 `drawdownOrder` (`index.html:17708-17734`) — `cash_first` / `invest_first` / `proportional`
  - 4プール成長 `emergencyPool *= (1+_emergBaseReturn)` 他 (`index.html:17689-17698`)
  - 枯渇判定 `depleted: endAssets <= 0 || isFundingShortfall` (`index.html:17779`)
- `getRetirementParams()` (`index.html:17189-17200`) — `inflationRate` / `expenseDecayRate` / `pensionSlide`
- シナリオ別比較 `renderScenarioComparison` (`index.html:17374-17426`)
  - 楽観: `{ returnMod: +0.01, expenseMod: -0.10, pensionMod: 0 }` (`index.html:17384`)
  - 悲観: `{ returnMod: -0.01, expenseMod: +0.10, pensionMod: -0.15 }` (`index.html:17386`)
- 呼び出し元: `runRetirementSim` (`index.html:15524`), `calcRetirementImprovementLevers` 内 `calcScenarioSim` (`index.html:20865-20882`), `renderScenarioComparison` (`index.html:17380-17386`), 同系列のシナリオ関数 (`index.html:18286-18555` 近辺)。

## 1. 関数の目的と入出力

### `calcRetirementSim()`（標準入口）

- **目的**: リタイア年齢・余命・支出・年金・取り崩し方式等の `state.retirement` をもとに、退職時の「必要資産」と「現在資産（退職時推計）」の差、取り崩しシミュ結果 `postData`、枯渇年齢 `depletionAge`、早期退職可能年齢 `canRetireAge` を返す。
- **入力**: `state.retirement`（`targetAge`・`lifeExpectancy`・`monthlyExpense1〜3`・`pensionMonthly`・`severance`・`withdrawalType`・`drawdownOrder`・`cashFloor` 等）、`state.assets`、`state.profile.birth`、`state.lifeEvents`。
- **戻り値**: `{ assetsAtRetire, requiredAssets, requiredAssetsLabel, residualAssets, shortfall, surplus, postData, depletionAge, canRetireAge, finalAssets, weightedReturn, annualDividendYield, retireYear, targetAge, lifeExpectancy, totalLEOverRetirement }` または `null`。

### `calcRetirementSimWithOpts(opts)`（4プール本体 / シナリオ対応）

- **目的**: 引数 `opts = { returnMod, expenseMod, pensionMod, drawdownOrder, cashFloor }` でシナリオ補正をかけつつ、退職時〜余命まで 1 年刻みで 4 プール（生活防衛 / 通常現金 / インデックス / 高配当）の取り崩しを進行させ、各年の `{ startAssets, endAssets, emergencyPool, cashPool, indexPool, dividendPool, annualReturn, assetWithdrawal, assetWithdrawalNeeded, withdrawalShortfall, annualExpense, pension, pension_p, dividendIncome, monthlyBalance, hybridPhase, depleted }` を配列として返す。
- **入出力の特殊点**: `depleted` は `endAssets <= 0 || isFundingShortfall` の OR。`withdrawalShortfall = max(0, actualDeduction − actualWithdrawn)` なので `cashFloor` で引き出せなかった年も `depleted: true` になる設計（`index.html:17748-17779`）。

## 2. 使用している計算式

### 2.1 プール初期値の振り分け（`index.html:17463-17519`）

```js
const _emergCurr = _allAssets.filter(a => a.type === 'cash_emergency').reduce(...);
const _cashCurr  = _allAssets.filter(a => _CASH_NORMAL_TYPES.has(a.type)).reduce(...);
const _divCurr   = _allAssets.filter(_isDivPool).reduce(...);
const _indexCurr = max(0, totalCurr − _emergCurr − _cashCurr − _divCurr);
// ...
let emergencyPool = _emergPoolInit; // = min(_emergAtRetire, assetsAtRetire)
let cashPool      = _nonEmergCurr>0 ? _nonEmergRemainder * (_cashCurr / _nonEmergCurr) : _nonEmergRemainder * _cashRatio;
let indexPool     = _nonEmergCurr>0 ? _nonEmergRemainder * (_indexCurr / _nonEmergCurr) : _nonEmergRemainder * _indexRatio;
let dividendPool  = _nonEmergCurr>0 ? _nonEmergRemainder * (_divCurr  / _nonEmergCurr) : _nonEmergRemainder * _divRatio;
```

- 生活防衛枠 `_emergAtRetire` は `targetVal2 > 0` なら `targetVal2`、それ以外は `targetVal`、両方未設定なら `Infinity` を上限として月次積立 `monthly * 12` を 1 年刻みで複利成長させた推定値。
- 非防衛部 `_nonEmergRemainder = max(0, assetsAtRetire − _emergPoolInit)` を現金/インデックス/高配当の**現在時価比率**で分配（※ 将来時点の比率ではなく**現在値**の比率）。

### 2.2 プール別リターン（`index.html:17472-17493`）

```js
const _emergBaseReturn  = …;           // 生活防衛の加重平均（既定 0.001 = 0.1%）
const _cashBaseReturn   = …;           // 通常現金の加重平均（既定 0.001）
const _indexBaseReturn  = …;           // インデックス系の加重平均（既定 baseWeightedReturn）
const _divTotalReturn   = …;           // 高配当全体の加重平均（既定 0.04）
const _divYield         = …;           // 配当利回り加重平均
const _divCapitalReturn = max(0, _divTotalReturn − _divYield);  // 配当控除後のキャピタルゲイン
```

### 2.3 4プール成長（`index.html:17689-17698`）

```js
emergencyPool *= (1 + _emergBaseReturn);
cashPool      *= (1 + _cashBaseReturn);
indexPool     *= (1 + max(-1, _indexBaseReturn + returnMod));
dividendPool  *= (1 + max(-1, _divCapitalReturn + returnMod));
```

- `returnMod` は**インデックス／高配当のみ**に加算、`cash / emergency` には適用されない（楽観／悲観シナリオでも低流動性プールのリターンは動かない）。

### 2.4 取り崩し順序（`index.html:17700-17734`）

- **cash_first（既定は `proportional`。UI 表記「通常現金 → インデックス → 高配当 → 生活防衛（最後）」**
- **invest_first（インデックス優先）**: `index → cash(>floor) → cash(全額) → dividend → emergency`
- **proportional（按分）**: `cashAboveFloor + index` を比率配分 → 残を cash → dividend → emergency
- 全モード共通で **emergencyPool は最後**。`cashFloor` は `cashPool` が `cashFloor` を下回らないよう予約するためのしきい値で、インデックスを先に崩す動機になる。

### 2.5 取り崩し量決定（`index.html:17614-17674`）

```js
switch (withdrawalType) {
  case 'fixed_rate':      baseWithdrawal = assets * withdrawalRate; break;
  case 'fixed_amount':    baseWithdrawal = netExpense + withdrawalAnnual; break;
  case 'hybrid':          // age < hybridSwitchAge → hybridRate×資産 or netExpense+hybridMonthlyAnnual
                          // age >= hybridSwitchAge → netExpense
                          break;
  case 'hybrid_reverse':  // 前半 netExpense / 後半 hybridReverseRate×資産
                          break;
  default:                baseWithdrawal = netExpense;   // needs
}
const _isRateMode = withdrawalType === 'fixed_rate' ||
                   (withdrawalType === 'hybrid_reverse' && hybridPhase === 2);
const assetWithdrawal = _isRateMode ? baseWithdrawal : max(baseWithdrawal, netExpense);
```

- `netExpense = max(0, totalAnnualExpense + _partnerExpChange − totalNonAssetIncome)` （支出超過分のみ資産から）。
- 定率モード以外では「生活費を必ず確保」する（取り崩しは生活費以上）。定率モードは純粋に `rate × 資産` で、不足は赤字表示のみ（資産は温存）。

### 2.6 退職金（`index.html:17321, 17447, 17573-17574`）

```js
// 退職年齢までに受給（severanceAge <= targetAge）: assetsAtRetire に一括加算
const severanceAtRetire = (severance > 0 && severanceAge && severanceAge <= targetAge) ? severance : 0;
assetsAtRetire = (preRetireSim[yearsToRetire]?.totalWealth || ...) + severanceAtRetire;
// 退職後に受給（severanceAge > targetAge）: その年の indexPool に加算
const severanceThisYear = (severance > 0 && severanceAge && severanceAge > targetAge && age === severanceAge) ? severance : 0;
if (severanceThisYear > 0) { indexPool += severanceThisYear; }
```

- **退職所得控除や所得税の差し引きは無い**。入力値 `severance` はそのまま額面加算。

### 2.7 年金（`index.html:17527-17577`）

```js
const pensionAge = parseInt(r.pensionAge) || 65;
const basePensionAnnual   = (r.pensionMonthly   || 0) * 12 * (1 + pensionMod) * (1 − params.pensionSlide);
const basePensionAnnual_p = (r.pensionMonthly_p || 0) * 12 * (1 + pensionMod) * (1 − params.pensionSlide);
// ループ内
const pension   = age >= pensionAge   ? basePensionAnnual   : 0;
const pension_p = age >= pensionAge_p ? basePensionAnnual_p : 0;
```

- `pensionMod` は**乗算**（`(1 + pensionMod)`）で悲観 −15% は `×0.85`。
- `pensionSlide` は別の乗算 `(1 − pensionSlide)` で **pensionMod の後に**適用。

### 2.8 楽観／悲観シナリオの定義（`index.html:17384-17386`）

```js
const optimistic  = runScenario({ returnMod: +0.01, expenseMod: -0.10, pensionMod:  0    });
const pessimistic = runScenario({ returnMod: -0.01, expenseMod: +0.10, pensionMod: -0.15 });
```

- `returnMod`: `+0.01` = 小数なので**年利 +1 %pt**（例: 5% → 6%）。インデックス・高配当のみ適用。
- `expenseMod`: `-0.10` = **生活費 −10%**（`inflatedExpense * (1 + expenseMod)`）。インフレ調整後の生活費に乗算。医療費・LE・住宅ローン・一時支出には**適用されない**（生活費本体だけ）。
- `pensionMod`: `-0.15` = **年金 −15%**（乗算）。本人とパートナーに同時適用。

## 3. 標準との突合

### 3.1 取り崩し順序（出口戦略の税効率）

- **FP 業界の一般指針（日本）**: 税優遇口座（NISA／iDeCo）は**温存**し、**特定口座（課税口座）から先に**取り崩すのが節税面で有利とされる。
  - 野村證券「iDeCo 受取と NISA 活用の順序」 <https://www.nomura.co.jp/nisa/> — 「運用益非課税の NISA はできるだけ最後まで残す」。
  - 楽天証券『トウシル』「老後資産の取り崩し、どの口座から？」 <https://media.rakuten-sec.net/articles/-/35870> — 「課税口座 → iDeCo → NISA の順が税効率上推奨される」。
  - Pfau, W. "Safety-First Retirement Planning" (2019) Ch.7 "Tax-Efficient Withdrawals" — 同趣旨（米国 taxable → tax-deferred → Roth の順）。
  - Morningstar Christine Benz "Tax-Efficient Retirement Withdrawals" <https://www.morningstar.com/retirement/tax-efficient-withdrawal-strategy> — "Generally withdraw from taxable, then tax-deferred, then tax-free"。
- **バケット戦略（流動性確保）**: 退職後は「現金 1〜2 年 / 債券 3〜5 年 / 株式 5 年以上」の Benz 3 バケット（同上）。現金プール先行取り崩し＋株式側の**強気相場**時に現金を補充するのが原則。
- **本コード**: 
  - プール分類は **税制口座（NISA / iDeCo / 特定口座）ではなくアセット種別（現金 / インデックス / 高配当 / 生活防衛）**。NISA 温存ロジックは存在しない（Task 8 `07-I04` と同じ欠落が退職シミュでも再現）。
  - `drawdownOrder` 3 モードは流動性観点では妥当（cash 先、按分、投資先）。ただし**税引後の最適化**は一切考慮されない（譲渡益税 20.315% / NISA 非課税 / iDeCo 退職所得控除）。
- **判定**: 
  - ✅ 流動性面のバケット分け（emergency 最後・cash 先行 / 按分 / 投資先）は Benz バケット戦略のスピリットに沿う。
  - ❌ 税効率面で **NISA / iDeCo / 特定口座の区別なし** → 節税メリットが計算に反映されない（`08-I02`）。

### 3.2 4%ルール（Trinity Study）

- **標準**: Trinity Study (Cooley, Hubbard, Walz 1998; updated 2011 with "Portfolio Success Rates") — 退職初年度に資産の 4% を取り崩し、**以降は取り崩し額をインフレ調整**する方式で 30 年破綻確率を試算。株式 50%+債券 50% / 30 年で成功率 96% 等が有名な結果。<https://www.aaii.com/files/journal/21_papers/2011/dec2011.pdf>
  - Bengen, W. "Determining Withdrawal Rates Using Historical Data" (1994) — 元祖 4%（SAFEMAX）。
- **本コード**: `fixed_rate` モードは `assets * withdrawalRate` で**毎年**資産残高に率を掛ける（**定率取り崩し**）。Trinity 方式の「初年度 4% を固定額としインフレ調整」とは**別物**。
  - 定率取り崩しは Vanguard "Dynamic Withdrawal Strategy" 系で採用される方式で、資産が減れば取り崩しも減る（理論上枯渇しないが生活水準が変動する）。
  - UI ラベルでは「4%ルール」と表現している箇所がある（`index.html:15399` `定率${rateLabel}%ルール目標額`）が、Trinity の固定額方式ではないので**用語の揺らぎ**がある（`08-M02`）。
- **判定**: ⚠️ 方式としては合理的だが「4%ルール」の一般的理解（固定額＋インフレ調整）と実装（定率）に**名称ミスマッチ**。

### 3.3 平均余命

- **標準（厚労省 令和6年 簡易生命表）**: 男性 81.09 歳、女性 87.14 歳。<https://www.mhlw.go.jp/toukei/saikin/hw/life/life24/index.html>
  - 65 歳時点の平均余命: 男 19.52 年 → 84.52 歳、女 24.38 年 → 89.38 歳。
- **本コード**: `lifeExpectancy = parseInt(r.lifeExpectancy) || 90` (`index.html:15302, 17437`)。既定 **90 歳**。
- **判定**: ✅ 90 歳既定は厚労省の 65 歳時点余命（平均 87 歳前後）より保守的で FP 実務（90〜95 歳を目安）に整合。既定値として妥当。

### 3.4 退職所得（一時金）の課税

- **標準（所得税法 30 条）**: 退職一時金は「退職所得控除」後、1/2 課税で分離課税。控除額は勤続 20 年以下 `40万円 × 年数`（最低 80 万円）、20 年超 `800万円 + 70万円 × (年数−20)`。
  - 国税庁 No.1420「退職金を受け取ったとき」 <https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1420.htm>
  - 例: 勤続 35 年で 2,000 万円受給 → 控除 `800 + 70×15 = 1,850` 万円 → 課税対象 `(2000−1850)/2 = 75` 万円 → 所得税 `75 × 0.05 = 3.75` 万円 + 住民税 `75 × 0.10 = 7.5` 万円 ≒ 11.25 万円、手取り **1,988.75 万円**（税率は勤続年数で大きく変わる）。
- **本コード**: 退職金 `severance` は**額面そのまま**で `assetsAtRetire` または `indexPool` に加算（`index.html:15321-15324, 17447, 17573-17574`）。税引き処理は存在しない。
- **判定**: ⚠️ 大半の会社員は退職所得控除内に収まる（勤続 30 年+なら 1,500 万円まで非課税）ので額面加算でも実害は少ないが、**高額退職金（例: 役員・外資）では過大計上**。`08-I03` に記録。

### 3.5 在職老齢年金・繰下げ率の反映

- **標準（日本年金機構）**: 65 歳未満の在職老齢年金は月収 + 年金 > 48 万円で減額、65 歳以上は 2022 年改正で同一基準。繰下げ率は +0.7%/月（最大 +84%）、繰上げは −0.4%/月。<https://www.nenkin.go.jp/service/jukyu/roureinenkin/jukyu-yoken/20140421-01.html>
- **本コード**: 
  - 在職老齢年金の減額は**実装なし**（Task 5 `04-I07` で既出）。
  - 繰下げ率は `calcAndShowDeferralSim` (`index.html:17815-17818`) で計算表示されるが、`retPensionMonthly` には転記されないため、シミュレーションには反映されない（**Task 5 `04-I02` がそのまま退職シミュに継承される**）。
- **判定**: ⚠️ シナリオ比較で `pensionMod` を動かしても**繰下げ受給の高額化**は別軸のため正しく評価できない。

### 3.6 シナリオ変動幅（±1 %pt, ±10%, −15%）

- **標準（GPIF 基本ポートフォリオ想定）**: 期待リターン名目 4.6%、標準偏差 12.3% 前後。<https://www.gpif.go.jp/gpif/portfolio.html>
  - 1σ シナリオなら ±12 %pt 程度のブレが理論的だが、出口戦略の感度分析では**長期平均のブレ**で ±1〜2 %pt 程度が妥当（長期の平均回帰があるため）。
- **本コード**: `returnMod = ±0.01`（±1 %pt）、`expenseMod = ±10%`、`pensionMod = −15%`。
- **判定**: ✅ 長期平均ベースのストレステストとして妥当な幅。`pensionMod` の下限 −15% は財政検証悲観シナリオのマクロ経済スライド累積削減率に近い（厚労省 2024 財政検証 ケースⅢ・Ⅳで 20% 前後）。

## 4. 仮定・制約

1. **プール比率は退職時点の現在時価ベース**: `_cashCurr / _indexCurr / _divCurr` は現在値。退職時までに積立された資産の構成（例: 20 年後に NISA がフル稼働）は反映されない。
2. **`returnMod` は index / dividend のみ**: emergency / cash には加算されない（現金金利はシナリオ不変）。意図的な設計（金利シナリオとリターンシナリオは別軸）だが UI の表記では明示されない。
3. **生活防衛枠は「絶対最後」**: どのモードでも emergency は先頭 3 プールが枯渇するまで手付かず。実務では生活防衛を使うことも許容されるが、コードは**強制的に temoto**。
4. **`cashFloor` は cash のみを保護**: `cashAboveFloor = max(0, cashPool − cashFloor)`。cash が floor を下回ると `withdrawalShortfall` が発生し `depleted: true` になる（インデックス残があっても）。
5. **退職金は非課税・額面加算**: 退職所得控除・1/2 課税は未実装（§3.4）。
6. **年金は `pensionAge` から一律開始**: 在職老齢減額・繰下げ率は未反映（§3.5）。
7. **生活費逓減 `expenseDecayRate`**: `(1 + inflationRate) * (1 − expenseDecayRate)` を毎年乗算。UI 既定 0%。
8. **配当収入は税引前**: `dividendIncome = dividendPool * _divYield` を `totalNonAssetIncome` に直接加算。配当税 20.315% は未反映（`08-I01`）。
9. **住宅ローン控除は残高 × 0.7%（上限 31.5 万円/年）**: Task 6 `05-I01` の通り、最新制度（2024 年以降は物件区分で上限 14〜21 万円）と乖離。本監査の対象外だが、退職後計算にもそのまま流入。
10. **シミュレーションは年次**: 月内の資金繰り（ボーナス支給タイミング等）は粒度外。
11. **`severanceAge > targetAge` の場合**: `indexPool` に加算 → 退職後のインデックス取り崩しを遅らせる効果があるが、額面・非課税。

## 5. エッジケース

1. **`assetsAtRetire < _emergAtRetire`**: `_emergPoolInit = min(_emergAtRetire, assetsAtRetire) = assetsAtRetire` → `_nonEmergRemainder = 0` → `cash/index/div = 0`。退職時点で**全資産が生活防衛**扱いになり、先頭 3 プールが空なので毎年 emergency からいきなり取り崩す。**例外シナリオだが、早期退職者でコスト先行のケースで発生**。
2. **全資産が投資系（`_cashCurr = 0, _emergCurr = 0`）**: `_emergPoolInit = 0`、`_nonEmergCurr = _indexCurr + _divCurr > 0` → cash=0, index=残り全て, dividend=比率。cash_first モードでも cash=0 なので実質 index から崩す。挙動は合理的。
3. **`_nonEmergCurr = 0` かつ `_nonEmergRemainder > 0`**: 現在値が全て `cash_emergency` だが退職金で資産が増えた場合など。フォールバックで `_cashRatio=0.10, _divRatio=0.15, _indexRatio=0.75` が使われる（`index.html:17468-17471`）。既定構成として妥当。
4. **`dividendPool > 0` で `_divYield = 0`**: 高配当プールに判定されたが配当利回り 0 のケース。`dividendIncome = 0` で `dividendPool` は `_divCapitalReturn` のみで成長。
5. **`returnMod = -1` 未満**: `max(-1, _indexBaseReturn + returnMod)` で下限 −100%（完全損失）にクランプ。`1 + (-1) = 0` で資産消滅。現実的には到達しない。
6. **`withdrawalShortfall > 0` だが `endAssets > 0`**: cashFloor に阻まれて取り崩せず赤字扱い。この場合 `depleted: true` でも**資産は残っている**（例: emergency と cashFloor 合算で実質 500 万円ロック）→ UI は「枯渇」と表示するがユーザーから見ると「資金は持つがロックされている」状態。`08-I04` に記録。
7. **`severance > 0 かつ severanceAge === targetAge`**: `severanceAge <= targetAge` で `severanceAtRetire = severance`、ループ内の `severanceAge > targetAge` は false なのでダブルカウントはされない。境界条件は OK。
8. **`severance > 0 かつ severanceAge` 未入力**: `severanceAge = null` → `severanceAtRetire = 0`（`severanceAge && ...` が false）。**severance 入力済みで age 未入力だと退職金が完全に消える**（サイレント失敗）。
9. **`pensionAge < targetAge`**: 退職より先に年金が開始されている入力（現実には 65 歳前倒し受給）。`age >= pensionAge` は退職直後から true で正しく年金受給開始。
10. **`calcPensionEstimate()` 旧実装（Task 5 `04-C01`）の影響**: `retPensionMonthly` は手動入力のため、旧実装の NaN 汚染は**この関数には直接伝播しない**（`parseFloat(r.pensionMonthly) || 0` のガードあり）。ただし `calcSimpleSim` 等の別経路でプリセットを読み込むと NaN が入る可能性は残る（詳細 §6 `08-M03`）。

## 6. 検出された問題（深刻度付き）

### 🔴 Critical

- **`08-C01` 取り崩しシミュは「機会損失複利」機構を持たず Task 8 `07-C01` と同系の破綻がプール別に発生する — `withdrawalShortfall` が発生してもプール側残高で判定するため、現金系プールが枯渇しても emergency が残っていれば `depleted` にならず資産枯渇が隠蔽される**

  > **[Resolved in Phase 2.5 commit `edba0a0`]** （詳細: `docs/phase2-5-fixes/expected-changes.md` の Group 5。07-C01 と同コミットで修正）

  - 取り崩し優先度は `cash → index → div → emergency`（invest_first でも最後は emergency）。**emergency を先に使わないのは意図通り**だが、`cashFloor > 0` を設定しつつ emergency に多額を置くと、`cash + index + div` が全て底を突いた時点で:
    - `_fromEmerg = min(emergencyPool, ...)` が発動し emergency が取り崩される。
    - `withdrawalShortfall = 0`（emergency で埋まるため）。
    - `endAssets > 0`（emergency 分が残っている）。
    - → `depleted: false`。
  - 一方、もし emergency 残も足りなければ `withdrawalShortfall > 0` → `depleted: true`。この条件は機能する。
  - **しかし、Task 8 `07-C01` の機会損失機構（`_investDeficit`）は本関数では採用されていない**ため、cash/index/div が 0 になった後の「取り崩されなかった生活費」（cashFloor で阻まれた分）は `withdrawalShortfall` としてしか記録されない。**次年度以降、emergency に手を付けず cashFloor でロックされ続ける**と、シミュレーション上は毎年 `annualDeficit = withdrawalShortfall` が計上され、`endAssets` は emergency + ロックされた cash だけで**横ばい**。`depleted: true` は発動するが、ユーザー視点では「資産は残っているのに枯渇判定」という UI 矛盾が発生する（§5 エッジケース 6 の裏面）。
  - **さらに重大な問題**: `cashFloor = 0` かつ emergency に大量預け入れの場合、`cash → index → div → emergency` の順で完全に崩し、emergency 枯渇の**最後の年**のみ `depleted: true` になる。しかし途中で index や div が先に 0 になる年は `depleted: false` として通過 → **投資プールが早期枯渇しても警告なし**で、「余命まで持つかどうかは emergency の最終使い切り時点だけが判定基準」。Task 8 `07-C01`（二プールモデルで投資プール 0 後の機会損失幻影）と**同型の「中間プール枯渇の無視」が 4 プールでも発生**する。
  - 数値例（単位: 万円、利回り固定）:
    - 初期: emergency 300、cash 200（cashFloor=0）、index 2000、div 0、合計 2500。
    - 年支出 300（年金なし、全額取り崩し）。_indexBaseReturn = 5%、_cashBaseReturn = 0.1%、_emergBaseReturn = 0.1%。cash_first モード。
    - y=0: cash 200 → index 100（cash 枯渇）、index 2000 → 1900。end=300+0+1900=2200。**depleted:false**。
    - y=1〜6: cash=0、毎年 index から 300（生活費）、index 500 超までは `depleted:false`。
    - y=7: index 200 → cash_first で index 200 取り崩し後も 100 不足 → emergency 100。end=200+0+0=200。**depleted:false**（emergency まだ 200）。
    - y=8: index=0、emergency 200 → 300 必要 → 200 取り崩しで emergency=0、100 不足 → `withdrawalShortfall=100`。`endAssets=0` → **depleted:true**（y=8 が初めて true）。
    - **問題**: y=7 時点でユーザーは「インデックス枯渇」を知る権利があるが postData には `indexPool: 0, depleted: false`。UI の枯渇判定は endAssets ≤ 0 のみなので index 枯渇の警告が**一切出ない**。
  - 影響範囲: `runRetirementSim` → `depletionAge = postData.find(d => d.depleted).age` が遅すぎる判定（実質的に「最終枯渇」しか検出しない）→ FIRE 成否判定・シナリオ比較・`calcRetirementImprovementLevers` の逆算（`sim.find(r => r.endAssets<=0 || r.depleted)` を成功可否の閾値に使うため、投資プール枯渇シナリオでも「成功」と誤判定）。
  - **重複判定**: Task 8 `07-C01` が **`calcIntegratedSim` の二プール枯渇後機会損失**を Critical としていたのに対し、本件は **`calcRetirementSimWithOpts` の 4 プールで「投資プール早期枯渇が depleted に反映されない」** という別系統の欠落。両方とも「退職後シミュレーションで破綻年が隠れる」という同じ UX 上の障害を引き起こす。**本関数は機会損失複利を**持たない**（0 から再複利しない）分だけ `07-C01` より被害が小さいが、ユーザーが見る「退職シミュ」の depletionAge が不正確になる点は同じ**。

### 🟡 Important

- **`08-I01` 配当税・譲渡益税が未反映（税引前額面の取り崩し・配当収入）**
  - `dividendIncome = Math.round(dividendPool * _divYield)` は**税引前**。特定口座なら源泉徴収で 20.315% 差し引かれ、手取りは `dividendPool * _divYield * 0.79685`。
    - 例: dividendPool 1,000 万、_divYield 4% → 配当 40 万 → 手取り 31.87 万、**差額 8.13 万円が過大計上**。
  - 取り崩し額 `actualWithdrawn` も**税引前額面**で「生活費を賄う」計算。実際には特定口座から 100 万取り崩すと含み益分の 20.315% が税で引かれ手取りは減る。
  - 両者を合わせた影響: 取り崩し額の見積もりが税引後手取りより甘くなり、資産寿命がシミュ上 **2〜5% 長く**見える。FP 実務の目安（Pfau 2019）では税後キャッシュフロー基準で評価するのが標準。
  - 改善案: NISA / iDeCo / 特定口座の残高比を `state.assets[].taxType` から算出し、`effectiveTaxRate = Σ weight_i × taxRate_i` で補正する。Task 8 `07-I01` と同じ改善方針。
  - FP 出典: Pfau 2019 Ch.7; 野村證券「出口戦略と税金」 <https://www.nomura.co.jp/toushin/>

- **`08-I02` NISA 温存の取り崩し順序が無い（税効率最適化の未実装）**
  - `drawdownOrder` は**アセット種別**（cash / index / div / emergency）で分類されるが、税制口座（NISA / iDeCo / 特定口座）の区別は無い。
  - FP 業界の標準（§3.1）は「課税口座 → iDeCo（退職所得控除使い切り）→ NISA（非課税を最後まで）」。現行コードは全てのインデックスアセットを `indexPool` にマージして同率で崩すので、NISA のような**非課税メリット**が計算に乗らない。
  - 影響: 長期退職後シミュで手取りが保守的すぎる側に倒れる（NISA を温存して税負担を減らせば実質の資産寿命が延びる）。30 年シミュで NISA 比率 50% 想定なら手取り差は **総累計 5〜10%** オーダー。
  - 改善案: `indexPool` を更に `indexPool_nisa / indexPool_ideco / indexPool_tokutei` に分割し、`tokutei → ideco → nisa` の順で崩すオプションを追加。
  - Task 8 `07-I04` と同じ欠落が 4 プール版でも継承。

- **`08-I03` 退職金が退職所得控除なしの額面加算（高額退職金で過大計上）**
  - §3.4 の通り、国税庁 No.1420 の退職所得控除（勤続 30 年なら 1,500 万円）を無視して `assetsAtRetire` / `indexPool` に額面加算。
  - 勤続 30 年・退職金 3,000 万円の場合:
    - 控除: `800 + 70 × 10 = 1,500` 万
    - 課税対象: `(3000 − 1500) / 2 = 750` 万
    - 所得税: `750 × 0.23 − 63.6 ≒ 108.9` 万（超過累進）
    - 住民税: `750 × 0.10 = 75` 万
    - 合計税: 約 184 万 → 手取り **2,816 万**
  - 本コードは額面 3,000 万を加算 → **184 万円過大**。
  - 一般会社員（退職金 2,000 万以下・勤続 20 年+）は退職所得控除内で実質非課税なので影響軽微だが、高額退職金では誤差大。
  - 改善案: `calcSeveranceTax(severance, serviceYears)` を実装し、`severanceAtRetire = severance − severanceTax` に置換。
  - 出典: 国税庁 No.1420 <https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1420.htm>

- **`08-I04` `cashFloor` で引き出せなかった場合、emergency・index の残高が十分でも `depleted: true` 扱い**
  - `cashFloor` は現金維持の閾値で、超過分 (`cashAboveFloor`) しか取り崩し候補にならない。`cashAboveFloor < netExpense` かつ `indexPool = 0, dividendPool = 0` のケースで `_fromEmerg` が発動するはずだが、`_deductable = min(_poolTotal, actualDeduction)` は `emergencyPool` も合算した `_poolTotal` から引けるので、理論上は埋められる。しかし `cashFloor` がロックしている cash 分は `_poolTotal` に含まれない（emergency + indexPool + dividendPool + cashAboveFloor）ため、`_poolTotal < actualDeduction` になると `_deductable = _poolTotal < actualDeduction` → `withdrawalShortfall = actualDeduction − actualWithdrawn > 0`。
  - つまり **cashFloor 200 万円をロックしているせいで、生活費 300 万不足のうち 100 万しか取り崩せず `depleted:true`** のケース。ユーザー視点では「あと 200 万円あるのに枯渇判定」。cashFloor の目的（現金を残す）が**破綻判定の誤検出**を引き起こす。
  - 改善案: 緊急時は cashFloor を無視するモード（"emergency override"）を追加するか、`cashFloor` で枯渇となった年に「緊急時は cashFloor 分も使用可能」という UI 注記を出す。

- **`08-I05` `returnMod` がインデックス・高配当のみに加算され、cash / emergency の金利は楽観／悲観シナリオで不動**
  - シナリオ `+1 %pt` で cash 金利が 0.1% のまま。現実には金利上昇局面では預金金利も上がるため、低リスク資産も含めた全面的な楽観／悲観ができない。
  - 逆に悲観 `−1 %pt` でも cash 金利は下がらない（既に 0.1% 近辺で下限に近い）ので、現状は **低金利環境では大きな影響はない**。
  - 影響: 楽観シナリオで「株式 +1%」だけに賭ける構造なので、**インフレ対策（金利上昇シナリオ）を評価できない**。
  - 改善案: `returnMod` を `returnModStock` / `returnModCash` に分離 or UI で「現金金利も連動」オプションを追加。

### 🟢 Minor

- **`08-M01` 既定のプール比率 `0.05 / 0.10 / 0.15 / 0.75` が現在値ゼロ時のフォールバック**
  - 現在値がゼロ（初年度シミュレーション実行時にまだアセット未登録）の場合、比率は 5% / 10% / 15% / 75% が使われる（`index.html:17468-17471`）。保守的な生活防衛比率としては妥当だが、**`_totalCurr = 0` なのにシミュが動く**条件は通常は発生しない（`assetsAtRetire > 0` は `preRetireSim[yearsToRetire].totalWealth` から来るため、アセット 0 ならシミュ結果も 0 になるはず）。
  - 実害なしだが、将来の拡張でアセット 0 でも severance だけでシミュが動くケースを考えると、フォールバック既定値の根拠（FP 文献からの引用等）が欲しい。

- **`08-M02` 「4%ルール」の呼称と実装の乖離**
  - UI ラベル `定率${rateLabel}%ルール目標額（年支出÷${rateLabel}%）`（`index.html:15399`）は**定率取り崩し**方式（毎年 `資産 × rate`）を指している。しかし一般に「4%ルール」といえば Trinity Study の「**初年度に資産 × 4%、以降は額面をインフレ調整**」方式（§3.2）。
  - 名称だけ見ると Bengen/Trinity 方式と誤認されるが実装は Vanguard Dynamic 系の定率方式。ユーザーがどちらを期待しているか明示する UI 文言の改善余地（機能は正しく動く、ラベルだけの問題）。

- **`08-M03` `calcPensionEstimate()` 旧実装（Task 5 `04-C01`）の影響は直接伝播しないが、プリセット経由の間接リスクあり**
  - `retPensionMonthly` は UI で手動入力（`parseFloat(r.pensionMonthly) || 0` でガード）。旧 `calcPensionEstimate()` が `undefined` を返しても、`r.pensionMonthly` に直接書き込まれない限り本関数には影響しない。
  - しかし `calcSimpleSim` (`index.html:5979`) では `const pension = calcPensionEstimate()` → `retExpense * 12 - pension * 12 = NaN`（Task 5 `04-C01`）。簡単モードが `retPensionMonthly` を**再計算して書き戻す**経路があれば NaN が state に永続化する可能性。本監査では**書き戻し経路なしを確認**したが、将来の改修で書き戻しが追加されるとリスク顕在化。
  - 結論: 現時点では**遮断されている**が、Task 5 `04-C01` の早期対処が望ましい（退職シミュでもプリセット読込経路の副作用リスク）。

- **`08-M04` 繰下げ率（Task 5 `04-I02`）の影響は `retPensionMonthly` 手動入力でのみ反映**
  - UI の `calcAndShowDeferralSim` (`index.html:17815-17818`) は繰下げ率を表示するが、`retPensionMonthly` を自動書き換えしない。ユーザーが 70 歳繰下げを選んでも、`pensionMod` の `-15%/+42%` とは別軸なので手動で `6.8 → 9.66` 万円に書き換える必要がある。
  - 本関数では `(parseFloat(r.pensionMonthly) || 0) * 12 * (1 + pensionMod) * (1 - pensionSlide)` として**ユーザー入力を信頼**。`pensionMod` は「マクロ経済スライド以外のリスク要因」を表す設計意図なので、繰下げ率は独立変数で UI から反映すべき。
  - 改善案: `pensionAge` から 65 歳の差で `(1 + (pensionAge − 65) × 12 × 0.007)` を自動適用（繰下げ率の自動反映）。または UI で「繰下げ率を反映」チェックボックスを追加。

- **`08-M05` 配当収入 `dividendIncome` は `Math.round` で整数化されるが、`dividendPool` の成長はキャピタルゲイン `_divCapitalReturn` のみで別追跡**
  - `dividendPool *= (1 + _divCapitalReturn + returnMod)` は配当分（`_divYield`）を除外した成長。配当は `dividendIncome` として非資産収入扱い（`totalNonAssetIncome` に加算）。この二重扱いは正しいが、配当の「再投資」モード（`dividendMode !== 'cashout'`）の場合は `_isDivPool` 判定で除外されて `indexPool` に入る。**挙動は正しいが**、UI で `dividendMode` の使い分け説明がない。

- **`08-M06` `pensionMod` は本人とパートナー共通で適用される**
  - `basePensionAnnual` と `basePensionAnnual_p` の両方に `(1 + pensionMod)` が掛かる。本人とパートナーで別の年金減額率をテストしたい場合は不可。シナリオ比較の粒度としては簡略化の範疇。

- **`08-M07` コメント誤記 `assets = emergencyPool + cashPool + indexPool + dividendPool; // 4プール合算で常に同期` のループ末尾コメント `// assets はループ先頭で cashPool+indexPool+dividendPool から再計算するため代入不要`**
  - ループ末尾コメント (`index.html:17782`) が `cashPool+indexPool+dividendPool` と書かれているが実際は `emergencyPool+cashPool+indexPool+dividendPool`（17550 行）。生活防衛枠を含むのが正。**コードは正しい**がコメントが誤り。Task 2 `01-M04` と同系の軽微な不整合。

## 7. 結論

- **信頼度**: ❌ 要対応
- **一言サマリー**: 4 プール取り崩しの骨格（emergency を最後に回す、`drawdownOrder` で cash/invest/按分を切替、`cashFloor` で現金下限を守る）は Benz バケット戦略や FP 実務と整合。楽観・悲観シナリオの `returnMod / expenseMod / pensionMod` はそれぞれ「年利加算」「乗算」「乗算」として実装されている。しかし **`08-C01`（中間プール枯渇が `depleted` に反映されず、投資プールが早期 0 になっても `depletionAge` は emergency 枯渇年になる）** が Critical として残り、Task 8 `07-C01` と同系の「退職シミュで破綻年が隠蔽される」問題が再現する。加えて Important として `08-I01`（税引前取り崩し）、`08-I02`（NISA 温存未実装 = Task 8 `07-I04` の再現）、`08-I03`（退職金の退職所得控除未適用）、`08-I04`（cashFloor 誤検出）、`08-I05`（cash/emergency への returnMod 不適用）。
- **信頼度 ❌ 要対応 の根拠**: `08-C01` は退職シミュレーションの中核 UI（`runRetirementSim` → depletionAge 表示、`calcRetirementImprovementLevers` の成功判定、`renderScenarioComparison` の楽観・悲観比較）で再現する構造バグで、**UI から実際に見える**（「投資資産が余命前に 0 になっているのに警告なし」→ ユーザーが資産配分を再考する契機を失う）。Phase 2 監査の他タスク（3, 5, 6, 7, 8）と同じく Critical ≥ 1 → ❌ の方針を踏襲する。
- **Cross-reference の検証結果**:
  - **Task 8 `07-C01`（投資プール枯渇後の幻影機会損失）**: 本関数は `_investDeficit` 機構を**持たない**ため、`07-C01` の「架空機会損失複利」は再現しない。ただし**別系統の破綻隠蔽**（`08-C01`: 中間プール枯渇が `depleted:false` のまま）があり、UX への影響は同質。
  - **Task 5 `04-C01`（`calcPensionEstimate` 重複定義で NaN 伝播）**: `calcRetirementSimWithOpts` は `state.retirement.pensionMonthly` を `parseFloat || 0` でガードするため **NaN 伝播は遮断**。ただし `calcSimpleSim` 経由の書き戻し経路が将来追加されると顕在化するリスクは残る（`08-M03`）。
  - **Task 5 `04-I02`（繰下げ率が反映されない）**: 退職シミュでも同じく `retPensionMonthly` 手動入力が前提で、繰下げ率は自動反映されない。`pensionMod` は別軸なので、「繰下げ 70 歳 + 楽観シナリオ」の複合評価は**不可**（`08-M04`）。
- **申し送り**:
  - `08-C01` は Task 10（統合シミュ）で `postData` の中間プール別 `depleted` フラグ（例: `indexPoolDepleted: indexPool === 0 && previousIndexPool > 0`）を追加するパッチ案を検討。UI 側で「投資プール ○○ 歳で枯渇」の警告を出す改善余地。
  - `08-I02`（NISA 温存）は Task 8 `07-I04` と統合して改善提案（Phase 3）。`taxType` ベースのサブプール分割を `indexPool` に導入する設計。
  - `08-I03`（退職所得控除）は Phase 3 で `calcSeveranceTax(severance, serviceYears)` 実装を検討。勤続年数の入力フィールド追加が必要。
  - Task 11（シナリオ B サニティ）で「定率 4%・30 年・株式 70% / 債券 30%」の Trinity 近似ケースを実測し、本関数の定率モードが Trinity の成功率 96% に近い破綻率を出すか検証する。
