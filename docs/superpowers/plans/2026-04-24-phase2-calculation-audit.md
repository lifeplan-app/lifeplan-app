# Phase 2 計算ロジック監査 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ライフプランアプリの計算ロジック9領域を FP標準と突き合わせ、人間が読める監査レポート + シナリオBサニティウォークスルー + 優先度付き問題リストを作成する。

**Architecture:** 各領域について index.html から該当関数を読み、FP教科書・税法・公式資料と計算式を突き合わせて固定フォーマットの Markdown 監査レポートを作成する。最後に1シナリオの年次出力をナラティブ解説し、問題を集約する。**index.html は一切変更しない**。

**Tech Stack:** Markdown（ドキュメントのみ）、既存 Phase 1 スナップショット（`test/__snapshots__/scenario-snapshot.test.js.snap`）をウォークスルー用データソースに使用、WebSearch を活用して税法・制度の根拠を引用

**基準設計書:** `docs/superpowers/specs/2026-04-24-phase2-calculation-audit-design.md`

**リポジトリ:** `/Users/nagatohiroki/ライフプランアプリ/`（main ブランチ直接作業）

**⚠️ 重要な前提:**
- 日本語パス `/Users/nagatohiroki/ライフプランアプリ/` はシェルで必ず **ダブルクォート** で囲む
- `node` / `npm` は nvm 経由（`source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 &&` を付ける。本 Phase 2 では基本的にコマンド実行不要・Markdown 執筆中心）
- **index.html は絶対に編集しない**（誤編集は Phase 1 スナップショットで検知されるが、そもそも Phase 2 ではコード修正禁止）
- 各監査の信頼性は「**引用元の明示**」で担保：FP教科書・国税庁・厚労省・金融庁等の URL または書籍ページ数を引用すること

---

## File Structure

### 新規作成するディレクトリ・ファイル

| パス | 役割 |
|------|------|
| `docs/phase2-audits/` | 新規ディレクトリ（監査成果物の格納先） |
| `docs/phase2-audits/_audit-template.md` | 監査レポートの章構成テンプレート（Task 1 で作成） |
| `docs/phase2-audits/01-asset-growth.md` | ⓖ 資産成長複利 + 税引き |
| `docs/phase2-audits/02-income-expense.md` | ⓗ 収入・支出の経年変化 |
| `docs/phase2-audits/03-life-events.md` | ⓘ ライフイベント費用 |
| `docs/phase2-audits/04-pension.md` | ⓒ 年金試算 |
| `docs/phase2-audits/05-mortgage.md` | ⓓ 住宅ローン + 控除 |
| `docs/phase2-audits/06-partner-retirement.md` | ⓔ パートナーリタイア |
| `docs/phase2-audits/07-two-pool-model.md` | ⓕ 二プールモデル |
| `docs/phase2-audits/08-retirement-withdrawal.md` | ⓑ 出口戦略・4プール取り崩し |
| `docs/phase2-audits/09-integrated-simulation.md` | ⓐ 統合キャッシュフロー |
| `docs/phase2-audits/sanity-walkthrough-シナリオB.md` | シナリオB 年次ナラティブ解説 |
| `docs/phase2-audits/summary-and-issues.md` | 全領域の問題集約・優先度付きリスト |

計 **12ファイル**（テンプレート1 + 監査9 + ウォークスルー1 + サマリー1）。

### 変更しない（重要）

- `index.html` — 一切変更しない
- `test/` 全般 — 触らない
- `package.json` — 触らない
- 既存コミット済みドキュメント — 触らない（`CLAUDE.md`, `docs/phase1-snapshot-guide.md`, 設計書等）

---

## 監査レポートの固定フォーマット（全タスクで共通）

各領域の `NN-<名前>.md` は以下の章構成を厳守する：

```markdown
# 監査レポート：[領域名]

- **対象領域**: ⓧ [領域名]
- **監査日**: 2026-04-24
- **信頼度判定**: ✅ 高 / ⚠️ 中 / ❌ 要対応

## 対象範囲
- 対象関数: `fn` (`index.html:line-line`), ...
- 呼び出し元: どこから使われているか（関数名・行番号）

## 1. 関数の目的と入出力
- 何を計算するか（1-2段落）
- 引数と型（`state` 依存含む）
- 戻り値と型

## 2. 使用している計算式
- 数式を明示（Markdown 数式または LaTeX スタイル、分かりやすければ表も可）
- コードからの該当箇所（関数名:行番号 + コード3-10行抜粋）

## 3. 標準との突合
- FP教科書・公式資料・税法等の標準的な計算式を並べて比較
- 一致 / 差異を明記
- **引用元を必ず明示**（URL・書籍名・条文名等）
- 差異があれば「意図した差異か、バグか」の判定

## 4. 仮定・制約
- 暗黙に仮定していること（一定率・無インフレ・完全税引き等）
- 実運用で仮定が崩れる条件

## 5. エッジケース
- 特殊値入力時（0、負数、極大値、欠損）の挙動
- コード内の防御（ガード句・early return）の有無

## 6. 検出された問題（深刻度付き）
- 🔴 **Critical**: 明確なバグまたは税法違反
- 🟡 **Important**: 仮定の説明不足・UI誤解リスク・特殊ケース未対応
- 🟢 **Minor**: 命名・コメント・軽微な改善

各問題には ID（`[領域番号]-[連番]`、例 `01-C01`）を付与。

## 7. 結論
- この領域の信頼度: ✅ 高 / ⚠️ 中 / ❌ 要対応（上部の判定と整合させる）
- 一言サマリー（1-2文）
```

