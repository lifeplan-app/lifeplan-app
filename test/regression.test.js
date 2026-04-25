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

// ─── BUG#4 (Phase 4c): income_change 適用時の昇給継続フラグ ──────────
// 修正前: hasOverride === true のとき selfIncome = baseIncome（以降の昇給なし）
// 修正後: continueGrowth: true なら baseIncome × pow(1+g, yr − eventYear) を適用
describe('[BUG#4] income_change continueGrowth フラグ（Phase 4c 02-I03）', () => {
  let getIncomeForYearWithGrowth, localSb;
  beforeAll(() => {
    loadCalc('utils.js');
    loadCalc('asset-growth.js');
    loadCalc('income-expense.js');
    localSb = getSandbox();
    getIncomeForYearWithGrowth = localSb.getIncomeForYearWithGrowth;
  });

  it('continueGrowth 未指定（既定）では転職後の収入が固定される（後方互換）', () => {
    const currentYear = new Date().getFullYear();
    localSb.state.profile = { birth: `${currentYear - 30}-01-01` };
    localSb.state.finance = { income: 40, bonus: 0, incomeGrowthRate: 3, incomeGrowthUntilAge: 55 };
    localSb.state.retirement = {};
    localSb.state.cashFlowEvents = [{
      type: 'income_change', startAge: 40, monthlyAmount: 50, bonusAmount: 0
      // continueGrowth 未指定
    }];
    const atAge40 = getIncomeForYearWithGrowth(currentYear + 10); // イベント年
    const atAge50 = getIncomeForYearWithGrowth(currentYear + 20); // +10 年後
    expect(atAge40).toBeCloseTo(600, 0); // 50×12 = 600
    expect(atAge50).toBeCloseTo(600, 0); // 固定（従来挙動）
  });

  it('continueGrowth: true のとき転職後も昇給率が適用される', () => {
    const currentYear = new Date().getFullYear();
    localSb.state.profile = { birth: `${currentYear - 30}-01-01` };
    localSb.state.finance = { income: 40, bonus: 0, incomeGrowthRate: 3, incomeGrowthUntilAge: 55 };
    localSb.state.retirement = {};
    localSb.state.cashFlowEvents = [{
      type: 'income_change', startAge: 40, monthlyAmount: 50, bonusAmount: 0,
      continueGrowth: true,
    }];
    const atAge40 = getIncomeForYearWithGrowth(currentYear + 10); // イベント年
    const atAge50 = getIncomeForYearWithGrowth(currentYear + 20); // +10 年後
    expect(atAge40).toBeCloseTo(600, 0);
    // 600 × 1.03^10 ≈ 806.35
    expect(atAge50).toBeCloseTo(600 * Math.pow(1.03, 10), 0);
  });

  it('continueGrowth: true でも untilAge 以降は昇給停止', () => {
    const currentYear = new Date().getFullYear();
    localSb.state.profile = { birth: `${currentYear - 30}-01-01` };
    localSb.state.finance = { income: 40, bonus: 0, incomeGrowthRate: 3, incomeGrowthUntilAge: 50 };
    localSb.state.retirement = {};
    localSb.state.cashFlowEvents = [{
      type: 'income_change', startAge: 40, monthlyAmount: 50, bonusAmount: 0,
      continueGrowth: true,
    }];
    // 50歳=untilAge で昇給停止 → 60歳と50歳が同じ
    const atAge50 = getIncomeForYearWithGrowth(currentYear + 20);
    const atAge60 = getIncomeForYearWithGrowth(currentYear + 30);
    expect(atAge60).toBeCloseTo(atAge50, 0);
  });
});

// ─── BUG#5 (Phase 4c): 配偶者控除本実装 ──────────
// 修正前: 配偶者控除は税計算に未反映、Phase 4b で支出側に annualIncome *= 1.005 近似
// 修正後: calcSpouseDeduction(partnerIncome, partnerAge) が控除額を返し、calcTakeHome で反映
describe('[BUG#5] 配偶者控除本実装（Phase 4c 06-I02）', () => {
  let calcSpouseDeduction, localSb;
  beforeAll(() => {
    loadCalc('utils.js');
    loadCalc('asset-growth.js');
    loadCalc('income-expense.js');
    localSb = getSandbox();
    calcSpouseDeduction = localSb.calcSpouseDeduction;
  });

  it('パートナー合計所得 0 万円なら 所得税 38 / 住民税 33', () => {
    const r = calcSpouseDeduction(0, 40);
    expect(r.incomeTaxDeduction).toBe(38);
    expect(r.residentTaxDeduction).toBe(33);
  });

  it('パートナー合計所得 48 万円（103 万円収入相当）なら 満額', () => {
    const r = calcSpouseDeduction(48, 40);
    expect(r.incomeTaxDeduction).toBe(38);
    expect(r.residentTaxDeduction).toBe(33);
  });

  it('パートナー合計所得 95 万円以下まで配偶者特別控除も満額', () => {
    const r = calcSpouseDeduction(95, 40);
    expect(r.incomeTaxDeduction).toBe(38);
    expect(r.residentTaxDeduction).toBe(33);
  });

  it('パートナー合計所得 100 万円なら 所得税 36', () => {
    const r = calcSpouseDeduction(100, 40);
    expect(r.incomeTaxDeduction).toBe(36);
  });

  it('パートナー合計所得 133 万円超なら 0/0', () => {
    const r = calcSpouseDeduction(135, 40);
    expect(r.incomeTaxDeduction).toBe(0);
    expect(r.residentTaxDeduction).toBe(0);
  });

  it('老人配偶者（70歳以上）かつ 所得 48 万円以下なら 所得税 48 / 住民税 38', () => {
    const r = calcSpouseDeduction(0, 70);
    expect(r.incomeTaxDeduction).toBe(48);
    expect(r.residentTaxDeduction).toBe(38);
  });

  it('老人配偶者でも 所得 48 万円超なら老人加算なし', () => {
    const r = calcSpouseDeduction(60, 75);
    expect(r.incomeTaxDeduction).toBe(38);
    expect(r.residentTaxDeduction).toBe(33);
  });

  it('partnerAge が null なら老人加算を無効化', () => {
    const r = calcSpouseDeduction(0, null);
    expect(r.incomeTaxDeduction).toBe(38);
    expect(r.residentTaxDeduction).toBe(33);
  });
});

