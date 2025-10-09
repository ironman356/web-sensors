const CACHE_NAME = 'my-pwa-cache-v1';
const FILES_TO_CACHE = [
  './index.html',
  './manifest.json',
  './style.css',
  './bundle.js',
  './icons/icon-180.png'
];

// Install event: cache files
self.addEventListener('install', (evt) => {
  evt.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate event: cleanup old caches
self.addEventListener('activate', (evt) => {
  evt.waitUntil(
    caches.keys().then((keyList) =>
      Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    )
  );
  self.clients.claim();
});

// Fetch event: serve cached files if offline
self.addEventListener('fetch', (evt) => {
  evt.respondWith(
    caches.match(evt.request).then((cachedRes) => {
      return cachedRes || fetch(evt.request);
    })
  );
});
