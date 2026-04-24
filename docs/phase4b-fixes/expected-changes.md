# Phase 4b 修正の期待方向と実測

Important 18 件を 6 グループに分けて修正した記録。
実施順序: G12 → G6 → G8 → G9 → G5（影響小 → 影響大）。

---

## Group 12: 投資プール残タスク（07-I02, 07-I03）

### 期待方向
- **対象**:
  - 07-I02: cash_reserved をメインの現金プールから隔離（生活費赤字補填対象外）
  - 07-I03: _wInvestReturn を年次再計算（初年度時価加重ではなく毎年の時価加重）
- **期待される snapshot 差分**:
  - サンプルに `cash_reserved` タイプのアセットがあれば snapshot 変化（赤字補填が cash_reserved を侵食しない）
  - NISA 積立で投資プール構成が変わるシナリオ（特に若年層）で、長期（15年以上）の `_wInvestReturn` が上昇 → 機会損失複利が増える方向
- **確認ポイント**:
  - サンプルの `cash_reserved` アセット確認
  - 初年度 snapshot が既存と一致（初年度の `_wInvestReturn` は同じ）

### 実測サマリー
- **commit SHA**: `cef2643`
- **snapshot 差分行数**: 約 2890 行（挿入 1445 / 削除 1445）
- **サンプルの `cash_reserved`**: 0 件（5 サンプルいずれも未使用）
- **シナリオ別変化**:
  - A（26歳独身奨学金）: 差分なし
  - B（35歳共働き住宅ローン）: 差分あり（2078年以降の清算期、数万円レベル）
  - C（45歳FIRE）: 差分あり（`calcIntegratedSim` / `calcRetirementSimWithOpts` 標準・楽観・悲観 / `calcScenarioFullTimeline` すべて）
  - D（55歳老後準備期）: 差分なし
  - E（38歳シングル）: 差分あり（`calcIntegratedSim` / `calcScenarioFullTimeline`）
- **方向の評価**: 期待通り。
  - 初年度 snapshot は既存と完全一致（最初の差分は B シナリオ 2078 年＝清算発動後の長期区間で発生）。07-I03 の「初年度は既存 `_wInvestReturn` と同一動作」要件を満たす。
  - 07-I02: サンプルに `cash_reserved` が無いため赤字補填経路の差分は 0（想定通り）。コードパスとしては隔離を実装済み（将来 `cash_reserved` を持つ入力で効果が出る）。
  - 07-I03: 清算が実際に走るシナリオ（B/C/E）でのみ長期値が変動。差分は ±1〜数万円規模の微小幅で、`_calcWInvestReturnAt(y)` による年次再加重が投資プール構成の時価変化を反映した結果。
  - `calcRetirementSimWithOpts` / `calcScenarioFullTimeline` の差分は内部で `calcIntegratedSim` を呼ぶため伝播したもの（呼び出し経路 `calc/retirement.js:37,215,312` 確認済み）。

---

## Group 6: インフレ変数統一（02-I02）

### 期待方向
- **対象**: 02-I02 インフレ変数二重管理の解消
- **期待される snapshot 差分**:
  - サンプルが `state.retirement.inflationRate` を明示設定していれば従来通り → 差分ゼロ
  - サンプルが未設定（`retirement.inflationRate` null/未定義）なら現状の 1.5% デフォルトから `finance.inflationRate`（2%）にフォールバック → **退職期 annualExpense が微増**
  - シナリオ B 鈴木健太の退職期 30 年で 1.015^30 ≈ 1.563 → 1.02^30 ≈ 1.811、約 16% 増相当
  - 最終資産（endAssets）は減方向
- **確認ポイント**: サンプルの `retirement.inflationRate` 設定を事前 grep
- **実サンプル確認（事前 grep 結果）**:
  - サンプル 5 件すべて `retirement.inflationRate` を明示設定（A/B/D/E=1.0、C=1.5）
  - `finance.inflationRate` はすべて未設定（デフォルト 2% にフォールバック）
  - **逆方向の影響**: 退職期は従来通り（変化なし）、**現役期インフレ率が 2% → retirement 値（1.0〜1.5%）に低下** → 現役期の各支出（childcare/education/insurance/recurring など）の名目値が減少 → 各年の `annualExpense` が微減、`endAssets` は**増方向**
  - シナリオ A（2026→2048、22 年）: 1.02^22 ≈ 1.546 → 1.01^22 ≈ 1.244、約 19.5% 低下
  - シナリオ B/D/E も同様に現役期インフレ係数が低下
  - シナリオ C（1.5%）は 1.02^N → 1.015^N、影響はより小さい

