const CACHE_NAME = 'urun-store-cache-v7';
const urlsToCache = [
  './index.html',
  './style.css',
  './app.js',
  './motion.js',
  './favicon.svg',
  './favicon-32.png',
  './favicon-16.png',
  './icon.png',
  './icon-192.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Duyarlı veriler asla cache'lenmez (Supabase API / config)
  if (url.hostname.includes('supabase.co') || url.pathname.includes('config.js')) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request).catch(() => undefined))
  );
});