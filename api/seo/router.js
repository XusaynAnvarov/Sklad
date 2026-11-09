// ========================================================================
//  SEO: маршруты публичных страниц.
//
//  /p/<код>-<название>        товар (ru), /uz/p/…, /en/p/…
//  /c/  /c/<категория>        каталог и категории (+ ?page=N)
//  /faq  /search?q=           вопросы-ответы и поиск
//  /img/p/<товар>-<N>.jpg     фото товара с понятным именем (для Google Картинок)
//  /sitemap.xml (+ -pages, -categories, -products), /feed/google-merchant.xml, /llms.txt
//
//  В nginx эти адреса проксируются в Node (deploy/nginx-generalmodern.conf).
//  Адрес товара держится на постоянном коде (MK-003): если название
//  поменяли, старая ссылка 301-м ведёт на новую, а не ломается.
// ========================================================================
import express from "express";
import { каталог, кодИзАдреса } from "./data.js";
import { виденные, настройки } from "./store.js";
import { подходитЗапрос } from "./text.js";
import { страницаТовара, страницаКатегории, страницаКаталога, страницаПоиска, страница404, uProduct, uCat, uCats, НА_СТРАНИЦЕ } from "./render.js";
import { страницаFAQ } from "./faq.js";
import { sitemapIndex, sitemapPages, sitemapCategories, sitemapProducts, merchantFeed, llmsTxt } from "./feeds.js";
import { снимок, типПоИмени } from "../lib/imgproxy.js";

const r = express.Router({ strict: true });
const ШИРИНЫ = [160, 300, 480, 900, 1200];

function html(res, code, body) {
  res.status(code);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", code === 200 ? "public, max-age=300, stale-while-revalidate=600" : "no-store");
  res.end(body);
}
function xml(res, body, type = "application/xml") {
  res.setHeader("Content-Type", type + "; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=900");
  res.end(body);
}
const обёртка = (fn) => async (req, res, next) => {
  try { await fn(req, res, next); }
  catch (e) { console.error("[seo]", req.path, e); if (!res.headersSent) res.status(500).send("Ошибка сервера"); }
};

for (const lang of ["ru", "uz", "en"]) {
  const pre = lang === "ru" ? "" : "/" + lang;

  r.get(`${pre}/p/:slug`, обёртка(async (req, res) => {
    const кат = await каталог();
    const код = кодИзАдреса(req.params.slug);
    const т = код && кат.поКоду.get(код);
    if (!т) {
      // товар скрыт или удалён: ведём на его категорию, а не в пустоту
      const был = код && виденные()[код];
      if (был && был.cat && кат.категории.has(был.cat)) return res.redirect(301, uCat(lang, был.cat));
      return html(res, 404, страница404(lang));
    }
    if (req.params.slug !== т.slug) return res.redirect(301, uProduct(lang, т));
    html(res, 200, страницаТовара(т, lang, кат.категории.get(т.cat.slug)));
  }));

  r.get(`${pre}/c`, (req, res) => res.redirect(301, uCats(lang)));
  r.get(`${pre}/c/`, обёртка(async (req, res) => html(res, 200, страницаКаталога(await каталог(), lang))));

  r.get(`${pre}/c/:slug`, обёртка(async (req, res) => {
    const кат = await каталог();
    const slug = String(req.params.slug).toLowerCase();
    const c = кат.категории.get(slug) || кат.марки.get(slug);
    if (!c) return html(res, 404, страница404(lang));
    const raw = req.query.page;
    const page = raw === undefined ? 1 : Number(raw);
    const страниц = Math.max(1, Math.ceil(c.items.length / НА_СТРАНИЦЕ));
    if (!Number.isInteger(page) || page < 1) return res.redirect(301, uCat(lang, c.slug));
    if (raw !== undefined && page === 1) return res.redirect(301, uCat(lang, c.slug));   // ?page=1 — дубль
    if (page > страниц) return res.redirect(301, uCat(lang, c.slug, страниц));
    html(res, 200, страницаКатегории(c, lang, page));
  }));

  r.get(`${pre}/faq`, обёртка(async (req, res) => html(res, 200, страницаFAQ(lang, await каталог()))));

  r.get(`${pre}/search`, обёртка(async (req, res) => {
    const q = String(req.query.q || "").slice(0, 100).trim();
    const кат = await каталог();
    const найдено = q ? кат.товары.filter(т => подходитЗапрос(т, q))
      .sort((a, b) => (a.status === "in_stock" ? 0 : 1) - (b.status === "in_stock" ? 0 : 1)) : [];
    html(res, 200, страницаПоиска(lang, q, найдено));
  }));

  if (lang !== "ru") {
    r.get(`/${lang}`, (req, res) => res.redirect(301, uCats(lang)));
    r.get(`/${lang}/`, (req, res) => res.redirect(301, uCats(lang)));
  }
}

