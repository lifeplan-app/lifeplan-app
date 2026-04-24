// calc/life-events.js
// Phase 3 Step 4: ライフイベント費用（教育費・保育・育休減収・介護・奨学金返済）
// 依存: calc/utils.js
//
// 定数は const のままでも問題なし（現時点ではテストから直接参照されていないため）。
// 将来テストで sb.EDU_COST を参照する必要が生じたら var に変更する。

// 教育費プリセット（万円/年, 文部科学省子供の学習費調査 令和3年度ベース）
const EDU_COST = {
  nursery:      { public: 20,  private: 45 },   // 0-2歳
  kindergarten: { public: 6,   private: 17 },   // 3-5歳（無償化後）
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
    le.children.forEach(c => {
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
        const rate = (person.incomeRate ?? 67) / 100;
        return monthlyIncome * overlapMonths * (1 - rate);
      };

      const pl = c.parentalLeave;
      if (pl) {
        // パートナー（産休・育休）
        const momOffset = pl.mom?.leaveStart === 'after_maternity' ? 2 : 0;
        costs.childcare += calcLeaveReduction(pl.mom || {}, momOffset);
        // 本人（育休開始タイミングによりoffset）
        const dadOffset = pl.dad?.leaveStart === 'after'
          ? (pl.mom?.leaveMonths || 0) + (pl.mom?.leaveStart === 'after_maternity' ? 2 : 0)
          : 0;
        costs.childcare += calcLeaveReduction(pl.dad || {}, dadOffset);
      } else {
        // 旧データ互換
        const maternityYears = (c.maternityMonths || 0) / 12;
        if (age < maternityYears) {
          const annualIncome = (state.finance.income || 0) * 12 + (state.finance.bonus || 0);
          costs.childcare += annualIncome * (1 - (c.maternityRate || 67) / 100);
        }
      }

      // 教育費
      Object.entries(PHASE_AGES).forEach(([phase, ages]) => {
        if (ages.includes(age)) {
          costs.education += EDU_COST[phase][c.phases?.[phase] || 'public'] || 0;
        }
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
  }

  if (!noScholarship) {
    (le.scholarships || []).forEach(sc => {
      if (!sc.monthlyPayment || !sc.startYear) return;
      const sy = parseInt(sc.startYear);
      const ey = sc.endYear ? parseInt(sc.endYear) : (sy + Math.ceil((parseFloat(sc.borrowedAmount) || 0) / (parseFloat(sc.monthlyPayment) || 1) / 12) - 1);
      if (year >= sy && year <= ey) {
        costs.scholarship += (parseFloat(sc.monthlyPayment) || 0) * 12;
      }
    });
  }

  return costs;
}
