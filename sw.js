// Mythikos Forge — Service Worker
// Caches the app shell so the app opens even with no signal (e.g. at events).
// Bump CACHE_VERSION whenever you change the HTML or want to force a refresh.
const CACHE_VERSION = 'mf-v2';

// Relative URLs — resolved against the SW's own location, so this works
// correctly inside a GitHub Pages project subfolder (username.github.io/repo/).
const APP_SHELL = [
  './',
  './mythikos-forge-inventory.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './header-logo.png',
  // CDN libraries the app needs to function offline:
  'https://cdnjs.cloudflare.com/ajax/libs/qrcode/1.5.4/qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js',
];

// On install, pre-cache the shell. Individual failures (e.g. a CDN hiccup)
// shouldn't abort the whole install, so we cache best-effort.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(async cache => {
      await Promise.allSettled(APP_SHELL.map(url => cache.add(url)));
      self.skipWaiting();
    })
  );
});

// On activate, drop old caches from previous versions.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy:
//  - API calls to the Cloudflare Worker: always go to network (never cache
//    inventory data — that would show stale counts). If offline, the app's
//    own outbox queue handles retries, so we just let these fail naturally.
//  - Everything else (app shell, scripts, icons): network-first, falling back
//    to cache so the app still opens offline. We refresh the cache on success.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return; // never intercept POST/PUT (writes)

  const url = new URL(req.url);
  // Don't cache the worker API (inventory data) — let it hit the network only.
  if (url.pathname.match(/\/(ping|products|inventory|transaction|adjust|sync|pull-orders|squarespace)/)) {
    return; // default browser handling
  }

  event.respondWith(
    fetch(req)
      .then(res => {
        // Update cache with fresh copy of shell assets
        const copy = res.clone();
        caches.open(CACHE_VERSION).then(c => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match('./mythikos-forge-inventory.html')))
  );
});
