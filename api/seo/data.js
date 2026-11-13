// ========================================================================
//  SEO: данные каталога для публичных страниц, карты сайта и фида.
//
//  Источник тот же, что у /api/catalog: таблица products. Наличие
//  считается по тем же правилам (hidden — не показываем, soon / в дороге —
//  «скоро», остаток > 0 — «в наличии»). Остатки и цены здесь только
//  ЧИТАЮТСЯ, ничего не пишется.
//
//  Ключ памяти начинается с «catalog», поэтому любая запись в склад через
//  api/admin/db.js сразу его стирает — новый товар появляется на SEO-
//  страницах и в карте сайта без ожидания.
// ========================================================================
import { sget } from "../lib/supa.js";
import { помнить } from "../lib/memcache.js";
import { cleanName, slugТовара } from "./text.js";
import { категория } from "./i18n.js";
import { данные, виденные, сохранитьВиденные, настройки } from "./store.js";

const СЕКУНД = 300;

const ПОЛЯ = [
  "id,name,category,sku,code,photo_url,photos,stock_qty,site_status,created_at,last_arrival_at",
  "id,name,category,code,photo_url,photos,stock_qty,site_status,created_at",
];

// Марки, которые встречаются в названиях. Показываем их как «упоминание
// в названии», а НЕ как бренд товара: «Педаль F4 JACK» — деталь ДЛЯ JACK,
// и кто её производитель, из названия не следует.
const МАРКИ = ["JACK", "JUKI", "BROTHER", "SIRUBA", "PEGASUS", "YAMATO", "KANSAI", "TYPICAL", "ZOJE",
  "GEMSY", "BRUCE", "STRONG", "AKTION", "HEALTHMASS", "JET", "LEJIANG", "YUKK", "KINGTER", "MAQI",
  "HIKARI", "SUNSTAR", "MITSUBISHI", "SINGER", "JANOME", "VMA", "TAJIMA", "RICOMA", "TOYOTA", "DURKOPP"];

export function путьФото(u) {
  const s = String(u || "");
  if (!s) return "";
  const i = s.indexOf("/object/public/");
  if (i >= 0) return decodeURIComponent(s.slice(i + "/object/public/".length).split("?")[0]);
  if (s.startsWith("product-photos/")) return s.split("?")[0];
  return "";
}

function статус(p, вДороге) {
  if (p.site_status === "soon") return "soon";
  if (p.status) return p.status;                     // источник для разработки уже посчитал
  const ост = Number(p.stock_qty) || 0;
  if (вДороге.has(String(p.id)) && ост <= 0) return "soon";
  return ост > 0 ? "in_stock" : "out_stock";
}

async function сырыеТовары() {
  // Для разработки без ключей базы: берём публичный каталог боевого сайта
  if (process.env.SEO_DEV_CATALOG_URL && !process.env.SUPABASE_SERVICE_KEY) {
    const r = await fetch(process.env.SEO_DEV_CATALOG_URL);
    return { строки: await r.json(), вДороге: new Set() };
  }
  let строки = null, ошибка = null;
  for (const поля of ПОЛЯ) {
    try { строки = await sget(`products?select=${поля}&order=created_at.asc`); break; }
    catch (e) { ошибка = e; }
  }
  if (!строки) throw ошибка;
  const вДороге = new Set();
  try {
    const пр = await sget("purchases?status=eq.in_transit&select=items");
    пр.forEach(p => (p.items || []).forEach(it => { if (it.product_id) вДороге.add(String(it.product_id)); }));
  } catch { }
  return { строки, вДороге };
}

export function марки(p) {
  const текст = (p.name + " " + (p.sku || "")).toUpperCase();
  return МАРКИ.filter(m => new RegExp("(^|[^A-Z])" + m + "([^A-Z]|$)").test(текст));
}