---

## Task 1: セットアップ（ディレクトリ作成 + テンプレート）

**Files:**
- Create: `docs/phase2-audits/_audit-template.md`

**狙い:** 以降の Task 2-10 で使う章構成テンプレートを1つのファイルに固定する。各監査はこのテンプレートをコピーして埋めていく。

- [ ] **Step 1: ディレクトリ作成と確認**

Run:
```bash
mkdir -p "/Users/nagatohiroki/ライフプランアプリ/docs/phase2-audits" && ls -la "/Users/nagatohiroki/ライフプランアプリ/docs/phase2-audits"
```
Expected: ディレクトリが存在し、現在中身は空。

- [ ] **Step 2: テンプレートファイルを作成**

Create `docs/phase2-audits/_audit-template.md` with exactly this content:

```markdown
# 監査レポート：[領域名]

- **対象領域**: ⓧ [領域名]
- **監査日**: 2026-04-24
- **信頼度判定**: ✅ 高 / ⚠️ 中 / ❌ 要対応

## 対象範囲
- 対象関数: `fn` (`index.html:line-line`), ...
- 呼び出し元: どこから使われているか（関数名・行番号）

## 1. 関数の目的と入出力
- 何を計算するか（1-2段落）
- 引数と型（`state` 依存含む）
- 戻り値と型

## 2. 使用している計算式
- 数式を明示
- コードからの該当箇所（関数名:行番号 + コード3-10行抜粋）

## 3. 標準との突合
- FP教科書・公式資料・税法等の標準的な計算式を並べて比較
- 一致 / 差異を明記
- **引用元を必ず明示**（URL・書籍名・条文名等）
- 差異があれば「意図した差異か、バグか」の判定

## 4. 仮定・制約
- 暗黙に仮定していること
- 実運用で仮定が崩れる条件

## 5. エッジケース
- 特殊値入力時の挙動
- コード内の防御の有無

## 6. 検出された問題（深刻度付き）

### 🔴 Critical
（なし、またはリスト）

### 🟡 Important
（なし、またはリスト）

### 🟢 Minor
（なし、またはリスト）

## 7. 結論
- この領域の信頼度: ✅ 高 / ⚠️ 中 / ❌ 要対応
- 一言サマリー
```

- [ ] **Step 3: コミット**

Run:
```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add docs/phase2-audits/_audit-template.md && git commit -m "docs(phase2): add audit report template"
```

---

## Task 2: 監査ⓖ 資産成長複利 + 税引き

**Files:**
- Create: `docs/phase2-audits/01-asset-growth.md`

**狙い:** `calcAssetGrowth` と `effectiveReturn` が FP標準の複利計算・税引後利回り計算と一致するかを監査する。これは多くの上位領域（統合シミュレーション・出口戦略）の土台なので最初に行う。

- [ ] **Step 1: 対象コードを読む**

以下の関数を `index.html` から読んで計算式・制御フローを把握する：

- `ASSET_TYPES` 定義 (検索: `const ASSET_TYPES = {`)
- `TAX_TYPE_DEFAULT` 定義
- `TAX_RATE` 定数（0.20315）
- `effectiveReturn(annualReturn, taxType)` 関数
- `calcAssetGrowth(a, years, extraContribs)` 関数 (`index.html:8690` 付近)
- `calcAllAssetGrowth(assets, years)` 関数 (`index.html:8810` 付近)

必要に応じて `test/helpers/core.js` も参照（同じ関数の抽出版）。

- [ ] **Step 2: FP標準の参照収集**

以下の標準を確認して引用できる形に整理：

- **複利公式**: FV = PV × (1 + r)^n （FP教科書・広く一般的）
- **積立の将来価値**: FV = PMT × ((1+r)^n − 1) / r
- **譲渡益・配当税率**: 所得税15% + 復興特別所得税0.315% + 住民税5% = 20.315%（国税庁「株式等の譲渡」: https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1463.htm）
- **NISA 非課税**: 金融庁「NISA」制度説明（https://www.fsa.go.jp/policy/nisa2/）
- **iDeCo 運用益非課税**: 国民年金基金連合会（https://www.ideco-koushiki.jp/）
- **配当受取モード（cashout vs reinvest）**: 実務的には「分配金を引き出して使うか再投資するか」の選択。標準的な FV 計算からの派生

WebSearch で最新の税率・制度変更を確認することを推奨。

- [ ] **Step 3: テンプレートからコピーして監査レポートを作成**

Create `docs/phase2-audits/01-asset-growth.md`。

以下の観点で各章を埋める：

**対象範囲**: 上記の関数名・行番号リスト

**1. 目的と入出力**: 
- 資産1つの `years` 年分の残高推移を計算
- 引数 `a`（アセット定義）、`years`、`extraContribs`（他アセットからの振替流入）
- 戻り値 `{values, overflows, overflows2}` の意味

