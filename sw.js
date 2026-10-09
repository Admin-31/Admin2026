/* Cache aset aplikasi agar shell dapat dibuka ulang saat offline. Data peserta berada di IndexedDB. */
const CACHE_NAME = "event-check-in-pages-v1";
const APP_SHELL = ["./", "./index.html", "./styles.css", "./app.js", "./manifest.webmanifest", "./assets/icon.svg"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(req).then(cached => cached || fetch(req).then(response => {
    if (response && response.ok) { const copy=response.clone(); caches.open(CACHE_NAME).then(cache=>cache.put(req,copy)); }
    return response;
  }).catch(() => caches.match("./index.html"))));
});
