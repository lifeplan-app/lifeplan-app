# 監査レポート：資産成長複利 + 税引き（ⓖ）

- **対象領域**: ⓖ 資産成長複利（`calcAssetGrowth` / `calcAllAssetGrowth`）および税引後利回り（`effectiveReturn`）
- **監査日**: 2026-04-24
- **信頼度判定**: ⚠️ 中

## 対象範囲

- `ASSET_TYPES` 定義 (`index.html:5333-5352`)
  - 各資産種別の `defaultReturn`, `annualLimit`, `monthlyLimit`, `lifetimeLimit`, `noNewContrib`, `endYearDefault`, `dividendYield` を保持。
- `TAX_TYPE_DEFAULT` 定義 (`index.html:7869-7875`)
- `TAX_RATE = 0.20315` 定数 (`index.html:7876`)
- `effectiveReturn(annualReturn, taxType)` 関数 (`index.html:7878-7882`)
- `calcAssetGrowth(a, years, extraContribs=[])` 関数 (`index.html:8690-8805`)
- `calcAllAssetGrowth(assets, years)` 関数 (`index.html:8810-9001`)
- 同関数の抽出版: `test/helpers/core.js`（スナップショット用）

**呼び出し元（抜粋）**:
- `renderPortfolio()` (`index.html:9026`) — ポートフォリオ画面の資産推移グラフ
- `calcIntegratedSim()` — 統合シミュレーション（未投資積立の補正値 `_wastedContribsByYear` を利用）
- シナリオ比較・出口戦略・スナップショットテスト等、資産残高を扱うほぼ全ての上位関数

## 1. 関数の目的と入出力

### effectiveReturn(annualReturn, taxType)
- **目的**: 名目年利 r と口座種別から「税引後の複利適用年利」を返す。
- **入力**:
  - `annualReturn`: 小数（例 0.05 = 5%）
  - `taxType`: `'nisa' | 'ideco' | 'cash' | 'tokutei' | 'general'` など
- **戻り値**: 税引後の年利（小数）。NISA/iDeCo/現金扱いはそのまま、それ以外は `r × (1 − 0.20315)`。

### calcAssetGrowth(a, years, extraContribs=[])
- **目的**: 単一アセット `a` の `years` 年分（0〜years, 計 years+1 点）の残高推移を計算。
- **入力**:
  - `a`: アセット定義（`type`, `currentVal`, `monthly`, `annualBonus`, `annualReturn`, `taxType`, `startYear`, `endYear`, `dividendMode`, `dividendYield`, `targetVal`, `targetVal2`, `nisaBasis`, `overflowTargetId(2)`, `nisaOverflowTargetId`, `owner` 他）
  - `years`: シミュレーション年数
  - `extraContribs[y]`: 他アセットからの振替流入（万円/年）
- **戻り値**: `{ values: number[], overflows: number[], overflows2: number[] }`
  - `values[y]`: 現在年 + y年後の期末残高（万円、小数1桁丸め）
  - `overflows[y]`: 第1振替先 (`overflowTargetId`) へ流す余剰（万円）
  - `overflows2[y]`: 第2振替先 (`overflowTargetId2`) へ流す余剰（万円）

### calcAllAssetGrowth(assets, years)
- **目的**: 全アセットを「新NISA合算プール→非NISAトポロジカル順」の2パスで計算して統合。
- **戻り値**: `[{ asset, data: number[], overflows: number[], overflows2? }]` の配列（元の登録順）。`_wastedContribsByYear` プロパティに「計画済みだが NISA 上限到達・目標達成等で投資されなかった積立」を年次で付与。

## 2. 使用している計算式

### 2.1 税引後利回り（`index.html:7878-7882`）

```js
function effectiveReturn(annualReturn, taxType) {
  if (taxType === 'nisa' || taxType === 'ideco' || taxType === 'cash') return annualReturn;
  return annualReturn * (1 - TAX_RATE);  // TAX_RATE = 0.20315
}
```