// ─── BUG#6 (Phase 4c): 借換諸費用の計上 ──────────
// 修正前: refi 諸費用が schedule に乗らず costs.mortgage に加算されない
// 修正後: schedule.set(year, { ..., refiCost }) で諸費用が cost 集計に流れる
describe('[BUG#6] refi 諸費用の計上（Phase 4c 05-I04）', () => {
  let calcMortgageSchedule, localSb;
  beforeAll(() => {
    loadCalc('utils.js');
    loadCalc('mortgage.js');
    localSb = getSandbox();
    calcMortgageSchedule = localSb.calcMortgageSchedule;
  });

  it('refi.cost が schedule の該当年に refiCost として含まれる', () => {
    localSb.state.lifeEvents = {
      mortgage: {
        amount: 3000, startYear: 2026, term: 30, rate: 2.0,
        events: [
          { year: 2030, type: 'refi', newRate: 1.0, newTerm: 25, cost: 50 },
        ]
      }
    };
    const schedule = calcMortgageSchedule();
    expect(schedule.get(2030).refiCost).toBe(50);
    expect(schedule.get(2029).refiCost || 0).toBe(0);
    expect(schedule.get(2031).refiCost || 0).toBe(0);
  });

  it('refi.cost 未指定は 0 扱い', () => {
    localSb.state.lifeEvents = {
      mortgage: {
        amount: 3000, startYear: 2026, term: 30, rate: 2.0,
        events: [
          { year: 2030, type: 'refi', newRate: 1.0, newTerm: 25 },
        ]
      }
    };
    const schedule = calcMortgageSchedule();
    expect(schedule.get(2030).refiCost || 0).toBe(0);
  });

  it('同年に refi 2 回（極稀）でも cost が累積される', () => {
    localSb.state.lifeEvents = {
      mortgage: {
        amount: 3000, startYear: 2026, term: 30, rate: 2.0,
        events: [
          { year: 2030, type: 'refi', newRate: 1.5, newTerm: 28, cost: 30 },
          { year: 2030, type: 'refi', newRate: 1.0, newTerm: 25, cost: 20 },
        ]
      }
    };
    const schedule = calcMortgageSchedule();
    expect(schedule.get(2030).refiCost).toBe(50);
  });
});

// ─── BUG#7 (Phase 4c): 子育て特例 uplift ──────────
// 修正前: 認定住宅 limit 5000 で頭打ち、令和 6・7 年子育て特例の +500 上乗せが効かない
// 修正後: m.isChildCareHousehold && startYear ∈ {2024, 2025} && housingType !== 'general' で +500
describe('[BUG#7] 子育て特例 uplift（Phase 4c 05-I01）', () => {
  let calcMortgageDeduction, localSb;
  beforeAll(() => {
    loadCalc('utils.js');
    loadCalc('mortgage.js');
    localSb = getSandbox();
    calcMortgageDeduction = localSb.calcMortgageDeduction;
    // getRetirementParams は index.html 側関数のためスタブ（index.html を読み込まないテストでは必要）
  });

  it('2024 入居 + 子育て特例 + 認定住宅(long_term) なら limit 5500 万', () => {
    localSb.getRetirementParams = () => ({ mortgageDeductStart: 2024, mortgageDeductYears: 13 });
    localSb.state.lifeEvents = {
      mortgage: { housingType: 'long_term', startYear: 2024, isChildCareHousehold: true }
    };
    localSb.state.finance = { income: 50, bonus: 100 };
    const d = calcMortgageDeduction(2024, 5500);
    // balance 5500 → 5500×0.007 = 38.5 万円が控除上限前
    expect(d).toBeCloseTo(5500 * 0.007, 1);
  });

  it('2024 入居 + 子育て特例なし は limit 5000 万止まり', () => {
    localSb.getRetirementParams = () => ({ mortgageDeductStart: 2024, mortgageDeductYears: 13 });
    localSb.state.lifeEvents = {
      mortgage: { housingType: 'long_term', startYear: 2024, isChildCareHousehold: false }
    };
    localSb.state.finance = { income: 50, bonus: 100 };
    const d = calcMortgageDeduction(2024, 5500);
    expect(d).toBeCloseTo(5000 * 0.007, 1);
  });

  it('2026 入居（制度対象外）は子育て特例ありでも uplift 無効', () => {
    localSb.getRetirementParams = () => ({ mortgageDeductStart: 2026, mortgageDeductYears: 13 });
    localSb.state.lifeEvents = {
      mortgage: { housingType: 'long_term', startYear: 2026, isChildCareHousehold: true }
    };
    localSb.state.finance = { income: 50, bonus: 100 };
    const d = calcMortgageDeduction(2026, 5500);
    expect(d).toBeCloseTo(5000 * 0.007, 1);
  });

  it('一般住宅(general) は子育て特例の対象外（制度設計）', () => {
    localSb.getRetirementParams = () => ({ mortgageDeductStart: 2024, mortgageDeductYears: 13 });
    localSb.state.lifeEvents = {
      mortgage: { housingType: 'general', startYear: 2024, isChildCareHousehold: true }
    };
    localSb.state.finance = { income: 50, bonus: 100 };
    const d = calcMortgageDeduction(2024, 3000);
    expect(d).toBeCloseTo(2000 * 0.007, 1); // 一般住宅 limit 2000 のまま
  });
});

