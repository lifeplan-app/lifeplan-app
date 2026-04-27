# サイトデザインガイドライン

ライフプランアプリ + 支出管理アプリ エコシステム共通のビジュアル・実装規範。
LP v3「White Pearl Cosmos」で確立した方針をベースラインとする。

- 最終更新: 2026-04-21
- 準拠サイト: `https://lifeplan-app.net/`（WordPress ページID:17）
- 編集マスター: `/tmp/lp_v3_sysfonts.html`
- CSSプレフィックス: `.tp-`（Template Prefix、Cocoon既存クラスとの衝突回避）

---

## 1. デザインコンセプト

**White Pearl Cosmos** — 白パール基調の静謐さに、ネイビーの知性と金融テックの精密さを重ねる。
「長期・信頼・誠実」を視覚で伝え、"AIスロップ"的な紫グラデ白背景には絶対に寄せない。

- Tone: 上品・編集的・控えめに未来的
- Avoid: Inter / Roboto / generic purple gradients / overdesigned 3D / 紫背景
- Key differentiator: 明朝体 × 白パール × オーロラオーブ

---

## 2. カラーシステム

```css
:root {
  --bg:    #F8FBFF;  /* 白パール（ライト背景） */
  --ink:   #0A1628;  /* 主要テキスト */
  --ink2:  #1F2D45;
  --ink3:  #4A5875;
  --ink4:  #6B7A99;
  --navy:  #071323;  /* ダークセクション背景 */
  --blue:  #1B4FE8;  /* プライマリ */
  --teal:  #00C4A0;  /* セカンダリ */
  --teal2: #00E5BC;  /* ダーク背景上のアクセント */
  --gold:  #C9952A;  /* スパークアクセント（多用禁止） */
}
```

**使用ルール:**
- ライト背景: `--bg` に `--ink`～`--ink3` のテキスト階層
- ダーク背景: `--navy` に `#FFFFFF`（見出し）/ `rgba(232,238,248,0.92)`（本文）
- CTAグラデーション: `linear-gradient(135deg, #1B4FE8 0%, #00C4A0 100%)` 固定
- 紫（`#8B5CF6` 等）は使わない

---

## 3. フォント体系（単一sans-serif原則）

**2026-04-22 改訂**: SaaS/fintech プロダクト特性との整合を優先し、明朝混在を廃止。全要素を単一の sans-serif スタックに統一。同業（Money Forward / Zaim / freee）と整合。

| 用途 | フォント |
|---|---|
| 見出し・本文・ロゴ・ボタン・タグ・ナビ・その他すべて | `-apple-system, BlinkMacSystemFont, 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', sans-serif` |

フォント区別ではなく **font-weight（400〜800）とサイズ**で階層を表現する。旧 2026-04-21 版の明朝指定は全箇所で撤去済み（LP×2 / 子テーマCSS / 記事埋込CTA）。

**タグ/ラベル表現**: monospace の代わりに `letter-spacing:0.14-0.16em` + `text-transform:uppercase` + `font-weight:500` で「ラベル感」を表現する。

**外部フォントCDN（Google Fonts / Bunny Fonts 等）禁止**: ConoHa WAF が `fonts.googleapis.com` / `fonts.bunny.net` 等を 403 ブロックする。システムフォントスタックのみを使用。

---

## 4. タイポグラフィスケール

| 要素 | サイズ | weight |
|---|---|---|
| Hero title | `clamp(34px, 5.2vw, 70px)` | 800 |
| Hero sub | `clamp(14px, 1.5vw, 17px)` | 400 |
| Section title (`.tp-section-title`) | `clamp(23px, 2.9vw, 40px)` | 700 |
| Section lead | `15.5px` | 400 |
| Card title (h3) | `15-16px` | 700（ダーク背景では **800**） |
| Body / description | `12.5-14px` / `line-height:1.75-1.9` | 400 |
| Tag / kicker | `10-12px` / `letter-spacing:0.14-0.16em` / UPPERCASE | 500 |

**行間**: 日本語本文は `line-height:1.8-1.9` を標準とする（英語LPの 1.5 より広く）。

---

## 5. スペーシング & レイアウト

- コンテナ最大幅: **`max-width: 1120px`**（`.tp-inner`）
- セクション縦padding: `96-140px`（Hero/CTA）、`80-120px`（通常）
- カード padding: `28-36px`
- Border radius: `--r: 14px`（カード）、`50px`（ピル型CTA）

