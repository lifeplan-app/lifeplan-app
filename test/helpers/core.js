/**
 * test/helpers/core.js
 *
 * index.html から抽出した純粋計算関数。
 * DOM・localStorage・Chart.js に依存しない関数のみを収録。
 *
 * ⚠️ index.html の対応する関数を変更したら、こちらも同期すること。
 *    変更箇所: ASSET_TYPES / TAX_TYPE_DEFAULT / effectiveReturn /
 *              calcAssetGrowth / calcAllAssetGrowth
 */

// ===== ASSET_TYPES =====
export const ASSET_TYPES = {
  nisa_tsumitate:     { label: 'つみたてNISA / 新NISA積立枠', emoji: '🌱', color: '#10B981', bg: '#D1FAE5', defaultReturn: 5,   annualLimit: 120,  monthlyLimit: 10,  lifetimeLimit: 1800 },
  nisa_growth:        { label: '新NISA 成長投資枠',           emoji: '📈', color: '#3B82F6', bg: '#DBEAFE', defaultReturn: 6,   annualLimit: 240,  monthlyLimit: 20,  lifetimeLimit: 1200 },
  nisa_old_tsumitate: { label: '旧つみたてNISA',               emoji: '🌿', color: '#059669', bg: '#D1FAE5', defaultReturn: 5,   noNewContrib: true, endYearDefault: 2042 },
  nisa_old_general:   { label: '旧一般NISA',                   emoji: '📋', color: '#1D4ED8', bg: '#DBEAFE', defaultReturn: 5,   noNewContrib: true, endYearDefault: 2027 },
  ideco:          { label: 'iDeCo',                       emoji: '🏛️', color: '#8B5CF6', bg: '#EDE9FE', defaultReturn: 4,   monthlyLimit: 2.3 },
  insurance:      { label: '積立保険',                    emoji: '🛡️', color: '#F59E0B', bg: '#FEF3C7', defaultReturn: 1.5 },
  trust_allworld: { label: '投資信託（全世界・オルカン）', emoji: '🌍', color: '#06B6D4', bg: '#CFFAFE', defaultReturn: 7 },
  trust_sp500:    { label: '投資信託（S&P500）',           emoji: '🇺🇸', color: '#4F46E5', bg: '#EEF2FF', defaultReturn: 8 },
  trust_other:    { label: '投資信託（その他）',           emoji: '📊', color: '#64748B', bg: '#F1F5F9', defaultReturn: 5 },
  japan_stock:    { label: '日本株',                      emoji: '🗾', color: '#EF4444', bg: '#FEE2E2', defaultReturn: 4 },
  high_dividend:  { label: '高配当株',                    emoji: '💴', color: '#F97316', bg: '#FFEDD5', defaultReturn: 4,   dividendYield: 3.5 },
  etf:            { label: 'ETF',                         emoji: '📉', color: '#0EA5E9', bg: '#E0F2FE', defaultReturn: 6 },
  cash_emergency: { label: '生活防衛資金',                 emoji: '🛟', color: '#0EA5E9', bg: '#E0F2FE', defaultReturn: 0.1 },
  cash_special:   { label: '特別費',                       emoji: '🗓️', color: '#8B5CF6', bg: '#EDE9FE', defaultReturn: 0.1 },
  cash_reserved:  { label: '用途が決まっている資金',       emoji: '🏷️', color: '#F59E0B', bg: '#FEF3C7', defaultReturn: 0.3 },
  cash_surplus:   { label: '余剰資金',                     emoji: '💹', color: '#10B981', bg: '#D1FAE5', defaultReturn: 0.1 },
  cash:           { label: '現金・預金（その他）',          emoji: '💵', color: '#6B7280', bg: '#F3F4F6', defaultReturn: 0.1 },
  other:          { label: 'その他',                      emoji: '✨', color: '#84CC16', bg: '#ECFCCB', defaultReturn: 3 },
};

// ===== TAX =====
export const TAX_TYPE_DEFAULT = {
  nisa_tsumitate: 'nisa', nisa_growth: 'nisa', nisa_old_tsumitate: 'nisa', nisa_old_general: 'nisa', ideco: 'ideco',
  insurance: 'tokutei', trust_allworld: 'tokutei', trust_sp500: 'tokutei',
  trust_other: 'tokutei', japan_stock: 'tokutei', high_dividend: 'tokutei',
  etf: 'tokutei', cash_emergency: 'cash', cash_special: 'cash',
  cash_reserved: 'cash', cash_surplus: 'cash', cash: 'cash', other: 'tokutei',
};

// 譲渡益・配当課税（特定口座・一般口座）: 所得税15.315%（復興特別所得税含む）+ 住民税5%
export const TAX_RATE = 0.20315;