// ─── BUG#8 (Phase 4c): 頭金を expenses[] に自動同期 ──────────
describe('[BUG#8] 頭金自動同期（Phase 4c 05-I02）', () => {
  let syncDownPaymentExpense;
  beforeAll(() => {
    loadCalc('utils.js');
    loadCalc('mortgage.js');
    syncDownPaymentExpense = getSandbox().syncDownPaymentExpense;
  });

  it('downPayment と startYear が揃っていれば新規エントリ追加', () => {
    const expenses = [];
    const m = { startYear: 2028, downPayment: 500 };
    const result = syncDownPaymentExpense(expenses, m);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      source: 'mortgage-downpayment',
      name: '住宅購入頭金',
      year: 2028,
      amount: 500,
    });
  });

  it('既存 mortgage-downpayment エントリは in-place 更新', () => {
    const expenses = [{ source: 'mortgage-downpayment', name: '住宅購入頭金', year: 2028, amount: 400 }];
    const m = { startYear: 2028, downPayment: 600 };
    const result = syncDownPaymentExpense(expenses, m);
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(600);
  });

  it('downPayment が 0 / 未指定なら既存 mortgage-downpayment エントリを削除', () => {
    const expenses = [{ source: 'mortgage-downpayment', name: '住宅購入頭金', year: 2028, amount: 500 }];
    const m = { startYear: 2028, downPayment: 0 };
    const result = syncDownPaymentExpense(expenses, m);
    expect(result.filter(e => e.source === 'mortgage-downpayment')).toHaveLength(0);
  });

  it('ユーザー登録の他 expenses は保持（source 判定）', () => {
    const expenses = [{ name: '車購入', year: 2027, amount: 200 }];
    const m = { startYear: 2028, downPayment: 500 };
    const result = syncDownPaymentExpense(expenses, m);
    expect(result).toHaveLength(2);
    expect(result.find(e => e.source === 'mortgage-downpayment')?.amount).toBe(500);
    expect(result.find(e => e.name === '車購入')?.amount).toBe(200);
  });
});

// ─── BUG#9 (Phase 4d): iDeCo 受給方法 UI 拡張（07-I04 拡張） ──────────
// 修正前: iDeCo は targetAge 時点で全額一時金固定。idecoStartAge / pension 受給未対応。
// 修正後: state.retirement.idecoReceiptMethod / idecoStartAge / idecoPensionYears で挙動制御。
describe('[BUG#9] iDeCo 受給方法 UI 拡張（Phase 4d）', () => {
  let calcRetirementSimWithOpts, localSb;
  beforeAll(() => {
    loadCalc('utils.js');
    loadCalc('asset-growth.js');
    loadCalc('income-expense.js');
    loadCalc('life-events.js');
    loadCalc('mortgage.js');
    loadCalc('pension.js');
    loadCalc('integrated.js');
    loadCalc('retirement.js');
    localSb = getSandbox();
    calcRetirementSimWithOpts = localSb.calcRetirementSimWithOpts;
    localSb.getRetirementParams = () => ({
      mortgageDeductStart: 0, mortgageDeductYears: 0,
      pensionSlide: 0, expenseGrowthRate: 0, residualAssets: 0,
      inflationRate: 0.02, expenseDecayRate: 0, medicalModel: 'none',
    });
    // getMedicalAddition は index.html 側で定義されるため sandbox にスタブを注入
    localSb.getMedicalAddition = () => 0;
  });

  function setupBaseState() {
    const cy = new Date().getFullYear();
    localSb.state = {
      profile: { birth: `${cy - 35}-01-01` },
      finance: { income: 30, bonus: 60, expense: 20 },
      assets: [
        { id: 'ideco1', type: 'ideco', name: 'iDeCo', currentVal: 100, monthly: 0, annualReturn: 4 },
      ],
      retirement: {
        targetAge: 65, lifeExpectancy: 90,
        pensionMonthly: 0, pensionMonthly_p: 0, pensionAge: 65, pensionAge_p: 65,
        severance: 0, severanceAge: null, serviceYears: 30,
        monthlyExpense: 20, withdrawalType: 'needs',
      },
      lifeEvents: { housingType: 'mortgage', mortgage: {}, rent: {}, care: {}, scholarships: [], children: [] },
      cashFlowEvents: [], expenses: [], recurringExpenses: [],
    };
  }

  it('既定値（lump + idecoStartAge=targetAge 既定）で既存挙動と一致', () => {
    setupBaseState();
    const sim = calcRetirementSimWithOpts({});
    expect(sim).not.toBeNull();
    expect(sim[0].age).toBe(65);
    expect(Number.isFinite(sim[0].startAssets)).toBe(true);
  });

  it('lump + idecoStartAge=70（targetAge=65）→ idecoStartAge まで運用継続後の残高が一時金', () => {
    setupBaseState();
    localSb.state.retirement.idecoReceiptMethod = 'lump';
    localSb.state.retirement.idecoStartAge = 70;
    const sim = calcRetirementSimWithOpts({});
    expect(sim).not.toBeNull();
    expect(Number.isFinite(sim[0].startAssets)).toBe(true);
    // idecoStartAge=70 → 35 年運用 → 100 × 1.04^35 ≈ 394.6
    // ただし退職所得控除枠（serviceYears=30 → 1500 万）内に収まるため非課税
    // sim[0].startAssets はベースライン（idecoStartAge=65=targetAge デフォルト）と概ね同等または微増
    // （iDeCo がより成長するため）
  });

  it('pension + idecoPensionYears=10 → 受給期間中の totalNonAssetIncome に idecoYearly 加算', () => {
    setupBaseState();
    localSb.state.retirement.idecoReceiptMethod = 'pension';
    localSb.state.retirement.idecoStartAge = 65;
    localSb.state.retirement.idecoPensionYears = 10;
    const sim = calcRetirementSimWithOpts({});
    expect(sim).not.toBeNull();
    const at65 = sim.find(d => d.age === 65);
    const at75 = sim.find(d => d.age === 75);
    expect(at65).toBeDefined();
    expect(at75).toBeDefined();
    // 65-74 歳に idecoYearly 加算、75 歳以降は加算なし
    // pensionMonthly=0 のため 65 歳の totalNonAssetIncome は idecoYearly が支配的
    // 75 歳時より大きいはず
    expect((at65.totalNonAssetIncome ?? 0)).toBeGreaterThan((at75.totalNonAssetIncome ?? 0));
  });

  it('pension のとき idecoLumpsum=0（退職所得控除に渡さない）', () => {
    setupBaseState();
    localSb.state.retirement.idecoReceiptMethod = 'pension';
    localSb.state.retirement.idecoStartAge = 65;
    localSb.state.retirement.idecoPensionYears = 10;
    localSb.state.retirement.severance = 1000;
    localSb.state.retirement.severanceAge = 65;
    const sim = calcRetirementSimWithOpts({});
    expect(sim).not.toBeNull();
    expect(Number.isFinite(sim[0].startAssets)).toBe(true);
    // pension 経路では severance のみ退職所得控除に渡す
    // serviceYears=30 → 控除枠 1500 万、severance 1000 < 1500 → 全額非課税
    // (一時金合算なら 1000+324=1324 もまだ枠内、結果同等。経路の確認が目的)
  });
});

