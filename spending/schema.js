/**
 * spending_v1 スキーマ定義
 *
 * localStorage キー: 'spending_v1'
 * 金額単位: 円（lifeplan_v1との連携時のみ万円に変換）
 *
 * lifeplan_v1との連携:
 *   円 → 万円: Math.round(yen / 10000 * 10) / 10
 */

// ── 4領域定義 ──────────────────────────────────────────────
export const DOMAINS = {
  monthly_fixed: {
    id: 'monthly_fixed',
    label: '毎月固定費',
    desc: '毎月発生・金額ほぼ一定',
    color: '#007AFF',
    bg: '#E3F0FF',
  },
  monthly_variable: {
    id: 'monthly_variable',
    label: '毎月変動費',
    desc: '毎月発生・金額変動あり',
    color: '#34C759',
    bg: '#E3F9E9',
  },
  irregular_fixed: {
    id: 'irregular_fixed',
    label: '不定期固定費',
    desc: '年1回など不定期・金額ほぼ一定',
    color: '#FF9500',
    bg: '#FFF3E0',
  },
  irregular_variable: {
    id: 'irregular_variable',
    label: '特別費',
    desc: '不定期・金額も変動',
    color: '#AF52DE',
    bg: '#F5E9FF',
  },
};

// ── デフォルトカテゴリ（10件） ───────────────────────────────
export const DEFAULT_CATEGORIES = [
  { id: 'housing',   name: '住宅',       emoji: '🏠', domain: 'monthly_fixed',    color: '#007AFF', budget: null, sortOrder: 0 },
  { id: 'telecom',   name: '通信費',     emoji: '📱', domain: 'monthly_fixed',    color: '#5856D6', budget: null, sortOrder: 1 },
  { id: 'insurance', name: '保険',       emoji: '🛡️', domain: 'monthly_fixed',    color: '#FF9500', budget: null, sortOrder: 2 },
  { id: 'subscr',    name: 'サブスク',   emoji: '▶️', domain: 'monthly_fixed',    color: '#FF2D55', budget: null, sortOrder: 3 },
  { id: 'food',      name: '食費',       emoji: '🍚', domain: 'monthly_variable', color: '#34C759', budget: null, sortOrder: 4 },
  { id: 'daily',     name: '日用品',     emoji: '🛒', domain: 'monthly_variable', color: '#30B0C7', budget: null, sortOrder: 5 },
  { id: 'transport', name: '交通費',     emoji: '🚃', domain: 'monthly_variable', color: '#5AC8FA', budget: null, sortOrder: 6 },
  { id: 'health',    name: '医療・健康', emoji: '💊', domain: 'monthly_variable', color: '#FF6B6B', budget: null, sortOrder: 7 },
  { id: 'annual',    name: '年間固定費', emoji: '📅', domain: 'irregular_fixed',  color: '#8E8E93', budget: null, sortOrder: 8 },
  { id: 'special',   name: '特別費',     emoji: '🎉', domain: 'irregular_variable', color: '#AF52DE', budget: null, sortOrder: 9 },
];

// ── Money Forward CSVデフォルトマッピング ────────────────────
// Money Forward ME のエクスポートCSV列順:
//   日付, 内容, 金額（円）, 入/出, カテゴリ, サブカテゴリ, 口座名, メモ, 振替, ID
export const MF_CSV_DEFAULT_MAP = {
  '住宅・家賃':     'housing',
  '住宅':           'housing',
  '電気代':         'annual',   // → 月次に計上するなら monthly_variable に変更
  '水道・光熱費':   'annual',
  'ガス代':         'annual',
  '携帯電話':       'telecom',
  '通信':           'telecom',
  'インターネット': 'telecom',
  '生命保険料':     'insurance',
  '医療保険料':     'insurance',
  '保険':           'insurance',
  '食費':           'food',
  '外食':           'food',
  '日用品':         'daily',
  '交通費':         'transport',
  '電車・バス':     'transport',
  '医療・薬':       'health',
  'フィットネス':   'health',
  '娯楽':           'special',
  '旅行':           'special',
  '衣服・美容':     'special',
  // 未マッピングのカテゴリは null → 初回インポート時にユーザーが手動マッピング
};

// ── 初期 state ───────────────────────────────────────────────
export function createInitialState() {
  return {
    _version: 'spending_v1',

    categories: DEFAULT_CATEGORIES.map(c => ({ ...c })),

    csvConfig: {
      source: 'moneyforward',
      categoryMap: { ...MF_CSV_DEFAULT_MAP },
      customColumns: { date: null, amount: null, description: null, category: null },
    },

    months: {},
    // 各月のデータ構造:
    // 'YYYY-MM': {
    //   income: number,                  // 収入（円）
    //   categoryTotals: {},              // { [categoryId]: number }（円）
    //   domainTotals: {                  // 4領域別合計（円）
    //     monthly_fixed: 0,
    //     monthly_variable: 0,
    //     irregular_fixed: 0,
    //     irregular_variable: 0,
    //   },
    //   totalExpense: number,            // 支出合計（円）
    //   entries: [] | null,              // 生データ（直近 settings.keepRawMonths ヶ月のみ）
    //   importedEntryIds: [],            // 重複インポート防止（全期間保持）
    //   importedAt: string,              // ISO 8601
    //   isManual: boolean,
    // }

    suggestions: [],
    // 各提案の構造:
    // {
    //   id: string,
    //   type: 'telecom' | 'insurance' | 'subscription' | 'utility' | 'housing',
    //   categoryId: string,
    //   triggerMonth: 'YYYY-MM',
    //   triggerValue: number,            // 契機になった金額（円）
    //   createdAt: string,
    //   dismissed: boolean,
    //   actionedAt: string | null,
    // }

    lifeplanSync: {
      syncedAt: null,
      monthlyExpense: null,            // 万円（lifeplan_v1.finance.expense に書き込む値）
      irregularSuggestions: [],
      // 各提案: { categoryId, name, amount（万円・年額）, intervalYears, approved }
      basedOnMonths: [],
      basedOnAvgMonths: 3,
    },

    settings: {
      defaultViewMonths: 6,
      keepRawMonths: 3,
      budgetMode: false,
      linkedToLifeplan: false,
    },
  };
}

