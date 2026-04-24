# Phase 4b｜Important UI変更不要18件 修正フェーズ 設計書

- **作成日**: 2026-04-25
- **対象アプリ**: ライフプランアプリ（`calc/*.js`）
- **位置付け**: Phase 4 の第 2 期（P4b）。Phase 2 監査の Important 43 件のうち、Phase 4a で未対応かつ UI 変更不要の 18 件を解消する。
- **前提フェーズ**:
  - Phase 1〜3.5 + Phase 4a（`fecf6ac`）
- **後続**:
  - Phase 4c: 残り 7 件（UI 変更が必要な Important）+ iDeCo 受給方法 UI 化
  - Phase 5: Minor 63 件対応・年度更新

---

## 1. 背景と目的

Phase 4a で Important 14 件（高影響・構造関連）を解消した。残り 29 件のうち、UI 変更不要の 18 件を本フェーズで解消する。UI 変更が必要な 7 件は Phase 4c で UI 改修と合わせて対応する方針。

本フェーズは Phase 4a と同じワークフロー（事前期待方向宣言 → 修正 → diff 目視 → snapshot 承認）で進める。

---

## 2. スコープ

### 2.1 対象 18 件（6 グループ）

| グループ | Important ID | 件数 |
|---------|-------------|------|
| **G12 投資プール残タスク** | `07-I02`, `07-I03` | 2 |
| **G6 インフレ変数統一** | `02-I02` | 1 |
| **G8 旧 NISA/振替** | `01-I01`, `01-I02`, `01-I03` | 3 |
| **G9 パートナー関連** | `06-I01`, `06-I02`, `06-I03`, `06-I04` | 4 |
| **G5 ライフイベント費用** | `03-I01`, `03-I02`, `03-I03`, `03-I05`, `03-I06`, `03-I07`, `03-I09`, `03-I10` | 8 |

### 2.2 スコープ外

- **UI 変更が必要な Important（Phase 4c 候補）**:
  - G7 income_change モデル（02-I03）— 転職後昇給継続フラグ
  - G10 住宅ローン UI（05-I01/I02/I03）— 子育て特例トグル・頭金欄・シナリオ連動
  - G10 残タスク（05-I04/I05/I06）— 計算のみだが UI を絡める場合は Phase 4c
  - 06-I02 配偶者控除の本格実装（`calcTakeHome` 改修含む）
- Minor 63 件全般
- 相続・贈与・賃貸比較等の未監査領域
- iDeCo 受給方法 UI（Phase 4c 候補）

### 2.3 UI 変更

**なし**（計算ロジック修正のみ）。Phase 4a と同じ方針。

---

## 3. アーキテクチャ

Phase 4a と同じ。`calc/*.js` を領域別に修正し、Phase 1 snapshot を意図的に更新する。

### 実施順序（影響小→大）

```
G12 投資プール（2 件）   ← ウォーミングアップ
  ↓
G6 インフレ統一（1 件）
  ↓
G8 旧 NISA/振替（3 件）
  ↓
G9 パートナー（4 件）
  ↓
G5 ライフイベント（8 件）  ← 最終大詰め
  ↓
最終検証（Phase 2 注記追加）
```

---

## 4. 修正内容詳細

### 4.1 G12 投資プール残タスク（2 件・1 コミット）

| ID | 修正内容 | 触るファイル | 期待インパクト |
|----|---------|------------|--------------|
| **07-I02** `cash_reserved` 隔離不足 | `calc/integrated.js` の `_CASH_T` セットから `cash_reserved` を分離、生活赤字補填対象から除外する新サブプール化 | `calc/integrated.js` | 住宅頭金確保などの資金が生活費赤字補填に使われなくなり、将来の予定支出が保護される |
| **07-I03** `_wInvestReturn` 時点固定 | `calc/integrated.js` 年次ループ内で、投資プール構成が変わる度に `_wInvestReturn` を再計算 | `calc/integrated.js` | 長期で実質的な機会損失計算が精密化（NISA 積立増加で `_wInvestReturn` 微上昇） |

### 4.2 G6 インフレ変数統一（1 件・1 コミット）

