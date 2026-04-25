# Phase 4g: iDeCo 一時金 + 年金 併用受給 設計書

**作成日**: 2026-04-25
**前提**: Phase 4f 完了（annuity 計算、`ca1c87f`）

## 目的

Phase 4d で導入した iDeCo 受給方法（一時金 / 年金）に「併用」モードを追加する。一時金部分は退職所得控除、年金部分は公的年金等控除と合算と、両方の税優遇を活用したい上級ユーザー向け。

## スコープ

### 対象機能

- `idecoReceiptMethod` に `'mixed'` を追加（既存 `'lump'`/`'pension'` 維持）
- 新フィールド `idecoLumpRatio`（0-100、% で一時金として受け取る比率、既定 50）
- mixed 時の計算分岐：
  - 一時金部分 = balance × (lumpRatio/100)
  - 年金部分 = balance × (1 - lumpRatio/100)
  - 一時金部分は退職所得控除に渡す
  - 年金部分は annuity formula で計算
- UI: 受給方法ラジオに「併用」追加、選択時のみ「一時金比率」入力欄を表示

### 対象外

- 5/19 年ルール（退職金と一時金の受給年差による控除別枠化）
- 一時金比率の細かい刻み（5% 刻み等）→ 整数 % で十分

## データモデル

### 新規フィールド

| フィールド | 型 | 既定値 | 範囲 | 説明 |
|---|---|---|---|---|
| `idecoLumpRatio` | number | 50 | 0-100 | mixed 時の一時金比率 (%) |

### 拡張フィールド

| フィールド | 既存値 | 追加値 |
|---|---|---|
| `idecoReceiptMethod` | `'lump' \| 'pension'` | + `'mixed'` |

### 後方互換

新フィールド `idecoLumpRatio` は mixed 時のみ参照。lump/pension の場合は無視。既存サンプルは `idecoReceiptMethod` 未指定 → `'lump'` 既定 → snapshot 不変。

## 計算ロジック

### 受給金額の分割

```javascript
const idecoLumpRatio = (idecoMethod === 'mixed')
  ? Math.max(0, Math.min(100, parseInt(r.idecoLumpRatio) || 50)) / 100
  : null;

// 一時金部分（退職所得控除に渡す金額）
const idecoLumpsum =
    (idecoMethod === 'lump')   ? _idecoBalanceAtStart
  : (idecoMethod === 'mixed')  ? _idecoBalanceAtStart * idecoLumpRatio
  :                              0;

// 年金部分（annuity 元本）
const _idecoPensionPortion =
    (idecoMethod === 'pension') ? _idecoBalanceAtStart
  : (idecoMethod === 'mixed')   ? _idecoBalanceAtStart * (1 - idecoLumpRatio)
  :                               0;

// 年金額（annuity）
const idecoYearly = (_idecoPensionPortion > 0)
  ? (_idecoWeightedRate > 0
      ? _idecoPensionPortion * _idecoWeightedRate / (1 - Math.pow(1 + _idecoWeightedRate, -idecoPensionYears))
      : _idecoPensionPortion / idecoPensionYears)
  : 0;
```

### エッジケース

- `idecoLumpRatio = 100` → lump と同等（年金部分 0）
- `idecoLumpRatio = 0` → pension と同等（一時金部分 0）
- `idecoLumpRatio` 範囲外 → クランプ
- `idecoLumpRatio` 未指定 → 既定 50%

### 既存挙動との一致

- `idecoMethod = 'lump'`: idecoLumpsum = balance（変更なし）
- `idecoMethod = 'pension'`: idecoYearly = annuity(balance)（変更なし）

両方とも従来通りの動作。新ロジックは mixed 経路のみ追加。

## UI 配置

### 既存退職パネルの iDeCo 受給設定ブロック内

既存 2-radio を 3-radio 化 + 一時金比率欄を条件付き表示：

