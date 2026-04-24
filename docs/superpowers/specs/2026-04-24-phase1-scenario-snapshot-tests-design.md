# Phase 1｜シナリオ・ゴールデンスナップショット・テスト 設計書

- **作成日**: 2026-04-24
- **対象アプリ**: ライフプランアプリ（`index.html`）
- **位置付け**: 計算ロジックの正確性検証 3段階プランの **Phase 1**
- **次のフェーズ**: Phase 2（独立参照実装との突合） → Phase 3（計算ロジックの index.html からの分離）

---

## 1. 背景と目的

### 1.1 現状の構造的リスク

1. **テストが「本物の計算」をテストしていない**
   現行 Vitest テスト（128件）は `test/helpers/core.js` を検証対象にしている。`core.js` は `index.html` から**手動でコピーされた計算関数の複製**。ファイル冒頭にも「⚠️ 変更したら同期すること」と注記されており、同期漏れが発生すると「テストは通るのに本番は壊れている」状態が起こり得る。

2. **新機能が一切テストされていない**
   `core.js` の対象は資産成長（`calcAssetGrowth` 系）と税率計算のみ。4月に実装された以下の領域は未カバー：
   - 住宅ローン・住宅ローン控除
   - 年金試算
   - パートナーリタイア
   - 二プールモデル
   - 出口戦略（取り崩し）
   - 年次キャッシュフローの統合ロジック

3. **単体検証は十分でも、組み合わせが未検証**
   手計算や他ツール比較で単純な計算は検証済み。しかし機能追加とデータ組み合わせの拡充により計算が大規模化しており、相互作用での正確性が未保証。

### 1.2 Phase 1 の目的

**「知らないうちに計算結果が変わる」事態を検知する安全網を張る。**

本物の `index.html` をヘッドレスブラウザで実行し、実在のサンプルシナリオ5件について計算出力をスナップショットとして保存する。今後の変更で数値が動けば自動的にテストが失敗し、意図した変更かバグかを人が判定する運用に切り替える。

**本フェーズで計算ロジックの「正しさ」そのものは検証しない。**（これは Phase 2 の責務）

---

## 2. 全体アーキテクチャ

```
┌─────────────────────────────┐
│ sample_data/*.json (5件)     │   入力データ（既存資産）
│ シナリオA: 26歳独身奨学金     │
│ シナリオB: 35歳共働きローン   │
│ シナリオC: 45歳高収入FIRE     │
│ シナリオD: 55歳老後準備       │
│ シナリオE: 38歳シングルマザー │
└──────────┬──────────────────┘
           ▼
┌──────────────────────────────────────────┐
│ test/scenario-snapshot.test.js           │   新規
│  ・Playwrightで Chromium を起動          │
│  ・file://.../index.html をロード        │
│  ・localStorage['lifeplan_v1'] に注入    │
│  ・window の計算関数を page.evaluate     │
└──────────┬───────────────────────────────┘
           ▼
┌──────────────────────────────────────────┐
│ 本番コード（index.html 内の関数）         │   ← 一切触らない
│  window.calcIntegratedSim(...)           │
│  window.calcRetirementSimWithOpts(...)   │
│  window.calcScenarioSim(...)             │
│  window.calcScenarioFullTimeline(...)    │
└──────────┬───────────────────────────────┘
           ▼
┌──────────────────────────────────────────┐
│ test/__snapshots__/                      │   Vitestが自動管理
│   scenario-snapshot.test.js.snap         │
└──────────────────────────────────────────┘
```

**基本原則**: `helpers/core.js` のような計算ロジックの複製は一切作らない。本物のコードを本物のブラウザ上で実行した結果のみを正とする。これにより「コピー同期漏れ」による偽陰性が構造的に発生しない。

---

## 3. ファイル構成

### 3.1 新規ファイル

| パス | 役割 |
|------|------|
| `test/scenario-snapshot.test.js` | メインのテストファイル |
| `test/helpers/playwright-runner.js` | ブラウザ起動・JSON注入・関数呼び出しの共通処理 |
| `test/__snapshots__/scenario-snapshot.test.js.snap` | Vitest が自動生成（commit対象） |

