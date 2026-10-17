// Offline support: always try the network first so new versions show on the next open,
// and fall back to the cached copy when there is no signal.
const CACHE = 'budget-v5';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/store.js', 'js/calc.js', 'js/tax.js', 'js/csv.js', 'js/ui.js', 'js/money.js', 'js/budget.js',
  'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png'];

// 'no-cache' makes the browser check with the server instead of reusing its own copy,
// which GitHub Pages lets it keep for 10 minutes.
const fromNetwork = (req) => fetch(new Request(req, { cache: 'no-cache' }));

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => Promise.all(SHELL.map((url) => fromNetwork(url).then((res) => res.ok && c.put(url, res)))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fromNetwork(e.request);
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    } catch {
      return (await cache.match(e.request, { ignoreSearch: true })) || Response.error();
    }
  })());
});
