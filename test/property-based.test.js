/**
 * test/property-based.test.js
 *
 * プロパティベーステスト（Property-Based Testing）
 * fast-check を使用して、calcAssetGrowth / calcAllAssetGrowth の
 * 数学的不変条件を大量のランダム入力で検証する。
 *
 * テストグループ:
 *   Group 1: 基本不変条件（Basic Invariants）
 *   Group 2: 目標値の上限保証（Target Cap Invariants）
 *   Group 3: 単調性（Monotonicity）
 *   Group 4: 資金保存則（Conservation Laws）
 *   Group 5: calcAllAssetGrowth の整合性
 */

import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { calcAssetGrowth, calcAllAssetGrowth } from './helpers/core.js';

// ─── Arbitrary（ランダム入力生成器）定義 ──────────────────────────────────────

/** 基本アセット（目標値なし）の Arbitrary */
const arbBasicAsset = fc.record({
  id:          fc.constant('a1'),
  type:        fc.constantFrom('cash', 'trust_sp500', 'other'),
  currentVal:  fc.double({ min: 0, max: 1000, noNaN: true }),
  monthly:     fc.double({ min: 0, max: 50,   noNaN: true }),
  annualReturn: fc.double({ min: -5, max: 20, noNaN: true }),
}).map(a => ({ ...a, targetVal: 0, targetVal2: 0 }));

/** 目標値付きアセットの Arbitrary */
const arbAssetWithTarget = fc.record({
  id:          fc.constant('a1'),
  type:        fc.constant('cash'),
  currentVal:  fc.double({ min: 0,   max: 500,  noNaN: true }),
  monthly:     fc.double({ min: 0.1, max: 50,   noNaN: true }),
  annualReturn: fc.double({ min: 0,  max: 10,   noNaN: true }),
  targetVal:   fc.double({ min: 50,  max: 2000, noNaN: true }),
}).map(a => ({ ...a, targetVal2: 0 }));

/** 年数の Arbitrary（1〜40年） */
const arbYears = fc.integer({ min: 1, max: 40 });

/** 現在年の固定値（テスト安定のため固定） */
const CURRENT_YEAR = 2025;

// ─── Group 1: 基本不変条件（Basic Invariants）─────────────────────────────────

