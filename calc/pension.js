// calc/pension.js
// Phase 3.5: 公的年金コア計算（index.html から抽出）
// 依存: なし（完全な純粋関数）
//
// ブラウザ: <script src="calc/pension.js"></script> で定数・関数がクラシックスクリプトのグローバルスコープに登録される
// Node テスト: test/helpers/load-calc.js 経由で sandbox にロード（現時点ではテストから直接呼ばない）
//
// 呼び出し元（index.html に残置）:
// - calcPensionEstimate(who)      — DOM 入力を読んでこの関数を呼び出し、結果を DOM に描画
// - calcSimplePensionEstimate()   — 簡易モード用 UI wrapper

// [Phase 4a 04-I04] 2026年度水準: 国民年金満額 847,200円/年 = 70,600円/月 = 7.06万円/月
// 出典: 厚生労働省「令和8年度の年金額改定について」
const KOKUMIN_FULL_MONTHLY = 7.06; // 万円/月（2026年度）
const KOKUMIN_FULL_MONTHS = 480;  // 40年×12

// 年金計算コア
// [Phase 4a 04-I01/I03] birthYear を第5引数に追加（optional、未指定なら 2003 分割計算を行わない）
function _calcPensionCore(employType, koseiYears, avgIncome, kokuminYears, birthYear) {
  const kokuminMonths = Math.min(kokuminYears * 12, 480);
  const kokuminMonthly = Math.round(KOKUMIN_FULL_MONTHLY * (kokuminMonths / KOKUMIN_FULL_MONTHS) * 10) / 10;
  let koseiMonthly = 0;
  if (employType === 'employee' && koseiYears > 0 && avgIncome > 0) {
    const hyojunGekkyu = Math.min(avgIncome / 12, 65);
    const totalMonths = koseiYears * 12;
    // [Phase 4a 04-I01] 2003 年 3 月以前の加入月数を 7.125/1000、以降を 5.481/1000 で分割計算
    // 入社 22 歳想定で 2003-03 時点の加入月数を年単位で近似
    let oldMonths = 0;
    if (birthYear) {
      const employmentStartYear = birthYear + 22;
      if (employmentStartYear < 2003) {
        // 2003 年 3 月までの月数
        oldMonths = Math.max(0, Math.min((2003 - employmentStartYear) * 12 + 3, totalMonths));
      }
    }
    const newMonths = totalMonths - oldMonths;
    const annualOld = hyojunGekkyu * (7.125 / 1000) * oldMonths;
    const annualNew = hyojunGekkyu * (5.481 / 1000) * newMonths;
    koseiMonthly = Math.round((annualOld + annualNew) / 12 * 10) / 10;
  }
  const grossTotal = Math.round((kokuminMonthly + koseiMonthly) * 10) / 10;
  // [Phase 4a 04-I03] 手取率を年金額階層別に
  // 年間年金額（万円）に応じて階層適用
  const annualGross = grossTotal * 12;
  const netRatio = annualGross <= 150 ? 0.95
                 : annualGross <= 300 ? 0.90
                 : annualGross <= 500 ? 0.85
                 : 0.82;
  const netTotal = Math.round(grossTotal * netRatio * 10) / 10;
  return { kokuminMonthly, koseiMonthly, grossTotal, netTotal, kokuminMonths };
}

// [Phase 4a 04-I02] 繰下げ・繰上げ率（60-75 歳）
// 繰上げ: 60-64 歳で月 -0.4%
// 繰下げ: 66-75 歳で月 +0.7%
// 出典: 日本年金機構
function adjustRate(pensionAge) {
  const BASE_AGE = 65;
  const months = (pensionAge - BASE_AGE) * 12;
  if (months < 0) return Math.max(0, 1 + months * 0.004);
  return 1 + months * 0.007;
}
