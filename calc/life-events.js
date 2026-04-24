// calc/life-events.js
// Phase 3 Step 4: ライフイベント費用（教育費・保育・育休減収・介護・奨学金返済）
// 依存: calc/utils.js
//
// 定数は const のままでも問題なし（現時点ではテストから直接参照されていないため）。
// 将来テストで sb.EDU_COST を参照する必要が生じたら var に変更する。

// 教育費プリセット（万円/年, 文部科学省子供の学習費調査 令和3年度ベース）
// [Phase 4b 03-I05] 公立幼稚園 6 → 18.46 万円（文科省令和5年度「子供の学習費調査」基準）
const EDU_COST = {
  nursery:      { public: 20,  private: 45 },   // 0-2歳
  kindergarten: { public: 18.46, private: 17 }, // 3-5歳（無償化後・令和5年度「子供の学習費調査」）
  elementary:   { public: 35,  private: 167 },  // 6-11歳
  juniorhigh:   { public: 53,  private: 143 },  // 12-14歳
  highschool:   { public: 51,  private: 105 },  // 15-17歳
  university:   { national: 82, public: 93, private_lib: 115, private_sci: 154, none: 0 },
};

const PHASE_AGES = {
  nursery:      [0, 1, 2],
  kindergarten: [3, 4, 5],
  elementary:   [6, 7, 8, 9, 10, 11],
  juniorhigh:   [12, 13, 14],
  highschool:   [15, 16, 17],
  university:   [18, 19, 20, 21],
};