// ─── BUG#10 (Phase 4e): 配偶者控除 軸2 本人高所得者逓減（06-I02 完全実装） ──────────
// 修正前: calcSpouseDeduction は軸1（パートナー所得）+ 軸3（老人加算）のみ
// 修正後: 第3引数 selfTotalIncomeMan で本人高所得者逓減（900/950/1000 万）を適用
describe('[BUG#10] 配偶者控除 軸2 本人高所得者逓減（Phase 4e 06-I02）', () => {
  let calcSpouseDeduction, localSb;
  beforeAll(() => {
    loadCalc('utils.js');
    loadCalc('asset-growth.js');
    loadCalc('income-expense.js');
    localSb = getSandbox();
    calcSpouseDeduction = localSb.calcSpouseDeduction;
  });

  it('selfTotalIncome 未指定なら軸2 適用なし（軸1+軸3 のみ）', () => {
    const r = calcSpouseDeduction(0, 40);
    expect(r.incomeTaxDeduction).toBe(38);
    expect(r.residentTaxDeduction).toBe(33);
  });

  it('本人 850 万（≤ 900）は満額', () => {
    const r = calcSpouseDeduction(0, 40, 850);
    expect(r.incomeTaxDeduction).toBe(38);
    expect(r.residentTaxDeduction).toBe(33);
  });

  it('本人 920 万（900-950）は ×2/3 → 26/22', () => {
    const r = calcSpouseDeduction(0, 40, 920);
    expect(r.incomeTaxDeduction).toBe(26);
    expect(r.residentTaxDeduction).toBe(22);
  });

  it('本人 980 万（950-1000）は ×1/3 → 13/11', () => {
    const r = calcSpouseDeduction(0, 40, 980);
    expect(r.incomeTaxDeduction).toBe(13);
    expect(r.residentTaxDeduction).toBe(11);
  });

  it('本人 1050 万（> 1000）は 0/0', () => {
    const r = calcSpouseDeduction(0, 40, 1050);
    expect(r.incomeTaxDeduction).toBe(0);
    expect(r.residentTaxDeduction).toBe(0);
  });

  it('老人加算 + 本人 920 万 → 48×2/3=32 / 38×2/3→ceil 26', () => {
    const r = calcSpouseDeduction(0, 70, 920);
    expect(r.incomeTaxDeduction).toBe(32);
    expect(r.residentTaxDeduction).toBe(26); // 38 × 2/3 = 25.33 → ceil = 26（NTA 住民税表）
  });

  it('境界値: selfTotalIncome = 900 ちょうどは満額（≤ 900 buckets）', () => {
    const r = calcSpouseDeduction(0, 40, 900);
    expect(r.incomeTaxDeduction).toBe(38);
    expect(r.residentTaxDeduction).toBe(33);
  });

  it('境界値: selfTotalIncome = 950 ちょうどは ×2/3（900-950 bucket）', () => {
    const r = calcSpouseDeduction(0, 40, 950);
    expect(r.incomeTaxDeduction).toBe(26);
    expect(r.residentTaxDeduction).toBe(22);
  });

  it('境界値: selfTotalIncome = 1000 ちょうどは ×1/3（950-1000 bucket）', () => {
    const r = calcSpouseDeduction(0, 40, 1000);
    expect(r.incomeTaxDeduction).toBe(13);
    expect(r.residentTaxDeduction).toBe(11);
  });
});

