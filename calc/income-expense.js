// calc/income-expense.js
// Phase 3 Step 3: 年次収入・支出の getter 群（index.html から抽出）
// 依存: calc/utils.js（ageToYear, calcAge を内部で参照）
//       getIncomeForYearWithGrowth は getIncomeForYear を内部呼び出しするため同一ファイルで定義
// ロード順: utils.js → asset-growth.js → income-expense.js
//
// ブラウザ: <script src="calc/income-expense.js"></script>
// Node テスト: test/helpers/load-calc.js 経由

// ===== CASH FLOW EVENT HELPERS =====
// 特定の暦年における年間収入（万円/年）
function getIncomeForYear(yr) {
  const base = (state.finance.income || 0) * 12 + (state.finance.bonus || 0);
  const events = (state.cashFlowEvents || [])
    .filter(e => e.type === 'income_change')
    .sort((a, b) => (a.startAge || 0) - (b.startAge || 0));
  let result = base;
  for (const e of events) {
    const startYr = ageToYear(e.startAge);
    const endYr = (e.endAge != null && e.endAge !== '') ? ageToYear(e.endAge) : null;
    if (yr >= startYr && (endYr == null || yr < endYr)) {
      result = (e.monthlyAmount || 0) * 12 + (e.bonusAmount || 0);
    }
  }
  return result;
}

// 特定の暦年における年間支出（万円/年）
function getExpenseForYear(yr) {
  const base = (state.finance.expense || 0) * 12;
  const events = (state.cashFlowEvents || [])
    .filter(e => e.type === 'expense_change')
    .sort((a, b) => (a.startAge || 0) - (b.startAge || 0));
  let result = base;
  for (const e of events) {
    const startYr = ageToYear(e.startAge);
    const endYr = (e.endAge != null && e.endAge !== '') ? ageToYear(e.endAge) : null;
    if (yr >= startYr && (endYr == null || yr < endYr)) {
      result = (e.monthlyAmount || 0) * 12;
    }
  }

  // ★ B方式：アセットの月積立＋ボーナス積み増し合計をキャッシュフローから自動控除
  // （積立はcalcAssetGrowth側で複利計算されるため、支出側からも差し引く）
  const assetAnnualTotal = (state.assets || []).reduce((s, a) => {
    // 当該年に積立が有効なアセットのみ
    const isActive = (!a.startYear || yr >= a.startYear) && (!a.endYear || yr <= a.endYear);
    return s + (isActive ? (a.monthly || 0) * 12 + (a.annualBonus || 0) : 0);
  }, 0);
  result += assetAnnualTotal;

  return result;
}

// 繰り返し支出：特定の暦年にヒットする合計（万円）
function getRecurringExpenseForYear(year) {
  return (state.recurringExpenses || []).reduce((total, e) => {
    const sy = parseInt(e.startYear) || 0;
    const ey = e.endYear ? parseInt(e.endYear) : null;
    const iv = parseInt(e.intervalYears) || 1;
    if (year < sy) return total;
    if (ey !== null && year > ey) return total;
    if ((e.excludeYears || []).includes(year)) return total; // その年だけ削除済み
    if ((year - sy) % iv === 0) {
      // この年だけオーバーライドがあれば優先
      const override = (e.overrideAmounts || {})[String(year)];
      return total + (override != null ? override : (parseFloat(e.amount) || 0));
    }
    return total;
  }, 0);
}

// 特定の暦年における一時的な収支（正=収入、負=支出、万円）
function getOneTimeForYear(yr) {
  const cfTotal = (state.cashFlowEvents || []).reduce((total, e) => {
    const eYr = ageToYear(e.startAge);
    if (eYr === yr) {
      if (e.type === 'one_time_income')  return total + (e.amount || 0);
      if (e.type === 'one_time_expense') return total - Math.abs(e.amount || 0);
    }
    return total;
  }, 0);

  // 支出計画（state.expenses[]）の該当年分を差し引く
  // ★ マーカーとして表示されるが計算にも反映させる（二重計上なし: cashFlowEventsとは別管理）
  const plannedExpenses = (state.expenses || []).reduce((total, e) => {
    if (parseInt(e.year) === yr) return total + (parseFloat(e.amount) || 0);
    return total;
  }, 0);

  return cfTotal - plannedExpenses - getRecurringExpenseForYear(yr);
}

