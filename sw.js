const CACHE = 'iabard-v2';
const CORE = [
  '/',
  '/index.html',
  '/background.webp',
  '/background.jpg',
  '/favicon.svg',
  '/manifest.json'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function(c) { return c.addAll(CORE); })
      .then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e) {
  var url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  // Network-first for navigation (HTML pages) and poems.txt
  var isNav = e.request.mode === 'navigate';
  var isPoems = url.pathname.endsWith('poems.txt');
  if (isNav || isPoems) {
    e.respondWith(
      fetch(e.request).then(function(res) {
        if (res && res.ok) {
          var clone = res.clone();
          // Cache poems.txt without query string to avoid cache bloat
          var cacheKey = isPoems ? new Request(url.pathname) : e.request;
          caches.open(CACHE).then(function(c) { c.put(cacheKey, clone); });
        }
        return res;
      }).catch(function() {
        var fallbackKey = isPoems ? new Request(url.pathname) : e.request;
        return caches.match(fallbackKey);
      })
    );
    return;
  }

  // Cache-first for images, fonts, scripts — fast repeat loads
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) return cached;
      return fetch(e.request).then(function(res) {
        if (res && res.ok) {
          var clone = res.clone();
          caches.open(CACHE).then(function(c) { c.put(e.request, clone); });
        }
        return res;
      });
    })
  );
});
