// calc/asset-growth.js
// Phase 3 Step 2: 資産成長・税率（index.html から抽出）
// 依存: calc/utils.js（同じファイルに定義される関数を参照する可能性があるため、
//       ブラウザでは utils.js より後にロードすること）
//
// ブラウザ: <script src="calc/asset-growth.js"></script> で関数・定数がグローバル登録される
// Node テスト: test/helpers/load-calc.js 経由で sandbox にロード

// ===== DATA =====
// 注: vm.runInContext（Node テスト）では const がサンドボックスに露出しないため、
// 他ファイルや beforeAll から参照する必要があるトップレベル定数は var で宣言する。
var ASSET_TYPES = {
  nisa_tsumitate:     { label: 'つみたてNISA / 新NISA積立枠', emoji: '🌱', color: '#10B981', bg: '#D1FAE5', defaultReturn: 5,   annualLimit: 120,  monthlyLimit: 10,  lifetimeLimit: 1800, note: '新NISA積立枠：年間120万円まで。成長枠と合わせた生涯非課税枠は1800万円。' },
  nisa_growth:        { label: '新NISA 成長投資枠',           emoji: '📈', color: '#3B82F6', bg: '#DBEAFE', defaultReturn: 6,   annualLimit: 240,  monthlyLimit: 20,  lifetimeLimit: 1200, note: '新NISA成長投資枠：年間240万円まで。成長枠の生涯上限は1200万円（積立枠と合算で生涯1800万円）。' },
  nisa_old_tsumitate: { label: '旧つみたてNISA',               emoji: '🌿', color: '#059669', bg: '#D1FAE5', defaultReturn: 5,   noNewContrib: true, endYearDefault: 2042, note: '旧つみたてNISA：2023年末で新規積み立て終了。最長2042年末まで非課税で保有・売却可能。2042年以降は自動で特定口座へ移管され、売却益に課税（約20%）が生じます。新規積み立ては不可です。' },
  nisa_old_general:   { label: '旧一般NISA',                   emoji: '📋', color: '#1D4ED8', bg: '#DBEAFE', defaultReturn: 5,   noNewContrib: true, endYearDefault: 2027, note: '旧一般NISA：2023年末で新規投資終了。2023年分は2027年末まで非課税で保有可能。2027年以降は自動で特定口座へ移管され、売却益に課税（約20%）が生じます。新規積み立ては不可です。' },
  ideco:          { label: 'iDeCo',                       emoji: '🏛️', color: '#8B5CF6', bg: '#EDE9FE', defaultReturn: 4,   monthlyLimit: 2.3, note: '会社員(企業年金なし)：月2.3万円。掛金全額所得控除。60歳まで原則引出不可。' },
  insurance:      { label: '積立保険',                    emoji: '🛡️', color: '#F59E0B', bg: '#FEF3C7', defaultReturn: 1.5, note: '積立型保険。解約返戻金が積立額を上回るまで時間がかかる場合あり。' },
  trust_allworld: { label: '投資信託（全世界・オルカン）', emoji: '🌍', color: '#06B6D4', bg: '#CFFAFE', defaultReturn: 7,   note: 'eMAXIS Slim 全世界株式(オルカン)など。過去実績ベースの期待リターン。' },
  trust_sp500:    { label: '投資信託（S&P500）',           emoji: '🇺🇸', color: '#4F46E5', bg: '#EEF2FF', defaultReturn: 8,   note: 'eMAXIS Slim 米国株式(S&P500)など。過去平均年率約10%（円建て変動あり）。' },
  trust_other:    { label: '投資信託（その他）',           emoji: '📊', color: '#64748B', bg: '#F1F5F9', defaultReturn: 5,   note: 'バランスファンド・債券ファンドなど。' },
  japan_stock:    { label: '日本株',                      emoji: '🗾', color: '#EF4444', bg: '#FEE2E2', defaultReturn: 4,   note: '個別銘柄・日経平均連動など。為替リスクなし。' },
  high_dividend:  { label: '高配当株',                    emoji: '💴', color: '#F97316', bg: '#FFEDD5', defaultReturn: 4,   dividendYield: 3.5, note: '配当利回り3〜5%程度。キャピタルゲイン+インカムゲインで運用。' },
  etf:            { label: 'ETF',                         emoji: '📉', color: '#0EA5E9', bg: '#E0F2FE', defaultReturn: 6,   note: 'VTI・VYM・SPYDなど。リアルタイム売買可能な投資信託。' },
  cash_emergency: { label: '生活防衛資金',                 emoji: '🛟', color: '#0EA5E9', bg: '#E0F2FE', defaultReturn: 0.1, note: '生活費の3〜6ヶ月分が目安。手元流動性を確保するための資金。投資に回さない。' },
  cash_special:   { label: '特別費',                       emoji: '🗓️', color: '#8B5CF6', bg: '#EDE9FE', defaultReturn: 0.1, note: '年に数回発生する非定期支出（車検・保険・旅行・冠婚葬祭など）のための積立。' },
  cash_reserved:  { label: '用途が決まっている資金（中長期）', emoji: '🏷️', color: '#F59E0B', bg: '#FEF3C7', defaultReturn: 0.3, note: 'マイホーム頭金・リフォーム・教育費など、使い道と時期が決まっている目的別資金。' },
  cash_surplus:   { label: '余剰資金',                     emoji: '💹', color: '#10B981', bg: '#D1FAE5', defaultReturn: 0.1, note: '用途未定の余裕資金。投資に回すか別口座で管理する候補。' },
  cash:           { label: '現金・預金（その他）',          emoji: '💵', color: '#6B7280', bg: '#F3F4F6', defaultReturn: 0.1, note: '普通預金・定期預金など。' },
  other:          { label: 'その他',                      emoji: '✨', color: '#84CC16', bg: '#ECFCCB', defaultReturn: 3,   note: '不動産・債券・仮想通貨など。' },
};