// ===== ② 昇給モデル =====
function getIncomeForYearWithGrowth(yr) {
  const r = state.retirement || {};
  const currentYear = new Date().getFullYear();
  const currentAge  = calcAge() || 30;
  const yearsElapsed = yr - currentYear;
  const birthYear   = state.profile?.birth ? new Date(state.profile.birth).getFullYear() : null;

  // ── 本人収入 ──
  const growthRate  = (parseFloat(state.finance.incomeGrowthRate) || 0) / 100;
  // [Phase 4i 02-M01] 既定値 50→55（賃金構造基本統計調査ピーク整合）
  const untilAge    = parseInt(state.finance.incomeGrowthUntilAge) || 55;
  const selfBase    = (state.finance.income || 0) * 12 + (state.finance.bonus || 0);

  // cashFlowEvents（転職・副業等）で上書きがある場合はそちら優先
  const baseIncome  = getIncomeForYear(yr);
  // [Phase 4c 02-I03] 適用中の income_change イベントを取得（continueGrowth 判定用）
  const activeIncomeChange = (state.cashFlowEvents || []).find(e => {
    if (e.type !== 'income_change') return false;
    const startYr = ageToYear(e.startAge);
    const endYr = (e.endAge != null && e.endAge !== '') ? ageToYear(e.endAge) : null;
    return yr >= startYr && (endYr == null || yr < endYr);
  });
  const hasOverride = !!activeIncomeChange;

  let selfIncome;
  if (hasOverride) {
    // [Phase 4c 02-I03] continueGrowth: true のときイベント起点で昇給を継続
    if (activeIncomeChange.continueGrowth) {
      const eventStartYr = ageToYear(activeIncomeChange.startAge);
      // 昇給可能年数 = min(イベントからの経過年数, untilAge - イベント開始時の本人年齢)
      const ageAtEventStart = currentAge + (eventStartYr - currentYear);
      const postEventYears = Math.max(0, Math.min(yr - eventStartYr, untilAge - ageAtEventStart));
      selfIncome = baseIncome * Math.pow(1 + growthRate, postEventYears);
    } else {
      selfIncome = baseIncome; // 従来挙動: 以降固定
    }
  } else {
    // 昇給モデル（untilAge 以降は停止時点を維持）
    const selfGrowthYears = Math.max(0, Math.min(yearsElapsed, untilAge - currentAge));
    selfIncome = selfBase * Math.pow(1 + growthRate, selfGrowthYears);

    // リタイア・セミリタイア設定を反映（cashFlowEventsがない場合のみ）
    const retireAge  = parseFloat(r.targetAge) || null;
    const retireYear = (birthYear && retireAge) ? birthYear + retireAge : null;
    if (retireYear && yr >= retireYear) {
      if (r.type === 'semi') {
        const semiEndAge  = parseFloat(r.semiEndAge) || null;
        const semiEndYear = (birthYear && semiEndAge) ? birthYear + semiEndAge : null;
        selfIncome = (!semiEndYear || yr < semiEndYear)
          ? (parseFloat(r.semiMonthlyIncome) || 0) * 12
          : 0;
      } else {
        selfIncome = 0; // フルリタイア
      }
    }
  }

  // ── パートナー収入 ──
  const partnerBirthStr  = state.profile?.partnerBirth || state.profile?.partnerbirth;
  const partnerBirthYear = partnerBirthStr ? new Date(partnerBirthStr).getFullYear() : null;
  const partnerBase      = (parseFloat(state.finance.partnerIncome) || 0) * 12
                          + (parseFloat(state.finance.partnerBonus) || 0);
  const partnerGrowthRate = (parseFloat(state.finance.partnerGrowthRate) || 0) / 100;
  const partnerUntilAge   = parseInt(state.finance.partnerGrowthUntilAge) || untilAge;
  // [Phase 2.5 02-C01/06-C01 fix] パートナー昇給年数はパートナー自身の年齢基準で計算。生年未設定時は本人年齢 fallback で後方互換。
  const partnerCurrentAge = partnerBirthYear ? (currentYear - partnerBirthYear) : currentAge;

  let partnerIncomeThisYear = 0;
  if (partnerBase > 0) {
    const partnerGrowthYears = Math.max(0, Math.min(yearsElapsed, partnerUntilAge - partnerCurrentAge));
    partnerIncomeThisYear = partnerBase * Math.pow(1 + partnerGrowthRate, partnerGrowthYears);

    // パートナーのリタイア・セミリタイア設定を反映
    const pRetireAge  = parseInt(r.partnerTargetAge) || null;
    const pRetireYear = (partnerBirthYear && pRetireAge) ? partnerBirthYear + pRetireAge : null;
    if (pRetireYear && yr >= pRetireYear) {
      if (r.partnerType === 'semi') {
        const pSemiEndAge  = parseInt(r.partnerSemiEndAge) || null;
        const pSemiEndYear = (partnerBirthYear && pSemiEndAge) ? partnerBirthYear + pSemiEndAge : null;
        partnerIncomeThisYear = (!pSemiEndYear || yr < pSemiEndYear)
          ? (parseFloat(r.partnerSemiMonthlyIncome) || 0) * 12
          : 0;
      } else {
        partnerIncomeThisYear = 0; // フルリタイア
      }
    }
  }

  return selfIncome + partnerIncomeThisYear;
}