**構図原則:**
- 左右対称より、左寄せ＋非対称な余白でエディトリアル感を出す
- ドットグリッド背景 / オーロラオーブ / 微細ノイズ で atmosphere を作る
- グラフィック要素は「控えめ × 正確」。装飾過多は AI slop。

---

## 6. レスポンシブ ブレークポイント

| 幅 | 対応 |
|---|---|
| 〜640px | ナビリンク非表示（ロゴ+CTAのみ）、grid 1カラム、flowは縦 |
| 〜960px | ナビ圧縮（gap 16px / font 12.5px）、ロゴ 15.5px、2カラムgrid |
| 961px〜 | フル表示、tp-inner 1120px 中央寄せ |

---

## 7. ナビゲーション (`.tp-nav`)

- 高さ: `72px` 固定、`position: fixed; top: 0; z-index: 9999`
- 背景: `rgba(248,251,255,0.82)` + `backdrop-filter: blur(24px) saturate(1.8)`
- スクロール20px超で `.tp-nav-solid` クラス付与 → 背景 0.97 / box-shadow 付与
- デスクトップ: ロゴ17px / リンクgap 22px / margin-left 24px / CTA padding `10px 22px`
- モバイル(〜640px)ではハンバーガー実装せず、リンク群を `display:none`（CTAで誘導）

---

## 8. セクション種別とテキスト色

