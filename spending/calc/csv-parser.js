// spending/calc/csv-parser.js
// CSV パーサ（Money Forward / Zaim）+ カテゴリマッピング
import { parseDate } from './utils.js';

export const MF_CATEGORY_MAP = {
  // ── 住宅 ──────────────────────────────────────────────────────
  '住宅': 'housing', '住宅・家賃': 'housing', '家賃・住宅ローン': 'housing',
  '住宅::家賃・住宅ローン': 'housing', '住宅::家賃・地代': 'housing',
  '住宅::地代・管理費': 'housing', '住宅::管理費・修繕積立金': 'housing',
  '住宅::引越し': 'special', '住宅::リフォーム・内装': 'special', '住宅::家具・家電': 'special',
  '住宅::その他住宅': 'housing',

  // ── 通信費 ────────────────────────────────────────────────────
  '通信費': 'telecom', '携帯電話': 'telecom', '通信': 'telecom',
  'インターネット': 'telecom', 'スマートフォン': 'telecom',
  '通信費::携帯電話': 'telecom', '通信費::インターネット': 'telecom',
  '通信費::放送・通信': 'telecom', '通信費::固定電話': 'telecom',
  '通信費::その他通信費': 'telecom',

  // ── 保険 ──────────────────────────────────────────────────────
  '保険': 'insurance', '生命保険料': 'insurance', '医療保険料': 'insurance', '損害保険': 'insurance',
  '保険::生命保険料': 'insurance', '保険::医療保険料': 'insurance',
  '保険::自動車保険料': 'insurance', '保険::火災保険料': 'insurance',
  '保険::学資保険料': 'insurance', '保険::その他保険料': 'insurance',

  // ── サブスク ──────────────────────────────────────────────────
  '動画・音楽・本': 'subscr', 'サブスク': 'subscr', 'サービス': 'subscr',
  'エンタメ': 'subscr', 'エンタメ::サブスク': 'subscr', 'エンタメ::動画': 'subscr',
  '趣味・娯楽::映画・音楽・ゲーム': 'subscr',
  'その他::月額会員費': 'subscr', 'その他::年額会員費': 'subscr',

  // ── 食費 ──────────────────────────────────────────────────────
  '食費': 'food', '外食': 'food', 'グルメ・レストラン': 'food', 'カフェ': 'food',
  '食費::食料品': 'food', '食費::外食': 'food', '食費::カフェ・喫茶店': 'food',
  '食費::宅配・出前': 'food', '食費::その他食費': 'food',
  '交際費::飲み会': 'food',

  // ── 日用品 ────────────────────────────────────────────────────
  '日用品': 'daily', '雑費': 'daily', '日用品・雑貨': 'daily',
  '日用品::消耗品': 'daily', '日用品::ドラッグストア': 'daily',
  '日用品::ホームセンター': 'daily', '日用品::その他日用品': 'daily',
  'その他::雑費': 'daily',

  // ── 交通費 ────────────────────────────────────────────────────
  '交通費': 'transport', '電車・バス': 'transport', 'ガソリン': 'transport',
  '交通費::電車・バス': 'transport', '交通費::タクシー': 'transport',
  '交通費::飛行機': 'transport', '交通費::ガソリン': 'transport',
  '交通費::駐車場・有料道路': 'transport', '交通費::自転車': 'transport',
  '交通費::その他交通費': 'transport',
  '自動車::ガソリン代': 'transport', '自動車::駐車場代': 'transport',
  '自動車::高速道路・有料道路': 'transport',

  // ── 医療・健康 ────────────────────────────────────────────────
  '医療・薬': 'health', '病院・薬': 'health', 'フィットネス': 'health', '医療': 'health',
  '健康・医療': 'health', '医療・健康': 'health',
  '健康・医療::医療費': 'health', '健康・医療::薬': 'health',
  '医療・健康::医療費': 'health', '医療・健康::薬': 'health', '医療・健康::病院': 'health',
  '健康・医療::フィットネス': 'health', '健康・医療::サプリメント': 'health',
  '健康・医療::ボディケア': 'health', '健康・医療::その他健康・医療': 'health',
  '趣味・娯楽::スポーツ': 'health',

  // ── 水道光熱費 ────────────────────────────────────────────────
  '水道・光熱費': 'utility', '電気代': 'utility', 'ガス代': 'utility',
  '水道代': 'utility', '光熱費': 'utility',
  '水道・光熱費::電気代': 'utility', '水道・光熱費::ガス代': 'utility',
  '水道・光熱費::水道代': 'utility', '水道・光熱費::その他水道・光熱費': 'utility',

  // ── 年間固定費 ────────────────────────────────────────────────
  '自動車税': 'annual', '車検': 'annual', '固定資産税': 'annual',
  '自動車::自動車税': 'annual', '自動車::車検・整備費': 'annual',
  '税・社会保障::固定資産税': 'annual',

  // ── 教育・教養（習い事・塾等）→ 特別費 ──────────────────────────
  '教育・教養': 'special', '塾': 'special', '習い事': 'special',
  '教育・教養::習い事': 'special', '教育・教養::学習塾': 'special',
  '教育・教養::学校納付金': 'special', '教育・教養::参考書・教材': 'special',
  '教育・教養::その他教育': 'special',

  // ── 特別費 ────────────────────────────────────────────────────
  '娯楽': 'special', '旅行': 'special', '趣味': 'special',
  '衣服・美容': 'special', '冠婚葬祭': 'special', '家具・家電': 'special', 'ギフト・お祝い': 'special',
  // 趣味・娯楽
  '趣味・娯楽': 'special',
  '趣味・娯楽::旅行': 'special', '趣味・娯楽::小物': 'special',
  '趣味・娯楽::書籍': 'special', '趣味・娯楽::ペット': 'special',
  '趣味・娯楽::その他趣味・娯楽': 'special',
  // 衣服・美容
  '衣服・美容::衣服・靴': 'special', '衣服・美容::コスメ・美容': 'special',
  '衣服・美容::美容院・理髪店': 'special', '衣服・美容::アクセサリー・時計': 'special',
  '衣服・美容::その他衣服・美容': 'special',
  // 交際費
  '交際費': 'special', '交際費::プレゼント代': 'special', '交際費::冠婚葬祭': 'special',
  '交際費::バンド': 'special', '交際費::その他交際費': 'special',
  // 教養・教育
  '教養・教育': 'special',
  '教養・教育::書籍・DVD': 'special', '教養・教育::習い事・スクール': 'special',
  '教養・教育::資格勉強': 'special', '教養・教育::塾・教材': 'special',
  '教養・教育::その他教養・教育': 'special',
  // 特別な支出
  '特別な支出': 'special',
  '特別な支出::家具・家電': 'special', '特別な支出::旅行': 'special',
  '特別な支出::ショッピングローン': 'special', '特別な支出::その他特別な支出': 'special',
  // 自動車（ローン等）
  '自動車': 'special',
  '自動車::自動車ローン': 'special', '自動車::その他自動車': 'special',
  // その他
  'その他::手数料・システム料': 'special',

  // ── 家族生活費（妻口座への振込など） ────────────────────────
  'その他::毎月の生活費振込': 'family', 'その他::生活費振込': 'family',
  '特別な支出::生活費振込': 'family', '特別な支出::立替精算': 'family',

  // ── 現金支出（ATM・PayPay・電子マネー等） ────────────────────
  '現金・カード::ATM引き出し': 'daily',
  '現金・カード::paypay': 'daily',      // PayPay未連携のためチャージ額を現金支出として計上
  '現金・カード::電子マネー': 'daily',  // Suica等（交通・コンビニ混在のため日用品扱い）
  '現金・カード::Amazonギフト': 'daily',
};