// ---------- фото с понятным именем ----------
r.get("/img/p/:file", обёртка(async (req, res) => {
  const m = /^(.+)-(\d{1,2})\.jpg$/i.exec(String(req.params.file || ""));
  if (!m) return res.status(404).send("Нет такого файла");
  const кат = await каталог();
  const т = кат.поКоду.get(кодИзАдреса(m[1]));
  const n = Number(m[2]);
  if (!т || !т.photos[n - 1]) return res.status(404).send("Нет такого файла");
  if (m[1] !== т.slug) return res.redirect(301, `/img/p/${т.slug}-${n}.jpg${req.query.w ? "?w=" + encodeURIComponent(req.query.w) : ""}`);
  const w = ШИРИНЫ.includes(Number(req.query.w)) ? Number(req.query.w) : 900;
  const путь = т.photos[n - 1];
  const есть = await снимок(путь, w);
  if (!есть) return res.status(404).send("Нет такого файла");
  res.setHeader("Content-Type", типПоИмени(путь));
  res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  res.setHeader("X-Robots-Tag", "index");
  res.end(есть.байты);
}));

// ---------- карты сайта, фид, llms.txt ----------
r.get("/sitemap.xml", обёртка(async (req, res) => xml(res, sitemapIndex(await каталог()))));
r.get("/sitemap-pages.xml", обёртка(async (req, res) => xml(res, sitemapPages())));
r.get("/sitemap-categories.xml", обёртка(async (req, res) => xml(res, sitemapCategories(await каталог()))));
r.get("/sitemap-products.xml", обёртка(async (req, res) => xml(res, sitemapProducts(await каталог()))));
r.get("/feed/google-merchant.xml", обёртка(async (req, res) => xml(res, merchantFeed(await каталог()))));
r.get("/llms.txt", обёртка(async (req, res) => xml(res, llmsTxt(await каталог()), "text/plain")));

// ---------- подтверждение владения (файлы, которые выдают Google/Яндекс/Bing) ----------
r.get(/^\/(google[0-9a-f]{8,40}\.html)$/, (req, res) => {
  const f = req.params[0];
  if (настройки().google_file !== f) return res.status(404).send("Not found");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`google-site-verification: ${f}`);
});
r.get(/^\/yandex_([0-9a-f]{8,40})\.html$/, (req, res) => {
  const code = req.params[0];
  if (настройки().yandex_file !== code) return res.status(404).send("Not found");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<html><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"></head><body>Verification: ${code}</body></html>`);
});
r.get("/BingSiteAuth.xml", (req, res) => {
  const code = настройки().verify_bing;
  if (!/^[A-Za-z0-9]{6,64}$/.test(code || "")) return res.status(404).send("Not found");
  xml(res, `<?xml version="1.0"?>\n<users>\n\t<user>${code}</user>\n</users>`);
});
r.get(/^\/indexnow-([a-f0-9]{32})\.txt$/, (req, res) => {
  const key = настройки().indexnow_key;
  if (!key || req.params[0] !== key) return res.status(404).send("Not found");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end(key);
});

export default r;
