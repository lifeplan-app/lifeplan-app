// calc/utils.js
// Phase 3 Step 1: 年齢補助ユーティリティ（index.html から抽出）
// 依存: なし
// このファイルはブラウザでは <script src> で読み込まれ、関数はグローバルに登録される。
// Node テスト環境では test/helpers/load-calc.js 経由で sandbox にロードされる。

function calcAge() {
  const b = state.profile.birth;
  if (!b) return null;
  const birth = new Date(b);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() ||
      (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age--;
  return age;
}

// 指定年におけるユーザーの年齢（birth未設定なら null）
function calcAgeAtYear(yr) {
  const b = state.profile.birth;
  if (!b) return null;
  const birthYear = new Date(b).getFullYear();
  return yr - birthYear;
}

// 指定年におけるパートナーの年齢（partnerbirth未設定なら null）
function calcPartnerAgeAtYear(yr) {
  const b = state.profile.partnerbirth;
  if (!b) return null;
  const birthYear = new Date(b).getFullYear();
  return yr - birthYear;
}

// ===== CASH FLOW EVENT HELPERS =====
// 年齢 → 西暦年（calcAge()がnullなら現在年から推算）
function ageToYear(age) {
  const ca = calcAge();
  const currentYear = new Date().getFullYear();
  if (!ca) return currentYear + Math.max(0, age - 30);
  return currentYear + (age - ca);
}

// [Phase 5b R4] インポート JSON の sanitize（__proto__ / constructor / prototype 再帰除去）
// index.html 側の _applyImportedData からも参照可能。テスト用にも public。
function sanitizeImported(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeImported);
  const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
  const clean = {};
  for (const key of Object.keys(obj)) {
    if (DANGEROUS_KEYS.has(key)) continue;
    clean[key] = sanitizeImported(obj[key]);
  }
  return clean;
}