// 口座種別の自動判定（アセットタイプから推定）
var TAX_TYPE_DEFAULT = {
  nisa_tsumitate: 'nisa', nisa_growth: 'nisa', nisa_old_tsumitate: 'nisa', nisa_old_general: 'nisa', ideco: 'ideco',
  insurance: 'tokutei', trust_allworld: 'tokutei', trust_sp500: 'tokutei',
  trust_other: 'tokutei', japan_stock: 'tokutei', high_dividend: 'tokutei',
  etf: 'tokutei', cash_emergency: 'cash', cash_special: 'cash',
  cash_reserved: 'cash', cash_surplus: 'cash', cash: 'cash', other: 'tokutei',
};
var TAX_RATE = 0.20315; // 譲渡益・配当課税（特定口座・一般口座）: 所得税15.315%（復興特別所得税含む）+ 住民税5% 出典: 租税特別措置法第37条の11

function effectiveReturn(annualReturn, taxType) {
  if (taxType === 'nisa' || taxType === 'ideco' || taxType === 'cash') return annualReturn;
  // [Phase 4b 01-I01] 課税口座の毎年課税は簡易近似。
  // 完全な売却時一括課税（税引前複利運用 + 売却時にキャピタルゲイン課税）の実装は Phase 5 予定。
  // 現状: 複利ごとに TAX_RATE を適用（税引前複利に対して過少評価側＝保守的）
  // 特定口座・一般口座は年次複利で課税を近似（毎年利益に課税）
  return annualReturn * (1 - TAX_RATE);
}

// [Phase 4a 07-I01] 譲渡益・配当に対する実効税率
// taxType: 'nisa' | 'ideco' | 'tokutei' | 'cash'
// 戻り値: 税額（万円）。非課税区分は 0
function calcCapitalGainsTax(amount, taxType) {
  if (taxType === 'nisa' || taxType === 'ideco' || taxType === 'cash') return 0;
  return amount * TAX_RATE; // TAX_RATE = 0.20315
}