**2. 使用している計算式**: 
- 期末残高 = 期初残高 × (1 + 税引後利回り) + 年間積立
- 税引後利回り = `effectiveReturn(annualReturn, taxType)` の処理
- 配当 cashout モード時の growthRate と dividendRate の分離
- annualLimit / lifetimeLimit による NISA 制限
- targetVal/targetVal2 による overflow 振替

**3. 標準との突合**: 
- 複利公式との一致確認
- 20.315% が 2026年時点で正しいか（NTA 引用）
- NISA 年間120万・成長枠240万・生涯1800万の上限値が正しいか（金融庁引用）

**4. 仮定・制約**: 
- 年次計算（月次ではない）→ 月々積立のタイミング誤差
- 税率一定（所得税変更に未対応）
- インフレ非考慮（実質利回りではなく名目利回り）

**5. エッジケース**: 
- `startYear`/`endYear` の境界
- `noNewContrib` フラグ（旧NISA）の扱い
- `targetVal > 0` かつ `prev >= targetVal` の overflow 分岐

**6. 問題**: 発見されたバグ・懸念を深刻度別に整理（無ければ「なし」）

**7. 結論**: 信頼度判定 + 1-2文

- [ ] **Step 4: 自己レビュー**

書き上げた監査を読み返し、以下を確認：
- 章がすべて埋まっているか（「TBD」「要調査」が残っていないか）
- §3 の引用元に URL または書籍名が付いているか
- §6 の問題に ID（`01-Cxx` / `01-Ixx` / `01-Mxx`）が付いているか
- §7 の判定が §6 の問題レベルと整合しているか（Critical があるのに ✅ 高 は矛盾）

- [ ] **Step 5: コミット**

Run:
```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add docs/phase2-audits/01-asset-growth.md && git commit -m "docs(phase2): audit asset growth and tax effective return"
```

---

## Task 3: 監査ⓗ 収入・支出の経年変化

**Files:**
- Create: `docs/phase2-audits/02-income-expense.md`

**狙い:** 収入（昇給・ボーナス・パートナー収入）と支出（インフレ調整）の年次進展が標準的な FP計算と整合するかを監査する。

- [ ] **Step 1: 対象コードを読む**

- `getIncomeForYear(yr)` (`index.html:6738` 付近)
- `getIncomeForYearWithGrowth(yr)`（あれば）
- `getExpenseForYear(yr)` (`index.html:6755` 付近)
- `getRecurringExpenseForYear(year)`
- `getOneTimeForYear(yr)`
- `state.finance.incomeGrowthRate`, `state.finance.incomeGrowthUntilAge`, `state.finance.inflationRate` の扱い
- パートナー収入（`partnerIncome`, `partnerBonus`）の合算処理
- `cashFlowEvents`（転職・副業・一時収入）の反映

- [ ] **Step 2: FP標準の参照収集**

- **インフレ複利**: 将来価値 = 現在価値 × (1 + 物価上昇率)^n
- **日本の CPI 推移**: 総務省統計局（https://www.stat.go.jp/data/cpi/）
- **平均昇給率**: 厚労省「毎月勤労統計」または連合「春闘結果」。デフォルト値3% が業界標準か確認
- **給与所得控除**: 国税庁タックスアンサー No.1410（https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1410.htm）

WebSearch で「日本 平均昇給率 2025」「CPI 日本 長期」等を確認。

- [ ] **Step 3: テンプレートからコピーして監査レポートを作成**

Create `docs/phase2-audits/02-income-expense.md`。

観点：
- 昇給の計算式（固定率 vs 年齢ピーク型 `fixed_rate` / `curve` 等のバリエーション）
- 「何歳まで昇給するか」の境界処理
- ボーナス年額が月次収入と別枠で加算されるか
- パートナー収入の昇給率（本人と同じか別設定か）
- インフレの基準年（初年度が 1.00 か、それとも特定年か）
- 特別支出（`expenses[]`）と繰り返し支出（`recurringExpenses[]`）の年次割当

§6 問題に ID `02-Xxx` を振る。

- [ ] **Step 4: 自己レビュー**

テンプレート章がすべて埋まり、標準との突合に引用元があるか確認。

- [ ] **Step 5: コミット**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add docs/phase2-audits/02-income-expense.md && git commit -m "docs(phase2): audit income and expense progression"
```

---

## Task 4: 監査ⓘ ライフイベント費用

**Files:**
- Create: `docs/phase2-audits/03-life-events.md`

**狙い:** `calcLECostByYear` が算出する年次の教育費・保育費・介護費・奨学金返済・住宅（ローン・賃貸）コストを FP実務の相場と突き合わせる。

- [ ] **Step 1: 対象コードを読む**

- `calcLECostByYear(year, opts)` (`index.html:13011` 付近)
- `state.lifeEvents.children[]` の構造（年齢・進学経路）
- `state.lifeEvents.scholarships[]` の構造
- `state.lifeEvents.care`（介護）の計算
- `calcRentResult()`（賃貸費用）
- 教育費テーブル（公立・私立・中高一貫・大学理系/文系 等のバリエーション）

- [ ] **Step 2: FP標準の参照収集**

- **教育費目安**: 文部科学省「子供の学習費調査」（https://www.mext.go.jp/b_menu/toukei/chousa03/gakushuuhi/）
- **保育園費用**: 自治体別、標準的な月額（所得応分で2-8万円程度）
- **介護費用**: 厚労省「介護保険事業状況報告」・生命保険文化センター「生活保障に関する調査」（平均月額7-8万円）
- **奨学金返済**: 日本学生支援機構（JASSO）

WebSearch で最新データを確認。

- [ ] **Step 3: テンプレートからコピーして監査レポートを作成**

Create `docs/phase2-audits/03-life-events.md`。

観点：
- 教育費のコース別金額がテーブル値か計算式か。値は文科省調査と整合するか
- 保育料の所得連動有無（単純な定額か）
- 介護費の発生年齢・期間の妥当性
- 奨学金返済額の計算（毎月返済額 × 12）と年次反映
- 特別費（住宅購入頭金等）との重複カウント有無

§6 問題に ID `03-Xxx`。

- [ ] **Step 4: 自己レビュー**

- [ ] **Step 5: コミット**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add docs/phase2-audits/03-life-events.md && git commit -m "docs(phase2): audit life event costs"
```

