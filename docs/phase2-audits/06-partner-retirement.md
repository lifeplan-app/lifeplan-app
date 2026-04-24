# 監査レポート：ⓔ パートナーリタイア（Phase 2）

- **対象領域**: ⓔ パートナーの就労収入終了（退職）・再就労・年金発生・世帯合算
- **監査日**: 2026-04-24
- **信頼度判定**: ❌ 要対応

## 対象範囲

- 専用関数は存在せず、現役期は `getIncomeForYearWithGrowth(yr)` 内 (`index.html:17142-17171`) に inline、リタイア期は `calcRetirementSimWithOpts` (`index.html:17579-17609`) / `calcMultiScenario` 系 (`index.html:18339-18400`) / `calcMonteCarlo` 系 (`index.html:18580-18639`) にそれぞれ同じロジックが **3 回コピー**されて埋め込まれている。
- 入力フィールド:
  - `state.finance.partnerIncome` / `partnerBonus` / `partnerGrowthRate` / `partnerGrowthUntilAge` (`index.html:8603-8606`, `9718-9721`)
  - `state.retirement.partnerType` / `partnerTargetAge` / `partnerSemiEndAge` / `partnerSemiMonthlyIncome` / `partnerExpenseChange` / `pensionAge_p` / `pensionMonthly_p` (`index.html:14783,14820-14824,14599,3458-3462`)
- 年金発生: `calcRetirementSimWithOpts` の `pension_p = age >= pensionAge_p ? basePensionAnnual_p : 0` (`index.html:17577`)
- 税制: `calcTakeHome()` (`index.html:17027-17078`) は**本人のみ**の額面→手取り変換で、`partnerIncome`・配偶者控除・配偶者特別控除を一切扱わない。

> **Important: 専用関数が存在せず統合内で埋没しているため監査困難**。パートナー退職ロジックは 4 か所（`getIncomeForYearWithGrowth` / `calcRetirementSimWithOpts` / `calcMultiScenario` / `calcMonteCarlo`）に分散し、かつ `partnerType === 'semi'` の判定ロジックと「退職年同年の切り替わり」の処理規則が微妙に異なる箇所がある（§5 参照）。

## 1. 関数の目的と入出力

**目的**: パートナー（配偶者）の労働収入を、退職年齢・セミリタイア期間・年金開始年齢に応じて切り替え、世帯年間収入に合算する。

**入出力（現役期, `getIncomeForYearWithGrowth`）**:

| 項目 | 型 | 備考 |
| --- | --- | --- |
| 入力 `yr` | `number` | 対象年（西暦） |
| 依存 `state.finance.partnerIncome/Bonus/GrowthRate/GrowthUntilAge` | `number` | パートナー基準年収・昇給率・昇給停止年齢 |
| 依存 `state.retirement.partnerTargetAge/partnerType/partnerSemiEndAge/partnerSemiMonthlyIncome` | `number/string` | リタイア年齢・種類（`full`/`semi`）・セミリタイア終了・セミ月収 |
| 依存 `state.profile.partnerBirth` | `'YYYY-MM-DD'` | パートナー生年（退職年の判定に使用） |
| 戻り値 | `number` | `selfIncome + partnerIncomeThisYear`（年額・万円） |

**入出力（リタイア期, `calcRetirementSimWithOpts` 内）**:

| 項目 | 型 | 備考 |
| --- | --- | --- |
| `partnerWorkIncome` | `number` | パートナーが退職前なら `_partnerBaseAnnual`（= `(partnerIncome*12 + partnerBonus)`）、退職後かつ `partnerType==='semi'` なら `(partnerSemiMonthlyIncome * 12)`、それ以外は 0 |
| `pension_p` | `number` | `age >= pensionAge_p` なら `basePensionAnnual_p` |
| `_partnerExpChange` | `number` | 退職後の月額支出変化（通勤費減 or 余暇増）×12。**現役期（`calcMainSim`）では未反映**（§5 参照） |

## 2. 使用している計算式

### 2.1 現役期のパートナー年収

