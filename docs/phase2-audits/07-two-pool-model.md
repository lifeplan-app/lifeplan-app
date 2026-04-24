# 監査レポート：二プールモデル（現金 / 投資）（ⓕ）

- **対象領域**: ⓕ 二プールモデル — `calcIntegratedSim` 内の現金プール/投資プール分離と、不足時の清算・機会損失複利
- **監査日**: 2026-04-24
- **信頼度判定**: ⚠️ 中

## 対象範囲

- `calcIntegratedSim(years, opts)` 全体（`index.html:14225-14340`）
  - 二プール判定セット `_CASH_T` (`index.html:14234`)
  - 投資資産加重平均リターン `_wInvestReturn` (`index.html:14238-14246`)
  - 累積清算 `_investDeficit` と `_liquidationEvents` (`index.html:14248-14249, 14302, 14312-14314`)
  - プール計算 `cashPool` / `investPool` (`index.html:14297-14318`)
- 振替（overflow）ロジック
  - `calcAssetGrowth` の `overflow` / `overflow2` 発生 (`index.html:8706-8797`)
  - `calcAllAssetGrowth` のトポロジカル処理 (`index.html:8900-8968`)
  - 振替先未設定時の `_wastedContribsByYear` 補正 (`index.html:8970-8999`)
- 呼び出し元（抜粋）: 資産推移シミュレーション描画 (`index.html:10030`), FIRE 出口戦略 (`index.html:10091` 他), シナリオ比較・退職後計算 (`index.html:15318, 15473, 17444, 18298, 18555, 19537, 19767, 20906, 21978`)

## 1. 関数の目的と入出力

### 二プールモデル（`calcIntegratedSim` 内）

- **目的**: 1年単位のキャッシュフロー累積値をもとに、「現金プール（流動資産）」と「投資プール」を分けて表示し、現金不足時は投資資産を取り崩して補填する。取り崩した分は「機会損失」として元の想定利回りで複利運用し続けたと仮定した金額を投資プールから差し引く。
- **入力**:
  - `years`: シミュレーション年数（1 以上）
  - `opts`: ライフイベント計算で使用される拡張オプション
  - グローバル `state.assets`・`state.finance`・`state.lifeEvents` 等
- **戻り値**: 各年 0..years の配列。各要素は `{ year, cashFlow, cashPool, investPool, cashAssetBase, investAssetBase, assetTotal, totalWealth, leCost, annualIncome, annualExpense, oneTime, dividendCashout, mortgageDeduct, liquidation }`。配列プロパティ `_liquidationEvents` に `{ y, yr, amount }` を付与。

### 二プール分離の基準（`index.html:14234`）

```js
const _CASH_T = new Set(['cash','cash_emergency','cash_special','cash_reserved','cash_surplus','savings','deposit']);
const _cashGD   = growthData.filter(g => _CASH_T.has(g.asset.type));
const _investGD = growthData.filter(g => !_CASH_T.has(g.asset.type));
```

- 現金プール = 7 種の現金系 `type`（`cash_emergency` / `cash_special` / `cash_reserved` / `cash_surplus` / `cash` / `savings` / `deposit`）
- 投資プール = それ以外全て（NISA / iDeCo / 投信 / 株式 / ETF / `insurance`（積立保険）/ `other`）
- `ASSET_TYPES` 側では `savings` と `deposit` は定義されておらず (`index.html:5333-5352`)、過去互換文字列として許容されているだけの死列挙（§5 `07-M05`）。

## 2. 使用している計算式

### 2.1 投資プールの加重平均リターン `_wInvestReturn`（`index.html:14238-14246`）

```js
const _totalInvestVal = _investGD.reduce((s, g) => s + (g.asset.currentVal || 0), 0);
const _wInvestReturn = _totalInvestVal > 0
  ? _investGD.reduce((s, g) => {
      const rate = (g.asset.return != null ? g.asset.return
        : (g.asset.annualReturn != null ? g.asset.annualReturn : 3)) / 100;
      return s + (g.asset.currentVal || 0) * rate;
    }, 0) / _totalInvestVal
  : 0.05;
```

数式：
- `_wInvestReturn = Σ(currentVal_i × r_i) / Σ(currentVal_i)`（投資資産のみ、**現在時価の加重平均**、税引前名目利回り）
- 投資資産が 0 のとき既定 5%

