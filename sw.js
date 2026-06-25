const CACHE = 'iabard-v5';
const CORE = [
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

  var isNav = e.request.mode === 'navigate';
  var isTxt = url.pathname.endsWith('.txt');

  // Always fetch HTML and .txt files fresh from network, bypassing all caches
  if (isNav || isTxt) {
    e.respondWith(
      fetch(new Request(e.request, {cache: 'no-store'})).then(function(res) {
        if (isTxt && res && res.ok) {
          var clone = res.clone();
          caches.open(CACHE).then(function(c) { c.put(new Request(url.pathname), clone); });
        }
        return res;
      }).catch(function() {
        return caches.match(isTxt ? new Request(url.pathname) : e.request);
      })
    );
    return;
  }

  // Cache-first for images, fonts — fast repeat loads
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