describe('Group 1: 基本不変条件', () => {

  /**
   * プロパティ 1: 配列長の保証
   * values.length === years + 1
   * overflows.length === years + 1
   * overflows2.length === years + 1
   */
  it('P1: 配列長 = years + 1', () => {
    fc.assert(
      fc.property(arbBasicAsset, arbYears, (asset, years) => {
        const r = calcAssetGrowth(asset, years, [], CURRENT_YEAR);
        return (
          r.values.length    === years + 1 &&
          r.overflows.length === years + 1 &&
          r.overflows2.length === years + 1
        );
      }),
      { numRuns: 1000 }
    );
  });

  /**
   * プロパティ 2: 残高の非負保証
   * values[i] >= 0 for all i
   * 浮動小数点誤差を考慮して -0.001 を許容する
   */
  it('P2: 残高は常に非負（values[i] >= -0.001）', () => {
    fc.assert(
      fc.property(arbBasicAsset, arbYears, (asset, years) => {
        const r = calcAssetGrowth(asset, years, [], CURRENT_YEAR);
        return r.values.every(v => v >= -0.001);
      }),
      { numRuns: 1000 }
    );
  });

  /**
   * プロパティ 3: 初期値の一致
   * values[0] === currentVal（y=0 は現在時点の残高そのまま）
   */
  it('P3: values[0] === currentVal', () => {
    fc.assert(
      fc.property(arbBasicAsset, arbYears, (asset, years) => {
        const r = calcAssetGrowth(asset, years, [], CURRENT_YEAR);
        return Math.abs(r.values[0] - (asset.currentVal || 0)) < 0.001;
      }),
      { numRuns: 1000 }
    );
  });

  /**
   * プロパティ 4: 積立なし・利回り0 → 残高一定
   * monthly=0, annualReturn=0 のとき、毎年残高は currentVal のまま変化しない。
   * ただし calcAssetGrowth は Math.round(x * 10) / 10 で丸めるため、
   * 初期値も同様に丸めた値を基準として比較する。
   */
  it('P4: monthly=0, annualReturn=0 → 全期間残高一定', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1000, noNaN: true }),
        arbYears,
        (currentVal, years) => {
          const asset = { id: 'a1', type: 'cash', currentVal, monthly: 0, annualReturn: 0, targetVal: 0, targetVal2: 0 };
          const r = calcAssetGrowth(asset, years, [], CURRENT_YEAR);
          // values[0] は currentVal そのまま（丸めなし）。
          // values[1..years] は計算結果を Math.round(x*10)/10 で丸めた値になる。
          // よって比較基準は values[0]（= currentVal）ではなく、丸め後の値。
          // 積立・利回りなしなら values[i] = Math.round(values[i-1] * 10) / 10 のはずなので
          // 全要素が values[0] の「丸め後の値」に一致するか、わずかな誤差内かを確認する。
          const rounded = Math.round(currentVal * 10) / 10;
          // y=0 は currentVal そのまま（丸めなし）
          if (Math.abs(r.values[0] - currentVal) > 0.001) return false;
          // y>=1 は丸め後の値と一致する（変化しない）
          return r.values.slice(1).every(v => Math.abs(v - rounded) < 0.001);
        }
      ),
      { numRuns: 1000 }
    );
  });

  /**
   * プロパティ 5: 積立あり・利回り0・目標なし → 残高は単調増加
   * monthly > 0, annualReturn=0, targetVal=0 のとき、残高は毎年増加する
   */
  it('P5: monthly>0, annualReturn=0, targetVal=0 → 残高は単調増加', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1000, noNaN: true }),
        fc.double({ min: 0.01, max: 50, noNaN: true }),
        arbYears,
        (currentVal, monthly, years) => {
          const asset = { id: 'a1', type: 'cash', currentVal, monthly, annualReturn: 0, targetVal: 0, targetVal2: 0 };
          const r = calcAssetGrowth(asset, years, [], CURRENT_YEAR);
          for (let i = 1; i <= years; i++) {
            if (r.values[i] < r.values[i - 1] - 0.001) return false;
          }
          return true;
        }
      ),
      { numRuns: 1000 }
    );
  });
});

// ─── Group 2: 目標値の上限保証（Target Cap Invariants）──────────────────────

describe('Group 2: 目標値の上限保証', () => {

  /**
   * プロパティ 6: targetVal 上限
   * targetVal > 0 のとき、残高は targetVal を超えない
   * （初期値が既に targetVal 以上の場合を除く）
   */
  it('P6: targetVal > 0 → 残高は targetVal を超えない（初期値 < targetVal の場合）', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 200, noNaN: true }),
        fc.double({ min: 0.01, max: 20, noNaN: true }),
        fc.double({ min: 0, max: 10,   noNaN: true }),
        fc.double({ min: 300, max: 2000, noNaN: true }),
        arbYears,
        (currentVal, monthly, annualReturn, targetVal, years) => {
          // 初期値 < targetVal の場合のみテスト
          fc.pre(currentVal < targetVal);
          const asset = { id: 'a1', type: 'cash', currentVal, monthly, annualReturn, targetVal, targetVal2: 0 };
          const r = calcAssetGrowth(asset, years, [], CURRENT_YEAR);
          return r.values.every(v => v <= targetVal + 0.01);
        }
      ),
      { numRuns: 1000 }
    );
  });

  /**
   * プロパティ 7: targetVal2 上限
   * targetVal2 > 0 のとき、残高は targetVal2 を超えない
   */
  it('P7: targetVal2 > 0 → 残高は targetVal2 を超えない', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 100, noNaN: true }),
        fc.double({ min: 0.01, max: 20, noNaN: true }),
        fc.double({ min: 0, max: 10,   noNaN: true }),
        fc.double({ min: 200, max: 800, noNaN: true }),
        fc.double({ min: 900, max: 2000, noNaN: true }),
        arbYears,
        (currentVal, monthly, annualReturn, targetVal, targetVal2, years) => {
          // targetVal < targetVal2 を保証
          fc.pre(currentVal < targetVal && targetVal < targetVal2);
          const asset = { id: 'a1', type: 'cash', currentVal, monthly, annualReturn, targetVal, targetVal2 };
          const r = calcAssetGrowth(asset, years, [], CURRENT_YEAR);
          return r.values.every(v => v <= targetVal2 + 0.01);
        }
      ),
      { numRuns: 1000 }
    );
  });

  /**
   * プロパティ 8: overflow は非負
   * overflows[i] >= 0 and overflows2[i] >= 0 for all i
   */
  it('P8: overflows[i] >= -0.001, overflows2[i] >= -0.001 （常に非負）', () => {
    fc.assert(
      fc.property(arbAssetWithTarget, arbYears, (asset, years) => {
        const r = calcAssetGrowth(asset, years, [], CURRENT_YEAR);
        return (
          r.overflows.every(v => v >= -0.001) &&
          r.overflows2.every(v => v >= -0.001)
        );
      }),
      { numRuns: 1000 }
    );
  });

  /**
   * プロパティ 8b: 目標なしのアセットでも overflow は非負
   */
  it('P8b: 目標なしアセットの overflows も常に非負', () => {
    fc.assert(
      fc.property(arbBasicAsset, arbYears, (asset, years) => {
        const r = calcAssetGrowth(asset, years, [], CURRENT_YEAR);
        return (
          r.overflows.every(v => v >= -0.001) &&
          r.overflows2.every(v => v >= -0.001)
        );
      }),
      { numRuns: 1000 }
    );
  });
});