function построить({ строки, вДороге }) {
  const d = данные();
  // Цены НЕ публикуются: владелец называет цену каждому клиенту после
  // заявки. Колонки цен даже не читаются — случайно показать нечего.
  const товары = [];
  const поКоду = new Map();
  for (const p of строки) {
    if (p.site_status === "hidden") continue;
    const code = String(p.code || "").trim();
    if (!code) continue;                              // у всех товаров код есть; без кода нет постоянного адреса
    const name = cleanName(p.name);
    const кат = категория(p.category, d.categories);
    const фото = [];
    for (const u of [p.photo_url, ...(Array.isArray(p.photos) ? p.photos : [])]) {
      const путь = путьФото(u);
      if (путь && !фото.includes(путь)) фото.push(путь);
    }
    const ov = d.products[code] || {};
    const price = null;
    const created = p.created_at || null;
    const lastmod = [p.created_at, p.last_arrival_at].filter(Boolean).sort().pop() || null;
    const т = {
      id: p.id, code, name, rawName: String(p.name || ""), sku: String(p.sku || "").trim(),
      catRaw: кат.raw, cat: кат,
      slug: slugТовара(code, name),
      photos: фото, status: статус(p, вДороге),
      created, lastmod, price, ov,
      mentions: [],
    };
    т.mentions = ov.brand ? [] : марки(т);
    товары.push(т);
    поКоду.set(code.toLowerCase(), т);
  }
  // категории
  const категории = new Map();
  for (const т of товары) {
    const k = т.cat.slug;
    if (!категории.has(k)) категории.set(k, { ...т.cat, items: [], inStock: 0 });
    const c = категории.get(k);
    c.items.push(т);
    if (т.status === "in_stock") c.inStock++;
  }
  for (const c of категории.values()) {
    // в наличии — выше, затем новые
    c.items.sort((a, b) => (a.status === "in_stock" ? 0 : 1) - (b.status === "in_stock" ? 0 : 1)
      || String(b.lastmod || "").localeCompare(String(a.lastmod || "")));
  }
  // Марки из названий: страница «Запчасти JACK» собирает реальные товары,
  // где марка указана в названии или артикуле. Меньше трёх — не делаем,
  // такая страница была бы пустышкой.
  const поМаркам = new Map();
  for (const т of товары) for (const m of т.mentions) {
    const slug = "zapchasti-" + m.toLowerCase();
    if (!поМаркам.has(slug)) поМаркам.set(slug, { name: m, slug, items: [], inStock: 0 });
    const b = поМаркам.get(slug); b.items.push(т); if (т.status === "in_stock") b.inStock++;
  }
  for (const [k, b] of поМаркам) {
    if (b.items.length < 3) { поМаркам.delete(k); continue; }
    const m = b.name, n = b.items.length, s = b.inStock;
    b.raw = m; b.brand = true;
    b.ru = `Запчасти ${m}`; b.uz = `${m} ehtiyot qismlari`; b.en = `${m} spare parts`;
    b.text = {
      ru: `Товары, у которых в названии или артикуле указана марка ${m}: ${n} шт., в наличии ${s}. Марка в названии обычно означает машину или модель, к которой подходит деталь, — сверяйте по фото, коду и артикулу. Цену назовём после заявки.`,
      uz: `Nomi yoki artikulida ${m} markasi ko‘rsatilgan mahsulotlar: ${n} ta, mavjud: ${s}. Nomidagi marka odatda detal mos keladigan mashina yoki modelni bildiradi — rasm, kod va artikul bo‘yicha solishtiring. Narxni buyurtmadan keyin aytamiz.`,
      en: `Products with the ${m} brand in the name or part number: ${n}, ${s} in stock. A brand in the name usually means the machine or model the part fits — check against the photos, code and part number. Price is quoted after your request.`,
    };
    b.items.sort((a, c) => (a.status === "in_stock" ? 0 : 1) - (c.status === "in_stock" ? 0 : 1));
  }
  запомнитьВиденные(товары);
  return { товары, поКоду, категории, марки: поМаркам, построено: new Date().toISOString() };
}

let новые = [];          // коды, которых раньше не было — для IndexNow
export const забратьНовые = () => { const n = новые; новые = []; return n; };

function запомнитьВиденные(товары) {
  try {
    const v = виденные();
    const пусто = Object.keys(v).length === 0;
    let изменено = false;
    for (const т of товары) {
      const k = т.code.toLowerCase();
      const было = v[k];
      if (!было || было.cat !== т.cat.slug || было.slug !== т.slug) {
        if (!было && !пусто) новые.push(т.code);
        v[k] = { cat: т.cat.slug, slug: т.slug, first: было ? было.first : new Date().toISOString() };
        изменено = true;
      }
    }
    if (изменено) сохранитьВиденные(v);
  } catch (e) { console.error("[seo] seen", e.message); }
}

export async function каталог() {
  return помнить("catalog:seo", СЕКУНД, async () => построить(await сырыеТовары()));
}

// /p/mk-003-mokki-... → товар по коду (первые две части адреса)
export function кодИзАдреса(slug) {
  const m = /^([a-z0-9]{1,6}-\d{1,6})(?:-|$)/i.exec(String(slug || ""));
  return m ? m[1].toLowerCase() : "";
}