### 2.2 累積清算と複利機会損失（`index.html:14302, 14309-14315, 14318`）

```js
if (y > 0) _investDeficit *= (1 + _wInvestReturn);    // 前年までの清算分に年利を付与
// ...
if (y > 0 && virtualCash < 0) {
  liquidationThisYear = -virtualCash;
  _investDeficit += liquidationThisYear;              // 当年清算を追加
  adjustedCashFlow = cashFlow + liquidationThisYear;  // 清算額を現金へ注入
  _liquidationEvents.push({ y, yr, amount: Math.round(liquidationThisYear) });
}
const investPool = Math.max(0, investAssetBase - _investDeficit);
```

数式：
- `D_y = D_{y-1} × (1 + r_w) + L_y`（`D_y`: 累積清算の時価推定、`L_y`: 当年清算額）
- `investPool_y = max(0, Σ g.data[y] − D_y)`
- 現金プール: `cashPool_y = max(0, Σ g.data[y]_{cash} + cashFlow_y + L_y)` ≈ `max(0, cashAssetBase_y)` （清算発生年は 0 近傍）

### 2.3 キャッシュフロー累積（`index.html:14287-14295`）

```js
const cashFlow = y === 0
  ? 0
  : result[y-1].cashFlow + annualIncome - annualExpense - totalLE + oneTime
    + annualDividendCashout + annualMortgageDeduct + wastedContribs;
```

- `cashFlow_y = cashFlow_{y-1}(清算後) + I_y − E_y − LE_y + 一時収支 + 配当受取 + 住宅ローン控除 + wastedContribs_y`
- 前年 `cashFlow` は**清算後（`adjustedCashFlow`）**を引き継ぐ（清算で 0 にリセットされた状態から積み上げ）。

### 2.4 振替（overflow）ロジック概要（`index.html:8706-8797, 8900-8968`）

- `calcAssetGrowth` 内で当年の期末残が `targetVal` / `targetVal2` を超える分を `overflow` / `overflow2` として分離。
- `calcAllAssetGrowth` がトポロジカル順に `overflowTargetId` / `overflowTargetId2` の `extraContribs` へ注入して 1 回だけ連鎖させる。
- 振替先が未設定の `overflow` は `_wastedContribsByYear` に記録し、`calcIntegratedSim` の `cashFlow` に加算して総資産不変を保つ（`index.html:14292, 14295`）。

## 3. 標準との突合

### 3.1 現金プール（生活防衛資金）の区分

- **標準（FP 実務）**: 生活防衛資金は「生活費の **3〜6 ヶ月**、保守派で **1 年〜2 年**」の流動性資金を普通預金/定期預金で持つのが通説。
  - 金融庁「知るぽると」: 家計の金融行動に関する世論調査の解説では、緊急予備資金として **生活費の 3〜6 ヶ月** を目安とする記述が定着。<https://www.shiruporuto.jp/>
  - 日本FP協会の一般啓発資料: 「緊急予備資金は生活費の 3〜6 ヶ月分、自営業者は 6 ヶ月〜1 年分」。<https://www.jafp.or.jp/>
  - Benz, C. (Morningstar) "Bucket Approach to Retirement" — 退職後のバケット戦略では **バケット 1（現金）は 1〜2 年分の生活費**。<https://www.morningstar.com/portfolios/bucket-approach-retirement-portfolio>
- **本コード**: 現金系 7 種を一括で現金プールに集約。`cash_emergency` の note には「**生活費の 3〜6 ヶ月分が目安**」と明記 (`index.html:5346`)。
- **判定**: ✅ 区分の粒度は標準に一致。ただし「目的別（`cash_reserved`＝住宅頭金・教育費）」は実質的に短中期で取り崩すため、緊急予備資金と同じ扱いにしてよいかは議論あり（§6 `07-I02`）。

### 3.2 投資プール清算→機会損失複利