// ─── Group 3: 単調性（Monotonicity）─────────────────────────────────────────

describe('Group 3: 単調性', () => {

  /**
   * プロパティ 9: 積立増加 → 最終残高増加
   * monthly を増やすと最終残高は増加する（targetVal なし）
   * 同一条件で monthly1 < monthly2 のとき、最終残高 result1 <= result2
   */
  it('P9: monthly を増やすと最終残高は増加する（targetVal=0）', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 500, noNaN: true }),
        fc.double({ min: 0, max: 24,  noNaN: true }),
        fc.double({ min: 0, max: 10,  noNaN: true }),
        arbYears,
        (currentVal, monthly1, delta, years) => {
          const monthly2 = monthly1 + delta + 0.01; // monthly2 > monthly1 を保証
          const asset1 = { id: 'a1', type: 'cash', currentVal, monthly: monthly1, annualReturn: 0, targetVal: 0, targetVal2: 0 };
          const asset2 = { id: 'a1', type: 'cash', currentVal, monthly: monthly2, annualReturn: 0, targetVal: 0, targetVal2: 0 };
          const r1 = calcAssetGrowth(asset1, years, [], CURRENT_YEAR);
          const r2 = calcAssetGrowth(asset2, years, [], CURRENT_YEAR);
          // monthly2 > monthly1 → 最終残高 r2 >= r1
          return r2.values[years] >= r1.values[years] - 0.001;
        }
      ),
      { numRuns: 1000 }
    );
  });

  /**
   * プロパティ 10: 利回り増加 → 最終残高増加
   * annualReturn を増やすと最終残高は増加する（targetVal なし）
   */
  it('P10: annualReturn を増やすと最終残高は増加する（targetVal=0）', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 500, noNaN: true }),
        fc.double({ min: 0, max: 20,  noNaN: true }),
        fc.double({ min: 0, max: 5,   noNaN: true }),
        arbYears,
        (currentVal, return1, delta, years) => {
          const return2 = return1 + delta + 0.01; // return2 > return1 を保証
          fc.pre(return2 <= 25);
          const asset1 = { id: 'a1', type: 'cash', currentVal, monthly: 0, annualReturn: return1, targetVal: 0, targetVal2: 0 };
          const asset2 = { id: 'a1', type: 'cash', currentVal, monthly: 0, annualReturn: return2, targetVal: 0, targetVal2: 0 };
          const r1 = calcAssetGrowth(asset1, years, [], CURRENT_YEAR);
          const r2 = calcAssetGrowth(asset2, years, [], CURRENT_YEAR);
          return r2.values[years] >= r1.values[years] - 0.001;
        }
      ),
      { numRuns: 1000 }
    );
  });
});

