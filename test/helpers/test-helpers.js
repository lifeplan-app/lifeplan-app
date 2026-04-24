// test/helpers/test-helpers.js
// index.html に存在しないテスト専用ユーティリティ。
// Phase 3 Task 10 で helpers/core.js から移動（Phase 3 完了と同時に helpers/core.js は削除）。

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
