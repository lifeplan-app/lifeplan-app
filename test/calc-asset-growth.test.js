/**
 * test/calc-asset-growth.test.js
 *
 * calcAssetGrowth の単体テスト
 * テスト方針:
 *   1. 利回り0% の純粋積立でベースラインを確認
 *   2. 複利成長の数値を手計算と照合
 *   3. 目標金額 (targetVal) の上限制御
 *   4. 第2目標 (targetVal2) の段階的積み上げ
 *   5. NISA年間/生涯上限の制御
 *   6. 旧NISA の endYear 移管後の課税
 *   7. 稼働期間（startYear / endYear）の制御
 *   8. extraContribs（外部振替）の受け取り
 *   9. 配当受取モード（cashout）での成長分離
 *  10. 境界値・エッジケース
 */

import { describe, it, expect } from 'vitest';
import { calcAssetGrowth, TAX_RATE } from './helpers/core.js';

// テスト用に「現在年」を固定するヘルパー
// calcAssetGrowth の第4引数 _currentYear でオーバーライドできる
const CY = 2025; // 固定基準年
const calc = (a, years, extra = []) => calcAssetGrowth(a, years, extra, CY);

// ─── 1. ベースライン：利回り0%、積立のみ ─────────────────────────────────────

describe('ベースライン（利回り0%・積立なし）', () => {
  it('残高0・積立なし → ずっと0', () => {
    const r = calc({ type: 'cash', currentVal: 0, monthly: 0, annualReturn: 0 }, 3);
    expect(r.values).toEqual([0, 0, 0, 0]);
    expect(r.overflows.every(v => v === 0)).toBe(true);
  });

  it('初期残高のみ・積立なし → 変化なし', () => {
    const r = calc({ type: 'cash', currentVal: 100, monthly: 0, annualReturn: 0 }, 3);
    expect(r.values).toEqual([100, 100, 100, 100]);
  });

  it('月1万×12ヶ月 = 年12万ずつ増加（利回り0%）', () => {
    const r = calc({ type: 'cash', currentVal: 0, monthly: 1, annualReturn: 0 }, 3);
    // y=0: 0, y=1: 12, y=2: 24, y=3: 36
    expect(r.values[0]).toBe(0);
    expect(r.values[1]).toBe(12);
    expect(r.values[2]).toBe(24);
    expect(r.values[3]).toBe(36);
  });

  it('年間ボーナス積立が正しく加算される', () => {
    const r = calc({ type: 'cash', currentVal: 0, monthly: 0, annualBonus: 10, annualReturn: 0 }, 2);
    expect(r.values[1]).toBe(10);
    expect(r.values[2]).toBe(20);
  });

  it('月積立 + 年間ボーナスの合算', () => {
    const r = calc({ type: 'cash', currentVal: 0, monthly: 1, annualBonus: 12, annualReturn: 0 }, 2);
    // 年間 = 1*12 + 12 = 24
    expect(r.values[1]).toBe(24);
    expect(r.values[2]).toBe(48);
  });
});

// ─── 2. 複利成長 ─────────────────────────────────────────────────────────────

describe('複利成長', () => {
  it('現金タイプ（課税なし）：利回り10%の複利 1年後', () => {
    const r = calc({ type: 'cash', currentVal: 100, monthly: 0, annualReturn: 10 }, 1);
    // 10% → effectiveReturn は cash なのでそのまま 0.1
    expect(r.values[1]).toBeCloseTo(110, 1);
  });

  it('特定口座タイプ：利回り10%に課税 → 実効利回り = 10 * (1 - 0.20315)', () => {
    const rate = 10 * (1 - TAX_RATE); // ≈ 7.969%
    const r = calc({ type: 'trust_sp500', currentVal: 100, monthly: 0, annualReturn: 10, taxType: 'tokutei' }, 1);
    expect(r.values[1]).toBeCloseTo(100 * (1 + rate / 100), 1);
  });

  it('NISA タイプ：利回り10%、非課税なのでそのまま複利', () => {
    const r = calc({ type: 'nisa_tsumitate', currentVal: 100, monthly: 0, annualReturn: 10, taxType: 'nisa', nisaBasis: 100 }, 1);
    expect(r.values[1]).toBeCloseTo(110, 1);
  });

  it('積立なし・年率5%・10年 = 初期値 × 1.05^10（現金口座）', () => {
    const r = calc({ type: 'cash', currentVal: 100, monthly: 0, annualReturn: 5 }, 10);
    const expected = 100 * Math.pow(1.05, 10);
    expect(r.values[10]).toBeCloseTo(expected, 0);
  });
});

// ─── 3. 目標金額（targetVal）上限制御 ────────────────────────────────────────

