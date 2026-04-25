// Phase 3 Step 5: 住宅ローン・住宅ローン控除
// 依存: calc/utils.js (本ファイル自身は utils.js の関数を直接参照しないが、
//       同一 sandbox へのロードを前提としている)
//
// 注意: `calcMortgage()` は UI (document.getElementById 等) に強く依存するため
//       抽出対象外とし、index.html 側に残置した。本ファイルは純粋関数のみ。

// ───────────────────────────────────────────────
// 月次返済額（元利均等）
// principal: 残元本（万円）, annualRate: 年利(%), remainingMonths: 残月数
// ───────────────────────────────────────────────
function calcMonthlyPayment(principal, annualRate, remainingMonths) {
  if (!principal || !remainingMonths) return 0;
  const r = annualRate / 100 / 12;
  return r === 0 ? principal / remainingMonths
    : principal * r * Math.pow(1+r, remainingMonths) / (Math.pow(1+r, remainingMonths) - 1);
}

// ローンスケジュール計算（繰り上げ返済・借り換えイベント考慮）
// 戻り値: Map<year, {monthlyPayment, principalStart, principalEnd}>
function calcMortgageSchedule() {
  const m = state.lifeEvents.mortgage;
  if (!m.amount || !m.startYear || !m.term) return new Map();
  let principal = m.amount;
  let rate = m.rate || 1.5;
  const startYear = parseInt(m.startYear);
  let endYear = startYear + parseInt(m.term);
  let monthly = calcMonthlyPayment(principal, rate, (endYear - startYear) * 12);
  // [Phase 4c 05-I06] 同年内は refi → prepay の順に固定
  const eventOrder = { refi: 0, prepay: 1 };
  const events = (m.events || []).slice().sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return (eventOrder[a.type] ?? 99) - (eventOrder[b.type] ?? 99);
  });
  const schedule = new Map();

  for (let year = startYear; year < endYear && principal > 0.01; year++) {
    let yearlyRefiCost = 0;
    // イベント処理（この年の開始時）
    for (const ev of events) {
      if (parseInt(ev.year) !== year) continue;
      if (ev.type === 'prepay') {
        const amt = parseFloat(ev.amount) || 0;
        principal = Math.max(0, principal - amt);
        if (ev.method === 'payment') {
          // 返済額軽減型：同期間でmonthly再計算
          const remaining = (endYear - year) * 12;
          monthly = calcMonthlyPayment(principal, rate, remaining);
        } else {
          // 期間短縮型：同monthly額で残期間再計算
          // [Phase 4c 05-I05] principal×r ≥ monthly のとき newN が NaN/Infinity になるため即完済扱いにフォールバック
          const r = rate / 100 / 12;
          let newN;
          if (r === 0) {
            newN = Math.ceil(principal / monthly);
          } else if (principal * r >= monthly) {
            principal = 0;
            endYear = year;
            continue;
          } else {
            newN = Math.ceil(Math.log(monthly / (monthly - principal * r)) / Math.log(1 + r));
          }
          if (!Number.isFinite(newN)) {
            principal = 0;
            endYear = year;
            continue;
          }
          endYear = year + Math.ceil(newN / 12);
        }
      } else if (ev.type === 'refi') {
        rate = parseFloat(ev.newRate) || rate;
        const newTerm = parseInt(ev.newTerm) || (endYear - year);
        endYear = year + newTerm;
        monthly = calcMonthlyPayment(principal, rate, newTerm * 12);
        yearlyRefiCost += parseFloat(ev.cost) || 0;
      }
    }
    // 年次残高計算（月次ループで元本減算）
    const r = rate / 100 / 12;
    let p = principal;
    for (let mo = 0; mo < 12 && p > 0.01; mo++) {
      const interest = p * r;
      const principalPay = Math.min(p, monthly - interest);
      p -= principalPay;
    }
    schedule.set(year, { monthlyPayment: monthly, principalStart: principal, principalEnd: Math.max(0, p), refiCost: yearlyRefiCost });
    principal = Math.max(0, p);
  }
  return schedule;
}

// [Phase 2.5 05-C02 helper] 簡易所得税計算（万円単位）。正確な給与所得控除・各種控除は考慮せず、課税対象所得ベースの概算。
function calcIncomeTaxAmount(taxableIncomeMan) {
  if (taxableIncomeMan <= 0) return 0;
  // 国税庁 No.2260（2026年4月現在）速算表
  const brackets = [
    { upper: 195,  rate: 0.05,  deduction: 0 },
    { upper: 330,  rate: 0.10,  deduction: 9.75 },
    { upper: 695,  rate: 0.20,  deduction: 42.75 },
    { upper: 900,  rate: 0.23,  deduction: 63.6 },
    { upper: 1800, rate: 0.33,  deduction: 153.6 },
    { upper: 4000, rate: 0.40,  deduction: 279.6 },
    { upper: Infinity, rate: 0.45, deduction: 479.6 },
  ];
  for (const b of brackets) {
    if (taxableIncomeMan <= b.upper) {
      return Math.max(0, taxableIncomeMan * b.rate - b.deduction);
    }
  }
  return 0;
}

// [Phase 4a 08-I01] 住民税概算（課税所得 × 10%、調整控除省略）
// 出典: 地方税法（均等割 5000 円は省略）
function calcResidentTax(taxableIncomeMan) {
  if (taxableIncomeMan <= 0) return 0;
  return Math.max(0, taxableIncomeMan * 0.10);
}

// ⑧ [Phase 2.5 05-C01/05-C02 fix] 住宅ローン控除: 住宅種別の借入限度・税額 cap を考慮（万円/年）
function calcMortgageDeduction(year, balance) {
  const p = getRetirementParams();
  const m = state.lifeEvents?.mortgage || {};
  if (!p.mortgageDeductStart || !p.mortgageDeductYears || !balance) return 0;
  const endYear = p.mortgageDeductStart + p.mortgageDeductYears - 1;
  if (year < p.mortgageDeductStart || year > endYear) return 0;

  // 住宅種別ごとの借入限度額（万円、2026年4月・国税庁 No.1211-1 準拠）
  const HOUSING_TYPES = {
    general:       { limit: 2000 },
    long_term:     { limit: 5000 },
    low_carbon:    { limit: 5000 },
    zeh:           { limit: 4500 },
    energy_saving: { limit: 4000 },
  };
  const housingType = m.housingType || 'general';
  const loanLimit = HOUSING_TYPES[housingType]?.limit ?? 2000;
  const controlledBalance = Math.min(balance, loanLimit);

  // 控除額（上限前）= 残高 × 0.7%
  const rawDeduction = controlledBalance * 0.007;

  // 税額 cap: 所得税 + 住民税（住民税控除上限 9.75 万円/年）
  const incomeMan = ((parseFloat(state.finance?.income) || 0) * 12)
                  + (parseFloat(state.finance?.bonus) || 0);
  // 概算: 課税所得 ≒ 年収 × 0.7（給与所得控除・基礎控除・社保控除の超ざっくり）
  const taxableIncome = incomeMan * 0.7;
  const incomeTax = calcIncomeTaxAmount(taxableIncome);
  const residentTaxCap = 9.75; // 万円/年（国税庁 No.1211）
  const deductCap = incomeTax + residentTaxCap;

  return Math.min(rawDeduction, deductCap);
}