```html
<div class="form-group">
  <label>受給方法</label>
  <div style="display:flex;gap:16px;font-size:13px;margin-top:4px">
    <label><input type="radio" name="retIdecoMethod" value="lump" onchange="..."> 一時金（一括）</label>
    <label><input type="radio" name="retIdecoMethod" value="pension" onchange="..."> 年金（分割）</label>
    <label><input type="radio" name="retIdecoMethod" value="mixed" onchange="..."> 併用</label>
  </div>
</div>
<!-- pension or mixed のとき表示 -->
<div id="retIdecoPensionYearsGroup" style="display:none">
  <label>年金受給期間</label>
  <select id="retIdecoPensionYears">...</select>
</div>
<!-- mixed のときのみ表示 -->
<div class="form-group" id="retIdecoLumpRatioGroup" style="display:none">
  <label>一時金比率（%）</label>
  <input type="number" id="retIdecoLumpRatio" min="0" max="100" step="5" value="50">
  <p class="hint">残り（100% − 一時金比率）が年金部分。0% で純年金、100% で純一時金。</p>
</div>
```

### 表示制御

`onIdecoMethodChange()` 拡張：
- `lump`: 年金受給期間欄も一時金比率欄も非表示
- `pension`: 年金受給期間欄のみ表示
- `mixed`: 年金受給期間欄 + 一時金比率欄を表示

## 後方互換

- 新フィールド未指定 → 既定値で従来挙動継続
- localStorage の lifeplan_v1 に破壊的変更なし
- 既存 5 サンプル全件 `idecoMethod` 未指定 → 'lump' 既定 → 全 snapshot 不変

## エラーハンドリング

- `idecoLumpRatio` が NaN/負/100超 → `Math.max(0, Math.min(100, value))` でクランプ
- `Math.max` フォールバックで mixed 時に extreme cases も安全

## 修正ファイル

| パス | 変更内容 |
|---|---|
| `calc/retirement.js` | 2 箇所（calcRetirementSim, calcRetirementSimWithOpts）で mixed 分岐追加 |
| `index.html` | 退職パネル UI 拡張、save/render に新フィールド対応、`onIdecoMethodChange()` 拡張 |
| `test/regression.test.js` | BUG#12 リグレッション追加（mixed 動作確認） |

## テスト戦略

`test/regression.test.js` に BUG#12 として：

1. mixed 50% で lumpsum = balance/2、pensionPortion = balance/2 確認
2. mixed 0% は pension 単独と同等
3. mixed 100% は lump 単独と同等
4. mixed の年金額が pension 単独より少ない（pensionPortion 小なため）
5. UI: idecoLumpRatio 範囲外（150 等）はクランプして 100 として動作

snapshot 想定: 既存サンプル全件 `'lump'` 既定 → snapshot 不変

## commit 構成

1. `chore(phase4g): scaffold expected-changes tracking`
2. `fix(phase4g): iDeCo mixed receipt method (lump + pension)`
3. `docs(phase4g): record actual SHA + walkthrough`

合計 **約 3-4 commits**（小規模 phase）。

## 完了条件

- [ ] `idecoReceiptMethod` に `'mixed'` 追加
- [ ] `idecoLumpRatio` フィールド追加（0-100）
- [ ] `calc/retirement.js` 2 箇所で mixed 分岐実装
- [ ] `index.html` UI 3-radio + 比率欄 + onChange 拡張
- [ ] `save/render` 新フィールド対応
- [ ] BUG#12 5 件追加（196 → 201 グリーン）
- [ ] 既存 snapshot 不変
- [ ] `docs/phase4g-fixes/expected-changes.md` 記録
- [ ] サニティウォークスルー B に Phase 4g 評価追記

## Phase 4h 以降の候補

- 5/19 年ルール（厳密な退職所得控除別枠化）
- Minor 63 件選別
- 新規 UI 機能（PDF 出力、シナリオ共有 URL 等）