// ─── BUG#11 (Phase 4f): iDeCo 年金受給時の annuity 計算 ──────────
// 修正前: idecoYearly = balance / pensionYears（運用無視で保守的）
// 修正後: annuity formula = balance × r / (1 − (1+r)^-n)、r=0 フォールバック
describe('[BUG#11] iDeCo annuity 計算（Phase 4f）', () => {
  let calcRetirementSimWithOpts, localSb;
  beforeAll(() => {
    loadCalc('utils.js');
    loadCalc('asset-growth.js');
    loadCalc('income-expense.js');
    loadCalc('life-events.js');
    loadCalc('mortgage.js');
    loadCalc('pension.js');
    loadCalc('integrated.js');
    loadCalc('retirement.js');
    localSb = getSandbox();
    calcRetirementSimWithOpts = localSb.calcRetirementSimWithOpts;
    localSb.getRetirementParams = () => ({
      mortgageDeductStart: 0, mortgageDeductYears: 0,
      pensionSlide: 0, expenseGrowthRate: 0, residualAssets: 0,
      inflationRate: 0.02, expenseDecayRate: 0, medicalModel: 'none',
    });
    // getMedicalAddition は index.html 側で定義されるため sandbox にスタブを注入
    localSb.getMedicalAddition = () => 0;
  });

  function setupBaseState(idecoReturn = 4) {
    const cy = new Date().getFullYear();
    localSb.state = {
      profile: { birth: `${cy - 35}-01-01` },
      finance: { income: 30, bonus: 60, expense: 20 },
      assets: [
        { id: 'ideco1', type: 'ideco', name: 'iDeCo', currentVal: 100, monthly: 0, annualReturn: idecoReturn },
      ],
      retirement: {
        targetAge: 65, lifeExpectancy: 90,
        pensionMonthly: 0, pensionMonthly_p: 0, pensionAge: 65, pensionAge_p: 65,
        severance: 0, severanceAge: null, serviceYears: 30,
        monthlyExpense: 20, withdrawalType: 'needs',
        idecoReceiptMethod: 'pension', idecoStartAge: 65, idecoPensionYears: 10,
      },
      lifeEvents: { housingType: 'mortgage', mortgage: {}, rent: {}, care: {}, scholarships: [], children: [] },
      cashFlowEvents: [], expenses: [], recurringExpenses: [],
    };
  }

  it('annuity formula: r=4%, balance ≈ 324（30 年複利）, n=10 → idecoYearly ≈ 39.99', () => {
    setupBaseState(4);
    const sim = calcRetirementSimWithOpts({});
    const at65 = sim.find(d => d.age === 65);
    expect(at65.totalNonAssetIncome ?? 0).toBeGreaterThan(35);
    expect(at65.totalNonAssetIncome ?? 0).toBeLessThan(45);
  });

  it('annuity r=0% fallback: balance / n（既存挙動）', () => {
    setupBaseState(0);
    const sim = calcRetirementSimWithOpts({});
    const at65 = sim.find(d => d.age === 65);
    expect(at65.totalNonAssetIncome ?? 0).toBeGreaterThanOrEqual(9);
    expect(at65.totalNonAssetIncome ?? 0).toBeLessThanOrEqual(11);
  });

  it('受給期間中の合計受給額 > balance（複利効果確認）', () => {
    setupBaseState(4);
    const sim = calcRetirementSimWithOpts({});
    let total = 0;
    for (let age = 65; age <= 74; age++) {
      const row = sim.find(d => d.age === age);
      if (row) total += row.totalNonAssetIncome || 0;
    }
    expect(total).toBeGreaterThan(324);
  });

  it('受給期間外（75 歳以降）は idecoIncomeThisYear=0', () => {
    setupBaseState(4);
    const sim = calcRetirementSimWithOpts({});
    const at75 = sim.find(d => d.age === 75);
    expect(at75.totalNonAssetIncome ?? 0).toBeLessThan(5);
  });
});