// ===== [Phase 4c 06-I02] 配偶者控除・配偶者特別控除（本実装） =====
// 国税庁 No.1191 / No.1195 準拠（2026年4月時点、軸1=パートナー所得 + 軸3=老人加算）
// [Phase 4e 06-I02 軸2 完全実装] 本人高所得者逓減（900/950/1000 万）追加で 3 軸完全対応。
// partnerAnnualIncomeMan: パートナーの年間合計所得（万円、給与所得控除後）
// partnerAge: パートナーの年齢（歳、null/NaN なら老人加算を無効化）
// 戻り値: { incomeTaxDeduction: 万円, residentTaxDeduction: 万円 }
function calcSpouseDeduction(partnerAnnualIncomeMan, partnerAge, selfTotalIncomeMan) {
  const inc = parseFloat(partnerAnnualIncomeMan) || 0;
  let incomeTaxDeduction, residentTaxDeduction;

  // 軸1: パートナー合計所得による逓減
  if (inc <= 95) {
    incomeTaxDeduction = 38;
    residentTaxDeduction = 33;
  } else if (inc <= 100) {
    incomeTaxDeduction = 36;
    residentTaxDeduction = 33;
  } else if (inc <= 105) {
    incomeTaxDeduction = 31;
    residentTaxDeduction = 31;
  } else if (inc <= 110) {
    incomeTaxDeduction = 26;
    residentTaxDeduction = 26;
  } else if (inc <= 115) {
    incomeTaxDeduction = 21;
    residentTaxDeduction = 21;
  } else if (inc <= 120) {
    incomeTaxDeduction = 16;
    residentTaxDeduction = 16;
  } else if (inc <= 125) {
    incomeTaxDeduction = 11;
    residentTaxDeduction = 11;
  } else if (inc <= 130) {
    incomeTaxDeduction = 6;
    residentTaxDeduction = 6;
  } else if (inc <= 133) {
    incomeTaxDeduction = 3;
    residentTaxDeduction = 3;
  } else {
    incomeTaxDeduction = 0;
    residentTaxDeduction = 0;
  }

  // 軸3: 老人配偶者加算（partnerAge ≥ 70 かつ 所得 ≤ 48）
  const age = Number.isFinite(partnerAge) ? partnerAge : null;
  if (age !== null && age >= 70 && inc <= 48) {
    incomeTaxDeduction += 10; // 38 → 48
    residentTaxDeduction += 5; // 33 → 38
  }

  // [Phase 4e 06-I02 軸2] 本人高所得者逓減（合計所得 900/950/1000 万円ライン）
  // 国税庁 No.1191 / No.1195: 本人合計所得別の控除逓減
  const selfInc = parseFloat(selfTotalIncomeMan) || 0;
  let highIncomeMultiplier = 1;
  if (selfInc > 1000) highIncomeMultiplier = 0;
  else if (selfInc > 950) highIncomeMultiplier = 1/3;
  else if (selfInc > 900) highIncomeMultiplier = 2/3;
  if (highIncomeMultiplier !== 1) {
    // [Phase 4e 06-I02 軸2] NTA / 住民税表に整合: 端数は Math.ceil で切り上げ
    // 例: 38 × 2/3 = 25.33 → 26（NTA 表の値）
    incomeTaxDeduction = Math.ceil(incomeTaxDeduction * highIncomeMultiplier);
    residentTaxDeduction = Math.ceil(residentTaxDeduction * highIncomeMultiplier);
  }

  return { incomeTaxDeduction, residentTaxDeduction };
}
