// Phase 3 Step 7: シナリオ比較（楽観・標準・悲観の複数シナリオ並走）
// 依存:
//   - calc/retirement.js (calcRetirementSimWithOpts)
//   - calc/utils.js (calcAge)
//   - calc/integrated.js (calcIntegratedSim, Task 9 で抽出予定)
//
// 注:
//   calcScenarioFullTimeline が calcIntegratedSim を呼ぶが、Phase 3 Task 9 で抽出予定。
//   ブラウザ実行時は同一グローバルスコープで問題なし。
//   Node テスト側では現在 scenarios 系を直接呼ばないため影響なし。

// シナリオ比較のベース値を取得
function getScenarioBase() {
  const ret = state.retirement || {};
  const baseRetireAge    = parseInt(ret.targetAge) || 65;
  const baseExpense      = parseFloat(ret.monthlyExpense) || 20;
  return { baseRetireAge, baseExpense };
}

// 現在の状況に応じたアダプティブシナリオを生成
function getAdaptiveScenarios() {
  const { baseRetireAge, baseExpense } = getScenarioBase();
  // 現在のメインシミュレーションが枯渇しているか確認
  const mainSim = calcRetirementSimWithOpts({});
  const isDepleted = mainSim && mainSim.some(r => r.endAssets <= 0 || r.depleted);

  if (isDepleted) {
    // 枯渇している → 改善の余地を探るパターン
    return [
      {
        name: '退職を遅らせたら？',
        retireAge: Math.min(75, baseRetireAge + 5),
        monthlyExpense: baseExpense,
        returnMod: 0,
        _hint: `退職を${Math.min(75, baseRetireAge + 5)}歳に遅らせた場合`,
      },
      {
        name: '生活費を減らしたら？',
        retireAge: baseRetireAge,
        monthlyExpense: Math.max(10, baseExpense - 5),
        returnMod: 0,
        _hint: `老後の生活費を月${Math.max(10, baseExpense - 5)}万円に抑えた場合`,
      },
      {
        name: '両方組み合わせたら？',
        retireAge: Math.min(75, baseRetireAge + 3),
        monthlyExpense: Math.max(10, baseExpense - 3),
        returnMod: 0,
        _hint: `退職を${Math.min(75, baseRetireAge + 3)}歳に遅らせ、生活費も月${Math.max(10, baseExpense - 3)}万円に抑えた場合`,
      },
    ];
  } else {
    // 成立している → 余裕を探るパターン
    return [
      {
        name: 'もっと早く辞められる？',
        retireAge: Math.max(45, baseRetireAge - 3),
        monthlyExpense: baseExpense,
        returnMod: 0,
        _hint: `退職を${Math.max(45, baseRetireAge - 3)}歳に早めた場合`,
      },
      {
        name: 'もっと使っても大丈夫？',
        retireAge: baseRetireAge,
        monthlyExpense: Math.min(60, baseExpense + 5),
        returnMod: 0,
        _hint: `老後の生活費を月${Math.min(60, baseExpense + 5)}万円に増やした場合`,
      },
      {
        name: '運用を積極化したら？',
        retireAge: baseRetireAge,
        monthlyExpense: baseExpense,
        returnMod: 2,
        _hint: `現在の利回りより+2%で運用できた場合（試算）`,
      },
    ];
  }
}

// シナリオ1件のシミュレーション実行
function calcScenarioSim(sc) {
  const ret = state.retirement;
  if (!ret) return null;
  const { baseRetireAge, baseExpense } = getScenarioBase();

  // 退職年齢・生活費・リスクパラメータを一時上書き
  const origRetireAge    = ret.targetAge;
  const origExpense      = ret.monthlyExpense;
  const origInflationRate = ret.inflationRate;
  const origPensionSlide  = ret.pensionSlide;
  ret.targetAge      = String(sc.retireAge      ?? baseRetireAge);
  ret.monthlyExpense = String(sc.monthlyExpense  ?? baseExpense);
  if (sc.inflationRate != null) ret.inflationRate = sc.inflationRate;
  if (sc.pensionSlide  != null) ret.pensionSlide  = sc.pensionSlide;

  let result = null;
  try {
    result = calcRetirementSimWithOpts({ returnMod: (sc.returnMod || 0) / 100 }) || null;
  } catch(e) {
    console.warn('calcScenarioSim error:', e);
  }

  // 元に戻す
  ret.targetAge      = origRetireAge;
  ret.monthlyExpense = origExpense;
  ret.inflationRate  = origInflationRate;
  ret.pensionSlide   = origPensionSlide;
  return result;
}

// シナリオ全期間タイムライン（現在年齢〜想定余命）
function calcScenarioFullTimeline(sc) {
  const currentAge = calcAge();
  const ret = state.retirement;
  if (!currentAge || !ret?.targetAge) return calcScenarioSim(sc);

  const { baseRetireAge } = getScenarioBase();
  const retireAge = sc.retireAge ?? parseInt(ret.targetAge) ?? baseRetireAge;
  const yearsToRetire = Math.max(0, retireAge - currentAge);

  // 退職前: 現状収支ベースの資産推移
  const preSim = calcIntegratedSim(yearsToRetire);
  const preResult = [];
  for (let y = 0; y <= yearsToRetire; y++) {
    const age = currentAge + y;
    const base = preSim[y] || { totalWealth: 0 };
    preResult.push({ age, endAssets: Math.round(base.totalWealth) });
  }

  // 退職後: シナリオ別シミュレーション
  const postResult = calcScenarioSim(sc);
  if (!postResult || postResult.length === 0) return preResult;

  // 退職時点で連続性を補正
  const preAtRetire = preResult[preResult.length - 1]?.endAssets || 0;
  const postAtRetire = postResult[0]?.endAssets || 0;
  const delta = preAtRetire - postAtRetire;

  return [
    ...preResult.slice(0, -1),
    ...postResult.map(r => ({ age: r.age, endAssets: r.endAssets + delta })),
  ];
}
