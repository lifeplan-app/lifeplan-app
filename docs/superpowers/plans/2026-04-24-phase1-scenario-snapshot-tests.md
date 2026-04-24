# Phase 1 シナリオ・ゴールデンスナップショット・テスト 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ライフプランアプリの計算ロジックを本物のブラウザ上で実行し、5シナリオ分の年次シミュレーション出力をスナップショット化して、意図しない数値変動を自動検知する安全網を構築する。

**Architecture:** Playwright で Chromium を起動し `file://` で `index.html` をロード。`localStorage['lifeplan_v1']` にサンプルシナリオJSONを注入して初期化後、`window.calcIntegratedSim` / `calcRetirementSimWithOpts` / `calcScenarioFullTimeline` を `page.evaluate` で呼び出す。戻り値を小数1桁に丸めて Vitest の `toMatchSnapshot()` で固定化する。

**Tech Stack:** Vitest 2.x（既存）, Playwright 1.x（新規追加）, Node.js 24（nvm経由）

**基準設計書:** `docs/superpowers/specs/2026-04-24-phase1-scenario-snapshot-tests-design.md`

**リポジトリ:** `/Users/nagatohiroki/ライフプランアプリ/`（main ブランチ直接作業・worktreeは使わない）

**⚠️ 重要な前提:**
- 本プロジェクトのパスには日本語（`ライフプランアプリ`）が含まれる。シェルコマンドでは必ず**ダブルクォートで囲む**こと。
- `node` / `npm` は PATH に載っていない。各 Bash コマンドの前に **`source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 &&`** を付ける必要がある。各ステップに記載済み。

---

## File Structure

### 新規作成

| パス | 責務 |
|------|------|
| `test/helpers/playwright-runner.js` | ブラウザライフサイクル・ページロード・シナリオ注入・計算関数呼び出しのプリミティブ |
| `test/scenario-snapshot.test.js` | 5シナリオ × 4種の出力をスナップショット化するテスト本体 |
| `test/__snapshots__/scenario-snapshot.test.js.snap` | Vitest が初回実行時に自動生成 |

### 変更

| パス | 変更内容 |
|------|----------|
| `package.json` | `playwright` を devDependencies に追加、`test:snap` / `test:update` スクリプト追加 |
| `CLAUDE.md` | 「計算ロジック検証ルール」セクションを末尾に追加 |

### 変更しない（重要）

- `index.html` — 計算ロジックは一切変更しない
- `test/helpers/core.js` と既存 Vitest 5ファイル — 並走
- `sample_data/*.json` — 読み取り専用で使用

---

## Task 1: Playwrightセットアップと動作確認

**Files:**
- Modify: `package.json`

**狙い:** `playwright` npm パッケージと Chromium バイナリをインストールし、ブラウザから `index.html` が開けることを手動で確認する。これが通らないと以降の全タスクが動かない。

- [ ] **Step 1: 現在の package.json を確認**

Run:
```bash
cat "/Users/nagatohiroki/ライフプランアプリ/package.json"
```
Expected: `devDependencies` に `fast-check` と `vitest` のみ。`playwright` は未インストール。

- [ ] **Step 2: playwright をインストール**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npm install --save-dev playwright@^1.48.0
```
Expected: インストール成功。`package.json` の `devDependencies` に `"playwright"` が追加される。

- [ ] **Step 3: Chromium バイナリをインストール**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npx playwright install chromium
```
Expected: Chromium ダウンロード完了メッセージ（既にキャッシュがあれば "already installed"）。