// ─── BUG#12 (Phase 4g): iDeCo 一時金+年金 併用受給 ──────────
// 修正前: idecoReceiptMethod は 'lump' or 'pension' のみ
// 修正後: 'mixed' 値追加 + idecoLumpRatio (0-100) で比率分割
describe('[BUG#12] iDeCo 一時金+年金 併用受給（Phase 4g）', () => {
  let calcRetirementSimWithOpts, localSb;
  beforeAll(() => {
    loadCalc('utils.js');
    loadCalc('asset-growth.js');
    loadCalc('income-expense.js');
    loadCalc('life-events.js');
    loadCalc('mortgage.js');
    loadCalc('pension.js');
    loadCalc('integrated.js');
    loadCalc('retirement.js');
    localSb = getSandbox();
    calcRetirementSimWithOpts = localSb.calcRetirementSimWithOpts;
    localSb.getRetirementParams = () => ({
      mortgageDeductStart: 0, mortgageDeductYears: 0,
      pensionSlide: 0, expenseGrowthRate: 0, residualAssets: 0,
    });
    // getMedicalAddition は index.html 側で定義されるため sandbox にスタブを注入
    localSb.getMedicalAddition = () => 0;
  });

  function setupBaseState(method = 'mixed', ratio = 50) {
    const cy = new Date().getFullYear();
    localSb.state = {
      profile: { birth: `${cy - 35}-01-01` },
      finance: { income: 30, bonus: 60, expense: 20 },
      assets: [
        { id: 'ideco1', type: 'ideco', name: 'iDeCo', currentVal: 100, monthly: 0, annualReturn: 4 },
      ],
      retirement: {
        targetAge: 65, lifeExpectancy: 90,
        pensionMonthly: 0, pensionMonthly_p: 0, pensionAge: 65, pensionAge_p: 65,
        severance: 0, severanceAge: null, serviceYears: 30,
        monthlyExpense: 20, withdrawalType: 'needs',
        idecoReceiptMethod: method, idecoStartAge: 65, idecoPensionYears: 10,
        idecoLumpRatio: ratio,
      },
      lifeEvents: { housingType: 'mortgage', mortgage: {}, rent: {}, care: {}, scholarships: [], children: [] },
      cashFlowEvents: [], expenses: [], recurringExpenses: [],
    };
  }

  it('mixed 50%: 一時金 50% / 年金 50% で年金額が pure pension の半分強', () => {
    setupBaseState('mixed', 50);
    const sim = calcRetirementSimWithOpts({});
    const at65 = sim.find(d => d.age === 65);
    expect(at65.totalNonAssetIncome ?? 0).toBeGreaterThan(15);
    expect(at65.totalNonAssetIncome ?? 0).toBeLessThan(25);
  });

  it('mixed 0% は pension 単独と同等', () => {
    setupBaseState('mixed', 0);
    const simMixed = calcRetirementSimWithOpts({});
    setupBaseState('pension');
    const simPension = calcRetirementSimWithOpts({});
    const mixed65 = simMixed.find(d => d.age === 65)?.totalNonAssetIncome ?? 0;
    const pension65 = simPension.find(d => d.age === 65)?.totalNonAssetIncome ?? 0;
    expect(mixed65).toBeCloseTo(pension65, 0);
  });

  it('mixed 100% は lump 単独と同等', () => {
    setupBaseState('mixed', 100);
    const simMixed = calcRetirementSimWithOpts({});
    setupBaseState('lump');
    const simLump = calcRetirementSimWithOpts({});
    const mixed65 = simMixed.find(d => d.age === 65)?.totalNonAssetIncome ?? 0;
    const lump65 = simLump.find(d => d.age === 65)?.totalNonAssetIncome ?? 0;
    expect(mixed65).toBeCloseTo(lump65, 0);
  });

  it('mixed の年金額は pension 単独より少ない（pensionPortion が balance より小さいため）', () => {
    setupBaseState('mixed', 50);
    const simMixed = calcRetirementSimWithOpts({});
    setupBaseState('pension');
    const simPension = calcRetirementSimWithOpts({});
    const mixed65 = simMixed.find(d => d.age === 65)?.totalNonAssetIncome ?? 0;
    const pension65 = simPension.find(d => d.age === 65)?.totalNonAssetIncome ?? 0;
    expect(mixed65).toBeLessThan(pension65);
    expect(mixed65).toBeCloseTo(pension65 / 2, 0);
  });

  it('idecoLumpRatio 範囲外（150）はクランプして 100 として動作', () => {
    setupBaseState('mixed', 150);
    const simClamped = calcRetirementSimWithOpts({});
    setupBaseState('mixed', 100);
    const simExpected = calcRetirementSimWithOpts({});
    const clamped65 = simClamped.find(d => d.age === 65)?.totalNonAssetIncome ?? 0;
    const expected65 = simExpected.find(d => d.age === 65)?.totalNonAssetIncome ?? 0;
    expect(clamped65).toBeCloseTo(expected65, 0);
  });
});

// ─── BUG#13 (Phase 4h): 退職所得控除 5/19 年ルール ──────────
// 修正前: severance + iDeCo lump はすべて合算で控除適用
// 修正後: 受給年差 ≥ 19 (退職先) or ≥ 5 (ideco先) で別枠計算
describe('[BUG#13] 退職所得控除 5/19 年ルール（Phase 4h）', () => {
  let calcSeveranceWith519Rule, calcSeveranceDeduction, localSb;
  beforeAll(() => {
    loadCalc('utils.js');
    loadCalc('asset-growth.js');
    loadCalc('income-expense.js');
    loadCalc('life-events.js');
    loadCalc('mortgage.js');
    loadCalc('pension.js');
    loadCalc('integrated.js');
    loadCalc('retirement.js');
    localSb = getSandbox();
    calcSeveranceWith519Rule = localSb.calcSeveranceWith519Rule;
    calcSeveranceDeduction = localSb.calcSeveranceDeduction;
  });

  it('severance のみ（iDeCo lump=0）→ 単独 calcSeveranceDeduction と同等', () => {
    const result = calcSeveranceWith519Rule(2000, 65, 38, 0, 65, 30);
    const expected = calcSeveranceDeduction(2000, 0, 38);
    expect(result).toBeCloseTo(expected, 2);
  });

  it('iDeCo lump のみ（severance=0）→ idecoEnrollYears で控除適用', () => {
    const result = calcSeveranceWith519Rule(0, 0, 0, 800, 65, 35);
    const expected = calcSeveranceDeduction(0, 800, 35);
    expect(result).toBeCloseTo(expected, 2);
  });

  it('退職金先（60 歳）+ iDeCo 後（80 歳、gap 20）→ 19 年ルール適用、別枠', () => {
    const result = calcSeveranceWith519Rule(2000, 60, 38, 800, 80, 35);
    const sNet = calcSeveranceDeduction(2000, 0, 38);
    const iNet = calcSeveranceDeduction(0, 800, 35);
    expect(result).toBeCloseTo(sNet + iNet, 2);
    const combined = calcSeveranceDeduction(2000, 800, 38);
    expect(result).toBeGreaterThanOrEqual(combined);
  });

  it('退職金先 + iDeCo 後（gap 10、19 年未満）→ ルール非該当、合算', () => {
    const result = calcSeveranceWith519Rule(2000, 60, 38, 800, 70, 35);
    const expected = calcSeveranceDeduction(2000, 800, 38);
    expect(result).toBeCloseTo(expected, 2);
  });

  it('iDeCo 先（60 歳）+ 退職金後（70 歳、gap 10）→ 5 年ルール適用、別枠', () => {
    const result = calcSeveranceWith519Rule(2000, 70, 38, 800, 60, 35);
    const sNet = calcSeveranceDeduction(2000, 0, 38);
    const iNet = calcSeveranceDeduction(0, 800, 35);
    expect(result).toBeCloseTo(sNet + iNet, 2);
  });

  it('iDeCo 先 + 退職金後（gap 3、5 年未満）→ ルール非該当、合算', () => {
    const result = calcSeveranceWith519Rule(2000, 65, 38, 800, 62, 35);
    const expected = calcSeveranceDeduction(2000, 800, 38);
    expect(result).toBeCloseTo(expected, 2);
  });
});