数式：
- 非課税口座: `r_eff = r`
- 課税口座（特定・一般）: `r_eff = r × (1 − 0.20315)`

### 2.2 単年の複利更新（`index.html:8767-8769`）

```js
const grown = rate === 0
  ? prev + annualContrib
  : prev * (1 + rate) + annualContrib;
```

数式：
- `B_{y} = B_{y-1} × (1 + r_eff) + C_y`
  - `B_y`: y 年末残高（万円）
  - `C_y`: その年の積立額（月額×12 + ボーナス + 振替流入）
- 閉じた形式では `B_n = B_0 (1+r)^n + C × ((1+r)^n − 1) / r`（積立一定の場合）と等価。

### 2.3 配当受取モード（`index.html:8696-8698`）

```js
const dividendMode = a.dividendMode || 'reinvest';
const dividendRate = (dividendMode === 'cashout' && a.dividendYield) ? (a.dividendYield/100) : 0;
const growthRate   = Math.max(0, nominalRate - dividendRate);
```

- `cashout` モード：値上がり益（キャピタル）分 `r − d` のみを資産成長に回し、配当 `d` は外部に流す。
- `reinvest` モード（既定）：`r` 全体を複利に含める。

### 2.4 NISA 上限キャップ（`index.html:8749-8761`）

```js
if (annualContrib > 0 && annualLimit)   annualContrib = Math.min(annualContrib, annualLimit);
if (annualContrib > 0 && lifetimeLimit) {
  const remaining = Math.max(0, lifetimeLimit - cumulativeBasis);
  const capped = Math.min(annualContrib, remaining);
  if (!targetVal) overflow += annualContrib - capped;
  annualContrib = capped;
  cumulativeBasis += annualContrib;
}
```

- `annualLimit`: つみたて枠120 / 成長枠240（万円/年）
- `lifetimeLimit`: 個別上限（つみたて枠1800 / 成長枠1200）— ただし合算1800万円は `calcAllAssetGrowth` のプール側で制御。
- `cumulativeBasis`: 累積取得価額（簿価）。売却控除は未実装（売却ロジックは別関数で処理）。

### 2.5 合算NISAプール（`index.html:8823-8877`）

```js
const NISA_COMBINED_LIMIT = 1800;     // 合算生涯上限（万円）
// 名義(owner)ごとに nisaPoolRemainingByOwner を初期化
// 各年：(1) 希望積立を計算 → (2) annualLimit でキャップ
// (3) 名義の合算残枠を超えたら按分 (d / ownerTotal) × poolLeft
// (4) プール残枠を更新
```

- 本人・パートナーそれぞれ 1,800 万円の独立プール。
- 名義内で複数アセットが競合する場合、希望額に比例配分。

### 2.6 目標金額・振替（`index.html:8706-8793`）

- `targetVal`, `targetVal2`: 達成後は積立停止 → 余剰は `overflowTargetId(2)` へ振替。
- `prev < target` で当年末に超えた場合、超過分を `overflow` に回し `finalVal = target` に切り詰め。
- `prev === target` の「維持フェーズ」では利息超過も切り詰め（`overflow` には加算しない＝消滅）。

### 2.7 旧NISA移管（`index.html:8712, 8730`）

```js
const isOldNisa = !!(t?.noNewContrib && a.endYear);
const activeTaxType = (isOldNisa && yr > a.endYear) ? 'tokutei' : taxType;
```

- 旧つみたてNISA: `endYearDefault: 2042`、旧一般NISA: `endYearDefault: 2027` 以降は特定口座の税率を適用。

## 3. 標準との突合

### 3.1 複利公式

- **標準**: FV = PV × (1 + r)^n、積立付き FV = PMT × ((1+r)^n − 1)/r。FP技能検定テキスト等で広く使われる一般式。
- **本コード**: 年次反復 `B_y = B_{y-1}(1+r) + C_y` は上記閉形式と数学的に等価（任意の C_y に対応できるよう反復形で実装）。
- **判定**: ✅ 一致。