- [ ] **Step 4: 動作確認用のワンライナーを実行**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && node -e "
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + process.cwd() + '/index.html');
  await page.waitForFunction(() => typeof calcIntegratedSim === 'function', { timeout: 10000 });
  const ok = await page.evaluate(() => typeof calcIntegratedSim === 'function' && typeof calcRetirementSimWithOpts === 'function');
  console.log('calc functions available:', ok);
  await browser.close();
})();
"
```
Expected: `calc functions available: true`。他のエラーが出る場合は原因調査（CSP・パス・初期化タイミング）。

- [ ] **Step 5: package.json にテストスクリプトを追加**

`package.json` を以下の内容で更新：

```json
{
  "name": "lifeplan-app",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:snap": "vitest run test/scenario-snapshot.test.js",
    "test:update": "vitest run -u"
  },
  "devDependencies": {
    "fast-check": "^4.6.0",
    "playwright": "^1.48.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 6: 既存テスト（128件）が壊れていないことを確認**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npm test
```
Expected: 既存の5ファイル・128テストがすべてグリーン。

- [ ] **Step 7: コミット**

Run:
```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add package.json package-lock.json && git commit -m "chore: add playwright for scenario snapshot tests"
```

---

## Task 2: playwright-runner.js（ブラウザ制御ヘルパー）

**Files:**
- Create: `test/helpers/playwright-runner.js`

**狙い:** テスト本体が何度も書かずに済むよう、ブラウザ起動・ページロード・シナリオJSON注入・計算関数呼び出しを共通化する。**5シナリオで1ブラウザを使い回す**ために、起動/終了を別関数にする。

- [ ] **Step 1: ヘルパーファイルを作成**

Create `test/helpers/playwright-runner.js` with exactly this content:

```javascript
/**
 * test/helpers/playwright-runner.js
 *
 * Playwright Chromium を起動し、file:// 経由で index.html をロード。
 * sample_data/*.json を localStorage['lifeplan_v1'] に注入して、
 * window の計算関数を呼ぶためのプリミティブ群。
 *
 * 使い方:
 *   const ctx = await launchContext();
 *   const page = await loadAppWithScenario(ctx, scenarioJsonString);
 *   const result = await page.evaluate(() => calcIntegratedSim(30));
 *   await closeContext(ctx);
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// プロジェクトルート（test/helpers/ の2つ上）
const PROJECT_ROOT = resolve(__dirname, '..', '..');
const INDEX_HTML_URL = 'file://' + resolve(PROJECT_ROOT, 'index.html');

/**
 * ブラウザとコンテキストを起動。5シナリオで使い回すため、テストスイートの beforeAll で1回呼ぶ。
 */
export async function launchContext() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  return { browser, context };
}

export async function closeContext(ctx) {
  await ctx.context.close();
  await ctx.browser.close();
}

/**
 * 新しい page を開き、シナリオJSONを localStorage に事前注入してから index.html を読み込む。
 * state の復元は index.html の初期化処理が自動で行う。
 *
 * @param {{browser, context}} ctx launchContext() の戻り値
 * @param {string} scenarioJson JSON 文字列（sample_data/*.json の中身）
 * @returns {Promise<import('playwright').Page>}
 */
export async function loadAppWithScenario(ctx, scenarioJson) {
  const page = await ctx.context.newPage();

  // addInitScript は page 上で実行される最初のスクリプト前に走る。
  // about:blank に行ってから goto することで、localStorage のオリジンを index.html に合わせる。
  await page.goto(INDEX_HTML_URL);
  // 一度ロードしてオリジンを確立 → localStorage に注入 → 再ロード
  await page.evaluate((json) => {
    localStorage.setItem('lifeplan_v1', json);
  }, scenarioJson);
  await page.reload();

  // 計算関数が定義されるまで待つ
  await page.waitForFunction(
    () => typeof calcIntegratedSim === 'function'
       && typeof calcRetirementSimWithOpts === 'function'
       && typeof calcScenarioFullTimeline === 'function'
       && typeof getAdaptiveScenarios === 'function'
       && typeof state !== 'undefined'
       && state.profile
       && state.profile.birth,
    { timeout: 15000 }
  );

  return page;
}

/**
 * 再帰的に数値を小数1桁に丸める。スナップショット比較で浮動小数の揺らぎを吸収するため。
 * null/undefined/非数値はそのまま返す。
 */
