# Phase 4a｜Important 高影響 14 件 修正フェーズ 設計書

- **作成日**: 2026-04-25
- **対象アプリ**: ライフプランアプリ（`index.html` + `calc/*.js`）
- **位置付け**: 計算ロジック検証プランの **Phase 4 の第 1 期（P4a）**。Phase 2 で検出された Important 43 件のうち、高影響・構造関連の 14 件を解消する。
- **前提フェーズ**:
  - Phase 1 スナップショット（`1f83582`）
  - Phase 2 監査（`0d16b30`）
  - Phase 2.5 Critical 10 件修正（`9ac846f`）
  - Phase 3 計算ロジック分離（`c17ed27`）
  - Phase 3.5 年金コア抽出（`b044118`）
- **後続**:
  - Phase 4b: 残り Important 25 件（ライフイベント費用・パートナー・旧NISA・旧データ互換 等）
  - Phase 4c: iDeCo 受給方法選択の UI 化（一時金/年金/併用、希望あれば）

---

## 1. 背景と目的

Phase 2 監査で検出された 43 件の Important のうち、**金額インパクトが大きい or 構造的に関連するグループ** 14 件を 1 フェーズで解消する。

残り 25 件（G5-G10）は個別性が高く、UI 改修や機能追加のついでに対応する方が効率的。Phase 4a は「高影響側を先回収」して、Phase 4b 以降を軽くする方針。

**本フェーズの成功基準**：
- 計算ロジックが FP 実務としてより正確になる
- 誤って甘い見積もり（退職所得控除なし・iDeCo 受給扱い単純化・繰下げ率未反映など）で**過大推計していた部分を是正**
- Phase 1 スナップショットは意図的に更新される（承認済み）

---

## 2. スコープ

### 2.1 対象 14 件（5 グループ）

| グループ | Important ID | 件数 |
|---------|-------------|------|
| **G1 年金制度対応** | `04-I01`, `04-I02`, `04-I03`, `04-I04` | 4 |
| **G2 清算時の税引き** | `07-I01`, `08-I01`, `09-I02` | 3 |
| **G3 NISA 温存取崩順序** | `07-I04`, `08-I02` | 2 |
| **G4 退職計算** | `08-I03`, `08-I04`, `08-I05` | 3 |
| **G11 統合シム** | `09-I01`, `09-I03` | 2 |

### 2.2 スコープ外

- 残り Important 25 件（Phase 4b 以降）：
  - G5 ライフイベント費用キャリブレーション（`03-I01/I02/I05/I06/I07/I09/I10`、7 件）
  - G6 インフレ変数統一（`02-I02`、1 件）
  - G7 income_change モデル（`02-I03`、1 件）
  - G8 旧NISA/振替（`01-I01/I02/I03`、3 件）
  - G9 パートナー関連（`06-I01/I02/I03/I04`、4 件）
  - G10 住宅ローン残タスク（`05-I01/I02/I03/I04/I05/I06`、6 件）
- Minor 63 件全般
- UI の iDeCo 受給方法選択（Phase 4c 候補、本フェーズでは「60 歳一時金」固定）
- 相続・贈与・賃貸比較・支出管理アプリ連携（Phase 2 で未監査領域扱い）

### 2.3 UI 変更

**なし**（計算ロジック修正のみ）。iDeCo 受給方法も UI で選ばせず、デフォルト「60 歳一時金」で固定。

---

## 3. 修正内容詳細

### 3.1 G1 年金制度対応（4 件・1 コミット）

