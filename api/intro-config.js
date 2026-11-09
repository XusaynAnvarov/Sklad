// ========================================================================
//  GET /api/intro-config?lang=ru|uz|en — настройки вступительного ролика
//  для публичного сайта. Без входа: это то, что видит любой посетитель.
//
//  Отдаёт только опубликованное и только нужное странице: тексты одного
//  языка, ссылки на ролики (через наш сервер), 6 снимков товаров для сцен.
// ========================================================================
import { настройки, данные, ЯЗЫКИ } from "./lib/introstore.js";
import { взять, положить } from "./lib/memcache.js";

// Категории, по которым видно, что это запчасти для швейных машин
const КАТЕГОРИИ = ["Лапки", "Чельнок", "Шпулка", "Нинала", "Ножы", "Петлител", "Иглодержател", "Калиш", "Улитки"];

async function снимкиТоваров(коды) {
  const ключ = "intro:products:" + коды;
  const есть = взять(ключ);
  if (есть) return есть;
  let товары = [];
  try {
    const { каталог } = await import("./seo/data.js");
    товары = (await каталог()).товары.filter(т => т.photos.length);
  } catch (e) { console.error("[intro] каталог", e.message); }

  const выбор = [];
  const список = коды ? коды.split(/[\s,]+/).map(s => s.trim().toLowerCase()).filter(Boolean) : [];
  if (список.length) {
    for (const к of список) {
      const т = товары.find(x => x.code.toLowerCase() === к);
      if (т && !выбор.includes(т)) выбор.push(т);
    }
  } else {
    // по одному лучшему из каждой «швейной» категории, сначала то, что есть в наличии
    const вНаличии = товары.filter(т => т.status === "in_stock");
    for (const кат of КАТЕГОРИИ) {
      const т = вНаличии.find(x => x.catRaw === кат && x.photos.length > 1) || вНаличии.find(x => x.catRaw === кат);
      if (т) выбор.push(т);
      if (выбор.length >= 6) break;
    }
  }
  const ответ = выбор.slice(0, 6).map(т => ({
    name: т.name.slice(0, 60),
    code: т.code,
    img: "/api/img?w=300&p=" + encodeURIComponent(т.photos[0]),
  }));
  положить(ключ, ответ, 15 * 60);
  return ответ;
}

// Каталог для экскурсии: все категории со счётчиками и по 8 настоящих
// товаров с фото из «швейных» категорий. Цен здесь нет и быть не может.
const ТУР_КАТ = ["Лапки", "Чельнок", "Шпулка", "Нинала", "Ножы", "Петлител", "Иглодержател"];
async function данныеТура() {
  const есть = взять("intro:tour");
  if (есть) return есть;
  let товары = [];
  try { const { каталог } = await import("./seo/data.js"); товары = (await каталог()).товары; } catch (e) { console.error("[intro] тур", e.message); return null; }
  const счёт = {};
  for (const т of товары) счёт[т.catRaw] = (счёт[т.catRaw] || 0) + 1;
  const неделя = Date.now() - 7 * 864e5;
  const вид = (т) => ({
    name: т.name.slice(0, 70), code: т.code, sku: т.sku.slice(0, 30), status: т.status,
    img: "/api/img?w=480&p=" + encodeURIComponent(т.photos[0]),
    imgs: т.photos.slice(0, 4).map(p => "/api/img?w=900&p=" + encodeURIComponent(p)),
    photos: т.photos.length, is_new: !!(т.created && Date.parse(т.created) > неделя),
  });
  const cats = {};
  for (const кат of ТУР_КАТ) {
    const свои = товары.filter(т => т.catRaw === кат && т.photos.length);
    if (!свои.length) continue;
    свои.sort((a, b) => (a.status === "in_stock" ? 0 : 1) - (b.status === "in_stock" ? 0 : 1) || b.photos.length - a.photos.length);
    cats[кат] = свои.slice(0, 8).map(вид);
    if (Object.keys(cats).length >= 5) break;
  }
  const выбраны = new Set(Object.keys(cats));
  const categories = Object.entries(счёт).sort((a, b) => a[0].localeCompare(b[0], "ru"))
    .filter(([имя], i) => выбраны.has(имя) || i < 16).slice(0, 16).map(([name, count]) => ({ name, count }));
  for (const имя of выбраны) if (!categories.some(c => c.name === имя)) categories.push({ name: имя, count: счёт[имя] });
  categories.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  return положить("intro:tour", { total: товары.length, categories, cats }, 15 * 60);
}

function ссылкаРолика(s, устройство, язык, rev) {
  const v = s.video?.[устройство] || {};
  const путь = v[язык] || v.all;
  return путь ? `/api/intro-video?d=${устройство}&l=${язык}&r=${rev}` : "";
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const язык = ЯЗЫКИ.includes(req.query?.lang) ? req.query.lang : "ru";
  const s = настройки();
  const { rev } = данные();

  const ответ = {
    enabled: !!s.enabled,
    rev,
    seen_version: s.seen_version,
    frequency: s.frequency,
    howto_button: !!s.howto_button,
    skip_show: !!s.skip_show,
    skip_delay: s.skip_delay,
    sound: !!s.sound,
    transition_ms: s.transition_ms,
    logo_url: s.logo_url || "",
    poster_url: s.poster_url || "",
    texts: s.texts[язык] || s.texts.ru,
    lang: язык,
    mode: s.mode,
    video: {
      desktop: ссылкаРолика(s, "desktop", язык, rev),
      mobile: ссылкаРолика(s, "mobile", язык, rev),
    },
    products: [],
    // экскурсия
    tour_mode: s.tour_mode || "invite",
    scenes: s.scenes || [],
    tour_texts: { [язык]: (s.tour_texts || {})[язык] || {} },
    audio_url: (s.audio?.[язык] || s.audio?.all) ? `/api/intro-video?d=audio&l=${язык}&r=${rev}` : "",
    audio_loop: !!s.audio_loop,
  };
  // ролик выбран, но не загружен ни для одного устройства — показываем анимацию
  if (ответ.mode === "video" && !ответ.video.desktop && !ответ.video.mobile) ответ.mode = "animation";
  if (ответ.enabled || req.query?.products === "1") ответ.products = await снимкиТоваров(s.product_codes || "");

  if (req.query?.tour === "1") ответ.tour = await данныеТура();
  // минуту держит Cloudflare/браузер: настройки меняются редко
  res.setHeader("Cache-Control", "public, max-age=60");
  return res.status(200).json(ответ);
}
