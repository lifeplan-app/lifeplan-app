# Phase 4a 修正の期待方向と実測

Important 14 件を 5 グループに分けて修正した記録。
実施順序: G11 → G4 → G1 → G2 → G3（影響小 → 影響大）。

---

## Group 11: 統合シム（09-I01, 09-I03）

### 期待方向
- **対象**: 
  - 09-I01: gross モード時の収入一貫税引き
  - 09-I03: opts.noLoan 時の住宅ローン控除除外
- **期待される snapshot 差分**:
  - 既存サンプル 5 件の `_inputMode` を事前確認。全て `net` or 未設定なら 09-I01 は差分ゼロ
  - 既存サンプルで `opts.noLoan=true` を渡すケースは限られるため 09-I03 も差分小
- **確認ポイント**: 差分が小さいか、ある場合は明確に gross モード or noLoan 経由

### 実測サマリー
- **commit SHA**: 5fd23b7
- **snapshot 差分行数**: 0 行
- **サンプルの `_inputMode`**: A/B/C/D/E すべて未設定（grep で `_inputMode` 記述は 5 サンプル全てヒットせず）
- **シナリオ別変化**: 
  - A〜E: 差分なし（全サンプルが net モード相当、かつ opts.noLoan を渡す箇所なし）
- **方向の評価**: 期待通り

---

## Group 4: 退職計算（08-I03, 08-I04, 08-I05）

### 期待方向
- **対象**:
  - 08-I03: 退職金の退職所得控除（iDeCo 一時金は G3 で追加、本 Task では severance のみ）
  - 08-I04: cashFloor 残高の `depleted` 判定改善
  - 08-I05: returnMod の現金プールへの対称化（`returnModCash` 追加）
- **期待される snapshot 差分**:
  - シナリオ D 中村博（退職金 2,200 万想定、勤続年数 22 歳→55 歳 = 33 年）で退職所得控除枠 `800 + 70×13 = 1,710 万` → 税額は `(2200-1710)/2 = 245 万` に対する所得税・住民税
  - 退職金の税引後実効額が 2,200 → 約 2,150 万円（-50 万円程度、控除枠ほぼ使える）
  - シナリオ B 鈴木健太は退職金設定の有無次第で影響
  - 08-I04 は UI 戻り値追加のみで snapshot の `depleted` フィールドは既存と同じ
  - 08-I05 は楽観/悲観 snapshot で `returnMod` が従来通り株式に適用（後方互換）→ 差分ゼロ
- **確認ポイント**: 
  - シナリオ D の退職金税計算を手検算
  - 退職金設定のないシナリオ（A 田中葵・C 山本誠）は差分ゼロ期待
  - `opts.returnMod` → `opts.returnModStock` 互換が崩れていないか（楽観/悲観 snap は変わらないはず）

### 実測サマリー
- **commit SHA**: 0f45742
- **snapshot 差分行数**: 約 6290 行（scenario C のみ、C 全 snapshot×4 パターン）
- **新設関数**: `calcSeveranceDeduction(severance, idecoLumpsum, serviceYears)`
- **変更箇所**: severanceAtRetire 2 箇所（`calcRetirementSim` と `calcRetirementSimWithOpts`）、severanceThisYear 1 箇所、returnMod 対称化（returnModStock/Cash 分離、プール成長計算 4 箇所）
- **cashFloor**: 既存コード（`:335` 付近）に存在するが、depleted 判定ロジックは既に Phase 2.5 `08-C01` で `criticalPoolDepleted` を考慮済み。本 Task では `cashFloorLocked` フィールド追加は snapshot 互換のため省略（depleted 判定は既存どおり）。
- **手検算（シナリオ C 山本誠）**:
  - targetAge=55, severance=2500 万, serviceYears = 55 − 22 = 33 年
  - 退職所得控除枠 = 800 + 70 × 13 = 1,710 万
  - taxableRaw = 2500 − 1710 = 790 万 → taxable = 790/2 = 395 万
  - 所得税 = 395 × 0.20 − 42.75 = 36.25 万
  - 住民税 = 395 × 0.10 = 39.5 万
  - 税引後 = 2500 − 36.25 − 39.5 = 2,424.25 万 → **-約 76 万**
  - snapshot 実測: `startAssets` 8467 → 8391（差 -76）✅
