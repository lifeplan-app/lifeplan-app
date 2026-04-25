# Phase 4d: iDeCo 受給方法 UI 設計書

**作成日**: 2026-04-25
**前提**: Phase 4c 完了（Important 8 件解決、`8333bfa`）

## 目的

iDeCo の受給方法（一時金 / 年金）と受給開始年齢（60-75 歳）、年金受給期間（5/10/15/20 年）をユーザーが選択できるようにする。Phase 4a で 60 歳一時金一括受取に固定されていた挙動を拡張し、現実のユーザー戦略に合わせたシミュレーションを可能にする。

Phase 2 監査で検出された Important はすべて Phase 4c で解決済み。Phase 4d は機能拡張フェーズに位置づけ。

## スコープ

### 対象機能（1 機能）

- iDeCo 受給方法（一時金 / 年金）の選択
- 受給開始年齢（60-75 歳）の選択
- 年金受給時の受給期間（5/10/15/20 年）の選択

### 対象外（Phase 4e 以降で検討）

- 一時金 + 年金の **併用受給**（比率指定）: 実装コストの割に価値小、95% のユーザーには不要
- 06-I02 軸2（本人高所得者逓減 900/950/1000 万円）: 影響ユーザー限定
- Minor 項目 63 件の選別修正
- 退職金と iDeCo 一時金の **5 年/19 年ルール**（受給年が異なる場合の控除別枠化）: 税法上の特例、簡略化
- 年金受給期間中の **運用継続**（annuity 計算）: 保守的に運用無視で簡素化

## データモデル

### 新規フィールド（`state.retirement` に追加）

| フィールド | 型 | 既定値 | 範囲 | 説明 |
|---|---|---|---|---|
| `idecoReceiptMethod` | `'lump' \| 'pension'` | `'lump'` | — | 受給方法 |
| `idecoStartAge` | number | `targetAge` | 60-75 | 受給開始年齢 |
| `idecoPensionYears` | number | `10` | 5/10/15/20 | 年金受給期間（pension 時のみ使用） |

### 後方互換

新フィールド未指定の場合、既定値で **現状の挙動**（60 歳〜targetAge 一時金一括）と一致させる。既存 5 サンプルすべて snapshot 不変。

### バリデーション

- `idecoStartAge` が範囲外 → `Math.max(60, Math.min(75, value))` でクランプ
- `idecoPensionYears` が 5/10/15/20 以外 → `10` にフォールバック
- `assets` に type=`'ideco'` がない場合は受給設定は無視（残高 0 で計算）

## 計算ロジック

### 共通: 受給開始時残高

```javascript
const idecoStartAge = parseInt(r.idecoStartAge) || targetAge;
const yearsToIdecoStart = Math.max(0, idecoStartAge - currentAge);

const _idecoBalanceAtStart = (state.assets || [])
  .filter(a => a.type === 'ideco')
  .reduce((s, a) => {
    const rate = ((a.annualReturn != null ? a.annualReturn : (ASSET_TYPES[a.type]?.defaultReturn ?? 4))) / 100;
    const monthly = a.monthly || 0;
    let bal = a.currentVal || 0;
    for (let y = 0; y < yearsToIdecoStart; y++) {
      bal = bal * (1 + rate) + monthly * 12;
    }
    return s + bal;
  }, 0);
```

`idecoStartAge - currentAge` 年分の複利成長 + 拠出。targetAge ではなく idecoStartAge を使う点が現状からの変更。

### 一時金受給（`idecoReceiptMethod === 'lump'`）

```javascript
const idecoLumpsum = (idecoMethod === 'lump') ? _idecoBalanceAtStart : 0;
const severanceAtRetire = calcSeveranceDeduction(severanceGross, idecoLumpsum, serviceYears);
```

退職所得控除との合算は **同年扱い** に簡略化。実際の税法（5 年/19 年ルール）は無視。

### 年金受給（`idecoReceiptMethod === 'pension'`）

```javascript
const idecoPensionYears = parseInt(r.idecoPensionYears) || 10;
const idecoYearly = (idecoMethod === 'pension')
  ? _idecoBalanceAtStart / idecoPensionYears
  : 0;
```

退職期年次ループで、`age >= idecoStartAge && age < idecoStartAge + idecoPensionYears` の年に：

```javascript
const idecoIncomeThisYear = idecoYearly; // 受給期間内
// 既存の pensionAnnual と合算してから netRatio 適用
const totalPensionGross = pensionAnnual + pensionAnnual_p + idecoIncomeThisYear;
// （手取り計算は既存の階層 netRatio をそのまま流用）
```

公的年金等控除は **公的年金 + iDeCo 年金の合算所得に対して 1 つだけ適用** されるため、合算してから階層 netRatio を適用するのが実態に近い。

### エッジケース