### ライトセクション（デフォルト）
- BG: `--bg` (#F8FBFF)
- 見出し: `--ink`、本文: `--ink2-3`

### ダークセクション（`.tp-security`, `.tp-cta-section`, `.tp-footer` 等）
- BG: `--navy` (#071323) or `#050D1A`
- 見出し: **`#FFFFFF`**（h3カードタイトルは font-weight:800 必須）
- 本文: **`rgba(232,238,248,0.92)`**（以前の 0.62 は不可。コントラスト不足）
- カード: `background: rgba(255,255,255,0.06)` / `border: 1px solid rgba(255,255,255,0.16)`

**重要**: ダーク背景上のh2/h3は **HTMLインラインstyle + JS setProperty 併用**（9章参照）。

---

## 9. WordPress / Cocoon 統合時の必須対処

LP を WordPress ページに流し込む場合、以下3層の干渉を避けられない。

### 9.1 Cocoon テーマの `!important` 上書き
- Cocoon は h2/h3 に `color: #1d1d1f !important; font-family: -apple-system,...` を適用
- CSS `<style>` 内の `!important` は WordPress kses が除去 → 効かない
- インラインstyle(`style="color:..."`)の `!important` は kses が **保持** → 効く

**対策パターン:**

```html
<!-- ダーク背景のh3には必ずインラインstyle（ベルト） -->
<h3 class="tp-sec-title"
    style="color:#FFFFFF !important;font-weight:800 !important;font-family:'Hiragino Mincho ProN','ヒラギノ明朝 ProN W3','Yu Mincho',serif !important">
  タイトル
</h3>
```

```javascript
// 追加で JavaScript setProperty フォールバック（サスペンダー）
document.querySelectorAll('.tp-security .tp-sec-title').forEach(h => {
  h.style.setProperty('color', '#FFFFFF', 'important');
  h.style.setProperty('font-weight', '800', 'important');
});
```

### 9.2 ConoHa WAF ブロック対応
- `/* ... */` 形式のCSSコメント → 403 Forbidden
  → 保存前に `raw.replace(/\/\*[\s\S]*?\*\//g, '')` で除去
- 外部フォントCDN（fonts.googleapis.com / fonts.bunny.net）→ 403
  → システムフォントスタックのみ使用

### 9.3 wpautop 対策
- `<style>` 内の改行を `</p><p>` に変換して CSS を破壊
  → `cssContent.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ')` で1行化

### 9.4 Cocoon 既存要素の非表示CSS（必須・1行化必須）
```css
.home .content-top,.home .wwa,.home .content-top-in{display:none!important}
.home #header-container,...{display:none!important}
.home #content-in,.home .content-in,.home #content{width:100%!important;max-width:100%!important;padding:0!important;margin:0!important}
.home .sidebar,.home #sidebar{display:none!important}
```
→ `width:100%!important` が全幅表示の鍵（欠くと右332px空白）。

### 9.5 保存パターン
```javascript
// wp-admin タブから実行（Gutenberg編集タブではsavePost()がハングするので必ず別タブ）
fetch('/wp-json/wp/v2/pages/17', {
  method: 'POST', credentials: 'include',
  headers: {'Content-Type':'application/json','X-WP-Nonce': window.wpApiSettings.nonce},
  body: JSON.stringify({content: content, status: 'publish'})
})
```

---

## 10. アニメーション

### スクロール in-view リビール（`.tp-rv` → `.tp-vs`）
```javascript
const io = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('tp-vs'); });
}, { threshold: 0.12 });
document.querySelectorAll('.tp-rv').forEach(el => io.observe(el));
```
```css
.tp-rv { opacity: 0; transform: translateY(18px); transition: opacity .8s, transform .8s; }
.tp-rv.tp-vs { opacity: 1; transform: translateY(0); }
```

### ホバー
- ボタン: `transform: translateY(-1px)` + box-shadow 強化、`transition: 0.22s`
- カード: 背景アルファ+枠線色をわずかに変化

**禁止**: 派手な回転・3Dカルーセル・過剰な視差。静謐さを保つ。

---

## 11. アフィリエイト / CTA ボタン

- 形状: pill (`border-radius: 50px`)、padding `18px 42px` (大) / `10px 22px` (小)
- 背景: `linear-gradient(135deg, #1B4FE8 0%, #00C4A0 100%)` 固定
- テキスト: `#fff !important; -webkit-text-fill-color: #fff !important`（Cocoonのa色対策）
- shadow: `0 8px 30px rgba(27,79,232,0.30), 0 2px 8px rgba(0,196,160,0.18)`
- 外部遷移は `target="_blank" rel="noopener"`

---

## 12. セキュリティ制約（両アプリ共通）

- localStorage のみでデータ完結（`lifeplan_v1` / `spending_v1`）
- ユーザーが入力した家計データ・個人情報は**外部送信しない**（CSPで遮断）
- 外部画像・外部JS・外部フォントは使わない（WAFとCSPで二重に拒否される）

### 12.1 CSP 例外（GA4のみ許可、2026-04-27）
集客効果計測のため、GA4 に限定して以下のドメインを許可している：
- `script-src`: `https://www.googletagmanager.com`
- `connect-src`: `https://www.google-analytics.com`, `https://*.analytics.google.com`, `https://*.google-analytics.com`, `https://www.googletagmanager.com`
- `img-src`: `https://www.google-analytics.com`, `https://www.googletagmanager.com`

送信するのは流入元・操作種別のみ（`anonymize_ip` 有効）。家計データの送信は実装上も意図上も行わない。実装は `analytics.js` を参照。

---

## 13. チェックリスト（新規セクション追加時）

- [ ] CSSクラスは `.tp-` プレフィックス付きか
- [ ] 見出しはヒラギノ明朝、本文はヒラギノ角ゴか
- [ ] ダーク背景の h2/h3 にインライン `style="color:#... !important"` を書いたか
- [ ] JavaScript setProperty フォールバックを追加したか
- [ ] `/* */` CSSコメントを含んでいないか
- [ ] 外部フォント・外部リソース参照を含んでいないか
- [ ] 本文のコントラスト比 ≥ 4.5:1（WCAG AA）か
- [ ] 〜960px / 〜640px で表示崩れしないか

---

## 14. ブログ（`/blog/`）インデックスページ

- WordPress ページID: **238**、slug: `blog`、URL: `https://lifeplan-app.net/blog/`
- 編集マスター: `/tmp/blog_index_v1.html`
- LP と同じ White Pearl Cosmos ナビ構成（独自ヘッダ／フッタ、Cocoon 要素は `.page` 前提で非表示化）
- 12記事を3カラムカードグリッドで表示。カテゴリフィルタ（`data-cat`属性でクライアント側切替）
- 960px で2カラム、640px で1カラム＋ナビリンク非表示

**新記事を公開したとき**: `/tmp/blog_index_v1.html` に `.tp-card` ブロックを追加 → CORS サーバー経由で `/wp-json/wp/v2/pages/238` を更新。または手動でカテゴリのidを同期する。

---

## 15. 個別ブログ記事（Posts）モダン化

全12記事（ID: 35,38,40,42,44,46,48,50,52,54,56,58）に **共通スタイルブロック**を content に埋め込んで統一。Cocoon のヘッダ／フッタ／サイドバーは残し、本文エリアのみ再デザインする方針。

### 15.1 ラッパー構造

各記事の content はセンチネル付きで以下の構造：

```html
<!-- TP-ARTICLE-WRAP-START -->
<style>/* .tp-article 配下のCSS */</style>
<div class="tp-article">

  [元のGutenbergコンテンツ]

</div>
<section class="tp-article-cta">...</section>
<div class="tp-article-back">...</div>
<script>/* JS setProperty フォールバック */</script>
<!-- TP-ARTICLE-WRAP-END -->
```

### 15.2 タイポグラフィ
- 本文幅: `max-width: 720px`、`line-height: 1.95`、`font-size: 15.5px`
- **h2**: 明朝・800・30px、上に4px幅のグラデーションライン、下に1px solid border（JS setPropertyで強制）
- **h3**: 明朝・700・21px、左に3px ティールボーダー（JS setPropertyで強制）
- Cocoon はh2/h3/border/paddingに `!important` を持つので **必ず JS フォールバックで setProperty('important')**

### 15.3 コンポーネント
- **ul/ol**: カスタムマーカー（ULはグラデドット、OLはデクリメント2桁番号）、`border-bottom: 1px dashed` で区切り
- **blockquote**: 左ティールボーダー + 微グラデ背景 + `"` クオートマーク
- **table**: ダークヘッダー（`#0A1628 → #1F2D45` グラデ白文字）、偶数行微ブルー背景
- **strong**: 金色のマーカー下線（`rgba(201,149,42,.22)`）
- **a (本文内)**: マーカー風下線、hover でティールに

### 15.4 フッターCTA（全記事共通）
- ダーク背景カード（`#071323 → #0A1B33`）
- 「読んだだけで終わらせず、あなたの数字で試算してみましょう」→ `/` へ
- 下に「← ブログ一覧に戻る」ボタン（`/blog/` へ）

### 15.5 一括更新スクリプト

`/tmp/article_preamble.html` と `/tmp/article_postamble.html` を更新 → wp-admin タブで以下を実行：

```javascript
// 全12記事を取得→既存ラッパーをstrip→新preamble/postambleで再wrap→save
const preamble = await (await fetch('http://127.0.0.1:8082/article_preamble.html')).text();
const postamble = await (await fetch('http://127.0.0.1:8082/article_postamble.html')).text();
const postIds = [58,56,54,52,50,48,46,44,42,40,38,35];
for (const id of postIds) {
  const j = await (await fetch('/wp-json/wp/v2/posts/' + id + '?context=edit', ...)).json();
  let raw = j.content.raw;
  raw = raw.replace(/<!-- TP-ARTICLE-WRAP-START -->[\s\S]*?<div class="tp-article">\s*/, '');
  raw = raw.replace(/\s*<\/div>\s*<section class="tp-article-cta">[\s\S]*?<!-- TP-ARTICLE-WRAP-END -->/, '');
  const newContent = '<!-- TP-ARTICLE-WRAP-START -->' + preamble + '\n' + raw.trim() + '\n' + postamble + '<!-- TP-ARTICLE-WRAP-END -->';
  await fetch('/wp-json/wp/v2/posts/' + id, { method:'POST', ..., body: JSON.stringify({content: newContent, status: 'publish'}) });
}
```

**重要**: センチネル `<!-- TP-ARTICLE-WRAP-START/END -->` は絶対に消さないこと。これを使ってstripしないと旧preamble/postambleが重複していく。

---

## 16. 変更履歴

- 2026-04-21: 初版策定。LP v3 White Pearl Cosmos をベースライン化。
  - フォントを3系統（明朝+角ゴ+SF Mono）→ 2系統（明朝+角ゴ）に簡素化
  - ダーク背景の h3 を `#FFFFFF` / font-weight 800 に統一
  - ナビを圧縮 + 960px/640px ブレークポイントで段階圧縮
- 2026-04-21（追加）: ブログ導線整備
  - LP ナビに「ブログ」リンク追加（`/blog/` へ）
  - `/blog/` インデックスページ新規作成（ページID:238、カテゴリフィルタ付き）
  - 全12ブログ記事に `.tp-article` ラッパー + 共通スタイル + 記事末CTA + 「ブログ一覧に戻る」を一括適用（センチネル `<!-- TP-ARTICLE-WRAP-START/END -->` で管理）