// スキップすべきMFカテゴリ（二重計上・振替・非支出）
// 大項目でスキップ（中項目問わず）
export const MF_SKIP_MAIN = new Set([
  '税・社会保障',   // 所得税・住民税など（手取り設定と二重）
]);
// 大項目::中項目でスキップ
export const MF_SKIP_KEYS = new Set([
  'その他::振込',
  '現金・カード::カード引き落とし',  // カード引き落とし（カード利用時に計上済み）
  '特別な支出::ふるさと納税',       // 楽天カード払いのためカード側で計上済み
  '未分類::未分類',                 // MFが分類できなかったもの
  'その他::事業経費',               // 家計外（事業用）
  'その他::せどり仕入れ',           // 家計外
  'その他::副業投資',               // 家計外
]);

// ── Zaim カテゴリマッピング ──────────────────────────────────
export const ZAIM_CATEGORY_MAP = {
  // 食費
  '食費': 'food', '食費::外食': 'food', '食費::食材': 'food',
  '食費::カフェ・喫茶店': 'food', '食費::デリバリー・テイクアウト': 'food',
  // 日用品
  '日用品': 'daily', '日用品::消耗品': 'daily', '日用品::ドラッグストア': 'daily',
  '日用品::ホームセンター': 'daily',
  // 交通
  '交通費': 'transport', '交通費::電車・バス': 'transport', '交通費::タクシー': 'transport',
  '交通費::ガソリン': 'transport', '交通費::駐車場': 'transport', '交通費::自転車': 'transport',
  '自動車': 'transport', '自動車::ガソリン代': 'transport', '自動車::駐車場代': 'transport',
  '自動車::車検・整備': 'annual', '自動車::税金': 'annual',
  // 住居
  '住居費': 'housing', '住居費::家賃': 'housing', '住居費::住宅ローン': 'housing',
  '住居費::管理費・共益費': 'housing', '住居費::修繕・リフォーム': 'special',
  // 通信
  '通信費': 'telecom', '通信費::携帯電話': 'telecom', '通信費::インターネット': 'telecom',
  '通信費::固定電話': 'telecom', '通信費::放送': 'subscr',
  // 光熱費
  '水道・光熱費': 'utility', '水道・光熱費::電気代': 'utility', '水道・光熱費::ガス代': 'utility',
  '水道・光熱費::水道代': 'utility',
  // 保険
  '保険': 'insurance', '保険::生命保険': 'insurance', '保険::医療保険': 'insurance',
  '保険::自動車保険': 'insurance', '保険::火災保険': 'insurance',
  // 医療・健康
  '医療・健康': 'health', '医療・健康::医療費': 'health', '医療・健康::薬': 'health',
  '医療・健康::フィットネス': 'health', '医療・健康::サプリ': 'health',
  // サブスク
  '月額サービス': 'subscr', '月額サービス::動画配信': 'subscr', '月額サービス::音楽配信': 'subscr',
  '月額サービス::電子書籍': 'subscr',
  // 娯楽・特別費
  '娯楽・趣味': 'special', '娯楽・趣味::旅行': 'special', '娯楽・趣味::映画・音楽': 'special',
  '娯楽・趣味::書籍・雑誌': 'special', '娯楽・趣味::ゲーム': 'special',
  '衣服・美容': 'special', '衣服・美容::衣服・靴': 'special', '衣服・美容::美容院': 'special',
  '衣服・美容::化粧品': 'special',
  '教育': 'special', '教育::授業料': 'special', '教育::教材・参考書': 'special',
  '交際費': 'special', '交際費::飲み会': 'food', '交際費::プレゼント': 'special',
  'その他': 'special',
};

