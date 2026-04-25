// spending/calc/suggest.js
// 改善提案・節約インパクト計算

/**
 * 直近 nMonths ヶ月のカテゴリ別・ドメイン別平均を計算
 * @param {object} months - state.months 形式（{ 'YYYY-MM': monthData }）
 * @param {number} nMonths - 平均化する月数
 * @returns {object|null} { cats, domains, nMonths, keys } データ無しなら null
 */
export function calcSuggestionAvg(months, nMonths) {
  const keys = Object.keys(months || {}).sort().slice(-nMonths);
  if (!keys.length) return null;
  const n = keys.length;
  const cats = {}, domains = {};
  for (const k of keys) {
    const d = months[k];
    for (const [id, amt] of Object.entries(d.categoryTotals || {})) cats[id] = (cats[id] || 0) + amt;
    for (const [id, amt] of Object.entries(d.domainTotals || {})) domains[id] = (domains[id] || 0) + amt;
  }
  Object.keys(cats).forEach(k => cats[k] /= n);
  Object.keys(domains).forEach(k => domains[k] /= n);
  return { cats, domains, nMonths: n, keys };
}

/**
 * 月 monthlySavings 円の節約が将来いくらになるか（複利計算）
 * @param {number} monthlySavings - 月次節約額（円）
 * @param {object|null} lifeplan - lifeplan_v1 オブジェクト（profile.birth, assets を参照）。null なら既定 30年/3%
 * @returns {object} { amount: 万円単位, years, rate: % 単位（小数1桁） }
 */
export function calcSavingsImpact(monthlySavings, lifeplan = null) {
  let years = 30;
  let rate = 0.03;
  if (lifeplan) {
    if (lifeplan.profile?.birth) {
      const age = new Date().getFullYear() - parseInt(lifeplan.profile.birth.split('-')[0]);
      years = Math.max(5, 75 - age);
    }
    if (lifeplan.assets?.length) {
      const totalBal = lifeplan.assets.reduce((s, a) => s + (a.amount || 0), 0);
      if (totalBal > 0) {
        const wr = lifeplan.assets.reduce((s, a) => s + (a.return || 0) * (a.amount || 0), 0) / totalBal;
        if (wr > 0 && wr < 20) rate = wr / 100;
      }
    }
  }
  const r12 = rate / 12;
  const n = years * 12;
  const fv = monthlySavings * ((Math.pow(1 + r12, n) - 1) / r12);
  return { amount: Math.round(fv / 10000), years, rate: Math.round(rate * 1000) / 10 };
}