```javascript
// index.html:17142-17171
const partnerBase      = (parseFloat(state.finance.partnerIncome) || 0) * 12
                        + (parseFloat(state.finance.partnerBonus) || 0);
const partnerGrowthRate = (parseFloat(state.finance.partnerGrowthRate) || 0) / 100;
const partnerUntilAge   = parseInt(state.finance.partnerGrowthUntilAge) || untilAge; // 本人 untilAge にフォールバック

let partnerIncomeThisYear = 0;
if (partnerBase > 0) {
  const partnerGrowthYears = Math.max(0, Math.min(yearsElapsed, partnerUntilAge - currentAge));
  //                                                                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  //                                                                    本人 currentAge を使用（バグ：§6 06-C01）
  partnerIncomeThisYear = partnerBase * Math.pow(1 + partnerGrowthRate, partnerGrowthYears);

  const pRetireAge  = parseInt(r.partnerTargetAge) || null;
  const pRetireYear = (partnerBirthYear && pRetireAge) ? partnerBirthYear + pRetireAge : null;
  if (pRetireYear && yr >= pRetireYear) {
    if (r.partnerType === 'semi') {
      const pSemiEndYear = (partnerBirthYear && pSemiEndAge) ? partnerBirthYear + pSemiEndAge : null;
      partnerIncomeThisYear = (!pSemiEndYear || yr < pSemiEndYear)
        ? (parseFloat(r.partnerSemiMonthlyIncome) || 0) * 12
        : 0;
    } else {
      partnerIncomeThisYear = 0; // フルリタイア
    }
  }
}
```

### 2.2 リタイア期（本人リタイア後）のパートナー就労収入

```javascript
// index.html:17586-17594（calcRetirementSimWithOpts 内）
const _partnerBaseAnnual = ((parseFloat(state.finance?.partnerIncome) || 0) * 12)
                        + (parseFloat(state.finance?.partnerBonus) || 0);
let partnerWorkIncome = 0;
if (_partnerBaseAnnual > 0) {
  if (_partnerRetireYear === null || yr < _partnerRetireYear) {
    partnerWorkIncome = _partnerBaseAnnual; // まだ現役（＝昇給ゼロで凍結）
  } else if (r.partnerType === 'semi' && (_partnerSemiEndYear === null || yr < _partnerSemiEndYear)) {
    partnerWorkIncome = (parseFloat(r.partnerSemiMonthlyIncome) || 0) * 12;
  }
}
```

### 2.3 パートナーの年金

```javascript
// index.html:17577, 18316-18317
const pensionAge_p = parseInt(r.pensionAge_p) || 65;
const basePensionAnnual_p = (parseFloat(r.pensionMonthly_p) || 0) * 12
                          * (1 + pensionMod) * (1 - params.pensionSlide);
// ...
const pension_p = age >= pensionAge_p ? basePensionAnnual_p : 0;
```

### 2.4 パートナー退職による月額支出変化

```javascript
// index.html:17604-17605
const _partnerExpChange = (_partnerRetireYear !== null && yr >= _partnerRetireYear)
  ? (parseFloat(r.partnerExpenseChange) || 0) * 12 : 0;
```

## 3. 標準との突合

### 3.1 配偶者控除・配偶者特別控除

- **標準**: 納税者本人の合計所得金額が 1,000 万円以下で、配偶者の合計所得金額が 48 万円以下なら **配偶者控除 38 万円**（老人配偶者は 48 万円）、配偶者の合計所得金額が 48 万円超 133 万円以下なら **配偶者特別控除 1 〜 38 万円**（段階的逓減）。
  - 出典: 国税庁 タックスアンサー No.1191「配偶者控除」 https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1191.htm
  - 出典: 国税庁 タックスアンサー No.1195「配偶者特別控除」 https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1195.htm
- **本コード**: `calcTakeHome()` (`index.html:17027-17078`) は**本人の額面→手取り**しか計算せず、課税所得式は `taxableIncome = grossAnnual - salaryDeduction - socialIns - 48`（48 は本人の基礎控除）に固定。配偶者控除 / 配偶者特別控除の枠組みは**存在しない**。
  - `state.finance.partnerIncome` を入れても本人の手取り（＝税額）は 1 円も変わらない。
- **判定**: ❌ 差異。**パートナー退職後に配偶者控除が適用される／復活するという税効果の反映がゼロ**（§6 `06-I02`）。

### 3.2 第 3 号被保険者（配偶者退職後の年金制度）

- **標準**: 第 2 号被保険者（厚生年金加入者＝会社員・公務員）に扶養される 20 歳以上 60 歳未満の配偶者で、**年収 130 万円未満**の者は第 3 号被保険者となり**自身で国民年金保険料を支払わない**（厚生年金被保険者の保険料で負担される）。
  - 出典: 日本年金機構「第3号被保険者の届出」 https://www.nenkin.go.jp/service/kokunen/hihokensha/20140710.html
  - 出典: 厚生労働省「国民年金」 https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/nenkin/nenkin/kokunen.html