---

## Task 5: 監査ⓒ 年金試算

**Files:**
- Create: `docs/phase2-audits/04-pension.md`

**狙い:** `calcPensionEstimate` の公的年金（国民年金・厚生年金）試算が、厚生労働省の公式計算方法と一致するかを監査する。

- [ ] **Step 1: 対象コードを読む**

- `calcPensionEstimate()` (`index.html:15129` 付近)
- 被保険者種別（第1号〜第3号）の区別ロジック
- `state.retirement.pensionSlide`（年金スライド率）の使われ方
- 満額（現在 2026年で約81万円/年の基礎年金）のハードコードがあるか

- [ ] **Step 2: 公式計算方法の参照収集**

- **公的年金制度の概要**: 厚労省「公的年金制度」（https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/nenkin/nenkin/zaisei01/index.html）
- **国民年金（基礎年金）満額**: 令和8年度（2026年度）満額
- **厚生年金の計算式**: 平均標準報酬額 × 乗率 × 加入月数
  - 2003年3月以前: 平均標準報酬月額 × 7.125/1000 × 加入月数
  - 2003年4月以降: 平均標準報酬額 × 5.481/1000 × 加入月数
- **マクロ経済スライド**: 厚労省（https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/nenkin/nenkin/zaisei04/）
- **繰上げ/繰下げ**: 1ヶ月あたり 0.4%（繰上）/ 0.7%（繰下）

WebSearch で「厚生年金 計算式 2026」等を確認して最新値を拾う。

- [ ] **Step 3: テンプレートからコピーして監査レポートを作成**

Create `docs/phase2-audits/04-pension.md`。

観点：
- 基礎年金満額（2026年度値）が正しいか
- 厚生年金の乗率（5.481/1000, 7.125/1000）が実装されているか、簡易計算に置換されているか
- 標準報酬月額の上限（65万円）の扱い
- 加入月数の計算（就職〜退職）
- パートナーの年金（第3号被保険者なら基礎年金のみ）
- 繰上げ・繰下げ受給に対応しているか
- 年金スライドの扱い（減額・増額の適用範囲）

§6 問題に ID `04-Xxx`。

**注意**: 公的年金は **専門性が高く、高度な近似計算である可能性が高い**。正確な計算ではなく「実務で使われる概算計算」と一致するかを見る。

- [ ] **Step 4: 自己レビュー**

- [ ] **Step 5: コミット**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add docs/phase2-audits/04-pension.md && git commit -m "docs(phase2): audit pension estimate calculation"
```

---

## Task 6: 監査ⓓ 住宅ローン + 控除

**Files:**
- Create: `docs/phase2-audits/05-mortgage.md`

**狙い:** 住宅ローンの元利均等返済と住宅ローン控除の計算が、金融機関の標準計算・国税庁の控除制度と一致するかを監査する。

- [ ] **Step 1: 対象コードを読む**

- `calcMonthlyPayment(principal, annualRate, remainingMonths)` (`index.html:12548` 付近)
- `calcMortgageSchedule()` (`index.html:12557` 付近)
- `calcMortgage()` (`index.html:12607` 付近)
- 住宅ローン控除の計算箇所（`mortgageDeduct` フィールドで grep）
- `state.lifeEvents.mortgage` の構造

- [ ] **Step 2: 公式計算の参照収集**

- **元利均等返済**: 月返済額 = P × r × (1+r)^n / ((1+r)^n − 1)
  - P: 元金、r: 月利、n: 総回数
- **住宅ローン控除**: 国税庁タックスアンサー No.1211（https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1211.htm）
  - 一般住宅: 年末残高の 0.7% × 10年（2026年時点。R8要件以降で段階的変更あり）
  - 認定長期優良住宅等: 0.7% × 13年
  - 借入限度額: 住宅種類により 2000万〜5000万円
- **繰上返済**: 期間短縮型・返済額軽減型の計算

WebSearch で「住宅ローン控除 2026年」等を確認。

- [ ] **Step 3: テンプレートからコピーして監査レポートを作成**

Create `docs/phase2-audits/05-mortgage.md`。

観点：
- 月返済額の公式が元利均等返済と一致するか
- 金利（`loanRate`）の月利変換（`/12`）が正しいか
- 控除期間が 10年 / 13年を住宅種別で切り替えているか、それとも固定か
- 控除率 0.7% がハードコードされているか
- 借入限度額が住宅種別ごとに分かれているか
- 繰上返済イベント（`events[]`）の反映方法
- 控除対象は「所得税から引き切れない分を住民税から」の実務ルール通りか

§6 問題に ID `05-Xxx`。

- [ ] **Step 4: 自己レビュー**

- [ ] **Step 5: コミット**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add docs/phase2-audits/05-mortgage.md && git commit -m "docs(phase2): audit mortgage and tax deduction"
```