- **標準**:
  - 機会損失（opportunity cost）は「取らなかった選択肢から得られたであろう利益の差」。投資の文脈では「現金化したことで失った複利効果」を指す（例: Investopedia "Opportunity Cost" <https://www.investopedia.com/terms/o/opportunitycost.asp>、野村証券「証券用語解説 機会費用」）。
  - 退職後取り崩し戦略（bucket strategy）の前提: 株式バケットから現金バケットへ補填する際、**将来の複利を失う**ことが主要コスト。Vanguard "Dynamic Withdrawal Strategy" ではこの機会損失を明示的にモデルに組む。<https://corporate.vanguard.com/content/dam/corp/research/pdf/dynamic_withdrawal_policy.pdf>
  - 米国 FPA の教科書的取り扱い: Pfau, W. "Safety-First Retirement Planning" (2019) — 投資プールを清算した際の継続複利効果の逸失は退職後資産計画の基本指標の一つ。
- **本コード**: `_investDeficit *= (1 + _wInvestReturn)` で**毎年**清算累計に複利を掛ける → 機会損失の「拡大計」として実装。
- **判定**: ✅ コンセプトとして妥当。ただし以下 3 点で実態と乖離する余地があり（§6 `07-I01`・`07-I03`・`07-M01`）:
  1. `_wInvestReturn` が **初期時価加重の名目・税引前**リターン固定 → 清算後も初期時点のアセット構成を維持している前提。
  2. 個別アセットの `data[y]` は清算で減らず、投資プール合計だけ `_investDeficit` で差し引く「シャドー会計」モデル。UI でアセット別残高を読むと清算が反映されず見かけ上不一致。
  3. 税引後ベースで補填必要額を見積もる処理がない（譲渡益税 20.315% を差し引かずに額面清算）。

### 3.3 加重平均リターンの計算基準

- **標準**: ポートフォリオ期待リターンは `E[R_p] = Σ w_i × E[R_i]`、ただし `w_i` は**現在時価のウェイト**。リバランスを前提とするなら各年の時価で再計算が本筋（Modern Portfolio Theory, Markowitz 1952；BlackRock "Portfolio Expected Return" 解説 <https://www.blackrock.com/us/individual/education/investing-basics> 等）。
- **本コード**: `currentVal`（＝シミュレーション初年の時価）で一度だけ固定。シミュレーション中、各資産の残高推移・新規積立・振替は一切反映されない。
- **判定**: ⚠️ 差異あり（§6 `07-I03`）。短期（〜5 年）ならほぼ問題ないが、30 年シミュでは「現金比率の高い若年層ユーザーほど `_wInvestReturn` が過少に出る」構造バイアスがある。下記は代表例:
  - 若年層（現在: 現金 500 万円 / NISA 100 万円 / 投信 100 万円、利回り 0.1% / 5% / 7%）
    - 投資プール初期時価: 100 + 100 = 200 万円
    - `_wInvestReturn = (100 × 0.05 + 100 × 0.07) / 200 = 0.06` （6%）
    - 30 年後には投資プール側が積立で数千万円規模に成長しても、この 6% のまま固定される。仮に 30 年間 S&P500 中心（7%）で積み立てれば実質加重平均は 6.9% 近辺に上昇するはずだが、コードは 6% で機会損失を過小評価 → 清算時の機会損失計上が **過少**。

### 3.4 振替（overflow）の連続性

- **標準**: ポートフォリオのリバランスや NISA 枠超過分の振替は、実務上は**月次または超過発生時点**で行うのが一般的（つみたてNISA の月 10 万円上限は毎月判定）。
- **本コード**: 年次で 1 回だけ、`calcAssetGrowth` 内で当年末残高 vs `targetVal` 比較。連鎖は `calcAllAssetGrowth` のトポロジカル順で 1 パス。年内に上限に達してもその後も積立を続けて年末で初めて振替判定 → 実質的に**年内は NISA 上限超過分が滞留**する扱い（NISA の `annualLimit` キャップは年単位で正しいが、生涯枠ギリギリでの切り替え月は損益差が出る）。
- **判定**: ⚠️ シミュレーションの粒度として妥当だが、`07-M02` に記録。

### 3.5 バケット戦略との整合

