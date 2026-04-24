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

// スナップショットが年越しで自動的にズレないよう、テスト時の「現在時刻」を固定する。
// 値を変更するとすべてのスナップショットを再生成する必要がある。
export const SIMULATION_FIXED_DATE = new Date('2026-04-24T00:00:00+09:00');

/**
 * ブラウザとコンテキストを起動。5シナリオで使い回すため、テストスイートの beforeAll で1回呼ぶ。
 */
export async function launchContext() {
  let browser;
  try {
    browser = await chromium.launch();
  } catch (err) {
    // Chromium 未インストール時のエラーメッセージを親切に置換。
    // Playwright の素のエラーは分かりづらいため、初回セットアップで詰まらないようにする。
    if (/Executable doesn't exist|browserType\.launch/i.test(String(err?.message ?? err))) {
      throw new Error(
        'Chromium が見つかりません。初回セットアップとして以下を実行してください:\n' +
        '  npx playwright install chromium\n' +
        '（元のエラー: ' + (err?.message ?? err) + '）'
      );
    }
    throw err;
  }
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

  // 「現在時刻」を固定。Date.now() や引数なしの new Date() が常に SIMULATION_FIXED_DATE を返す。
  // これがないと年越しで全シナリオのシミュレーション期間がズレ、スナップショットが一斉に赤くなる。
  await page.clock.setFixedTime(SIMULATION_FIXED_DATE);

  // file:// オリジンで localStorage が使えるよう、先に index.html をロードしてオリジンを確立。
  // その後 JSON を注入してリロードし、index.html の init 処理に state を復元させる。
  // （初回ロードはデフォルト state で走るため無駄だが、browser context を複数シナリオで
  //  使い回すため addInitScript ではなくこの方式を採る）
  await page.goto(INDEX_HTML_URL);
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
