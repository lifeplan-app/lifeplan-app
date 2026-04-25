// spending/calc/aggregate.js
// エントリ集計・月次データ取得

export function aggregateEntries(entries, categories) {
  const catMap = Object.fromEntries(categories.map(c => [c.id, c]));
  const categoryTotals = {};
  const domainTotals = { monthly_fixed: 0, monthly_variable: 0, irregular_fixed: 0, irregular_variable: 0 };
  let totalExpense = 0;
  let income = 0;

  for (const e of entries) {
    if (e.isIncome) { income += e.amount; continue; }
    const cat = catMap[e.categoryId];
    if (!cat) continue;
    categoryTotals[e.categoryId] = (categoryTotals[e.categoryId] || 0) + e.amount;
    domainTotals[cat.domain] = (domainTotals[cat.domain] || 0) + e.amount;
    totalExpense += e.amount;
  }
  return { categoryTotals, domainTotals, totalExpense, income };
}

export function getMonthData(months, monthKey) {
  return (months && months[monthKey]) || null;
}
