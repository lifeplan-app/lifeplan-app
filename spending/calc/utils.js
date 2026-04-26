// spending/calc/utils.js
// 金額・日付フォーマット・パースのユーティリティ

export function fmt(yen) {
  return '¥' + Math.round(yen).toLocaleString();
}

export function toManYen(yen) {
  return Math.round(yen / 10000 * 10) / 10;
}

export function fmtManYen(yen) {
  return toManYen(yen) + '万円';
}

export function parseDate(str) {
  if (!str) return null;
  const m = String(str).match(/(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (!m) return null;
  const year  = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day   = parseInt(m[3], 10);
  if (year < 1900 || year > 2100) return null;
  if (month < 1  || month > 12)   return null;
  if (day   < 1  || day   > 31)   return null;
  // Calendar validity check (rejects Feb 30, Apr 31, etc.)
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}
