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
（Task 4 実施時に記入）

### 実測サマリー
（Task 4 修正後に記入）

---

## Group 9: パートナー関連（06-I01, 06-I02, 06-I03, 06-I04）

### 期待方向
（Task 5 実施時に記入）

### 実測サマリー
（Task 5 修正後に記入）

---

## Group 5: ライフイベント費用（03-I01, 03-I02, 03-I03, 03-I05, 03-I06, 03-I07, 03-I09, 03-I10）

### 期待方向
（Task 6 実施時に記入）

### 実測サマリー
（Task 6 修正後に記入）
