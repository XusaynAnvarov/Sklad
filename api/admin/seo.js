// ========================================================================
//  СКЛАД → «SEO и поисковая видимость» (js/pages/seo.js).
//
//  GET  /api/admin/seo                 — сводка: аудит, сервисы, настройки, снимки
//  GET  /api/admin/seo?part=products   — проблемы по каждому товару
//  POST /api/admin/seo { action: … }   — audit | preview | apply | rollback |
//                                        settings | product | category | indexnow-key
//
//  Пишет только файл SEO-уточнений на сервере (data/seo-settings.json).
//  Склад, цены и остатки отсюда не меняются.
// ========================================================================
import { randomBytes } from "crypto";
import { getUser } from "../lib/auth.js";
import { забыть } from "../lib/memcache.js";
import { данные, сохранить, снимок, откатить, аудит, НАСТРОЙКИ_ПО_УМОЛЧАНИЮ } from "../seo/store.js";
import { запуститьАудит, предложитьИсправления, применитьИсправления } from "../seo/audit.js";
import { статистикаGSC, отправитьIndexNow } from "../seo/services.js";
import { каталог } from "../seo/data.js";
import { abs, uProduct } from "../seo/render.js";

const str = (v, n = 300) => String(v ?? "").replace(/[\u0000-\u001F]/g, " ").trim().slice(0, n);
const КОД = /^[A-Za-z0-9]{1,6}-\d{1,6}$/;

async function проверитьАдрес(path, ждём) {
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(abs(path), { signal: ctl.signal, headers: { "User-Agent": "GM-SEO-check" } });
    clearTimeout(t);
    const text = await r.text();
    return { path, status: r.status, ok: r.ok && (!ждём || text.includes(ждём)), type: r.headers.get("content-type") || "" };
  } catch (e) { return { path, status: 0, ok: false, error: e.name === "AbortError" ? "нет ответа за 8 с" : e.message }; }
}