- **本コード**: パートナー退職後に国民年金保険料・健康保険料をどう負担するかの会計処理は**なし**。世帯支出に国民年金保険料の発生計上はなく、かつ本人の社会保険料（`SOCIAL_INS_RATE_EMPLOYEE`）は本人の額面のみから率計算されるため、パートナー退職で第 3 号に切り替わっても本人側の社会保険料が変わる余地もない（モデルなし）。
- **判定**: ⚠️ 差異（軽微〜中）。大多数のユーザーは net 入力モードで使うと思われるので即時影響は限定的だが、**パートナーが 60 歳未満でリタイアする場合（セミリタイア・FIRE シナリオ）に国民年金保険料 ≒ 17,510 円/月 × 12 = 約 21 万円/年**の支出が抜ける（§6 `06-I03`）。
  - 出典: 日本年金機構「国民年金保険料」令和 6 年度 https://www.nenkin.go.jp/service/kokunen/hokenryo/20150313-02.html

### 3.3 退職年の切り替わり

- **標準**: 退職年は普通「1 年間のうち一部のみ就労」となるため、**退職年の収入は年収の数分の 1**になる（月按分）。
- **本コード**: `yr < pRetireYear` なら 100% フル収入、`yr >= pRetireYear` なら 0%（or セミ月収 × 12）の**1 年単位の離散ジャンプ**。例：`partnerTargetAge = 60` で 1 月生まれと 12 月生まれが同じ扱い。
- **判定**: ⚠️ 差異（中）。FP 教科書的には「退職月を入力 → 12 で月按分」が望ましいが、単年長期シミュレーションでは許容される近似。ただし本人リタイアと**同じ年**にパートナーも退職すると両方同時にゼロへ落ちるため、ドラスティックな資産曲線が描かれる（§6 `06-M01`）。

### 3.4 配偶者年金（遺族年金・加給年金）

- **標準**: 厚生年金被保険者が死亡した場合の遺族厚生年金、年上の配偶者が先に 65 歳になった場合の**加給年金**（約 40 万円/年）と**振替加算**などが存在。
  - 出典: 日本年金機構「加給年金額と振替加算」 https://www.nenkin.go.jp/service/jukyu/roureinenkin/jukyu-yoken/20150401-02.html
- **本コード**: `pensionMonthly_p` はユーザーが手入力した固定額のみ。加給年金・振替加算・遺族年金等の発生・切替なし。
- **判定**: ❌ 未実装（§6 `06-I04`）。ただし公的年金推定（`calcPensionEstimate`）自体が加給年金を扱っていないのは Task 5 の `04-I0x` として既報のため、本報告では再掲のみ。

## 4. 仮定・制約

- **暗黙の仮定 1**: パートナーの年齢は入力時点で「本人の年齢 ± N 年差」で一定。パートナーの昇給停止年齢（`partnerGrowthUntilAge`）は**本人の年齢基準**で発動する（§3.2 と §6 `06-C01`）。
- **暗黙の仮定 2**: パートナーが退職した瞬間から年金受給開始まで（例: 60 歳退職 → 65 歳受給）の無収入期間は、**セミリタイア月収 0** or **`partnerExpenseChange` で支出側のみ調整**でしか表せない。
- **暗黙の仮定 3**: パートナーが自営業・フリーランスで死ぬまで働き続けるケースはサポートされない（`partnerType` は `full` か `semi` の二者択一で、`semi` も `semiEndAge` で打ち切られる）。
- **暗黙の仮定 4**: パートナーの退職時に**退職金が発生しない**（`severance` は本人のみ。`r.partnerSeverance` 等のフィールドが存在しない）。
- **運用で仮定が崩れる条件**:
  - 夫婦年齢差が 5 歳以上（§6 `06-C01` の誤差が拡大）
  - パートナーが先に退職し本人はフル就労継続（`calcRetirementSimWithOpts` は本人リタイア後のみ走るため、本人がまだ現役の時期にパートナーが退職するケースは `getIncomeForYearWithGrowth` で処理 → こちらは OK だが支出変化 `partnerExpenseChange` が**未反映**。§6 `06-C02`）

## 5. エッジケース