export function effectiveReturn(annualReturn, taxType) {
  if (taxType === 'nisa' || taxType === 'ideco' || taxType === 'cash') return annualReturn;
  return annualReturn * (1 - TAX_RATE);
}

// ===== calcAssetGrowth =====
// returns { values: number[], overflows: number[], overflows2: number[] }
// values[y]    = y年末の資産残高（万円）、y=0 が現在
// overflows[y] = y年の余剰（→ overflowTargetId へ振替）
// overflows2[y]= y年の余剰（→ overflowTargetId2 へ振替）
export function calcAssetGrowth(a, years, extraContribs = [], _currentYear = new Date().getFullYear()) {
  const currentYear = _currentYear;
  const taxType = a.taxType || TAX_TYPE_DEFAULT[a.type] || 'tokutei';
  const nominalRate = (a.annualReturn || 0) / 100;

  const dividendMode = a.dividendMode || 'reinvest';
  const dividendRate = (dividendMode === 'cashout' && a.dividendYield) ? (a.dividendYield / 100) : 0;
  const growthRate   = Math.max(0, nominalRate - dividendRate);

  const t = ASSET_TYPES[a.type];
  const annualLimit   = t?.annualLimit   || null;
  const lifetimeLimit = t?.lifetimeLimit || null;
  let cumulativeBasis = a.nisaBasis || 0;

  const targetVal  = a.targetVal  || 0;
  const targetVal2 = a.targetVal2 || 0;

  const isOldNisa = !!(t?.noNewContrib && a.endYear);

  const values    = [];
  const overflows  = [];
  const overflows2 = [];

  for (let y = 0; y <= years; y++) {
    const yr = currentYear + y;
    const isActive = (!a.startYear || yr >= a.startYear) && (!a.endYear || yr <= a.endYear);
    let annualContrib = isActive ? (a.monthly || 0) * 12 + (a.annualBonus || 0) : 0;
    let overflow  = 0;
    let overflow2 = 0;

    if (y > 0) {
      const prev = values[y - 1];

      const activeTaxType = (isOldNisa && yr > a.endYear) ? 'tokutei' : taxType;
      const rate = effectiveReturn(growthRate, activeTaxType);

      const extraThisYear = extraContribs[y] || 0;

      if (targetVal > 0 && prev >= targetVal) {
        if (targetVal2 > 0 && prev < targetVal2) {
          overflow = annualContrib;
          annualContrib = extraThisYear;
        } else {
          overflow2 = targetVal2 > 0 ? annualContrib + extraThisYear : 0;
          overflow  = targetVal2 > 0 ? 0 : annualContrib + extraThisYear;
          annualContrib = 0;
        }
      } else {
        if (annualContrib > 0 && annualLimit) {
          annualContrib = Math.min(annualContrib, annualLimit);
        }

        if (annualContrib > 0 && lifetimeLimit) {
          const remaining = Math.max(0, lifetimeLimit - cumulativeBasis);
          const capped = Math.min(annualContrib, remaining);
          if (!targetVal) overflow += annualContrib - capped;
          annualContrib = capped;
          cumulativeBasis += annualContrib;
        }

        annualContrib += extraThisYear;
      }

      const grown = rate === 0
        ? prev + annualContrib
        : prev * (1 + rate) + annualContrib;

      let finalVal = Math.round(grown * 10) / 10;
      if (targetVal > 0 && prev < targetVal && finalVal > targetVal && overflow === 0) {
        overflow = Math.round((finalVal - targetVal) * 10) / 10;
        finalVal = targetVal;
      }
      if (targetVal2 > 0 && prev >= targetVal && prev < targetVal2 && finalVal > targetVal2 && overflow2 === 0) {
        overflow2 = Math.round((finalVal - targetVal2) * 10) / 10;
        finalVal  = targetVal2;
      }

      // ⑥ 目標維持フェーズのハードキャップ
      // prev === targetVal の場合のみ発動（初期残高が目標超の場合は無効）
      // 利息超過分は消滅（overflow には加算しない）
      if (targetVal > 0 && prev >= targetVal) {
        if (targetVal2 > 0 && prev === targetVal2 && finalVal > targetVal2) {
          finalVal = targetVal2;
        } else if (targetVal2 === 0 && prev === targetVal && finalVal > targetVal) {
          finalVal = targetVal;
        }
      }

      values.push(finalVal);
      overflows.push(Math.round(overflow * 10) / 10);
      overflows2.push(Math.round(overflow2 * 10) / 10);
    } else {
      values.push(a.currentVal || 0);
      overflows.push(0);
      overflows2.push(0);
    }
  }
  return { values, overflows, overflows2 };
}