### 3.2 譲渡益・配当税率 20.315%

- **標準**: 上場株式等の譲渡益・配当にかかる税率は **所得税15% + 復興特別所得税0.315%（=15% × 2.1%）+ 住民税5% = 20.315%**。
  - 出典: 国税庁タックスアンサー No.1463「株式等を譲渡したときの課税（申告分離課税）」<https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1463.htm>
  - 復興特別所得税は 2013-2037 年適用（東日本大震災からの復興のための施策を実施するために必要な財源の確保に関する特別措置法）。
  - コード内コメント（`index.html:7876`）も租税特別措置法第37条の11を引用。
- **本コード**: `TAX_RATE = 0.20315` で一致。
- **判定**: ✅ 一致（2026年時点で有効。2038年以降に復興税終了で 20.315% → 20.0% に戻る点は 3.5 節参照）。

### 3.3 NISA 非課税・年間枠・生涯枠

- **標準**（金融庁「新しいNISA」<https://www.fsa.go.jp/policy/nisa2/>）:
  - つみたて投資枠 年間 **120万円**
  - 成長投資枠 年間 **240万円**
  - 生涯非課税保有限度額 **1,800万円**（うち成長投資枠は 1,200万円 まで）
  - 売却による枠の復活あり（簿価ベース）
- **本コード**:
  - `nisa_tsumitate.annualLimit = 120, lifetimeLimit = 1800` (`index.html:5334`)
  - `nisa_growth.annualLimit = 240, lifetimeLimit = 1200` (`index.html:5335`)
  - `NISA_COMBINED_LIMIT = 1800` で合算制御 (`index.html:8814`)
- **判定**: ✅ 金額は一致。ただし「売却による枠の復活」は未実装（§6 参照）。

### 3.4 iDeCo 運用益非課税

- **標準**: 運用益は非課税。受取時に退職所得控除または公的年金等控除を適用。
  - 出典: iDeCo公式（国民年金基金連合会）<https://www.ideco-koushiki.jp/>
  - 会社員（企業年金なし）の現行拠出限度額は **月額2.3万円（年額27.6万円）**（2024年12月施行）。
  - **2026年12月施行予定の改正**: 加入可能年齢が現行「65歳未満」→「70歳未満」に、会社員（企業年金なし）の掛金上限が **月2.3万円 → 月6.2万円** に引き上げ予定（第2号被保険者の共通枠化）。公務員・企業型DC併用者の枠も合計6.2万円ベースに再編。
    - 出典: 楽天証券「2026年12月制度改正」<https://dc.rakuten-sec.co.jp/about/revised/202505/>、りそな銀行「iDeCoの2026年12月法改正」<https://www.resonabank.co.jp/nenkin/ideco/qa/faq8540.html>
  - **本監査時点（2026-04-24）**: 改正は未施行（施行は2026年12月予定）。したがって 2.3万円 は 2026-11 までは正しい値。ただし 2026-12 以降をカバーするシミュレーションでは新上限への追従が必要になるため、これは既知の時限リスクとして `01-M04` に追記する。
- **本コード**: `ideco.monthlyLimit = 2.3` (`index.html:5338`)、`effectiveReturn` で `ideco` を非課税扱い。
- **判定**: ✅ 運用益非課税は一致。拠出限度額は「企業年金なし」前提の固定値で、企業型DC併用や第1号/第3号被保険者の別は考慮されていない（§6 `01-M04`）。2026年12月の上限引き上げ対応も未対応（同上）。

### 3.5 復興特別所得税の時限性

- **標準**: 復興特別所得税は **2013年〜2037年** 適用。2038年以降は所得税15% + 住民税5% = 20% に戻る（復興特措法第13条等）。
- **本コード**: `TAX_RATE` は 0.20315 のハードコード。シミュレーションは数十年のスパンを扱うため、2038年以降の計算が約 0.315pt だけ過少評価になる。
- **判定**: ⚠️ 仕様上の差異（後述）。