// ─── Group 4: 資金保存則（Conservation Laws）─────────────────────────────────

describe('Group 4: 資金保存則', () => {

  /**
   * プロパティ 11: 積立なし overflow = 0
   * monthly=0, extraContribs=[] のとき、overflow も 0 であるべき
   * （targetVal なし、annualReturn>=0 のみ。annualReturn<0 でも overflow は発生しない）
   */
  it('P11: monthly=0, extra=0, targetVal=0 → overflow は全て 0', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1000, noNaN: true }),
        fc.double({ min: 0, max: 20,   noNaN: true }),
        arbYears,
        (currentVal, annualReturn, years) => {
          const asset = { id: 'a1', type: 'cash', currentVal, monthly: 0, annualReturn, targetVal: 0, targetVal2: 0 };
          const r = calcAssetGrowth(asset, years, [], CURRENT_YEAR);
          return (
            r.overflows.every(v => Math.abs(v) < 0.001) &&
            r.overflows2.every(v => Math.abs(v) < 0.001)
          );
        }
      ),
      { numRuns: 1000 }
    );
  });

  /**
   * プロパティ 12: targetVal 達成後の overflow = 積立額（annualReturn=0 のとき等号）
   * targetVal に達した後は毎年の overflow が monthly * 12 に等しくなる
   */
  it('P12: targetVal 達成後（annualReturn=0）は overflow ≈ monthly * 12', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 20, noNaN: true }),
        fc.double({ min: 50, max: 200, noNaN: true }),
        fc.integer({ min: 5, max: 20 }),
        (monthly, targetVal, years) => {
          // 初期残高 = targetVal（達成済み状態）
          const asset = {
            id: 'a1', type: 'cash',
            currentVal: targetVal,
            monthly,
            annualReturn: 0,
            targetVal,
            targetVal2: 0
          };
          const r = calcAssetGrowth(asset, years, [], CURRENT_YEAR);
          const expectedOverflow = Math.round(monthly * 12 * 10) / 10;
          // y=1 以降のすべての年で overflow ≈ monthly * 12
          for (let i = 1; i <= years; i++) {
            if (Math.abs(r.overflows[i] - expectedOverflow) > 0.5) return false;
          }
          return true;
        }
      ),
      { numRuns: 1000 }
    );
  });

  /**
   * プロパティ 13: overflow 後は積立がそのまま overflow に流れる（残高維持）
   * targetVal 達成後は残高が targetVal に固定される（annualReturn=0 のとき）。
   * ただし calcAssetGrowth は Math.round(x * 10) / 10 で丸めるため、
   * targetVal 自体が小数の場合は丸め後の値で比較する。
   */
  it('P13: targetVal 達成後は残高が targetVal に固定される（annualReturn=0）', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 20, noNaN: true }),
        fc.double({ min: 50, max: 500, noNaN: true }),
        fc.integer({ min: 3, max: 20 }),
        (monthly, targetVal, years) => {
          const asset = {
            id: 'a1', type: 'cash',
            currentVal: targetVal, // 初期値 = 目標値（達成済み）
            monthly,
            annualReturn: 0,
            targetVal,
            targetVal2: 0
          };
          const r = calcAssetGrowth(asset, years, [], CURRENT_YEAR);
          // 丸め後の targetVal を計算基準として使用
          // （内部で Math.round(grown * 10) / 10 が適用されるため）
          const roundedTarget = Math.round(targetVal * 10) / 10;
          // y=1 以降は全て roundedTarget に固定（丸め誤差 0.1 を許容）
          for (let i = 1; i <= years; i++) {
            if (Math.abs(r.values[i] - roundedTarget) > 0.1) return false;
          }
          return true;
        }
      ),
      { numRuns: 1000 }
    );
  });

  /**
   * プロパティ 14: 残高増分 + overflow = 積立額（annualReturn=0, targetVal=0 のとき）
   * 資金は消えない: Δbalance + overflow = annualContrib
   */
  it('P14: 利回り0, 目標なし → 残高増分 ≈ monthly * 12（資金保存）', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1000, noNaN: true }),
        fc.double({ min: 0, max: 50,   noNaN: true }),
        arbYears,
        (currentVal, monthly, years) => {
          const asset = { id: 'a1', type: 'cash', currentVal, monthly, annualReturn: 0, targetVal: 0, targetVal2: 0 };
          const r = calcAssetGrowth(asset, years, [], CURRENT_YEAR);
          for (let i = 1; i <= years; i++) {
            const delta = r.values[i] - r.values[i - 1];
            const annualContrib = monthly * 12;
            if (Math.abs(delta - annualContrib) > 0.5) return false;
          }
          return true;
        }
      ),
      { numRuns: 1000 }
    );
  });
});

