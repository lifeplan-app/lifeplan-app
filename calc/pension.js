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

// 2024年度水準: 国民年金満額 816,000円/年 = 68,000円/月 = 6.8万円/月
// 出典: 厚生労働省「令和6年度の年金額改定について」 https://www.mhlw.go.jp/stf/newpage_38201.html
const KOKUMIN_FULL_MONTHLY = 6.8; // 万円/月（2024年度）
const KOKUMIN_FULL_MONTHS = 480;  // 40年×12

// 年金計算コア
function _calcPensionCore(employType, koseiYears, avgIncome, kokuminYears) {
  const kokuminMonths = Math.min(kokuminYears * 12, 480);
  const kokuminMonthly = Math.round(KOKUMIN_FULL_MONTHLY * (kokuminMonths / KOKUMIN_FULL_MONTHS) * 10) / 10;
  let koseiMonthly = 0;
  if (employType === 'employee' && koseiYears > 0 && avgIncome > 0) {
    const hyojunGekkyu = Math.min(avgIncome / 12, 65);
    const annualKosei = hyojunGekkyu * (5.481 / 1000) * (koseiYears * 12);
    koseiMonthly = Math.round(annualKosei / 12 * 10) / 10;
  }
  const grossTotal = Math.round((kokuminMonthly + koseiMonthly) * 10) / 10;
  const netTotal = Math.round(grossTotal * 0.87 * 10) / 10;
  return { kokuminMonthly, koseiMonthly, grossTotal, netTotal, kokuminMonths };
}
