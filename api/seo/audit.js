// ========================================================================
//  SEO: проверка всех товаров и страниц + безопасные исправления.
//
//  «Безопасное» исправление меняет ТОЛЬКО SEO-заголовок в файле уточнений
//  (data/seo-settings.json). Название товара в складе, цена, остаток и
//  адрес страницы не меняются. Перед применением сохраняется снимок —
//  откат одной кнопкой.
// ========================================================================
import { каталог } from "./data.js";
import { данные, сохранить, снимок, аудит as прочитатьАудит, сохранитьАудит, настройки } from "./store.js";
import { seoTitle, seoDesc, страницаТовара, НА_СТРАНИЦЕ } from "./render.js";
import { sitemapProducts, merchantFeed } from "./feeds.js";
import { cut } from "./text.js";

const ДЛИНА_ЗАГОЛОВКА = 70;

// Проверка одного товара. level: error — мешает поиску, warn — хуже показ, info — можно дополнить
function проверитьТовар(т, дубли) {
  const issues = [];
  const add = (level, key, text) => issues.push({ level, key, text });
  if (!т.photos.length) add("error", "no_photo", "Нет фото — товар не попадёт в Google Картинки и Lens");
  else if (т.photos.length === 1) add("info", "one_photo", "Одно фото — добавьте ещё ракурсы, если есть");
  if (т.name.length < 8) add("warn", "short_name", "Очень короткое название — поисковику мало что понятно");
  if (seoTitle(т, "ru").length > ДЛИНА_ЗАГОЛОВКА + 12) add("warn", "long_title", "Заголовок длиннее ~70 знаков — в выдаче обрежется");
  if (дубли.get(т.name.toLowerCase()) > 1) add("warn", "dup_name", "Такое же название у другого товара — страницы похожи друг на друга");
  if (!т.sku) add("info", "no_sku", "Нет артикула — по номеру детали товар не найдут");
  if (!т.ov.description) add("info", "no_descr", "Нет своего описания (используется автоматическое)");
  if (!т.ov.compat) add("info", "no_compat", "Не указана совместимость с машинами");
  if (/\s{2,}|\(\s|\s\)/.test(т.rawName || "")) add("info", "spaces", "Лишние пробелы в названии (на сайте уже убраны)");
  if (настройки().price_policy === "show" && !т.price) add("warn", "no_price", "Показ цен включён, а у товара нет цены — в фид не попадёт");
  return issues;
}

// Проверка разметки на собранной странице: обязательные поля Product
function проверитьРазметку(т) {
  const html = страницаТовара(т, "ru", null);
  const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
  if (!m) return ["Нет JSON-LD"];
  let g;
  try { g = JSON.parse(m[1]); } catch { return ["JSON-LD не разбирается"]; }
  const p = (g["@graph"] || []).find(x => x["@type"] === "Product");
  const errs = [];
  if (!p) return ["Нет Product"];
  if (!p.name) errs.push("Product.name пуст");
  if (!p.image) errs.push("Product.image нет (нет фото)");
  if (!p.offers) errs.push("Нет offers — расширенный сниппет с ценой недоступен, пока цены скрыты");
  if (!/<link rel="canonical"/.test(html)) errs.push("Нет canonical");
  if (!/hreflang="uz"/.test(html)) errs.push("Нет hreflang");
  return errs;
}