// ===== calcAllAssetGrowth =====
// 全アセットの成長データを2パス（NISA合算プール + トポロジカルソート）で計算
export function calcAllAssetGrowth(assets, years) {
  years = Math.max(1, parseInt(years) || 20);
  const currentYear = new Date().getFullYear();
  const NISA_NEW = ['nisa_tsumitate', 'nisa_growth'];
  const NISA_COMBINED_LIMIT = 1800;

  const nisaAssets  = assets.filter(a => NISA_NEW.includes(a.type));
  const otherAssets = assets.filter(a => !NISA_NEW.includes(a.type));

  const NISA_OWNERS = ['self', 'partner'];
  const nisaPoolRemainingByOwner = {};
  NISA_OWNERS.forEach(own => {
    const ownerNisaAssets = nisaAssets.filter(a => (a.owner || 'self') === own);
    const basis0 = ownerNisaAssets.reduce((s, a) => s + (a.nisaBasis || 0), 0);
    nisaPoolRemainingByOwner[own] = Math.max(0, NISA_COMBINED_LIMIT - basis0);
  });

  const nisaStates = nisaAssets.map(a => {
    const t = ASSET_TYPES[a.type] || {};
    const divRate = (a.dividendMode === 'cashout' && a.dividendYield) ? a.dividendYield / 100 : 0;
    return {
      asset: a,
      owner: a.owner || 'self',
      values: [a.currentVal || 0],
      overflows: [0],
      growthRate: Math.max(0, (a.annualReturn || 0) / 100 - divRate),
      annualLimit: t.annualLimit || null,
      targetVal: a.targetVal || 0,
    };
  });

  for (let y = 1; y <= years; y++) {
    const yr = currentYear + y;

    const desired = nisaStates.map(s => {
      const a = s.asset;
      const isActive = (!a.startYear || yr >= a.startYear) && (!a.endYear || yr <= a.endYear);
      if (!isActive) return 0;
      if (s.targetVal > 0 && s.values[y - 1] >= s.targetVal) return 0;
      let c = (a.monthly || 0) * 12 + (a.annualBonus || 0);
      if (c > 0 && s.annualLimit) c = Math.min(c, s.annualLimit);
      return c;
    });

    const actual = nisaStates.map((s, i) => {
      const d = desired[i];
      if (d <= 0) return 0;
      const own = s.owner;
      const poolLeft = nisaPoolRemainingByOwner[own] || 0;
      if (poolLeft <= 0) return 0;
      const ownerTotal = nisaStates.reduce((sum, ss, ii) => sum + (ss.owner === own ? desired[ii] : 0), 0);
      return ownerTotal <= poolLeft ? d : (d / ownerTotal) * poolLeft;
    });

    NISA_OWNERS.forEach(own => {
      const used = nisaStates.reduce((sum, s, i) => sum + (s.owner === own ? actual[i] : 0), 0);
      nisaPoolRemainingByOwner[own] = Math.max(0, nisaPoolRemainingByOwner[own] - used);
    });

    nisaStates.forEach((s, i) => {
      const prev = s.values[y - 1];
      const rate = effectiveReturn(s.growthRate, 'nisa');
      const contrib = actual[i];
      const overflow = Math.max(0, Math.round((desired[i] - contrib) * 10) / 10);
      let finalVal = Math.round((rate === 0 ? prev + contrib : prev * (1 + rate) + contrib) * 10) / 10;
      if (s.targetVal > 0 && prev < s.targetVal && finalVal > s.targetVal) {
        s.overflows.push(Math.round((overflow + finalVal - s.targetVal) * 10) / 10);
        finalVal = s.targetVal;
      } else {
        s.overflows.push(overflow);
      }
      s.values.push(finalVal);
    });
  }

  const nisaPass = nisaStates.map(s => ({ asset: s.asset, data: s.values, overflows: s.overflows }));

  const extraMap = {};
  nisaPass.forEach(g => {
    const tid = g.asset.nisaOverflowTargetId || g.asset.overflowTargetId;
    if (!tid || !g.overflows.some(v => v > 0)) return;
    if (!extraMap[tid]) extraMap[tid] = new Array(years + 1).fill(0);
    g.overflows.forEach((v, y) => { extraMap[tid][y] += v; });
  });

  const otherIds = new Set(otherAssets.map(a => a.id));

  const inDegree = {};
  otherAssets.forEach(a => { inDegree[a.id] = 0; });
  otherAssets.forEach(a => {
    if (a.overflowTargetId  && otherIds.has(a.overflowTargetId))  inDegree[a.overflowTargetId]++;
    if (a.overflowTargetId2 && otherIds.has(a.overflowTargetId2)) inDegree[a.overflowTargetId2]++;
  });

  const resultMap = {};
  const queue = otherAssets.filter(a => inDegree[a.id] === 0);

  while (queue.length > 0) {
    const a = queue.shift();
    const extra = extraMap[a.id] || [];
    const r = calcAssetGrowth(a, years, extra);
    resultMap[a.id] = { asset: a, data: r.values, overflows: r.overflows, overflows2: r.overflows2 };

    const tid = a.overflowTargetId;
    if (tid) {
      if (r.overflows.some(v => v > 0)) {
        if (!extraMap[tid]) extraMap[tid] = new Array(years + 1).fill(0);
        r.overflows.forEach((v, y) => { extraMap[tid][y] += v; });
      }
      if (otherIds.has(tid)) {
        inDegree[tid]--;
        if (inDegree[tid] === 0) {
          const target = otherAssets.find(x => x.id === tid);
          if (target) queue.push(target);
        }
      }
    }

    const tid2 = a.overflowTargetId2;
    if (tid2 && r.overflows2 && r.overflows2.some(v => v > 0)) {
      if (!extraMap[tid2]) extraMap[tid2] = new Array(years + 1).fill(0);
      r.overflows2.forEach((v, y) => { extraMap[tid2][y] += v; });
      if (otherIds.has(tid2)) {
        inDegree[tid2]--;
        if (inDegree[tid2] === 0) {
          const target2 = otherAssets.find(x => x.id === tid2);
          if (target2) queue.push(target2);
        }
      }
    }
  }

  otherAssets.forEach(a => {
    if (!resultMap[a.id]) {
      const extra = extraMap[a.id] || [];
      const r = calcAssetGrowth(a, years, extra);
      resultMap[a.id] = { asset: a, data: r.values, overflows: r.overflows, overflows2: r.overflows2 };
    }
  });

  const wastedContribsByYear = new Array(years + 1).fill(0);
  nisaPass.forEach(g => {
    const tid = g.asset.nisaOverflowTargetId || g.asset.overflowTargetId;
    if (!tid) {
      g.overflows.forEach((v, idx) => { if (v > 0) wastedContribsByYear[idx] += v; });
    }
  });
  Object.values(resultMap).forEach(g => {
    if (!g.asset.overflowTargetId) {
      g.overflows.forEach((v, idx) => { if (v > 0) wastedContribsByYear[idx] += v; });
    }
    if (!g.asset.overflowTargetId2 && g.overflows2) {
      g.overflows2.forEach((v, idx) => { if (v > 0) wastedContribsByYear[idx] += v; });
    }
  });

  const growthResult = assets.map(a =>
    nisaPass.find(r => r.asset === a) || resultMap[a.id]
  );
  growthResult._wastedContribsByYear = wastedContribsByYear;
  return growthResult;
}

