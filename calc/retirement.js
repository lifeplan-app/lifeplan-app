// Phase 3 Step 6: 退職シミュレーション・4 プール取り崩し
// 依存: calc/utils.js, calc/asset-growth.js (ASSET_TYPES),
//       calc/income-expense.js (getRecurringExpenseForYear),
//       calc/life-events.js (calcLECostByYear),
//       calc/mortgage.js (calcMortgageSchedule, calcMortgageDeduction)
//
// 注意:
//   - `calcRetirementSim()` は `document.getElementById('retHybridSwitchAge')` を 1 箇所で参照する
//     （ハイブリッド切替年齢を UI 入力から読み取るフォールバック）。Node テスト sandbox には
//     `document` が存在しないが、`test/scenario-snapshot.test.js` は Playwright 経由で
//     ブラウザ実行するため問題なし。他のテストは `calcRetirementSimWithOpts()` のみ使用。
//   - Phase 2.5 の Critical fix コメント（06-C02 / 07-C01 / 08-C01 など）は忠実に保持する。

// [Phase 4b 02-I02] インフレ変数統一
// retirement.inflationRate が明示設定なら優先、未設定なら finance.inflationRate（既定 2%）にフォールバック
// 既定値の二重管理（retirement=1.5%, finance=2%）を解消し、現役期と退職期で同じソースから取得
// 返値は年率小数（例: 2% → 0.02）
function _getInflationRate(state) {
  const r = (state && state.retirement) || {};
  const f = (state && state.finance) || {};
  if (r.inflationRate != null && r.inflationRate !== '') {
    const v = parseFloat(r.inflationRate);
    if (!isNaN(v)) return v / 100;
  }
  return (parseFloat(f.inflationRate) || 2) / 100;
}