// Zaim でスキップすべきカテゴリ（振替・投資・二重計上）
export const ZAIM_SKIP_CATS = new Set([
  '税・社会保険', '金融', '振替',
]);

export function parseCSVLine(line) {
  const result = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      result.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

export function findCol(headers, candidates) {
  for (const c of candidates) {
    const idx = headers.findIndex(h => h.includes(c));
    if (idx >= 0) return idx;
  }
  return -1;
}

// マッピングキー（大項目::中項目 または 大項目）で検索
// userMap: state.csvConfig.categoryMap 相当（呼び出し側が渡す）
export function mapCategoryByKey(userMap, key) {
  if (!key) return null;
  // 完全一致
  const exact = (userMap && userMap[key]) || MF_CATEGORY_MAP[key] || ZAIM_CATEGORY_MAP[key];
  if (exact) return exact;
  // 「大項目::中項目」の場合、大項目のみでフォールバック
  if (key.includes('::')) {
    const mainCat = key.split('::')[0];
    return (userMap && userMap[mainCat]) || MF_CATEGORY_MAP[mainCat] || ZAIM_CATEGORY_MAP[mainCat] || null;
  }
  return null;
}

// 大項目のみで検索（後方互換）
export function mapCategory(userMap, mfCat) {
  if (!mfCat) return null;
  return (userMap && userMap[mfCat]) || MF_CATEGORY_MAP[mfCat] || null;
}

export function parseMFCSV(text, userMap = {}) {
  // Remove BOM
  text = text.replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).filter(l => l.trim());

  // Find header row
  let headerIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    if (lines[i].includes('日付') && lines[i].includes('金額')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    throw new Error('対応していない形式です。マネーフォワードMEのCSVをお使いください。');
  }

  const headers = parseCSVLine(lines[headerIdx]);

  const idx = {
    calc:     findCol(headers, ['計算対象']),
    date:     findCol(headers, ['日付']),
    desc:     findCol(headers, ['内容']),
    amount:   findCol(headers, ['金額']),
    type:     findCol(headers, ['入/出', '入出', '収支']),
    mainCat:  findCol(headers, ['大項目', 'カテゴリ']),
    subCat:   findCol(headers, ['中項目', 'サブカテゴリ']),
    transfer: findCol(headers, ['振替']),
    id:       findCol(headers, ['ID']),
  };

  const entries = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 3) continue;

    // 計算対象外（0）をスキップ
    if (idx.calc >= 0 && cols[idx.calc]?.trim() === '0') continue;

    // 振替をスキップ（MF MEは "1"、他形式は "TRUE" に対応）
    if (idx.transfer >= 0) {
      const t = cols[idx.transfer]?.trim();
      if (t === '1' || t?.toUpperCase() === 'TRUE') continue;
    }

    const dateStr = idx.date >= 0 ? cols[idx.date]?.trim() : '';
    const rawAmount = idx.amount >= 0 ? cols[idx.amount]?.replace(/,/g, '').trim() : '';
    const amountNum = parseInt(rawAmount) || 0;
    if (!amountNum) continue;

    const date = parseDate(dateStr);
    if (!date) continue;

    const rawType = idx.type >= 0 ? cols[idx.type]?.trim() : '';
    // 収入/支出を明示的に判定。型不明時は金額の符号で判断（負=支出）
    let isIncome;
    if (rawType === '収入' || rawType === '入金') {
      isIncome = true;
    } else if (rawType === '支出' || rawType === '出金') {
      isIncome = false;
    } else {
      isIncome = amountNum > 0; // 型不明時: 正=収入、負=支出
    }
    const amount = Math.abs(amountNum);
    const mfCat    = idx.mainCat >= 0 ? cols[idx.mainCat]?.trim() : '';
    const mfSubCat = idx.subCat  >= 0 ? cols[idx.subCat]?.trim()  : '';
    const entryId  = idx.id      >= 0 ? cols[idx.id]?.trim()      : '';

    // マッピングキー: 中項目があれば "大項目::中項目"、なければ "大項目"
    const mfMappingKey = mfSubCat ? `${mfCat}::${mfSubCat}` : mfCat;

    // 二重計上・振替系カテゴリをスキップ（収入エントリは除外しない）
    if (!isIncome) {
      if (MF_SKIP_MAIN.has(mfCat)) continue;
      if (MF_SKIP_KEYS.has(mfMappingKey)) continue;
    }

    entries.push({
      // [Fix-B / SP-CSV-06] ID 列なし時は内容ベース ID で重複検知可能に
      id: entryId || `csv_mf_${date}_${amountNum}_${mfCat}_${mfSubCat}_${i}`,
      date,
      amount,
      isIncome,
      description:  idx.desc >= 0 ? cols[idx.desc]?.trim() : '',
      mfCategory:   mfCat,
      mfSubCategory:mfSubCat,
      mfMappingKey,
      categoryId:   null,
      source: 'csv',
    });
  }
  return entries;
}