// calcAssetGrowth: returns { values: [], overflows: [] }
// overflows[y] = 目標達成・NISA上限等で積立できなかった余剰額（年間・万円）
// extraContribs: 他アセットから振替された追加積立（[y]=万円）
function calcAssetGrowth(a, years, extraContribs = [], _currentYear = new Date().getFullYear()) {
  const currentYear = _currentYear;
  const taxType = a.taxType || TAX_TYPE_DEFAULT[a.type] || 'tokutei';
  const nominalRate = (a.annualReturn || 0) / 100;

  // 配当受取モード：資産成長は値上がり分のみ
  const dividendMode = a.dividendMode || 'reinvest';
  const dividendRate = (dividendMode === 'cashout' && a.dividendYield) ? (a.dividendYield / 100) : 0;
  const growthRate   = Math.max(0, nominalRate - dividendRate);

  // NISA上限管理
  const t = ASSET_TYPES[a.type];
  const annualLimit   = t?.annualLimit   || null;
  const lifetimeLimit = t?.lifetimeLimit || null;
  let cumulativeBasis = a.nisaBasis || 0;

  // 目標金額（達成後に積立停止→余剰をoverflowsへ）
  const targetVal  = a.targetVal  || 0;
  // 第2目標金額（targetVal達成後に振替先が満枠になって戻ってきた分をさらに積み上げる上限）
  const targetVal2 = a.targetVal2 || 0;

  // 旧NISA判定：endYear後に特定口座へ自動移管
  const isOldNisa = !!(t?.noNewContrib && a.endYear);

  const values    = [];
  const overflows  = []; // 第1目標超過 or 通常余剰 → overflowTargetId へ
  const overflows2 = []; // 第2目標超過余剰 → overflowTargetId2 へ

  for (let y = 0; y <= years; y++) {
    const yr = currentYear + y;
    const isActive = (!a.startYear || yr >= a.startYear) && (!a.endYear || yr <= a.endYear);
    let annualContrib = isActive ? (a.monthly || 0) * 12 + (a.annualBonus || 0) : 0;
    // [Phase 4b 01-I02] 旧 NISA は期間終了後は新規積立不可（非 UI 経路の JSON import / サンプル等のフォールバック二重防御）
    // UI の save 経路は既に Phase 2 監査で monthly=0, annualBonus=0 強制済みだが、
    // 非 UI 経路（JSON import / 旧データ）でも endYear 超過後の monthly > 0 を無視する。
    if (t?.noNewContrib && a.endYear && yr > a.endYear) {
      annualContrib = 0;
    }
    let overflow  = 0;
    let overflow2 = 0;

    if (y > 0) {
      const prev = values[y - 1];

      // 旧NISA: endYear以内はNISA非課税、endYear超過後は特定口座（課税）として運用継続
      // 2042/2027年まで非課税 → 以降は自動で特定口座へ移管・課税対象
      const activeTaxType = (isOldNisa && yr > a.endYear) ? 'tokutei' : taxType;
      const rate = effectiveReturn(growthRate, activeTaxType);

      // ④ 振替元からの追加積立を先に取得（目標チェックと合算するため）
      const extraThisYear = extraContribs[y] || 0;

      // ① 目標金額チェック：前年末時点で目標達成済みなら積立停止
      if (targetVal > 0 && prev >= targetVal) {
        if (targetVal2 > 0 && prev < targetVal2) {
          // 第2目標フェーズ：自己積立はoverflowTargetIdへ流す、振替受け取りのみ積み上げ
          overflow = annualContrib; // 自分の積立は第1振替先に流す
          annualContrib = extraThisYear; // 振替で戻ってきた分だけ受け取る
        } else {
          // 第1目標達成 かつ 第2目標なし or 第2目標も達成済み
          overflow2 = targetVal2 > 0 ? annualContrib + extraThisYear : 0;
          overflow  = targetVal2 > 0 ? 0 : annualContrib + extraThisYear;
          annualContrib = 0;
        }
      } else {
        // ② NISA年間上限キャップ
        if (annualContrib > 0 && annualLimit) {
          annualContrib = Math.min(annualContrib, annualLimit);
        }

        // ③ NISA生涯上限キャップ
        if (annualContrib > 0 && lifetimeLimit) {
          const remaining = Math.max(0, lifetimeLimit - cumulativeBasis);
          const capped = Math.min(annualContrib, remaining);
          if (!targetVal) overflow += annualContrib - capped; // NISA上限余剰は振替なし
          annualContrib = capped;
          cumulativeBasis += annualContrib;
        }

        // 振替元からの追加を反映
        annualContrib += extraThisYear;
      }

      const grown = rate === 0
        ? prev + annualContrib
        : prev * (1 + rate) + annualContrib;

      // ⑤ 目標達成後の成長チェック（目標達成の年）
      let finalVal = Math.round(grown * 10) / 10;
      if (targetVal > 0 && prev < targetVal && finalVal > targetVal && overflow === 0) {
        // 今年第1目標を超えた→超過分をoverflowへ（簡易近似）
        overflow = Math.round((finalVal - targetVal) * 10) / 10;
        finalVal = targetVal;
      }
      // 第2目標達成チェック（第2目標フェーズで今年超えた場合）
      if (targetVal2 > 0 && prev >= targetVal && prev < targetVal2 && finalVal > targetVal2 && overflow2 === 0) {
        overflow2 = Math.round((finalVal - targetVal2) * 10) / 10;
        finalVal  = targetVal2;
      }

      // ⑥ 目標維持フェーズのハードキャップ
      // prev === targetVal の場合のみ発動（初期残高が目標超の場合は無効）
      // 利息超過分は消滅（overflow には加算しない）
      if (targetVal > 0 && prev >= targetVal) {
        if (targetVal2 > 0 && prev === targetVal2 && finalVal > targetVal2) {
          finalVal = targetVal2;
        } else if (targetVal2 === 0 && prev === targetVal && finalVal > targetVal) {
          finalVal = targetVal;
        }
      }

      values.push(finalVal);
      overflows.push(Math.round(overflow * 10) / 10);
      overflows2.push(Math.round(overflow2 * 10) / 10);
    } else {
      values.push(a.currentVal || 0);
      overflows.push(0);
      overflows2.push(0);
    }
  }
  return { values, overflows, overflows2 };
}

