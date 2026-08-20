// ========================================================================
//  Service Worker — оффлайн-оболочка + быстрый старт (stale-while-revalidate).
//  Данные (Supabase/api) НЕ кэшируем — всегда из сети.
// ========================================================================
const CACHE = "sklad-v121";
const SHELL = ["./", "./index.html", "./admin.html", "./catalog.html", "./sklad.html", "./css/theme.css", "./css/site.css", "./config.js", "./icon.svg", "./manifest.webmanifest"];
// код (html/css/js) грузим «сеть в приоритете», чтобы изменения были видны сразу;
// картинки/иконки/шрифты — из кэша (быстро + офлайн).
const isCode = (p) => p.endsWith(".html") || p.endsWith(".css") || p.endsWith(".js") || p.endsWith("/");

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

  // JS/CSS: добавляем ?v=CACHE к запросу → Cloudflare/nginx отдают immutable-файл как НОВЫЙ
  // URL при смене версии (иначе старый код «застревает» в кэше Cloudflare). Кэшируем под исходным URL.
  if (url.pathname.endsWith(".js") || url.pathname.endsWith(".css")) {
    const vurl = new URL(req.url);
    vurl.searchParams.set("v", CACHE);
    e.respondWith(
      fetch(vurl.toString(), { cache: "reload" }).then(res => {
        if (res && res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }
  if (isCode(url.pathname)) {
    // HTML / "/" — отдаётся динамически (не кэшируется Cloudflare), просто свежая сеть
    e.respondWith(
      fetch(req, { cache: "reload" }).then(res => {
        if (res && res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }
  // остальное (картинки/иконки/шрифты) — stale-while-revalidate
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