// ─── Group 5: calcAllAssetGrowth の整合性 ─────────────────────────────────────

describe('Group 5: calcAllAssetGrowth の整合性', () => {

  // calcAllAssetGrowth 用のアセットペア Arbitrary
  const arbAssetPair = fc.record({
    currentValA:  fc.double({ min: 0, max: 500, noNaN: true }),
    monthlyA:     fc.double({ min: 0, max: 20,  noNaN: true }),
    targetValA:   fc.double({ min: 100, max: 400, noNaN: true }),
    currentValB:  fc.double({ min: 0, max: 200, noNaN: true }),
    monthlyB:     fc.double({ min: 0, max: 10,  noNaN: true }),
  });

  /**
   * プロパティ 15: wastedContribsByYear は非負
   * wastedContribsByYear[i] >= 0 for all i
   */
  it('P15: wastedContribsByYear は常に非負', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 500, noNaN: true }),
        fc.double({ min: 0, max: 20,  noNaN: true }),
        fc.integer({ min: 1, max: 20 }),
        (currentVal, monthly, years) => {
          const assets = [
            { id: 'a1', type: 'cash', currentVal, monthly, annualReturn: 0, targetVal: 0, targetVal2: 0 },
            { id: 'a2', type: 'cash', currentVal: 0, monthly: 0, annualReturn: 0, targetVal: 0, targetVal2: 0 },
          ];
          const result = calcAllAssetGrowth(assets, years);
          const wasted = result._wastedContribsByYear;
          return wasted.every(v => v >= -0.001);
        }
      ),
      { numRuns: 1000 }
    );
  });

  /**
   * プロパティ 16: 結果配列の長さ = 入力アセットの数
   * calcAllAssetGrowth は入力の全アセットに対して結果を返す
   */
  it('P16: 結果配列の長さ = 入力アセット数', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 20 }),
        (numAssets, years) => {
          const assets = Array.from({ length: numAssets }, (_, i) => ({
            id: `asset-${i}`,
            type: 'cash',
            currentVal: 100,
            monthly: 1,
            annualReturn: 0,
            targetVal: 0,
            targetVal2: 0,
          }));
          const result = calcAllAssetGrowth(assets, years);
          return result.length === numAssets;
        }
      ),
      { numRuns: 500 }
    );
  });

  /**
   * プロパティ 17: 各アセットの data 配列長 = years + 1
   */
  it('P17: 各アセットの data.length === years + 1', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4 }),
        fc.integer({ min: 1, max: 20 }),
        (numAssets, years) => {
          const assets = Array.from({ length: numAssets }, (_, i) => ({
            id: `asset-${i}`,
            type: 'cash',
            currentVal: 50,
            monthly: 1,
            annualReturn: 0,
            targetVal: 0,
            targetVal2: 0,
          }));
          const result = calcAllAssetGrowth(assets, years);
          return result.every(r => r.data.length === years + 1);
        }
      ),
      { numRuns: 500 }
    );
  });

  /**
   * プロパティ 18: overflow チェーン保存
   * A の overflowTargetId が B のとき、A の overflow が B の成長に寄与する
   * 具体的には: B（A からの overflow あり）の残高 >= B（overflow なし）の残高
   */
  it('P18: overflow チェーン → overflow 先の残高が増加する', () => {
    fc.assert(
      fc.property(
        arbAssetPair,
        fc.integer({ min: 2, max: 15 }),
        ({ currentValA, monthlyA, targetValA, currentValB, monthlyB }, years) => {
          // A → B に overflow が流れる設定
          // A の初期値 >= targetVal（最初から overflow が発生する状態）
          fc.pre(currentValA >= targetValA);

          const assetsWithOverflow = [
            { id: 'aA', type: 'cash', currentVal: currentValA, monthly: monthlyA, annualReturn: 0, targetVal: targetValA, targetVal2: 0, overflowTargetId: 'aB' },
            { id: 'aB', type: 'cash', currentVal: currentValB, monthly: monthlyB, annualReturn: 0, targetVal: 0, targetVal2: 0 },
          ];
          const assetsNoOverflow = [
            { id: 'aA', type: 'cash', currentVal: currentValA, monthly: monthlyA, annualReturn: 0, targetVal: targetValA, targetVal2: 0, overflowTargetId: '' },
            { id: 'aB', type: 'cash', currentVal: currentValB, monthly: monthlyB, annualReturn: 0, targetVal: 0, targetVal2: 0 },
          ];

          const rWith    = calcAllAssetGrowth(assetsWithOverflow, years);
          const rWithout = calcAllAssetGrowth(assetsNoOverflow, years);

          const bWith    = rWith.find(r => r.asset.id === 'aB');
          const bWithout = rWithout.find(r => r.asset.id === 'aB');

          // overflow あり の B の最終残高 >= overflow なし の B の最終残高
          return bWith.data[years] >= bWithout.data[years] - 0.001;
        }
      ),
      { numRuns: 500 }
    );
  });

  /**
   * プロパティ 19: 独立アセットの互いに干渉しない性質
   * overflowTargetId なしの独立アセット群では、各アセットは互いに影響しない
   * つまり、単独計算（calcAssetGrowth）と同じ結果になる
   */
  it('P19: 独立アセット群の各残高は calcAssetGrowth と一致する', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 500, noNaN: true }),
        fc.double({ min: 0, max: 20,  noNaN: true }),
        fc.double({ min: 0, max: 500, noNaN: true }),
        fc.double({ min: 0, max: 20,  noNaN: true }),
        fc.integer({ min: 1, max: 15 }),
        (cv1, m1, cv2, m2, years) => {
          const a1 = { id: 'x1', type: 'cash', currentVal: cv1, monthly: m1, annualReturn: 0, targetVal: 0, targetVal2: 0 };
          const a2 = { id: 'x2', type: 'cash', currentVal: cv2, monthly: m2, annualReturn: 0, targetVal: 0, targetVal2: 0 };

          const resultAll = calcAllAssetGrowth([a1, a2], years);
          const r1 = calcAssetGrowth(a1, years, [], CURRENT_YEAR);
          const r2 = calcAssetGrowth(a2, years, [], CURRENT_YEAR);

          const all1 = resultAll.find(r => r.asset.id === 'x1');
          const all2 = resultAll.find(r => r.asset.id === 'x2');

          // calcAllAssetGrowth の結果が calcAssetGrowth と一致する
          for (let i = 0; i <= years; i++) {
            if (Math.abs(all1.data[i] - r1.values[i]) > 0.01) return false;
            if (Math.abs(all2.data[i] - r2.values[i]) > 0.01) return false;
          }
          return true;
        }
      ),
      { numRuns: 500 }
    );
  });

  /**
   * プロパティ 20: wastedContribs の長さ = years + 1
   * _wastedContribsByYear の配列長は years + 1
   */
  it('P20: _wastedContribsByYear.length === years + 1', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4 }),
        fc.integer({ min: 1, max: 20 }),
        (numAssets, years) => {
          const assets = Array.from({ length: numAssets }, (_, i) => ({
            id: `asset-${i}`,
            type: 'cash',
            currentVal: 100,
            monthly: 1,
            annualReturn: 0,
            targetVal: 0,
            targetVal2: 0,
          }));
          const result = calcAllAssetGrowth(assets, years);
          return result._wastedContribsByYear.length === years + 1;
        }
      ),
      { numRuns: 500 }
    );
  });
});