export async function запуститьАудит({ сохранять = true } = {}) {
  const кат = await каталог();
  const дубли = new Map();
  кат.товары.forEach(т => дубли.set(т.name.toLowerCase(), (дубли.get(т.name.toLowerCase()) || 0) + 1));
  const товары = кат.товары.map(т => ({ code: т.code, name: т.name, slug: т.slug, cat: т.cat.ru, status: т.status, photos: т.photos.length, issues: проверитьТовар(т, дубли) }));

  // проверка адресов: у двух товаров не может быть одного адреса
  const адреса = new Map();
  кат.товары.forEach(т => адреса.set(т.slug, (адреса.get(т.slug) || 0) + 1));
  const дублиАдресов = [...адреса].filter(([, n]) => n > 1).map(([s]) => s);
  const кс = new Map();
  [...кат.категории.values()].forEach(c => кс.set(c.slug, (кс.get(c.slug) || 0) + 1));

  // разметка: выборочно (первые 60 товаров + все с проблемами фото)
  const выборка = кат.товары.slice(0, 60);
  const разметка = выборка.map(т => ({ code: т.code, errors: проверитьРазметку(т) }));
  const разметкаОшибок = разметка.filter(r => r.errors.some(e => !e.startsWith("Нет offers"))).length;

  let sitemapOk = true, sitemapUrls = 0, sitemapErr = "";
  try {
    const xml = sitemapProducts(кат);
    sitemapUrls = (xml.match(/<url>/g) || []).length;
    if (xml.length > 50 * 1024 * 1024 || sitemapUrls > 50000) { sitemapOk = false; sitemapErr = "Карта больше лимита 50 000 адресов / 50 МБ"; }
  } catch (e) { sitemapOk = false; sitemapErr = e.message; }
  const фид = merchantFeed(кат);
  const вФиде = (фид.match(/<item>/g) || []).length;

  const счёт = (lvl) => товары.filter(t => t.issues.some(i => i.level === lvl)).length;
  const полные = товары.filter(t => !t.issues.some(i => i.level !== "info")).length;
  const итог = {
    at: new Date().toISOString(),
    total: товары.length,
    complete: полные,
    withErrors: счёт("error"),
    withWarnings: счёт("warn"),
    byKey: товары.flatMap(t => t.issues).reduce((a, i) => { a[i.key] = (a[i.key] || 0) + 1; return a; }, {}),
    inStock: кат.товары.filter(т => т.status === "in_stock").length,
    categories: кат.категории.size,
    dupUrls: дублиАдресов,
    dupCategorySlugs: [...кс].filter(([, n]) => n > 1).map(([s]) => s),
    sitemap: { ok: sitemapOk, urls: sitemapUrls, error: sitemapErr },
    feed: { items: вФиде, ready: настройки().price_policy === "show" && вФиде > 0, reason: настройки().price_policy !== "show" ? "Цены скрыты — Merchant Center без цены товар не примет" : (вФиде ? "" : "Нет товаров с ценой и фото") },
    schema: { checked: разметка.length, withErrors: разметкаОшибок, sample: разметка.filter(r => r.errors.length).slice(0, 10) },
    pages: Math.ceil([...кат.категории.values()].reduce((s, c) => s + Math.max(1, Math.ceil(c.items.length / НА_СТРАНИЦЕ)), 0)),
  };
  if (сохранять) {
    const a = прочитатьАудит();
    a.runs = [{ ...итог, dupUrls: итог.dupUrls.slice(0, 20) }, ...(a.runs || [])].slice(0, 60);   // история — для «изменений»
    a.products = товары;
    сохранитьАудит(a);
  }
  return { ...итог, products: товары };
}

// ------------------------------------------------------------------
//  Безопасные исправления: предпросмотр → применение → откат
// ------------------------------------------------------------------
export async function предложитьИсправления() {
  const кат = await каталог();
  const d = данные();
  const дубли = new Map();
  кат.товары.forEach(т => { const k = т.name.toLowerCase(); дубли.set(k, (дубли.get(k) || 0) + 1); });
  const fixes = [];
  for (const т of кат.товары) {
    if (d.products[т.code] && d.products[т.code].title) continue;      // владелец уже задал вручную — не трогаем
    const было = seoTitle(т, "ru");
    let стало = "";
    let why = "";
    // одинаковые названия → добавляем код, чтобы заголовки различались
    if (дубли.get(т.name.toLowerCase()) > 1) {
      const хвост = ` (${т.code}) — купить в Узбекистане | GENERAL MODERN`;
      const имя = т.sku && !т.name.toLowerCase().includes(т.sku.toLowerCase()) ? `${т.name} ${т.sku}` : т.name;
      стало = cut(имя, Math.max(30, 75 - хвост.length)) + хвост;
      why = "Одинаковое название у нескольких товаров — добавлен код";
    }
    if (стало && стало !== было) fixes.push({ code: т.code, name: т.name, field: "title", before: было, after: стало, why });
  }
  return fixes;
}

export async function применитьИсправления(codes) {
  const fixes = await предложитьИсправления();
  const set = new Set(codes || fixes.map(f => f.code));
  const выбрано = fixes.filter(f => set.has(f.code));
  if (!выбрано.length) return { applied: 0 };
  const id = снимок(`Безопасные исправления (${выбрано.length})`);
  const d = данные();
  for (const f of выбрано) d.products[f.code] = { ...(d.products[f.code] || {}), [f.field]: f.after, auto: true };
  сохранить(d);
  return { applied: выбрано.length, snapshot: id };
}

export { seoDesc };