| ID | 修正内容 | 触るファイル |
|----|---------|------------|
| **02-I02** `finance.inflationRate`（2%）と `retirement.inflationRate`（1.5%）の二重管理 | 両ファイルで同じ変数を参照するよう修正。`retirement.inflationRate` が設定されていればそちらを優先、未設定なら `finance.inflationRate` にフォールバック（後方互換） | `calc/integrated.js`, `calc/retirement.js` |

### 4.3 G8 旧 NISA/振替（3 件・1 コミット）

| ID | 修正内容 | 触るファイル |
|----|---------|------------|
| **01-I01** 課税口座の毎年課税近似 | `calc/asset-growth.js` の `effectiveReturn` / `calcAssetGrowth` で、課税口座は税引前複利運用とし、各年の含み益に対する実効課税を近似。完全な売却シミュは Phase 5 | `calc/asset-growth.js` |
| **01-I02** 旧 NISA noNewContrib の非 UI 経路ガード | `calcAssetGrowth` 内で `ASSET_TYPES[a.type].noNewContrib && yr > a.endYear` の場合に `annualContrib = 0` 強制 | `calc/asset-growth.js` |
| **01-I03** 振替サイクルのフォールバック取りこぼし | `calcAllAssetGrowth` 内、`_wastedContribsByYear` 補正の精密化 | `calc/asset-growth.js` |

### 4.4 G9 パートナー関連（4 件・1 コミット）

| ID | 修正内容 | 触るファイル |
|----|---------|------------|
| **06-I01** リタイア期パートナー就労収入凍結 | `calc/retirement.js` の `calcRetirementSimWithOpts` で、`partnerWorkIncome` 計算時に同年度までの `partnerGrowthRate` 累積を適用 | `calc/retirement.js` |
| **06-I02** 配偶者控除・配偶者特別控除未反映 | `calc/integrated.js` 内で本人課税所得から控除分を概算で差し引く近似（`calcTakeHome` の本格改修は Phase 4c） | `calc/integrated.js` |
| **06-I03** パートナー退職後の国民年金保険料未計上 | `calc/integrated.js` と `calc/retirement.js` のパートナー退職後判定に、パートナー 60 歳未満なら 17,510円×12 = 約 21 万円/年の支出を追加 | `calc/integrated.js`, `calc/retirement.js` |
| **06-I04** 加給年金・振替加算未対応 | 本人が厚生年金 20 年以上 + 配偶者 65 歳未満で約 40 万円/年加算。`calc/retirement.js` に簡易ロジック追加 | `calc/retirement.js` |

### 4.5 G5 ライフイベント費用（8 件・1 コミット）

| ID | 修正内容 | 触るファイル |
|----|---------|------------|
| **03-I01** 介護一時費用（平均 47.2 万円）未計上 | `calcLECostByYear` の介護計算に、介護開始年に一時費用 47.2 万円を加算。`state.lifeEvents.care.oneTimeFee` 明示設定あればそれを優先 | `calc/life-events.js` |
| **03-I02** `maternityMonths` 旧互換パスの賞与込み過大 | 旧パスで賞与を除外して計算 | `calc/life-events.js` |
| **03-I03** 奨学金利息無視（終了年過少） | JASSO 第二種（1.641%）の利率補正係数を適用 | `calc/life-events.js` |
| **03-I05** 公立幼稚園 6 万円 → 18.46 万円 | `EDU_COST.kindergarten.public` を `6` → `18.46`（文科省令和 5 年度） | `calc/life-events.js` |
| **03-I06** 保育料所得連動（最小実装） | `state.finance.income` から 3 段階（高所得 54、中所得 30、低所得 20 万円/年）で保育料を切替 | `calc/life-events.js` |
| **03-I07** 育休給付 181 日目以降 50% | `calcLeaveReduction` で、180 日で `1-0.67` → `1-0.50` に分岐 | `calc/life-events.js` |
| **03-I09** 出産年重複（育休+保育費） | 育休期間中の `nursery` 費用を 0 に（排他ロジック） | `calc/life-events.js` |
| **03-I10** 双子育休 2 倍計上 | `children` 処理を `birthYear` で reduce 集約 | `calc/life-events.js` |

---

## 5. ワークフロー

各グループで繰り返す：

