/**
 * PWA インストール促進バナー（両アプリ共通）
 *
 * 動作:
 *  - Android/Chrome: beforeinstallprompt をキャプチャ → ワンタップでインストール
 *  - iOS Safari: 「共有→ホーム画面に追加」のガイドを表示
 *  - 一度閉じたら 30日間は表示しない
 *  - 表示条件: 2回目以降の訪問
 *
 * GA4 計測:
 *  - pwa_banner_show: バナー表示
 *  - pwa_install_prompt: ネイティブダイアログ結果（accepted/dismissed）
 *  - pwa_install: 実際にインストール完了
 *  - pwa_install_dismiss: バナー閉じた
 *
 * 読み込み（HTML側）:
 *   <script src="pwa-install.js"></script>          ライフプラン
 *   <script src="../pwa-install.js"></script>       支出管理
 */
(function () {
  // 既にスタンドアロン起動なら何もしない
  if (window.matchMedia('(display-mode: standalone)').matches) return;
  if (window.navigator.standalone === true) return; // iOS Safari standalone
  if (localStorage.getItem('pwa_installed') === '1') return;

  const DISMISS_KEY = 'pwa_install_dismissed_until';
  const VISITS_KEY  = 'pwa_visits';

  // 30日以内に dismiss していたらスキップ
  const dismissedUntil = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10);
  if (Date.now() < dismissedUntil) return;

  // 訪問回数カウント
  const visits = parseInt(localStorage.getItem(VISITS_KEY) || '0', 10) + 1;
  localStorage.setItem(VISITS_KEY, String(visits));

  // 2回目以降の訪問でのみ表示
  if (visits < 2) return;

  // アプリ判定
  const appName = location.pathname.startsWith('/spending') ? 'spending' : 'lifeplan';
  const isLifeplan = appName === 'lifeplan';
  const themeColor1 = isLifeplan ? '#1B4FE8' : '#10B981';
  const themeColor2 = isLifeplan ? '#00C4A0' : '#34C759';
  const iconSrc    = isLifeplan ? 'icon-lifeplan.svg' : '../icon-spending.svg';

  // 環境判定
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isSafari = /^((?!chrome|crios|fxios|android).)*safari/i.test(ua);
  const isIOSSafari = isIOS && isSafari;

  function track(name, params) {
    try {
      if (typeof window.gtag === 'function') {
        window.gtag('event', name, Object.assign({ app_name: appName }, params || {}));
      }
    } catch (e) { /* fail silently */ }
  }

  // インストール完了の検知
  window.addEventListener('appinstalled', () => {
    track('pwa_install');
    localStorage.setItem('pwa_installed', '1');
    hideBanner();
  });

  // Android/Chrome: beforeinstallprompt をキャプチャ
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showBanner('android');
  });

  // iOS Safari: 30秒後にガイド表示
  if (isIOSSafari) {
    setTimeout(() => showBanner('ios'), 30000);
  }

  function ensureKeyframes() {
    if (document.getElementById('pwa-install-style')) return;
    const style = document.createElement('style');
    style.id = 'pwa-install-style';
    style.textContent = '@keyframes pwaSlideUp{from{transform:translateY(120%);opacity:0}to{transform:translateY(0);opacity:1}}';
    document.head.appendChild(style);
  }

  function makeEl(tag, opts) {
    const el = document.createElement(tag);
    if (opts) {
      if (opts.id) el.id = opts.id;
      if (opts.cssText) el.style.cssText = opts.cssText;
      if (opts.text) el.textContent = opts.text;
      if (opts.attrs) for (const k in opts.attrs) el.setAttribute(k, opts.attrs[k]);
    }
    return el;
  }

  function makeBoldedFragment(text) {
    // "...<b>X</b>..." 形式の文字列から DocumentFragment を作る（XSS安全）
    const frag = document.createDocumentFragment();
    const parts = text.split(/<b>(.*?)<\/b>/);
    parts.forEach((part, i) => {
      if (i % 2 === 1) {
        const b = document.createElement('b');
        b.textContent = part;
        frag.appendChild(b);
      } else if (part) {
        frag.appendChild(document.createTextNode(part));
      }
    });
    return frag;
  }

  function showBanner(type) {
    if (document.getElementById('pwa-install-banner')) return;
    ensureKeyframes();
    track('pwa_banner_show', { banner_type: type });

    const message = type === 'ios'
      ? '画面下の<b>共有ボタン</b>から「ホーム画面に追加」'
      : 'ホーム画面に追加するとアプリのように使えます';

    const banner = makeEl('div', {
      id: 'pwa-install-banner',
      cssText: [
        'position:fixed', 'bottom:16px', 'left:16px', 'right:16px',
        'max-width:480px', 'margin:0 auto',
        'background:#fff',
        'border:1px solid rgba(10,22,40,0.08)',
        'border-radius:16px',
        'box-shadow:0 12px 40px rgba(10,22,40,0.18)',
        'padding:14px 16px',
        'display:flex', 'align-items:center', 'gap:12px',
        'z-index:9999',
        "font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans',sans-serif",
        'animation:pwaSlideUp 0.4s ease-out',
      ].join(';'),
    });

    // アイコン
    const icon = makeEl('img', {
      attrs: { src: iconSrc, width: '44', height: '44', alt: '' },
      cssText: 'border-radius:10px;flex-shrink:0',
    });
    banner.appendChild(icon);

    // テキスト部分
    const textCol = makeEl('div', { cssText: 'flex:1;min-width:0' });
    const title = makeEl('div', {
      text: '📱 アプリとして使う',
      cssText: 'font-weight:700;font-size:14px;color:#0A1628',
    });
    const subtitle = makeEl('div', {
      cssText: 'font-size:12px;color:#4A5875;margin-top:2px;line-height:1.4',
    });
    subtitle.appendChild(makeBoldedFragment(message));
    textCol.appendChild(title);
    textCol.appendChild(subtitle);
    banner.appendChild(textCol);

    // CTAボタン
    if (type === 'ios') {
      const closeBtn = makeEl('button', {
        id: 'pwa-banner-close',
        text: '閉じる',
        cssText: 'background:#f0f3f8;border:0;color:#374151;padding:10px 18px;border-radius:50px;font-weight:600;cursor:pointer;font-size:13px;flex-shrink:0',
      });
      banner.appendChild(closeBtn);
    } else {
      const installBtn = makeEl('button', {
        id: 'pwa-banner-install',
        text: '追加する',
        cssText: 'background:linear-gradient(135deg,' + themeColor1 + ',' + themeColor2 + ');border:0;color:#fff;padding:10px 22px;border-radius:50px;font-weight:700;cursor:pointer;font-size:13px;box-shadow:0 4px 14px rgba(27,79,232,0.28);flex-shrink:0',
      });
      banner.appendChild(installBtn);
    }

    // ×ボタン
    const dismissBtn = makeEl('button', {
      id: 'pwa-banner-dismiss',
      text: '×',
      attrs: { 'aria-label': '閉じる' },
      cssText: 'background:none;border:0;color:#9CA3AF;font-size:22px;cursor:pointer;padding:0 4px;flex-shrink:0;line-height:1',
    });
    banner.appendChild(dismissBtn);

    document.body.appendChild(banner);

    // インストールボタン（Android/Chrome）
    const installBtn = document.getElementById('pwa-banner-install');
    if (installBtn) {
      installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) { hideBanner(); return; }
        deferredPrompt.prompt();
        try {
          const { outcome } = await deferredPrompt.userChoice;
          track('pwa_install_prompt', { outcome: outcome });
        } catch (e) { /* ignore */ }
        deferredPrompt = null;
        hideBanner();
      });
    }

    // ディスマス → 30日間非表示
    const dismissHandler = () => {
      const until = Date.now() + 30 * 24 * 60 * 60 * 1000;
      localStorage.setItem(DISMISS_KEY, String(until));
      track('pwa_install_dismiss');
      hideBanner();
    };
    document.getElementById('pwa-banner-dismiss')?.addEventListener('click', dismissHandler);
    document.getElementById('pwa-banner-close')?.addEventListener('click', dismissHandler);
  }

  function hideBanner() {
    const el = document.getElementById('pwa-install-banner');
    if (el) el.remove();
  }
})();