- **標準**: 退職後は「現金 1〜2 年 / 債券 3〜5 年 / 株式 5 年以上」の 3 バケットが教科書的（Christine Benz, Morningstar; Harold Evensky "Present Value of Future Income" 概念）。<https://www.morningstar.com/portfolios/bucket-approach-retirement-portfolio>
- **本コード**: 「現金」「投資」の 2 バケット（債券/株式の細分なし）。投資プール内での取り崩し順序（例: 課税口座→iDeCo→NISA）も定義されない。
- **判定**: ⚠️ 簡略化は許容範囲だが、退職後取り崩しの **出口戦略シミュレーション**（Task 9 の対象）で別途カバーが必要。`07-I04` に記録。

## 4. 仮定・制約

1. **プール判定はアセット種別のみ**: `taxType` や `owner` とは独立。`insurance`（積立保険）は投資プール扱いだが、実際は解約返戻金ベースで流動性が中庸。
2. **現金プールも成長する**: `_cashGD` は `calcAssetGrowth` 経由で `annualReturn`（既定 0.1%）で複利運用された値。ただし現金プールとして「残高 + cashFlow」で再集約されるため、`cash_emergency.annualReturn` はほぼ飾り。
3. **`_wInvestReturn` は初年時価加重の定数**: 積立による構成変化、リバランス、資産売却による構成変化を反映しない。
4. **清算は投資プール合計から**: 個別アセット（例: iDeCo）は 60 歳まで引き出せない実務制約は未反映。清算対象はプール全体の一括扱い。
5. **税引前額面清算**: 清算額 = 不足額そのまま。譲渡益税（20.315%）や NISA/iDeCo の税制違いを考慮せず、「額面で穴埋め」する前提。
6. **`virtualCash` の判定粒度**: 年次累積で判定。年内に月々の支払いタイミングで一時的に不足しても検出されない（実務では当座借越 / クレカ決済の月次ズレで吸収される前提）。
7. **`_investDeficit` は永続複利**: 一度清算したら取り戻す手段がない（清算は片道）。実際にはボーナス月・退職金受領時等に再投資するが、コードは機会損失を永遠に複利計上。
8. **`_wInvestReturn` 既定 5%**: `_totalInvestVal === 0`（投資アセット皆無）時の既定。`currentVal > 0` の個別アセットが無い（全て積立開始前）でも 5% として扱う。
9. **`overflow` 連鎖は 1 パス**: トポロジカル順で処理できないサイクルは最後のフォールバックで単独計算されるため、サイクル内の振替累計が反映されない（Task 2 `01-I03` と同系の問題）。
10. **`overflow` は年末にしか発生しない**: `calcAssetGrowth` 内で期末残高と目標比較 → 1 年単位で集約。年内に複数回の流入・流出がある実務（配当受取の定期振替等）とは粒度が異なる。

## 5. エッジケース

1. **投資アセットゼロ**: `_wInvestReturn = 0.05` 固定。`_investDeficit` も 0 で増えない（`liquidationThisYear` は投資プール残 0 でも `-virtualCash` の額面を計上してしまう → `investPool = max(0, 0 − D) = 0` で表示は崩れないが `_investDeficit` が実態なしで積み上がる）。
2. **`currentVal = 0` 投資アセットのみ**: `_totalInvestVal = 0` → 既定 5%。新規に月額積立するだけの投資アセットは `_wInvestReturn` 算出時にウェイトゼロ扱い（§6 `07-I03`）。
3. **`annualReturn` が null**: `(g.asset.annualReturn != null ? g.asset.annualReturn : 3) / 100` のフォールバックで 3% 扱い。ただし `(null || 0) === 0` ではなく `null != null` が false なので 3 に行く。逆に 0 が入っていれば 0 として採用されるので、この分岐は null と 0 を区別している点に注意。
4. **`g.asset.return` フィールド**: 保存時は `annualReturn` しか書かれない (`index.html:8555`)。`g.asset.return != null` が true になる経路は実運用上ない（死コード/将来用の予備）。
5. **清算が投資プール残を超える**: `_investDeficit > investAssetBase` の場合、`investPool = 0` にクランプされ以降は投資プール枯渇。ただし `cashFlow` はその分補填され、**見かけ上は総資産 `cashPool + investPool = cashPool + 0 = cashPool` として連続**。次年度以降も `_investDeficit` は複利で増え続けるが、`investPool` は 0 止まりなので投資枯渇後の総資産表示は過大になる恐れ（§6 `07-C01`）。
6. **振替先が投資→現金**: `overflowTargetId` が現金系アセットなら、投資プールから現金プールへの実質移動。`wastedContribsByYear` には計上されない（振替先があるので）。これで現金プール増・投資プール減が正しく起きる。
7. **振替先が `nisaOverflowTargetId` 経由で投資サイクル**: NISA 上限超過→課税投信→再び NISA へ（架空の循環）はサイクル検出フォールバックに落ちる。