---

## Task 7: 監査ⓔ パートナーリタイア

**Files:**
- Create: `docs/phase2-audits/06-partner-retirement.md`

**狙い:** 配偶者の就労終了（退職）による合算収入・年金の変化処理が妥当かを監査する。

- [ ] **Step 1: 対象コードを読む**

- `state.finance.partnerIncome`, `partnerBonus` の扱い
- `state.retirement.partnerRetireAge` 相当のフィールド（grep で探す：`partnerRetire` キーワード）
- パートナー退職後の年金発生タイミング
- 配偶者控除・配偶者特別控除の扱い（あれば）
- `calcIntegratedSim` 内でのパートナー収入終了処理

- [ ] **Step 2: 標準の参照収集**

- **配偶者控除・配偶者特別控除**: 国税庁 No.1191（https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1191.htm）
- **遺族年金**: 厚労省（万が一の配慮があればチェック、なければ無関係）
- **第3号被保険者**: 配偶者が退職後に第3号になる条件

- [ ] **Step 3: テンプレートからコピーして監査レポートを作成**

Create `docs/phase2-audits/06-partner-retirement.md`。

観点：
- パートナー退職年の切り替わりが1年単位の跳躍か、段階的か
- 退職後のパートナー年金開始タイミング（65歳 固定 or パラメータ可変）
- 配偶者控除・配偶者特別控除の税効果が反映されているか（仮に未対応なら Important 扱い）
- パートナーが個人事業主など特殊ケースの扱い

§6 問題に ID `06-Xxx`。

**注意**: この領域は **実装が薄い or 隠れている可能性**がある。コードに明示的な `partnerRetire` 関数がなく、統合シミュレーション内で inline 処理されているかもしれない。その場合は「Important: 専用関数が存在せず統合内で埋没しているため監査困難」を記録。

- [ ] **Step 4: 自己レビュー**

- [ ] **Step 5: コミット**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add docs/phase2-audits/06-partner-retirement.md && git commit -m "docs(phase2): audit partner retirement handling"
```

---

## Task 8: 監査ⓕ 二プールモデル

**Files:**
- Create: `docs/phase2-audits/07-two-pool-model.md`

**狙い:** 現金プール・投資プール間の自動振替と、不足時の機会損失複利計算のロジックが FP実務の観点で妥当かを監査する。

- [ ] **Step 1: 対象コードを読む**

- `calcIntegratedSim` (`index.html:14225`) 内の二プール処理部
  - `_CASH_T`, `_cashGD`, `_investGD` 定義
  - `_wInvestReturn` 計算
  - `_investDeficit` / `_liquidationEvents` の扱い
- 振替先アセット（`overflowTargetId`, `overflowTargetId2`）
- targetVal / targetVal2 による余剰判定

- [ ] **Step 2: 標準の参照収集**

- **機会損失**: 使わなかった投資機会による複利損失 = 資金不足を現金で補填した場合、本来投資していれば得られていた複利成長の逸失
  - FP教科書的な概念。具体的な計算は慣行に依存
- **生活防衛資金の相場**: 生活費の 6ヶ月〜1年分が FP業界の標準
- **ドルコスト平均・リバランス**: 既存複利公式との組み合わせ

- [ ] **Step 3: テンプレートからコピーして監査レポートを作成**

Create `docs/phase2-audits/07-two-pool-model.md`。

観点：
- 現金プール・投資プールの境界（どのアセット種別がどちらに入るか）
- 余剰発生時の振替ロジックが連続性を保つか（年次単位で処理されるが、実質的に月次で発生するものを年次で合算することによる誤差）
- 不足発生時の投資プール清算 → 機会損失の累積計算が FP実務の「あり得るモデル化」か
- 機会損失複利の率（`_wInvestReturn`）が実態と整合するか（加重平均リターン）
- `overflow` と `overflow2` の2段階振替が意図通りに動くか

§6 問題に ID `07-Xxx`。

- [ ] **Step 4: 自己レビュー**

- [ ] **Step 5: コミット**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add docs/phase2-audits/07-two-pool-model.md && git commit -m "docs(phase2): audit two-pool cash/invest model"
```

---

## Task 9: 監査ⓑ 出口戦略・4プール取り崩し

**Files:**
- Create: `docs/phase2-audits/08-retirement-withdrawal.md`

**狙い:** 退職後の資産取り崩し（4プールモデル：cash_emergency → cash → dividend → invest）と、シナリオ別出口戦略（楽観・標準・悲観）の計算を監査する。

- [ ] **Step 1: 対象コードを読む**

- `calcRetirementSim()` (`index.html:15295` 付近)
- `calcRetirementSimWithOpts(opts)` (`index.html:17429` 付近)
- 4プールの取り崩し優先度
  - `_CASH_TYPES_RET`, `_CASH_NORMAL_TYPES` 定義
  - `_isDivPool` の判定
  - 取り崩し順：cashPool → indexPool → dividendPool → emergencyPool