### 3.2 変更ファイル

| パス | 変更内容 |
|------|----------|
| `package.json` | `playwright` を `devDependencies` に追加、`test:snap` / `test:update` スクリプトを追加 |
| `CLAUDE.md` | 「計算ロジック検証」セクションを追加し、運用手順を明記 |

### 3.3 既存ファイル（変更なし）

- `index.html` — 一切触らない
- `test/helpers/core.js` — 既存 Vitest テストのために維持（将来 Phase 3 で廃止予定）
- 既存 5テストファイル — すべて維持・並走

---

## 4. テスト1件のフロー

1. **ブラウザ起動**: Playwright（Chromium・headless）を起動し、`file:///Users/.../ライフプランアプリ/index.html` を開く。
2. **初期化待機**: `page.waitForFunction(() => typeof calcIntegratedSim === 'function')` で計算関数がグローバルに定義されるまで待つ。
3. **データ注入**: 対象の `sample_data/シナリオX.json` を読み込み、`localStorage.setItem('lifeplan_v1', ...)` した上で `location.reload()`。再度初期化待機。
4. **計算呼び出し**（`page.evaluate` 内）:
   - `calcIntegratedSim(N)` — 統合シミュレーション（N は各シナリオの `finance.simYears` を使う。未設定時はプロフィール年齢から 90歳までの年数を算出してフォールバック）
   - `calcRetirementSimWithOpts({})` — 出口戦略（標準）
   - `calcRetirementSimWithOpts({ returnMod: +0.01, expenseMod: -0.10, pensionMod: 0 })` — 楽観
   - `calcRetirementSimWithOpts({ returnMod: -0.01, expenseMod: +0.10, pensionMod: -0.15 })` — 悲観
   - `calcScenarioSim(...)` / `calcScenarioFullTimeline(...)` — シナリオ比較
5. **丸め処理**: 全数値を小数1桁（千円単位）に丸める。
6. **スナップショット**: `expect(result).toMatchSnapshot()`。

5シナリオ × 約5種の呼び出し = 約25スナップショット。実行時間は**1分以内**を見込む。

---

## 5. スナップショット仕様

### 5.1 形式

Vitest 標準の `.snap` 形式（Jest互換）。人間が読める JavaScript モジュール形式で、`git diff` で差分が明確に見える。

### 5.2 数値精度

- **丸め単位**: 小数1桁（千円単位）
- 実装: 出力直前に全数値を `Math.round(v * 10) / 10` で丸める
- 理由: アプリ表示が万円単位（整数〜小数1桁）のため、ユーザーに見えないレベルの変動を検知しても運用コストに見合わない

### 5.3 スナップショット例（数値は説明用のダミー）

```
exports[`シナリオA 田中葵 > calcIntegratedSim`] = `
{
  "years": 64,
  "timeline": [
    { "year": 2026, "age": 26, "income": 360.0, "expense": 216.0, "totalAssets": 150.5 },
    { "year": 2027, "age": 27, "income": 372.1, "expense": 220.3, "totalAssets": 312.4 },
    ...
  ]
}
`;
```

### 5.4 Git管理

- `.snap` ファイルは **git commit 対象**
- 差分レビューで「どの年のどの値がいくつからいくつに変わったか」が可視化される

---

## 6. 更新ポリシー

### 6.1 テストが赤くなった時の判断フロー

```
スナップショット不一致
  │
  ├─ 意図しない変更だった
  │    → バグ。コードを修正してテストを通す。スナップショットは更新しない。
  │
  └─ 意図した変更だった（仕様変更・係数改善・UI改善に伴う表示精度変更など）
       → `git diff test/__snapshots__/` で差分を目視確認
       → 問題なければ `npm run test:update` で更新
       → 更新されたスナップショットを commit（変更理由をコミットメッセージに明記）
```

### 6.2 禁止事項

- 自動更新（CI での `-u` など）は行わない。意図しない変更を検知できなくなる。
- 差分を確認せずにスナップショットを更新することは避ける。

### 6.3 package.json スクリプト

```json
{
  "scripts": {
    "test": "vitest run",
    "test:snap": "vitest run test/scenario-snapshot.test.js",
    "test:update": "vitest run -u"
  }
}
```