- **シナリオ別変化**: 
  - A 田中葵: 退職金 0 → 差分なし ✅
  - B 鈴木健太: targetAge=65, severance=1200, serviceYears=43 → 控除枠 2410 万 > 1200 → 差分なし ✅
  - C 山本誠: targetAge=55, severance=2500, serviceYears=33 → **-76 万円（startAssets）**、以降全年度へ伝搬
  - D 中村博: targetAge=65, severance=2200, serviceYears=43 → 控除枠 2410 > 2200 → 差分なし ✅（Important 想定と実 scenario で serviceYears 計算が異なる）
  - E 林菜緒: targetAge=65, severance=400, serviceYears=43 → 控除枠 2410 > 400 → 差分なし ✅
- **returnMod 互換**: `opts.returnMod` のみ渡す既存 3 パターン（`{}`, `{returnMod:+0.01,...}`, `{returnMod:-0.01,...}`）で `returnModStock = returnMod`, `returnModCash = 0` に分解されるため、株式系の挙動変化ゼロ。現金系は `returnModCash=0` で加算しても無影響（＝既存コードと等価）。
- **方向の評価**: 期待通り（Important 想定の D ではなく C で変化が出たのは、D の serviceYears が 43 年で控除枠が severance を上回り非課税になるため。Important 本文の「22歳→55歳=33年」は D の targetAge=65 と矛盾しており、本 Task の 22歳起点式に従うと D は非課税）

---

## Group 1: 年金制度対応（04-I01, 04-I02, 04-I03, 04-I04）

### 期待方向
- **対象**:
  - 04-I01: 2003 年 3 月以前の乗率 7.125/1000
  - 04-I02: 繰下げ率 `adjustRate(pensionAge)` を retirement.js で乗算
  - 04-I03: 手取率を年金額階層別テーブル（0.95/0.90/0.85/0.82）に
  - 04-I04: `KOKUMIN_FULL_MONTHLY` 6.8 → 7.06（2026 年度）
- **期待される snapshot 差分**:
  - 04-I04（基礎年金 +3.8%）は `_calcPensionCore` 経由なので、サンプルの `retPensionMonthly` が手入力固定なら**直接影響なし**
  - 04-I02 の繰下げ率は `state.retirement.pensionAge` が 65 以外に設定されたサンプルで影響（多くのサンプルは 65 のはず）
  - 実測の snapshot 差分はほぼゼロの想定。各サンプルの `pensionMonthly` が UI 手入力のままなら、04-I01/03/04 は snapshot に反映されない
  - 04-I02 だけが `pensionAge` 設定に応じて snapshot 変化
- **確認ポイント**: 
  - サンプルの `state.retirement.pensionAge` と `pensionAge_p` を事前 grep で確認
  - サンプルで繰下げ設定（66 歳以上）があれば snapshot 変化。全員 65 歳なら差分ゼロ

### 実測サマリー
- **commit SHA**: 2130e0a
- **サンプル pensionAge grep 結果**: A/B/C/D/E 全サンプルで `pensionAge=65` かつ `pensionAge_p=65`（繰下げ/繰上げ設定なし）
  - A: pensionAge=65, pensionMonthly=12, pensionAge_p=65, pensionMonthly_p=0
  - B: pensionAge=65, pensionMonthly=16, pensionAge_p=65, pensionMonthly_p=10
  - C: pensionAge=65, pensionMonthly=18, pensionAge_p=65, pensionMonthly_p=8
  - D: pensionAge=65, pensionMonthly=22, pensionAge_p=65, pensionMonthly_p=8
  - E: pensionAge=65, pensionMonthly=11, pensionAge_p=65, pensionMonthly_p=0
- **snapshot 差分行数**: 0 行
- **シナリオ別変化**: 
  - A〜E: 差分なし（全サンプルで `adjustRate(65) = 1.0` のため `basePensionAnnual` 値変化なし。`pensionMonthly` は UI 手入力値でサンプルに固定済みのため `_calcPensionCore` 改修の影響は snapshot には出ない）
