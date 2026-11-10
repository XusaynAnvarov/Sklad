// ========================================================================
//  SEO: языки и названия категорий.
//
//  Категории в складе записаны так, как привык владелец («Ножы», «Нинала»,
//  «Мокки»). В базе их НЕ меняем — здесь только то, как категория
//  называется на публичной странице на трёх языках, и её адрес.
//  Категория, которой нет в списке, показывается как есть, адрес — транслитом.
//  Переопределить любое название можно в складе: «SEO» → «Категории».
// ========================================================================
import { slugify } from "./text.js";

export const LANGS = ["ru", "uz", "en"];
export const DEFAULT_LANG = "ru";
// Префикс адреса: русский — без префикса (основной рынок, существующие ссылки)
export const prefix = (lang) => (lang === "ru" ? "" : "/" + lang);
export const HREFLANG = { ru: "ru", uz: "uz", en: "en" };
export const OG_LOCALE = { ru: "ru_RU", uz: "uz_UZ", en: "en_US" };

// raw → { slug, ru, uz, en }
export const КАТЕГОРИИ = {
  "Лапки":            { slug: "lapki", ru: "Лапки для швейных машин", uz: "Tikuv mashinasi lapkalari", en: "Presser feet" },
  "Нинала":           { slug: "igly", ru: "Иглы для швейных машин", uz: "Tikuv mashinasi ninalari", en: "Sewing machine needles" },
  "Чельнок":          { slug: "chelnoki", ru: "Челноки", uz: "Chelnoklar", en: "Rotary hooks (shuttles)" },
  "Мокки":            { slug: "shpulnye-kolpachki", ru: "Шпульные колпачки (мокки)", uz: "Mokkilar (shpulka g‘ilofi)", en: "Bobbin cases" },
  "Шпулка":           { slug: "shpulki", ru: "Шпульки", uz: "Shpulkalar", en: "Bobbins" },
  "Петлител":         { slug: "petliteli", ru: "Петлители", uz: "Petlitellar", en: "Loopers" },
  "Тиш":              { slug: "zubchatye-reyki", ru: "Зубчатые рейки (тиш)", uz: "Tishlar (transportyor)", en: "Feed dogs" },
  "Пластина":         { slug: "plastiny", ru: "Пластины", uz: "Plastinalar", en: "Plates" },
  "Иглодержател":     { slug: "iglodershateli", ru: "Иглодержатели", uz: "Igna ushlagichlari", en: "Needle clamps" },
  "Улитки":           { slug: "ulitki", ru: "Улитки (подгибатели)", uz: "Ulitkalar", en: "Folders and hemmers" },
  "Насатки":          { slug: "nasadki", ru: "Насадки", uz: "Nasadkalar", en: "Attachments" },
  "Ножы":             { slug: "nozhi", ru: "Ножи", uz: "Pichoqlar", en: "Knives and blades" },
  "Диск":             { slug: "diski", ru: "Диски", uz: "Disklar", en: "Circular blades" },
  "Аппараты":         { slug: "apparaty", ru: "Аппараты и оборудование", uz: "Apparatlar va uskunalar", en: "Machines and equipment" },
  "Приборы для машин":{ slug: "prinadlezhnosti", ru: "Принадлежности для швейных машин", uz: "Tikuv mashinalari uchun anjomlar", en: "Sewing machine accessories" },
  "Ремень":           { slug: "remni", ru: "Ремни", uz: "Tasmalar (remenlar)", en: "Belts" },
  "Утюги":            { slug: "utyugi", ru: "Утюги и детали", uz: "Dazmollar va qismlari", en: "Irons and parts" },
  "Тень":             { slug: "teny", ru: "ТЭНы (нагревательные элементы)", uz: "TENlar (isitish elementlari)", en: "Heating elements" },
  "Регулятор":        { slug: "regulyatory", ru: "Регуляторы", uz: "Regulyatorlar", en: "Regulators" },
  "Бабина стойки":    { slug: "stoyki-dlya-bobin", ru: "Стойки для бобин", uz: "Bobina stoykalari", en: "Thread stands" },
  "Шестеренки":       { slug: "shesterenki", ru: "Шестерёнки", uz: "Shesternyalar", en: "Gears" },
  "Светилник":        { slug: "svetilniki", ru: "Светильники для швейных машин", uz: "Tikuv mashinasi chiroqlari", en: "Sewing machine lights" },
  "Магниты":          { slug: "magnity", ru: "Магниты", uz: "Magnitlar", en: "Magnets" },
  "Крышки":           { slug: "kryshki", ru: "Крышки", uz: "Qopqoqlar", en: "Covers" },
  "Болть":            { slug: "bolty", ru: "Болты", uz: "Boltlar", en: "Bolts and screws" },
  "Пинцеты":          { slug: "pintsety", ru: "Пинцеты", uz: "Pinsetlar", en: "Tweezers" },
  "Метры":            { slug: "ruletki", ru: "Рулетки и метры", uz: "Ruletkalar va metrlar", en: "Measuring tapes" },
  "Калиш":            { slug: "kalish", ru: "Калиш", uz: "Kalish", en: "Kalish" },
};