---

## 7. スコープ境界

### 7.1 Phase 1 でやること

- Playwright セットアップ（`npm install playwright` + `npx playwright install chromium`）
- `test/helpers/playwright-runner.js` 実装：ブラウザライフサイクル管理・JSON注入・関数呼び出しの共通化
- `test/scenario-snapshot.test.js` 実装：5シナリオ × 計算呼び出しのスナップショットテスト
- 既存 Vitest（128件）との並走確認
- `CLAUDE.md` への運用手順追記

### 7.2 Phase 1 でやらないこと

- `samples/01〜10/` の10ペルソナをテスト対象に含めること（Phase 1 完了後の拡張）
- 支出管理アプリ（`spending/`）のテスト（別トラック）
- CI 設定（GitHub Actions 等）— ローカル実行で十分
- **計算ロジックの中身の修正**（Phase 2 で独立参照実装と突合してから判断）

---

## 8. 成功基準

1. **既存テスト非破壊**: `npm run test` で従来の 128件 + 新規スナップショットがすべてグリーン
2. **検知力の実証**: 計算に影響する定数（例: `effectiveReturn` の `TAX_RATE` 0.20315）を試しに変更すると、該当シナリオのスナップショットが赤くなることを1回確認する
3. **差分可読性**: `git diff test/__snapshots__/` で「どのシナリオ・どの年・どの値が何から何に変わったか」が読める状態

---

## 9. 既知のリスクと対処

| # | リスク | 対処 |
|---|--------|------|
| 1 | Playwright のブラウザ未インストールで環境依存エラー | README と CLAUDE.md に `npx playwright install chromium` を明記 |
| 2 | `index.html` の初期化タイミングで計算関数が未定義 | `page.waitForFunction(() => typeof calcIntegratedSim === 'function')` で待機 |
| 3 | `Date.now()` / `new Date().getFullYear()` 依存で非決定性 | 初回実行時に挙動を確認。必要なら `page.addInitScript` で Date をモック |
| 4 | `calcIntegratedSim` 等が `state` グローバルに依存 | `importData()` で state を確立してから計算関数を呼ぶ |
| 5 | `page.evaluate` で関数を経由した戻り値にシリアライズ不可能な値が含まれる | 戻り値は丸め済みプレーンオブジェクト化してから返す |
| 6 | Playwright 起動コストでテストが遅い | 5シナリオで1ブラウザを使い回す（ページリロードで state 切替） |
| 7 | サンプルデータJSONのキー名がスキーマと不一致 | 実装時に1シナリオ通してから残りを追加。検証ポイント含む |

---

## 10. Phase 2 / Phase 3 との接続

### Phase 2（次フェーズ）への橋渡し

- Phase 1 で作ったスナップショットは「現状の index.html の出力」を固定する。
- Phase 2 では Python（または Google Sheets）で独立した参照実装を作り、同じ5シナリオを投入。
- 年ごとの出力を突き合わせ、**ズレがあればどちらが正しいか検討**し、index.html 側にバグがあれば修正 → スナップショット更新。
- `simulation-verification.xlsx` を参照実装の出発点にできる。

### Phase 3 への橋渡し

- Phase 3 で計算ロジックを `index.html` から `calc/*.js` に分離する際、Phase 1 のスナップショットが**リファクタリングが等価であることの保証**になる。
- リファクタ前後でスナップショットが一切変わらないことが合格条件。

---

## 11. 実装順序（writing-plans スキルで詳細化）

以下は大枠の順序。各ステップは writing-plans スキル側で詳細化する。

1. Playwright 依存追加と初期動作確認（Chromium起動 → index.html表示）
2. `playwright-runner.js`：1シナリオを読み込んで `calcIntegratedSim` の結果を返すヘルパー完成
3. `scenario-snapshot.test.js`：シナリオA1件だけでスナップショット生成を成功させる
4. 残り4シナリオへ横展開
5. 出口戦略3パターン・シナリオ比較を出力に追加
6. 既存 Vitest との並走確認
7. `CLAUDE.md` 更新・動作確認用の意図的破壊テスト（成功基準2）
