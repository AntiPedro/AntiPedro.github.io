const CACHE_NAME = 'urun-store-cache-v3';
const urlsToCache = [
  './index.html',
  './style.css',
  './app.js',
  './config.js',
  './logo.svg',
  './icon.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
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
  // SECURITY FIX: Prevent caching of sensitive data (Supabase auth/api, config files)
  if (url.hostname.includes('supabase.co') || url.pathname.includes('config.js')) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached response if found, else fetch from network
        return response || fetch(event.request).catch(() => {
            // Offline fallback if needed, but here simple pass-through is fine
        });
      })
  );
});