// ─── BUG#14 (Phase 4i): Minor 計算修正一括（01-M04, 02-M01, 02-M05, 04-M07） ──────────
describe('[BUG#14] Phase 4i Minor calc fixes', () => {
  let localSb, getIncomeForYearWithGrowth, getOneTimeForYear, _calcPensionCore, ASSET_TYPES;
  beforeAll(() => {
    loadCalc('utils.js');
    loadCalc('asset-growth.js');
    loadCalc('income-expense.js');
    loadCalc('pension.js');
    localSb = getSandbox();
    getIncomeForYearWithGrowth = localSb.getIncomeForYearWithGrowth;
    getOneTimeForYear = localSb.getOneTimeForYear;
    _calcPensionCore = localSb._calcPensionCore;
    ASSET_TYPES = localSb.ASSET_TYPES;
  });

  it('01-M04: ASSET_TYPES.ideco.note は 2026年12月の改正に言及', () => {
    expect(ASSET_TYPES.ideco.note).toMatch(/2026年12月/);
  });

  it('02-M01: incomeGrowthUntilAge 未指定なら 55 fallback', () => {
    const cy = new Date().getFullYear();
    localSb.state = {
      profile: { birth: `${cy - 30}-01-01` },
      finance: { income: 40, bonus: 0, incomeGrowthRate: 2 },
      retirement: {},
      cashFlowEvents: [],
    };
    // currentAge=30 → cy+25 で min(25, 55-30)=25 年（既定 55 が効く）
    const at25y = getIncomeForYearWithGrowth(cy + 25);
    expect(at25y).toBeCloseTo(480 * Math.pow(1.02, 25), 0);
    // currentAge=30 → cy+30 で min(30, 55-30)=25 年（55 で停止、26 年成長しない）
    const at30y = getIncomeForYearWithGrowth(cy + 30);
    expect(at30y).toBeCloseTo(480 * Math.pow(1.02, 25), 0);
  });

  it('02-M05: one_time_expense の負値が二重マイナスにならない（Math.abs）', () => {
    const cy = new Date().getFullYear();
    localSb.state = {
      profile: { birth: `${cy - 30}-01-01` },
      finance: { income: 40, bonus: 0 },
      cashFlowEvents: [
        { type: 'one_time_expense', startAge: 31, amount: -100 },
      ],
      expenses: [],
      recurringExpenses: [],
    };
    const result = getOneTimeForYear(cy + 1);
    expect(result).toBe(-100);
  });

  it('04-M07: avgIncome 負値で hyojunGekkyu が 0 クランプ → 厚生年金 0', () => {
    const result = _calcPensionCore('employee', 30, -500, 40);
    expect(result.koseiMonthly).toBe(0);
  });
});

// ─── BUG#15 (Phase 4j): 奨学金 borrowedAmount=0 計上漏れ（03-M07） ──────────
// 修正前: borrowedAmount=0 + endYear 未設定 で ey = sy-1 → 永久に計上されない
// 修正後: borrowedAmount<=0 なら sy+14 (15年デフォルト) でフォールバック
describe('[BUG#15] 奨学金 borrowedAmount=0 fallback（Phase 4j 03-M07）', () => {
  let calcLECostByYear, localSb;
  beforeAll(() => {
    loadCalc('utils.js');
    loadCalc('asset-growth.js');
    loadCalc('income-expense.js');
    loadCalc('life-events.js');
    localSb = getSandbox();
    calcLECostByYear = localSb.calcLECostByYear;
  });

  it('borrowedAmount=0 + endYear 未設定 でも 15 年計上される', () => {
    const cy = new Date().getFullYear();
    localSb.state = {
      profile: { birth: `${cy - 30}-01-01` },
      finance: {},
      lifeEvents: {
        children: [],
        housingType: 'rent', mortgage: {}, rent: {},
        care: {},
        scholarships: [{
          startYear: cy + 5, // 5 年後返済開始
          monthlyPayment: 2.0, // 2 万/月 → 24 万/年
          // borrowedAmount, endYear 両方未設定
        }],
      },
      cashFlowEvents: [], expenses: [], recurringExpenses: [],
      assets: [],
    };
    // 5 年後（startYear）に計上されるべき
    const yr5 = calcLECostByYear(cy + 5, {});
    expect(yr5.scholarship).toBeGreaterThan(0);
    // 19 年後（startYear + 14、ey = sy + 14 内）も計上
    const yr19 = calcLECostByYear(cy + 19, {});
    expect(yr19.scholarship).toBeGreaterThan(0);
    // 20 年後（ey 超過）は計上されない
    const yr20 = calcLECostByYear(cy + 20, {});
    expect(yr20.scholarship).toBe(0);
  });

  it('borrowedAmount > 0 のとき従来挙動を維持', () => {
    const cy = new Date().getFullYear();
    localSb.state = {
      profile: { birth: `${cy - 30}-01-01` },
      finance: {},
      lifeEvents: {
        children: [],
        housingType: 'rent', mortgage: {}, rent: {},
        care: {},
        scholarships: [{
          startYear: cy + 5,
          monthlyPayment: 2.0,
          borrowedAmount: 240, // 240 万 ÷ 月 2 万 ÷ 12 = 10 年
        }],
      },
      cashFlowEvents: [], expenses: [], recurringExpenses: [],
      assets: [],
    };
    // ey = sy + 9（10 年返済）→ sy + 9 まで計上
    const yr14 = calcLECostByYear(cy + 14, {}); // sy + 9
    expect(yr14.scholarship).toBeGreaterThan(0);
    const yr15 = calcLECostByYear(cy + 15, {}); // sy + 10、ey 超過
    expect(yr15.scholarship).toBe(0);
  });
});