| ID | 修正内容 | 触るファイル | 期待インパクト |
|----|---------|------------|--------------|
| **04-I01** 2003 年 3 月以前の乗率（7.125/1000） | `_calcPensionCore` に `birthYear` 引数追加。2003 年 3 月以前加入部分を 7.125/1000、以降を 5.481/1000 で分割計算 | `calc/pension.js` | 1970 年生・平均年収 500 万で約 **+7%**（過少修正） |
| **04-I02** 繰下げ率が試算に反映されない | `adjustRate(pensionAge)` 新設（60-75 歳の増減率）。`calcRetirementSimWithOpts` で `basePensionAnnual *= adjustRate(pensionAge)` を乗算 | `calc/pension.js`, `calc/retirement.js` | 70 歳繰下げで **+42%**。シナリオ C/D の退職期資産増 |
| **04-I03** 手取率 0.87 固定 → 階層別 | `_calcPensionCore` の `netTotal` 計算を年金額階層別テーブルに：150万以下 0.95、150-300万 0.90、300-500万 0.85、500万超 0.82 | `calc/pension.js` | 低所得 +4%、高所得 -2% |
| **04-I04** 満額 2024 年度 6.8 → 2026 年度 7.06 万 | `KOKUMIN_FULL_MONTHLY = 7.06` に更新 | `calc/pension.js` | 全シナリオで基礎年金 +3.8%、合計年金 +2-3% |

### 3.2 G2 清算時の税引き（3 件・1 コミット）

| ID | 修正内容 | 触るファイル | 期待インパクト |
|----|---------|------------|--------------|
| **07-I01** 清算額が税引前額面 | `calcCapitalGainsTax(amount, taxType)` を `calc/asset-growth.js` に新設。NISA 0%、特定口座 20.315%、iDeCo 0%（既に一時金化済み）を反映 | `calc/asset-growth.js`, `calc/integrated.js` | 清算発生時 **手取り約 -10%**、長期資産 **-5〜-10%** |
| **08-I01** 退職期の取崩・配当が税引前 | `calc/retirement.js` で `dividendPool` 配当・取崩額に実効税率適用 | `calc/retirement.js` | 配当 40万 → 31.87万。退職期 cashFlow 薄く |
| **09-I02** 統合シムの清算税引き | 07-I01 と同じ共通ヘルパ経由で解消 | `calc/integrated.js` | 07-I01 と同じ挙動を統合シムに波及 |

### 3.3 G3 NISA 温存取崩順序（2 件・1 コミット・iDeCo 一時金化含む）

| ID | 修正内容 | 触るファイル | 期待インパクト |
|----|---------|------------|--------------|
| **07-I04** `indexPool` を税制別サブプール化 | `calc/retirement.js` で `indexPool` を `indexTaxablePool`（特定口座）/ `indexNisaPool`（NISA）に分離。**iDeCo は 60 歳時点で全額一時金として cashPool に合流**（一時金額は G4 08-I03 の退職所得控除計算へパイプ） | `calc/retirement.js` | 退職期取崩の税効率改善 |
| **08-I02** NISA 温存順序 | 取崩順序を「特定口座 → NISA」の 2 プール順に単純化（iDeCo は事前消費済） | `calc/retirement.js` | 30 年取崩で総累計 **+5〜+10% 手取り増** |

**iDeCo 一時金化の仕様**：
- 退職期シミュ開始時に `idecoLumpsum = sum(assets where type === 'ideco' && yr >= 60).currentVal + 運用益` を計算
- `idecoLumpsum` を G4 08-I03 の退職所得控除計算に引き渡す
- 退職所得控除枠内なら税ゼロ、超過分は課税所得の 1/2 に
- 残額を cashPool に加算して退職期開始

### 3.4 G4 退職計算（3 件・1 コミット）

| ID | 修正内容 | 触るファイル | 期待インパクト |
|----|---------|------------|--------------|
| **08-I03** 退職所得控除（iDeCo一時金合算） | `calcSeveranceDeduction(severance, idecoLumpsum, serviceYears)` 新設。退職金 + iDeCo 一時金合算で控除枠計算。控除枠内は税ゼロ、超過は 1/2 に圧縮して課税所得へ | `calc/retirement.js` | 勤続 30 年・3,000 万退職金で **-184 万円/年**（過大推計修正） |
| **08-I04** cashFloor 残高判定 | `depleted` 判定で `cashFloor` ロック分を除外せず、UI 上で「emergency 以外ゼロ」を明示できるよう戻り値拡張 | `calc/retirement.js` | snapshot 微変動（`depleted: true` 年の繰上げ） |
| **08-I05** `returnMod` 非対称 | `returnMod` 適用を株式プール・現金プール両方に可能に。`returnModStock` / `returnModCash` の 2 軸オプション化（既存の `returnMod` は `returnModStock` のエイリアス） | `calc/retirement.js` | 楽観/悲観シナリオで現金利回りも動く |