## 6. 検出された問題（深刻度付き）

### 🔴 Critical

- **`07-C01` 投資プール枯渇後に機会損失が実在しない金額まで拡大し、`cashPool` 側は清算で底上げされ続ける**
  - `investPool = Math.max(0, investAssetBase − _investDeficit)` により、`_investDeficit` が `investAssetBase` を超えると表示投資プールは 0 にクランプされる。ところが `_investDeficit` 自体はクランプされず、次年度以降も `_investDeficit *= (1 + _wInvestReturn)` で**存在しない機会損失が複利増**する。
  - 一方、`virtualCash < 0` の判定は毎年走るので、**現金プールが負になり続ける限り liquidation は発動**し、`adjustedCashFlow = cashFlow + liquidationThisYear` で現金不足を埋め続ける。**投資が既に底を突いている実態との乖離**が発生し、結果として「実質破綻しているのに `cashPool ≥ 0` のまま」表示される。
  - 数値例: 初年 `investAssetBase = 500 万円`、`_wInvestReturn = 0.05`。3 年目に年 400 万円の赤字を 4 年連続で出すケース:
    - y=1: `_investDeficit = 400`、`investPool = max(0, 500 − 400) = 100`
    - y=2: `_investDeficit = 400 × 1.05 + 400 = 820`、`investPool = max(0, 500 × 1.05^2 − 820) ≈ max(0, 551 − 820) = 0` （ここで枯渇）
    - y=3: `_investDeficit = 820 × 1.05 + 400 = 1,261`、`investPool = max(0, 500 × 1.05^3 − 1,261) ≈ max(0, 579 − 1,261) = 0`、しかし `liquidationThisYear = 400` が現金に注入されて見かけの破綻は起きない
    - y=4: `_investDeficit = 1,261 × 1.05 + 400 = 1,724`、`investPool = 0`、現金側は**存在しないはずの 400 万円**で再度補填される
  - 結論: 投資プールが一度 0 になったら `liquidation` の発動条件（またはその後の cash 補填ロジック）を止める必要がある。少なくとも `_liquidationEvents` に「**投資枯渇後の架空補填**」フラグを立てないと、出口戦略シミュレーションで破綻年が検出できなくなる。
  - 影響範囲: FIRE 達成判定 (`calcIntegratedSim` を参照する `renderPortfolio` 以降)、シナリオ比較、出口戦略（Task 9 の対象）。

### 🟡 Important

- **`07-I01` 清算額の税引前額面問題 — 譲渡益税 20.315% を差し引いて補填額を見積もらないため、現金不足の補填が過少**
  - 実際に特定口座の投資信託を 100 万円分取り崩すとき、含み益の 20.315% が源泉徴収され**手取りは 100 × (1 − 含み益率 × 0.20315)** になる。例: 取得価格 50・時価 100 の投信を全部売ると含み益 50、税 50 × 0.20315 = 10.16 万円、手取り 89.84 万円。
  - 本コードは `liquidationThisYear = -virtualCash`（=不足額そのまま）を `_investDeficit` に計上し、`adjustedCashFlow` に同額を注入する。つまり**税金で目減りしない前提**。
  - 影響: 税引前で `liquidationThisYear` を計上する限り、**現金不足が発動しやすく（税引き後手取りで見るとさらに清算しないと足りない）**、かつ `_investDeficit` は額面で計算されるので機会損失が税抜き想定より小さく出る（保守性/楽観性が混在）。
  - 改善案: NISA / iDeCo / 特定口座の構成比に応じた加重実効税率を `_wInvestReturn` と同様に初年時点で計算し、`liquidationThisYear_gross = -virtualCash / (1 − weightedCapGainsTax)` で額面換算する。
  - FP 実務: 出口戦略で税引後手取りを見ない計画は「取り崩し計画として甘い」と扱われる（Pfau 2019, Chapter 7 "Tax-Efficient Withdrawals"）。