```
1. expected-changes.md に Group X の「期待方向」を事前宣言
2. calc/*.js を修正
3. npm test → Phase 1 snapshot 赤化確認
4. git diff で方向確認・想定外変動なし
5. npm run test:update で snapshot 承認
6. npm test 再実行で 155/155 グリーン
7. expected-changes.md に実測サマリー追記
8. コミット（fix + 更新 snap + expected-changes.md）
9. 実コミット SHA を expected-changes.md に追記 + 追加コミット
```

---

## 6. 成功基準

1. ✅ 18 件の Important に Phase 4b コミット SHA が紐づく
2. ✅ 全 6 グループのコミットが main に反映済み（fix 6 + SHA record 6 + setup 1 + 最終 1 ≈ 14 コミット）
3. ✅ `npm test` で 155/155 グリーン
4. ✅ Phase 1 スナップショット（25 件）が意図通り更新され、`git diff` で方向確認済み
5. ✅ `docs/phase4b-fixes/expected-changes.md` に期待方向と実測サマリー
6. ✅ Phase 2 監査レポート該当 18 Important に `[Resolved in Phase 4b commit XXXX]` 注記
7. ✅ サニティウォークスルーに Phase 4b 完了後の評価追記

---

## 7. 既知のリスクと対処

| # | リスク | 対処 |
|---|--------|------|
| 1 | G5 の `EDU_COST` 更新で既存シナリオ教育費激変、シナリオ B の 30-40 歳資産伸びが鈍化 | 期待方向に「シナリオ B の 30-40 歳資産伸び鈍化」を事前宣言 |
| 2 | G6 統一で `retirement.inflationRate = 1.5%` を設定済みサンプル挙動変化 | サンプルの `retirement.inflationRate` を事前 grep で確認 |
| 3 | G9 06-I01 のパートナー昇給適用で FIRE シナリオ C 最終資産増方向 | 期待方向に明記、実測差分確認 |
| 4 | G8 01-I01（売却時一括課税近似）の実装精度で既存 snapshot が大きく動く | 近似精度を控えめに（Phase 5 で完全実装） |
| 5 | G9 06-I02 の配偶者控除は `calcTakeHome` 本格改修せず近似適用 | 近似であることを expected-changes.md に明記、Phase 4c での本格実装を予告 |
| 6 | G9 06-I04 加給年金の適用条件が複雑（厚生年金 20 年以上かつ配偶者 65 歳未満） | 既存サンプルで該当ケースがあれば snapshot 変化、なければ差分ゼロ |
| 7 | 各グループ相互作用で予測困難な動き | 順序固定（影響小→大）、各グループ単独 diff で検算 |
| 8 | Phase 4a G3 で導入した iDeCo 一時金化と G5 の教育費キャリブレーションが干渉 | G5 実装後に iDeCo 一時金化との整合性確認（snapshot の退職年周辺） |

---

## 8. 成果物一覧

```
ライフプランアプリ/
├── calc/
│   ├── asset-growth.js       ← G8（旧 NISA/振替）
│   ├── integrated.js         ← G12, G6, G9（パートナー国民年金・退職後）
│   ├── retirement.js         ← G9, G6（インフレ統一）
│   └── life-events.js        ← G5（ライフイベント 8 件）
├── docs/
│   └── phase4b-fixes/                    ← 新規
│       └── expected-changes.md           ← 6 グループの期待方向と実測
├── docs/phase2-audits/*.md               ← 該当 18 Important に Resolved 注記
└── test/__snapshots__/scenario-snapshot.test.js.snap  ← 意図的に更新
```

---

## 9. Phase 4c への橋渡し

Phase 4b 完了後、残り Important 7 件（UI 変更が必要）:

- **G7 income_change モデル**（1 件）: `02-I03` → UI フラグ追加
- **G10 住宅ローン UI**（3 件）: `05-I01`（子育て特例トグル）、`05-I02`（頭金欄）、`05-I03`（シナリオ連動）
- **G10 住宅ローン計算**（3 件）: `05-I04`（借換諸費用）、`05-I05`（NaN 伝播）、`05-I06`（同年複数イベント順序）— 計算のみだが UI と合わせて改修推奨
- **配偶者控除の本格実装**: 06-I02 を `calcTakeHome` で実装（本フェーズの近似を置き換え）

加えて Phase 4c では iDeCo 受給方法 UI 化（一時金/年金/併用・受給年齢 60-75）も可能。
