// test/helpers/load-calc.js
// Phase 3 で抽出された calc/*.js を Node テスト用に sandbox へロードするヘルパー。
// vm.runInContext で classic script として評価するため、ブラウザ同様に
// 関数・定数は sandbox 直下（または sandbox.window 経由）に登録される。
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CALC_DIR = resolve(__dirname, '..', '..', 'calc');

// 複数ファイルが同じ global を共有するサンドボックス
const sandbox = {
  console,
  Math, Number, Object, Array, Set, Map, JSON, Date, Error,
  parseFloat, parseInt, isFinite, isNaN, NaN, Infinity,
  window: {},
  // index.html のグローバル変数のうち、抽出された計算関数が参照する最小限のもの。
  // utils.js の calcAge 系は state.profile.birth を使い、asset-growth.js の
  // calcAllAssetGrowth は state.finance?.simYears を使う（引数 fallback）。
  state: { profile: {}, finance: {} },
};
vm.createContext(sandbox);

export function loadCalc(filename) {
  const src = readFileSync(resolve(CALC_DIR, filename), 'utf8');
  vm.runInContext(src, sandbox, { filename });
}

export function getSandbox() {
  return sandbox;
}

export function loadCalcBundle(filenames) {
  for (const f of filenames) loadCalc(f);
  return sandbox;
}