function calcRetirementSim() {
  const r = state.retirement || {};
  const currentAge = calcAge();
  if (!currentAge || !r.targetAge) return null;

  const currentYear = new Date().getFullYear();
  const targetAge = parseInt(r.targetAge);
  const lifeExpectancy = parseInt(r.lifeExpectancy) || 90;
  const yearsToRetire = Math.max(0, targetAge - currentAge);
  const params = getRetirementParams();
  // 生活費年間成長率: インフレ × (1 - 加齢逓減) − 1
  const expenseGrowthRate = (1 + params.inflationRate) * (1 - params.expenseDecayRate) - 1;

  // 新しい包括シミュレーションで postData を取得
  const postData = calcRetirementSimWithOpts({});

  // retireYear は誕生年+退職年齢で正確計算（calcRetirementSimWithOpts と同じ方式）
  const _birthYear = state.profile?.birth ? new Date(state.profile.birth).getFullYear() : null;
  const retireYear = _birthYear ? _birthYear + targetAge : currentYear + yearsToRetire;
  const yearsToRetireAccurate = Math.max(0, retireYear - currentYear);

  // postData の退職年のstartAssetsを使うことで年別収支表と一致させる
  // fallback: calcIntegratedSim による推計
  const preRetireSim = calcIntegratedSim(Math.max(yearsToRetireAccurate, 1));
  const severance = parseFloat(r.severance) || 0;
  const severanceAge = parseFloat(r.severanceAge) || null;
  // [Phase 4a 08-I03] 退職所得控除適用（UI 未入力時は targetAge-22 で近似）
  const serviceYears = parseInt(r.serviceYears) || Math.max(1, targetAge - 22);
  const severanceGross = (severance > 0 && severanceAge && severanceAge <= targetAge) ? severance : 0;
  // [Phase 4d/4g] iDeCo 受給方法（calcRetirementSimWithOpts と同じ判定ロジック）
  // [Phase 4g] mixed 受給対応（一時金 + 年金 併用）
  const idecoMethodSim = (r.idecoReceiptMethod === 'pension') ? 'pension'
                       : (r.idecoReceiptMethod === 'mixed') ? 'mixed'
                       : 'lump';
  const idecoLumpRatioSim = (idecoMethodSim === 'mixed')
    ? Math.max(0, Math.min(100, (r.idecoLumpRatio != null && !isNaN(parseInt(r.idecoLumpRatio))) ? parseInt(r.idecoLumpRatio) : 50)) / 100
    : null;
  // 未設定時は targetAge をそのまま使用（クランプしない）。
  // 既存サンプルの snapshot 互換のため legal floor 60 を適用せず、
  // UI 側 (select 60-75) で入力を制限する。シナリオ C (targetAge=55) 等で重要。
  const idecoStartAgeSim = (r.idecoStartAge != null && r.idecoStartAge !== '')
    ? Math.max(60, Math.min(75, parseInt(r.idecoStartAge)))
    : targetAge;
  // birth year ベースで計算（yearsToRetireAccurate と同じ方式でズレを防ぐ）
  const _idecoStartYearSim = _birthYear ? _birthYear + idecoStartAgeSim : currentYear + Math.max(0, idecoStartAgeSim - currentAge);
  const yearsToIdecoStartSim = Math.max(0, _idecoStartYearSim - currentYear);
  // [Phase 4f] iDeCo 残高と加重平均利回りを同時計算（annuity 用、calcRetirementSim 側は集計のみ）
  const _idecoStatsSim = (state.assets || [])
    .filter(a => a.type === 'ideco')
    .reduce((acc, a) => {
      const rate    = ((a.annualReturn != null ? a.annualReturn : (ASSET_TYPES[a.type]?.defaultReturn ?? 4))) / 100;
      const monthly = a.monthly || 0;
      let bal = a.currentVal || 0;
      for (let y = 0; y < yearsToIdecoStartSim; y++) {
        bal = bal * (1 + rate) + monthly * 12;
      }
      return { totalBal: acc.totalBal + bal, weightedRateSum: acc.weightedRateSum + bal * rate };
    }, { totalBal: 0, weightedRateSum: 0 });
  const _idecoBalanceAtStartSim = _idecoStatsSim.totalBal;
  // 加重平均利回りは calcRetirementSim 側では使用しない（calcRetirementSimWithOpts 側で annuity 計算するため）
  // [Phase 4g] 一時金部分: lump=全額, mixed=ratio分, pension=0
  const idecoLumpsumSim =
      (idecoMethodSim === 'lump')  ? _idecoBalanceAtStartSim
    : (idecoMethodSim === 'mixed') ? _idecoBalanceAtStartSim * idecoLumpRatioSim
    :                                 0;
  // [Phase 4h] 5/19 年ルール: 退職金と iDeCo 一時金の年差で別枠 / 合算分岐
  const _idecoEnrollYearsSim = Math.max(1, idecoStartAgeSim - 22);
  const severanceAtRetire = calcSeveranceWith519Rule(
    severanceGross, severanceAge, serviceYears,
    idecoLumpsumSim, idecoStartAgeSim, _idecoEnrollYearsSim
  );
  const _baseWealthSim = preRetireSim[yearsToRetireAccurate]?.totalWealth
    || state.assets.reduce((s, a) => s + (a.currentVal || 0), 0);
  // [Phase 4d] 必要資産計算は postData[0].startAssets 優先（既存通り）。フォールバックでは iDeCo 残高を一律差し引き。
  const assetsAtRetire = postData?.[0]?.startAssets
    || (Math.max(0, _baseWealthSim - _idecoBalanceAtStartSim) + severanceAtRetire);

  // Weighted average return rate from current assets
  const totalVal = state.assets.reduce((s, a) => s + (a.currentVal || 0), 0);
  const weightedReturn = totalVal > 0
    ? state.assets.reduce((s, a) => {
        const rate = (a.annualReturn != null ? a.annualReturn : (ASSET_TYPES[a.type]?.defaultReturn || 3)) / 100;
        return s + (a.currentVal || 0) * rate;
      }, 0) / totalVal
    : 0.03;

  // Annual dividend from assets (at retirement, approximate with current mix)
  const annualDividendYield = totalVal > 0
    ? state.assets.reduce((s, a) => s + (a.dividendYield ? (a.currentVal || 0) * (a.dividendYield / 100) : 0), 0) / totalVal
    : 0;

  // Post-retirement settings
  const pensionAge = parseInt(r.pensionAge) || 65;
  const pensionAge_p = parseInt(r.pensionAge_p) || 65;
  // [Phase 4a 04-I02] 繰下げ/繰上げ率を年金額に乗算（adjustRate は calc/pension.js で定義）
  const pensionAnnual   = (parseFloat(r.pensionMonthly)   || 0) * 12 * adjustRate(pensionAge)   * (1 - params.pensionSlide);
  const pensionAnnual_p = (parseFloat(r.pensionMonthly_p) || 0) * 12 * adjustRate(pensionAge_p) * (1 - params.pensionSlide);
  const withdrawalType  = r.withdrawalType || 'hybrid';
  const withdrawalRate  = (parseFloat(r.withdrawalRate) || 4) / 100;
  const simYears        = lifeExpectancy - targetAge;
  // フェーズ別月支出（未入力の場合は①の値を引き継ぎ）
  const baseExpense1    = parseFloat(r.monthlyExpense)  || 25;
  const baseExpense2    = parseFloat(r.monthlyExpense2) || baseExpense1;
  const baseExpense3    = parseFloat(r.monthlyExpense3) || baseExpense1;
  const annualExpenseP1 = baseExpense1 * 12;
  const annualExpenseP2 = baseExpense2 * 12;
  const annualExpenseP3 = baseExpense3 * 12;

  // Required assets calculation（3期間PV・フェーズ別支出）
  // 期間1: 退職〜セミリタイア終了（セミ収入あり、年金なし）
  // 期間2: セミリタイア終了〜年金開始（収入なし、年金なし）
  // 期間3: 年金開始〜余命（年金あり）
  const totalLEOverRetirement = (postData||[]).reduce((s, d) => s + (d.leMortgage||0) + (d.leEducation||0) + (d.leCare||0), 0);
  const avgAnnualLE = postData && postData.length > 0 ? totalLEOverRetirement / postData.length : 0;
  const semiAnnual   = r.type === 'semi' ? (parseFloat(r.semiMonthlyIncome)||0)*12 : 0;
  const semiEndAge   = r.type === 'semi' ? (parseInt(r.semiEndAge) || pensionAge) : targetAge;

  // 各期間の年数（マイナスにはならない）
  const p1Years = Math.max(0, Math.min(semiEndAge, pensionAge) - targetAge); // セミ期間（年金前）
  const p2Years = Math.max(0, pensionAge - Math.max(semiEndAge, targetAge)); // フル退職・年金待機
  const p3Years = Math.max(0, lifeExpectancy - pensionAge);                  // 年金受給期間

  // 各期間の年間必要取り崩し額（フェーズ別支出を使用）
  const p1Need = Math.max(0, annualExpenseP1 + avgAnnualLE - semiAnnual);                        // セミ収入で補填
  const p2Need = Math.max(0, annualExpenseP2 + avgAnnualLE);                                     // 収入なし
  const p3Need = Math.max(0, annualExpenseP3 + avgAnnualLE - pensionAnnual - pensionAnnual_p);   // 年金で補填

  // 成長年金PV: 支出が毎年 expenseGrowthRate で増加する場合の現在価値
  // PMT × (1 - ((1+g)/(1+r))^n) / (r-g)
  const pvAnnuity = (annual, years, rate) => {
    if (years <= 0 || annual <= 0) return 0;
    const g = expenseGrowthRate;
    const rg = rate - g;
    if (Math.abs(rg) < 0.0001) return annual * years; // r ≈ g: フラット
    return annual * (1 - Math.pow((1 + g) / (1 + rate), years)) / rg;
  };
  const discount = (pv, years, rate) =>
    years <= 0 ? pv : pv / Math.pow(1 + Math.max(0, rate), years);

  // 目標残資産（死亡時に残したい額）
  const residualAssets = Math.round(parseFloat(r.residualAssets) || 0);
  let requiredAssets;
  let requiredAssetsLabel;

  if (withdrawalType === 'fixed_rate') {
    // 定率: 年間支出の加重平均 ÷ 取り崩し率（4%ルール等）
    // ※ 以下の blendedNeed で実際に計算するため totalNeed は不使用（削除可能だが残す）
    const blendedNeed = simYears > 0
      ? (p1Need * p1Years + p2Need * p2Years + p3Need * p3Years) / simYears
      : p3Need;
    requiredAssets = Math.round(blendedNeed / withdrawalRate) + residualAssets;
    const rateLabel = Math.round(withdrawalRate * 100);
    requiredAssetsLabel = `定率${rateLabel}%ルール目標額（年支出÷${rateLabel}%）`;

  } else if (withdrawalType === 'hybrid') {
    // 切替型: フェーズ②（補填期）の必要資産をフェーズ①（定率期）の純成長率で逆算
    const hybridSwitchAge = parseInt(document.getElementById('retHybridSwitchAge')?.value)
      || parseInt(r.withdrawalHybridSwitchAge) || 75;
    const hybridRate   = (parseFloat(r.withdrawalHybridRate) || 4) / 100;
    const hybridP1Type = r.withdrawalHybridP1Type || 'rate';
    const switchYears  = Math.max(0, hybridSwitchAge - targetAge);

    // フェーズ②（hybridSwitchAge〜余命）の必要資産PVを切替時点で算出
    // 切替時点では生活費がすでに (1+g)^switchYears 倍インフレ済み
    const ph2NoPensionYrs = Math.max(0, Math.min(pensionAge, lifeExpectancy) - hybridSwitchAge);
    const ph2PensionYrs   = Math.max(0, lifeExpectancy - Math.max(pensionAge, hybridSwitchAge));
    const _gf_switch    = Math.pow(1 + expenseGrowthRate, switchYears);
    const _gf_pension   = Math.pow(1 + expenseGrowthRate, switchYears + ph2NoPensionYrs);
    const pv_nopension = pvAnnuity(p2Need * _gf_switch, ph2NoPensionYrs, weightedReturn);
    const pv_pension   = discount(pvAnnuity(p3Need * _gf_pension, ph2PensionYrs, weightedReturn), ph2NoPensionYrs, weightedReturn);
    const pv_at_switch = pv_nopension + pv_pension + residualAssets;

    if (hybridP1Type === 'rate' && switchYears > 0) {
      // フェーズ①の純成長率（利回り − 取り崩し率）でリタイア時点まで割り戻す
      const netGrowthFactor = Math.pow(1 + weightedReturn - hybridRate, switchYears);
      requiredAssets = netGrowthFactor > 0.05
        ? Math.round(pv_at_switch / netGrowthFactor)
        : Math.round(pv_at_switch); // 純成長率が極端に低い場合は切替時点PVをそのまま使用
    } else {
      // 定額フェーズ①: 全期間PV法にフォールバック（各フェーズ開始時のインフレ済み値を使用）
      const _gf2 = Math.pow(1 + expenseGrowthRate, p1Years);
      const _gf3 = Math.pow(1 + expenseGrowthRate, p1Years + p2Years);
      const pv1 = pvAnnuity(p1Need, p1Years, weightedReturn);
      const pv2 = discount(pvAnnuity(p2Need * _gf2, p2Years, weightedReturn), p1Years, weightedReturn);
      const pv3 = discount(pvAnnuity(p3Need * _gf3, p3Years, weightedReturn), p1Years + p2Years, weightedReturn);
      requiredAssets = Math.round(pv1 + pv2 + pv3) + residualAssets;
    }
    requiredAssetsLabel = `切替型必要資産（${hybridSwitchAge}歳切替・逆算）`;

  } else if (withdrawalType === 'hybrid_reverse') {
    // 逆切替型: フェーズ①（補填期）のPV + 切替時点でのフェーズ②（定率期）必要資産を合算
    const hRevSwitchAge = parseInt(r.withdrawalHybridReverseSwitchAge) || 75;
    const hRevRate      = (parseFloat(r.withdrawalHybridReverseRate) || 4) / 100;
    const switchYearsRev = Math.max(0, hRevSwitchAge - targetAge);
    // フェーズ①（リタイア〜切替）: PV法で必要資産
    const ph1NoPensionYrs = Math.max(0, Math.min(pensionAge, hRevSwitchAge) - targetAge);
    const ph1PensionYrs   = Math.max(0, hRevSwitchAge - Math.max(pensionAge, targetAge));
    const _gf_p2 = Math.pow(1 + expenseGrowthRate, ph1NoPensionYrs);
    const pv_ph1_nopension = pvAnnuity(p1Need, ph1NoPensionYrs, weightedReturn);
    const pv_ph1_pension   = discount(pvAnnuity(p2Need * _gf_p2, ph1PensionYrs, weightedReturn), ph1NoPensionYrs, weightedReturn);
    const pv_ph1 = pv_ph1_nopension + pv_ph1_pension;
    // フェーズ②（切替〜余命）: 切替時点での blendedNeed ÷ 定率 → リタイア時点に割引
    const ph2Years = Math.max(0, lifeExpectancy - hRevSwitchAge);
    const _gf_switch = Math.pow(1 + expenseGrowthRate, switchYearsRev);
    const ph2NoPensionYrs2 = Math.max(0, Math.min(pensionAge, lifeExpectancy) - hRevSwitchAge);
    const ph2PensionYrs2   = Math.max(0, lifeExpectancy - Math.max(pensionAge, hRevSwitchAge));
    const blendedNeedRev = ph2Years > 0
      ? (p2Need * _gf_switch * ph2NoPensionYrs2 + p3Need * Math.pow(1 + expenseGrowthRate, switchYearsRev + ph2NoPensionYrs2) * ph2PensionYrs2) / ph2Years
      : 0;
    const pv_ph2_at_switch = blendedNeedRev > 0 ? Math.round(blendedNeedRev / hRevRate) : 0;
    const pv_ph2 = discount(pv_ph2_at_switch, switchYearsRev, weightedReturn);
    requiredAssets = Math.round(pv_ph1 + pv_ph2) + residualAssets;
    requiredAssetsLabel = `逆切替型必要資産（${hRevSwitchAge}歳切替・PV法）`;

  } else {
    // needs / fixed_amount: 3期間PV法（各フェーズ開始時のインフレ済み値を使用）
    const _gf2 = Math.pow(1 + expenseGrowthRate, p1Years);
    const _gf3 = Math.pow(1 + expenseGrowthRate, p1Years + p2Years);
    const pv1 = pvAnnuity(p1Need, p1Years, weightedReturn);
    const pv2 = discount(pvAnnuity(p2Need * _gf2, p2Years, weightedReturn), p1Years, weightedReturn);
    const pv3 = discount(pvAnnuity(p3Need * _gf3, p3Years, weightedReturn), p1Years + p2Years, weightedReturn);
    requiredAssets = Math.round(pv1 + pv2 + pv3) + residualAssets;
    requiredAssetsLabel = '必要資産ライン（3期間PV法）';
  }

  // When can you retire? (first year projected assets >= required)
  const longSim = calcIntegratedSim(40);
  let canRetireAge = null;
  for (let y = 0; y <= 40; y++) {
    if ((longSim[y]?.totalWealth || 0) >= requiredAssets) {
      canRetireAge = currentAge + y;
      break;
    }
  }

  // Asset depletion age
  const depletionPoint = postData.find(d => d.depleted);
  const depletionAge = depletionPoint ? depletionPoint.age : null;
  const lastData = postData[postData.length - 1];
  const finalAssets = lastData?.endAssets || 0;

  return {
    assetsAtRetire: Math.round(assetsAtRetire),
    requiredAssets,
    requiredAssetsLabel,
    residualAssets,
    shortfall: Math.max(0, requiredAssets - Math.round(assetsAtRetire)),
    surplus: Math.max(0, Math.round(assetsAtRetire) - requiredAssets),
    postData,
    depletionAge,
    canRetireAge,
    finalAssets,
    weightedReturn,
    annualDividendYield,
    retireYear,
    targetAge,
    lifeExpectancy,
    totalLEOverRetirement,
  };
}