### 3.5 G11 統合シム（2 件・1 コミット）

| ID | 修正内容 | 触るファイル | 期待インパクト |
|----|---------|------------|--------------|
| **09-I01** 収入税引きの一貫性 | `calc/integrated.js` で `_inputMode === 'gross'` 時に収入全体に手取率、配当税引きと重複しないよう順序整理 | `calc/integrated.js` | gross モードユーザーで収入 -5〜-8% |
| **09-I03** opts.noLoan での住宅ローン控除除外 | `(y === 0 \|\| opts.noLoan) ? 0 : calcMortgageDeduction(yr, balance)` に 1 行修正 | `calc/integrated.js` | 住宅なしシナリオで控除 31.5 万円/年の架空計上が消える（現状サンプルには該当なし想定） |

### 3.6 共通ヘルパ新設

| 新規関数 | 配置先 | 用途 |
|---------|-------|------|
| `calcResidentTax(taxableIncomeMan)` | `calc/mortgage.js`（既に `calcIncomeTaxAmount` が同居） | G2・G4 共通 |
| `calcCapitalGainsTax(amount, taxType)` | `calc/asset-growth.js` | G2 清算・配当 |
| `calcSeveranceDeduction(severance, idecoLumpsum, serviceYears)` | `calc/retirement.js` | G4 退職所得控除 |
| `adjustRate(pensionAge)` | `calc/pension.js` | G1 繰下げ率 |

---

## 4. 修正ワークフロー

各グループで以下を繰り返す：

```
1. 「期待される変化方向」を事前宣言
   → docs/phase4-fixes/expected-changes.md に Group N セクションを追加

2. 該当 calc/*.js を修正

3. npm test 実行
   → Phase 1 snapshot が赤くなる（計算変更）
   → 既存ユニットテスト 128 + smoke 2 はグリーン維持

4. git diff test/__snapshots__/ で差分目視
   - 宣言した方向に数値が動いているか
   - 想定外の変動なし

5. 問題なければ:
   - npm run test:update で snapshot 承認
   - fix + 更新 snap + expected-changes.md をまとめて 1 コミット

6. 実測サマリーを expected-changes.md に追記 + SHA record コミット
```

### 実施順序（推奨）

依存関係と影響範囲を考慮：

```
G11（統合シム・軽量）
  ↓ ウォーミングアップ
G4（退職計算）
  ↓ 08-I03 を G3 で再利用するため先行
G1（年金）
  ↓ 繰下げ率・基礎年金更新
G2（税引き）
  ↓ 共通ヘルパ導入、最も広範な影響
G3（NISA 温存 + iDeCo 一時金化）
  ↓ 最もトリッキー、G4 の控除を活用
最終検証
  ↓ サニティウォークスルー再実行
```

---

## 5. 成功基準

1. ✅ 14 件の Important に Phase 4a コミット SHA が紐づいている
2. ✅ 全 5 グループのコミットが `main` に反映済み（fix 5 + SHA record 5 + 最終 ≈ 11 コミット）
3. ✅ `npm test` で **155/155 グリーン**
4. ✅ Phase 1 スナップショット（25 件）が意図通り更新され、`git diff` で全ての変化方向が確認済み
5. ✅ `docs/phase4-fixes/expected-changes.md` に各グループの期待方向と実測サマリーが記録
6. ✅ Phase 2 監査レポート該当 Important に `[Resolved in Phase 4a commit XXXX]` 注記
7. ✅ サニティウォークスルー（`docs/phase2-audits/sanity-walkthrough-シナリオB.md`）が Phase 4a 完了後の評価で更新