## 4. 仮定・制約

1. **年次計算**: 月次ではなく年次更新。実際には毎月積立するため、初年度の期待利回りが約 `r/2` しか載らない点は本コードでは考慮されていない（1年丸ごと運用された想定）。
2. **税率一定**: 所得税・住民税・復興税の税率変更は反映されない（2038年以降の復興税終了も含む）。
3. **インフレ非考慮**: 名目利回り。`renderPortfolio` 側で表示用に `realFactor` 変換はあるが、計算自体は名目。
4. **特定口座の「毎年課税」近似**: 特定口座は実際には売却時・配当受取時に課税されるが、本コードは毎年利益を確定するかのように `r × (1 − TAX_RATE)` を適用。長期保有で課税を繰り延べる税制優遇効果（実質複利）が反映されず、**課税口座の残高を過少評価** する。
5. **NISA 枠の復活**: 売却時の簿価ベース枠復活は未実装。`nisaBasis` は積み上げのみで減らない。
6. **配当税率**: `high_dividend` 等の配当も `effectiveReturn` 経由で「再投資モードでは配当込み r に20.315%を一律適用」。NISA では配当も非課税で正しいが、課税口座では配当と値上がり益に同じ税率を適用しており、**外国税額控除・DRIP 等は考慮外**。
7. **iDeCo 拠出限度額**: 会社員(企業年金なし)想定の 2.3万円/月 固定。自営業者(6.8万円)・公務員(現行2万円)・第3号(2.3万円)・企業型DC併用等の分岐なし。
8. **名義(owner)**: `self` / `partner` の2択。子ども名義のジュニアNISA等は対象外（現行制度でも新規不可）。
9. **現在年の取得**: `new Date().getFullYear()` による実行時年依存。年境界（12/31→1/1）を跨いで実行するとシミュレーション初期年が1年ズレるほか、旧NISA移管 (`yr > a.endYear`) 判定や `noNewContrib` 判定の基準日も動的に変わる。スナップショットテストは固定年にモックする必要あり。

## 5. エッジケース

1. **`years = 0`**: ループは `y=0` のみで `values = [a.currentVal || 0]`。空配列にはならない。
2. **`a.currentVal` 未設定**: `|| 0` で 0 扱い。
3. **`startYear` / `endYear` の境界**: `yr >= startYear && yr <= endYear` の両端を含む。`endYear` 年までは積立、翌年から停止。
4. **`noNewContrib`（旧NISA）**: `ASSET_TYPES` に `noNewContrib: true` があるが、`calcAssetGrowth` では直接参照していない。ユーザーが `monthly = 0` にすることを前提（※ §6 `01-I02` 参照）。
5. **`targetVal > 0 && prev >= targetVal`**: 目標達成済み → `overflow` に自分の積立をフル転送。`targetVal2` があれば第2フェーズで振替受取のみ継続。
6. **`prev === targetVal`（維持フェーズ）**: 利息超過分は overflow にも加算せず消滅（利息が「失われる」）。
7. **`rate === 0` の分岐**: `prev + annualContrib` に短絡。`rate` は整数ゼロ判定ではなく浮動小数ゼロ。微小誤差で分岐が変わる可能性は低いが注意点。
8. **NISA プール按分**: `ownerTotal > poolLeft` の場合 `d / ownerTotal × poolLeft` で比例配分。プール残 0 の年は 0。
9. **サイクル（振替循環）**: トポロジカル順で処理できないアセットは `resultMap[a.id]` が未設定のまま最後のフォールバックで `extraMap` を使って単発計算（§6 `01-I03`）。
10. **`extraContribs[y]` 配列長**: `undefined` 参照に対しては `extraContribs[y] || 0` で 0 扱い。
11. **小数丸め**: `Math.round(x * 10) / 10` で小数1桁。多数アセット・長期だと丸め誤差の累積あり。

## 6. 検出された問題（深刻度付き）