// ─── Group 6: 追加の数値安定性プロパティ ────────────────────────────────────

describe('Group 6: 数値安定性', () => {

  /**
   * プロパティ 21: 有限値の保証
   * 全てのシミュレーション結果が有限値（NaN/Infinity でない）
   */
  it('P21: 全ての結果は有限値（NaN/Infinity でない）', () => {
    fc.assert(
      fc.property(arbBasicAsset, arbYears, (asset, years) => {
        const r = calcAssetGrowth(asset, years, [], CURRENT_YEAR);
        return (
          r.values.every(v => Number.isFinite(v)) &&
          r.overflows.every(v => Number.isFinite(v)) &&
          r.overflows2.every(v => Number.isFinite(v))
        );
      }),
      { numRuns: 1000 }
    );
  });

  /**
   * プロパティ 22: y=0 の overflow は常に 0
   * 初期時点（y=0）では余剰は発生しない
   */
  it('P22: overflows[0] === 0, overflows2[0] === 0（初期値に余剰なし）', () => {
    fc.assert(
      fc.property(arbBasicAsset, arbYears, (asset, years) => {
        const r = calcAssetGrowth(asset, years, [], CURRENT_YEAR);
        return r.overflows[0] === 0 && r.overflows2[0] === 0;
      }),
      { numRuns: 1000 }
    );
  });

  /**
   * プロパティ 23: extraContribs が残高に正しく反映される
   * extra > 0 を渡した場合、extra なし と比べて残高が増加する（targetVal=0 のとき）
   */
  it('P23: extraContribs > 0 → 残高が増加する（targetVal=0）', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 500, noNaN: true }),
        fc.double({ min: 0, max: 20,  noNaN: true }),
        fc.double({ min: 1, max: 100, noNaN: true }),
        fc.integer({ min: 2, max: 20 }),
        (currentVal, monthly, extraAmount, years) => {
          const asset = { id: 'a1', type: 'cash', currentVal, monthly, annualReturn: 0, targetVal: 0, targetVal2: 0 };
          // y=1 に extra を追加
          const extra = new Array(years + 1).fill(0);
          extra[1] = extraAmount;

          const rWithExtra    = calcAssetGrowth(asset, years, extra, CURRENT_YEAR);
          const rWithoutExtra = calcAssetGrowth(asset, years, [],    CURRENT_YEAR);

          // extra あり の残高 >= extra なし の残高（全期間）
          for (let i = 1; i <= years; i++) {
            if (rWithExtra.values[i] < rWithoutExtra.values[i] - 0.001) return false;
          }
          return true;
        }
      ),
      { numRuns: 1000 }
    );
  });

  /**
   * プロパティ 24: 初期残高の増加 → 最終残高の増加（利回り >= 0）
   * currentVal を増やすと、最終残高は減らない
   */
  it('P24: currentVal を増やすと最終残高は増加する（annualReturn >= 0）', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0,    max: 500, noNaN: true }),
        fc.double({ min: 0,    max: 500, noNaN: true }),
        fc.double({ min: 0,    max: 20,  noNaN: true }),
        fc.double({ min: 0,    max: 10,  noNaN: true }),
        arbYears,
        (cv1, delta, monthly, annualReturn, years) => {
          const cv2 = cv1 + delta; // cv2 >= cv1 を保証
          const a1 = { id: 'a1', type: 'cash', currentVal: cv1, monthly, annualReturn, targetVal: 0, targetVal2: 0 };
          const a2 = { id: 'a1', type: 'cash', currentVal: cv2, monthly, annualReturn, targetVal: 0, targetVal2: 0 };
          const r1 = calcAssetGrowth(a1, years, [], CURRENT_YEAR);
          const r2 = calcAssetGrowth(a2, years, [], CURRENT_YEAR);
          return r2.values[years] >= r1.values[years] - 0.001;
        }
      ),
      { numRuns: 1000 }
    );
  });
});
