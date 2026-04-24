/**
 * test/golden-master.test.js
 *
 * スプレッドシート手動検証によるゴールデンマスターテスト
 *
 * 検証方法:
 *   1. Excel ファイル (test/simulation-verification.xlsx) に同じロジックを
 *      独立実装した計算式で期待値を求めた
 *   2. calcAssetGrowth の出力がその期待値と一致することを検証する
 *   3. Excel ファイルの値を変更した場合は必ずこちらのテストも更新すること
 *
 * 参照ファイル: test/simulation-verification.xlsx
 * TAX_RATE = 0.20315 (所得税15.315% + 住民税5%)
 *
 * ⚠️ 誤差許容: 小数1桁丸め（Math.round(v * 10) / 10）のため toBeCloseTo(v, 0) を使用
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { projectEmergencyBalance } from './helpers/test-helpers.js';
import { loadCalc, getSandbox } from './helpers/load-calc.js';

const CY = 2025; // 計算基準年を固定
let sb, calc;
beforeAll(() => {
  loadCalc('utils.js');
  loadCalc('asset-growth.js');
  sb = getSandbox();
  calc = (a, years, extra = []) => sb.calcAssetGrowth(a, years, extra, CY);
});

// Excel で導出した期待値（simulation-verification.xlsx 参照）
// 単位: 万円、小数1桁

// ─── Sheet: "NISA基本複利" ────────────────────────────────────────────────────
// 条件: 初期0万、月5万（年60万）、年利5%、非課税（NISA）、10年
// Excel 式: B(n) = ROUND(B(n-1) * 1.05 + 60, 1)

const NISA_GOLDEN = [0, 60, 123, 189.2, 258.7, 331.6, 408.2, 488.6, 573.0, 661.7, 754.8];

describe('【ゴールデンマスター】NISA基本複利 (Excel Sheet: NISA基本複利)', () => {
  const asset = {
    type: 'nisa_tsumitate',
    currentVal: 0,
    monthly: 5,
    annualReturn: 5,
    taxType: 'nisa',
    nisaBasis: 0,
  };

  it('年別残高が Excel 計算値と一致する（全10年）', () => {
    const r = calc(asset, 10);
    NISA_GOLDEN.forEach((expected, year) => {
      expect(r.values[year]).toBeCloseTo(expected, 0);
    });
  });

  it('10年後の最終残高 754.8万円（Excel 検証値）', () => {
    const r = calc(asset, 10);
    expect(r.values[10]).toBeCloseTo(754.8, 0);
  });

  it('overflow は全年ゼロ（NISA 上限未到達）', () => {
    const r = calc(asset, 10);
    r.overflows.forEach(v => expect(v).toBe(0));
  });
});

// ─── Sheet: "特定口座（課税）" ───────────────────────────────────────────────
// 条件: 初期100万、積立なし、年利7%、特定口座（課税 20.315%）、10年
// effectiveRate = 0.07 × (1 − 0.20315) = 0.0557795/年
// Excel 式: B(n) = ROUND(B(n-1) * (1 + effectiveRate), 1)

const TOKUTEI_GOLDEN = [100, 105.6, 111.5, 117.7, 124.3, 131.2, 138.5, 146.2, 154.4, 163.0, 172.1];

describe('【ゴールデンマスター】特定口座（課税）(Excel Sheet: 特定口座（課税）)', () => {
  const asset = {
    type: 'trust_sp500',
    currentVal: 100,
    monthly: 0,
    annualReturn: 7,
    taxType: 'tokutei',
  };

  it('年別残高が Excel 計算値と一致する（全10年）', () => {
    const r = calc(asset, 10);
    TOKUTEI_GOLDEN.forEach((expected, year) => {
      expect(r.values[year]).toBeCloseTo(expected, 0);
    });
  });

  it('10年後の最終残高 172.1万円（Excel 検証値）', () => {
    const r = calc(asset, 10);
    expect(r.values[10]).toBeCloseTo(172.1, 0);
  });

  it('非課税（NISA）より低い利回りになる（課税コスト確認）', () => {
    // 同じ7%でも課税口座は NISA より最終残高が小さい
    const nisaAsset = { ...asset, taxType: 'nisa' };
    const rTokutei = calc(asset, 10);
    const rNisa    = calc(nisaAsset, 10);
    expect(rTokutei.values[10]).toBeLessThan(rNisa.values[10]);
  });
});

// ─── Sheet: "生活防衛資金(targetVal)" ────────────────────────────────────────
// 条件: 初期120万、月3万（年36万）、利0.1%（現金）、targetVal=300万
// Excel 式:
//   B(n) = IF(B(n-1)>=300, 300, MIN(300, ROUND(B(n-1)*1.001+36, 1)))
//   overflow(n) = MAX(0, ROUND(B(n-1)*1.001+36,1) - 300) when B(n-1)<300
//              = 36 when B(n-1)=300

const EMERG_GOLDEN_BAL = [120, 156.1, 192.3, 228.5, 264.7, 300, 300, 300, 300, 300, 300];
const EMERG_GOLDEN_OVF = [0, 0, 0, 0, 0, 1.0, 36, 36, 36, 36, 36];
// ※ year5 overflow=1.0: grown=264.7*1.001+36=301.0 → cap at 300, overflow=1.0

describe('【ゴールデンマスター】生活防衛資金 targetVal (Excel Sheet: 生活防衛資金(targetVal))', () => {
  const asset = {
    type: 'cash_emergency',
    currentVal: 120,
    monthly: 3,
    annualReturn: 0.1,
    taxType: 'cash',
    targetVal: 300,
  };

  it('年別残高が Excel 計算値と一致する（全10年）', () => {
    const r = calc(asset, 10);
    EMERG_GOLDEN_BAL.forEach((expected, year) => {
      expect(r.values[year]).toBeCloseTo(expected, 0);
    });
  });

  it('5年目に 300万円に到達する（Excel: target達成年=5）', () => {
    const r = calc(asset, 10);
    expect(r.values[5]).toBe(300);
    expect(r.values[4]).toBeLessThan(300);
  });

  it('year5 の overflow が 1.0万円（小数丸め確認）', () => {
    // grown = 264.7 * 1.001 + 36 = 301.0... → overflow = 1.0
    const r = calc(asset, 10);
    expect(r.overflows[5]).toBeCloseTo(1.0, 0);
  });

  it('達成後の overflow が 36万円/年（月3万×12）', () => {
    const r = calc(asset, 10);
    for (let y = 6; y <= 10; y++) {
      expect(r.overflows[y]).toBeCloseTo(36, 0);
    }
  });

  it('projectEmergencyBalance も 300万円でキャップされる', () => {
    const result = projectEmergencyBalance(asset, 10);
    expect(result).toBe(300);
  });

  it('年別overflow が Excel 計算値と一致する', () => {
    const r = calc(asset, 10);
    EMERG_GOLDEN_OVF.forEach((expected, year) => {
      expect(r.overflows[year]).toBeCloseTo(expected, 0);
    });
  });
});

// ─── Sheet: "targetVal2段階積み上げ" ─────────────────────────────────────────
// 条件: 初期120万、月3万（年36万）、利0.1%
//       targetVal=300万 → targetVal2=500万
//       外部流入 extra=60万/年（6年目から）
//
// Excel 計算（Phase1: 1〜5年目 / Phase2: 6〜9年目 / Done: 10年目以降）:
//   Phase1: MIN(300, ROUND(B(n-1)*1.001 + 36, 1))
//   Phase2: ROUND(B(n-1)*1.001 + extra, 1)  ※自己積立はoverflowへ
//   Done:   500（固定）

const TV2_GOLDEN_BAL = [
  120,   // y=0
  156.1, // y=1  Phase1
  192.3, // y=2  Phase1
  228.5, // y=3  Phase1
  264.7, // y=4  Phase1
  300.0, // y=5  Phase1 → 300到達
  360.3, // y=6  Phase2（extra=60, own→overflow: 300*1.001+60=360.3）
  420.7, // y=7  Phase2（360.3*1.001+60=420.7）
  481.1, // y=8  Phase2（420.7*1.001+60=481.1）
  500.0, // y=9  Phase2 → 500到達（481.1*1.001+60=541.6 → cap at 500, overflow2=41.6）
  500.0, // y=10 Done
];

// extraContribs: y=0〜5は0、y=6〜10は60
const tv2Extra = Array.from({ length: 11 }, (_, y) => (y >= 6 ? 60 : 0));

describe('【ゴールデンマスター】targetVal2 段階積み上げ (Excel Sheet: targetVal2段階積み上げ)', () => {
  const asset = {
    type: 'cash_emergency',
    currentVal: 120,
    monthly: 3,
    annualReturn: 0.1,
    taxType: 'cash',
    targetVal: 300,
    targetVal2: 500,
  };

  it('年別残高が Excel 計算値と一致する（全10年）', () => {
    const r = calc(asset, 10, tv2Extra);
    TV2_GOLDEN_BAL.forEach((expected, year) => {
      expect(r.values[year]).toBeCloseTo(expected, 0);
    });
  });

  it('5年目に Phase1 完了（300万到達）', () => {
    const r = calc(asset, 10, tv2Extra);
    expect(r.values[5]).toBe(300);
    expect(r.values[4]).toBeLessThan(300);
  });

  it('9年目に Phase2 完了（500万到達）', () => {
    const r = calc(asset, 10, tv2Extra);
    expect(r.values[9]).toBe(500);
    expect(r.values[8]).toBeLessThan(500);
  });

  it('Phase2（y=6〜8）：自己積立36万が overflow に流れる', () => {
    const r = calc(asset, 10, tv2Extra);
    for (let y = 6; y <= 8; y++) {
      expect(r.overflows[y]).toBeCloseTo(36, 0); // 自己積立 → overflow
    }
  });

  it('Phase2 完了年（y=9）に overflow2 が発生する', () => {
    // grown = 481.1 * 1.001 + 60 = 541.6, targetVal2=500 → overflow2 = 41.6
    const r = calc(asset, 10, tv2Extra);
    expect(r.overflows2[9]).toBeGreaterThan(0);
    expect(r.overflows2[9]).toBeCloseTo(41.6, 0);
  });

  it('Done フェーズ（y=10）：残高 500万固定、overflow2 = 自己積立 + extra', () => {
    const r = calc(asset, 10, tv2Extra);
    expect(r.values[10]).toBe(500);
    // overflow2 = 36(自己積立) + 60(extra) = 96
    expect(r.overflows2[10]).toBeCloseTo(96, 0);
  });

  it('projectEmergencyBalance: targetVal2 を上限として 500万に到達する', () => {
    const result = projectEmergencyBalance(asset, 30);
    expect(result).toBeCloseTo(500, 0);
    expect(result).toBeLessThanOrEqual(500);
  });
});

// ─── Sheet: "退職後取り崩し" ─────────────────────────────────────────────────
// 条件: 初期1000万、年支出30万、年金収入20万、年赤字10万
// Excel 式: B(n) = MAX(0, B(n-1) - 10)
// 枯渇年: 100年目

describe('【ゴールデンマスター】退職後取り崩し (Excel Sheet: 退職後取り崩し)', () => {
  // calcAssetGrowth ではなく純粋な取り崩し関数で検証
  function drawdown(initial, annualExpense, annualIncome, years) {
    const values = [initial];
    for (let y = 0; y < years; y++) {
      values.push(Math.max(0, values[y] + annualIncome - annualExpense));
    }
    return values;
  }

  const DRAWDOWN_GOLDEN = {
    0:   1000,
    10:  900,
    20:  800,
    30:  700,
    40:  600,
    50:  500,
    60:  400,
    70:  300,
    80:  200,
    90:  100,
    100: 0,
  };

  it('年別残高が Excel 計算値と一致する（10年刻み）', () => {
    const v = drawdown(1000, 30, 20, 100);
    Object.entries(DRAWDOWN_GOLDEN).forEach(([year, expected]) => {
      expect(v[Number(year)]).toBeCloseTo(expected, 0);
    });
  });

  it('100年目で枯渇（Excel: 枯渇年=100年目）', () => {
    const v = drawdown(1000, 30, 20, 105);
    expect(v[100]).toBe(0);
    expect(v[99]).toBeGreaterThan(0);
  });

  it('単調減少かつ非負', () => {
    const v = drawdown(1000, 30, 20, 100);
    for (let y = 1; y <= 100; y++) {
      expect(v[y]).toBeLessThanOrEqual(v[y - 1]);
      expect(v[y]).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─── クロスバリデーション: JS計算 vs Excel独立計算 ─────────────────────────────
// 2つの独立した実装（JS関数 と Excel 数式）が同じ答えを出すことを確認

describe('【クロスバリデーション】JS実装 vs Excel独立計算', () => {
  it('NISA: JS の複利計算が Excel FV 関数相当と一致する', () => {
    // Excel FV(rate, nper, pmt, pv) = FV(0.05, 10, -60, 0) ≒ 754.8
    // Excel ROUND を挟むため小数点以下は近似
    const r = calc({
      type: 'nisa_tsumitate', currentVal: 0, monthly: 5,
      annualReturn: 5, taxType: 'nisa', nisaBasis: 0,
    }, 10);
    expect(r.values[10]).toBeCloseTo(754.8, 0);
  });

  it('特定口座: 実効利回りが TAX_RATE = 0.20315 で正しく減衰する', () => {
    // Excel: effectiveRate = 7% × (1 − 0.20315) = 5.57795%
    // 100万 × (1.0557795)^10 ≈ 172.1万
    const r = calc({
      type: 'trust_sp500', currentVal: 100, monthly: 0,
      annualReturn: 7, taxType: 'tokutei',
    }, 10);
    expect(r.values[10]).toBeCloseTo(172.1, 0);
  });

  it('targetVal: JS と projectEmergencyBalance（Excel式ベース）が一致する', () => {
    const asset = {
      type: 'cash_emergency', currentVal: 120, monthly: 3,
      annualReturn: 0.1, taxType: 'cash', targetVal: 300,
    };
    const fromCalcAsset  = calc(asset, 5).values[5];
    const fromProjection = projectEmergencyBalance(asset, 5);
    // 両者ともに 300 になる（targetVal到達で一致）
    expect(fromCalcAsset).toBeCloseTo(fromProjection, 0);
  });

  it('targetVal2: JS の2段階計算が Excel の段階式と一致する（9年後=500万）', () => {
    const asset = {
      type: 'cash_emergency', currentVal: 120, monthly: 3,
      annualReturn: 0.1, taxType: 'cash', targetVal: 300, targetVal2: 500,
    };
    const extra = Array.from({ length: 11 }, (_, y) => (y >= 6 ? 60 : 0));
    const r = calc(asset, 10, extra);
    expect(r.values[9]).toBe(500);   // Excel: 9年目に500万到達
    expect(r.values[10]).toBe(500);  // 以降固定
  });
});
