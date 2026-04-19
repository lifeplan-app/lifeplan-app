/**
 * =====================================================
 * アフィリエイトリンク設定ファイル
 * spending/affiliate-config.js
 * =====================================================
 *
 * 【更新手順】
 * 1. ASP審査が通過したら、対象エントリの url を実際のリンクに差し替える
 * 2. status を 'pending' → 'active' に変更する
 * 3. このファイルだけ変更・プッシュすれば本番に即反映される
 *
 * 【status の意味】
 *   'pending'  : 審査中またはリンク未取得。CTAボタンは非表示になる
 *   'active'   : 審査通過・リンク取得済み。CTAボタンが表示される
 *   'inactive' : 一時停止・削除したい場合に使用
 *
 * =====================================================
 */

// eslint-disable-next-line no-unused-vars
const AFFILIATE_LINKS = {

  // ── 通信費 ────────────────────────────────────────
  telecom: {
    label:  '格安SIMを比較する',
    url:    '#pending',          // ← 審査通過後にASPリンクを貼る
    status: 'pending',
    asp:    'A8.net',            // 登録済みASP
    note:   '楽天モバイル / IIJmio / mineo など。通信費 > 8,000円/月 でトリガー',
  },

  // ── 保険 ──────────────────────────────────────────
  insurance: {
    label:  '保険を無料相談する',
    url:    '#pending',
    status: 'pending',
    asp:    'A8.net',
    note:   '保険チャンネル / ほけんの窓口。保険料 > 収入の15% でトリガー',
  },

  // ── サブスク ──────────────────────────────────────
  subscr: {
    label:  'サブスク診断ツール',
    url:    '#pending',
    status: 'pending',
    asp:    null,                // 未登録
    note:   'ASP未登録。サブスク合計 > 10,000円/月 でトリガー',
  },

  // ── 食費 ──────────────────────────────────────────
  food: {
    label:  '食費節約のヒントを見る',
    url:    '#pending',
    status: 'pending',
    asp:    null,
    note:   'ASP未登録。食費 > 収入の25% でトリガー',
  },

  // ── NISA・資産運用 ────────────────────────────────
  nisa: {
    label:  'NISAで資産を増やす',
    url:    '#pending',
    status: 'pending',
    asp:    null,
    note:   'ASP未登録。将来的にlifeplanアプリの貯蓄不足トリガーと連携予定',
  },

};