| ケース | コードの挙動 | コード内防御 |
| --- | --- | --- |
| `partnerIncome = 0, partnerBonus = 0` | `partnerBase = 0` → `partnerIncomeThisYear = 0`（`if (partnerBase > 0)` で skip） | ✅ 明示的 guard (`index.html:17151`) |
| `partnerBirth` 未入力 | `partnerBirthYear = null` → `pRetireYear = null` → リタイア判定は通らず**永遠にフル就労**扱い | ⚠️ パートナー収入入力時に `partnerBirth` 未入力を警告する `generateSimDiagnostics` は存在（`index.html:19449-19451`）だが、警告のみで計算は続行 |
| `partnerTargetAge` 未入力 | 同上（`pRetireYear = null`）→ **永遠にフル就労** | なし |
| `partnerType === 'semi'` かつ `partnerSemiEndAge` 未入力 | `pSemiEndYear = null` → セミリタイア期間が**無期限**に延長 | なし |
| 夫婦年齢差 10 歳（パートナーが 10 歳年下） | `partnerUntilAge - currentAge` は本人基準なので、パートナーが若くても早期に昇給停止（§6 `06-C01`） | なし |
| 本人リタイア前にパートナーが退職 | `getIncomeForYearWithGrowth` で正しく 0 になるが、`partnerExpenseChange`（通勤費削減など）は反映されない（現役期は支出に加算なし） | なし（§6 `06-C02`） |
| `calcMainSim` と `calcRetirementSim` の境界年 | 本人リタイア年に両方が走るが、パートナー退職判定が両方で独立して評価 → 同年に同じ結果なら OK だが、`partnerType === 'semi'` のセミ収入値が `calcMainSim` 側では `partnerSemiMonthlyIncome * 12` と同じ式なので整合 | ⚠️ 整合はしているが、コードがコピペ（§6 `06-I01`） |

## 6. 検出された問題（深刻度付き）

### 🔴 Critical

- **`06-C01` パートナー昇給年数計算に本人 `currentAge` を使用（Task 3 `02-C01` を再確認・再検証）**
  - 場所: `index.html:17152`
  - 現行コード:
    ```javascript
    const partnerGrowthYears = Math.max(0, Math.min(yearsElapsed, partnerUntilAge - currentAge));
    ```
  - `currentAge` は `calcAge()`（本人の年齢, `index.html:17100`）である。`partnerBirthYear` は `17144` で取得されているのに昇給年数計算に反映されていない。
  - **再検証 (Task 3 との整合)**: 本タスクでも同じバグを独立に再確認した。影響範囲は `calcMainSim` 経路のみで、`calcRetirementSimWithOpts` のパートナー就労収入はこの成長計算を**使っていない**（`_partnerBaseAnnual` として昇給ゼロで凍結されている。§6 `06-I01` 参照）。したがって本バグの直接的な数値影響は **現役期のみ**。ただし現役期の合計 `selfIncome + partnerIncomeThisYear` は `calcMainSim` を通じて**資産積立額**・**FIRE 達成年の推計**に入るため、全体 IO への影響は Task 3 が指摘したとおり大きい。
  - **定量評価（再計算）**: 本人 30 歳・パートナー 40 歳・`partnerGrowthRate = 3%` / `partnerGrowthUntilAge = 50`・`partnerBase = 400 万円`。
    - **正しい挙動**: パートナー 50 歳（= 現在から 10 年後）で昇給停止 → 最終年収 = `400 × 1.03^10 ≒ 537.6 万円`。
    - **現行コード**: `min(yearsElapsed, 50 − 30) = min(yearsElapsed, 20)` → 20 年後（パートナー 60 歳時点）まで昇給継続 → `400 × 1.03^20 ≒ 722.4 万円`。
    - **20 年後時点の過大見積もり**: `(722.4 − 537.6) / 537.6 ≒ 34.4%`。
    - 逆ケース（パートナーが若い、本人 40・パートナー 30・`partnerUntilAge = 50`）: 正しくはパートナー 50 歳まで = 20 年、現行は `min(yearsElapsed, 50 − 40) = min(yearsElapsed, 10)` → 10 年で停止 → **過小見積もり 約 25.6%**（20 年目時点）。
  - **Task 3 `02-C01` との整合**: Task 3 は現役期の数値影響を指摘した。本タスクは同じ問題がパートナーリタイア文脈から見ても成立することを確認し、**修正箇所は `index.html:17152` の 1 行のみ**（`calcPartnerAgeAtYear` は既存、`index.html:6691` で定義済み）で両タスクの影響を一括解消できることを追認する。
  - 修正方針: `partnerCurrentAge` を `calcPartnerAgeAtYear(new Date().getFullYear())` 等で算出し、`partnerGrowthYears = Math.max(0, Math.min(yearsElapsed, partnerUntilAge - partnerCurrentAge))` に差し替える。