// ── Zaim CSV パーサー ──────────────────────────────────────────
export function parseZaimCSV(text, userMap = {}) {
  text = text.replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).filter(l => l.trim());

  // ヘッダー行を探す（「日付」「方向」「カテゴリ」を含む行）
  let headerIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    if (lines[i].includes('日付') && lines[i].includes('方向') && lines[i].includes('カテゴリ')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    throw new Error('Zaim形式を認識できませんでした。');
  }

  const headers = parseCSVLine(lines[headerIdx]);
  const idx = {
    date:     findCol(headers, ['日付']),
    dir:      findCol(headers, ['方向']),
    cat:      findCol(headers, ['カテゴリ']),
    item:     findCol(headers, ['品目']),
    amount:   findCol(headers, ['金額']),
    currency: findCol(headers, ['通貨']),
    transfer: findCol(headers, ['振替']),
    id:       findCol(headers, ['ID']),
  };

  const entries = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 3) continue;

    // 振替スキップ
    if (idx.transfer >= 0) {
      const t = cols[idx.transfer]?.trim();
      if (t === '1' || t?.toUpperCase() === 'TRUE') continue;
    }

    const cat = idx.cat >= 0 ? cols[idx.cat]?.trim() : '';
    const item = idx.item >= 0 ? cols[idx.item]?.trim() : '';

    // スキップカテゴリ
    if (ZAIM_SKIP_CATS.has(cat)) continue;

    const dir = idx.dir >= 0 ? cols[idx.dir]?.trim() : '';
    const isIncome = dir === '収入';

    const rawAmount = idx.amount >= 0 ? cols[idx.amount]?.replace(/,/g, '').trim() : '';
    const amountNum = parseInt(rawAmount) || 0;
    if (!amountNum) continue;

    const dateStr = idx.date >= 0 ? cols[idx.date]?.trim() : '';
    const date = parseDate(dateStr);
    if (!date) continue;

    const entryId = idx.id >= 0 ? cols[idx.id]?.trim() : '';

    // マッピングキー: "カテゴリ::品目" または "カテゴリ"
    const mfMappingKey = item ? `${cat}::${item}` : cat;

    entries.push({
      // [Fix-B / SP-CSV-06] ID 列なし時は内容ベース ID で重複検知可能に
      id: entryId || `csv_zaim_${date}_${amountNum}_${cat}_${item}_${i}`,
      date,
      amount: Math.abs(amountNum),
      isIncome,
      description: item || cat,
      mfCategory: cat,
      mfSubCategory: item,
      mfMappingKey,
      categoryId: null,
      source: 'csv',
    });
  }
  return entries;
}