// ===== ① インフレ率・⑥ 医療費増加モデルを組み込んだ calcRetirementSim のラッパー =====
// 元の calcRetirementSim を拡張するために追加パラメータを注入
function getRetirementParams() {
  const r = state.retirement || {};
  return {
    // [Phase 4b 02-I02] インフレ率は _getInflationRate 経由で finance/retirement を統一参照
    //   retirement.inflationRate 明示設定時は従来通り、未設定なら finance.inflationRate（既定 2%）にフォールバック
    inflationRate:     _getInflationRate(state),
    expenseDecayRate:  (parseFloat(r.expenseDecayRate)  || 0)   / 100,
    pensionSlide:      (parseFloat(r.pensionSlide)      || 0)   / 100,
    medicalModel:      r.medicalModel || 'moderate',
    // ライフイベントページで保存した値を優先、なければ出口戦略ページの値にフォールバック
    mortgageDeductStart: parseInt(state.lifeEvents?.mortgage?.deductStart) || parseInt(r.mortgageDeductStart) || null,
    mortgageDeductYears: parseInt(state.lifeEvents?.mortgage?.deductYears) || parseInt(r.mortgageDeductYears) || 0,
  };
}

// [Phase 4a 08-I03] 退職金・iDeCo 一時金の退職所得控除適用
// 引数: severance 退職金（万円）, idecoLumpsum iDeCo 一時金（万円、G3 で渡される・本 Task では 0 でOK）, serviceYears 勤続年数
// 戻り値: 税引後額（万円）
// 出典: 国税庁 No.1420 退職所得控除
function calcSeveranceDeduction(severance, idecoLumpsum, serviceYears) {
  const total = severance + (idecoLumpsum || 0);
  if (total <= 0) return 0;
  // 退職所得控除枠
  // 勤続 20 年以下: 40 万円 × 勤続年数（最低 80 万円）
  // 勤続 20 年超: 800 万円 + 70 万円 × (勤続年数 − 20)
  const deduction = serviceYears <= 20
    ? Math.max(80, 40 * serviceYears)
    : 800 + 70 * (serviceYears - 20);
  const taxableRaw = Math.max(0, total - deduction);
  // 退職所得は 1/2 に圧縮
  const taxable = taxableRaw / 2;
  // 万円単位の速算表（所得税）
  let incomeTax = 0;
  if (taxable <= 195) incomeTax = taxable * 0.05;
  else if (taxable <= 330) incomeTax = taxable * 0.10 - 9.75;
  else if (taxable <= 695) incomeTax = taxable * 0.20 - 42.75;
  else if (taxable <= 900) incomeTax = taxable * 0.23 - 63.6;
  else if (taxable <= 1800) incomeTax = taxable * 0.33 - 153.6;
  else if (taxable <= 4000) incomeTax = taxable * 0.40 - 279.6;
  else incomeTax = taxable * 0.45 - 479.6;
  incomeTax = Math.max(0, incomeTax);
  // 住民税 10% （退職所得は一律 10%・均等割略）
  const residentTax = Math.max(0, taxable * 0.10);
  return total - incomeTax - residentTax;
}

// [Phase 4h] 退職所得控除の 5/19 年ルール: 退職金と iDeCo 一時金の受給年差が
//   ≥ 19 年（退職金先）or ≥ 5 年（iDeCo 先）なら別枠で控除適用、それ以外は合算
// 出典: 国税庁 No.1420（退職所得）、所得税法施行令 69 条等
function calcSeveranceWith519Rule(severance, severanceAge, severanceServiceYears, idecoLumpsum, idecoStartAge, idecoEnrollYears) {
  const sAmt = parseFloat(severance) || 0;
  const iAmt = parseFloat(idecoLumpsum) || 0;
  if (sAmt <= 0 && iAmt <= 0) return 0;
  if (sAmt > 0 && iAmt <= 0) return calcSeveranceDeduction(sAmt, 0, severanceServiceYears);
  if (sAmt <= 0 && iAmt > 0) return calcSeveranceDeduction(0, iAmt, idecoEnrollYears);

  const sAge = parseFloat(severanceAge) || 0;
  const iAge = parseFloat(idecoStartAge) || 0;
  if (!sAge || !iAge) {
    return calcSeveranceDeduction(sAmt, iAmt, severanceServiceYears);
  }
  const gap = Math.abs(iAge - sAge);
  const severanceFirst = sAge < iAge;
  const idecoFirst = iAge < sAge;
  if ((severanceFirst && gap >= 19) || (idecoFirst && gap >= 5)) {
    const sNet = calcSeveranceDeduction(sAmt, 0, severanceServiceYears);
    const iNet = calcSeveranceDeduction(0, iAmt, idecoEnrollYears);
    return sNet + iNet;
  }
  return calcSeveranceDeduction(sAmt, iAmt, severanceServiceYears);
}