// ===== projectEmergencyBalance =====
// calcRetirementSimWithOpts 内の _emergAtRetire 計算を抽出した純粋関数。
// 生活防衛資金アセットを yearsToRetire 年分複利成長させ、targetVal(2) でキャップした残高を返す。
//
// BUG#1 修正前: emergencyPool = assetsAtRetire * (currentEmergency / currentTotal)
//   → targetVal を無視してスケールするため、実際より大幅に大きい値になっていた
// BUG#1 修正後: 年ごとに上限キャップ付きで複利成長させた実額を使用
export function projectEmergencyBalance(asset, yearsToRetire) {
  const rate     = ((asset.annualReturn != null ? asset.annualReturn : 0.1)) / 100;
  const monthly  = asset.monthly || 0;
  const finalCap = (asset.targetVal2 > 0) ? asset.targetVal2
                 : (asset.targetVal  > 0) ? asset.targetVal
                 : Infinity;
  let bal = asset.currentVal || 0;
  for (let y = 0; y < yearsToRetire; y++) {
    bal = Math.min(
      finalCap,
      bal * (1 + rate) + (bal < finalCap ? Math.min(monthly * 12, finalCap - bal) : 0),
    );
  }
  return Math.min(bal, finalCap < Infinity ? finalCap : bal);
}

// ===== syncEndYear (endAge → endYear 変換の純粋計算部分) =====
// BUG#4 修正前: currentYear + (age - currentAge) → 誕生日未到来時に1年ズレ
// BUG#4 修正後: birthYear + age → 誕生年基準で常に一意
export function calcEndYearFromAge(birthYear, age) {
  return birthYear + age;
}
export function calcEndAgeFromYear(birthYear, endYear) {
  return endYear - birthYear;
}
