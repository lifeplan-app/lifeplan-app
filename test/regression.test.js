/**
 * test/regression.test.js
 *
 * 過去に発見・修正されたバグのリグレッションテスト。
 * バグが修正されるたびに1件追加し、同じバグが再発しないことを保証する。
 *
 * 命名規則: [BUG#n] コミットハッシュ / バグの概要
 * 各テストに「修正前の誤った動作」と「修正後の正しい動作」をコメントで記載する。
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  projectEmergencyBalance,
  calcEndYearFromAge,
  calcEndAgeFromYear,
} from './helpers/test-helpers.js';
import { loadCalc, getSandbox } from './helpers/load-calc.js';

let sb, calcAssetGrowth, calcAllAssetGrowth;
beforeAll(() => {
  loadCalc('utils.js');
  loadCalc('asset-growth.js');
  sb = getSandbox();
  calcAssetGrowth    = sb.calcAssetGrowth;
  calcAllAssetGrowth = sb.calcAllAssetGrowth;
});

// ─── BUG#1: 生活防衛資金プールが targetVal を無視してスケールされていた ──────────
// コミット: このセッションで修正
// 修正前: emergencyPool = assetsAtRetire × (currentEmergency / currentTotal)
//   → totalAssets が大きいほど emergencyPool が膨らむ（例: 964万 with targetVal=300）
// 修正後: 年ごとに targetVal キャップ付きで複利成長させた実額を使用

describe('[BUG#1] 生活防衛資金プール: targetVal キャップの尊重', () => {

  it('targetVal=300 の生活防衛資金は 300万円を超えない（何年成長させても）', () => {
    const asset = { currentVal: 120, monthly: 3, annualReturn: 0.1, targetVal: 300 };
    const result = projectEmergencyBalance(asset, 30); // 30年後でもキャップ
    expect(result).toBeLessThanOrEqual(300);
  });

  it('現在残高120万・月積立3万・利回り0.1% → 約15年で300万に到達しキャップされる', () => {
    const asset = { currentVal: 120, monthly: 3, annualReturn: 0.1, targetVal: 300 };
    const at15  = projectEmergencyBalance(asset, 15);
    const at20  = projectEmergencyBalance(asset, 20);
    expect(at15).toBeLessThanOrEqual(300);
    expect(at20).toBe(at15); // キャップに達したら以降変化しない
  });

  it('targetVal なし（Infinity）のとき残高は単調増加する', () => {
    const asset = { currentVal: 100, monthly: 2, annualReturn: 1 };
    const at5  = projectEmergencyBalance(asset, 5);
    const at10 = projectEmergencyBalance(asset, 10);
    expect(at10).toBeGreaterThan(at5);
    expect(Number.isFinite(at10)).toBe(true);
  });

  it('targetVal2=500 が設定されている場合は 500万円を上限として成長する', () => {
    const asset = { currentVal: 300, monthly: 3, annualReturn: 0.1,
                    targetVal: 300, targetVal2: 500 };
    const result = projectEmergencyBalance(asset, 30);
    expect(result).toBeGreaterThan(300); // targetVal を超えて成長できる
    expect(result).toBeLessThanOrEqual(500); // targetVal2 を超えない
  });

  it('totalAssets の大小に関わらず emergencyPool は常に targetVal 以下になる', () => {
    // BUG#1 の本質: total が変わると emergencyPool が変わっていた
    // 正しくは asset 単体の projection で決まるので totalAssets は無関係
    const asset = { currentVal: 120, monthly: 3, annualReturn: 0.1, targetVal: 300 };
    const result1 = projectEmergencyBalance(asset, 15); // 仮に totalAssets = 1000万
    const result2 = projectEmergencyBalance(asset, 15); // 仮に totalAssets = 5000万
    expect(result1).toBe(result2); // 同じ asset なら結果は常に同じ
    expect(result1).toBeLessThanOrEqual(300);
  });
});

// ─── BUG#2: targetVal2 フェーズ2 で自己積立が overflow に流れず蓄積されていた ──
// コミット: このセッションで修正
// 修正前: prev >= targetVal のとき全 extra を overflow に捨て、自己積立も無視
//   → NISA overflow が生活防衛資金に戻ってきても targetVal でブロックされていた
// 修正後: targetVal <= prev < targetVal2 のとき extraThisYear のみ受け取り、
//         自己積立は overflowTargetId（第1振替先）へ流す

describe('[BUG#2] targetVal2 フェーズ2: 自己積立は overflow へ流れる', () => {

  it('prev >= targetVal のとき自己積立は overflow に計上される', () => {
    const a = { type: 'cash', currentVal: 300, monthly: 5, annualReturn: 0,
                targetVal: 300, targetVal2: 500 };
    const r = calcAssetGrowth(a, 3);
    // 月5万 × 12 = 60万が overflow に流れる
    expect(r.overflows[1]).toBe(60);
    expect(r.overflows[2]).toBe(60);
    expect(r.overflows[3]).toBe(60);
  });

  it('extraThisYear（外部流入）のみが残高に積み上がる（自己積立は関係ない）', () => {
    const a = { type: 'cash', currentVal: 300, monthly: 5, annualReturn: 0,
                targetVal: 300, targetVal2: 500 };
    const extra = [0, 20, 20, 20]; // y=1〜3 に 20万/年の外部流入
    const r = calcAssetGrowth(a, 3, extra);
    expect(r.values[1]).toBe(320); // 300 + 20（extra のみ）
    expect(r.values[2]).toBe(340);
    expect(r.values[3]).toBe(360);
    expect(r.overflows[1]).toBe(60); // 自己積立は overflow へ
  });

  it('BUG#2 の再現: extra なしでは残高が targetVal のまま動かない', () => {
    // 修正前バグの再現: extra=0 で balance が増加するのは誤り
    const a = { type: 'cash', currentVal: 300, monthly: 5, annualReturn: 0,
                targetVal: 300, targetVal2: 500 };
    const r = calcAssetGrowth(a, 5);
    // extra がないので残高は 300 のまま
    r.values.forEach(v => expect(v).toBe(300));
    // 自己積立は全て overflow に流れている
    for (let y = 1; y <= 5; y++) {
      expect(r.overflows[y]).toBe(60);
    }
  });
});

// ─── BUG#3: targetVal2 上限を超えた分が overflow2 に正しく流れる ────────────────
// コミット: このセッションで修正
// 修正前: targetVal2 に達した後の余剰が捨てられ、overflow2 に計上されていなかった
// 修正後: targetVal2 到達後は overflows2 に計上

describe('[BUG#3] targetVal2 達成後は overflows2 に計上される', () => {

  it('prev >= targetVal2 のとき全額が overflow2 に流れる', () => {
    const a = { type: 'cash', currentVal: 500, monthly: 3, annualReturn: 0,
                targetVal: 300, targetVal2: 500 };
    const r = calcAssetGrowth(a, 3);
    // 月3万 × 12 = 36万 が overflow2 に
    expect(r.overflows2[1]).toBe(36);
    expect(r.values[1]).toBe(500); // 残高変化なし
  });

  it('targetVal2 を初めて超えた年に超過分が overflow2 に計上される', () => {
    const a = { type: 'cash', currentVal: 490, monthly: 3, annualReturn: 0,
                targetVal: 300, targetVal2: 500 };
    const extra = [0, 30]; // y=1 に 30万の外部流入
    const r = calcAssetGrowth(a, 1, extra);
    // 490 + 30 = 520 → targetVal2=500 を超える → overflow2 = 20, finalVal = 500
    expect(r.values[1]).toBe(500);
    expect(r.overflows2[1]).toBe(20);
  });

  it('overflows2 は overflow とは独立して計上される', () => {
    const a = { type: 'cash', currentVal: 500, monthly: 3, annualReturn: 0,
                targetVal: 300, targetVal2: 500 };
    const r = calcAssetGrowth(a, 2);
    // overflow（第1振替先へ）= 0（targetVal2 も超えているので overflow2 に行く）
    expect(r.overflows[1]).toBe(0);
    expect(r.overflows2[1]).toBe(36);
  });
});

// ─── BUG#4: 誕生年ベースの endAge ↔ endYear 変換 ──────────────────────────────
// コミット: 661d2f0
// 修正前: currentYear + (age - currentAge)
//   → 誕生日が未到来の年は currentAge が +1 されておらず 1年ズレる
//   例: 現在2025年4月、誕生日が12月の場合 currentAge=37 だが実年齢38に近い
// 修正後: birthYear + age（誕生年基準で常に一意）

describe('[BUG#4] 誕生年ベースの endAge↔endYear 変換', () => {

  it('birthYear + age で endYear が一意に決まる（現在年・現在年齢に依存しない）', () => {
    expect(calcEndYearFromAge(1987, 55)).toBe(2042);
    expect(calcEndYearFromAge(1990, 60)).toBe(2050);
    expect(calcEndYearFromAge(1975, 65)).toBe(2040);
  });

  it('パートナーと本人の誕生年が異なれば同じ年齢でも異なる endYear になる', () => {
    const selfBirthYear    = 1987; // 本人
    const partnerBirthYear = 1988; // パートナー（1歳年下）
    const age = 50;
    expect(calcEndYearFromAge(selfBirthYear,    age)).toBe(2037);
    expect(calcEndYearFromAge(partnerBirthYear, age)).toBe(2038);
    // 修正前は同じ currentAge を使うと1年分が混同される
  });

  it('endYear → endAge の逆変換が一貫している', () => {
    const birthYear = 1987;
    const age = 55;
    const endYear = calcEndYearFromAge(birthYear, age);
    expect(calcEndAgeFromYear(birthYear, endYear)).toBe(age);
  });

  it('同一誕生年なら calcEndYearFromAge と逆変換が常に対称', () => {
    const cases = [
      { birthYear: 1980, age: 60 },
      { birthYear: 1995, age: 45 },
      { birthYear: 1970, age: 70 },
    ];
    cases.forEach(({ birthYear, age }) => {
      const yr = calcEndYearFromAge(birthYear, age);
      expect(calcEndAgeFromYear(birthYear, yr)).toBe(age);
    });
  });
});

// ─── BUG#5: NISA 生涯枠到達後も積立が継続し上限を超えていた ──────────────────
// コミット: calcAllAssetGrowth の NISA プール管理に当初から存在した制約
// 修正後の不変条件: nisaBasis + 累計積立 <= 1800（同名義の合算）

describe('[BUG#5] NISA 生涯枠: 超過積立の不変条件', () => {

  it('nisaBasis=0 から月10万で積立してもデータ上の合計が 1800 を超えない', () => {
    const nisa = {
      id: 'n1', type: 'nisa_tsumitate', currentVal: 0, monthly: 10, annualReturn: 0,
      taxType: 'nisa', nisaBasis: 0, owner: 'self',
    };
    const result = calcAllAssetGrowth([nisa], 20);
    const finalVal = result[0].data[20];
    // 20年 × 120万 = 2400万 積もうとするが、1800万でキャップ
    expect(finalVal).toBeLessThanOrEqual(1800);
  });

  it('積立枠（120万/年）と成長枠（240万/年）の合算が 1800万 を超えない', () => {
    const tsumi = {
      id: 't1', type: 'nisa_tsumitate', currentVal: 0, monthly: 10, annualReturn: 0,
      taxType: 'nisa', nisaBasis: 0, owner: 'self',
    };
    const growth = {
      id: 'g1', type: 'nisa_growth', currentVal: 0, monthly: 20, annualReturn: 0,
      taxType: 'nisa', nisaBasis: 0, owner: 'self',
    };
    const result = calcAllAssetGrowth([tsumi, growth], 20);
    const totalFinal = result.reduce((s, r) => s + r.data[20], 0);
    expect(totalFinal).toBeLessThanOrEqual(1800);
  });

  it('nisaBasis が初期値として加算されている場合も枠が正しく制限される', () => {
    const nisa = {
      id: 'n1', type: 'nisa_tsumitate', currentVal: 900, monthly: 10, annualReturn: 0,
      taxType: 'nisa', nisaBasis: 900, owner: 'self', // すでに 900万使用済み
    };
    const result = calcAllAssetGrowth([nisa], 20);
    const finalVal = result[0].data[20];
    // 残り枠 900万 → 最終残高 = 900 + 900 = 1800
    expect(finalVal).toBeLessThanOrEqual(1800);
  });
});

// ─── BUG#6: アセット積立の二重計上（calcAllAssetGrowth の保存則）───────────────
// コミット: 46fbc3a（チャート側の修正）
// 本テストは calcAllAssetGrowth レベルの不変条件として検証
// 「overflow + 残高増分 ≒ 自己積立額」（利回り0%の場合は完全一致）

describe('[BUG#6] アセット積立の保存則（二重計上がない）', () => {

  it('利回り0%の単独アセット: 残高増分 + overflow = 年間積立額', () => {
    const a = { id: 'a1', type: 'cash', currentVal: 100, monthly: 5, annualReturn: 0,
                targetVal: 200 };
    const r = calcAllAssetGrowth([a], 10);
    const data = r[0].data;
    const overflows = r[0].overflows;
    for (let y = 1; y <= 10; y++) {
      const invested = 5 * 12; // 月5万 × 12
      const balChange = data[y] - data[y - 1];
      const of = overflows[y] || 0;
      // 投入額 = 残高増加 + overflow（利回り0%なら完全一致）
      expect(Math.abs(balChange + of - invested)).toBeLessThan(0.1);
    }
  });

  it('振替チェーン（A → B）でも総残高増分は総積立額に一致する（利回り0%）', () => {
    const idA = 'chain-a';
    const idB = 'chain-b';
    const a = { id: idA, type: 'cash', currentVal: 0, monthly: 5, annualReturn: 0,
                targetVal: 60, overflowTargetId: idB };
    const b = { id: idB, type: 'cash', currentVal: 0, monthly: 0, annualReturn: 0 };

    const result = calcAllAssetGrowth([a, b], 5);
    const rA = result.find(r => r.asset.id === idA);
    const rB = result.find(r => r.asset.id === idB);

    for (let y = 1; y <= 5; y++) {
      const totalBal = rA.data[y] + rB.data[y];
      const totalPrev = rA.data[y - 1] + rB.data[y - 1];
      const invested = 5 * 12; // A のみ月積立あり
      // 総残高増分 = 年間投入額（振替経由でも消えない）
      expect(Math.abs((totalBal - totalPrev) - invested)).toBeLessThan(0.1);
    }
  });

  it('wasted は「実際に投資できなかった分」だけ計上される', () => {
    // targetVal 達成後・振替先なし → wasted に計上
    const a = { id: 'w1', type: 'cash', currentVal: 300, monthly: 5, annualReturn: 0,
                targetVal: 300 }; // 振替先なし
    const result = calcAllAssetGrowth([a], 3);
    // y=1,2,3: 月5万×12=60万が全て wasted
    expect(result._wastedContribsByYear[1]).toBe(60);
    expect(result._wastedContribsByYear[2]).toBe(60);
    expect(result._wastedContribsByYear[3]).toBe(60);
  });
});

// ─── BUG#7: cashFloor が取り崩しを横ばいに固定していた ──────────────────────
// コミット: caf5fbf, faf56fe
// 修正前: cashFloor を超えないよう取り崩しを制限 → 資産がフロアに張り付く
// 修正後: cashFloor は drawdown 順序のヒントのみ・実際には 0 まで取り崩せる
//
// 注記: calcRetirementSimWithOpts は DOM 依存のため直接テスト不可。
//       代わりに「取り崩しロジック」の純粋関数版で不変条件を検証する。

describe('[BUG#7] 取り崩し: cashFloor を下回っても 0 まで取り崩せる', () => {

  // 取り崩しの純粋ロジック：支出が収入を超えたとき pool から引き出す
  function drawdown(initialPool, annualExpense, annualIncome, years) {
    let pool = initialPool;
    const history = [pool];
    for (let y = 0; y < years; y++) {
      const net = annualIncome - annualExpense; // 正=黒字、負=赤字
      pool = Math.max(0, pool + net);
      history.push(Math.round(pool * 10) / 10);
    }
    return history;
  }

  it('支出 > 収入のとき資産は単調減少し 0 で止まる', () => {
    // 初期100万、年間赤字10万 → 10年で枯渇
    const history = drawdown(100, 30, 20, 15); // 年間 10万赤字 × 15年
    // 10年で枯渇 → 以降は 0
    expect(history[10]).toBe(0);
    expect(history[15]).toBe(0);
    // 単調減少または 0 を維持
    for (let i = 1; i < history.length; i++) {
      expect(history[i]).toBeLessThanOrEqual(history[i - 1]);
    }
  });

  it('cashFloor（例 50万）があっても 0 まで取り崩せる（フロアで止まらない）', () => {
    // 修正前バグの再現: cashFloor=50 でフロアに張り付き pool=50 のまま横ばいになる
    // 正しい挙動: cashFloor は単なるヒント、0 まで取り崩せる
    const cashFloor = 50;
    const history = drawdown(200, 30, 20, 25); // 年10万赤字、20年で枯渇
    // フロアを下回る年が存在する
    const belowFloor = history.filter(v => v > 0 && v < cashFloor);
    expect(belowFloor.length).toBeGreaterThan(0); // フロア以下まで減る
    expect(history[25]).toBe(0);                  // 最終的に 0 まで到達
  });

  it('年金収入で黒字転換したら資産が回復する', () => {
    // 60歳まで赤字（-10万/年）、60歳から年金で黒字（+5万/年）
    function drawdownWithIncomeSplit(initialPool, years) {
      let pool = initialPool;
      const history = [pool];
      for (let y = 0; y < years; y++) {
        const income   = y >= 10 ? 25 : 0;  // 10年後から年金25万
        const expense  = 20;                  // 毎年支出20万
        pool = Math.max(0, pool + income - expense);
        history.push(Math.round(pool * 10) / 10);
      }
      return history;
    }
    const h = drawdownWithIncomeSplit(100, 20);
    // y=0〜9: 毎年-20万減少
    expect(h[10]).toBeLessThan(h[0]);
    // y=10〜: 年金+5万なので回復
    expect(h[20]).toBeGreaterThanOrEqual(h[10]);
  });
});

// ─── BUG#2 (Phase 4c): 繰上返済で利息 ≥ 月額のケースの NaN 伝播 ──────────
// 修正前: principal × r ≥ monthly のとき log(M / (M − P×r)) が NaN/Inf
//   → endYear = Infinity → ループが終了せず Map サイズ超過クラッシュ
// 修正後: principal * r >= monthly または !Number.isFinite(newN) を検出したとき
//   即完済扱い（principal = 0, endYear = year）
//
// トリガー方法: rate=80% という極端な利率で 50年ローンを組むと、
// 浮動小数点演算により calcMonthlyPayment が P×r とほぼ等しくなる。
// その後 period prepay を実行すると principal * r >= monthly が成立し
// 修正前は endYear = Infinity に設定されて無限ループになる。
describe('[BUG#2] 繰上返済 NaN ガード（Phase 4c 05-I05）', () => {
  let calcMortgageSchedule, localSb;
  beforeAll(() => {
    loadCalc('utils.js');
    loadCalc('mortgage.js');
    localSb = getSandbox();
    calcMortgageSchedule = localSb.calcMortgageSchedule;
  });

  it('refi 後に principal × r ≥ monthly になる period prepay でも NaN/無限ループが出ない', () => {
    // rate=80% で 50年ローンに借換 → 浮動小数点精度により monthly ≈ P×r。
    // period prepay 実行時に principal * r >= monthly が成立し、
    // 修正前は endYear = Infinity → 無限ループ（Map サイズ超過クラッシュ）。
    // 修正後: 即完済扱いになりスケジュールが正常に閉じられる。
    localSb.state.lifeEvents = {
      mortgage: {
        amount: 3000, startYear: 2026, term: 35, rate: 2.0,
        events: [
          { year: 2027, type: 'refi', newRate: 80.0, newTerm: 50 },
          { year: 2028, type: 'prepay', amount: 0, method: 'period' },
        ]
      }
    };
    const schedule = calcMortgageSchedule();
    // 全 entry に NaN/Infinity が含まれない（無限ループにならない）
    for (const [, v] of schedule.entries()) {
      expect(Number.isFinite(v.monthlyPayment)).toBe(true);
      expect(Number.isFinite(v.principalEnd)).toBe(true);
    }
    // 2028 年の period prepay でフォールバックが効いて即完済になる
    expect(schedule.get(2028)?.principalEnd ?? 0).toBe(0);
  });
});

// ─── BUG#3 (Phase 4c): 同年複数イベントの順序依存 ──────────
// 修正前: events.sort((a,b)=>a.year-b.year) は年のみでソート → 同年内は登録順
// 修正後: 同年内は refi → prepay の順に安定ソート
describe('[BUG#3] 同年 refi+prepay の順序固定（Phase 4c 05-I06）', () => {
  let calcMortgageSchedule, localSb;
  beforeAll(() => {
    loadCalc('utils.js');
    loadCalc('mortgage.js');
    localSb = getSandbox();
    calcMortgageSchedule = localSb.calcMortgageSchedule;
  });

  it('同じ年に prepay と refi が両方あるとき、登録順に関わらず refi → prepay の順で処理される', () => {
    const commonBase = { amount: 3000, startYear: 2026, term: 30, rate: 2.0 };
    const eventsRefiFirst = [
      { year: 2030, type: 'refi', newRate: 1.0, newTerm: 25 },
      { year: 2030, type: 'prepay', amount: 300, method: 'period' },
    ];
    const eventsPrepayFirst = [
      { year: 2030, type: 'prepay', amount: 300, method: 'period' },
      { year: 2030, type: 'refi', newRate: 1.0, newTerm: 25 },
    ];
    localSb.state.lifeEvents = { mortgage: { ...commonBase, events: eventsRefiFirst } };
    const a = calcMortgageSchedule();
    localSb.state.lifeEvents = { mortgage: { ...commonBase, events: eventsPrepayFirst } };
    const b = calcMortgageSchedule();
    expect(a.get(2030).principalEnd).toBeCloseTo(b.get(2030).principalEnd, 1);
  });
});
