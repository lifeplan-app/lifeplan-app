# Phase 4t 修正の期待方向と実測

iDeCo 拠出限度額 年月依存自動切替 (2026 改正対応の最終仕上げ)。

## 期待方向

- `getIdecoMonthlyLimit(year)` を `calc/asset-growth.js` に追加
  - year < 2027: 2.3 万円
  - year >= 2027: 6.2 万円（2026/12 施行 → シミュ年単位で 2027 から適用）
- `index.html` の UI 警告判定で `t.monthlyLimit` を関数呼び出しに置換（type='ideco' 限定）
- 計算側は変更なし（snapshot 不変）
- ノート文字列を最新化

## 実測サマリー
- snapshot 差分: なし（計算側変更なし）
- `getIdecoMonthlyLimit(year)` 追加 (calc/asset-growth.js)
- UI 警告 2 箇所で年月依存判定に変更
- ASSET_TYPES.ideco.note 文言を「予定」から「税制改正対応」へ明確化
- テスト: 240/240 グリーン (235 + BUG#21 5 件)
- コミット SHA: 7ebd6c7 (scaffold), d0a0bbc (feat)
