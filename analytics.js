/**
 * GA4 計測（最小実装）
 *
 * 計測対象:
 *  - app_open: アプリ起動（流入元 / UTM / referrer を一緒に送る）
 *  - app_event: 主要操作（関数 trackAppEvent(name, params) で送る）
 *
 * プライバシー方針:
 *  - IP匿名化を有効化
 *  - 入力した家計データは一切送らない（CSPでも遮断）
 *  - 流入元やクリックしたボタン名のみ送る
 *
 * 使い方（HTML側）:
 *   <script src="analytics.js" data-app="lifeplan"></script>   ライフプラン
 *   <script src="analytics.js" data-app="spending"></script>    支出管理
 *
 * 主要操作の計測例:
 *   if (window.trackAppEvent) trackAppEvent('simulate_run');
 */
(function () {
  var GA_ID = 'G-LGKX64Z71X';
  var script = document.currentScript;
  var appName = (script && script.dataset.app) || 'unknown';

  // gtag.js 読み込み
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  window.gtag = gtag;

  gtag('js', new Date());
  gtag('config', GA_ID, {
    anonymize_ip: true,
    send_page_view: true,
    app_name: appName,
  });

  // 流入元情報
  var qs = new URLSearchParams(location.search);
  var launchParams = {
    app_name: appName,
    utm_source:   qs.get('utm_source')   || '',
    utm_medium:   qs.get('utm_medium')   || '',
    utm_campaign: qs.get('utm_campaign') || '',
    utm_content:  qs.get('utm_content')  || '',
    utm_term:     qs.get('utm_term')     || '',
    referrer_host: (function () {
      try { return document.referrer ? new URL(document.referrer).hostname : ''; }
      catch (e) { return ''; }
    })(),
  };

  gtag('event', 'app_open', launchParams);

  // 主要操作の計測 API
  window.trackAppEvent = function (name, params) {
    try {
      var payload = Object.assign({ app_name: appName }, params || {});
      gtag('event', name, payload);
    } catch (e) { /* fail silently */ }
  };

  // 主要操作の自動計測（onclick の関数名 / button text で判定）
  // 入力データは送らず、操作種別のみ送る
  var ACTION_KEYWORDS = {
    'printLifePlan':       'export_pdf',
    'exportData':          'export_data',
    'importFileInput':     'import_data',
    'openInputDiagnosis':  'open_diagnosis',
    'openIrregularGuide':  'open_guide',
    'handleCSVFile':       'import_csv',
    'openManualModal':     'add_entry',
    'openBudgetModal':     'open_budget',
    'openCatSettings':     'open_categories',
  };

  // アフィリエイトASPドメイン（クリック検出用）
  var AFFILIATE_DOMAIN_MAP = {
    'a8.net':              'a8',
    'moshimo.com':         'moshimo',
    'linksynergy.com':     'rakuten',
    'valuecommerce.com':   'valuecommerce',
    'accesstrade.net':     'accesstrade',
    'afl.rakuten.co.jp':   'rakuten_afl',
    'amazon.co.jp':        'amazon',
  };
  function detectAffProgram(hostname) {
    for (var d in AFFILIATE_DOMAIN_MAP) {
      if (hostname === d || hostname.endsWith('.' + d)) return AFFILIATE_DOMAIN_MAP[d];
    }
    return null;
  }

  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('button, a, [onclick]');
    if (!el) return;

    // アフィリエイトリンク検出（aタグのみ）
    if (el.tagName === 'A' && el.href) {
      try {
        var u = new URL(el.href);
        var aff = detectAffProgram(u.hostname);
        if (aff) {
          window.trackAppEvent('affiliate_click', {
            aff_program: aff,
            aff_link_text: (el.textContent || '').trim().slice(0, 60),
            aff_url_host: u.hostname,
          });
          // returnせず操作キーワード検出も継続（同じリンクが両方マッチする可能性）
        }
      } catch (e) { /* invalid URL */ }
    }

    // 主要操作キーワード
    var oc = el.getAttribute('onclick') || '';
    var id = el.id || '';
    for (var key in ACTION_KEYWORDS) {
      if (oc.indexOf(key) !== -1 || id === key) {
        window.trackAppEvent(ACTION_KEYWORDS[key]);
        return;
      }
    }
  }, true);
})();