- `idecoStartAge >= targetAge`: 通常ケース。targetAge 〜 idecoStartAge の間、iDeCo 残高は投資プールに「凍結」状態で保持し取崩対象外。
- `idecoStartAge < targetAge`: 退職前に iDeCo 受給開始（理論的にはあり得る）。一時金は退職所得控除と合算（同年扱い簡略化）、年金は退職期計算側のみで処理（現役期手取り計算には反映しない）。
- `assets[type='ideco']` が空: `_idecoBalanceAtStart = 0` で全分岐が 0 となり既存挙動と一致。

## UI 配置

### 既存退職パネル内に新規セクション追加

退職設定パネル（`state.retirement` を編集する箇所）の「退職金」近辺に新規ブロックを挿入：

```html
<div class="ideco-receipt-section">
  <h4>iDeCo 受給設定</h4>

  <div class="form-group">
    <label>受給方法</label>
    <div style="display:flex;gap:12px">
      <label><input type="radio" name="idecoMethod" value="lump"> 一時金（一括）</label>
      <label><input type="radio" name="idecoMethod" value="pension"> 年金（分割）</label>
    </div>
  </div>

  <div class="form-group">
    <label>受給開始年齢</label>
    <select id="retIdecoStartAge">
      <!-- 60〜75 歳のオプション -->
    </select>
  </div>

  <div class="form-group" id="retIdecoPensionYearsGroup">
    <label>年金受給期間</label>
    <select id="retIdecoPensionYears">
      <option value="5">5 年</option>
      <option value="10" selected>10 年</option>
      <option value="15">15 年</option>
      <option value="20">20 年</option>
    </select>
  </div>

  <p class="hint">一時金は退職所得控除（退職金と合算）、年金は公的年金等控除（公的年金と合算）の対象です。</p>
</div>
```

### 表示制御

- 受給方法が `'lump'` のとき年金受給期間欄を非表示（`display: none`）
- 受給方法が `'pension'` のとき年金受給期間欄を表示
- ラジオボタンの `onchange` で `retIdecoPensionYearsGroup.style.display` を切り替え

## 修正ファイル

| パス | 変更内容 |
|---|---|
| `calc/retirement.js` | `_idecoAtRetireSim` を `_idecoBalanceAtStart` に置換、年金受給時の年次加算ロジック追加 |
| `calc/integrated.js` | 該当箇所があれば年次ループで idecoYearly を加算（影響範囲調査要）|
| `index.html` | 退職パネル UI 拡張、save/load に新フィールド対応 |
| `test/regression.test.js` | BUG#9 4 件のリグレッションテスト |

## テスト戦略

### リグレッションテスト（`test/regression.test.js` 末尾に追加）

```javascript
describe('[BUG#9] iDeCo 受給方法（Phase 4d 07-I04 拡張）', () => {
  // 1. 既定値（lump + idecoStartAge=targetAge）で既存挙動と一致
  // 2. lump + idecoStartAge=70（targetAge=65）→ 5 年運用継続後の残高
  // 3. pension + idecoPensionYears=10 → 受給期間中 pensionAnnual に加算
  // 4. pension のとき idecoLumpsum=0（退職所得控除に渡さない）
});
```

### snapshot 想定

- 既存 5 サンプル: 新フィールド未指定 → 既定値で従来挙動 → **snapshot 差分なし**
- 新規ユーザーが UI で受給方法を変更すると当然 snapshot は変動するが、それはテストではなく動作確認の範疇

### ブラウザ動作確認

- 受給方法切替で年金受給期間欄の表示/非表示が連動
- 受給開始年齢 60-75 のドロップダウン
- 設定保存後、再度開いた際に状態が復元
- 既存サンプルロードで既定値が当たることを確認

## commit 構成

Phase 4b/4c より小規模（1 グループ）:

1. `chore(phase4d): scaffold expected-changes tracking`
2. `fix(phase4d): iDeCo receipt method (lump/pension) and start age`（calc + UI + tests）
3. `docs(phase4d): record actual SHA`
4. `docs(phase4d): mark related notes and update walkthrough`

合計 **約 4 commits**（Phase 4c の 15 commits より小規模）。

## 完了条件

- [ ] `state.retirement` に 3 フィールド追加（idecoReceiptMethod, idecoStartAge, idecoPensionYears）
- [ ] `calc/retirement.js` の `_idecoBalanceAtStart` 化と一時金/年金分岐
- [ ] `index.html` に UI 3 コントロール（ラジオ + 受給開始年齢セレクト + 受給期間セレクト）
- [ ] `test/regression.test.js` に BUG#9 4 件追加（179 → 183 想定）
- [ ] 既存 snapshot 不変
- [ ] `docs/phase4d-fixes/expected-changes.md` に期待方向 + 実測記録
- [ ] `docs/phase2-audits/sanity-walkthrough-シナリオB.md` に Phase 4d 評価追記
- [ ] iDeCo 関連の Phase 4a 注記（07-I04, 08-I02）に Phase 4d 拡張への参照追加

## Phase 4e 以降への橋渡し

- 一時金+年金の併用受給
- 06-I02 軸2（本人高所得者逓減）
- 5 年/19 年ルール（厳密な退職所得控除別枠化）
- 年金受給期間中の運用継続（annuity 計算）
- Minor 63 件の選別修正
