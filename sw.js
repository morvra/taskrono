const CACHE_NAME = 'taskrono-v2.0';

const STATIC_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './taskrono.ico',
    './taskronoicon.png',
    './css/main.css',
    'https://cdn.tailwindcss.com',
    'https://unpkg.com/dropbox/dist/Dropbox-sdk.min.js',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
];

const JS_MODULES = [
    './js/main.js',
    './js/utils.js',
    './js/state.js',
    './js/dropbox.js',
    './js/tasks.js',
    './js/repeat.js',
    './js/sections.js',
    './js/projects.js',
    './js/modals.js',
    './js/keyboard.js',
    './js/render/renderToday.js',
    './js/render/renderRepeat.js',
    './js/render/renderProjects.js',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        })
    );
    // 新しいSWをすぐ有効化
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    // 既存のページにも新しいSWをすぐ適用
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    const isJsModule = JS_MODULES.some(m => event.request.url.endsWith(m.replace('./', '/')));

    // JSモジュール: ネットワーク優先（失敗時はキャッシュにフォールバック）
    if (isJsModule) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // それ以外: キャッシュ優先
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});