- **`06-C02` `partnerExpenseChange`（退職後の月額支出変化）が現役期シミュレーション（`calcMainSim`）で反映されない**
  - 場所: `index.html:17604-17605`（`calcRetirementSimWithOpts` のみ反映）、`calcMainSim` 側（`index.html:14275` 付近）には該当処理なし
  - 影響: 本人がまだ現役で、パートナーのみが先に退職した場合、`partnerExpenseChange`（通勤費削減 -2 万円/月など）が月額支出に加算・減算されず、**退職後 5〜10 年分の支出シフトが全て消失**する。
  - 定量評価: 月 2 万円 × 12 × 5 年 = **120 万円の支出差分が抜ける**。これは取り崩し額の誤差として直接資産残高に反映。
  - **Important との違い**: 単なる未実装機能ではなく、`calcRetirementSimWithOpts` では反映、`calcMainSim` では反映されないという**経路間の不整合**のため Critical 相当。UI 側ではユーザーに「反映される」と誤解される可能性が高い。

### 🟡 Important

- **`06-I01` リタイア期のパートナー就労収入は「基準額で凍結」されており昇給が全く効かない**
  - 場所: `index.html:17586-17594, 18370-18376, 18627-18634`
  - `_partnerBaseAnnual = partnerIncome * 12 + partnerBonus` をそのまま使用。`partnerGrowthRate` を適用していない。
  - 意図?: 本人リタイア後しかこのコード経路は走らないので「本人リタイア時点のパートナー収入」がすでに昇給反映済みの想定で渡されていれば妥当 … だが実際は `partnerIncome`（UI 入力値）を**現時点の数字のまま**使っているため、本人リタイアがまだ 20 年先ならパートナーは 20 年分の昇給を失う。
  - 定量評価: `partnerGrowthRate = 2%` で 20 年 → `1.02^20 ≒ 1.486` → **約 48% の過小見積もり**。
  - 修正方針: `calcRetirementSimWithOpts` でも `partnerWorkIncome` を算出する際に同年の `getIncomeForYearWithGrowth` を参照 or 昇給を同じように適用する。

- **`06-I02` 配偶者控除・配偶者特別控除が税計算に反映されていない**
  - 場所: `calcTakeHome()` (`index.html:17027-17078`)
  - §3.1 参照。gross 入力モードでパートナーが無収入ならば本来は本人の手取りが **38 万円（所得税）＋ 33 万円（住民税）分**の節税効果を受ける。国税庁 No.1191 / No.1195 参照。
  - 定量評価: 本人課税所得 500 万円（税率 20%）の場合、配偶者控除により所得税 約 7.6 万円・住民税 約 3.3 万円 = **約 10.9 万円/年の税軽減が反映されない**（ネット入力モードを使うユーザーは自己算出で回避可能だが、gross モードの手取り試算ボタン「この手取り額を収入欄に反映する」に直結する誤差）。
  - 修正方針: `partnerIncome` が 48 万円以下（合計所得）の場合に 38 / 33 万円控除、48 〜 133 万円で段階逓減（配偶者特別控除表）を加える。`partnerTargetAge` 到達後は 控除が「復活」するケースも扱う。

- **`06-I03` パートナー退職後の国民年金保険料・国民健康保険料が世帯支出に計上されない**
  - 場所: `calcRetirementSimWithOpts` 他 ― 対応コードなし
  - §3.2 参照。パートナーが 60 歳未満で退職した場合、第 3 号被保険者に該当しないケース（本人が自営業・フリーランス = 第 1 号、またはパートナー自身が第 1 号になる）で**国民年金保険料約 21 万円/年**（令和 6 年度 月額 16,980 円 × 12）＋ 国民健康保険料（地域差大、年額 10〜40 万円）が発生する。
  - 定量評価: 60 歳で退職、65 歳まで 5 年間 = `21 × 5 = 105 万円`（国民年金保険料のみ）の支出過少。国保含めれば 150〜300 万円規模。
  - 修正方針: `partnerTargetAge` 以降、`pensionAge_p` 未満の期間に国民年金保険料定額を世帯支出へ加算するトグル。または注記で「税社保は概算」と明示。