- **方向の評価**: 期待通り
- **補足**: 155 テスト全件 pass。`_calcPensionCore` の birthYear 引数は後方互換（未指定時 oldMonths=0）。`adjustRate` 関数は index.html 内の同名関数と衝突しない（index.html 側は `getPensionSimulation` スコープ内の function 宣言）

---

## Group 2: 清算時の税引き（07-I01, 08-I01, 09-I02）

### 期待方向
- **対象**: 07-I01 / 08-I01 / 09-I02（清算・配当・取崩の税引き 3 件同根）
- **期待される snapshot 差分**:
  - 清算発生シナリオ（Phase 2.5 の経緯から E 林菜緒が該当、C 山本誠も FIRE 早期で発生の可能性）で `liquidation` が **額面 +25% 増**（税引後 → 額面換算）
  - `investPool` の減少速度が速くなる
  - 長期資産（`endAssets`）は **-5〜-10%** 減方向
  - NISA 比率が高いサンプルほど税引き影響は小さい
  - 08-I01 の配当税引きは `dividendPool > 0` かつ cashout モードのアセットを持つシナリオで影響
- **確認ポイント**: 
  - Phase 2.5 Group 5 で導入した `investPoolHealthy` ガードとの整合性
  - `TAX_RATE = 0.20315`、1 / (1 - 0.20315) ≈ 1.2548 倍 → 額面換算時の係数

### 実測サマリー
- **commit SHA**: 982644f
- **新設関数**: 
  - `calcCapitalGainsTax(amount, taxType)` in calc/asset-growth.js
  - `calcResidentTax(taxableIncomeMan)` in calc/mortgage.js
- **変更箇所**: 
  - `calc/integrated.js`: 清算額 `liquidationThisYear` を投資プール加重税率で gross up
  - `calc/retirement.js`: `dividendIncome` に配当税率 `_divTaxRate` 適用、4 プール取崩に `_grossUpIndex/_grossUpDiv` 導入、`withdrawalShortfall` を `_remaining` ベースに変更
- **snapshot 差分行数**: 約 4242 行（insertions 2121 + deletions 2121）
- **シナリオ別変化**: 
  - A 田中葵: 投資がすべて nisa/ideco → 差分なし ✅
  - B 鈴木健太: 投資がすべて nisa/ideco → 差分なし ✅
  - C 山本誠: tokutei 投資（high_dividend 800, trust_sp500 500）保有 → 重み付き税率 ≈ 7.7%、`liquidation` +8%（592→640）、`investPool` -1〜-8%、`dividendIncome` 74→56（-24.3%、dividendPool 全額 tokutei）、`endAssets` -5〜-6%
  - D 中村博: tokutei 投資（japan_stock 800）保有 → 重み付き税率適用、`liquidation` 896→965（+7.7%）等、`endAssets` -5〜-6%
  - E 林菜緒: 投資が nisa_tsumitate + ideco のみ → 差分なし ✅（清算額は gross-up ゼロ）
- **手検算（シナリオ C、weighted tax 計算）**: 
  - 初期値: nisa_tsumitate 800+300=1100, nisa_growth 600, ideco 420 (全非課税), high_dividend 800, trust_sp500 500 (全 tokutei)
  - 投資プール総額 = 1100+600+420+800+500 = 3420 万
  - 税額加重 = (800+500) × 0.20315 = 264.1
  - weighted rate ≈ 264.1 / 3420 = 7.72%
  - Gross-up 係数 = 1 / (1-0.0772) = 1.0838 → +8.4%
  - 実測 liquidation: 592→640 = +8.1% ✅
- **方向の評価**: 期待通り
  - 清算 +25% 想定は「全額 tokutei」のケース。実サンプルは NISA 比率が高いため +8% 程度に収まる
  - `investPool` の減少速度・`endAssets` -5〜-10% 減は期待通り
  - NISA 比率高いサンプル（A/B/E）の影響ゼロは期待通り
  - `investPoolHealthy` ガードとの整合性: 既存ロジックは変更せず `liquidationThisYear` の値のみ gross 版で積み上げ

---

## Group 3: NISA 温存取崩順序 + iDeCo 一時金化（07-I04, 08-I02）

### 期待方向
（Task 6 実施時に記入）

### 実測サマリー
（Task 6 修正後に記入）