### 実測サマリー
- **commit SHA**: `bee694a`
- **snapshot 差分行数**: 11,300 行（挿入 5,650 / 削除 5,650）
- **サンプルの `retirement.inflationRate` 設定**: 5 サンプルすべて設定済み（A/B/D/E=1.0、C=1.5）、`finance.inflationRate` は全件未設定
- **シナリオ別変化**（各シナリオとも `calcIntegratedSim` / `calcRetirementSimWithOpts`（標準/楽観/悲観）/ `calcScenarioFullTimeline` に影響）:
  - A（26歳独身・inflation=1.0）: 2027 年 annualExpense 196→194、totalWealth 114→116、長期で効果拡大（146 hunks）
  - B（35歳共働き・inflation=1.0）: 現役期支出減 → 資産積み増し（154 hunks）
  - C（45歳FIRE・inflation=1.5）: 最も変化が小さい（差分 2% → 1.5% のみ）、2027 年 annualExpense 926→921（84 hunks）
  - D（55歳老後準備・inflation=1.0）: 退職間近で現役期短いが、退職後ではなく「現役期〜退職期境界」で差分が積み上がる（205 hunks）
  - E（38歳シングル・inflation=1.0）: 2027 年 annualExpense 295→292、leCost も教育費インフレが抑制されて減少（17 hunks、清算発動が遅れる）
- **方向の評価**: 期待通り（ただし方向は当初仮説と逆）。
  - 当初想定：サンプルが retirement.inflationRate を未設定なら退職期支出増・endAssets 減を期待
  - 実際：**サンプル全 5 件が retirement.inflationRate を明示設定**しており、退職期は変化なし。代わりに現役期のインフレ率が `finance.inflationRate`（default 2%）から `retirement.inflationRate`（1.0〜1.5%）に**低下**した結果、現役期 annualExpense が微減・endAssets は増加。
  - 02-I02 の「二重管理の解消」自体は達成：現役期と退職期が同じ `_getInflationRate(state)` ソースを参照する。
  - 後方互換性：`retirement.inflationRate` 明示設定は従来通り尊重されるため、サンプル退職期の計算結果に影響なし（確認済み）。
  - シナリオ A・E で `endAssets` が大幅改善（A: -116 → 1311 等）しているのは、元々資産枯渇寸前のサンプルでインフレ 1% 低下が複利で効いた結果。

---

## Group 8: 旧 NISA/振替（01-I01, 01-I02, 01-I03）

### 期待方向
- **対象**:
  - 01-I01: 課税口座の毎年課税近似（Phase 4b では現状維持＋コメント追加のみ、Phase 5 で完全実装）
  - 01-I02: 旧 NISA noNewContrib 非 UI 経路ガード（`calcAssetGrowth` 内で強制 annualContrib = 0）
  - 01-I03: 振替サイクル _wastedContribsByYear 補正（既存コード確認、漏れがあれば補完）
- **期待される snapshot 差分**:
  - 01-I02: サンプルに旧 NISA（`nisa_old_tsumitate`, `nisa_old_general`）が含まれかつ `yr > endYear` で `monthly > 0` のケースでのみ差分。通常サンプルは UI 経由で `monthly=0` になっているため差分ゼロの可能性
  - 01-I03: サイクルのある振替設定がないサンプルでは差分ゼロ
  - 01-I01: 本 Task では差分ゼロ（コメント追加のみ）
- **確認ポイント**: サンプルの旧 NISA・振替設定を事前 grep
- **実サンプル確認（事前 grep 結果）**:
  - `nisa_old_tsumitate` / `nisa_old_general`: 5 サンプルいずれも 0 件（grep 結果一致なし）
  - `overflowTargetId` / `overflowTargetId2` / `nisaOverflowTargetId`: 5 サンプルいずれも 0 件
  - → 01-I02 / 01-I03 は本サンプルセットでは差分ゼロ見込み。ガード・補完は非 UI 経路（JSON import / 将来の振替設定追加）への二重防御として実装。

### 実測サマリー
- **commit SHA**: `60c230d`
- **snapshot 差分行数**: 0 行（差分なし）
- **サンプルの旧 NISA 有無**: なし（5 サンプルいずれも `nisa_old_tsumitate` / `nisa_old_general` 未使用）
- **サンプルの振替サイクル有無**: なし（5 サンプルいずれも `overflowTargetId` / `overflowTargetId2` / `nisaOverflowTargetId` 未設定）
- **01-I01 の扱い**: コメント追加のみ、Phase 5 で本格実装
- **方向の評価**: 期待通り。
  - 01-I02: 旧 NISA `noNewContrib && yr > endYear` ガードを `calcAssetGrowth` 内に挿入。サンプルに該当データなしのため差分ゼロ（コードパスは二重防御として整備）。
  - 01-I03: サイクル時のフォールバックで `_wastedContribsByYear` がサイクル内→サイクル内への振替を wasted 計上するように改善。サンプルにサイクル設定なしのため差分ゼロ。
  - 01-I01: `effectiveReturn` に Phase 5 TODO コメントのみ追加（挙動変更なし）。

