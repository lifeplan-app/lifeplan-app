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

  // ── NISA ──────────────────────────────────────────
  // 注意: 金融商品取引法上、特定の金融商品・証券会社の推奨は投資助言業に該当する。
  // 提案カルーセルでは中立的な情報誘導文言のみを使用し、商品名・社名は出さない。
  nisa: {
    label:  'NISA制度について詳しく見る',
    url:    'https://px.a8.net/svt/ejp?a8mat=4B1RXW+6V2XLM+3XCC+64C3M',
    pixel:  'https://www12.a8.net/0.gif?a8mat=4B1RXW+6V2XLM+3XCC+64C3M',
    status: 'active',
    asp:    'A8.net',
    note:   '中立表現。リンク先は外部サイト（A8経由）。表示文言で商品/社名は出さない',
  },

  // ── iDeCo ─────────────────────────────────────────
  ideco: {
    label:  'iDeCo制度について詳しく見る',
    url:    'https://px.a8.net/svt/ejp?a8mat=4B1RXW+6YNJ8A+3XCC+BXIYQ',
    pixel:  'https://www11.a8.net/0.gif?a8mat=4B1RXW+6YNJ8A+3XCC+BXIYQ',
    status: 'active',
    asp:    'A8.net',
    note:   '中立表現。リンク先は外部サイト（A8経由）。表示文言で商品/社名は出さない',
  },

};
