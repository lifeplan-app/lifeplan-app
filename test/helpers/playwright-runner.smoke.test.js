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