- 退職金（severance）の扱い
- 年金受給開始（`state.retirement` パラメータ）
- 楽観・悲観シナリオの `returnMod`, `expenseMod`, `pensionMod`

- [ ] **Step 2: 標準の参照収集**

- **取り崩し順序**: FP業界の一般的な推奨順序（節税口座保護 vs 流動性確保）
  - 多くのFP文献では「特定口座 → iDeCo/NISA」の順で取り崩すと税効率が高い
  - 現金プール先行は「短期の下落から守る」狙い（バケット戦略）
- **4%ルール (Trinity Study)**: 退職初年度に資産の4%を取り崩し、以降はインフレ調整するルール（米国発、日本での妥当性は議論あり）
- **平均余命**: 厚労省「簡易生命表」

WebSearch で「4%ルール 日本」「退職後取り崩し 順序 FP」等。

- [ ] **Step 3: テンプレートからコピーして監査レポートを作成**

Create `docs/phase2-audits/08-retirement-withdrawal.md`。

観点：
- 4プールの取り崩し優先度が実装されているか、妥当か
- 退職金は一時金（退職所得）として課税計算されているか、それとも取り崩し前の初期値に単純加算か
- 年金受給開始年齢（`targetAge` 後）の年金収入反映
- 楽観・悲観の `returnMod/expenseMod/pensionMod` が乗算か加算か
- `returnMod: +0.01` が「年間利回り +1%pt」なのか「倍率 +1%」なのか意味の明確性
- 資産枯渇（`depleted: true`）の判定ロジック

§6 問題に ID `08-Xxx`。

- [ ] **Step 4: 自己レビュー**

- [ ] **Step 5: コミット**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add docs/phase2-audits/08-retirement-withdrawal.md && git commit -m "docs(phase2): audit retirement withdrawal 4-pool model"
```

---

## Task 10: 監査ⓐ 統合キャッシュフロー

**Files:**
- Create: `docs/phase2-audits/09-integrated-simulation.md`

**狙い:** 統合シミュレーション（`calcIntegratedSim`）が他の8領域を正しく組み合わせているか、年次キャッシュフロー合計が整合するかを監査する。

- [ ] **Step 1: 対象コードを読む**

- `calcIntegratedSim(years, opts)` (`index.html:14225` 付近)
- 以下の下位関数を呼ぶ流れ：
  - `calcAllAssetGrowth` （ⓖ）
  - `getIncomeForYearWithGrowth`, `getExpenseForYear`, `getOneTimeForYear`, `getRecurringExpenseForYear` （ⓗ）
  - `calcLECostByYear` （ⓘ）
  - 二プール分離・機会損失（ⓕ）
- 戻り値の各フィールド：
  - `year`, `annualIncome`, `annualExpense`, `leCost`, `oneTime`
  - `totalWealth`, `assetTotal`, `cashPool`, `investPool`, `cashAssetBase`, `investAssetBase`
  - `cashFlow`, `liquidation`, `mortgageDeduct`, `dividendCashout`

- [ ] **Step 2: 標準の参照収集**

- **キャッシュフロー恒等式**: 
  - 年次: 収入 − 支出 − ライフイベント費用 + 運用益 = 資産変化額
  - 累積: 初期資産 + Σ(収入 − 支出 − LE) + Σ運用益 = 最終資産
- **複利と現金フローの合算**: 年初残高 × (1+r) + 当年拠出 = 年末残高（標準ファイナンス）

- [ ] **Step 3: テンプレートからコピーして監査レポートを作成**

Create `docs/phase2-audits/09-integrated-simulation.md`。

観点：
- 統合のキャッシュフロー恒等式が成り立つか（収支差分と資産変化が一致するか）をスナップショットから検算
  - `test/__snapshots__/scenario-snapshot.test.js.snap` の シナリオA または シナリオB の `calcIntegratedSim` 出力で、
    任意の2年分を取り出して：
    - 2年目 totalWealth − 1年目 totalWealth ≈ 2年目 annualIncome − 2年目 annualExpense − 2年目 leCost − 2年目 oneTime + 運用益
    を検算
- 税引き（`mortgageDeduct`）の扱い方向（引き込みか、引き戻しか）
- 配当受取（`dividendCashout`）がキャッシュフローに加算される仕組み
- 複数年にまたがるイベント（奨学金返済・ローン返済）の年次反映

§6 問題に ID `09-Xxx`。

**重要**: このタスクの出力は他タスクの結果を参照するので、**可能ならタスク 2-9 の監査結果（特に検出された問題）を summary として引用**する。例：「基盤層の ⓖ で指摘された `01-I01` が、ここでも同じ症状として観察されるか」

- [ ] **Step 4: 自己レビュー**

- [ ] **Step 5: コミット**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add docs/phase2-audits/09-integrated-simulation.md && git commit -m "docs(phase2): audit integrated cashflow simulation"
```

---

## Task 11: サニティウォークスルー（シナリオB）

**Files:**
- Create: `docs/phase2-audits/sanity-walkthrough-シナリオB.md`