// 全アセットの成長データを2パスで計算（振替元→振替先の依存を解決）
// 新NISA（積立枠・成長枠）は合算1800万円プールで年ごとに制御
// 戻り値: [{ asset, data: values[], overflows: [] }, ...]
function calcAllAssetGrowth(assets, years) {
  years = Math.max(1, parseInt(years) || (state.finance?.simYears || 20));
  const currentYear = new Date().getFullYear();
  const NISA_NEW = ['nisa_tsumitate', 'nisa_growth'];
  const NISA_COMBINED_LIMIT = 1800;

  // 新NISAと非NISAに分離
  const nisaAssets  = assets.filter(a => NISA_NEW.includes(a.type));
  const otherAssets = assets.filter(a => !NISA_NEW.includes(a.type));

  // 非NISAアセット（後でトポロジカル順に計算するためここでは何もしない）
  // ※ otherPassは削除してトポロジカル計算に統合

  // 新NISAアセット：名義（owner）ごとに独立した合算プールで管理
  // 本人・パートナーそれぞれ1800万円の生涯非課税枠を持つ
  const NISA_OWNERS = ['self', 'partner'];
  const nisaPoolRemainingByOwner = {};
  NISA_OWNERS.forEach(own => {
    const ownerNisaAssets = nisaAssets.filter(a => (a.owner || 'self') === own);
    const basis0 = ownerNisaAssets.reduce((s, a) => s + (a.nisaBasis || 0), 0);
    nisaPoolRemainingByOwner[own] = Math.max(0, NISA_COMBINED_LIMIT - basis0);
  });

  const nisaStates = nisaAssets.map(a => {
    const t = ASSET_TYPES[a.type] || {};
    const divRate = (a.dividendMode === 'cashout' && a.dividendYield) ? a.dividendYield / 100 : 0;
    return {
      asset: a,
      owner: a.owner || 'self',
      values: [a.currentVal || 0],
      overflows: [0],
      growthRate: Math.max(0, (a.annualReturn || 0) / 100 - divRate),
      annualLimit: t.annualLimit || null,
      targetVal: a.targetVal || 0,
    };
  });

  for (let y = 1; y <= years; y++) {
    const yr = currentYear + y;

    // 各NISAアセットの「希望積立額」（プール・年間上限・目標・稼働期間 考慮前）
    const desired = nisaStates.map(s => {
      const a = s.asset;
      const isActive = (!a.startYear || yr >= a.startYear) && (!a.endYear || yr <= a.endYear);
      if (!isActive) return 0;
      if (s.targetVal > 0 && s.values[y - 1] >= s.targetVal) return 0; // 目標達成済み
      let c = (a.monthly || 0) * 12 + (a.annualBonus || 0);
      if (c > 0 && s.annualLimit) c = Math.min(c, s.annualLimit); // 年間上限
      return c;
    });

    // 名義ごとに合算プールで按分キャップ
    const actual = nisaStates.map((s, i) => {
      const d = desired[i];
      if (d <= 0) return 0;
      const own = s.owner;
      const poolLeft = nisaPoolRemainingByOwner[own] || 0;
      if (poolLeft <= 0) return 0;
      // 同名義の希望合計で按分
      const ownerTotal = nisaStates.reduce((sum, ss, ii) => sum + (ss.owner === own ? desired[ii] : 0), 0);
      return ownerTotal <= poolLeft ? d : (d / ownerTotal) * poolLeft;
    });

    // 名義ごとにプール残高を更新
    NISA_OWNERS.forEach(own => {
      const used = nisaStates.reduce((sum, s, i) => sum + (s.owner === own ? actual[i] : 0), 0);
      nisaPoolRemainingByOwner[own] = Math.max(0, nisaPoolRemainingByOwner[own] - used);
    });

    // 成長計算
    nisaStates.forEach((s, i) => {
      const prev = s.values[y - 1];
      const rate = effectiveReturn(s.growthRate, 'nisa');
      const contrib = actual[i];
      const overflow = Math.max(0, Math.round((desired[i] - contrib) * 10) / 10);
      let finalVal = Math.round((rate === 0 ? prev + contrib : prev * (1 + rate) + contrib) * 10) / 10;
      // 目標達成の年：超過分をoverflowへ
      if (s.targetVal > 0 && prev < s.targetVal && finalVal > s.targetVal) {
        s.overflows.push(Math.round((overflow + finalVal - s.targetVal) * 10) / 10);
        finalVal = s.targetVal;
      } else {
        s.overflows.push(overflow);
      }
      s.values.push(finalVal);
    });
  }

  const nisaPass = nisaStates.map(s => ({ asset: s.asset, data: s.values, overflows: s.overflows }));

  // ── チェーン振替対応：トポロジカルソートで①→②→③ を正確に計算 ──
  // NISAアセットの振替先をextraMapに事前反映
  const extraMap = {};
  nisaPass.forEach(g => {
    const tid = g.asset.nisaOverflowTargetId || g.asset.overflowTargetId;
    if (!tid || !g.overflows.some(v => v > 0)) return;
    if (!extraMap[tid]) extraMap[tid] = new Array(years + 1).fill(0);
    g.overflows.forEach((v, y) => { extraMap[tid][y] += v; });
  });

  // 非NISAアセットをトポロジカル順（振替元→振替先）で処理
  const otherIds = new Set(otherAssets.map(a => a.id));

  // in-degree: 非NISAアセット間の振替依存数（overflowTargetId2 も含む）
  const inDegree = {};
  otherAssets.forEach(a => { inDegree[a.id] = 0; });
  otherAssets.forEach(a => {
    if (a.overflowTargetId  && otherIds.has(a.overflowTargetId))  inDegree[a.overflowTargetId]++;
    if (a.overflowTargetId2 && otherIds.has(a.overflowTargetId2)) inDegree[a.overflowTargetId2]++;
  });

  const resultMap = {};
  // in-degree=0（誰からも振替を受けない）アセットからキューに投入
  const queue = otherAssets.filter(a => inDegree[a.id] === 0);

  while (queue.length > 0) {
    const a = queue.shift();
    const extra = extraMap[a.id] || [];
    const r = calcAssetGrowth(a, years, extra);
    resultMap[a.id] = { asset: a, data: r.values, overflows: r.overflows, overflows2: r.overflows2 };

    // 第1振替先（overflowTargetId）へ余剰を積み上げ
    const tid = a.overflowTargetId;
    if (tid) {
      if (r.overflows.some(v => v > 0)) {
        if (!extraMap[tid]) extraMap[tid] = new Array(years + 1).fill(0);
        r.overflows.forEach((v, y) => { extraMap[tid][y] += v; });
      }
      if (otherIds.has(tid)) {
        inDegree[tid]--;
        if (inDegree[tid] === 0) {
          const target = otherAssets.find(x => x.id === tid);
          if (target) queue.push(target);
        }
      }
    }

    // 第2振替先（overflowTargetId2）へ余剰を積み上げ
    const tid2 = a.overflowTargetId2;
    if (tid2 && r.overflows2 && r.overflows2.some(v => v > 0)) {
      if (!extraMap[tid2]) extraMap[tid2] = new Array(years + 1).fill(0);
      r.overflows2.forEach((v, y) => { extraMap[tid2][y] += v; });
      if (otherIds.has(tid2)) {
        inDegree[tid2]--;
        if (inDegree[tid2] === 0) {
          const target2 = otherAssets.find(x => x.id === tid2);
          if (target2) queue.push(target2);
        }
      }
    }
  }

  // サイクルや孤立（in-degreeが残ったアセット）を処理
  // [Phase 4b 01-I03] サイクル時のフォールバックでも overflow が静かに消失しないよう、
  // 振替先が未処理（サイクル内）で加算できない場合は後続の _wastedContribsByYear で計上する。
  const cycleAssets = [];
  otherAssets.forEach(a => {
    if (!resultMap[a.id]) {
      const extra = extraMap[a.id] || [];
      const r = calcAssetGrowth(a, years, extra);
      resultMap[a.id] = { asset: a, data: r.values, overflows: r.overflows, overflows2: r.overflows2 };
      cycleAssets.push(a.id);
    }
  });

  // ── 未投資積立の追跡（振替先未設定のオーバーフロー分） ──
  // getExpenseForYear は常に「計画通りの積立全額」を支出控除するが、
  // NISA生涯上限到達・目標達成などで実際に投資されなかった分は
  // いずれのアセットにも加算されないため総資産が過小評価される。
  // ここでその差分を記録し、calcIntegratedSim で cashFlow に加算して補正する。
  const wastedContribsByYear = new Array(years + 1).fill(0);

  // 新NISAアセット：振替先なし & overflow > 0 の年を記録
  nisaPass.forEach(g => {
    const tid = g.asset.nisaOverflowTargetId || g.asset.overflowTargetId;
    if (!tid) {
      g.overflows.forEach((v, idx) => { if (v > 0) wastedContribsByYear[idx] += v; });
    }
  });

  // 非NISAアセット（旧NISA上限 / 目標達成）：振替先なし & overflow > 0 の年を記録
  // [Phase 4b 01-I03] サイクル内アセット同士の振替は解決不可のため、
  // 振替先もサイクル内（cycleAssets）なら overflow を wasted に計上する。
  const cycleSet = new Set(cycleAssets);
  Object.values(resultMap).forEach(g => {
    const tid  = g.asset.overflowTargetId;
    const tid2 = g.asset.overflowTargetId2;
    // 第1振替先: 未設定 or サイクル内（解決不可）
    const tid1Wasted  = !tid  || (cycleSet.has(g.asset.id) && cycleSet.has(tid));
    const tid2Wasted  = !tid2 || (cycleSet.has(g.asset.id) && cycleSet.has(tid2));
    if (tid1Wasted) {
      g.overflows.forEach((v, idx) => { if (v > 0) wastedContribsByYear[idx] += v; });
    }
    if (tid2Wasted && g.overflows2) {
      g.overflows2.forEach((v, idx) => { if (v > 0) wastedContribsByYear[idx] += v; });
    }
  });

  // 元の登録順序に戻して結合
  const growthResult = assets.map(a =>
    nisaPass.find(r => r.asset === a) || resultMap[a.id]
  );
  growthResult._wastedContribsByYear = wastedContribsByYear;
  return growthResult;
}