### 🔴 Critical

🔴 Critical（なし）— ID `01-C*` 未使用

### 🟡 Important

- **`01-I01` 課税口座の「毎年課税」近似が長期で実態と乖離**
  - `effectiveReturn` は課税口座で毎年 `r × (1 − 0.20315)` を適用する。実際の特定口座は売却・配当の実現時にのみ課税されるため、**長期保有では課税繰延の複利効果が働き、実残高はもっと大きくなる**。
  - 例: 年利 5% / 30年 / 一括 1,000万円 で比較（積立・配当なし、手数料ゼロ前提）:
    - **毎年課税近似（本コード）**: 実効年利 `0.05 × (1 − 0.20315) ≈ 0.0398425`
      - `1000 × (1 + 0.05 × (1 − 0.20315))^30 = 1000 × 1.0398425^30 ≈ 3,228.7万円`
    - **売却時一括課税（実態）**: 30年後に一度だけ含み益に課税
      - 時価: `1000 × 1.05^30 ≈ 4,321.94万円`
      - 含み益: `4,321.94 − 1000 = 3,321.94万円`
      - 税額: `3,321.94 × 0.20315 ≈ 674.9万円`
      - 税引後: `4,321.94 − 674.9 ≈ 3,647.0万円`
    - **差分**: `3,647.0 − 3,228.7 ≈ 418.3万円`
    - **相対誤差**: `418.3 / 3,647.0 ≈ 11.5%` — 本コードは実態比で **約11.5%過少評価**。
    - 年利や期間が伸びるほどこの差は拡大する（保守側の誤差）。
  - 配当受取モードでは配当部分だけ毎年課税するのが正しいため、値上がり分と配当を分離した税処理にする余地あり。
  - 影響：出口戦略・FIRE 達成年の判定が保守的（安全側）に出る。11.5% の体系的な過少評価は致命的ではないが、用途（到達時期判定・取崩し開始年の早期化評価）によっては無視できない。

- **`01-I02` `noNewContrib`（旧NISA）の積立停止判定が `calcAssetGrowth` 内に存在しない（UI外の入力経路に抜け穴）**
  - UI の資産保存フローには既にガードが入っており（`index.html:8553-8554`）、`noNewContrib: true` の資産種別では `monthly = 0` / `annualBonus = 0` に強制される。また保存前のバリデーションでも警告を出す（`index.html:8193-8195`）。
    ```js
    // index.html:8553-8554
    monthly: (ASSET_TYPES[type]?.noNewContrib) ? 0 : (...),
    annualBonus: (ASSET_TYPES[type]?.noNewContrib) ? 0 : (...),
    ```
  - したがって **通常の UI 操作からは旧NISAに新規積立が入ることはない**。ただし、以下の **UI を経由しない入力経路** では `state` に `noNewContrib` 資産 + `monthly > 0` の組み合わせが残り得る:
    1. `importData()` によるユーザー編集済みJSONの読み込み（手作業で `monthly` を書き換え、または書き換えられたサンプル）
    2. リポジトリ同梱のサンプル/シードデータ（`sample_data/` 等）
    3. 当該 UI ガードが追加される前に保存された旧バージョンの localStorage データ
  - 現状 `calcAssetGrowth` は `a.monthly` をそのまま使うため、上記経路でデータが入ると 2024年以降も新規積立が継続しているかのように計算される。`isOldNisa` は税率移管にしか使われていない（`index.html:8712, 8730`）。
  - 対応案：**防御は計算側にも置くのが多層防御として妥当**。`calcAssetGrowth` の `annualContrib` 計算の手前（あるいは `effectiveReturn` と同階層の共通ヘルパ）で `ASSET_TYPES[a.type]?.noNewContrib && yr >= <移管年>` なら `annualContrib = 0` に強制する。こうすれば UI・JSON import・サンプル・旧データのどれから入っても計算側で一律に安全側に倒せる。