export default async function handler(req, res) {
  const чтение = req.method === "GET";
  const user = await getUser(req, { allowGuest: чтение });
  if (!user) return res.status(401).json({ error: "Не авторизован" });
  res.setHeader("Cache-Control", "no-store");

  try {
    if (чтение) {
      if (req.query.part === "products") {
        const a = аудит();
        return res.json({ products: a.products || [], at: (a.runs && a.runs[0] && a.runs[0].at) || null });
      }
      const a = аудит();
      const last = (a.runs && a.runs[0]) || null;
      const d = данные();
      const s = d.settings;
      const кат = await каталог();
      const пример = кат.товары.find(т => т.photos.length) || кат.товары[0];
      // живые проверки снаружи — то, что видит поисковик
      const live = req.query.live === "1" ? await Promise.all([
        проверитьАдрес("/robots.txt", "Sitemap:"),
        проверитьАдрес("/sitemap.xml", "<sitemapindex"),
        проверитьАдрес("/c/", "application/ld+json"),
        пример ? проверитьАдрес(uProduct("ru", пример), '"@type":"Product"') : null,
        проверитьАдрес("/llms.txt", "GENERAL MODERN"),
        проверитьАдрес("/feed/google-merchant.xml", "<rss"),
      ].filter(Boolean)) : null;
      const gsc = req.query.gsc === "1" ? await статистикаGSC() : null;
      return res.json({
        last, runs: (a.runs || []).slice(0, 20).map(r => ({ at: r.at, total: r.total, complete: r.complete, withErrors: r.withErrors, withWarnings: r.withWarnings })),
        settings: s,
        services: {
          gsc: { configured: !!process.env.GSC_SERVICE_ACCOUNT, property: s.gsc_property },
          google_verify: !!(s.verify_google || s.google_file),
          yandex_verify: !!(s.verify_yandex || s.yandex_file),
          bing_verify: !!s.verify_bing,
          ga4: /^G-[A-Z0-9]{4,20}$/.test(s.ga4_id || ""),
          indexnow: !!(s.indexnow && s.indexnow_key),
        },
        live, gsc,
        catalog: { products: кат.товары.length, categories: кат.категории.size, built: кат.построено,
          categoryList: [...кат.категории.values()].map(c => ({ raw: c.raw, slug: c.slug, ru: c.ru, uz: c.uz, en: c.en, count: c.items.length })) },
        overrides: d.products,
        categoryOverrides: d.categories,
        history: d.history.map(h => ({ id: h.id, at: h.at, label: h.label })),
        urls: { sitemap: abs("/sitemap.xml"), feed: abs("/feed/google-merchant.xml"), llms: abs("/llms.txt"), catalog: abs("/c/") },
      });
    }

    if (user.role === "guest") return res.status(403).json({ error: "Только просмотр" });
    const b = req.body || {};
    const action = String(b.action || "");

    if (action === "audit") {
      const r = await запуститьАудит();
      return res.json({ ok: true, summary: { ...r, products: undefined } });
    }
    if (action === "preview") return res.json({ fixes: await предложитьИсправления() });
    if (action === "apply") {
      const codes = Array.isArray(b.codes) ? b.codes.filter(c => КОД.test(String(c))).slice(0, 5000) : null;
      const r = await применитьИсправления(codes);
      забыть("catalog:seo");
      return res.json({ ok: true, ...r });
    }
    if (action === "rollback") {
      const ok = откатить(str(b.id, 20));
      забыть("catalog:seo");
      return ok ? res.json({ ok: true }) : res.status(404).json({ error: "Снимок не найден" });
    }
    if (action === "settings") {
      const d = данные();
      снимок("Настройки SEO");
      const next = { ...d.settings };
      for (const k of Object.keys(НАСТРОЙКИ_ПО_УМОЛЧАНИЮ)) {
        if (!(k in (b.settings || {}))) continue;
        const v = b.settings[k];
        if (typeof НАСТРОЙКИ_ПО_УМОЛЧАНИЮ[k] === "boolean") next[k] = !!v;
        else next[k] = str(v, k.startsWith("delivery") ? 600 : 200);
      }
      next.price_policy = "hidden";   // цены не публикуются никогда — решение владельца
      if (next.telegram && !/^https:\/\/t\.me\/[\w]{3,64}$/.test(next.telegram)) return res.status(400).json({ error: "Telegram: нужна ссылка вида https://t.me/имя" });
      if (next.google_file && !String(next.google_file).split(/[,\s]+/).filter(Boolean).every(x => /^google[0-9a-f]{8,40}\.html$/.test(x))) return res.status(400).json({ error: "Файл Google: имя вида google1234abcd.html" });
      if (next.yandex_file && !/^[0-9a-f]{8,40}$/.test(next.yandex_file)) return res.status(400).json({ error: "Яндекс: только код из имени файла yandex_<код>.html" });
      if (next.ga4_id && !/^G-[A-Z0-9]{4,20}$/.test(next.ga4_id)) return res.status(400).json({ error: "GA4: идентификатор вида G-XXXXXXX" });
      if (next.lat && !/^-?\d{1,3}(\.\d+)?$/.test(next.lat)) return res.status(400).json({ error: "Широта — число" });
      if (next.lng && !/^-?\d{1,3}(\.\d+)?$/.test(next.lng)) return res.status(400).json({ error: "Долгота — число" });
      d.settings = next;
      сохранить(d);
      забыть("catalog:seo");
      return res.json({ ok: true, settings: next });
    }
    if (action === "indexnow-key") {
      const d = данные();
      if (!d.settings.indexnow_key) { снимок("Ключ IndexNow"); d.settings.indexnow_key = randomBytes(16).toString("hex"); сохранить(d); }
      return res.json({ ok: true, key: d.settings.indexnow_key });
    }
    if (action === "indexnow-all") {
      const кат = await каталог();
      const r = await отправитьIndexNow([abs("/c/"), ...кат.товары.map(т => abs(uProduct("ru", т)))]);
      return res.json({ ok: true, ...r });
    }
    if (action === "product") {
      const code = str(b.code, 20);
      if (!КОД.test(code)) return res.status(400).json({ error: "Неверный код товара" });
      const d = данные();
      снимок("Товар " + code);
      const o = { title: str(b.title, 120), description: str(b.description, 1000), compat: str(b.compat, 300), brand: str(b.brand, 60) };
      Object.keys(o).forEach(k => { if (!o[k]) delete o[k]; });
      if (Object.keys(o).length) d.products[code] = o; else delete d.products[code];
      сохранить(d);
      забыть("catalog:seo");
      return res.json({ ok: true, override: d.products[code] || null });
    }
    if (action === "category") {
      const raw = str(b.raw, 80);
      if (!raw) return res.status(400).json({ error: "Нет категории" });
      const d = данные();
      снимок("Категория " + raw);
      const o = {};
      for (const k of ["ru", "uz", "en"]) if (str(b[k], 80)) o[k] = str(b[k], 80);
      for (const k of ["text_ru", "text_uz", "text_en"]) if (str(b[k], 1200)) o[k] = str(b[k], 1200);
      if (Object.keys(o).length) d.categories[raw] = o; else delete d.categories[raw];
      сохранить(d);
      забыть("catalog:seo");
      return res.json({ ok: true });
    }
    return res.status(400).json({ error: "Неизвестное действие" });
  } catch (e) {
    console.error("[admin/seo]", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