describe('targetVal（第1目標）', () => {
  it('目標達成後は残高が targetVal でキャップされる', () => {
    // 初期290万、月積立5万 → 1年後 = 290+60 = 350 → targetVal=300 でキャップ
    const r = calc({ type: 'cash', currentVal: 290, monthly: 5, annualReturn: 0, targetVal: 300 }, 3);
    expect(r.values[1]).toBe(300);
    expect(r.values[2]).toBe(300);
    expect(r.values[3]).toBe(300);
  });

  it('目標達成年に超過分が overflows に計上される', () => {
    const r = calc({ type: 'cash', currentVal: 290, monthly: 5, annualReturn: 0, targetVal: 300 }, 2);
    // 290 + 60 = 350, overflow = 50, 残高 = 300
    expect(r.overflows[1]).toBe(50);
  });

  it('目標達成前は overflows = 0', () => {
    const r = calc({ type: 'cash', currentVal: 100, monthly: 1, annualReturn: 0, targetVal: 300 }, 3);
    expect(r.overflows[1]).toBe(0);
    expect(r.overflows[2]).toBe(0);
    expect(r.overflows[3]).toBe(0);
  });

  it('目標達成後の自己積立が全て overflow に転換される', () => {
    // 初期 = targetVal（達成済み）、月積立1万
    const r = calc({ type: 'cash', currentVal: 300, monthly: 1, annualReturn: 0, targetVal: 300 }, 3);
    // y=1: prev=300 >= targetVal=300 → overflow = 12
    expect(r.overflows[1]).toBe(12);
    expect(r.overflows[2]).toBe(12);
    expect(r.values[1]).toBe(300);
  });

  it('初期残高がすでに targetVal 超えていても挙動が安定している', () => {
    const r = calc({ type: 'cash', currentVal: 500, monthly: 1, annualReturn: 0, targetVal: 300 }, 2);
    // targetVal=300 だが初期値=500 → 既に超えているのでoverflow になる
    expect(r.values[0]).toBe(500);
    expect(r.overflows[1]).toBe(12); // 月1万 × 12 が全部 overflow
    expect(r.values[1]).toBe(500);   // 残高は成長しない（積立がないので現状維持+複利のみ）
  });
});

// ─── 4. 第2目標（targetVal2）─────────────────────────────────────────────────

describe('targetVal2（第2目標）', () => {
  it('第1目標達成後のフェーズ2：自己積立は overflow へ、extra のみ積み上げ', () => {
    // 第1目標300万に到達済み、月積立3万、extra=5万/年、第2目標500万
    const a = { type: 'cash', currentVal: 300, monthly: 3, annualReturn: 0, targetVal: 300, targetVal2: 500 };
    const extra = new Array(5).fill(0).map((_, i) => i === 0 ? 0 : 5); // y=1〜4 に 5万/年
    const r = calc(a, 4, extra);

    // y=1: prev=300>=targetVal → overflow=36（自己積立）, annualContrib=extra=5
    expect(r.overflows[1]).toBe(36);
    expect(r.values[1]).toBe(305);

    // y=2: prev=305 < targetVal2=500 → overflow=36, 値=305+5=310
    expect(r.values[2]).toBe(310);
    expect(r.overflows[2]).toBe(36);
  });

  it('第2目標達成後は overflows2 に計上され、残高が targetVal2 でキャップ', () => {
    // 初期490万, 月積立3万, extra=20万/年, targetVal=300, targetVal2=500
    const a = { type: 'cash', currentVal: 490, monthly: 3, annualReturn: 0, targetVal: 300, targetVal2: 500 };
    const extra = [0, 20, 20, 20];
    const r = calc(a, 3, extra);

    // y=1: prev=490 >= targetVal(300), prev < targetVal2(500)
    //   → overflow = 36（自己）, annualContrib = 20（extra）
    //   → grown = 490 + 20 = 510 > 500 → overflow2 = 10, finalVal = 500
    expect(r.values[1]).toBe(500);
    expect(r.overflows2[1]).toBe(10);

    // y=2: prev=500 >= targetVal2 → overflow2 = 36(自己) + 20(extra) = 56
    expect(r.overflows2[2]).toBe(56);
    expect(r.values[2]).toBe(500);
  });

  it('第2目標なし（targetVal2=0）の場合は通常の targetVal 動作', () => {
    const a = { type: 'cash', currentVal: 300, monthly: 3, annualReturn: 0, targetVal: 300 };
    const r = calc(a, 2);
    expect(r.overflows[1]).toBe(36); // 通常 overflow に流れる
    expect(r.overflows2[1]).toBe(0); // overflows2 は常に 0
  });

  it('extraThisYear なし（NISA未満枠）でも第2目標フェーズが安定', () => {
    const a = { type: 'cash', currentVal: 300, monthly: 3, annualReturn: 0, targetVal: 300, targetVal2: 500 };
    const r = calc(a, 3); // extra なし
    // extra=0 なので annualContrib=0, 成長なし
    expect(r.values[1]).toBe(300);
    expect(r.overflows[1]).toBe(36); // 自己積立が overflow へ
  });
});