export function категория(raw, overrides = {}) {
  const r = String(raw || "").trim() || "Другое";
  const base = КАТЕГОРИИ[r] || { slug: slugify(r) || "drugoe", ru: r, uz: r, en: r };
  const o = overrides[r] || {};
  return {
    raw: r,
    slug: base.slug,
    ru: o.ru || base.ru, uz: o.uz || base.uz, en: o.en || base.en,
    text: { ru: o.text_ru || "", uz: o.text_uz || "", en: o.text_en || "" },
  };
}

// Интерфейсные строки публичных страниц
export const T = {
  ru: {
    home: "Главная", catalog: "Каталог", categories: "Категории товаров", faq: "Вопросы и ответы",
    code: "Код товара", sku: "Артикул", category: "Категория", availability: "Наличие",
    in_stock: "В наличии", out_stock: "Нет в наличии", soon: "Скоро поступит",
    price: "Цена", priceOnRequest: "Назовём после заявки",
    howTitle: "Как заказать",
    how: ["Укажите количество и отправьте заявку — на сайте или в Telegram.", "Мы рассчитаем цену и пришлём её вам.", "Вы подтверждаете заказ — или отказываетесь, если цена не подходит."],
    mentions: "Модель / марка в названии", compat: "Совместимость", descr: "Описание",
    order: "Заказать на сайте", orderTg: "Написать в Telegram", related: "Похожие товары",
    photos: "Фотографии", products: (n) => `${n} ${plural(n, "товар", "товара", "товаров")}`,
    inStockN: (n) => `в наличии: ${n}`,
    page: "Страница", next: "Дальше", prev: "Назад", allCats: "Все категории",
    search: "Поиск", searchPh: "Название, артикул или код…", found: (n) => `Найдено: ${n}`, nothing: "Ничего не найдено",
    store: "Магазин запчастей для швейных машин",
    country: "Узбекистан",
    titleSuffix: "купить в Узбекистане",
    notFound: "Страница не найдена", notFoundText: "Такой страницы нет. Посмотрите каталог — возможно, товар переехал в другую категорию.",
    contacts: "Контакты", openStore: "Открыть магазин",
    prodDesc: (p, cat) => `${p.name} — ${cat.toLowerCase()} в магазине GENERAL MODERN. Код ${p.code}${p.sku ? ", артикул " + p.sku : ""}. ${p.statusText}. Фото, наличие и заказ онлайн.`,
    catIntro: (name, n, k) => `${name} в магазине GENERAL MODERN: ${n} ${plural(n, "позиция", "позиции", "позиций")}, из них ${k} в наличии. У каждого товара — фотографии, код и артикул, чтобы деталь можно было сверить с вашей. Заказ — на сайте или через Telegram-бот.`,
    catTitle: (name) => `${name} — купить в Узбекистане | GENERAL MODERN`,
    catDesc: (name, n) => `${name}: ${n} ${plural(n, "позиция", "позиции", "позиций")} с фото, кодом и артикулом. Наличие на складе, заказ онлайн. GENERAL MODERN, Узбекистан.`,
    catsTitle: "Швейные запчасти — каталог запчастей для швейных машин | GENERAL MODERN",
    catsDesc: (n) => `Каталог запчастей и принадлежностей для промышленных и бытовых швейных машин: ${n} товаров — лапки, иглы, челноки, шпульные колпачки, петлители, ножи. Узбекистан.`,
    catsIntro: (n, k) => `GENERAL MODERN — магазин запчастей и принадлежностей для швейного оборудования в Узбекистане. В каталоге ${n} товаров, из них ${k} в наличии. Выберите категорию или найдите деталь по названию, артикулу или коду.`,
  },
  uz: {
    home: "Bosh sahifa", catalog: "Katalog", categories: "Mahsulot toifalari", faq: "Savol va javoblar",
    code: "Mahsulot kodi", sku: "Artikul", category: "Toifa", availability: "Mavjudligi",
    in_stock: "Mavjud", out_stock: "Mavjud emas", soon: "Tez orada keladi",
    price: "Narx", priceOnRequest: "Buyurtmadan keyin aytamiz",
    howTitle: "Qanday buyurtma berish",
    how: ["Miqdorni ko‘rsating va buyurtma yuboring — saytda yoki Telegramda.", "Narxni hisoblab, sizga yuboramiz.", "Siz buyurtmani tasdiqlaysiz — yoki narx to‘g‘ri kelmasa, rad etasiz."],
    mentions: "Nomidagi model / marka", compat: "Moslik", descr: "Tavsif",
    order: "Saytda buyurtma berish", orderTg: "Telegramda yozish", related: "O‘xshash mahsulotlar",
    photos: "Rasmlar", products: (n) => `${n} ta mahsulot`,
    inStockN: (n) => `mavjud: ${n}`,
    page: "Sahifa", next: "Keyingi", prev: "Oldingi", allCats: "Barcha toifalar",
    search: "Qidiruv", searchPh: "Nomi, artikul yoki kod…", found: (n) => `Topildi: ${n}`, nothing: "Hech narsa topilmadi",
    store: "Tikuv mashinalari ehtiyot qismlari do‘koni",
    country: "O‘zbekiston",
    titleSuffix: "O‘zbekistonda sotib olish",
    notFound: "Sahifa topilmadi", notFoundText: "Bunday sahifa yo‘q. Katalogni ko‘ring — mahsulot boshqa toifaga o‘tgan bo‘lishi mumkin.",
    contacts: "Aloqa", openStore: "Do‘konni ochish",
    prodDesc: (p, cat) => `${p.name} — GENERAL MODERN do‘konida ${cat.toLowerCase()}. Kod ${p.code}${p.sku ? ", artikul " + p.sku : ""}. ${p.statusText}. Rasmlar, mavjudlik va onlayn buyurtma.`,
    catIntro: (name, n, k) => `GENERAL MODERN do‘konida ${name.toLowerCase()}: ${n} ta pozitsiya, shundan ${k} tasi mavjud. Har bir mahsulotda rasm, kod va artikul bor — detalni o‘zingiznikiga solishtirish oson. Buyurtma — saytda yoki Telegram-bot orqali.`,
    catTitle: (name) => `${name} — O‘zbekistonda sotib olish | GENERAL MODERN`,
    catDesc: (name, n) => `${name}: rasm, kod va artikul bilan ${n} ta pozitsiya. Ombordagi mavjudlik, onlayn buyurtma. GENERAL MODERN, O‘zbekiston.`,
    catsTitle: "Tikuv mashinasi zapchastlari va ehtiyot qismlari — Toshkent | GENERAL MODERN",
    catsDesc: (n) => `Tikuv mashinasi zapchastlari va ehtiyot qismlari — sanoat va maishiy tikuv mashinalari uchun: ${n} ta mahsulot — lapkalar, ninalar, chelnoklar, mokkilar, petlitellar, pichoqlar. O‘zbekiston.`,
    catsIntro: (n, k) => `GENERAL MODERN — O‘zbekistonda tikuv uskunalari uchun ehtiyot qismlar va anjomlar do‘koni. Katalogda ${n} ta mahsulot, shundan ${k} tasi mavjud. Toifani tanlang yoki detalni nomi, artikuli yoki kodi bo‘yicha toping.`,
  },
  en: {
    home: "Home", catalog: "Catalog", categories: "Product categories", faq: "Questions and answers",
    code: "Product code", sku: "Part number", category: "Category", availability: "Availability",
    in_stock: "In stock", out_stock: "Out of stock", soon: "Coming soon",
    price: "Price", priceOnRequest: "Quoted after your request",
    howTitle: "How to order",
    how: ["Enter the quantity and send a request — on the website or via Telegram.", "We calculate the price and send it to you.", "You confirm the order — or decline if the price does not suit you."],
    mentions: "Model / brand in the name", compat: "Compatibility", descr: "Description",
    order: "Order on the website", orderTg: "Message us on Telegram", related: "Similar products",
    photos: "Photos", products: (n) => `${n} ${n === 1 ? "product" : "products"}`,
    inStockN: (n) => `in stock: ${n}`,
    page: "Page", next: "Next", prev: "Previous", allCats: "All categories",
    search: "Search", searchPh: "Name, part number or code…", found: (n) => `Found: ${n}`, nothing: "Nothing found",
    store: "Sewing machine spare parts store",
    country: "Uzbekistan",
    titleSuffix: "buy in Uzbekistan",
    notFound: "Page not found", notFoundText: "This page does not exist. Browse the catalog — the product may have moved to another category.",
    contacts: "Contacts", openStore: "Open the store",
    prodDesc: (p, cat) => `${p.name} — ${cat.toLowerCase()} at GENERAL MODERN. Code ${p.code}${p.sku ? ", part number " + p.sku : ""}. ${p.statusText}. Photos, availability and online ordering.`,
    catIntro: (name, n, k) => `${name} at GENERAL MODERN: ${n} items, ${k} of them in stock. Every product has photos, a code and a part number so you can match the part with yours. Order on the website or via our Telegram bot.`,
    catTitle: (name) => `${name} — buy in Uzbekistan | GENERAL MODERN`,
    catDesc: (name, n) => `${name}: ${n} items with photos, codes and part numbers. Stock availability and online ordering. GENERAL MODERN, Uzbekistan.`,
    catsTitle: "Sewing machine spare parts — catalog | GENERAL MODERN",
    catsDesc: (n) => `Catalog of spare parts and accessories for industrial and domestic sewing machines: ${n} products — presser feet, needles, rotary hooks, bobbin cases, loopers, knives. Uzbekistan.`,
    catsIntro: (n, k) => `GENERAL MODERN is a store of spare parts and accessories for sewing equipment in Uzbekistan. The catalog lists ${n} products, ${k} of them in stock. Pick a category or find a part by name, part number or code.`,
  },
};

export function plural(n, one, few, many) {
  const d = n % 10, h = n % 100;
  if (d === 1 && h !== 11) return one;
  if (d >= 2 && d <= 4 && (h < 10 || h >= 20)) return few;
  return many;
}