---

## 6. 既知のリスクと対処

| # | リスク | 対処 |
|---|--------|------|
| 1 | G1 04-I02 繰下げ率導入で退職期資産が大幅増 → 「数字が違う」と混乱 | expected-changes.md に期待方向を明記、walkthrough 更新で妥当性確認 |
| 2 | G2 税引き導入で FIRE シナリオ C の達成年が数年後ろにズレる | 期待方向に「FIRE 達成年延伸」を事前宣言。これが現実的な挙動 |
| 3 | G3 の iDeCo 一時金化で既存サンプルの resnapshot が大規模 | 差分を目視確認し、60 歳年度の cashPool ジャンプが妥当か検算 |
| 4 | G4 退職所得控除で勤続年数が必要だが入力フィールドなし | `state.retirement.serviceYears` が未設定なら「開始 22 歳 → targetAge」の差分で近似 |
| 5 | 複数グループの相互作用で予測困難な snapshot 動き | グループを**順序付け**（G11→G4→G1→G2→G3）。各グループ単独 diff で検算可能に |
| 6 | Phase 2.5 09-C01 との干渉 | 09-C01 修正は既に snapshot に反映済み。今回は純粋な追加修正 |
| 7 | `calcIncomeTax`・`calcResidentTax` の重複実装 | Phase 4a 中に共通ヘルパ化。将来 Phase 5+ で `calc/tax.js` に独立抽出の候補 |
| 8 | iDeCo 一時金化の 60 歳固定が実態と合わないユーザーが出る | expected-changes.md に「Phase 4c で UI 選択肢追加予定」を注記 |

---

## 7. 成果物一覧（完了時の git 状態）

```
ライフプランアプリ/
├── calc/
│   ├── asset-growth.js       ← calcCapitalGainsTax 追加
│   ├── mortgage.js           ← calcResidentTax 追加（calcIncomeTaxAmount と同居）
│   ├── pension.js            ← adjustRate 追加、04-I01/I02/I03/I04 修正
│   ├── retirement.js         ← calcSeveranceDeduction、iDeCo 一時金化、NISA 温存順序、returnMod 非対称解消
│   └── integrated.js         ← G2 清算税引き、09-I01/I03 修正
├── docs/
│   └── phase4-fixes/                    ← 新規ディレクトリ
│       └── expected-changes.md          ← 各グループの期待方向と実測
├── docs/phase2-audits/*.md              ← 該当 Important に Resolved 注記追加（14 件）
└── test/__snapshots__/scenario-snapshot.test.js.snap  ← 意図的に更新
```

---

## 8. Phase 4b 以降への橋渡し

Phase 4a 完了後、残り Important 25 件は個別性が高いため、以下の方針で Phase 4b 以降：

- **G5 ライフイベント費用キャリブレーション**（7 件、`calc/life-events.js`）: `EDU_COST` テーブル更新 + 保育料所得連動 + 育休給付期間分岐。UI に「住宅種別セレクタ」のような新規入力が必要になる可能性あり。
- **G6 インフレ変数統一**（1 件、`calc/income-expense.js` + `calc/retirement.js`）: `finance.inflationRate` と `retirement.inflationRate` の統一。UI 注記追加。
- **G7 income_change モデル**（1 件、`calc/income-expense.js`）: 転職後も昇給継続オプション。
- **G8 旧 NISA/振替**（3 件、`calc/asset-growth.js`）: 税引繰延、旧 NISA ガード、振替サイクル。
- **G9 パートナー関連**（4 件、主に `calc/integrated.js` + `calc/retirement.js`）: パートナー就労収入昇給、配偶者控除、退職後保険料、加給年金。
- **G10 住宅ローン残タスク**（5 件、`calc/mortgage.js`）: 子育て特例、頭金計上、借換諸費用、NaN 伝播、同年複数イベント順序。

**Phase 4c（iDeCo 受給方法 UI 化）**：希望あれば実装。一時金/年金/併用 + 受給開始年齢 60-75 歳をユーザーが選択可能に。