// ===== シナリオ別 calcRetirementSim =====
function calcRetirementSimWithOpts(opts = {}) {
  const { returnMod = 0, returnModStock = returnMod, returnModCash = 0, expenseMod = 0, pensionMod = 0 } = opts;
  const r = state.retirement || {};
  const currentAge = calcAge();
  if (!currentAge || !r.targetAge) return null;

  const currentYear = new Date().getFullYear();
  const targetAge = parseInt(r.targetAge);
  const lifeExpectancy = parseInt(r.lifeExpectancy) || 90;
  // 誕生年 + 目標年齢 = リタイア年（calcAge()の誕生日未到達による±1ズレを防ぐ）
  const _birthYear = state.profile?.birth ? new Date(state.profile.birth).getFullYear() : null;
  const retireYear = _birthYear ? _birthYear + targetAge : currentYear + Math.max(0, targetAge - currentAge);
  const yearsToRetire = Math.max(0, retireYear - currentYear);
  const params = getRetirementParams();

  const preRetireSim = calcIntegratedSim(Math.max(yearsToRetire, 1));
  const severance = parseFloat(r.severance) || 0;
  const severanceAge = parseFloat(r.severanceAge) || null;
  // [Phase 4a 08-I03] 退職所得控除適用（UI 未入力時は targetAge-22 で近似）
  const serviceYears = parseInt(r.serviceYears) || Math.max(1, targetAge - 22);
  const severanceGross = (severance > 0 && severanceAge && severanceAge <= targetAge) ? severance : 0;
  // [Phase 4d] iDeCo 受給方法（一時金 / 年金）と受給開始年齢（60-75）に対応
  // 既定値: idecoMethod='lump', idecoStartAge=targetAge, idecoPensionYears=10
  // → 既存サンプルは未指定 → targetAge ベースの一時金で従来挙動と一致
  // [Phase 4g] mixed 受給対応（一時金 + 年金 併用）
  const idecoMethod = (r.idecoReceiptMethod === 'pension') ? 'pension'
                    : (r.idecoReceiptMethod === 'mixed') ? 'mixed'
                    : 'lump';
  const idecoLumpRatio = (idecoMethod === 'mixed')
    ? Math.max(0, Math.min(100, (r.idecoLumpRatio != null && !isNaN(parseInt(r.idecoLumpRatio))) ? parseInt(r.idecoLumpRatio) : 50)) / 100
    : null;
  // 未設定時は targetAge をそのまま使用（クランプしない）。
  // 既存サンプルの snapshot 互換のため legal floor 60 を適用せず、
  // UI 側 (select 60-75) で入力を制限する。シナリオ C (targetAge=55) 等で重要。
  const idecoStartAge = (r.idecoStartAge != null && r.idecoStartAge !== '')
    ? Math.max(60, Math.min(75, parseInt(r.idecoStartAge)))
    : targetAge;
  const idecoPensionYearsRaw = parseInt(r.idecoPensionYears) || 10;
  const idecoPensionYears = [5, 10, 15, 20].includes(idecoPensionYearsRaw) ? idecoPensionYearsRaw : 10;
  // [Phase 4d] idecoStartAge も birth year ベースで計算（yearsToRetire と同じ方式でズレを防ぐ）
  const _idecoStartYear = _birthYear ? _birthYear + idecoStartAge : currentYear + Math.max(0, idecoStartAge - currentAge);
  const yearsToIdecoStart = Math.max(0, _idecoStartYear - currentYear);
  // [Phase 4f] iDeCo 残高と加重平均利回りを同時計算（annuity 用）
  const _idecoStats = (state.assets || [])
    .filter(a => a.type === 'ideco')
    .reduce((acc, a) => {
      const rate    = ((a.annualReturn != null ? a.annualReturn : (ASSET_TYPES[a.type]?.defaultReturn ?? 4))) / 100;
      const monthly = a.monthly || 0;
      let bal = a.currentVal || 0;
      for (let y = 0; y < yearsToIdecoStart; y++) {
        bal = bal * (1 + rate) + monthly * 12;
      }
      return { totalBal: acc.totalBal + bal, weightedRateSum: acc.weightedRateSum + bal * rate };
    }, { totalBal: 0, weightedRateSum: 0 });
  const _idecoBalanceAtStart = _idecoStats.totalBal;
  const _idecoWeightedRate = _idecoStats.totalBal > 0 ? _idecoStats.weightedRateSum / _idecoStats.totalBal : 0;
  // [Phase 4d/4g] 一時金部分（退職所得控除に渡す金額）
  const idecoLumpsum =
      (idecoMethod === 'lump')  ? _idecoBalanceAtStart
    : (idecoMethod === 'mixed') ? _idecoBalanceAtStart * idecoLumpRatio
    :                              0;
  // [Phase 4g] 年金部分（annuity の元本）
  const _idecoPensionPortion =
      (idecoMethod === 'pension') ? _idecoBalanceAtStart
    : (idecoMethod === 'mixed')   ? _idecoBalanceAtStart * (1 - idecoLumpRatio)
    :                                0;
  // [Phase 4f] 年金額は annuity formula で算出（受給期間中の運用継続を反映）。r=0 は balance/n フォールバック。
  const idecoYearly = (_idecoPensionPortion > 0)
    ? (_idecoWeightedRate > 0
        ? _idecoPensionPortion * _idecoWeightedRate / (1 - Math.pow(1 + _idecoWeightedRate, -idecoPensionYears))
        : _idecoPensionPortion / idecoPensionYears)
    : 0;
  // [Phase 4h] 5/19 年ルール: 退職金と iDeCo 一時金の年差で別枠 / 合算分岐
  const _idecoEnrollYears = Math.max(1, idecoStartAge - 22);
  const severanceAtRetire = calcSeveranceWith519Rule(
    severanceGross, severanceAge, serviceYears,
    idecoLumpsum, idecoStartAge, _idecoEnrollYears
  );
  // [Phase 4d] totalWealth から iDeCo 残高を引く（pension 経路でも別経路で受給するため二重計上を防ぐ）
  const _baseWealth = preRetireSim[yearsToRetire]?.totalWealth || state.assets.reduce((s, a) => s + (a.currentVal || 0), 0);
  let assetsAtRetire = Math.max(0, _baseWealth - _idecoBalanceAtStart) + severanceAtRetire;

  const totalVal = state.assets.reduce((s, a) => s + (a.currentVal || 0), 0);
  const baseWeightedReturn = totalVal > 0
    ? state.assets.reduce((s, a) => s + (a.currentVal || 0) * ((a.annualReturn != null ? a.annualReturn : (ASSET_TYPES[a.type]?.defaultReturn || 3)) / 100), 0) / totalVal
    : 0.03;
  const weightedReturn = baseWeightedReturn + returnMod;

  // ===== 資産プール（4プールモデル）分離トラッキング =====
  // [Phase 4a 07-I04/08-I02] 投資プールを税制別に分離（indexTaxablePool / indexNisaPool）
  // iDeCo は G3 で既に一時金化済みなので投資プールから除外
  // 取り崩し優先度: cashPool → dividendPool → indexTaxablePool → indexNisaPool → emergencyPool（NISA 温存）
  const _CASH_TYPES_RET = new Set(['cash_emergency','cash_special','cash_reserved','cash_surplus','cash','savings']);
  const _CASH_NORMAL_TYPES = new Set(['cash_special','cash_reserved','cash_surplus','cash','savings']);
  const _allAssets = state.assets || [];
  // 高配当プール: dividendYield > 0 かつ cashout モードのアセット
  const _isDivPool = a => !_CASH_TYPES_RET.has(a.type) && (parseFloat(a.dividendYield) || 0) > 0 && a.dividendMode === 'cashout';
  // [Phase 4a G3] iDeCo 除外用判定
  const _isIdeco = a => a.type === 'ideco';
  // [Phase 4a 07-I04/08-I02] NISA / 特定口座 の分類
  const _taxTypeOf = (a) => a.taxType || TAX_TYPE_DEFAULT[a.type] || 'tokutei';
  const _isTaxable = (a) => _taxTypeOf(a) === 'tokutei';
  const _isNisa    = (a) => _taxTypeOf(a) === 'nisa';
  // 投資プール候補: キャッシュ類・高配当・iDeCo を除いたアセット
  const _isIndexAsset = (a) => !_CASH_TYPES_RET.has(a.type) && !_isDivPool(a) && !_isIdeco(a);
  const _emergCurr = _allAssets.filter(a => a.type === 'cash_emergency').reduce((s, a) => s + (a.currentVal || 0), 0);
  const _cashCurr  = _allAssets.filter(a => _CASH_NORMAL_TYPES.has(a.type)).reduce((s, a) => s + (a.currentVal || 0), 0);
  const _divCurr   = _allAssets.filter(_isDivPool).reduce((s, a) => s + (a.currentVal || 0), 0);
  // 投資プールは iDeCo 除外 + taxable/nisa で分離
  const _indexTaxableCurr = _allAssets.filter(a => _isIndexAsset(a) && _isTaxable(a)).reduce((s, a) => s + (a.currentVal || 0), 0);
  const _indexNisaCurr    = _allAssets.filter(a => _isIndexAsset(a) && _isNisa(a)).reduce((s, a) => s + (a.currentVal || 0), 0);
  // その他の投資アセット（other 等、tokutei/nisa/ideco 以外）は taxable 扱いで合算
  const _indexOtherCurr = _allAssets.filter(a => _isIndexAsset(a) && !_isTaxable(a) && !_isNisa(a)).reduce((s, a) => s + (a.currentVal || 0), 0);
  const _indexCurr = _indexTaxableCurr + _indexNisaCurr + _indexOtherCurr;
  const _totalCurr = _emergCurr + _cashCurr + _divCurr + _indexCurr;
  const _emergRatio = _totalCurr > 0 ? _emergCurr / _totalCurr : 0.05;
  const _cashRatio  = _totalCurr > 0 ? _cashCurr  / _totalCurr : 0.10;
  const _divRatio   = _totalCurr > 0 ? _divCurr   / _totalCurr : 0.15;
  const _indexRatio = Math.max(0, 1 - _emergRatio - _cashRatio - _divRatio);
  const _emergBaseReturn = _emergCurr > 0
    ? _allAssets.filter(a => a.type === 'cash_emergency').reduce((s, a) =>
        s + (a.currentVal || 0) * ((a.annualReturn ?? ASSET_TYPES[a.type]?.defaultReturn ?? 0.1) / 100), 0) / _emergCurr
    : 0.001;
  const _cashBaseReturn = _cashCurr > 0
    ? _allAssets.filter(a => _CASH_NORMAL_TYPES.has(a.type)).reduce((s, a) =>
        s + (a.currentVal || 0) * ((a.annualReturn ?? ASSET_TYPES[a.type]?.defaultReturn ?? 0.1) / 100), 0) / _cashCurr
    : 0.001;
  const _indexBaseReturn = _indexCurr > 0
    ? _allAssets.filter(_isIndexAsset).reduce((s, a) =>
        s + (a.currentVal || 0) * ((a.annualReturn ?? ASSET_TYPES[a.type]?.defaultReturn ?? 5) / 100), 0) / _indexCurr
    : baseWeightedReturn;
  // 高配当プール: キャピタルゲイン = annualReturn - dividendYield（配当は別収入として計上）
  const _divTotalReturn = _divCurr > 0
    ? _allAssets.filter(_isDivPool).reduce((s, a) =>
        s + (a.currentVal || 0) * ((a.annualReturn ?? ASSET_TYPES[a.type]?.defaultReturn ?? 4) / 100), 0) / _divCurr
    : 0.04;
  const _divYield = _divCurr > 0
    ? _allAssets.filter(_isDivPool).reduce((s, a) =>
        s + (a.currentVal || 0) * ((parseFloat(a.dividendYield) || 0) / 100), 0) / _divCurr
    : 0;
  const _divCapitalReturn = Math.max(0, _divTotalReturn - _divYield); // キャピタルゲインのみ

  // [Phase 4a 08-I01] 各プールの加重実効税率（taxType 別）
  // cash/emergency プールは cash 相当（非課税）
  // index/dividend プールは taxType = nisa/ideco を除き TAX_RATE 適用
  const _poolTaxRate = (filterFn, baseVal) => {
    if (baseVal <= 0) return TAX_RATE; // デフォルト（課税）
    const taxed = _allAssets.filter(filterFn).reduce((s, a) => {
      const tt = a.taxType || TAX_TYPE_DEFAULT[a.type] || 'tokutei';
      const rate = (tt === 'nisa' || tt === 'ideco' || tt === 'cash') ? 0 : TAX_RATE;
      return s + (a.currentVal || 0) * rate;
    }, 0);
    return taxed / baseVal;
  };
  // [Phase 4a G3] iDeCo 除外後の投資プール税率（合計 / 互換用）
  const _indexTaxRate = _poolTaxRate(_isIndexAsset, _indexCurr);
  const _divTaxRate   = _poolTaxRate(_isDivPool, _divCurr);
  // [Phase 4a 07-I04/08-I02] サブプール別税率
  //   indexTaxablePool: tokutei + other は TAX_RATE 課税
  //   indexNisaPool:    非課税（0）
  const _indexTaxableRate = _poolTaxRate(a => _isIndexAsset(a) && (_isTaxable(a) || (!_isNisa(a) && !_isIdeco(a))), (_indexTaxableCurr + _indexOtherCurr));
  const _indexNisaRate    = 0;

  // ===== 生活防衛資金プールの初期値: targetVal（上限額）を尊重した実額計算 =====
  // 比率スケールではなく「現在残高を上限キャップ付きで yearsToRetire 年分複利成長」させた額を使用
  const _emergAtRetire = _allAssets
    .filter(a => a.type === 'cash_emergency')
    .reduce((s, a) => {
      const rate    = ((a.annualReturn != null ? a.annualReturn : (ASSET_TYPES[a.type]?.defaultReturn ?? 0.1))) / 100;
      const monthly = a.monthly || 0;
      // targetVal2 が設定されている場合は第2目標を最終上限とする
      const finalCap = (a.targetVal2 > 0) ? a.targetVal2
                     : (a.targetVal > 0)  ? a.targetVal
                     : Infinity;
      let bal = a.currentVal || 0;
      for (let y = 0; y < yearsToRetire; y++) {
        bal = Math.min(finalCap, bal * (1 + rate) + (bal < finalCap ? Math.min(monthly * 12, finalCap - bal) : 0));
      }
      return s + Math.min(bal, finalCap < Infinity ? finalCap : bal);
    }, 0);

  const _emergPoolInit = Math.min(_emergAtRetire, assetsAtRetire);
  const _nonEmergRemainder = Math.max(0, assetsAtRetire - _emergPoolInit);
  const _nonEmergCurr = _cashCurr + _indexCurr + _divCurr;
  let emergencyPool = _emergPoolInit;
  let cashPool      = _nonEmergCurr > 0 ? _nonEmergRemainder * (_cashCurr  / _nonEmergCurr) : _nonEmergRemainder * _cashRatio;
  // [Phase 4a 07-I04/08-I02] indexPool を課税別に分離
  //   indexTaxablePool: 特定口座・一般口座（tokutei + other）
  //   indexNisaPool:    NISA 非課税枠
  // 取崩は indexTaxablePool を先に消費し、NISA を温存
  const _indexTotalInit = _nonEmergCurr > 0 ? _nonEmergRemainder * (_indexCurr / _nonEmergCurr) : _nonEmergRemainder * _indexRatio;
  const _indexTaxableShare = _indexCurr > 0 ? (_indexTaxableCurr + _indexOtherCurr) / _indexCurr : 0.5;
  let indexTaxablePool = _indexTotalInit * _indexTaxableShare;
  let indexNisaPool    = _indexTotalInit * (1 - _indexTaxableShare);
  let dividendPool  = _nonEmergCurr > 0 ? _nonEmergRemainder * (_divCurr   / _nonEmergCurr) : _nonEmergRemainder * _divRatio;
  const drawdownOrder = opts.drawdownOrder || r.drawdownOrder || 'proportional';
  const cashFloor = parseFloat(opts.cashFloor != null ? opts.cashFloor : r.cashFloor) || 0;

  // フェーズ別月支出（未入力の場合は①の値を引き継ぎ）
  const baseMonthlyExpense  = parseFloat(r.monthlyExpense)  || 25;
  const baseMonthlyExpense2 = parseFloat(r.monthlyExpense2) || baseMonthlyExpense;
  const baseMonthlyExpense3 = parseFloat(r.monthlyExpense3) || baseMonthlyExpense;
  const pensionAge = parseInt(r.pensionAge) || 65;
  const pensionAge_p = parseInt(r.pensionAge_p) || 65;
  // [Phase 4a 04-I02] 繰下げ/繰上げ率を年金額に乗算（adjustRate は calc/pension.js で定義）
  const basePensionAnnual   = (parseFloat(r.pensionMonthly)   || 0) * 12 * adjustRate(pensionAge)   * (1 + pensionMod) * (1 - params.pensionSlide);
  const basePensionAnnual_p = (parseFloat(r.pensionMonthly_p) || 0) * 12 * adjustRate(pensionAge_p) * (1 + pensionMod) * (1 - params.pensionSlide);
  const semiEndAge = r.type === 'semi' ? (parseInt(r.semiEndAge) || 999) : 0;
  const extraIncomes = r.extraIncomes || [];
  const withdrawalType = r.withdrawalType || 'hybrid';
  const withdrawalRate = (parseFloat(r.withdrawalRate) || 4) / 100;
  const withdrawalAnnual = (parseFloat(r.withdrawalMonthly) || 0) * 12;
  const hybridP1Type = r.withdrawalHybridP1Type || 'rate';
  const hybridRate = (parseFloat(r.withdrawalHybridRate) || 4) / 100;
  const hybridMonthlyAnnual = (parseFloat(r.withdrawalHybridMonthly) || 20) * 12;
  const hybridSwitchAge = parseInt(r.withdrawalHybridSwitchAge) || 75;
  const hybridReverseSwitchAge = parseInt(r.withdrawalHybridReverseSwitchAge) || 75;
  const hybridReverseRate = (parseFloat(r.withdrawalHybridReverseRate) || 4) / 100;
  // 住宅ローン控除用: ループ外で一度だけ計算（繰上返済・借換え反映済み正確残高）
  const _retMortgageSchedule = calcMortgageSchedule();

  const simYears = lifeExpectancy - targetAge;
  const postData = [];
  let assets = assetsAtRetire;

  for (let i = 0; i <= simYears; i++) {
    // [Phase 4a 07-I04/08-I02] indexPool = indexTaxablePool + indexNisaPool（後方互換用）
    let indexPool = indexTaxablePool + indexNisaPool;
    assets = emergencyPool + cashPool + indexPool + dividendPool; // 4プール合算で常に同期
    const age = targetAge + i;
    const yr = retireYear + i;
    const leCost = calcLECostByYear(yr);
    const annualLE = leCost.mortgage + leCost.childcare + leCost.education + leCost.care + leCost.scholarship;
    // ① インフレ適用 × 生活費低減（加齢による自然な逓減）
    const expenseChangeFactor = Math.pow((1 + params.inflationRate) * (1 - params.expenseDecayRate), i);
    // フェーズ別支出：セミ期→待機期→年金期
    const phaseExpense = age < semiEndAge ? baseMonthlyExpense
      : age < pensionAge ? baseMonthlyExpense2
      : baseMonthlyExpense3;
    const inflatedExpense = phaseExpense * 12 * expenseChangeFactor * (1 + expenseMod);
    // ⑥ 医療費増加
    const medicalAdd = getMedicalAddition(age, params.medicalModel) * 12;
    // ⑦ 繰り返し支出（excludeYears 除外済み）
    const recurringCost = getRecurringExpenseForYear(yr);
    // ⑨ 一時支出計画（state.expenses[]）：ライフイベントチャートの★マーカーと同じデータ
    // getOneTimeForYear はここでは呼ばず直接計算（recurringCostの二重計上を防ぐため）
    const plannedOneTimeExpense = (state.expenses || []).reduce((total, e) => {
      return parseInt(e.year) === yr ? total + (parseFloat(e.amount) || 0) : total;
    }, 0);
    const totalAnnualExpense = inflatedExpense + annualLE + medicalAdd + recurringCost + plannedOneTimeExpense;

    // [Phase 4a 08-I03] 退職金が targetAge 以降に支給されるケースでも退職所得控除適用
    const severanceGrossThisYear = (severance > 0 && severanceAge && severanceAge > targetAge && age === severanceAge) ? severance : 0;
    const severanceThisYear = calcSeveranceDeduction(severanceGrossThisYear, 0, serviceYears);
    if (severanceThisYear > 0) {
      // 退職金（一時金）は非課税の現金として受取 → 特定口座扱いの indexTaxablePool へ合流
      // （既存挙動踏襲: 「インデックスプールへ」を indexTaxablePool として踏襲）
      indexTaxablePool += severanceThisYear;
      indexPool = indexTaxablePool + indexNisaPool;
    }

    let pension = age >= pensionAge ? basePensionAnnual : 0;
    const pension_p = age >= pensionAge_p ? basePensionAnnual_p : 0;
    // [Phase 4d/4g] iDeCo 年金: 受給期間中のみ加算（公的年金と合算扱い）
    // [Phase 4g] mixed モードでも年金部分（idecoYearly）を加算
    const idecoIncomeThisYear = ((idecoMethod === 'pension' || idecoMethod === 'mixed')
      && age >= idecoStartAge
      && age < idecoStartAge + idecoPensionYears) ? idecoYearly : 0;
    const semi = (r.type === 'semi' && age < semiEndAge) ? (parseFloat(r.semiMonthlyIncome) || 0) * 12 : 0;
    // パートナーリタイア後の就労収入・支出変化（本人リタイア後もパートナーが働いている場合に加算）
    const _partnerBirthStr = state.profile?.partnerBirth || state.profile?.partnerbirth;
    const _partnerBirthYear = _partnerBirthStr ? new Date(_partnerBirthStr).getFullYear() : null;
    const _partnerRetireAge = parseInt(r.partnerTargetAge) || null;
    const _partnerRetireYear = (_partnerBirthYear && _partnerRetireAge) ? _partnerBirthYear + _partnerRetireAge : null;
    const _partnerSemiEndAge = parseInt(r.partnerSemiEndAge) || null;
    const _partnerSemiEndYear = (_partnerBirthYear && _partnerSemiEndAge) ? _partnerBirthYear + _partnerSemiEndAge : null;
    const _partnerBaseAnnual = ((parseFloat(state.finance?.partnerIncome) || 0) * 12) + (parseFloat(state.finance?.partnerBonus) || 0);
    // [Phase 4b 06-I01] パートナー就労収入にも昇給累積適用
    // Phase 2.5 02-C01/06-C01 と同じく partnerCurrentAge はパートナー自身の年齢基準
    const _partnerGrowthRate = (parseFloat(state.finance?.partnerGrowthRate) || 0) / 100;
    const _partnerCurrentAgeRet = _partnerBirthYear ? (currentYear - _partnerBirthYear) : currentAge;
    const _partnerUntilAge = parseInt(state.finance?.partnerGrowthUntilAge) || (_partnerCurrentAgeRet + 30);
    const _partnerAgeAtYear = _partnerBirthYear ? (yr - _partnerBirthYear) : null;
    const _partnerGrowthYears = Math.max(0, Math.min(
      _partnerUntilAge - _partnerCurrentAgeRet,
      (_partnerAgeAtYear != null ? _partnerAgeAtYear : age) - _partnerCurrentAgeRet
    ));
    const _partnerBaseAnnualWithGrowth = _partnerBaseAnnual * Math.pow(1 + _partnerGrowthRate, _partnerGrowthYears);
    let partnerWorkIncome = 0;
    if (_partnerBaseAnnual > 0) {
      if (_partnerRetireYear === null || yr < _partnerRetireYear) {
        partnerWorkIncome = _partnerBaseAnnualWithGrowth; // まだ現役（昇給累積適用）
      } else if (r.partnerType === 'semi' && (_partnerSemiEndYear === null || yr < _partnerSemiEndYear)) {
        partnerWorkIncome = (parseFloat(r.partnerSemiMonthlyIncome) || 0) * 12; // セミリタイア中
      }
    }
    // [Phase 4b 06-I04] 加給年金（簡易）
    // 厳密条件：本人が厚生年金 20 年以上 + 配偶者 65 歳未満
    // 簡易実装：本人 65-74 歳かつ配偶者 65 歳未満なら +40 万円/年
    const _hasKakyuNenkin = age >= 65 && age < 75
      && _partnerAgeAtYear != null && _partnerAgeAtYear < 65;
    if (_hasKakyuNenkin) {
      pension += 40;
    }
    const extra = extraIncomes.reduce((s, inc) => {
      const ok = (!inc.startAge || age >= inc.startAge) && (!inc.endAge || age <= inc.endAge);
      return s + (ok ? (parseFloat(inc.monthly) || 0) * 12 : 0);
    }, 0);
    // ⑧ 住宅ローン控除（calcMortgageSchedule による正確な年末残高を使用）
    const mortgageBalance = _retMortgageSchedule.get(yr)?.principalEnd ?? 0;
    const mortgageDeduct = calcMortgageDeduction(yr, mortgageBalance);

    // パートナーリタイア後の月支出変化（通勤費削減・余暇費増加など）
    const _partnerExpChange = (_partnerRetireYear !== null && yr >= _partnerRetireYear)
      ? (parseFloat(r.partnerExpenseChange) || 0) * 12 : 0;
    // [Phase 4b 06-I03] パートナー退職後 60 歳未満の国民年金保険料
    // 17,510 円/月 × 12 = 21.012 万円/年（令和 7 年度）
    const _partnerAge60YearRet = _partnerBirthYear ? _partnerBirthYear + 60 : null;
    const _partnerKokunen = (_partnerRetireYear !== null && yr >= _partnerRetireYear
                              && _partnerAge60YearRet !== null && yr < _partnerAge60YearRet)
      ? 21.012 : 0;
    // 配当収入（高配当プール × 配当利回り）
    // dividendPoolのキャピタルゲインは _divCapitalReturn で成長し、配当分は別収入として計上
    // [Phase 4a 08-I01] 配当に実効税率を適用（NISA/iDeCo 等は非課税扱い）
    const dividendGross = dividendPool * _divYield;
    const dividendIncome = Math.round(dividendGross * (1 - _divTaxRate));
    const totalNonAssetIncome = pension + pension_p + semi + partnerWorkIncome + extra + mortgageDeduct + dividendIncome + idecoIncomeThisYear;
    const netExpense = Math.max(0, (totalAnnualExpense + _partnerExpChange + _partnerKokunen) - totalNonAssetIncome);

    // ===== 資産使い切り哲学: 全モードで生活費は必ず確保 =====
    // 各モードは「いくら多めに取り崩すか」の戦略であり、不足は発生しない
    let baseWithdrawal; // 方式ごとの取り崩し基準額
    let hybridPhase = null; // null | 1 | 2
    switch (withdrawalType) {
      case 'fixed_rate':
        baseWithdrawal = assets * withdrawalRate;
        break;
      case 'fixed_amount':
        // 定額は「生活費 + 追加取り崩し額」
        baseWithdrawal = netExpense + withdrawalAnnual;
        break;
      case 'hybrid':
        if (age < hybridSwitchAge) {
          // フェーズ①: 定率 or 定額（選択に応じて）
          baseWithdrawal = hybridP1Type === 'amount'
            ? netExpense + hybridMonthlyAnnual  // 定額: 生活費 + 毎月固定額
            : assets * hybridRate;              // 定率: 資産×率
          hybridPhase = 1;
        } else {
          baseWithdrawal = netExpense; // フェーズ②: 必要額のみ
          hybridPhase = 2;
        }
        break;
      case 'hybrid_reverse':
        if (age < hybridReverseSwitchAge) {
          baseWithdrawal = netExpense; // フェーズ①: 必要額のみ補填（資産保全）
          hybridPhase = 1;
        } else {
          baseWithdrawal = assets * hybridReverseRate; // フェーズ②: 定率取り崩し
          hybridPhase = 2;
        }
        break;
      default: // needs: 最低限（生活費補填のみ）
        baseWithdrawal = netExpense;
    }

    // 定率モードは純粋に rate×資産のみ取り崩す（生活費不足は赤字として表示）
    // 他モードは生活費を必ず確保する
    // hybrid_reverse フェーズ②は定率として扱う（年金等で賄える分は引き出さない）
    const _isRateMode = withdrawalType === 'fixed_rate' ||
      (withdrawalType === 'hybrid_reverse' && hybridPhase === 2);
    const assetWithdrawal = _isRateMode
      ? baseWithdrawal
      : Math.max(baseWithdrawal, netExpense);

    // actualDeduction: 実際に資産プールから引き出す額
    // 定率モード:
    //   ・通常生活費（インフレ調整済み生活費＋医療費など）: rate×資産でキャップ（余剰は資産に残して複利運用）
    //   ・一時支出・定期支出(recurringCost+plannedOneTime): 4%キャップの対象外・常に全額確保
    // 他モード: assetWithdrawal のまま（生活費を確保する）
    let actualDeduction;
    if (_isRateMode) {
      // 一時支出・定期支出の「資産負担分」を分離（収入で賄えない残額）
      const exceptionalExpense = recurringCost + plannedOneTimeExpense;
      const exceptionalNet = Math.max(0, Math.min(exceptionalExpense, netExpense));
      const regularNetExpense = Math.max(0, netExpense - exceptionalNet);
      // 通常生活費は rate×資産 でキャップ、一時・定期支出は全額引き出す
      const fromRate = Math.min(assetWithdrawal, regularNetExpense);
      actualDeduction = fromRate + exceptionalNet;
    } else {
      actualDeduction = assetWithdrawal;
    }

    // 余剰 / 不足
    const annualSurplus = Math.round(Math.max(0, assetWithdrawal - netExpense));
    const annualDeficit = Math.round(Math.max(0, netExpense - assetWithdrawal));

    // 月間収支（定率モードで不足の場合はマイナス）
    const monthlyBalance = Math.round((assetWithdrawal - netExpense) / 12 * 10) / 10;

    // ===== 4プール成長 =====
    // emergencyPool: 生活防衛資金（最後まで手をつけない）
    // cashPool: 通常現金（低利）
    // indexTaxablePool / indexNisaPool: インデックス系を税制別に分離（成長率は同一）
    // dividendPool: 高配当ETF（キャピタルゲインのみ成長、配当は別収入計上済み）
    // [Phase 4a 08-I05] returnMod 対称化: 既存の returnMod は株式系（index/div）に適用
    //   現金系プール（emergency/cash）は returnModCash 分離（デフォルト 0 = 既存互換）
    const _emergPre = emergencyPool, _cashPre = cashPool, _indexTaxPre = indexTaxablePool, _indexNisaPre = indexNisaPool, _divPre = dividendPool;
    emergencyPool    *= (1 + Math.max(-1, _emergBaseReturn + returnModCash));
    cashPool         *= (1 + Math.max(-1, _cashBaseReturn + returnModCash));
    indexTaxablePool *= (1 + Math.max(-1, _indexBaseReturn + returnModStock));
    indexNisaPool    *= (1 + Math.max(-1, _indexBaseReturn + returnModStock));
    dividendPool     *= (1 + Math.max(-1, _divCapitalReturn + returnModStock));
    indexPool = indexTaxablePool + indexNisaPool; // sync
    const _annualReturn = Math.round(
      _emergPre    * Math.max(-1, _emergBaseReturn + returnModCash) +
      _cashPre     * Math.max(-1, _cashBaseReturn + returnModCash) +
      (_indexTaxPre + _indexNisaPre) * Math.max(-1, _indexBaseReturn + returnModStock) +
      _divPre      * Math.max(-1, _divCapitalReturn + returnModStock)
    );

    // ===== 5プール取り崩し（NISA 温存） =====
    // [Phase 4a 07-I04/08-I02] 優先度: cashPool → dividendPool → indexTaxablePool → indexNisaPool → emergencyPool
    //   NISA を最後の投資プールとして温存（課税口座先消費で税効率最適化）
    // drawdownOrder は互換のため残すが、すべて同順序（NISA 温存）に統一
    // [Phase 4a 07-I01/09-I02] 課税プール（indexTaxable/dividend）は税引後ネット → 額面へ grossUp
    //   cash/emergency/indexNisa は非課税。NISA は TAX_RATE=0 相当で gross-up 不要
    const _grossUpIndexTax = (net) => net / Math.max(0.01, 1 - _indexTaxableRate);
    const _grossUpDiv      = (net) => net / Math.max(0.01, 1 - _divTaxRate);
    const _poolTotal = emergencyPool + cashPool + indexTaxablePool + indexNisaPool + dividendPool;
    const _deductable = Math.min(_poolTotal, actualDeduction); // actualDeduction は net 必要額
    const _cashAboveFloor = Math.max(0, cashPool - cashFloor);
    let _fromEmerg = 0, _fromCash = 0, _fromIndexTax = 0, _fromIndexNisa = 0, _fromDiv = 0;

    // 取崩ヘルパ: remaining(net) 必要額に対し、指定プール・残高から gross 取崩額を決定し残り net を返す
    const _takeFromIndexTax = (remainingNet) => {
      if (remainingNet <= 0 || indexTaxablePool <= 0) return remainingNet;
      const grossWant = _grossUpIndexTax(remainingNet);
      const grossTake = Math.min(indexTaxablePool, grossWant);
      _fromIndexTax += grossTake;
      const netGot = grossTake * (1 - _indexTaxableRate);
      return Math.max(0, remainingNet - netGot);
    };
    const _takeFromIndexNisa = (remainingNet) => {
      if (remainingNet <= 0 || indexNisaPool <= 0) return remainingNet;
      // NISA は非課税（_indexNisaRate = 0）
      const grossTake = Math.min(indexNisaPool, remainingNet);
      _fromIndexNisa += grossTake;
      return Math.max(0, remainingNet - grossTake);
    };
    const _takeFromDiv = (remainingNet) => {
      if (remainingNet <= 0 || dividendPool <= 0) return remainingNet;
      const grossWant = _grossUpDiv(remainingNet);
      const grossTake = Math.min(dividendPool, grossWant);
      _fromDiv += grossTake;
      const netGot = grossTake * (1 - _divTaxRate);
      return Math.max(0, remainingNet - netGot);
    };
    const _takeFromCash = (remainingNet, capFloor = true) => {
      if (remainingNet <= 0) return remainingNet;
      const limit = capFloor ? _cashAboveFloor - _fromCash : cashPool - _fromCash;
      if (limit <= 0) return remainingNet;
      const take = Math.min(limit, remainingNet); // 非課税
      _fromCash += take;
      return Math.max(0, remainingNet - take);
    };
    const _takeFromEmerg = (remainingNet) => {
      if (remainingNet <= 0 || emergencyPool <= 0) return remainingNet;
      const take = Math.min(emergencyPool, remainingNet); // 非課税
      _fromEmerg += take;
      return Math.max(0, remainingNet - take);
    };

    let _remaining = _deductable;
    if (drawdownOrder === 'invest_first') {
      // インデックス優先: 特定 → NISA → 通常現金 → 高配当 → 生活防衛（最後）
      _remaining = _takeFromIndexTax(_remaining);
      _remaining = _takeFromIndexNisa(_remaining);
      _remaining = _takeFromCash(_remaining, true);
      _remaining = _takeFromCash(_remaining, false); // フロア以下にも踏み込む
      _remaining = _takeFromDiv(_remaining);
      _remaining = _takeFromEmerg(_remaining);
    } else if (drawdownOrder === 'proportional') {
      // 按分: cash(フロア超過) + indexTaxable を比率配分 → indexNisa → 高配当 → 生活防衛（最後）
      //   NISA は温存のため按分対象外、indexTaxable 消費後に回す
      const _softTotal = _cashAboveFloor + indexTaxablePool;
      if (_softTotal > 0) {
        const _cf = _cashAboveFloor / _softTotal;
        const cashPart = _remaining * _cf;
        const indexPart = _remaining - cashPart;
        const afterCash = _takeFromCash(cashPart, true);
        const afterIndex = _takeFromIndexTax(indexPart + afterCash);
        _remaining = afterIndex;
        // cash 残があればもう一度
        _remaining = _takeFromCash(_remaining, true);
      }
      _remaining = _takeFromIndexNisa(_remaining);
      _remaining = _takeFromCash(_remaining, false);
      _remaining = _takeFromDiv(_remaining);
      _remaining = _takeFromEmerg(_remaining);
    } else {
      // cash_first（デフォルト）: 通常現金 → 高配当 → 特定 → NISA → 生活防衛（最後）
      // 期待方向: cashPool → dividendPool → indexTaxablePool → indexNisaPool → emergencyPool
      _remaining = _takeFromCash(_remaining, true);
      _remaining = _takeFromDiv(_remaining);
      _remaining = _takeFromIndexTax(_remaining);
      _remaining = _takeFromIndexNisa(_remaining);
      _remaining = _takeFromCash(_remaining, false);
      _remaining = _takeFromEmerg(_remaining);
    }

    const _emergBeforeDeduct     = emergencyPool;
    const _cashBeforeDeduct      = cashPool;
    const _indexTaxBeforeDeduct  = indexTaxablePool;
    const _indexNisaBeforeDeduct = indexNisaPool;
    const _divBeforeDeduct       = dividendPool;
    emergencyPool    = Math.max(0, emergencyPool    - _fromEmerg);
    cashPool         = Math.max(0, cashPool         - _fromCash);
    indexTaxablePool = Math.max(0, indexTaxablePool - _fromIndexTax);
    indexNisaPool    = Math.max(0, indexNisaPool    - _fromIndexNisa);
    dividendPool     = Math.max(0, dividendPool     - _fromDiv);
    indexPool = indexTaxablePool + indexNisaPool; // sync after deduction
    const endAssets = emergencyPool + cashPool + indexPool + dividendPool;

    // プールの実変化量で「実際に引き出せた額（額面）」を計算
    // [Phase 4a 07-I01/09-I02] 額面（gross）ベース。税引き後 net は actualDeduction 相当を受け取る
    const actualWithdrawn = (_emergBeforeDeduct - emergencyPool)
      + (_cashBeforeDeduct - cashPool)
      + (_indexTaxBeforeDeduct - indexTaxablePool)
      + (_indexNisaBeforeDeduct - indexNisaPool)
      + (_divBeforeDeduct - dividendPool);
    // 不足額は「未充足の net 必要額」（プール枯渇時に _remaining が残る）
    const withdrawalShortfall = Math.max(0, Math.round(_remaining));
    // 資金不足: 実引き出し < 必要額（cashFloorで引き出せない場合を含む）
    const isFundingShortfall = withdrawalShortfall > 0;

    // [Phase 2.5 08-C01 fix] 取り崩し不能な中間プール枯渇も破綻として検知
    // [Phase 4a 07-I04/08-I02] 新プール構造（indexTaxable / indexNisa）でも「全プール枯渇」で fire
    const criticalPoolDepleted =
      (indexTaxablePool <= 0 && indexNisaPool <= 0 && dividendPool <= 0 && cashPool <= 0 && emergencyPool <= 0 && actualDeduction > 0);

    postData.push({
      year: yr, age,
      startAssets: Math.round(assets),
      endAssets: Math.round(endAssets),
      emergencyPool: Math.round(emergencyPool),
      cashPool: Math.round(cashPool),
      indexPool: Math.round(indexPool),
      dividendPool: Math.round(dividendPool),
      investPool: Math.round(indexPool + dividendPool), // 後方互換
      totalNonAssetIncome: Math.round(totalNonAssetIncome),
      pension: Math.round(pension), pension_p: Math.round(pension_p),
      semi: Math.round(semi), extra: Math.round(extra), dividendIncome,
      annualReturn: _annualReturn,
      assetWithdrawal: Math.round(actualWithdrawn),       // 実際の取り崩し額
      assetWithdrawalNeeded: Math.round(assetWithdrawal), // 必要だった取り崩し額
      withdrawalShortfall,                                 // 不足額
      annualExpense: Math.round(totalAnnualExpense),
      baseExpense: Math.round(inflatedExpense),
      medicalAdd: Math.round(medicalAdd),
      mortgageDeduct: Math.round(mortgageDeduct),
      partnerWorkIncome: Math.round(partnerWorkIncome),
      leMortgage: Math.round(leCost.mortgage), leEducation: Math.round(leCost.education + leCost.childcare), leCare: Math.round(leCost.care), leScholarship: Math.round(leCost.scholarship),
      recurringCost: Math.round(recurringCost + plannedOneTimeExpense),
      monthlyBalance: isFundingShortfall ? Math.round(-withdrawalShortfall / 12 * 10) / 10 : monthlyBalance,
      annualSurplus: isFundingShortfall ? 0 : annualSurplus,
      annualDeficit: isFundingShortfall ? withdrawalShortfall : annualDeficit,
      hybridPhase,
      depleted: endAssets <= 0 || isFundingShortfall || criticalPoolDepleted,
    });

    // assets はループ先頭で cashPool+indexPool+dividendPool から再計算するため代入不要
    if (endAssets <= 0) break;
  }

  return postData;
}
