// キャッシュ名（バージョン管理用。更新時はここを変更する）
const CACHE_NAME = 'taskrono-v1';

// キャッシュするリソースのリスト
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './taskrono.ico',
  './taskronoicon.png',
  // 外部リソース (CDN)
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/dropbox/dist/Dropbox-sdk.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
];

// インストール時の処理: キャッシュを開いてリソースを追加
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(ASSETS_TO_CACHE);
      })
  );
});

// アクティベート時の処理: 古いキャッシュを削除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// フェッチ時の処理: キャッシュがあればそれを返し、なければネットワークへ
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // キャッシュが見つかった場合
        if (response) {
          return response;
        }

        // キャッシュがない場合はネットワークリクエスト
        // 注意: Dropbox APIへのリクエストなど、動的な外部通信はここを通過します
        return fetch(event.request).catch(() => {
            // オフラインで、かつ画像やページが見つからない場合のフォールバック処理が必要ならここに記述
            // 今回はシングルページアプリなので基本はindex.htmlが返ればOK
        });
      })
  );
});