**狙い:** シナリオB（鈴木健太 35歳共働き夫婦・子1人・住宅ローン）の55年超の年次出力から10〜15の転換点を抜粋し、各転換点で何が起きているかを人間が読める日本語で解説する。計算結果が FP実務として「それっぽい」動きをしているかを判定。

- [ ] **Step 1: シナリオBのスナップショットと入力JSONを読む**

- 入力: `/Users/nagatohiroki/ライフプランアプリ/sample_data/シナリオB_35歳共働き夫婦子1人住宅ローン.json`
  - プロフィール・finance・assets・lifeEvents（子供・住宅ローン等）・cashFlowEvents・retirement パラメータを把握
- 出力: `/Users/nagatohiroki/ライフプランアプリ/test/__snapshots__/scenario-snapshot.test.js.snap` から以下のキーを抜き出す：
  - `scenario snapshots > シナリオB 鈴木健太 35歳共働き > calcIntegratedSim 1`
  - `scenario snapshots > シナリオB 鈴木健太 35歳共働き > calcRetirementSimWithOpts 標準 1`
  - `scenario snapshots > シナリオB 鈴木健太 35歳共働き > calcScenarioFullTimeline (getAdaptiveScenarios 各パターン) 1`

- [ ] **Step 2: 転換点を特定**

シナリオBの入力JSONと出力を照らし合わせて、以下の年を特定する：

- **初年度（2026年・35歳）**
- **子供の進学タイミング**：小学校・中学校・高校・大学入学年（入力JSONの `children[].birth` から計算）
- **住宅ローン完済年**（`mortgage.purchaseYear + loanYears`）
- **本人定年退職年**（60歳または65歳、入力による）
- **パートナー定年退職年**（入力の `partnerRetire*` から）
- **年金受給開始年**（本人・パートナー、通常は65歳）
- **資産ピーク年**（出力から `max(totalWealth)` の年）
- **資産枯渇年（あれば）**（出力から `depleted: true` または `totalWealth < 0` の年）
- **最終年（余命時・90歳相当）**

不明な場合はスナップショット出力の値を目視で探す（明らかな転換点は値の変化で見つかる）。

目安 **10〜15ポイント**。

- [ ] **Step 3: 各転換点の解説を書く**

Create `docs/phase2-audits/sanity-walkthrough-シナリオB.md`。

構造：

```markdown
# サニティウォークスルー：シナリオB 鈴木健太

- **対象シナリオ**: シナリオB 鈴木健太 35歳共働き夫婦子1人住宅ローン
- **入力データ**: `sample_data/シナリオB_35歳共働き夫婦子1人住宅ローン.json`
- **出力データ**: `test/__snapshots__/scenario-snapshot.test.js.snap` のシナリオB該当3キー

## サマリー前提
- 初期資産: 530万円
- 年齢: 35歳 → シミュレーション期間: 約56年（90歳まで）
- 主要イベント: 子の進学、住宅ローン、定年退職、年金

## 年次ハイライト

### 2026年（初年度・35歳）
- 総収入: XXX万円（本人XXX + パートナーXXX）
- 総支出: XXX万円（生活費XXX + ローンXXX + 教育費XXX）
- ライフイベント費用: XXX万円
- 運用益: XXX万円
- 資産残高: XXX万円（現金XXX + 投資XXX）
- **解説**: ...（1段落）
- **判定**: ✅ 妥当 / ⚠️ 違和感あり / ❌ 明確におかしい

### [子供の小学校入学年]
...

### [子供の中学校入学年]
...

### [子供の大学入学年（教育費ピーク想定）]
...

### [住宅ローン完済年]
...

### [本人定年退職年]
...

### [パートナー定年退職年]
...

### [年金受給開始年]
...

### [資産ピーク年]
...

### [最終年（90歳相当）]
...

## 区切り年間の年次サマリー（表形式）

| 年 | 年齢 | 総収入 | 総支出 | LE費用 | 資産残高 |
|----|------|--------|--------|--------|----------|
| 2026 | 35 | ... | ... | ... | ... |
| 2030 | 39 | ... | ... | ... | ... |
| ... |

（5-10年刻みで良い）

## 検出された違和感

（あれば列挙、無ければ「なし」）

- 2040年で資産が500万円ジャンプ → 理由不明（退職金の前倒し？）
- 教育費の累積が文科省相場より低い可能性
- ...

## 全体的な所感

| 項目 | 判定 | コメント |
|------|------|----------|
| 資産推移の形（山形・直線・急落等） | ✅/⚠️/❌ | ... |
| 年金水準（老齢年金と退職前収入の比率） | ✅/⚠️/❌ | ... |
| ローン完済タイミング | ✅/⚠️/❌ | ... |
| 退職後の取り崩しペース（何歳で枯渇か） | ✅/⚠️/❌ | ... |
| 教育費ピークの相場感 | ✅/⚠️/❌ | ... |
| 総合 | ✅/⚠️/❌ | ... |
```

- [ ] **Step 4: 自己レビュー**

- 転換点が10〜15個あるか
- 各転換点に「解説」と「判定」が入っているか
- 表の年次サマリーが連続性を確認できる範囲をカバーしているか

