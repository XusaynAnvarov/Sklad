// ========================================================================
//  Service Worker — оффлайн-оболочка + быстрый старт (stale-while-revalidate).
//  Данные (Supabase/api) НЕ кэшируем — всегда из сети.
// ========================================================================
const CACHE = "sklad-v2";
const SHELL = ["./", "./index.html", "./catalog.html", "./css/theme.css", "./config.js", "./icon.svg", "./manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // только своя статика; чужие домены (Supabase, Telegram) и /api/ — мимо (сеть)
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  e.respondWith(
    caches.match(req).then(cached => {
      const net = fetch(req).then(res => {
        if (res && res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
});
