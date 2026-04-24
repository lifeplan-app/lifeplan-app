# Phase 4c 修正の期待方向と実測

Important 8 件を 6 グループに分けて修正した記録。
実施順序: G10-quick → G7 → G9b → G10-refi → G10-housing → G10-scenario
（計算のみ・バグ修正 → UI 拡張へ段階的に進行）。

---

## Group 10-quick: 住宅ローン計算バグ修正（05-I05, 05-I06）

### 期待方向
- **05-I05**: `principal × r ≥ monthly` で `newN` が `NaN` / `Infinity` になる場合、即完済扱い（`principal = 0, endYear = year`）にフォールバック。
- **05-I06**: 同年に `refi` と `prepay` が混在する場合、常に `refi → prepay` の順で処理する（既存の `sort((a,b)=>a.year-b.year)` は年のみでソートし同年内順不定）。

### 想定される snapshot 差分
既存 5 シナリオのうち、NaN 発症条件（極端に低い monthly）や同年 refi+prepay を持つサンプルは皆無のため **snapshot 差分なし**。リグレッションテスト（test/regression.test.js）で挙動を固定する。

### 実測サマリー
- snapshot 差分: **なし**（既存 5 シナリオに該当条件のイベント未登録）
- regression.test.js に BUG#2/#3 を追加して挙動固定
- テスト: 157/157 グリーン（155 + 新規 2）
- 実コミット: c196760

---

## Group 7: income_change 昇給継続フラグ（02-I03）

### 期待方向
（Task 3 実施時に記入）

### 実測サマリー
（Task 3 修正後に記入）

---

## Group 9b: calcTakeHome 配偶者控除本実装（06-I02）

### 期待方向
（Task 4 実施時に記入）

### 実測サマリー
（Task 4 修正後に記入）

---

## Group 10-refi: 借換諸費用（05-I04）

### 期待方向
（Task 5 実施時に記入）

### 実測サマリー
（Task 5 修正後に記入）

---

## Group 10-housing: 子育て特例＋頭金（05-I01, 05-I02）

### 期待方向
（Task 6 実施時に記入）

### 実測サマリー
（Task 6 修正後に記入）

---

## Group 10-scenario: シナリオ連動（05-I03）

### 期待方向
（Task 7 実施時に記入）

### 実測サマリー
（Task 7 修正後に記入）