// ── ユーティリティ ────────────────────────────────────────────

/** 円 → 万円変換（小数1桁） */
export const toManYen = (yen) => Math.round(yen / 10000 * 10) / 10;

/** 万円 → 円変換 */
export const toYen = (manYen) => Math.round(manYen * 10000);

/**
 * 月次合計を集計する
 * @param {Array} entries - その月の明細配列
 * @param {Array} categories - カテゴリマスタ
 * @returns {{ categoryTotals, domainTotals, totalExpense, income }}
 */
export function aggregateMonth(entries, categories) {
  const categoryTotals = {};
  const domainTotals = {
    monthly_fixed: 0,
    monthly_variable: 0,
    irregular_fixed: 0,
    irregular_variable: 0,
  };
  let totalExpense = 0;
  let income = 0;

  const catMap = Object.fromEntries(categories.map(c => [c.id, c]));

  for (const entry of entries) {
    if (entry.isIncome) {
      income += entry.amount;
      continue;
    }
    const cat = catMap[entry.categoryId];
    if (!cat) continue;

    categoryTotals[entry.categoryId] = (categoryTotals[entry.categoryId] || 0) + entry.amount;
    domainTotals[cat.domain] = (domainTotals[cat.domain] || 0) + entry.amount;
    totalExpense += entry.amount;
  }

  return { categoryTotals, domainTotals, totalExpense, income };
}

/**
 * 月次データのうち keepRawMonths より古い月の生データを削除する
 * @param {Object} months - spending_v1.months
 * @param {number} keepRawMonths
 */
export function pruneRawEntries(months, keepRawMonths = 3) {
  const sortedKeys = Object.keys(months).sort();
  const cutoffIdx = sortedKeys.length - keepRawMonths;

  for (let i = 0; i < cutoffIdx; i++) {
    const key = sortedKeys[i];
    if (months[key].entries !== null) {
      months[key].entries = null; // 明細テキストを削除
      // importedEntryIds は重複防止のため保持
    }
  }
}

/**
 * ライフプランへの連携値を計算する
 * @param {Object} months - spending_v1.months
 * @param {number} avgMonths - 何ヶ月平均を使うか
 * @returns {{ monthlyExpense: number, irregularAnnualTotal: number }}
 *   monthlyExpense: 万円（monthly_fixed + monthly_variable の月平均）
 *   irregularAnnualTotal: 万円（irregular_fixed + irregular_variable の年平均）
 */
export function calcLifeplanValues(months, avgMonths = 3) {
  const sortedKeys = Object.keys(months).sort().slice(-avgMonths);
  if (sortedKeys.length === 0) return { monthlyExpense: 0, irregularAnnualTotal: 0 };

  let monthlySum = 0;
  let irregularSum = 0;

  for (const key of sortedKeys) {
    const m = months[key];
    monthlySum += (m.domainTotals?.monthly_fixed || 0) + (m.domainTotals?.monthly_variable || 0);
    irregularSum += (m.domainTotals?.irregular_fixed || 0) + (m.domainTotals?.irregular_variable || 0);
  }

  const monthlyExpense = toManYen(monthlySum / sortedKeys.length);
  // 不定期費用: データ期間を1年に換算
  const irregularAnnualTotal = toManYen(irregularSum / sortedKeys.length * 12);

  return { monthlyExpense, irregularAnnualTotal, basedOnMonths: sortedKeys };
}

// ── 改善提案トリガー定義 ──────────────────────────────────────
export const SUGGESTION_TRIGGERS = [
  {
    id: 'telecom_high',
    type: 'telecom',
    categoryId: 'telecom',
    condition: (monthData) => (monthData.categoryTotals?.telecom || 0) > 8000,
    title: '通信費の見直しで節約できる可能性があります',
    detail: (v) => `通信費が月 ${v.toLocaleString()}円 です。格安SIMへの乗り換えで年間数万円節約できる場合があります。`,
  },
  {
    id: 'insurance_high',
    type: 'insurance',
    categoryId: 'insurance',
    // 収入の15%超
    condition: (monthData) => {
      const ratio = monthData.income > 0
        ? (monthData.categoryTotals?.insurance || 0) / monthData.income
        : 0;
      return ratio > 0.15;
    },
    title: '保険料が収入の15%を超えています',
    detail: (v) => `保険料が月 ${v.toLocaleString()}円 です。内容の見直しで適正化できる可能性があります。`,
  },
  {
    id: 'subscr_accumulate',
    type: 'subscription',
    categoryId: 'subscr',
    condition: (monthData) => (monthData.categoryTotals?.subscr || 0) > 5000,
    title: 'サブスク費用が積み上がっています',
    detail: (v) => `サブスク合計が月 ${v.toLocaleString()}円 です。不要なサービスがないか確認しましょう。`,
  },
];