---

## Group 9: パートナー関連（06-I01, 06-I02, 06-I03, 06-I04）

### 期待方向
- **対象**:
  - 06-I01: リタイア期パートナー就労収入の昇給累積適用
  - 06-I02: 配偶者控除の簡易近似（gross モード限定）
  - 06-I03: パートナー退職後 60 歳未満の国民年金保険料 21.012 万円/年
  - 06-I04: 加給年金簡易実装（本人 65-74 歳 × 配偶者 65 歳未満）
- **期待される snapshot 差分**:
  - 06-I01: パートナーあり（B 鈴木健太、C 山本誠、D 中村博）で partnerGrowthRate > 0 のケースで退職シミュの partnerWorkIncome が増方向。ただし Phase 2.5 02-C01 の検証で「サンプルはすべて partnerGrowthRate = 0」だったため差分ゼロの可能性
  - 06-I02: 全サンプル net モードのため差分ゼロ想定
  - 06-I03: パートナー退職年齢 60 歳未満のサンプルで支出増（要確認）
  - 06-I04: 本人・配偶者の年齢差があるサンプル（B 鈴木、C 山本、D 中村）で 65 歳以降の pension_p 計上開始前の期間に 40 万円/年加算
- **確認ポイント**: サンプルの partnerGrowthRate、partnerTargetAge、年齢差

### 実測サマリー
- **commit SHA**: `33f50dd`
- **snapshot 差分行数**: 1,750 行（挿入 875 / 削除 875）
- **サンプルのパートナー情報**:
  - A（石川花子・独身）: パートナーなし → 全修正が no-op
  - B（鈴木健太 1991-04-20）+ 妻（1993-08-12、-2 歳）: partnerIncome=12、partnerBonus=10、partnerGrowthRate 未設定、partnerTargetAge 未設定。targetAge=65 → 加給年金 2056-2057（本人 65-66 × 配偶者 63-64）
  - C（山本誠 1981-09-15）+ 妻（1983-05-22、-2 歳、専業主婦）: partnerIncome=0（就労収入ゼロ）。targetAge=55 → 加給年金 2046-2047（本人 65-66 × 配偶者 63-64）
  - D（中村博 1971-05-18）+ 妻（1973-02-28、-2 歳）: partnerIncome=8、partnerBonus=0、partnerGrowthRate/targetAge 未設定。targetAge=65 → 加給年金 2036-2037（本人 65-66 × 配偶者 63-64）
  - E（38歳シングル・独身）: パートナーなし → 全修正が no-op
  - 全サンプル `_inputMode` 未設定（net モード、gross モードではない）
  - 全サンプル `partnerGrowthRate` 未設定（= 0）
  - 全サンプル `partnerTargetAge` 未設定（= null）
- **シナリオ別変化**:
  - A（独身）: 差分なし
  - B（共働き）: 加給年金発現（pension 163→203、192→232 等で +40 万円、2 年分）。`partnerWorkIncome` は昇給なし（154 のまま）、国民年金は partnerTargetAge 未設定のため加算されず。endAssets 微増
  - C（FIRE）: 加給年金発現。partnerIncome=0 のため 06-I01 影響なし、targetAge 未設定のため 06-I03 影響なし
  - D（老後準備）: 加給年金発現（pension 184→224 等）、endAssets 微増
  - E（シングル）: 差分なし
- **方向の評価**: 期待通り。
  - 06-I01（昇給累積）: 全サンプルで `partnerGrowthRate=0` のため発現せず、`partnerWorkIncome` 数値不変（後方互換維持）。コードパスは昇給率 > 0 の入力で機能する。
  - 06-I02（配偶者控除近似）: 全サンプル net モードのため発現せず（差分ゼロ）、gross + 配偶者 103 万以下入力で +0.5% 適用。
  - 06-I03（国民年金）: 全サンプルで `partnerTargetAge` 未設定（= null）のため発現せず、退職年齢 < 60 のパートナー入力で年 21.012 万円加算。
  - 06-I04（加給年金）: B/C/D 全てで年齢差 2 歳のため本人 65-66 歳の 2 年分 +40 万円が明確に発現。`adjustRate` 適用後の `pensionAnnual` に加算されるため、繰下げ・繰上げ選択と独立に正しく +40 万円増加。

---

## Group 5: ライフイベント費用（03-I01, 03-I02, 03-I03, 03-I05, 03-I06, 03-I07, 03-I09, 03-I10）

### 期待方向
（Task 6 実施時に記入）

### 実測サマリー
（Task 6 修正後に記入）