- [ ] **Step 5: コミット**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add "docs/phase2-audits/sanity-walkthrough-シナリオB.md" && git commit -m "docs(phase2): add sanity walkthrough for scenario B"
```

---

## Task 12: 問題集約と総評（summary-and-issues.md）

**Files:**
- Create: `docs/phase2-audits/summary-and-issues.md`

**狙い:** Task 2〜10 の9つの監査レポートと Task 11 のウォークスルーで記録された問題を一箇所に集約し、ユーザーが次アクション（修正フェーズへ進むか、Phase 3 へ進むか）を判断できるようにする。

- [ ] **Step 1: 全レポートから問題を抽出**

以下のファイルを順に読み、各レポートの §6「検出された問題」セクションから全 Issue を抜き出す：

```
docs/phase2-audits/01-asset-growth.md
docs/phase2-audits/02-income-expense.md
docs/phase2-audits/03-life-events.md
docs/phase2-audits/04-pension.md
docs/phase2-audits/05-mortgage.md
docs/phase2-audits/06-partner-retirement.md
docs/phase2-audits/07-two-pool-model.md
docs/phase2-audits/08-retirement-withdrawal.md
docs/phase2-audits/09-integrated-simulation.md
docs/phase2-audits/sanity-walkthrough-シナリオB.md
```

各 Issue の ID（例: `01-C01`, `08-I02`）とレベル（🔴/🟡/🟢）を控える。

- [ ] **Step 2: 集約ドキュメントを作成**

Create `docs/phase2-audits/summary-and-issues.md`:

```markdown
# Phase 2 監査サマリー

- **監査日**: 2026-04-24
- **監査範囲**: 9領域 + シナリオBウォークスルー
- **監査方式**: index.html のコード監査＋FP標準との突合

## 全体総評

- 監査領域数: 9
- 信頼度 ✅ 高: N 領域
- 信頼度 ⚠️ 中: N 領域
- 信頼度 ❌ 要対応: N 領域
- サニティウォークスルー結果: ✅ / ⚠️ / ❌

（1段落の総評）

## 🔴 Critical Issues（明確なバグまたは税法違反）

| ID | 領域 | 問題 | 影響 | 推奨対応 |
|----|------|------|------|----------|
| 01-C01 | ⓖ 資産成長 | ... | ... | ... |
| ... |

## 🟡 Important Issues（仮定の説明不足・UI誤解リスク・特殊ケース未対応）

| ID | 領域 | 問題 | 影響 | 推奨対応 |

## 🟢 Minor Issues（軽微な改善）

| ID | 領域 | 問題 | 推奨対応 |

## 領域別信頼度サマリー

| # | 領域 | ファイル | 信頼度 | 主な所見 |
|---|------|----------|--------|----------|
| ⓖ | 資産成長複利 | 01-asset-growth.md | ✅ 高 | FP標準と一致 |
| ⓗ | 収入・支出 | 02-income-expense.md | ⚠️ 中 | インフレ計算で ... |
| ... |

## 次のステップ候補

1. **🔴 Critical の修正を別フェーズで対応**（推奨）
   - 該当する IssueIDと修正方針の整理
2. **Phase 3（計算ロジック分離）への移行**
   - Critical が無い or 並行して対処可能な場合
3. **未監査領域の追加監査**（必要に応じて）
   - 相続・贈与・賃貸比較・支出管理アプリ連携 等

## 引用元の記録

各領域の §3「標準との突合」で使用した主要な外部参照を一覧化：

- 国税庁タックスアンサー
  - No.1211（住宅借入金等特別控除）...
  - No.1463（株式等の譲渡損益）...
- 厚生労働省
  - 公的年金制度 ...
- 金融庁
  - NISA制度 ...
- 文部科学省
  - 子供の学習費調査 ...
- 書籍・その他
  - （該当あれば）

## 監査の限界

本監査はコードレベルの突合であり、以下は対象外：

- Python/Excel による独立実装との数値比較（Phase 2 のスコープ外）
- UI挙動・操作性の検証
- 全シナリオでの網羅的検算
- 相続・贈与・賃貸比較・税計算全般（将来の監査候補）
```

- [ ] **Step 3: 自己レビュー**

- すべての監査レポートから問題が抜き出されているか（grep で `🔴` `🟡` `🟢` を数えて照合）
- 領域別信頼度サマリーの行数が9か
- 次のステップの候補が1-3 個具体的に書かれているか

- [ ] **Step 4: コミット**

```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add docs/phase2-audits/summary-and-issues.md && git commit -m "docs(phase2): add summary and issues list"
```

---

## 完了条件のまとめ

- [ ] すべての Task 1〜12 が完了
- [ ] `docs/phase2-audits/` 下に 12ファイル（テンプレート含む）が存在
- [ ] すべての監査レポートが固定フォーマット準拠（§対象範囲 〜 §7結論）
- [ ] すべての §3「標準との突合」に引用元 URL / 書籍名 / 条文が記載
- [ ] すべての §6「検出された問題」に ID（`NN-Xxx`）が付与
- [ ] `summary-and-issues.md` に全問題が集約されている
- [ ] `index.html`, `test/`, `package.json` に一切変更が入っていない（`git diff HEAD~12 HEAD -- index.html test/ package.json` が空）

## Phase 2 後のオプション

- Critical Issues が見つかれば → Phase 2.5 として修正フェーズ（別計画）
- 問題が軽微なら → Phase 3 計算ロジック分離へ直進