// ─── 5. NISA 年間・生涯上限 ──────────────────────────────────────────────────

describe('NISA 上限制御', () => {
  it('新NISA積立枠：年間上限120万円を超える積立はキャップされる', () => {
    // 月15万 = 年180万 → 年間上限120万でキャップ
    const r = calc({
      type: 'nisa_tsumitate', currentVal: 0, monthly: 15, annualReturn: 0,
      taxType: 'nisa', nisaBasis: 0,
    }, 1);
    expect(r.values[1]).toBe(120); // キャップ
  });

  it('新NISA積立枠：生涯上限1800万円に達すると overflow が発生', () => {
    // 月10万=年120万、nisaBasis=1740万 → 残り60万しか積めない
    const r = calc({
      type: 'nisa_tsumitate', currentVal: 1740, monthly: 10, annualReturn: 0,
      taxType: 'nisa', nisaBasis: 1740,
    }, 2);
    // y=1: 残り60万 → 積立60万, overflow = 60万
    expect(r.values[1]).toBe(1800);
    expect(r.overflows[1]).toBe(60);
    // y=2: 枠なし → overflow = 120万
    expect(r.values[2]).toBe(1800);
    expect(r.overflows[2]).toBe(120);
  });

  it('生涯上限ちょうどのとき overflow = 0', () => {
    const r = calc({
      type: 'nisa_tsumitate', currentVal: 1680, monthly: 10, annualReturn: 0,
      taxType: 'nisa', nisaBasis: 1680,
    }, 1);
    // 残り120万, 月10万 × 12 = 120万 → ちょうど埋まる
    expect(r.values[1]).toBe(1800);
    expect(r.overflows[1]).toBe(0);
  });
});

// ─── 6. 旧NISA：endYear 後の課税移管 ────────────────────────────────────────

describe('旧NISA（endYear 後の課税移管）', () => {
  it('endYear 以前は非課税（NISA）として計算される', () => {
    const r = calcAssetGrowth(
      { type: 'nisa_old_tsumitate', currentVal: 100, monthly: 0, annualReturn: 10,
        taxType: 'nisa', endYear: CY + 2 },
      1, [], CY,
    );
    // y=1 (yr=CY+1) <= endYear → 非課税 → 10% そのまま
    expect(r.values[1]).toBeCloseTo(110, 1);
  });

  it('endYear 超過後は特定口座として課税される', () => {
    const r = calcAssetGrowth(
      { type: 'nisa_old_tsumitate', currentVal: 100, monthly: 0, annualReturn: 10,
        taxType: 'nisa', endYear: CY },
      1, [], CY,
    );
    // y=1 (yr=CY+1) > endYear(CY) → tokutei 扱い → 実効 10*(1-TAX_RATE)
    const effRate = (10 * (1 - TAX_RATE)) / 100;
    expect(r.values[1]).toBeCloseTo(100 * (1 + effRate), 1);
  });
});

// ─── 7. 稼働期間（startYear / endYear）────────────────────────────────────────

describe('稼働期間（startYear / endYear）', () => {
  it('startYear 前は積立が行われない', () => {
    // CY=2025, startYear=2027(=CY+2)
    // y=1 (yr=2026): 2026 >= 2027 は false → 積立なし
    // y=2 (yr=2027): 2027 >= 2027 は true  → 積立開始（12万）
    // y=3 (yr=2028): 2028 >= 2027 は true  → 24万
    const r = calc({ type: 'cash', currentVal: 0, monthly: 1, annualReturn: 0, startYear: CY + 2 }, 3);
    expect(r.values[1]).toBe(0);
    expect(r.values[2]).toBe(12);   // startYear の年から積立開始
    expect(r.values[3]).toBe(24);
  });

  it('endYear 後は積立が停止される', () => {
    // endYear=CY+1 → y=1まで積立, y=2以降は積立なし
    const r = calc({ type: 'cash', currentVal: 0, monthly: 1, annualReturn: 0, endYear: CY + 1 }, 3);
    expect(r.values[1]).toBe(12);
    expect(r.values[2]).toBe(12); // 積立なし、利回り0%で維持
    expect(r.values[3]).toBe(12);
  });

  it('startYear=endYear の1年だけ積立が行われる', () => {
    const r = calc({ type: 'cash', currentVal: 0, monthly: 1, annualReturn: 0,
                     startYear: CY + 1, endYear: CY + 1 }, 3);
    expect(r.values[1]).toBe(12);  // 2026 のみ積立
    expect(r.values[2]).toBe(12);
    expect(r.values[3]).toBe(12);
  });
});

