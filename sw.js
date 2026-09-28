// Offline cache for the static app. Bump VERSION when shipping changes; pages are served
// cache-first and refreshed in the background, so an update shows up on the next launch.
const VERSION = 'bj-v2';
const ASSETS = [
  './', './index.html', './style.css', './app.js', './ui.js', './store.js', './manifest.webmanifest',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
  './engine/active.js', './engine/betting.js', './engine/cards.js', './engine/computed.js', './engine/count.js',
  './engine/deviations.js', './engine/hand.js', './engine/rules.js', './engine/scenarios.js', './engine/strategy.js',
  './engine/table.js', './engine/tables.js',
  './views/basic.js', './views/bet.js', './views/charts.js', './views/chartview.js', './views/common.js',
  './views/count.js', './views/index.js', './views/sim.js', './views/tableview.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const cached = await cache.match(e.request, { ignoreSearch: true });
    const fresh = fetch(e.request).then((res) => {
      if (res.ok && new URL(e.request.url).origin === location.origin) cache.put(e.request, res.clone());
      return res;
    }).catch(() => cached);
    return cached ?? fresh;
  }));
});
