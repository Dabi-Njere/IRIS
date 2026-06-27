const CACHE_NAME = 'iris-shell-v1';
const SHELL_FILES = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
});

self.addEventListener('fetch', (event) => {
  // Network-first for API calls (always want fresh data), cache-first for
  // the app shell itself. This is deliberately simple — no offline queueing
  // of approvals or anything clever, just "the app still opens" offline.
  if (event.request.url.includes('/api/')) return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
