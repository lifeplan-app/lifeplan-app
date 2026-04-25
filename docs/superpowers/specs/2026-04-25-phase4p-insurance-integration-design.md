# Phase 4p: 保険料シミュレーション統合 設計書

**作成日**: 2026-04-25
**前提**: Phase 4o 監査で F1 として検出（保険料がシミュに反映されない）

## 目的

`state.insurance.items[]` に登録された保険料が**月次キャッシュフロー / 退職シミュ**に反映されない問題を解消。月額 1〜3 万円規模の保険料が無視されると 30 年で数百〜千万円規模の誤差。

## スコープ

### 対象

- ヘルパ関数 `getInsurancePremiumsForYear(year)` を `calc/income-expense.js` に追加
- `calc/integrated.js` の年次ループで現役期支出に加算
- `calc/retirement.js` の年次ループで退職期支出に加算
- 退職タブの内訳表示（取り崩し内訳ブレークダウン）に保険料項目追加

### 対象外

- 死亡保険金（coverage）受取のシミュ反映（複雑性が高く、ユーザーニーズ低）
- 保険料のインフレ調整（保険料は契約額固定が一般的）
- 保険料の年払い vs 月払い区別（既存 UI が「月額」一律のため）

## データモデル

既存（変更なし）:
```javascript
state.insurance.items[] = {
  id, type, name,
  premium,    // 月額保険料 (万円/月)
  coverage,   // 保障額 (万円)
  startYear,  // 加入開始年（null なら現在から有効）
  endYear,    // 終了年（null なら終身扱い）
  memo,
}
```

## 計算ロジック

### `getInsurancePremiumsForYear(year)`

```javascript
function getInsurancePremiumsForYear(year) {
  const items = (state.insurance && state.insurance.items) || [];
  let totalAnnual = 0;
  for (const item of items) {
    const monthly = parseFloat(item.premium) || 0;
    if (monthly <= 0) continue;
    const startYr = parseInt(item.startYear);
    const endYr = parseInt(item.endYear);
    // startYear 未設定 → 全期間有効
    // endYear 未設定 → 終身扱い（lifeExpectancy 制限なし）
    if (startYr && year < startYr) continue;
    if (endYr && year > endYr) continue;
    totalAnnual += monthly * 12;
  }
  return totalAnnual;
}
```

### 統合シミュへの組込み

`calc/integrated.js` の年次ループ内で `annualExpense` に加算：

```javascript
// [Phase 4p F1] 保険料を年次支出に加算
const annualInsurancePremium = (typeof getInsurancePremiumsForYear === 'function')
  ? getInsurancePremiumsForYear(yr) : 0;
let annualExpense = getExpenseForYear(yr) * _infFactorIS + annualInsurancePremium;
```

### 退職シミュへの組込み

`calc/retirement.js` の年次ループ内で `totalAnnualExpense` に加算：

```javascript
// [Phase 4p F1] 保険料を退職期支出に加算
const annualInsurancePremium = (typeof getInsurancePremiumsForYear === 'function')
  ? getInsurancePremiumsForYear(yr) : 0;
const totalAnnualExpense = baseExpenseAnnual + annualLE + annualInsurancePremium;
```

## エッジケース

- `state.insurance` 未定義 → 0 返却
- `items` 配列空 → 0 返却
- 保険料負値 → スキップ（防御）
- `startYear === endYear` → その 1 年だけ計上

## UI 変更

退職タブの「取り崩し内訳」テーブル/サマリー（年次サマリー expanded view）に「保険料」行を追加。`d.annualInsurancePremium` を返り値に含めて表示。

または最小実装: 既存の `生活費` 行に含めて表示する（数値だけ反映、明示行追加なし）

→ シンプルさ優先で **後者を選択**。年次サマリーの「生活費」表示は実態 = 月支出 + 保険料となる。

## 後方互換

- 既存サンプル: `state.insurance.items` が空 or 未定義 → 0 加算 → snapshot 不変想定
- 既存サンプルでも insurance.items を持つものがあれば snapshot 変動 → 期待方向通り

## テスト戦略

`test/regression.test.js` に BUG#18:

1. `getInsurancePremiumsForYear` 単体: items 空で 0
2. 単一保険、startYear/endYear 期間内 → premium × 12 万返却
3. 期間外 → 0
4. 終身（endYear 未設定）→ 全年計上
5. 複数保険合計
6. `calcIntegratedSim` で保険料が支出に反映される統合テスト

snapshot 想定: 既存 5 サンプルが `state.insurance.items` を持たなければ不変。要確認。

## commit 構成

1. `chore(phase4p): scaffold expected-changes`
2. `fix(phase4p): integrate insurance premiums into annual expense (F1)`
3. `docs(phase4p): record actual SHA + completion`

合計 **約 3 commits**。

## 完了条件

- [ ] `getInsurancePremiumsForYear` 追加
- [ ] `calc/integrated.js` の `annualExpense` に組込み
- [ ] `calc/retirement.js` の `totalAnnualExpense` に組込み
- [ ] BUG#18 6 件追加（220 → 226 グリーン）
- [ ] 既存 snapshot 確認（差分があれば期待方向と整合確認後 update）

## Phase 4q 候補（次）

- F2: giftPlans → expenses 自動連動
- F3: 入力サポート拡張
