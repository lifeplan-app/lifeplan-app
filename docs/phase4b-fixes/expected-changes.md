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
- **commit SHA**: （Step 8 で追記）
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
（Task 3 実施時に記入）

### 実測サマリー
（Task 3 修正後に記入）

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
