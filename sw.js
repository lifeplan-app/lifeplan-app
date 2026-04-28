// Service Worker — ライフプランアプリ / 支出管理アプリ
// バージョンを上げると古いキャッシュが activate 時に削除され、
// 新しい analytics.js / pwa-install.js 等を確実に取得し直せる
const CACHE_NAME = 'lifeplan-app-v2';

const PRECACHE = [
  './',
  './index.html',
  './spending/index.html',
  './spending/',
  './analytics.js',
  './pwa-install.js',
  './manifest.json',
  './icon-lifeplan.svg',
  './spending/manifest.json',
  './icon-spending.svg',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
];

// インストール: 主要リソースをキャッシュ
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// アクティベート: 古いキャッシュを削除
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// フェッチ: キャッシュ優先（Cache First）
// ただし外部CDN以外のリクエストはネットワーク優先（Network First）で
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // ナビゲーションリクエスト（HTMLページ）: Network First
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // 静的アセット（JS・CSS・SVG等）: Cache First
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (!res || res.status !== 200 || res.type === 'opaque') return res;
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return res;
      });
    })
  );
});