- **`07-I02` 現金プールが 7 種 × 用途別を 1 塊で扱うため、`cash_reserved`（用途決定済み中長期）まで生活防衛資金として清算対象に含められない代わりに**"全部緊急時に使える"** と仮定される**
  - `cash_reserved` は「住宅頭金・リフォーム・教育費などの**用途決定済み**」(`index.html:5348`) と note で明示されているが、二プールモデル上は `cash_emergency` と区別されず、月々の赤字補填に利用可能な扱い。
  - 実務: 頭金として確保済みの 500 万円を生活費に食いつぶせば、住宅購入予定が崩れる。FP 実務では「**目的別口座は生活防衛資金と分けて計算**」(日本FP協会啓発資料) のが標準。
  - 現状: `virtualCash = cashAssetBase + cashFlow` は `cash_reserved` の残高も含めた合計で判定しているため、**本来他用途にコミット済みの資金で赤字を埋めた**後に、`expenses[]`（大口支出）発生年に同じ資金を再度支払おうとして**二重使用**に近い状態になり得る。`expenses` の控除は `getOneTimeForYear` で `cashFlow` から直接引かれるので数値上の破綻は起きないが、ユーザーの意図としては`cash_reserved` を隔離したい場合が多い。
  - 改善案: `cash_reserved`・`cash_special` を別サブプールとし、`liquidation` 発動時のみ `cash_emergency` + `cash_surplus` + `cash` の範囲で現金残をテストする。

- **`07-I03` `_wInvestReturn` が初年現在時価の加重平均で固定、積立後の構成シフトを反映しない**
  - 若年層（現在投資残 200 万、積立月 5 万、30 年後 3,000 万円規模）では、初年時価構成で算出した `_wInvestReturn` が 30 年後の実質構成と大幅に乖離する。
  - 具体例: 初年「ideco 100 万 (4%) + nisa 100 万 (5%)」→ `_wInvestReturn = 4.5%`。30 年後は NISA がほぼフル積立（年120万 × 15年で 1,800 万 + 運用益）で 5% 比重が高まり、実質加重平均は 4.8% 前後に上昇する。
  - 影響: 機会損失が **過少計上** → FIRE シミュで退職後破綻年が楽観側にズレる。
  - 改善案: 毎年の `_investGD[i].data[y]` を使って年次で `_wInvestReturn_y = Σ (data[y] × r_i) / Σ data[y]` を再計算する（O(N × years) で計算コストも微小）。

- **`07-I04` 退職後の取り崩し優先順位（NISA 非課税枠温存）が二プールモデルに入っていない**
  - 退職後取り崩し戦略の定石は「**課税口座 → iDeCo → NISA**」の順（NISA の非課税メリットを長期に温存する；Pfau 2019; Morningstar "Sequence of withdrawals matters" <https://www.morningstar.com/retirement/tax-efficient-withdrawal-strategy>）。本コードは投資プール合計として一括清算するので、NISA 温存の恩恵が反映されない。
  - 影響: 長期退職後シミュで手取り過少（保守側）。Task 9 の出口戦略でも同様のロジックがあれば要確認。

### 🟢 Minor

- **`07-M01` `_wInvestReturn` の既定 5% と per-asset フォールバック 3% の不整合**
  - 投資アセットが存在しない（`_totalInvestVal === 0`）ときは 5%、個別アセットに `annualReturn` が null のときは 3%。片方は楽観、片方は保守。`TAX_TYPE_DEFAULT` と同じく既定値は 1 箇所に集約すべき（0.05 と 3 が別の意味で書かれているが統一表記が望ましい）。

- **`07-M02` 振替発生は年次末の一発判定**
  - `calcAssetGrowth` 内で当年末残と `targetVal` を比較して余剰を overflow 化する。NISA の `lifetimeLimit = 1800` 到達月の判定も年次単位。月内で上限に達して翌月積立が自動で課税口座に振替される実務とは粒度が違うが、年次シミュの前提では許容範囲。