export function roundDeep(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'number') {
    if (!Number.isFinite(obj)) return obj;
    return Math.round(obj * 10) / 10;
  }
  if (Array.isArray(obj)) return obj.map(roundDeep);
  if (typeof obj === 'object') {
    const out = {};
    for (const k of Object.keys(obj)) out[k] = roundDeep(obj[k]);
    return out;
  }
  return obj;
}
```

- [ ] **Step 2: ヘルパー単体の smoke test を作成**

Create `test/helpers/playwright-runner.smoke.test.js` with:

```javascript
/**
 * playwright-runner.js のヘルパーが動くかの最小確認。
 * 本番シナリオの検証はしない（それは scenario-snapshot.test.js の責務）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchContext, closeContext, loadAppWithScenario, roundDeep } from './playwright-runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCENARIO_A_PATH = resolve(__dirname, '..', '..', 'sample_data', 'シナリオA_26歳独身奨学金返済中.json');

describe('playwright-runner smoke', () => {
  let ctx;

  beforeAll(async () => {
    ctx = await launchContext();
  }, 60_000);

  afterAll(async () => {
    if (ctx) await closeContext(ctx);
  });

  it('roundDeep で数値を小数1桁に丸める', () => {
    expect(roundDeep(1.234567)).toBe(1.2);
    expect(roundDeep({ a: 1.25, b: [2.777, 3] })).toEqual({ a: 1.3, b: [2.8, 3] });
    expect(roundDeep(null)).toBe(null);
    expect(roundDeep('text')).toBe('text');
  });

  it('シナリオAをロードして state が注入される', async () => {
    const json = readFileSync(SCENARIO_A_PATH, 'utf8');
    const page = await loadAppWithScenario(ctx, json);
    const name = await page.evaluate(() => state.profile?.name);
    expect(name).toBe('田中 葵');
    await page.close();
  }, 30_000);
});
```

- [ ] **Step 3: smoke test を実行**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npx vitest run test/helpers/playwright-runner.smoke.test.js
```
Expected: 2テストがグリーン。失敗した場合：
- パス関連のエラー → `INDEX_HTML_URL` のパスを確認
- `state.profile.name` が undefined → 注入タイミングまたは初期化処理の問題。`page.waitForFunction` の条件を強化

- [ ] **Step 4: 既存テスト全体が壊れていないことも確認**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npm test
```
Expected: 既存128 + smoke 2 = 130テストグリーン。

- [ ] **Step 5: コミット**

Run:
```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add test/helpers/playwright-runner.js test/helpers/playwright-runner.smoke.test.js && git commit -m "test: add playwright helper for scenario loading"
```

---

## Task 3: シナリオA × calcIntegratedSim のスナップショット（最初の1件）

**Files:**
- Create: `test/scenario-snapshot.test.js`

**狙い:** 仕組みを1シナリオ・1出力で成立させる。ここで構造が固まれば残りは単純な追加作業になる。

- [ ] **Step 1: 最小のテストファイルを作成（シナリオA × calcIntegratedSim のみ）**

Create `test/scenario-snapshot.test.js` with:

```javascript
/**
 * scenario-snapshot.test.js
 *
 * 本物の index.html を Playwright Chromium 上で実行し、
 * sample_data/*.json を入力として計算関数の出力をスナップショット化する。
 *
 * 【運用】
 *  - 意図しない差分 → バグ。コードを直してテストを通す。
 *  - 意図した差分 → `npm run test:update` で更新し、commit メッセージに理由を明記。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  launchContext,
  closeContext,
  loadAppWithScenario,
  roundDeep,
} from './helpers/playwright-runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SAMPLE_DIR = resolve(__dirname, '..', 'sample_data');

const SCENARIOS = [
  { key: 'A', label: 'シナリオA 田中葵', file: 'シナリオA_26歳独身奨学金返済中.json' },
];

describe('scenario snapshots', () => {
  let ctx;

  beforeAll(async () => {
    ctx = await launchContext();
  }, 60_000);

  afterAll(async () => {
    if (ctx) await closeContext(ctx);
  });

  for (const sc of SCENARIOS) {
    describe(sc.label, () => {
      let page;

      beforeAll(async () => {
        const json = readFileSync(resolve(SAMPLE_DIR, sc.file), 'utf8');
        page = await loadAppWithScenario(ctx, json);
      }, 30_000);

      afterAll(async () => {
        if (page) await page.close();
      });

      it('calcIntegratedSim', async () => {
        const result = await page.evaluate(() => {
          const years = (state.finance?.simYears) || null;
          // simYears が無ければ「現在年齢→90歳」まで
          const age = (() => {
            const b = state.profile?.birth;
            if (!b) return 30;
            const diff = new Date().getFullYear() - new Date(b).getFullYear();
            return Math.max(1, 90 - diff);
          })();
          return calcIntegratedSim(years || age);
        });
        expect(roundDeep(result)).toMatchSnapshot();
      }, 30_000);
    });
  }
});
```

- [ ] **Step 2: 初回実行（スナップショットを生成）**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npm run test:snap
```
Expected: テストがグリーン。`test/__snapshots__/scenario-snapshot.test.js.snap` が生成される。

- [ ] **Step 3: 生成されたスナップショットを目視確認**

Run:
```bash
cat "/Users/nagatohiroki/ライフプランアプリ/test/__snapshots__/scenario-snapshot.test.js.snap"
```
Expected:
- `シナリオA 田中葵 > calcIntegratedSim` のエントリが存在
- 年次の `totalWealth` などの数値が小数1桁で記録されている
- 年数が ～64年分（26歳→90歳）程度ある

もし数値が明らかにおかしい（全部0、負の巨大値など）→ シナリオ注入の問題。page.evaluate 内で `state.assets.length` などを追加出力してデバッグ。

- [ ] **Step 4: 再実行して安定性を確認**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npm run test:snap
```
Expected: 再実行でもグリーン。同じ値が出る（非決定性がないことを確認）。

- [ ] **Step 5: 既存テスト全体グリーン確認**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npm test
```
Expected: 既存128 + smoke 2 + scenario-snapshot 1 = 131テストグリーン。

- [ ] **Step 6: コミット**

Run:
```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add test/scenario-snapshot.test.js "test/__snapshots__/scenario-snapshot.test.js.snap" && git commit -m "test: add scenario A snapshot for calcIntegratedSim"
```

---

## Task 4: 残り4シナリオ（B・C・D・E）を追加

**Files:**
- Modify: `test/scenario-snapshot.test.js`

**狙い:** 仕組みは Task 3 で確立済み。シナリオ配列を拡張するだけ。

- [ ] **Step 1: SCENARIOS 配列を拡張**

`test/scenario-snapshot.test.js` の `SCENARIOS` 定数を以下に差し替え：

```javascript
const SCENARIOS = [
  { key: 'A', label: 'シナリオA 田中葵 26歳独身',      file: 'シナリオA_26歳独身奨学金返済中.json' },
  { key: 'B', label: 'シナリオB 鈴木健太 35歳共働き',   file: 'シナリオB_35歳共働き夫婦子1人住宅ローン.json' },
  { key: 'C', label: 'シナリオC 山本誠 45歳FIRE目標',   file: 'シナリオC_45歳高収入FIRE目標子2人.json' },
  { key: 'D', label: 'シナリオD 中村博 55歳老後準備',   file: 'シナリオD_55歳老後準備期奨学金残あり.json' },
  { key: 'E', label: 'シナリオE 林菜緒 38歳シングル',   file: 'シナリオE_38歳シングルマザー賃貸奨学金返済中.json' },
];
```

- [ ] **Step 2: 初回実行でスナップショット生成**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npm run test:snap
```
Expected: 5テストすべてグリーン。`.snap` ファイルに5シナリオ分のエントリが追加される。

- [ ] **Step 3: スナップショットの件数確認**

Run:
```bash
grep -c "^exports\[" "/Users/nagatohiroki/ライフプランアプリ/test/__snapshots__/scenario-snapshot.test.js.snap"
```
Expected: `5`（5シナリオ × 1種の出力）

- [ ] **Step 4: 再実行で安定性確認**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npm run test:snap
```
Expected: すべてグリーン・差分なし。

- [ ] **Step 5: コミット**

Run:
```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add test/scenario-snapshot.test.js "test/__snapshots__/scenario-snapshot.test.js.snap" && git commit -m "test: add scenarios B-E snapshots for calcIntegratedSim"
```

---

## Task 5: 出口戦略（標準・楽観・悲観）をスナップショットに追加

**Files:**
- Modify: `test/scenario-snapshot.test.js`

**狙い:** `calcRetirementSimWithOpts` の3パターン（標準・楽観・悲観）を全シナリオで実行。`renderScenarioComparison` が本番で呼び出す3パターンと同じオプションを使う。

- [ ] **Step 1: 各シナリオの describe 内に3つのテストを追加**

`test/scenario-snapshot.test.js` の各シナリオ内、`it('calcIntegratedSim', ...)` の後に以下を追加：

```javascript
      it('calcRetirementSimWithOpts 標準', async () => {
        const result = await page.evaluate(() => calcRetirementSimWithOpts({}));
        expect(roundDeep(result)).toMatchSnapshot();
      }, 30_000);

      it('calcRetirementSimWithOpts 楽観', async () => {
        const result = await page.evaluate(() =>
          calcRetirementSimWithOpts({ returnMod: +0.01, expenseMod: -0.10, pensionMod: 0 })
        );
        expect(roundDeep(result)).toMatchSnapshot();
      }, 30_000);

      it('calcRetirementSimWithOpts 悲観', async () => {
        const result = await page.evaluate(() =>
          calcRetirementSimWithOpts({ returnMod: -0.01, expenseMod: +0.10, pensionMod: -0.15 })
        );
        expect(roundDeep(result)).toMatchSnapshot();
      }, 30_000);
```

- [ ] **Step 2: 初回実行**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npm run test:snap
```
Expected: 5シナリオ × 4テスト = 20件グリーン。

**注意**: シナリオによっては `state.retirement` が未設定で `calcRetirementSimWithOpts` が `null` を返す場合がある。その場合はスナップショットに `null` が記録されれば OK（検知能力は維持される）。テストが失敗する場合は `state.retirement` 相当が無いことが原因なのでスナップショットが `null` を固定するだけでよい。

- [ ] **Step 3: スナップショット内容を目視確認**

Run:
```bash
grep -c "^exports\[" "/Users/nagatohiroki/ライフプランアプリ/test/__snapshots__/scenario-snapshot.test.js.snap"
```
Expected: `20`

- [ ] **Step 4: 再実行で安定性確認**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npm run test:snap
```
Expected: すべてグリーン、差分なし。

- [ ] **Step 5: コミット**

Run:
```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add test/scenario-snapshot.test.js "test/__snapshots__/scenario-snapshot.test.js.snap" && git commit -m "test: add retirement scenarios (standard/optimistic/pessimistic) to snapshot"
```

---

## Task 6: シナリオ比較（calcScenarioFullTimeline）をスナップショットに追加

**Files:**
- Modify: `test/scenario-snapshot.test.js`

**狙い:** `calcScenarioFullTimeline` は `getAdaptiveScenarios()` が生成する各シナリオについて計算する。本番で `renderScenarioChart` が使う経路と同じ入力で固定化する。

- [ ] **Step 1: 各シナリオの describe 内に1テスト追加**

`test/scenario-snapshot.test.js` の各シナリオ内、Task 5 で追加した3テストの後に以下を追加：

```javascript
      it('calcScenarioFullTimeline (getAdaptiveScenarios 各パターン)', async () => {
        const result = await page.evaluate(() => {
          const scenarios = getAdaptiveScenarios();
          return scenarios.map(sc => ({
            name: sc.name || null,
            retireAge: sc.retireAge ?? null,
            monthlyExpense: sc.monthlyExpense ?? null,
            returnMod: sc.returnMod ?? null,
            timeline: calcScenarioFullTimeline(sc),
          }));
        });
        expect(roundDeep(result)).toMatchSnapshot();
      }, 30_000);
```

- [ ] **Step 2: 初回実行**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npm run test:snap
```
Expected: 5シナリオ × 5テスト = 25件グリーン。

- [ ] **Step 3: スナップショット件数確認**

Run:
```bash
grep -c "^exports\[" "/Users/nagatohiroki/ライフプランアプリ/test/__snapshots__/scenario-snapshot.test.js.snap"
```
Expected: `25`

- [ ] **Step 4: 全テスト（既存含む）グリーン確認**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npm test
```
Expected: 既存128 + smoke 2 + scenario 25 = 155テストグリーン。

- [ ] **Step 5: コミット**

Run:
```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add test/scenario-snapshot.test.js "test/__snapshots__/scenario-snapshot.test.js.snap" && git commit -m "test: add scenario comparison (calcScenarioFullTimeline) snapshots"
```

---

## Task 7: 検知力の実証テスト（わざと壊して赤くなることを確認）

**Files:**
- 一時的変更: `index.html`（Step 4 で revert）

**狙い:** スナップショットテストが本当に計算ロジック変更を検知することを、意図的に破壊して確認する。設計書「成功基準2」に対応。

- [ ] **Step 1: 現在の index.html を退避**

Run:
```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && cp index.html /tmp/index.html.backup
```

- [ ] **Step 2: TAX_RATE を一時的に改変**

`index.html` 内の `TAX_RATE` 定義を探して改変する。

Run:
```bash
grep -n "const TAX_RATE" "/Users/nagatohiroki/ライフプランアプリ/index.html"
```
Expected: 行番号が表示される。

その行の値を `0.20315` から `0.25` に Edit ツールで変更する（例: `const TAX_RATE = 0.20315;` → `const TAX_RATE = 0.25;`）。

- [ ] **Step 3: テストが赤くなることを確認**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npm run test:snap
```
Expected: **少なくとも 1件以上のシナリオで赤**（課税対象資産を持つシナリオ = A〜E すべて該当するはず）。差分メッセージに `totalWealth` や `endAssets` の数値が変わっている旨が表示される。

もし全グリーンなら → スナップショットが本質的な数値を捕まえていない。対象出力を見直す必要あり。

- [ ] **Step 4: index.html を復元**

Run:
```bash
cp /tmp/index.html.backup "/Users/nagatohiroki/ライフプランアプリ/index.html"
```

- [ ] **Step 5: 復元後にグリーンに戻ることを確認**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npm run test:snap
```
Expected: すべてグリーン。

- [ ] **Step 6: git 差分が無いことを確認**

Run:
```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git status --short
```
Expected: `index.html` の変更が無い（バックアップから復元できている）。

- [ ] **Step 7: バックアップ削除**

Run:
```bash
rm /tmp/index.html.backup
```

（コミット不要・検知力の確認だけが目的）

---

## Task 8: CLAUDE.md に運用手順を追記

**Files:**
- Modify: `CLAUDE.md`

**狙い:** 将来の自分やAIアシスタントが「スナップショットが赤くなった時どうするか」「新しいシナリオ追加はどうするか」を迷わず進められるドキュメントを残す。

- [ ] **Step 1: CLAUDE.md の末尾に「計算ロジック検証ルール」セクションを追加**

`CLAUDE.md` の末尾（既存の「開発ルール」セクションの後）に以下を追記：

```markdown

---

# 計算ロジック検証ルール（Phase 1 スナップショットテスト）

## 概要

`test/scenario-snapshot.test.js` が本物の `index.html` を Playwright で実行し、
`sample_data/*.json` の5シナリオについて以下の出力をスナップショット化している。

- `calcIntegratedSim`（統合シミュレーション）
- `calcRetirementSimWithOpts`（出口戦略：標準・楽観・悲観）
- `calcScenarioFullTimeline`（シナリオ比較）

## コマンド

```bash
# 全テスト実行（既存ユニット + スナップショット）
npm test

# スナップショットテストのみ実行
npm run test:snap

# スナップショット更新（意図した変更を承認するとき）
npm run test:update
```

## スナップショットが赤くなった時

1. **意図しない変更だった** → バグ。コードを修正してテストを通す。スナップショットは更新しない。
2. **意図した変更だった**（仕様変更・係数改善など）
   - `git diff test/__snapshots__/` で差分を目視確認
   - 問題なければ `npm run test:update` で更新
   - 変更理由をコミットメッセージに明記してコミット

## 初回セットアップ

別マシンでセットアップする時：
```bash
npm install
npx playwright install chromium
npm test
```

## 禁止事項

- 自動更新（CI での `-u` など）はしない。意図しない変更を検知できなくなる。
- 差分を確認せずにスナップショットを更新しない。

## シナリオを追加したい

1. `sample_data/` に新しい JSONファイルを追加
2. `test/scenario-snapshot.test.js` の `SCENARIOS` 配列に1行追加
3. `npm run test:update` でスナップショット生成
4. 生成されたスナップショットを目視確認してからコミット
```

- [ ] **Step 2: 追記が正しく反映されたか確認**

Run:
```bash
tail -50 "/Users/nagatohiroki/ライフプランアプリ/CLAUDE.md"
```
Expected: 「計算ロジック検証ルール」セクションが末尾にある。

- [ ] **Step 3: コミット**

Run:
```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git add CLAUDE.md && git commit -m "docs: add snapshot test usage to CLAUDE.md"
```

---

## Task 9: 最終検証

**Files:** なし（確認のみ）

**狙い:** 全タスク完了後、設計書「成功基準」の3項目を満たしていることを確認する。

- [ ] **Step 1: 全テストグリーンを確認（成功基準1）**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use default >/dev/null 2>&1 && cd "/Users/nagatohiroki/ライフプランアプリ" && npm test
```
Expected: `Test Files` に 7〜8ファイル、`Tests` が 155件前後（既存128 + smoke 2 + scenario 25）すべてグリーン。

- [ ] **Step 2: スナップショットの可読性確認（成功基準3）**

Run:
```bash
head -50 "/Users/nagatohiroki/ライフプランアプリ/test/__snapshots__/scenario-snapshot.test.js.snap"
```
Expected: 年ごとの数値（`totalWealth`, `endAssets` 等）が小数1桁で並んでおり、シナリオ名・出力種別が識別できる。

- [ ] **Step 3: git ログの確認**

Run:
```bash
cd "/Users/nagatohiroki/ライフプランアプリ" && git log --oneline -10
```
Expected: 以下のようなコミットが上から順に並ぶ：
1. `docs: add snapshot test usage to CLAUDE.md`
2. `test: add scenario comparison (calcScenarioFullTimeline) snapshots`
3. `test: add retirement scenarios (standard/optimistic/pessimistic) to snapshot`
4. `test: add scenarios B-E snapshots for calcIntegratedSim`
5. `test: add scenario A snapshot for calcIntegratedSim`
6. `test: add playwright helper for scenario loading`
7. `chore: add playwright for scenario snapshot tests`

- [ ] **Step 4: Phase 2 への引き継ぎメモをコンソールに表示**

```text
Phase 1 完了。Phase 2（独立参照実装との突合）に進む準備ができました。

次のフェーズでは：
  - Python または Google Sheets で年次シミュレーターを独立実装
  - 同じ5シナリオJSONを入力にして出力を比較
  - ズレがあればどちらが正しいか検討・index.html側にバグがあれば修正
  - simulation-verification.xlsx を参照実装の出発点に

また、Phase 1 の拡張として samples/01〜10/ の10ペルソナをスナップショット対象に
追加することも可能（SCENARIOS 配列への追加のみで完了）。
```

---

## 完了条件のまとめ

- [ ] すべての Task 1〜9 が完了
- [ ] `npm test` で 155件前後のテストがグリーン
- [ ] `test/__snapshots__/scenario-snapshot.test.js.snap` が git管理下
- [ ] `CLAUDE.md` に運用ルールが記載
- [ ] TAX_RATE 改変テスト（Task 7）で赤化を確認済み