- **`01-I03` トポロジカル順で取りこぼしたアセットが `extraMap` の全情報を受け取れない可能性**
  - `calcAllAssetGrowth` で振替にサイクルがある場合、`resultMap[a.id]` が未設定のまま最後のフォールバック（`index.html:8962-8968`）で計算される。このときすでに `extraMap[a.id]` の一部は集まっているが、**自分がまだ計算されていない他アセットからの振替分は反映されない**。
  - UI 側でサイクルを防ぐガードがあるか別途確認が必要。

### 🟢 Minor

- **`01-M01` 復興特別所得税の時限性（2037年で終了）未対応**
  - 2038 年以降は 20.0% に戻るが `TAX_RATE` は 0.20315 ハードコード。長期シミュレーションでわずかに保守側に振れる。

- **`01-M02` 月次積立のタイミング誤差（年初一括扱い相当）**
  - `prev × (1 + r) + C_y` は積立 C_y が期末に投入される扱い。月割りなら初年度は平均 `r/2` 相当の運用期間しかない。長期ほど無視できるが、初期数年のグラフはやや楽観的。

- **`01-M03` `prev === targetVal` 維持フェーズでの利息消滅**
  - 維持フェーズで生じた運用益はどこにも記録されず消える（`overflow` にも加算しない）。意図的な簡略化だが、実際には「運用益で増えて元本を取り崩す」モデルとは整合しない。

- **`01-M04` `iDeCo` 拠出限度額が会社員(企業年金なし)固定、2026年12月改正への未対応**
  - 自営業者・公務員・企業型DC併用の場合は限度額が異なる。UI で注記はあるが、計算ロジック側には分岐がない。
  - 加えて、2026年12月施行予定の改正で会社員(企業年金なし)の上限が **月2.3万円 → 月6.2万円** に引き上げられるが、`ideco.monthlyLimit = 2.3` はハードコード。2026-12 以降を含む長期シミュレーションでは iDeCo による積立可能額が過少に見積もられる（保守側）。年度依存の上限テーブル化が望ましい（§3.4 参照）。

- **`01-M05` 丸め誤差の蓄積**
  - 各年末で小数1桁（0.1万円=1,000円）丸め。30年・10アセットだと数万〜十数万円規模の誤差が出る可能性。表示精度としては十分だが、他計算との整合テストでは注意。

- **`01-M06` NISA 枠の売却時復活が未実装**
  - 新NISAは売却時に簿価分の枠が翌年復活する制度だが、`nisaBasis` / `cumulativeBasis` は積み上げのみ。長期で売却→再投資を繰り返す想定では過少評価の可能性。

## 7. 結論

- **信頼度**: ⚠️ 中
- **一言サマリー**: 複利公式・税率値（20.315%）・新NISA の枠設定は標準と一致しており基本構造は妥当。ただし「特定口座＝毎年課税近似」(`01-I01`) により長期の課税口座残高が**約11.5%（年利5%/30年の例）** 体系的に過少評価される点、旧NISA の新規積立停止 (`01-I02`) が UI ガードに依存しており JSON import/サンプル/旧データ経路では計算側に強制がない点、および振替サイクル時のフォールバック (`01-I03`) の取りこぼし可能性が残る。
- **信頼度 ⚠️ 中 の根拠**: 単一の致命的欠陥ではなく、`01-I01`・`01-I02`・`01-I03` の **3件の Important の合算重み**による判定。`01-I01` の過少評価幅を（誤って）25% → 正しくは約11.5% に訂正しても、複数の Important が残る以上 ✅ 高 には繰り上がらない。同様に `01-I01` 単独を解消しても `01-I02` `01-I03` が残るため ⚠️ 中 は変わらない。
- **申し送り**: `01-I01` の過少評価は出口戦略・FIRE 達成年の判定に「保守側」のバイアスとして効くため、上位監査（統合シミュレーション・出口戦略）で感度分析の対象に含める。`01-I02` は JSON import 経路のテストケースで確認。
