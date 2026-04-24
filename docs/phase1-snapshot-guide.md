# 計算ロジック検証ガイド（Phase 1 スナップショットテスト）

ライフプランアプリの計算ロジックを本物のブラウザ上で実行し、年次シミュレーション出力をスナップショット化して、**意図しない数値変動を自動検知する安全網**です。

## 概要

`test/scenario-snapshot.test.js` が Playwright で `index.html` をヘッドレスブラウザ上にロードし、`sample_data/*.json` の5シナリオについて以下の出力をスナップショット化しています。

- `calcIntegratedSim` — 統合シミュレーション（年次キャッシュフロー・資産推移）
- `calcRetirementSimWithOpts` — 出口戦略（標準・楽観・悲観の3パターン）
- `calcScenarioFullTimeline` — シナリオ比較（`getAdaptiveScenarios` の各パターン）

計 **5シナリオ × 5出力 = 25スナップショット**。スナップショットは `test/__snapshots__/scenario-snapshot.test.js.snap` に git管理下で保存されています。

時刻は `test/helpers/playwright-runner.js` の `SIMULATION_FIXED_DATE`（2026-04-24）に固定されており、年越しでスナップショットが自動的にズレないようになっています。

## コマンド

```bash
# 全テスト実行（既存ユニット128件 + スナップショット含む155件）
npm test

# スナップショットテストのみ実行
npm run test:snap

# スナップショット更新（意図した変更を承認するとき）
npm run test:update
```

## スナップショットが赤くなった時

1. **意図しない変更だった** → バグです。コードを修正してテストを通す。**スナップショットは更新しない**。
2. **意図した変更だった**（仕様変更・係数改善など）
   - `git diff test/__snapshots__/` で差分を目視確認
   - 差分に問題なければ `npm run test:update` で更新
   - 変更理由をコミットメッセージに明記してコミット

## 初回セットアップ

別マシン・別クローンでセットアップする時：

```bash
npm install
npx playwright install chromium
npm test
```

## 禁止事項

- **自動更新（CI での `-u` など）はしない**。意図しない変更を検知できなくなり、安全網の意味がなくなる。
- **差分を確認せずにスナップショットを更新しない**。「赤くなったから更新」は事故の元。

## シナリオを追加したい

1. `sample_data/` に新しい JSONファイルを追加
2. `test/scenario-snapshot.test.js` の `SCENARIOS` 配列に1行追加
   ```javascript
   { key: 'F', label: 'シナリオF 新しい人', file: 'シナリオF_...json' },
   ```
3. `npm run test:update` でスナップショット生成
4. 生成されたスナップショットを目視確認（数値が妥当か）してからコミット

### ⚠️ `samples/01〜10/` を使いたい場合

`samples/` ディレクトリには10ペルソナ分のテスト用データがあるが、Phase 1 では**未接続**。
`sample_data/` の単一JSON形式と異なり、`samples/` は `lifeplan_v1.json` / `spending_v1.json` /
`profile.json` などに分割されている。追加する場合は `samples/*/lifeplan_v1.json` だけを
読み込んで `SCENARIOS` に登録すれば Phase 1 の仕組みで動く。

## 検知力の確認方法

スナップショットが実際に計算変更を捕まえるかを確認したい場合：

1. `index.html` の計算定数（例: `TAX_RATE = 0.20315`）を一時的に変える
2. `npm run test:snap` を実行 → 赤くなることを確認（実証済み：TAX_RATE 変更で25件全件検知）
3. 変更を戻す → `npm run test:snap` でグリーンに戻ることを確認
4. コミットはしない（検知力の確認のみ）

## 関連ドキュメント

- 設計書: `docs/superpowers/specs/2026-04-24-phase1-scenario-snapshot-tests-design.md`
- 実装計画: `docs/superpowers/plans/2026-04-24-phase1-scenario-snapshot-tests.md`

## Phase 2 / Phase 3 との関係

- **Phase 2（予定）**: Python 等で独立参照実装を作り、同じ5シナリオでの出力を突合。「現状の計算が正しいか」を検証する。Phase 1 のスナップショットは Phase 2 の検証結果を受けて更新される可能性がある。
- **Phase 3（予定）**: 計算ロジックを `index.html` から別ファイルに切り出す大型リファクタリング。Phase 1 のスナップショットが「リファクタ前後で等価であること」の保証になる。