- **`06-I04` パートナー年金はユーザー手入力値の固定額で、受給開始年（`pensionAge_p`）も本人と独立**
  - 場所: `index.html:17577`
  - 加給年金・振替加算・遺族年金の自動発生なし。年金の繰上・繰下減額/増額（Task 5 `04-C02` で既報）はパートナー側にも同じく未適用。
  - **Task 5 との整合**: 年金式自体の問題は Task 5 で扱われ、本レポートはパートナー側にも同じ問題が波及することを確認するのみ。

### 🟢 Minor

- **`06-M01` 退職年の切り替わりが 1 年単位の離散ジャンプ**
  - §3.3 参照。3 月退職・12 月退職が区別できない。単年ズレで資産曲線が折れるだけなので長期シミュレーションの実害は小さい。
  - 推奨: `partnerRetireMonth` を追加 or 注記に「退職年は満年齢基準で 1 年単位」と明示。

- **`06-M02` パートナー退職金の入力フィールドがない**
  - `state.retirement.severance` / `severanceAge` は本人のみ。`partnerSeverance` 相当のフィールドなし。
  - 本人が専業主婦（夫）家庭でもパートナー退職金は世帯資産に入るため、家計全体の見通しに影響。

- **`06-M03` パートナー退職ロジックが 4 か所にコピーされている（DRY 原則違反）**
  - `getIncomeForYearWithGrowth` / `calcRetirementSimWithOpts` / `calcMultiScenario` / `calcMonteCarlo` にほぼ同一の 10 行が重複。どれかだけを修正すると他が取り残される（実際、現行コードでも `partnerExpenseChange` の取扱いが `calcMainSim` にだけ欠けている＝`06-C02` はこの重複の弊害の一例）。
  - 推奨: `computePartnerWorkIncome(yr, state)` / `computePartnerRetireDelta(yr, state)` の単一関数化。

- **`06-M04` `partnerGrowthUntilAge` が 0 の場合に本人 `untilAge` へフォールバック**
  - `index.html:17148`: `const partnerUntilAge = parseInt(state.finance.partnerGrowthUntilAge) || untilAge;`
  - 意図はフォールバックかもしれないが、パートナーが昇給ゼロ（`partnerGrowthRate = 0` だが `partnerGrowthUntilAge` は未入力 = 0）の場合に**本人の `untilAge` まで架空に伸ばされる**。現行は `partnerGrowthRate = 0` で実害ゼロだが、一貫性なし。

- **`06-M05` `partnerSemiEndAge` 未入力時にセミリタイアが無期限**
  - §5 エッジケース参照。UI 入力チェックを推奨。

## 7. 結論

- **この領域の信頼度**: ❌ 要対応
  - 根拠: Critical 問題が 2 件存在する。`06-C01` は Task 3 と重複する既知バグで、夫婦年齢差に応じて 20 年後時点のパートナー年収を **±25〜34%** 誤推計する。`06-C02` は `calcRetirementSimWithOpts` と `calcMainSim` のパートナー支出変化取扱いに**経路間不整合**があり、本人が現役でパートナーだけが先にリタイアする FIRE シナリオで **数百万円規模**の誤差を生む。§6 の ❌ 判定基準（Critical ≥ 1 → ❌）と整合。
  - Important 4 件は、税制（配偶者控除）・年金（保険料・加給）・リタイア期の昇給凍結、いずれも**世帯収入・世帯手取り**の計算精度を大きく揺るがす。
  - Minor 5 件。
- **Task 3 `02-C01` との関係**: 本レポートは `02-C01` を **`06-C01` として再検証**し、定量評価を独立に行った結果、同じ結論（`partnerGrowthYears` の実装バグ）に収束した。修正は 1 行（`index.html:17152`）で双方のレポートの懸念を同時解消できる。修正時は `calcPartnerAgeAtYear(new Date().getFullYear())` を使用可（既存関数、`index.html:6691` 定義）。
- **一言サマリー**: パートナーリタイア処理は**専用関数が存在せず統合シミュレーション内 4 か所に埋没**している上、(1) 昇給年数で本人年齢を誤用（`06-C01`）、(2) 現役期シミュで退職後支出変化が反映されない（`06-C02`）、(3) リタイア期シミュではパートナー昇給がそもそも凍結（`06-I01`）、(4) 配偶者控除なし（`06-I02`）、(5) 退職後の国民年金・国保計上なし（`06-I03`）と、**世帯のキャッシュフローに直接効く誤差が積み重なっている**。長期 FIRE シミュレーションの信頼性を大きく損なうため要対応。
