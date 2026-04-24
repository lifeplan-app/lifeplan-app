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
  { key: 'A', label: 'シナリオA 田中葵 26歳独身',      file: 'シナリオA_26歳独身奨学金返済中.json' },
  { key: 'B', label: 'シナリオB 鈴木健太 35歳共働き',   file: 'シナリオB_35歳共働き夫婦子1人住宅ローン.json' },
  { key: 'C', label: 'シナリオC 山本誠 45歳FIRE目標',   file: 'シナリオC_45歳高収入FIRE目標子2人.json' },
  { key: 'D', label: 'シナリオD 中村博 55歳老後準備',   file: 'シナリオD_55歳老後準備期奨学金残あり.json' },
  { key: 'E', label: 'シナリオE 林菜緒 38歳シングル',   file: 'シナリオE_38歳シングルマザー賃貸奨学金返済中.json' },
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
    });
  }
});
