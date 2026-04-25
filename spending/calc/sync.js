// spending/calc/sync.js
// spending → lifeplan 連携用の集計値計算

export function calcSyncValues(months, avgMonths, { excludeHousing = true, excludeFamily = false } = {}) {
  const keys = Object.keys(months || {}).sort().slice(-avgMonths);
  if (!keys.length) return null;

  let mfSum = 0, mvSum = 0, ifSum = 0, ivSum = 0, famSum = 0, housingSum = 0;
  for (const k of keys) {
    const d = months[k];
    mfSum     += d.domainTotals?.monthly_fixed     || 0;
    mvSum     += d.domainTotals?.monthly_variable  || 0;
    ifSum     += d.domainTotals?.irregular_fixed   || 0;
    ivSum     += d.domainTotals?.irregular_variable|| 0;
    famSum    += d.categoryTotals?.family          || 0;
    housingSum+= d.categoryTotals?.housing         || 0;
  }
  const n = keys.length;
  const housingAvg      = housingSum / n;
  const familyAvg       = famSum / n;
  const monthlyFixedRaw = mfSum / n;
  const monthlyFixed =
    monthlyFixedRaw
    - (excludeHousing ? housingAvg : 0)
    - (excludeFamily  ? familyAvg  : 0);
  const monthlyVariable = mvSum / n;
  return {
    monthlyFixedRaw,
    monthlyFixed,
    monthlyVariable,
    monthlyTotal:      monthlyFixed + monthlyVariable,
    irregularFixed:    ifSum / n,
    irregularVariable: ivSum / n,
    housingAvg,
    familyAvg,
    basedOnMonths: keys,
  };
}