- **`07-M03` `_liquidationEvents` がラウンド後の整数記録**
  - `amount: Math.round(liquidationThisYear)` で整数丸め → 0.5 万円未満の清算は 0 として記録される。1 万円近辺の微小清算年が消える可能性（表示上の影響のみ、`_investDeficit` 側は丸めない値で累積）。

- **`07-M04` `g.asset.return != null` 分岐が死コード化**
  - `saveAsset` は `annualReturn` のみ書き込む (`index.html:8555`) ため、`g.asset.return` が non-null になる経路は JSON import で手書きされた場合のみ。通常の UI 操作では発生しない。削除可能だが、互換性のための防御的実装としては許容。

- **`07-M05` `_CASH_T` に `savings` / `deposit` が含まれるが `ASSET_TYPES` に定義なし**
  - `index.html:14234` の列挙は 7 種あるが、`ASSET_TYPES` で定義されているのは `cash_emergency` / `cash_special` / `cash_reserved` / `cash_surplus` / `cash` の 5 種のみ。`savings` / `deposit` は過去データ互換か将来予約の文字列。ユーザーが手で JSON import した `savings` type アセットはプール判定は通るが、`ASSET_TYPES[type]` 参照で undefined になり `taxType` 既定が `tokutei` に落ちる （`TAX_TYPE_DEFAULT` に未定義）。一貫性のため `ASSET_TYPES` に定義を追加するか、`_CASH_T` を 5 種に整理すべき。

- **`07-M06` `cash_emergency.defaultReturn = 0.1` は「0.1%」だが単位に紛れあり**
  - `ASSET_TYPES` の `defaultReturn` は％単位（`nisa_tsumitate: 5`、`ideco: 4` 等）なので 0.1 は 0.1% で整合。ただし `_wInvestReturn` 側では `/100` で処理され 0.001 になる。これは投資プール側の計算なので `cash_emergency` は関係ないが、コードレビューで混同しやすい（UI で 0.1 を入力したユーザーが 10% と誤認する可能性）。単位注記の UX 改善余地あり。

## 7. 結論

- **信頼度**: ⚠️ 中
- **一言サマリー**: 二プール分離の基準（現金 7 種 vs 投資その他）と、機会損失を名目加重平均リターンで複利拡大する構造は FP 実務の bucket strategy・機会費用概念と整合しており基本設計は妥当。ただし **`07-C01`（投資プール枯渇後も `_investDeficit` と `liquidationThisYear` が架空拡大し、`cashPool` を底上げし続ける結果、破綻判定が隠蔽される）** が Critical として残り、加えて `07-I01`（税引前額面清算で税コスト無視）・`07-I02`（`cash_reserved` の隔離不足）・`07-I03`（`_wInvestReturn` の時点固定）・`07-I04`（NISA 温存優先順位なし）の Important 4 件が積み上がる。
- **信頼度 ⚠️ 中 の根拠**: `07-C01` 単体でも本来は ❌ 要対応に近いが、以下の理由で ⚠️ 中 に留める:
  1. `07-C01` の誤表示が顕在化するのは「投資プール枯渇 + 継続赤字」という退職後末期の極端ケースであり、通常の現役期シミュ（cashFlow プラス/微赤字）では発動しない。
  2. `_liquidationEvents` は額面で全年記録されるので、監査用途（「何年目に何万円清算したか」）のトレーサビリティは維持されている。
  3. Task 2 で指摘済みの `01-I03`（振替サイクルのフォールバック取りこぼし）は本モデルにも間接的に影響するが、本監査では**プール側の新規問題**を優先して記述した。
- **申し送り**:
  - `07-C01` は Task 9（退職後取り崩し）で再検証必須。`simData._liquidationEvents` を使って「投資プールが 0 になった年」と「その後の `liquidation` 発動年」を突合し、投資枯渇後の清算は破綻年として記録するパッチを検討。
  - `07-I03` は Task 10（統合シミュ）で感度分析の対象。初年時価加重の `_wInvestReturn` vs 毎年再計算の差を数値で比較する。
  - Task 2 `01-I03`（トポロジカル順フォールバック）は本 Task 8 の振替連鎖とも関連。サイクル検出時に overflow が投資→現金プールを跨ぐと、`wastedContribsByYear` の補正も取りこぼす可能性があるため統合監査で要確認。