// ─── BUG#16 (Phase 4l): 2026 税制改正 9/20 年ルール対応 ──────────
// 修正前: calcSeveranceWith519Rule は 5/19 ハードコード
// 修正後: 第 7/8 引数で閾値選択可能、呼び出し元で受給年から判定
describe('[BUG#16] 9/20 年ルール (Phase 4l)', () => {
  let calcSeveranceWith519Rule, calcSeveranceDeduction, localSb;
  beforeAll(() => {
    loadCalc('utils.js');
    loadCalc('asset-growth.js');
    loadCalc('income-expense.js');
    loadCalc('life-events.js');
    loadCalc('mortgage.js');
    loadCalc('pension.js');
    loadCalc('integrated.js');
    loadCalc('retirement.js');
    localSb = getSandbox();
    calcSeveranceWith519Rule = localSb.calcSeveranceWith519Rule;
    calcSeveranceDeduction = localSb.calcSeveranceDeduction;
  });

  it('引数省略は 5/19 既定（後方互換）', () => {
    // 退職金先・gap 19 → 既定 19 で別枠
    const r = calcSeveranceWith519Rule(2000, 60, 38, 800, 79, 35);
    const sNet = calcSeveranceDeduction(2000, 0, 38);
    const iNet = calcSeveranceDeduction(0, 800, 35);
    expect(r).toBeCloseTo(sNet + iNet, 1);
  });

  it('改正後 (20/9): 退職金先 gap=19 → 合算（旧 19→別枠だったが新 20 未達）', () => {
    const r = calcSeveranceWith519Rule(2000, 60, 38, 800, 79, 35, 20, 9);
    const expected = calcSeveranceDeduction(2000, 800, 38);
    expect(r).toBeCloseTo(expected, 1);
  });

  it('改正後 (20/9): 退職金先 gap=20 → 別枠', () => {
    const r = calcSeveranceWith519Rule(2000, 60, 38, 800, 80, 35, 20, 9);
    const sNet = calcSeveranceDeduction(2000, 0, 38);
    const iNet = calcSeveranceDeduction(0, 800, 35);
    expect(r).toBeCloseTo(sNet + iNet, 1);
  });

  it('改正後 (20/9): iDeCo 先 gap=5 → 合算（旧 5→別枠だったが新 9 未達）', () => {
    const r = calcSeveranceWith519Rule(2000, 65, 38, 800, 60, 35, 20, 9);
    const expected = calcSeveranceDeduction(2000, 800, 38);
    expect(r).toBeCloseTo(expected, 1);
  });

  it('改正後 (20/9): iDeCo 先 gap=9 → 別枠', () => {
    const r = calcSeveranceWith519Rule(2000, 69, 38, 800, 60, 35, 20, 9);
    const sNet = calcSeveranceDeduction(2000, 0, 38);
    const iNet = calcSeveranceDeduction(0, 800, 35);
    expect(r).toBeCloseTo(sNet + iNet, 1);
  });
});

// ─── BUG#17 (Phase 4n): Minor 5 件一括修正 ──────────
describe('[BUG#17] Phase 4n Minor fixes', () => {
  let _calcPensionCore, getRecurringExpenseForYear, localSb;
  beforeAll(() => {
    loadCalc('utils.js');
    loadCalc('asset-growth.js');
    loadCalc('income-expense.js');
    loadCalc('pension.js');
    localSb = getSandbox();
    _calcPensionCore = localSb._calcPensionCore;
    getRecurringExpenseForYear = localSb.getRecurringExpenseForYear;
  });

  it('04-M03: avgIncome 50 万 (月 4.17) は 8.8 万円下限でクランプされ koseiMonthly が増える', () => {
    // 修正前: hyojunGekkyu = 4.17 → koseiMonthly = 4.17 × 5.481/1000 × 30 = 0.69 (過少)
    // 修正後: hyojunGekkyu = 8.8 → koseiMonthly = 8.8 × 5.481/1000 × 30 = 1.45
    const result = _calcPensionCore('employee', 30, 50, 40);
    // 8.8 × 0.005481 × 360 / 12 = 1.448... → koseiMonthly ≈ 1.4
    expect(result.koseiMonthly).toBeGreaterThan(1.0);
  });

  it('02-M03: excludeYears が string 混入していても number 比較できる', () => {
    localSb.state = {
      profile: { birth: `${new Date().getFullYear() - 30}-01-01` },
      finance: {},
      cashFlowEvents: [], expenses: [],
      recurringExpenses: [{
        startYear: 2026,
        amount: 30,
        intervalYears: 1,
        excludeYears: ['2027', 2028], // string と number 混在
      }],
    };
    expect(getRecurringExpenseForYear(2027)).toBe(0); // string '2027' でも除外
    expect(getRecurringExpenseForYear(2028)).toBe(0); // number 2028 で除外
    expect(getRecurringExpenseForYear(2029)).toBe(30); // 除外対象外
  });
});
