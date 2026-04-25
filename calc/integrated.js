// calc/integrated.js
// Phase 3 Step 8: 統合キャッシュフローシミュレーション（Phase 1 スナップショット 5 件の主要対象）
// 依存: calc/utils.js, calc/asset-growth.js, calc/income-expense.js, calc/life-events.js,
//       calc/mortgage.js, calc/retirement.js (getRetirementParams), calc/scenarios.js

function calcIntegratedSim(years, opts = {}) {
  const currentYear = new Date().getFullYear();
  years = Math.max(1, parseInt(years) || (state.finance?.simYears || 20));
  const result = [];

  // アセット別の成長データを計算（2パス：振替元→振替先）
  const growthData = calcAllAssetGrowth(state.assets, years);

  // ── 二プールモデル: 現金プール / 投資プール ──
  // [Phase 4b 07-I02] cash_reserved は用途決定済み資金のため生活費赤字補填対象外
  // cashPool 表示には含めるが、virtualCash（赤字補填判定）からは除外して隔離する
  const _CASH_T = new Set(['cash','cash_emergency','cash_special','cash_surplus','savings','deposit']);
  const _CASH_RESERVED_T = new Set(['cash_reserved']);
  const _cashGD     = growthData.filter(g => _CASH_T.has(g.asset.type));
  const _reservedGD = growthData.filter(g => _CASH_RESERVED_T.has(g.asset.type));
  const _investGD   = growthData.filter(g => !_CASH_T.has(g.asset.type) && !_CASH_RESERVED_T.has(g.asset.type));

  // 投資資産の加重平均リターン（不足時の機会損失複利計算用）
  // [Phase 4b 07-I03] 年次再計算用ヘルパも併置。初年度は currentVal ベース（既存互換）、
  // y>=1 では積立後の data[y] を用いた時価加重で再計算する。
  const _totalInvestVal = _investGD.reduce((s, g) => s + (g.asset.currentVal || 0), 0);
  const _wInvestReturn = _totalInvestVal > 0
    ? _investGD.reduce((s, g) => {
        // [Phase 4n 07-M01] per-asset デフォルトを 5% に統一（overall fallback の 0.05 と整合）
        const rate = (g.asset.return != null ? g.asset.return
          : (g.asset.annualReturn != null ? g.asset.annualReturn : 5)) / 100;
        return s + (g.asset.currentVal || 0) * rate;
      }, 0) / _totalInvestVal
    : 0.05;

  // [Phase 4b 07-I03] 年次再計算：投資プール構成（data[y]）の時価加重でリターンを毎年再算出
  function _calcWInvestReturnAt(y) {
    const totalNow = _investGD.reduce((s, g) => s + (g.data[y] || 0), 0);
    if (totalNow <= 0) return _wInvestReturn;
    return _investGD.reduce((s, g) => {
      // [Phase 4n 07-M01] per-asset デフォルトを 5% に統一
      const rate = (g.asset.return != null ? g.asset.return
        : (g.asset.annualReturn != null ? g.asset.annualReturn : 5)) / 100;
      return s + (g.data[y] || 0) * rate;
    }, 0) / totalNow;
  }

  let _investDeficit = 0;       // 累積清算額（機会損失複利で増加）
  const _liquidationEvents = []; // 清算発生年の記録

  // 配当受取アセット（cashoutモード）を抽出
  const cashoutAssets = state.assets.filter(a =>
    a.dividendMode === 'cashout' && a.dividendYield > 0
  );

  // [Phase 2.5 05-C03 fix] 住宅ローン amortization スケジュールをループ外で1回生成
  const _mortgageSchedule = calcMortgageSchedule();

  // [Phase 2.5 06-C02 fix] パートナー退職後の月支出変化をループ外で事前算出
  const _rIS = state.retirement || {};
  const _pBirthStrIS = state.profile?.partnerBirth || state.profile?.partnerbirth;
  const _pBirthYearIS = _pBirthStrIS ? new Date(_pBirthStrIS).getFullYear() : null;
  const _pRetireYearIS = (_pBirthYearIS && _rIS.partnerTargetAge)
    ? _pBirthYearIS + parseInt(_rIS.partnerTargetAge) : null;
  const _pExpChangeMonthlyIS = parseFloat(_rIS.partnerExpenseChange) || 0;
  // [Phase 4b 06-I03] パートナー退職後 60 歳未満の国民年金保険料（17,510 円/月 × 12 = 21.012 万円/年、令和 7 年度）
  const _pAge60YearIS = _pBirthYearIS ? _pBirthYearIS + 60 : null;

  // [Phase 2.5 09-C01 fix] 現役期もインフレ係数を適用（退職シミュとの非対称性解消）
  // [Phase 4b 02-I02] インフレ変数統一: retirement.inflationRate 明示設定なら優先、
  //   未設定なら finance.inflationRate（既定 2%）にフォールバック。
  //   calc/retirement.js の _getInflationRate を script 読み込み順で global 共有。
  const _infRateIS = _getInflationRate(state);

  for (let y = 0; y <= years; y++) {
    const yr = currentYear + y;
    // [Phase 2.5 09-C01 fix] 今年からの経過年でインフレ係数を算出
    const _infFactorIS = Math.pow(1 + _infRateIS, y);

    const leCostRaw = calcLECostByYear(yr, opts);
    // [Phase 2.5 09-C01 fix] 各カテゴリに対して個別にインフレ適用
    // mortgage（ローン返済/賃料）と scholarship（奨学金返済）は契約額/rent.riseRate で別途処理済みのため名目固定
    const leCost = {
      childcare:   leCostRaw.childcare   * _infFactorIS,
      education:   leCostRaw.education   * _infFactorIS,
      mortgage:    leCostRaw.mortgage,    // ローン返済は契約額で名目固定（賃貸は riseRate で別途上昇）
      care:        leCostRaw.care        * _infFactorIS,
      scholarship: leCostRaw.scholarship, // 奨学金返済も契約額で名目固定
    };
    const totalLE = leCost.childcare + leCost.education + leCost.mortgage + leCost.care + leCost.scholarship;
    let annualIncome  = getIncomeForYearWithGrowth(yr);
    // [Phase 4a 09-I01] gross モード時は手取率 NET_RATIO(0.78) を乗算（配当は calcAllAssetGrowth で税引き済みのため二重適用しない）
    if (state.finance?._inputMode === 'gross') annualIncome *= 0.78;
    // [Phase 4c 06-I02] 配偶者控除は calcTakeHome 本体で本実装。Phase 4b の annualIncome *= 1.005 近似は削除。
    // [Phase 2.5 09-C01 fix] 現役期の年間支出にもインフレを適用
    let annualExpense   = getExpenseForYear(yr) * _infFactorIS;
    // [Phase 2.5 06-C02 fix] パートナー退職後の月支出変化を加算（calcRetirementSimWithOpts:17666 と同等ロジック）
    if (_pRetireYearIS !== null && yr >= _pRetireYearIS) {
      annualExpense += _pExpChangeMonthlyIS * 12;
    }
    // [Phase 4b 06-I03] パートナー退職後 60 歳未満の国民年金保険料を支出に加算
    if (_pRetireYearIS !== null && yr >= _pRetireYearIS
        && _pAge60YearIS !== null && yr < _pAge60YearIS) {
      annualExpense += 21.012;
    }
    const oneTime       = getOneTimeForYear(yr);

    // 配当受取（cashout）アセットの年間配当をキャッシュフローに加算
    const DIV_TAX_RATE = 0.20315;
    const annualDividendCashout = y === 0 ? 0 : cashoutAssets.reduce((s, a) => {
      const gd = growthData.find(g => g.asset.id === a.id);
      const prevVal = gd ? (gd.data[y - 1] || 0) : 0;
      const grossDiv = prevVal * (a.dividendYield / 100);
      const isTaxable = (a.taxType === 'tokutei' || a.taxType === 'ippan');
      const netDiv = isTaxable ? grossDiv * (1 - DIV_TAX_RATE) : grossDiv;
      return s + netDiv;
    }, 0);

    // [Phase 2.5 05-C03 fix] 統合シミュも退職シミュと同じ amortization を使う（線形近似は廃止）
    const _mortgageRow = _mortgageSchedule && _mortgageSchedule.get ? _mortgageSchedule.get(yr) : null;
    const mortgageBalanceInteg = _mortgageRow
      ? (_mortgageRow.principalEnd ?? _mortgageRow.balance ?? 0)
      : 0;
    // [Phase 4a 09-I03] opts.noLoan 時は住宅ローン控除を除外
    const annualMortgageDeduct = (y === 0 || opts.noLoan) ? 0 : calcMortgageDeduction(yr, mortgageBalanceInteg);

    // 年間収支の累積（収入 − 支出 − ライフイベント + 一時収支 + 配当 + 控除）
    // y=0 は「現在の残高がそのままスタート地点」とし、支出差し引きはy=1以降のみ適用
    // （currentValにはすでに今年の支払い済み分が反映されているため二重計上を防ぐ）
    // wastedContribs: NISA上限到達・目標達成により実際には投資されなかった積立分を加算補正
    // （getExpenseForYear が計画通りに控除する一方、investAssetBase に入らないため消失するのを防ぐ）
    const wastedContribs = y === 0 ? 0 : (growthData._wastedContribsByYear?.[y] || 0);
    const cashFlow = y === 0
      ? 0
      : result[y-1].cashFlow + annualIncome - annualExpense - totalLE + oneTime + annualDividendCashout + annualMortgageDeduct + wastedContribs;

    // ── プール計算 ──
    const cashAssetBase   = _cashGD.reduce((s, g) => s + (g.data[y] || 0), 0);
    const investAssetBase = _investGD.reduce((s, g) => s + (g.data[y] || 0), 0);

    // [Phase 2.5 07-C01 fix] 投資プール枯渇後は機会損失複利と清算を停止
    // investAssetBase は積立で年次増加するため、一度枯渇しても積立で復活する場合は継続
    const investPoolHealthy = _investDeficit < investAssetBase;

    // 既存の不足累積に複利をかける（前年に清算した分の機会損失）
    // 枯渇中は複利成長させない（架空残高の防止）
    // [Phase 4b 07-I03] 年次再計算：初年度時価固定ではなく、積立後の現在時価で加重したリターンを使う
    if (y > 0 && investPoolHealthy) _investDeficit *= (1 + _calcWInvestReturnAt(y));

    // [Phase 4b 07-I02] reservedPool（cash_reserved 合計）は virtualCash には入れず、
    // cashPool 表示にだけ加算して用途決定済み資金を赤字補填から隔離する
    const reservedAssetBase = _reservedGD.reduce((s, g) => s + (g.data[y] || 0), 0);

    // 仮想現金プール = 現金資産 + 累積収支（cash_reserved は除外）
    const virtualCash = cashAssetBase + cashFlow;
    let liquidationThisYear = 0;
    let adjustedCashFlow = cashFlow;

    if (y > 0 && virtualCash < 0 && investPoolHealthy) {
      // 現金プールが不足 → 投資資産を清算して補填
      // [Phase 4a 07-I01/09-I02] 清算額を税引後ネット必要額から額面に換算
      // 投資プール構成から加重実効税率を計算し、net 必要額 → gross 清算額へ
      const netNeeded = -virtualCash;
      const poolVal = _investGD.reduce((s, g) => s + (g.data[y] || 0), 0);
      const weightedTax = poolVal > 0
        ? _investGD.reduce((s, g) => {
            const tt = g.asset.taxType || TAX_TYPE_DEFAULT[g.asset.type] || 'tokutei';
            const rate = (tt === 'nisa' || tt === 'ideco' || tt === 'cash') ? 0 : TAX_RATE;
            return s + (g.data[y] || 0) * rate;
          }, 0) / poolVal
        : TAX_RATE;
      // 額面必要額 = ネット / (1 - weightedTax)
      liquidationThisYear = netNeeded / Math.max(0.01, 1 - weightedTax);
      _investDeficit += liquidationThisYear;
      // 手取り（netNeeded）分のみ現金プールに補填（税金は消費される）
      adjustedCashFlow = cashFlow + netNeeded; // 清算後: cashPool ≒ 0
      _liquidationEvents.push({ y, yr, amount: Math.round(liquidationThisYear) });
    }
    // else: 投資プール枯渇中は清算不能 → adjustedCashFlow はマイナスのまま残す

    // [Phase 4b 07-I02] cashPool 合計には reservedPool を加算（互換維持・snapshot 差分最小）
    const cashPool   = Math.max(0, cashAssetBase + adjustedCashFlow) + reservedAssetBase;
    const investPool = Math.max(0, investAssetBase - _investDeficit);

    result.push({
      year: yr,
      cashFlow: Math.round(adjustedCashFlow),   // 後方互換（清算調整済み）
      cashPool: Math.round(cashPool),
      investPool: Math.round(investPool),
      cashAssetBase: Math.round(cashAssetBase),
      investAssetBase: Math.round(investAssetBase),
      assetTotal: Math.round(cashPool + investPool),
      totalWealth: Math.round(cashPool + investPool),
      leCost: Math.round(totalLE),
      annualIncome: Math.round(annualIncome),
      annualExpense: Math.round(annualExpense),
      oneTime: Math.round(oneTime),
      dividendCashout: Math.round(annualDividendCashout),
      mortgageDeduct: Math.round(annualMortgageDeduct),
      liquidation: Math.round(liquidationThisYear),
    });
  }
  result._liquidationEvents = _liquidationEvents;
  return result;
}