// 指定年のライフイベント費用（万円/年）を計算
function calcLECostByYear(year, opts = {}) {
  const { noChild = false, noLoan = false, noCare = false, noScholarship = false } = opts;
  const costs = { childcare: 0, education: 0, mortgage: 0, care: 0, scholarship: 0 };
  const le = state.lifeEvents;

  if (!noChild) {
    // [Phase 4b 03-I10] 同一 birthYear の子は双子として 1 組に集約（育休減収の 2 重計上防止）
    // 教育費・保育費は count 倍で集約（双子は 2 倍）、育休減収は 1 回分のみ（双子でも 1 組の育児）
    const childrenGrouped = (le.children || []).reduce((acc, c) => {
      const existing = acc.find(g => g.birthYear === c.birthYear);
      if (existing) {
        existing.count += 1;
      } else {
        acc.push({ ...c, count: 1 });
      }
      return acc;
    }, []);

    // [Phase 4b 03-I06] 保育料所得連動（最小実装・3 段階）
    // 公立保育園の所得別目安（都市部ベース）。出典: 江東区・川崎市の保育料早見表。
    // 年収 = 月収 × 12 + ボーナス の簡易換算（万円）
    const monthlyIncomeForNursery = parseFloat(state.finance?.income) || 0;
    const bonusForNursery = parseFloat(state.finance?.bonus) || 0;
    const annualIncomeForNursery = monthlyIncomeForNursery * 12 + bonusForNursery;
    const publicNurseryCostPerYear = annualIncomeForNursery >= 800 ? 54   // 高所得：月 4.5 万円相当
                                   : annualIncomeForNursery >= 500 ? 30   // 中所得：月 2.5 万円相当
                                   : 20;                                  // 低所得：月 1.7 万円相当

    childrenGrouped.forEach(c => {
      const age = year - c.birthYear;
      if (age < 0) return;

      // 育休収入減（親ごとに計算）
      const calcLeaveReduction = (person, offsetMonths) => {
        const leaveMonths = person.leaveMonths || 0;
        if (!leaveMonths) return 0;
        // 育休は出産月（誕生年）から offsetMonths ヶ月後に開始
        const startMonthFromBirth = offsetMonths;
        const endMonthFromBirth   = startMonthFromBirth + leaveMonths;
        // この年（age年目）に何ヶ月育休が重なるか
        const yearStart = age * 12;
        const yearEnd   = yearStart + 12;
        const overlapStart = Math.max(yearStart, startMonthFromBirth);
        const overlapEnd   = Math.min(yearEnd,   endMonthFromBirth);
        const overlapMonths = Math.max(0, overlapEnd - overlapStart);
        if (!overlapMonths) return 0;
        // 収入源：個別設定があればそれ、なければ世帯月収
        const monthlyIncome = person.income != null
          ? person.income
          : (state.finance.income || 0);
        // [Phase 4b 03-I07] 育休給付の期間分岐（雇用保険法）
        // 180 日（6 ヶ月）まで：月収の 67%、181 日（7 ヶ月目）以降：50%
        // 重なり区間 [overlapStart, overlapEnd) が育休開始（startMonthFromBirth）からどの位置かで按分。
        // 前半レートは `incomeRate`（指定時）、後半は 50% 固定。
        const firstHalfRate  = (person.incomeRate ?? 67) / 100;
        const secondHalfRate = 0.50;
        const firstHalfEnd = startMonthFromBirth + 6; // 前半 6 ヶ月の境界
        const firstHalfMonths  = Math.max(0, Math.min(overlapEnd, firstHalfEnd) - overlapStart);
        const secondHalfMonths = Math.max(0, overlapEnd - Math.max(overlapStart, firstHalfEnd));
        return monthlyIncome * (
          firstHalfMonths  * (1 - firstHalfRate) +
          secondHalfMonths * (1 - secondHalfRate)
        );
      };

      const pl = c.parentalLeave;
      // 当年に育休期間が重なるか（03-I09 用）
      let hasLeaveThisYear = false;
      if (pl) {
        // パートナー（産休・育休）
        const momOffset = pl.mom?.leaveStart === 'after_maternity' ? 2 : 0;
        const momReduction = calcLeaveReduction(pl.mom || {}, momOffset);
        costs.childcare += momReduction;
        // 本人（育休開始タイミングによりoffset）
        const dadOffset = pl.dad?.leaveStart === 'after'
          ? (pl.mom?.leaveMonths || 0) + (pl.mom?.leaveStart === 'after_maternity' ? 2 : 0)
          : 0;
        const dadReduction = calcLeaveReduction(pl.dad || {}, dadOffset);
        costs.childcare += dadReduction;
        if (momReduction > 0 || dadReduction > 0) hasLeaveThisYear = true;
      } else {
        // 旧データ互換
        // [Phase 4b 03-I02] 旧互換 maternityMonths パスで賞与を除外（新形式は既にボーナス除外済み）
        // 月給 × 12 ヶ月相当を基準とし、ボーナスは含めない
        const maternityYears = (c.maternityMonths || 0) / 12;
        if (age < maternityYears) {
          const annualIncome = (state.finance.income || 0) * 12; // ボーナス除外
          costs.childcare += annualIncome * (1 - (c.maternityRate || 67) / 100);
          hasLeaveThisYear = true;
        }
      }

      // 教育費（03-I10: count 倍、03-I06: 公立 nursery は所得連動、03-I09: 育休中 nursery 排他）
      Object.entries(PHASE_AGES).forEach(([phase, ages]) => {
        if (!ages.includes(age)) return;
        const phaseKey = c.phases?.[phase] || 'public';
        let unitCost;
        if (phase === 'nursery' && phaseKey === 'public') {
          // [Phase 4b 03-I06] 公立保育園は所得連動値を使用
          unitCost = publicNurseryCostPerYear;
        } else {
          unitCost = EDU_COST[phase][phaseKey] || 0;
        }
        // [Phase 4b 03-I09] 出産年重複：育休期間中は nursery 費用を計上しない（排他ロジック）
        if (phase === 'nursery' && age === 0 && hasLeaveThisYear) {
          unitCost = 0;
        }
        costs.education += unitCost * (c.count || 1);
      });
    });
  }

  if (!noLoan) {
    if (le.housingType === 'rent') {
      const r = le.rent;
      if (r.monthly) {
        // startYear未設定の場合は現在年をデフォルトとして使用
        const s = r.startYear ? parseInt(r.startYear) : new Date().getFullYear();
        const e = r.endYear ? parseInt(r.endYear) : 9999;
        if (year >= s && year <= e) {
          const yrs = year - s;
          const riseRate = (parseFloat(r.riseRate) || 0) / 100;
          const monthly = (parseFloat(r.monthly) || 0) * Math.pow(1 + riseRate, yrs);
          const admin = parseFloat(r.admin) || 0;
          const renewal = (year - s) % 2 === 1 ? (parseFloat(r.renewal) || 0) : 0;
          costs.mortgage += Math.round((monthly + admin) * 12 + renewal);
        }
      }
    } else if (le.housingType === 'mortgage' || !le.housingType) {
      // housingType='none' の場合は住宅コストを一切計算しない
      const m = le.mortgage;
      if (m.amount && m.startYear && m.term) {
        const schedule = calcMortgageSchedule();
        // 繰上返済の合計を計算
        const prepayThisYear = (m.events || []).filter(ev =>
          ev.type === 'prepay' && parseInt(ev.year) === year
        );
        const prepayTotal = prepayThisYear.reduce((s, ev) => s + (parseFloat(ev.amount) || 0), 0);
        const scheduleEntry = schedule.get(year);
        const annualPayment = scheduleEntry ? Math.round(scheduleEntry.monthlyPayment * 12 * 10) / 10 : 0;
        if (prepayTotal > 0) {
          // 繰上返済がある年: 残高の50%以上を返済する場合は通常返済を加算しない（一括返済扱い）
          // principalStart = 繰上返済前の年初残高（calcMortgageSchedule では繰上後の値が入るため前年末を使う）
          const prevEntry = schedule.get(year - 1);
          const remaining = prevEntry ? prevEntry.principalEnd : (scheduleEntry ? scheduleEntry.principalStart : annualPayment * 10);
          if (prepayTotal >= remaining * 0.5) {
            costs.mortgage += prepayTotal; // 一括返済: 通常返済は含めない
          } else {
            costs.mortgage += annualPayment + prepayTotal; // 一部繰上: 両方加算
          }
        } else if (scheduleEntry) {
          costs.mortgage += annualPayment;
        }
      }
    }
  }

  if (!noCare) {
    const ca = le.care;
    if (ca.startYear && year >= parseInt(ca.startYear) && (!ca.endYear || year <= parseInt(ca.endYear))) {
      costs.care += (parseFloat(ca.monthlyFee) || 0) * 12;
    }
    // [Phase 4b 03-I01] 介護一時費用（平均 47.2 万円、生命保険文化センター 2024）
    // 介護開始年（care.startAge 到達年 または care.startYear 到達年）に一時費用を加算。
    // サンプルデータは care.startYear 形式のため両経路をサポート。
    if (ca) {
      const pBirth = state.profile?.birth;
      const profBirthYear = pBirth ? parseInt(String(pBirth).slice(0, 4)) : null;
      const ageAtYear = profBirthYear ? (year - profBirthYear) : null;
      const careStartAge  = ca.startAge != null ? parseInt(ca.startAge) : null;
      const careStartYear = ca.startYear != null ? parseInt(ca.startYear) : null;
      const matchByAge  = careStartAge != null && ageAtYear === careStartAge;
      const matchByYear = careStartYear != null && year === careStartYear;
      if (matchByAge || matchByYear) {
        const oneTimeFee = parseFloat(ca.oneTimeFee);
        costs.care += Number.isFinite(oneTimeFee) ? oneTimeFee : 47.2;
      }
    }
  }

  if (!noScholarship) {
    (le.scholarships || []).forEach(sc => {
      if (!sc.monthlyPayment || !sc.startYear) return;
      const sy = parseInt(sc.startYear);
      let ey = sc.endYear ? parseInt(sc.endYear) : (sy + Math.ceil((parseFloat(sc.borrowedAmount) || 0) / (parseFloat(sc.monthlyPayment) || 1) / 12) - 1);
      // [Phase 4b 03-I03] JASSO 第二種（1.641%）の利息補正（簡易実装：返済終了年を 1 年延長）
      // 厳密な元利均等計算は Phase 5 候補。`scType === 'jasso_2'` または `loanType === 'type2'` を対象。
      const isJasso2 = sc.scType === 'jasso_2' || sc.loanType === 'type2';
      if (isJasso2) {
        ey = ey + 1;
      }
      if (year >= sy && year <= ey) {
        costs.scholarship += (parseFloat(sc.monthlyPayment) || 0) * 12;
      }
    });
  }

  return costs;
}