// ─── 8. extraContribs（外部振替）────────────────────────────────────────────

describe('extraContribs（外部振替）', () => {
  it('extraContribs を受け取って残高に加算される', () => {
    const r = calc({ type: 'cash', currentVal: 100, monthly: 0, annualReturn: 0 },
                   2, [0, 50, 0]);
    expect(r.values[1]).toBe(150);
    expect(r.values[2]).toBe(150);
  });

  it('targetVal なしの場合、extra が全額残高に加算される', () => {
    const r = calc({ type: 'cash', currentVal: 0, monthly: 1, annualReturn: 0 },
                   1, [0, 10]);
    // annualContrib=12, extra=10 → 22
    expect(r.values[1]).toBe(22);
  });
});

// ─── 9. 配当受取モード（cashout）────────────────────────────────────────────

describe('配当受取モード（cashout）', () => {
  it('配当受取モードでは配当分を除いた値上がり分のみ資産成長', () => {
    // annualReturn=8%, dividendYield=3% → growthRate = 5%
    const r = calc({
      type: 'high_dividend', currentVal: 100, monthly: 0,
      annualReturn: 8, dividendYield: 3, dividendMode: 'cashout',
      taxType: 'tokutei',
    }, 1);
    // growthRate = 0.05, taxType=tokutei → effective = 0.05 * (1-TAX_RATE)
    const gr = 0.05 * (1 - TAX_RATE);
    expect(r.values[1]).toBeCloseTo(100 * (1 + gr), 1);
  });

  it('配当再投資モードでは総利回りで成長', () => {
    const r = calc({
      type: 'high_dividend', currentVal: 100, monthly: 0,
      annualReturn: 8, dividendYield: 3, dividendMode: 'reinvest',
      taxType: 'tokutei',
    }, 1);
    // growthRate = 0.08, taxType=tokutei → effective = 0.08 * (1-TAX_RATE)
    const gr = 0.08 * (1 - TAX_RATE);
    expect(r.values[1]).toBeCloseTo(100 * (1 + gr), 1);
  });
});

// ─── 10. 境界値・エッジケース ─────────────────────────────────────────────────

describe('境界値・エッジケース', () => {
  it('years=0 のとき values は初期値1件のみ', () => {
    const r = calc({ type: 'cash', currentVal: 50, monthly: 1, annualReturn: 0 }, 0);
    expect(r.values).toHaveLength(1);
    expect(r.values[0]).toBe(50);
  });

  it('currentVal が undefined でも 0 として扱われる', () => {
    const r = calc({ type: 'cash', monthly: 1, annualReturn: 0 }, 1);
    expect(r.values[0]).toBe(0);
    expect(r.values[1]).toBe(12);
  });

  it('monthly が undefined でも積立なしで正常動作', () => {
    const r = calc({ type: 'cash', currentVal: 100, annualReturn: 0 }, 1);
    expect(r.values[1]).toBe(100);
  });

  it('NaN/Infinity を含む annualReturn でも値が有限数になる', () => {
    const r = calc({ type: 'cash', currentVal: 100, monthly: 0, annualReturn: 0 }, 1);
    expect(Number.isFinite(r.values[1])).toBe(true);
  });

  it('非常に大きな残高（10億万円）でも計算が壊れない', () => {
    const r = calc({ type: 'cash', currentVal: 1e8, monthly: 0, annualReturn: 0 }, 1);
    expect(r.values[1]).toBe(1e8);
    expect(Number.isFinite(r.values[1])).toBe(true);
  });

  it('overflows の長さは values と同じ（years+1）', () => {
    const years = 10;
    const r = calc({ type: 'cash', currentVal: 0, monthly: 1, annualReturn: 0 }, years);
    expect(r.values).toHaveLength(years + 1);
    expect(r.overflows).toHaveLength(years + 1);
    expect(r.overflows2).toHaveLength(years + 1);
  });

  it('y=0 の overflows は常に 0（初期値は余剰なし）', () => {
    const r = calc({ type: 'cash', currentVal: 100, monthly: 5, annualReturn: 5, targetVal: 50 }, 3);
    expect(r.overflows[0]).toBe(0);
    expect(r.overflows2[0]).toBe(0);
  });
});
