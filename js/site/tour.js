// ========================================================================
//  ИНТЕРАКТИВНАЯ ЭКСКУРСИЯ ПО САЙТУ («сайт ожил»).
//
//  Что это. Двухминутный показ всего пути покупателя: сайт, категории,
//  поиск, карточка, регистрация, заказ на сайте и в Telegram, цена и
//  подтверждение, склад, накладная и доставка (Яндекс или BTS), кабинет,
//  бот. Показывается ТОЛЬКО то, что есть на сайте на самом деле (аудит —
//  в описании задачи): нет онлайн-оплаты, нет поиска по фото, нет
//  трекинга — значит, их нет и здесь.
//
//  Как сделано. Сцены собираются из НАСТОЯЩИХ классов сайта (site.css,
//  glassos-site.css — шапка, витрина, категории, карточки, кнопки, окно
//  входа, кабинет), поэтому экскурсия выглядит ровно как сайт и сама
//  переходит на мобильную раскладку на телефоне. Поверх — курсор (на
//  телефоне — касание), подсветка, «камера» и подписи. Только CSS и Web
//  Animations, без библиотек.
//
//  Безопасность. Экскурсия НЕ обращается к заказам, боту и складу:
//  ничего не создаёт и не отправляет. Клиент — демонстрационный.
//  Единственные запросы — настройки и снимки товаров (/api/intro-config).
//
//  Показ. Первый визит — неназойливое приглашение (или автозапуск, если
//  так выбрал владелец); дальше — кнопка «▶ Как заказать» в шапке.
// ========================================================================

const ВЕРСИЯ = "20261109t1";
const CSS_URL = new URL(`../../css/tour.css?v=${ВЕРСИЯ}`, import.meta.url).href;
const КЛЮЧ_СМОТРЕЛ = "gm_tour_seen";
const КЛЮЧ_НАСТРОЕК = "gm_intro_cfg";
const ДЕНЬ = 864e5;

// ---------------------------------------------------------------- тексты сцен
export const СЦЕНЫ_ПО_УМОЛЧАНИЮ = ["home", "cats", "search", "card", "auth", "order", "tgorder", "confirm", "stock", "delivery", "cabinet", "bot", "final"];

export const ТЕКСТЫ_ТУРА = {
  ru: {
    home: ["Знакомство", "Добро пожаловать! Здесь вы найдёте всё необходимое для вашего швейного оборудования."],
    cats: ["Каталог", "Слева — категории. Выберите нужную, и откроются все её товары с фото и кодами."],
    search: ["Поиск", "Ищите по названию или коду — можно даже «lp236» вместо «LP-236». Поиск понимает русский, узбекский и английский."],
    card: ["Карточка товара", "Все фото детали, наличие и код. Нажмите на код — он скопируется. Цену назовёт менеджер после заявки."],
    auth: ["Регистрация", "Номер телефона подтверждается в нашем Telegram-боте. Это займёт минуту — и пароль готов."],
    order: ["Заказ на сайте", "«Заказать» → укажите количество → проверьте список → «Отправить заказ». Оплаты на сайте нет."],
    tgorder: ["Заказ в Telegram", "То же самое — прямо в боте: «🛒 Заказать товары», корзина и «Отправить заказ»."],
    confirm: ["Цена и подтверждение", "Менеджер проверяет наличие и ставит цену. Вы можете поменять количество, убрать или добавить товары — и подтвердить."],
    stock: ["Сборка на складе", "Склад сверяет остатки, собирает и упаковывает заказ, выписывает накладную."],
    delivery: ["Доставка", "Накладная приходит в Telegram. Отправляем через Яндекс или почтой BTS — способ согласуем с вами."],
    cabinet: ["Личный кабинет", "Ваши заказы и статусы, накладные в PDF и Excel, оплаты и долг — всё в одном месте."],
    bot: ["Telegram-бот", "Бот присылает цену, накладные и новинки. Там же — заказ, каталог и ваш долг."],
    final: ["Готово", "Всё необходимое для вашего швейного оборудования — легко найти, удобно заказать и получить."],
  },
  uz: {
    home: ["Tanishuv", "Xush kelibsiz! Bu yerda tikuv uskunangiz uchun kerakli hamma narsani topasiz."],
    cats: ["Katalog", "Chap tomonda — toifalar. Keraklisini tanlang: barcha mahsulotlar rasmi va kodi bilan ochiladi."],
    search: ["Qidiruv", "Nomi yoki kodi bo‘yicha qidiring — «LP-236» o‘rniga «lp236» ham bo‘ladi. Rus, o‘zbek va ingliz tilini tushunadi."],
    card: ["Mahsulot kartochkasi", "Barcha rasmlar, mavjudligi va kodi. Kod ustiga bosing — nusxalanadi. Narxni menejer ariza bo‘yicha aytadi."],
    auth: ["Ro‘yxatdan o‘tish", "Telefon raqami Telegram-botimizda tasdiqlanadi. Bir daqiqa — va parol tayyor."],
    order: ["Saytda buyurtma", "«Buyurtma berish» → sonini kiriting → ro‘yxatni tekshiring → «Buyurtmani yuborish». Saytda to‘lov yo‘q."],
    tgorder: ["Telegramda buyurtma", "Xuddi shu — botning o‘zida: «🛒 Mahsulot buyurtma qilish», savat va yuborish."],
    confirm: ["Narx va tasdiq", "Menejer mavjudligini tekshirib, narx qo‘yadi. Sonini o‘zgartirish, olib tashlash yoki qo‘shish mumkin — keyin tasdiqlaysiz."],
    stock: ["Omborda yig‘ish", "Ombor qoldiqni tekshiradi, buyurtmani yig‘ib qadoqlaydi va yuk xatini yozadi."],
    delivery: ["Yetkazish", "Yuk xati Telegramga keladi. Yandex yoki BTS pochtasi orqali jo‘natamiz — usulini siz bilan kelishamiz."],
    cabinet: ["Shaxsiy kabinet", "Buyurtmalar va holatlari, PDF va Excel yuk xatlari, to‘lovlar va qarzingiz — hammasi bir joyda."],
    bot: ["Telegram-bot", "Bot narx, yuk xatlari va yangiliklarni yuboradi. U yerda buyurtma, katalog va qarzingiz ham bor."],
    final: ["Tayyor", "Tikuv uskunangiz uchun hamma narsa — oson topiladi, qulay buyurtma qilinadi va olinadi."],
  },
  en: {
    home: ["Welcome", "Welcome! Everything your sewing equipment needs is here."],
    cats: ["Catalog", "Categories are on the left. Pick one to see all its parts with photos and codes."],
    search: ["Search", "Search by name or code — “lp236” works as well as “LP-236”. It understands Russian, Uzbek and English."],
    card: ["Product card", "All photos, stock status and the code. Tap the code to copy it. A manager quotes the price after your request."],
    auth: ["Sign up", "Your phone number is confirmed in our Telegram bot. It takes a minute, then you set a password."],
    order: ["Ordering on the site", "“Order” → enter quantities → check the list → “Send order”. There is no payment on the site."],
    tgorder: ["Ordering in Telegram", "The same right in the bot: “🛒 Order products”, cart and “Send order”."],
    confirm: ["Price and confirmation", "A manager checks stock and sets the price. Change quantities, remove or add items — then confirm."],
    stock: ["Packing at the warehouse", "The warehouse checks stock, picks and packs your order and issues the invoice."],
    delivery: ["Delivery", "The invoice comes to Telegram. We ship via Yandex or BTS post — we agree the method with you."],
    cabinet: ["Your account", "Orders and statuses, invoices in PDF and Excel, payments and balance — all in one place."],
    bot: ["Telegram bot", "The bot sends prices, invoices and new arrivals. Ordering, catalog and your balance are there too."],
    final: ["Done", "Everything for your sewing equipment — easy to find, simple to order and receive."],
  },
};

// Подписи интерфейса — те же слова, что на сайте и в боте
const UI = {
  ru: {
    catalog: "Каталог", howTo: "Как заказать", order: "Заказать", login: "Войти", menu: "Меню", cabinet: "Кабинет",
    heroTitle: "Оборудование для вашего бизнеса", heroSub: "Профессиональная техника General Modern. Широкий ассортимент по лучшим ценам.", heroCta: "Смотреть каталог",
    cats: "Категории", all: "Все товары", shown: (n, m) => `Показано ${n} товаров` + (m ? ` из ${m}` : ""), searchPh: "Поиск по названию или артикулу…",
    inStock: "В наличии", soon: "Скоро", none: "Нет в наличии", isNew: "Новинка", toOrder: "Заказать", loginToOrder: "Войти для заказа",
    copied: "Код скопирован: ", priceAfter: "Цену назовёт менеджер",
    skip: "Пропустить", pause: "Пауза", play: "Продолжить", back: "Назад", next: "Дальше", sound: "Звук", shop: "Начать покупки",
    tour: "Экскурсия по сайту", inviteT: "Впервые у нас?", inviteD: "Посмотрите за 2 минуты, как найти деталь, заказать и получить её.", inviteGo: "Смотреть экскурсию", later: "Не сейчас",
    stepOf: (a, b) => `${a} из ${b}`,
  },
  uz: {
    catalog: "Katalog", howTo: "Qanday buyurtma berish", order: "Buyurtma berish", login: "Kirish", menu: "Menyu", cabinet: "Kabinet",
    heroTitle: "Biznesingiz uchun uskunalar", heroSub: "General Modern'dan professional texnika. Keng assortiment, eng yaxshi narxlar.", heroCta: "Katalogni ko'rish",
    cats: "Toifalar", all: "Barcha mahsulotlar", shown: (n, m) => `${n} ta mahsulot` + (m ? ` / ${m}` : ""), searchPh: "Nomi yoki artikul bo‘yicha qidirish…",
    inStock: "Mavjud", soon: "Tez kunda", none: "Mavjud emas", isNew: "Yangi", toOrder: "Buyurtma berish", loginToOrder: "Kirish va buyurtma berish",
    copied: "Kod nusxalandi: ", priceAfter: "Narxni menejer aytadi",
    skip: "O‘tkazib yuborish", pause: "Pauza", play: "Davom etish", back: "Orqaga", next: "Keyingi", sound: "Ovoz", shop: "Xaridni boshlash",
    tour: "Sayt bo‘ylab ekskursiya", inviteT: "Birinchi marta keldingizmi?", inviteD: "2 daqiqada ko‘ring: detalni qanday topish, buyurtma qilish va olish.", inviteGo: "Ekskursiyani ko‘rish", later: "Hozir emas",
    stepOf: (a, b) => `${a} / ${b}`,
  },
  en: {
    catalog: "Catalog", howTo: "How to order", order: "Order", login: "Login", menu: "Menu", cabinet: "Cabinet",
    heroTitle: "Equipment for Your Business", heroSub: "Professional equipment from General Modern. Wide range at the best prices.", heroCta: "Browse catalog",
    cats: "Categories", all: "All products", shown: (n, m) => `Showing ${n} products` + (m ? ` of ${m}` : ""), searchPh: "Search by name or article…",
    inStock: "In Stock", soon: "Coming Soon", none: "Out of Stock", isNew: "New", toOrder: "Order", loginToOrder: "Login to Order",
    copied: "Code copied: ", priceAfter: "A manager will quote the price",
    skip: "Skip", pause: "Pause", play: "Resume", back: "Back", next: "Next", sound: "Sound", shop: "Start shopping",
    tour: "Site tour", inviteT: "New here?", inviteD: "See in 2 minutes how to find a part, order it and receive it.", inviteGo: "Watch the tour", later: "Not now",
    stepOf: (a, b) => `${a} of ${b}`,
  },
};

// ---------------------------------------------------------------- помощники
const язык = () => { try { const l = localStorage.getItem("gm_lang"); return UI[l] ? l : "ru"; } catch { return "ru"; } };
const меньшеДвижения = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
const телефон = () => { try { return matchMedia("(max-width: 760px)").matches; } catch { return false; } };
const прочитать = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
const записать = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } };
const экран = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function узел(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
const ждать = (мс) => new Promise(ok => setTimeout(ok, мс));
const ЦЕНА = { ru: "•• ••• сум", uz: "•• ••• so‘m", en: "•• ••• UZS" };

const ЗНАК = (id) => `<svg viewBox="0 0 512 512" aria-hidden="true"><defs>
  <linearGradient id="${id}a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#f2f4f9"/><stop offset="1" stop-color="#e4e9f2"/></linearGradient>
  <linearGradient id="${id}b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7e9a6"/><stop offset=".42" stop-color="#e3c163"/><stop offset=".74" stop-color="#c79a33"/><stop offset="1" stop-color="#a87b1f"/></linearGradient></defs>
  <rect width="512" height="512" rx="116" fill="url(#${id}a)"/><rect x="5" y="5" width="502" height="502" rx="111" fill="none" stroke="#c8cedd" stroke-width="5"/>
  <circle class="ring" cx="256" cy="256" r="182" fill="none" stroke="url(#${id}b)" stroke-width="14" stroke-linecap="round" stroke-dasharray="1062 1144" transform="rotate(-96 256 256)"/>
  <text x="256" y="312" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="172" font-weight="700" letter-spacing="-6" fill="#16203a">GM</text></svg>`;

// Нарисованные детали — только если снимков нет (тестовый стенд без базы)
const МЕТ = `<defs><linearGradient id="gtM" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#eef1f6"/><stop offset=".5" stop-color="#9aa4b5"/><stop offset="1" stop-color="#5d6779"/></linearGradient><linearGradient id="gtG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7e9a6"/><stop offset=".6" stop-color="#c79a33"/><stop offset="1" stop-color="#8f6a1c"/></linearGradient></defs>`;
const РИС = [
  `<svg viewBox="0 0 64 64">${МЕТ}<rect x="27" y="6" width="10" height="26" rx="3" fill="url(#gtM)"/><path d="M12 38h40a4 4 0 0 1 4 4v6a6 6 0 0 1-6 6H18a8 8 0 0 1-8-8v-6a2 2 0 0 1 2-2z" fill="url(#gtM)"/><rect x="22" y="30" width="20" height="10" rx="2" fill="#7c879a"/></svg>`,
  `<svg viewBox="0 0 64 64">${МЕТ}<circle cx="32" cy="34" r="20" fill="url(#gtM)"/><path d="M14 30Q28 6 54 18Q38 16 24 30z" fill="url(#gtG)"/><circle cx="32" cy="34" r="9" fill="#d5dae3"/></svg>`,
  `<svg viewBox="0 0 64 64">${МЕТ}<circle cx="32" cy="32" r="22" fill="url(#gtM)"/><circle cx="32" cy="32" r="13" fill="none" stroke="#e3c163" stroke-width="4" stroke-dasharray="3 2"/><circle cx="32" cy="32" r="5" fill="#5d6779"/></svg>`,
  `<svg viewBox="0 0 64 64">${МЕТ}<path d="M14 52L48 10l3 2L19 55z" fill="url(#gtM)"/><rect x="10" y="49" width="10" height="7" rx="2" transform="rotate(-51 15 52)" fill="url(#gtG)"/></svg>`,
  `<svg viewBox="0 0 64 64">${МЕТ}<path d="M8 40L44 12Q56 6 56 18L22 50z" fill="url(#gtM)"/><path d="M8 40L22 50L18 56L4 46z" fill="url(#gtG)"/></svg>`,
];
const ЗАПАС = {
  ru: [["Лапки", "Лапка", "LP"], ["Чельнок", "Челнок", "CH"], ["Шпулка", "Шпулька", "SH"], ["Нинала", "Игла DP-5", "NN"], ["Ножы", "Нож", "NJ"]],
};
// Демо-каталог: если сервер не дал снимков, сцены всё равно собираются
function демоКаталог() {
  const cats = {};
  ЗАПАС.ru.forEach(([cat, nm, pre], k) => {
    cats[cat] = [0, 1, 2, 3, 4, 5].map(i => ({ name: `${nm} ${i + 1}`, code: `${pre}-${String(200 + i * 7 + k).padStart(3, "0")}`, sku: "", img: "", imgs: [], status: i === 4 ? "soon" : "in_stock", is_new: i === 1, photos: 1 + (i % 3), _ris: k }));
  });
  return { total: 952, categories: ЗАПАС.ru.map(([c], k) => ({ name: c, count: 40 + k * 23 })), cats };
}

const IC = {
  search: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>`,
  cart: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>`,
  burger: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>`,
  tg: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71l-4.14-3.05-1.99 1.93c-.23.23-.42.42-.83.42z"/></svg>`,
  sun: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/></svg>`,
  copy: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>`,
  play: `<svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>`,
  trash: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`,
  doc: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M6 2.5h8l4.5 4.5v14.5H6z"/><path d="M14 2.5V7h4.5M9 12h6M9 15.5h6"/></svg>`,
  truck: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6h11v10H2zM13 9h4l4 4v3h-8z"/><circle cx="6" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/></svg>`,
  box: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5L12 12l9-4.5M12 12v9"/></svg>`,
  prev: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zM20 5v14L9 12z"/></svg>`,
  next: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M16 5h2v14h-2zM4 5v14l11-7z"/></svg>`,
  pause: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>`,
  resume: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>`,
  vol: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/></svg>`,
  mute: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z"/><line x1="17" y1="9" x2="22" y2="14"/><line x1="22" y1="9" x2="17" y2="14"/></svg>`,
  x: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
};

let cssОбещание = null;
function подключитьCss() {
  if (cssОбещание) return cssОбещание;
  cssОбещание = new Promise((ok, fail) => {
    if (document.querySelector("link[data-gt]")) { ok(); return; }
    const l = document.createElement("link"); l.rel = "stylesheet"; l.href = CSS_URL; l.dataset.gt = "1";
    const t = setTimeout(() => fail(new Error("css")), 5000);
    l.onload = () => { clearTimeout(t); ok(); };
    l.onerror = () => { clearTimeout(t); cssОбещание = null; fail(new Error("css")); };
    document.head.append(l);
  });
  return cssОбещание;
}
async function загрузитьНастройки(lang, мс = 3000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), мс);
  try {
    const r = await fetch(`/api/intro-config?lang=${lang}&tour=1`, { signal: ctl.signal, credentials: "omit" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
function отметить(event, extra = {}) {
  try {
    const body = JSON.stringify({ event, device: телефон() ? "mobile" : "desktop", lang: язык(), ...extra });
    navigator.sendBeacon ? navigator.sendBeacon("/api/intro-stat", new Blob([body], { type: "application/json" }))
      : fetch("/api/intro-stat", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => { });
  } catch { }
}
const фото = (p, w = 480) => p?.img ? p.img.replace(/w=\d+/, "w=" + w) : "";
const картинка = (p, w = 480) => фото(p, w) ? `<img src="${экран(фото(p, w))}" alt="" decoding="async">` : `<div class="gt-ris">${РИС[(p?._ris || 0) % РИС.length]}</div>`;

// ========================================================================
//  ПРОИГРЫВАТЕЛЬ
// ========================================================================
export async function openTour(opts = {}) {
  if (document.querySelector(".gt")) return null;
  const lang = язык();
  try { await подключитьCss(); } catch { return null; }
  let cfg = opts.cfg || null;
  if (!cfg) { try { cfg = await загрузитьНастройки(lang); } catch { cfg = {}; } }
  if (opts.draft) cfg = { ...cfg, ...opts.draft };
  return играть(cfg, lang, opts);
}

function играть(cfg, lang, opts) {
  const ui = UI[lang];
  const каталог = cfg.tour && cfg.tour.cats && Object.keys(cfg.tour.cats).length ? cfg.tour : демоКаталог();
  const список = (Array.isArray(cfg.scenes) && cfg.scenes.length ? cfg.scenes : СЦЕНЫ_ПО_УМОЛЧАНИЮ.map(id => ({ id, on: true, k: 1 })))
    .filter(s => s.on !== false && СЦЕНЫ[s.id]);
  const текст = (id) => {
    const св = cfg.tour_texts?.[lang]?.[id] || {};
    return [св.t || ТЕКСТЫ_ТУРА[lang][id][0], св.d || ТЕКСТЫ_ТУРА[lang][id][1]];
  };
  const calm = меньшеДвижения();
  const mobile = телефон();
  const цена = ЦЕНА[lang];

  // ---------- каркас ----------
  const root = узел("div", "gt" + (calm ? " gt-calm" : "") + (mobile ? " gt-mobile" : ""));
  root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true"); root.setAttribute("aria-label", ui.tour);
  root.innerHTML = `
    <div class="gt-stage"><div class="gt-cam"><div class="gt-page"></div></div></div>
    <div class="gt-fx" aria-hidden="true"><div class="gt-spot"></div><div class="gt-cursor"><svg viewBox="0 0 24 24" width="26" height="26"><path d="M5 3l14 8-6 1.6L10 19z" fill="#16203a" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg><i></i></div></div>
    <div class="gt-cap" aria-live="polite"><span class="gt-cap-n"></span><b class="gt-cap-t"></b><span class="gt-cap-d"></span></div>
    <button type="button" class="gt-skip">${экран(ui.skip)} ${IC.x}</button>
    <div class="gt-bar">
      <div class="gt-ctl">
        <button type="button" class="gt-b gt-prev" aria-label="${экран(ui.back)}" title="${экран(ui.back)}">${IC.prev}</button>
        <button type="button" class="gt-b gt-pp" aria-label="${экран(ui.pause)}" title="${экран(ui.pause)}">${IC.pause}</button>
        <button type="button" class="gt-b gt-next" aria-label="${экран(ui.next)}" title="${экран(ui.next)}">${IC.next}</button>
        <button type="button" class="gt-b gt-snd" aria-label="${экран(ui.sound)}" title="${экран(ui.sound)}" hidden>${IC.mute}</button>
      </div>
      <ol class="gt-chap"></ol>
      <button type="button" class="btn-primary gt-go">${экран(ui.shop)}</button>
    </div>`;
  const $ = (s, r = root) => r.querySelector(s);
  const page = $(".gt-page"), cam = $(".gt-cam"), spot = $(".gt-spot"), cursor = $(".gt-cursor");
  const chap = $(".gt-chap");
  список.forEach((s, i) => {
    const li = узел("li", "", `<button type="button" title="${экран(текст(s.id)[0])}"><i></i><span>${экран(текст(s.id)[0])}</span></button>`);
    li.querySelector("button").addEventListener("click", () => перейти(i));
    chap.append(li);
  });

  // ---------- аудио (музыка/озвучка, если загружена) ----------
  let аудио = null;
  if (cfg.audio_url) {
    аудио = new Audio(cfg.audio_url); аудио.loop = !!cfg.audio_loop; аудио.muted = true; аудио.preload = "auto";
    const b = $(".gt-snd"); b.hidden = false;
    b.addEventListener("click", () => {
      аудио.muted = !аудио.muted; b.innerHTML = аудио.muted ? IC.mute : IC.vol;
      if (!аудио.muted) { аудио.play().catch(() => { }); отметить("sound_on"); }
    });
  }

  // ---------- часы сцены ----------
  let индекс = -1, прошло = 0, пред = 0, кадр = 0, пауза = false, закрыт = false;
  let метки = [], длит = 0, следМ = 0, твины = [];
  function тик(now) {
    кадр = requestAnimationFrame(тик);
    const dt = пред ? Math.min(100, now - пред) : 0; пред = now;
    if (пауза || закрыт || индекс < 0) return;
    прошло += dt;
    while (следМ < метки.length && метки[следМ].t <= прошло) { try { метки[следМ].fn(); } catch (e) { console.warn("[tour]", e); } следМ++; }
    твины.forEach(т => { if (прошло >= т.t && !т.готов) { const p = Math.min(1, (прошло - т.t) / т.d); try { т.fn(p); } catch { } if (p >= 1) т.готов = true; } });
    const li = chap.children[индекс];
    if (li) li.style.setProperty("--p", Math.min(1, прошло / длит).toFixed(3));
    if (прошло >= длит) { if (индекс < список.length - 1) перейти(индекс + 1); else конец("completed"); }
  }
  function поставитьПаузу(да) {
    пауза = да;
    root.classList.toggle("gt-paused", да);
    root.getAnimations({ subtree: true }).forEach(a => { try { да ? a.pause() : a.play(); } catch { } });
    const b = $(".gt-pp"); b.innerHTML = да ? IC.resume : IC.pause; b.setAttribute("aria-label", да ? ui.play : ui.pause); b.title = да ? ui.play : ui.pause;
    if (аудио && !аудио.muted) { да ? аудио.pause() : аудио.play().catch(() => { }); }
  }
  let пользовательскаяПауза = false;
  $(".gt-pp").addEventListener("click", () => { пользовательскаяПауза = !пауза; поставитьПаузу(!пауза); });
  const наВидимость = () => { if (document.hidden) поставитьПаузу(true); else if (!пользовательскаяПауза) поставитьПаузу(false); };
  document.addEventListener("visibilitychange", наВидимость);

  // ---------- инструменты сцен ----------
  const сейчасКам = { s: 1, x: 0, y: 0 }, сейчасСкролл = { y: 0 };
  function ctxСцены(k) {
    const K = Math.max(.5, Math.min(2, Number(k) || 1));
    const at = (t, fn) => метки.push({ t: t * K, fn });
    const tween = (t, d, fn) => твины.push({ t: t * K, d: d * K, fn });
    const q = (s) => typeof s === "function" ? s() : typeof s === "string" ? page.querySelector(s) : s;
    const ctx = {
      K, ui, lang, mobile, цена, каталог, at, tween, q, root, page,
      end: (t) => { длит = t * K; },
      // курсор подъезжает к элементу и «нажимает»
      click(sel, t, fn, { move = 650, press = true } = {}) {
        at(Math.max(0, t - move), () => ctx.moveTo(sel, move));
        at(t, () => { const el = q(sel); if (press) ctx.press(el); fn && fn(el); });
      },
      moveTo(sel, d = 600) {
        const el = q(sel); if (!el) return;
        const r = el.getBoundingClientRect(), R = root.getBoundingClientRect();
        const x = r.left - R.left + r.width * .55, y = r.top - R.top + r.height * .55;
        cursor.classList.add("on");
        if (calm) { cursor.style.transform = `translate(${x}px,${y}px)`; return; }
        const из = cursor.style.transform || `translate(${R.width * .6}px,${R.height * .7}px)`;
        cursor.animate([{ transform: из }, { transform: `translate(${x}px,${y}px)` }], { duration: d * K * .9, easing: "cubic-bezier(.55,0,.25,1)", fill: "forwards" });
        cursor.style.transform = `translate(${x}px,${y}px)`;
      },
      press(el) {
        cursor.classList.remove("tap"); void cursor.offsetWidth; cursor.classList.add("tap");
        if (el) { el.classList.remove("gt-pressed"); void el.offsetWidth; el.classList.add("gt-pressed"); setTimeout(() => el.classList.remove("gt-pressed"), 260); }
      },
      hideCursor() { cursor.classList.remove("on"); },
      // подсветка рамкой
      spot(sel, t, d = 1400, pad = 6) {
        at(t, () => {
          const el = q(sel); if (!el) return;
          const r = el.getBoundingClientRect(), R = root.getBoundingClientRect();
          Object.assign(spot.style, { left: (r.left - R.left - pad) + "px", top: (r.top - R.top - pad) + "px", width: (r.width + pad * 2) + "px", height: (r.height + pad * 2) + "px" });
          spot.classList.remove("on"); void spot.offsetWidth; spot.classList.add("on");
        });
        at(t + d, () => spot.classList.remove("on"));
      },
      // «камера»: приблизить элемент / вернуть
      zoom(sel, s, t, d = 900) {
        at(t, () => {
          const el = q(sel); if (!el || calm) return;
          const r = el.getBoundingClientRect(), R = root.getBoundingClientRect();
          const cx = (r.left - R.left + r.width / 2 - сейчасКам.x) / сейчасКам.s, cy = (r.top - R.top + r.height / 2 - сейчасКам.y) / сейчасКам.s;
          const x = R.width / 2 - cx * s, y = R.height * .44 - cy * s;
          камера(s, x, y, d * K);
        });
      },
      unzoom(t, d = 800) { at(t, () => камера(1, 0, 0, d * K)); },
      // прокрутка «страницы» к элементу
      scroll(sel, t, d = 900, отступ = 90) {
        at(t, () => {
          const el = q(sel); if (!el) return;
          const r = el.getBoundingClientRect(), R = root.getBoundingClientRect();
          const цель = Math.max(0, сейчасСкролл.y + (r.top - R.top) / сейчасКам.s - отступ);
          прокрутка(цель, d * K);
        });
      },
      type(sel, текст, t, шаг = 70) {
        [...текст].forEach((_, i) => at(t + i * шаг, () => { const el = q(sel); if (el) { el.value = текст.slice(0, i + 1); el.dispatchEvent(new Event("gt-input")); } }));
        return t + текст.length * шаг;
      },
      toast(text, t, тип = "") {
        at(t, () => {
          let box = page.querySelector(".s-toasts"); if (!box) { box = узел("div", "s-toasts"); page.append(box); }
          const el = узел("div", "s-toast " + тип); el.textContent = text; box.append(el);
          setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .3s"; setTimeout(() => el.remove(), 300); }, 2400 * K);
        });
      },
      mark(sel, cls, t, on = true) { at(t, () => { const el = q(sel); if (el) el.classList.toggle(cls, on); }); },
      set(sel, html, t) { at(t, () => { const el = q(sel); if (el) el.innerHTML = html; }); },
    };
    return ctx;
  }
  function камера(s, x, y, d) {
    const из = `translate(${сейчасКам.x}px,${сейчасКам.y}px) scale(${сейчасКам.s})`, в = `translate(${x}px,${y}px) scale(${s})`;
    Object.assign(сейчасКам, { s, x, y });
    if (calm) { cam.style.transform = в; return; }
    cam.animate([{ transform: из }, { transform: в }], { duration: d, easing: "cubic-bezier(.65,0,.25,1)", fill: "forwards" });
    cam.style.transform = в;
  }
  function прокрутка(y, d) {
    const из = `translateY(${-сейчасСкролл.y}px)`, в = `translateY(${-y}px)`;
    сейчасСкролл.y = y;
    if (calm) { page.style.transform = в; return; }
    page.animate([{ transform: из }, { transform: в }], { duration: d, easing: "cubic-bezier(.65,0,.25,1)", fill: "forwards" });
    page.style.transform = в;
  }

  // ---------- переход между сценами ----------
  async function перейти(i) {
    if (закрыт || i < 0 || i >= список.length) return;
    const первая = индекс < 0;
    индекс = i;
    [...chap.children].forEach((li, k) => { li.classList.toggle("done", k < i); li.classList.toggle("on", k === i); li.style.setProperty("--p", k < i ? 1 : 0); });
    метки = []; твины = []; следМ = 0; прошло = 0; длит = 6000;
    const s = список[i];
    const [t, d] = текст(s.id);
    $(".gt-cap-n").textContent = ui.stepOf(i + 1, список.length);
    $(".gt-cap-t").textContent = t;
    $(".gt-cap-d").textContent = d;
    const cap = $(".gt-cap"); cap.classList.remove("in"); void cap.offsetWidth; cap.classList.add("in");
    if (!первая && !calm) { page.classList.add("gt-out"); await ждать(260); if (индекс !== i) return; }
    root.getAnimations({ subtree: true }).forEach(a => { if (a.effect?.target && (a.effect.target === cam || a.effect.target === page || a.effect.target === cursor)) a.cancel(); });
    Object.assign(сейчасКам, { s: 1, x: 0, y: 0 }); сейчасСкролл.y = 0;
    cam.style.transform = ""; page.style.transform = ""; spot.classList.remove("on");
    page.className = "gt-page gt-in sc-" + s.id; page.innerHTML = ""; root.dataset.scene = s.id;
    const ctx = ctxСцены(s.k);
    try { СЦЕНЫ[s.id](ctx, page); } catch (e) { console.warn("[tour] сцена", s.id, e); длит = 1000; }
    if (!opts.preview) отметить("scene_" + s.id);
    $(".gt-prev").disabled = i === 0;
    if (пауза) поставитьПаузу(true);
  }
  $(".gt-prev").addEventListener("click", () => перейти(индекс - 1));
  $(".gt-next").addEventListener("click", () => индекс < список.length - 1 ? перейти(индекс + 1) : конец("completed"));
  $(".gt-skip").addEventListener("click", () => конец("skipped"));
  $(".gt-go").addEventListener("click", () => { if (!opts.preview) отметить("start_shopping"); конец(индекс >= список.length - 1 ? "completed" : "skipped"); });

  function клавиши(e) {
    if (закрыт) return;
    if (e.key === "Escape") { e.preventDefault(); конец("skipped"); }
    else if (e.key === "ArrowRight") { e.preventDefault(); $(".gt-next").click(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); перейти(индекс - 1); }
    else if (e.key === " " && !(e.target.closest && e.target.closest("button"))) { e.preventDefault(); $(".gt-pp").click(); }
    else if (e.key === "Tab") {
      const можно = [...root.querySelectorAll(".gt-skip, .gt-bar button:not([hidden]):not(:disabled)")];
      const k = можно.indexOf(document.activeElement); e.preventDefault();
      можно[(k + (e.shiftKey ? -1 : 1) + можно.length) % можно.length]?.focus();
    }
  }
  document.addEventListener("keydown", клавиши, true);

  // ---------- закрытие: экскурсия тает, сайт проявляется ----------
  const былФокус = document.activeElement;
  function конец(причина) {
    if (закрыт) return; закрыт = true;
    if (!opts.preview) отметить(причина === "completed" ? "completed" : "skipped", { at_sec: индекс + 1 });
    записать(КЛЮЧ_СМОТРЕЛ, { v: Number(cfg.seen_version) || 1, at: Date.now() });
    document.removeEventListener("keydown", клавиши, true);
    document.removeEventListener("visibilitychange", наВидимость);
    cancelAnimationFrame(кадр);
    try { аудио && аудио.pause(); } catch { }
    const html = document.documentElement;
    html.classList.remove("gt-lock"); html.classList.add("gt-reveal");
    root.classList.add("gt-bye");
    setTimeout(() => { root.remove(); setTimeout(() => html.classList.remove("gt-reveal"), 1200); try { былФокус?.focus?.({ preventScroll: true }); } catch { } opts.onEnd && opts.onEnd(причина); }, calm ? 120 : 520);
  }

  document.body.append(root);
  document.documentElement.classList.add("gt-lock");
  if (!opts.preview) отметить("tour_open");
  if (аудио) аудио.play().catch(() => { });
  перейти(Math.max(0, Math.min(список.length - 1, Number(opts.start) || 0)));
  кадр = requestAnimationFrame(тик);
  requestAnimationFrame(() => { try { $(".gt-pp").focus({ preventScroll: true }); } catch { } });
  return { close: () => конец("skipped") };
}

// ========================================================================
//  РАЗМЕТКА В СТИЛЕ САЙТА (настоящие классы site.css / glassos-site.css)
// ========================================================================
function шапка(ui, { вошёл = false } = {}) {
  return `<header class="site-header"><div class="site-header-inner">
    <button type="button" class="site-burger">${IC.burger}<span>${экран(ui.menu)}</span></button>
    <a class="site-logo"><svg class="gm-znak" width="36" height="36" viewBox="0 0 512 512">${ЗНАК("hd").replace(/^<svg[^>]*>|<\/svg>$/g, "")}</svg><span class="site-logo-text">GENERAL<span>MODERN</span></span></a>
    <nav class="site-nav"><a class="site-nav-link active gt-n-cat">${экран(ui.catalog)}</a>${вошёл ? `<a class="site-nav-link">Видео</a><a class="site-nav-link gt-n-cab">${экран(ui.cabinet)}</a>` : ""}<button type="button" class="site-nav-link gm-howto"><span class="gm-howto-ic">${IC.play}</span><span>${экран(ui.howTo)}</span></button></nav>
    <div class="site-header-right"><button type="button" class="btn-primary gt-h-order" style="padding:8px 16px;font-size:13px;font-weight:600">${IC.cart} ${экран(ui.order)}</button>
      <div class="site-menu"><a class="site-tg-link gt-h-tg">${IC.tg}</a><button type="button" class="theme-toggle gt-h-theme">${IC.sun}</button><div class="lang-switcher"><button type="button" class="lang-btn gt-h-lang"><span>${язык().toUpperCase()}</span></button></div>
      ${вошёл ? `<button type="button" class="btn-navy" style="padding:8px 16px;font-size:13px">${экран(ui.cabinet)}</button>` : `<button type="button" class="btn-primary gt-h-login" style="padding:9px 18px;font-size:13px">${экран(ui.login)}</button>`}</div>
    </div></div></header>`;
}
function карточка(p, ui, { вошёл = false, заказ = false } = {}) {
  const st = p.status === "in_stock" ? ["есть", ui.inStock, "in-stock"] : p.status === "soon" ? ["скоро", ui.soon, "soon"] : ["нет", ui.none, "out-stock"];
  const кнопка = заказ
    ? (p.status === "in_stock" ? `<div style="display:flex;align-items:center;gap:8px;width:100%"><span style="font-size:13px;color:var(--muted)">Кол-во:</span><input class="search-input gt-qty" placeholder="0" readonly style="flex:1;text-align:center;padding:9px;font-weight:600"></div>` : `<button class="btn-add-cart soon-btn" disabled>${экран(st[1])}</button>`)
    : (p.status === "in_stock" ? `<button class="btn-add-cart ${вошёл ? "available" : "need-login"}">${экран(вошёл ? ui.toOrder : ui.loginToOrder)}</button>` : `<button class="btn-add-cart ${p.status === "soon" ? "soon-btn" : "unavailable"}" disabled>${экран(st[1])}</button>`);
  return `<div class="product-card" data-code="${экран(p.code)}">
    <div class="product-card-img" style="--фото:url('${экран(фото(p, 64))}')">${картинка(p)}
      ${p.photos > 0 ? `<span class="gt-pb" style="position:absolute;left:8px;bottom:8px;background:rgba(0,0,0,.62);color:#fff;font-size:12px;font-weight:600;padding:3px 8px;border-radius:20px;z-index:2">📷 ${p.photos}</span>` : ""}
      <div class="product-badges"><span class="product-badge старый ${st[2]}">${экран(st[1])}</span>${p.is_new ? `<span class="product-badge new-badge">${экран(ui.isNew)}</span>` : ""}</div></div>
    <div class="product-card-body"><div class="product-name">${экран(p.name)}</div><div class="product-category">${экран(p.category || "")}</div>
      ${заказ ? "" : `<div class="product-sku"><button type="button" class="sku-copy"><span class="sku-code">${экран(p.code)}</span>${IC.copy}</button>${p.sku ? `<span class="sku-vendor">Арт.: ${экран(p.sku)}</span>` : ""}</div>
      <div class="product-status ${st[0]}"><span class="status-dot"></span><span>${экран(st[1])}</span></div>`}
      <div class="product-card-footer">${кнопка}</div></div></div>`;
}
function главная(ctx, page, { кат = null, товары = null, вошёл = false } = {}) {
  const { ui, каталог } = ctx;
  const все = Object.entries(каталог.cats).flatMap(([c, l]) => l.map(p => ({ ...p, category: c })));
  const показ = товары || все.slice(0, 12);
  page.innerHTML = шапка(ui, { вошёл }) + `<div class="site-main"><div class="cat-layout">
    <aside class="cat-rail"><div class="cat-rail-title">${экран(ui.cats)}</div>
      <button type="button" class="rail-item${кат ? "" : " active"}" data-cat=""><span>${экран(ui.all)}</span><span class="rail-count">${каталог.total || все.length}</span></button>
      ${каталог.categories.map(c => `<button type="button" class="rail-item${кат === c.name ? " active" : ""}" data-cat="${экран(c.name)}"><span>${экран(c.name)}</span><span class="rail-count">${c.count}</span></button>`).join("")}
    </aside>
    <div class="cat-main">
      <section class="feature-tile${кат ? " gt-hidden" : ""}"><div class="feature-text"><h1>${экран(ui.heroTitle)}</h1><p>${экран(ui.heroSub)}</p><div class="feature-btns"><button class="btn-primary">${экран(ui.heroCta)}</button></div></div><div class="feature-img"><div class="hero-znak">${ЗНАК("hz").replace("<svg ", '<svg width="150" height="150" ')}</div></div></section>
      <div class="catalog-toolbar"><div class="catalog-count">${экран(ui.shown(показ.length, кат ? 0 : каталог.total))}</div>
        <div class="gm-search gm-search-cat"><div class="gm-search-field"><input class="search-input gt-search" placeholder="${экран(ui.searchPh)}" readonly></div><button type="button" class="gm-search-btn">${IC.search}</button></div></div>
      <div class="product-grid">${показ.map(p => карточка(p, ui, { вошёл })).join("")}</div>
    </div></div></div>`;
  return все;
}
const заменитьСетку = (ctx, page, список, кат) => {
  const g = page.querySelector(".product-grid"); if (!g) return;
  g.classList.remove("gt-swap"); void g.offsetWidth; g.classList.add("gt-swap");
  g.innerHTML = список.map(p => карточка(p, ctx.ui)).join("");
  const c = page.querySelector(".catalog-count"); if (c) c.textContent = ctx.ui.shown(список.length, 0);
  page.querySelector(".feature-tile")?.classList.toggle("gt-hidden", !!кат);
  page.querySelectorAll(".rail-item").forEach(r => r.classList.toggle("active", (r.dataset.cat || "") === (кат || "")));
};
const изКат = (ctx, имя, n = 8) => (ctx.каталог.cats[имя] || Object.values(ctx.каталог.cats)[0] || []).slice(0, n).map(p => ({ ...p, category: имя }));
const перваяКат = (ctx, i) => Object.keys(ctx.каталог.cats)[i] || Object.keys(ctx.каталог.cats)[0];

// Телефон с перепиской в боте (общий для сцен 5, 7, 8, 10, 12)
function телефонБот(подпись = "бот") {
  return `<div class="gt-phone"><div class="gt-ph-top"><span class="gt-ph-av">${ЗНАК("pa")}</span><div><b>GENERAL MODERN</b><small>${экран(подпись)}</small></div></div><div class="gt-ph-msgs"></div><div class="gt-ph-kb"></div></div>`;
}
function сообщение(ctx, html, { я = false, t, кнопки = null } = {}) {
  ctx.at(t, () => {
    const box = ctx.page.querySelector(".gt-ph-msgs"); if (!box) return;
    const m = узел("div", "gt-msg" + (я ? " me" : ""), html + (кнопки ? `<div class="gt-msg-btns">${кнопки.map(b => `<span>${экран(b)}</span>`).join("")}</div>` : ""));
    box.append(m);
    while (box.children.length > 6) box.firstElementChild.remove();
  });
}

// ========================================================================
//  СЦЕНЫ
// ========================================================================
const СЦЕНЫ = {
  // 1 — сайт собирается и курсор обходит главное
  home(ctx, page) {
    page.classList.add("gt-build");
    главная(ctx, page);
    const sel = ctx.mobile ? [".site-burger", ".gt-h-order", ".cat-rail", ".gm-search-cat", ".product-grid"]
      : [".gt-n-cat", ".gm-howto", ".gt-h-order", ".gt-h-tg", ".gt-h-lang", ".gt-h-login", ".cat-rail", ".gm-search-cat"];
    ctx.at(1400, () => page.classList.remove("gt-build"));
    sel.forEach((s, i) => { ctx.spot(s, 1700 + i * 750, 700); if (i < 6) ctx.at(1700 + i * 750, () => ctx.moveTo(s, 500)); });
    const t = 1700 + sel.length * 750;
    ctx.scroll(".product-grid", t, 1200, 40);
    ctx.end(t + 2200);
  },

  // 2 — категории: настоящие товары из каждой
  cats(ctx, page) {
    главная(ctx, page);
    let t = 600;
    [0, 1, 3].forEach((n, k) => {
      const имя = перваяКат(ctx, n);
      const sel = `.rail-item[data-cat="${CSS.escape(имя)}"]`;
      ctx.click(sel, t + 700, () => заменитьСетку(ctx, page, изКат(ctx, имя), имя));
      ctx.spot(".product-grid", t + 1100, 1300, 4);
      t += 2700;
    });
    ctx.spot(".catalog-count", t - 600, 1200);
    ctx.end(t + 600);
  },

  // 3 — поиск: название, код в любом написании, английское слово
  search(ctx, page) {
    const все = главная(ctx, page);
    const wrap = () => page.querySelector(".gm-search-cat");
    ctx.click(".gm-search-btn", 900, () => wrap()?.classList.add("open"));
    ctx.zoom(".catalog-toolbar", ctx.mobile ? 1.08 : 1.2, 1500, 800);
    const найти = (слово, фильтр) => () => { const r = все.filter(фильтр).slice(0, 8); заменитьСетку(ctx, page, r.length ? r : все.slice(0, 4), "x"); page.querySelector(".feature-tile")?.classList.add("gt-hidden"); };
    const лапка = { ru: "лапка", uz: "lapka", en: "lapka" }[ctx.lang];
    const кат0 = перваяКат(ctx, 0), кат3 = перваяКат(ctx, 3);
    let t = ctx.type(".gt-search", лапка, 1800, 110);
    ctx.at(t + 100, найти(лапка, p => p.category === кат0));
    ctx.unzoom(t + 300);
    ctx.spot(".product-grid", t + 600, 1300, 4);
    // код
    const цель = (ctx.каталог.cats[кат0] || [])[0] || все[0];
    const коротко = String(цель.code).toLowerCase().replace(/-0*/, "");
    ctx.at(t + 2200, () => { const i = page.querySelector(".gt-search"); if (i) i.value = ""; });
    ctx.zoom(".catalog-toolbar", ctx.mobile ? 1.08 : 1.2, t + 2200, 700);
    t = ctx.type(".gt-search", коротко, t + 2500, 140);
    ctx.at(t + 100, найти(коротко, p => p.code === цель.code));
    ctx.unzoom(t + 300);
    ctx.zoom(`.product-card[data-code="${CSS.escape(цель.code)}"]`, ctx.mobile ? 1.2 : 1.35, t + 700, 900);
    ctx.unzoom(t + 2600);
    // английское слово
    ctx.at(t + 3300, () => { const i = page.querySelector(".gt-search"); if (i) i.value = ""; });
    t = ctx.type(".gt-search", "needle", t + 3500, 110);
    ctx.at(t + 100, найти("needle", p => p.category === кат3));
    ctx.spot(".product-grid", t + 400, 1400, 4);
    ctx.end(t + 2300);
  },

  // 4 — карточка: фото, галерея, наличие, код
  card(ctx, page) {
    const имя = перваяКат(ctx, 0);
    const товары = изКат(ctx, имя, 8);
    главная(ctx, page, { кат: имя, товары });
    const p = товары.find(x => x.photos > 1) || товары[0];
    const c = `.product-card[data-code="${CSS.escape(p.code)}"]`;
    ctx.zoom(c, ctx.mobile ? 1.15 : 1.35, 700, 1000);
    ctx.spot(`${c} .gt-pb`, 1900, 1000, 4);
    ctx.spot(`${c} .product-status`, 3000, 1000, 4);
    ctx.click(`${c} .sku-copy`, 4400, (el) => { el?.classList.add("copied"); });
    ctx.toast(ctx.ui.copied + p.code, 4500, "ok");
    ctx.unzoom(5600);
    // галерея
    ctx.click(`${c} .product-card-img img, ${c} .gt-ris`, 6600, () => {
      const снимки = (p.imgs && p.imgs.length ? p.imgs : [p.img]).slice(0, 4);
      const g = узел("div", "gt-gal", `<div class="gt-gal-img">${снимки.map((u, i) => u ? `<img src="${экран(u)}" alt="" class="${i ? "" : "on"}">` : `<div class="gt-ris on">${РИС[(p._ris || 0) % РИС.length]}</div>`).join("")}</div>
        <button class="gt-gal-a l">‹</button><button class="gt-gal-a r">›</button><div class="gt-gal-c">${экран(p.name)} · <b>1</b> / ${снимки.length}</div>`);
      page.append(g); requestAnimationFrame(() => g.classList.add("open"));
      g.dataset.n = снимки.length;
    }, { move: 600 });
    [1, 2].forEach((k) => ctx.click(".gt-gal-a.r", 7900 + k * 1100, () => {
      const g = page.querySelector(".gt-gal"); if (!g) return;
      const imgs = g.querySelectorAll(".gt-gal-img > *"); const n = imgs.length; if (n < 2) return;
      const i = Math.min(n - 1, k); imgs.forEach((im, j) => im.classList.toggle("on", j === i)); g.querySelector(".gt-gal-c b").textContent = i + 1;
    }, { move: 400 }));
    ctx.at(10800, () => page.querySelector(".gt-gal")?.classList.remove("open"));
    ctx.at(11000, () => ctx.hideCursor());
    ctx.end(11800);
  },

  // 5 — регистрация через бота (демо-номер), потом вход с кодом
  auth(ctx, page) {
    главная(ctx, page);
    page.insertAdjacentHTML("beforeend", `<div class="s-overlay open gt-auth"><div class="s-modal"><div class="s-modal-head"><h2>Войти / Зарегистрироваться</h2><button class="s-modal-close">${IC.x}</button></div>
      <div class="s-modal-body"><div class="gt-auth-form">
        <div class="s-form gt-f1"><div class="s-field"><label class="s-label">Телефон</label><input class="s-input gt-phone-in" placeholder="+998 90 123 45 67" readonly></div>
          <div class="s-hint">Номер должен быть открыт в Telegram — на него придёт подтверждение.</div><button class="btn-primary gt-cont" style="width:100%;margin-top:12px">Продолжить</button></div>
        <div class="s-form gt-f2" hidden><div class="verify-steps">
          <div class="verify-step active gt-v1"><div class="verify-step-num">1</div><div class="verify-step-body"><strong>Откройте Telegram-бот</strong><p>@generalmodernbot</p></div></div>
          <div class="verify-step gt-v2"><div class="verify-step-num">2</div><div class="verify-step-body"><strong>Поделитесь номером в боте</strong><p>Кнопка «📱 Поделиться номером»</p></div></div>
          <div class="verify-step gt-v3"><div class="verify-step-num">3</div><div class="verify-step-body"><strong>Задайте пароль на сайте</strong><p>Минимум 6 символов</p></div></div></div>
          <div class="gt-pass" hidden><div class="s-field"><label class="s-label">Придумайте пароль (мин. 6 символов)</label><input class="s-input gt-pw1" type="password" readonly></div><div class="s-field"><label class="s-label">Повторите пароль</label><input class="s-input gt-pw2" type="password" readonly></div><button class="btn-primary gt-fin" style="width:100%;margin-top:6px">Завершить регистрацию</button></div>
        </div>
        <div class="s-form gt-f3" hidden><div class="gm-code-head"><div class="gm-code-title">Подтвердите личность</div><div class="s-hint">Код из 6 цифр отправлен в Telegram. Он действует 5 минут.</div></div>
          <div class="gm-code">${[0, 1, 2, 3, 4, 5].map(i => `<input class="gm-code-cell" readonly data-i="${i}">`).join("")}</div></div>
      </div></div></div></div>${телефонБот()}`);
    let t = ctx.type(".gt-phone-in", "+998 90 000 00 00", 900, 55);
    ctx.click(".gt-cont", t + 600, () => { page.querySelector(".gt-f1").hidden = true; page.querySelector(".gt-f2").hidden = false; });
    t += 1300;
    ctx.mark(".gt-phone", "show", t);
    сообщение(ctx, "👋 Добро пожаловать!<br>Чтобы найти вас в системе, поделитесь номером телефона.", { t: t + 500 });
    ctx.at(t + 500, () => { const kb = page.querySelector(".gt-ph-kb"); if (kb) kb.innerHTML = `<span class="gt-kb-b gt-share">📱 Поделиться номером</span>`; });
    ctx.click(".gt-share", t + 1900, () => { page.querySelector(".gt-ph-kb").innerHTML = ""; });
    сообщение(ctx, "📱 +998 90 000 00 00", { я: true, t: t + 2100 });
    сообщение(ctx, "✅ Номер подтверждён!", { t: t + 2700, кнопки: ["🔐 Задать пароль на сайте"] });
    ctx.at(t + 2900, () => { ["gt-v1", "gt-v2"].forEach(c => { const v = page.querySelector("." + c); v?.classList.remove("active"); v?.classList.add("done"); }); page.querySelector(".gt-v3")?.classList.add("active"); });
    ctx.mark(".gt-phone", "show", t + 3600, false);
    ctx.at(t + 3800, () => { page.querySelector(".gt-pass").hidden = false; });
    t = ctx.type(".gt-pw1", "••••••••", t + 4200, 60);
    t = ctx.type(".gt-pw2", "••••••••", t + 200, 60);
    ctx.click(".gt-fin", t + 600);
    ctx.toast("Регистрация завершена! Добро пожаловать.", t + 700, "ok");
    // вход с нового устройства
    ctx.at(t + 2000, () => { page.querySelector(".gt-f2").hidden = true; page.querySelector(".gt-f3").hidden = false; });
    "482915".split("").forEach((d, i) => ctx.at(t + 2600 + i * 160, () => { const c = page.querySelector(`.gm-code-cell[data-i="${i}"]`); if (c) { c.value = d; c.classList.add("filled"); } }));
    ctx.toast("Вход выполнен", t + 3800, "ok");
    ctx.end(t + 4800);
  },

  // 6 — заказ на сайте: количество, список, отправка
  order(ctx, page) {
    const имя = перваяКат(ctx, 0);
    const товары = изКат(ctx, имя, 6);
    page.innerHTML = шапка(ctx.ui, { вошёл: true }) + `<div class="site-main"><div class="order-page">
      <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap"><button class="s-tab active gt-t1">➕ Товары</button><button class="s-tab gt-t2">🧾 Мои заказанные товары (<b>0</b>)</button></div>
      <div class="gt-list"><div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px"><select class="search-input" style="max-width:220px"><option>${экран(имя)}</option></select><input class="search-input" placeholder="Поиск товара…" readonly style="max-width:260px"></div>
        <div class="product-grid">${товары.map(p => карточка({ ...p, status: p.status === "soon" ? "soon" : "in_stock" }, ctx.ui, { заказ: true })).join("")}</div>
        <button class="btn-primary gt-goorder" style="position:sticky;bottom:16px;width:100%;margin-top:14px;padding:13px;font-weight:700;display:none">Перейти к заказу (<b>0</b>) →</button></div>
      <div class="cabinet-card gt-review" style="padding:16px" hidden><h2 style="font-size:18px;font-weight:700;margin-bottom:12px;color:var(--text)">Мои заказанные товары</h2><div class="gt-rows"></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px"><button class="btn-ghost" style="padding:10px 18px;font-weight:600">➕ Добавить товары</button><button class="btn-primary gt-send" style="padding:10px 22px;font-weight:700;flex:1;min-width:160px">Отправить заказ</button></div></div>
    </div></div>`;
    const выбрано = [];
    const qty = (i) => page.querySelectorAll(".gt-qty")[i];
    const обновить = () => {
      page.querySelector(".gt-t2 b").textContent = выбрано.length;
      const g = page.querySelector(".gt-goorder"); g.style.display = выбрано.length ? "block" : "none"; g.querySelector("b").textContent = выбрано.length;
    };
    [[0, "2"], [1, "3"], [2, "10"]].forEach(([i, v], k) => {
      ctx.click(() => qty(i), 900 + k * 1500, () => { });
      ctx.type(() => qty(i), v, 1100 + k * 1500, 160);
      ctx.at(1400 + k * 1500, () => { выбрано.push([товары[i], v]); обновить(); });
    });
    ctx.spot(".gt-t2", 5400, 900);
    ctx.click(".gt-goorder", 6300, () => {
      page.querySelector(".gt-list").hidden = true; page.querySelector(".gt-review").hidden = false;
      page.querySelector(".gt-t1").classList.remove("active"); page.querySelector(".gt-t2").classList.add("active");
      page.querySelector(".gt-rows").innerHTML = выбрано.map(([p, v], i) => `<div class="gt-row" data-i="${i}" style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border,#eee)">
        <div style="width:46px;height:46px;border-radius:10px;background:var(--bg2,#f3f5f8);overflow:hidden;flex-shrink:0;display:grid;place-items:center">${картинка(p, 160)}</div>
        <div style="flex:1;min-width:0"><div style="font-weight:600;font-size:14px">${экран(p.name)}</div><div style="display:flex;align-items:center;gap:8px;margin-top:4px"><span style="font-size:13px;color:var(--muted)">Кол-во:</span><input class="search-input gt-rq" value="${v}" readonly style="width:80px;text-align:center;padding:6px"></div></div>
        <button class="cart-item-remove gt-del">${IC.trash}</button></div>`).join("");
    });
    ctx.click(() => page.querySelector('.gt-row[data-i="1"] .gt-rq'), 7800, (el) => { if (el) el.value = "2"; });
    ctx.click(() => page.querySelector('.gt-row[data-i="2"] .gt-del'), 9200, () => { const r = page.querySelector('.gt-row[data-i="2"]'); if (r) { r.classList.add("gt-gone"); setTimeout(() => r.remove(), 350); } });
    ctx.click(".gt-send", 10800, (el) => { if (el) el.textContent = "Отправка…"; });
    ctx.toast("Заказ отправлен! Мы свяжемся с вами.", 11600, "ok");
    ctx.at(11700, () => { const s = page.querySelector(".gt-send"); if (s) s.textContent = "Отправить заказ"; });
    ctx.end(13200);
  },

  // 7 — то же в Telegram-приложении
  tgorder(ctx, page) {
    const товары = изКат(ctx, перваяКат(ctx, 1), 4);
    page.innerHTML = `<div class="gt-split"><div class="gt-side-note"><span class="gt-kicker">Telegram</span><h3>@generalmodernbot</h3><p>🛒 Заказать товары · 🌐 Каталог товаров · 💰 Мой оборот и долг · 🧾 Мои накладные</p></div>${телефонБот("мини-приложение")}</div>`;
    ctx.mark(".gt-phone", "show", 200);
    сообщение(ctx, "Здравствуйте, Демо! 👋 Выберите:", { t: 500, кнопки: ["🛒 Заказать товары", "🌐 Каталог товаров", "💰 Мой оборот и долг", "🧾 Мои накладные"] });
    ctx.click(".gt-msg-btns span", 1900, () => {
      const app = page.querySelector(".gt-ph-msgs");
      app.innerHTML = `<div class="gt-app"><input class="gt-app-s" placeholder="Название или артикул…" readonly>${товары.map((p, i) => `<div class="gt-app-c" data-i="${i}"><div class="gt-app-ph">${картинка(p, 160)}</div><div class="gt-app-b"><b>${экран(p.name)}</b><small>${экран(p.code)} · <span class="ok">Есть в наличии</span></small><div class="gt-app-r"><span class="gt-st"><i>−</i><b>1</b><i class="pl">+</i></span><span class="gt-app-add">В корзину</span></div></div></div>`).join("")}</div>`;
      page.querySelector(".gt-ph-kb").innerHTML = `<span class="gt-app-bar">Корзина: <b>0</b> поз. · <b>0</b> шт.</span>`;
    });
    const корзина = { п: 0, ш: 0 };
    [[0, 2], [1, 3]].forEach(([i, n], k) => {
      const base = 3300 + k * 2300;
      for (let j = 1; j < n; j++) ctx.click(() => page.querySelector(`.gt-app-c[data-i="${i}"] .pl`), base + j * 450, () => { const b = page.querySelector(`.gt-app-c[data-i="${i}"] .gt-st b`); if (b) b.textContent = j + 1; }, { move: 300 });
      ctx.click(() => page.querySelector(`.gt-app-c[data-i="${i}"] .gt-app-add`), base + n * 450 + 300, (el) => {
        if (el) { el.textContent = "✓ Добавлено"; el.classList.add("done"); }
        корзина.п++; корзина.ш += n; const bar = page.querySelector(".gt-app-bar"); if (bar) bar.innerHTML = `Корзина: <b>${корзина.п}</b> поз. · <b>${корзина.ш}</b> шт.`;
      }, { move: 400 });
    });
    ctx.click(".gt-app-bar", 8700, () => {
      page.querySelector(".gt-ph-msgs").innerHTML = `<div class="gt-app"><div class="gt-app-h">Корзина</div>${товары.slice(0, 2).map((p, i) => `<div class="gt-app-c"><div class="gt-app-ph">${картинка(p, 160)}</div><div class="gt-app-b"><b>${экран(p.name)}</b><div class="gt-app-r"><span class="gt-st"><i>−</i><b>${i ? 3 : 2}</b><i>+</i></span><span class="gt-app-x">Убрать</span></div></div></div>`).join("")}<p class="gt-app-note">Цену мы посчитаем и пришлём вам на подтверждение.</p></div>`;
      page.querySelector(".gt-ph-kb").innerHTML = `<span class="gt-app-bar gt-app-send">Отправить заказ</span>`;
    });
    ctx.click(".gt-app-send", 10300, () => { page.querySelector(".gt-ph-msgs").innerHTML = ""; page.querySelector(".gt-ph-kb").innerHTML = ""; });
    сообщение(ctx, "✅ Заказ принят! Он передан администратору и проверяется. Когда накладная будет готова — мы вас уведомим.", { t: 10600 });
    ctx.end(12600);
  },

  // 8 — менеджер ставит цену, клиент правит и подтверждает
  confirm(ctx, page) {
    const т = [...изКат(ctx, перваяКат(ctx, 0), 2), ...изКат(ctx, перваяКат(ctx, 2), 1)];
    const доб = изКат(ctx, перваяКат(ctx, 3), 1)[0];
    const ц = ctx.цена;
    page.innerHTML = `<div class="gt-flow"><span class="gt-fs on" data-s="0">Новый</span><span class="gt-fs" data-s="1">Ждёт подтверждения</span><span class="gt-fs" data-s="2">Подтверждён</span><span class="gt-fs" data-s="3">Оформлен</span></div>
      <div class="gt-split"><div class="gt-panel"><div class="gt-panel-h"><span>Склад · Заказы</span><span class="gt-pill n">новый · с сайта</span></div>
        <div class="gt-panel-b">${т.map((p, i) => `<div class="gt-pr" data-i="${i}"><div class="gt-pr-ph">${картинка(p, 160)}</div><div class="gt-pr-n"><b>${экран(p.name)}</b><small>на складе: ${8 + i * 5}</small></div><span class="gt-pr-q">× ${[2, 3, 10][i]}</span><span class="gt-pr-in"></span></div>`).join("")}
        <button class="btn-primary gt-ask" style="width:100%;margin-top:12px">📤 На подтверждение клиенту</button></div></div>${телефонБот()}</div>`;
    const ф = (s) => ctx.at(s[1], () => page.querySelectorAll(".gt-fs").forEach((e, k) => { e.classList.toggle("on", k === s[0]); e.classList.toggle("done", k < s[0]); }));
    [0, 1, 2].forEach(i => { ctx.click(() => page.querySelector(`.gt-pr[data-i="${i}"] .gt-pr-in`), 900 + i * 900, (el) => el && el.classList.add("f")); ctx.type(() => page.querySelector(`.gt-pr[data-i="${i}"] .gt-pr-in`), ц.replace(/\s*\S+$/, ""), 1000 + i * 900, 50); });
    ctx.click(".gt-ask", 4000);
    ф([1, 4200]);
    ctx.mark(".gt-phone", "show", 4300);
    сообщение(ctx, `🧾 Ваш заказ готов к подтверждению:<br>${т.map((p, i) => `${i + 1}. ${экран(p.name)} — ${[2, 3, 10][i]} × ${ц}`).join("<br>")}<br>💰 Итого: ${ц}<br>Подтвердите заказ:`, { t: 4700, кнопки: ["✅ Подтвердить", "❌ Отказаться"] });
    // правка в приложении «Мои заказы»
    ctx.at(7200, () => {
      page.querySelector(".gt-ph-msgs").innerHTML = `<div class="gt-app"><div class="gt-app-h">Мои заказы <span class="gt-pill w">Проверьте цену</span></div><p class="gt-app-note">Цена готова. Можно поменять количество, убрать лишнее или добавить товары — и подтвердить.</p>
        ${т.map((p, i) => `<div class="gt-app-c" data-i="${i}"><div class="gt-app-ph">${картинка(p, 160)}</div><div class="gt-app-b"><b>${экран(p.name)}</b><small>${ц}</small><div class="gt-app-r"><span class="gt-st"><i class="mi">−</i><b>${[2, 3, 10][i]}</b><i>+</i></span><span class="gt-app-x">Убрать</span></div></div></div>`).join("")}<div class="gt-app-more">➕ Добавить товары</div></div>`;
      page.querySelector(".gt-ph-kb").innerHTML = `<span class="gt-kb-b gt-no">Не подходит</span><span class="gt-kb-b pri gt-yes">Подтвердить</span>`;
    });
    ctx.click(() => page.querySelector('.gt-app-c[data-i="1"] .mi'), 8300, () => { const b = page.querySelector('.gt-app-c[data-i="1"] .gt-st b'); if (b) b.textContent = "2"; }, { move: 450 });
    ctx.click(() => page.querySelector('.gt-app-c[data-i="2"] .gt-app-x'), 9300, () => { const r = page.querySelector('.gt-app-c[data-i="2"]'); r && r.classList.add("gt-gone"); }, { move: 450 });
    ctx.click(".gt-app-more", 10300, (el) => {
      if (!доб || !el) return;
      el.insertAdjacentHTML("beforebegin", `<div class="gt-app-c gt-new"><div class="gt-app-ph">${картинка(доб, 160)}</div><div class="gt-app-b"><b>${экран(доб.name)}</b><small>посчитаем цену</small><div class="gt-app-r"><span class="gt-st"><i>−</i><b>5</b><i>+</i></span></div></div></div>`);
    }, { move: 450 });
    ctx.click(".gt-yes", 11800);
    ctx.at(12000, () => { page.querySelector(".gt-ph-msgs").innerHTML = ""; page.querySelector(".gt-ph-kb").innerHTML = ""; });
    сообщение(ctx, "✅ Подтвердить", { я: true, t: 12100 });
    сообщение(ctx, "✅ Спасибо! Заказ подтверждён — мы готовим накладную.", { t: 12600 });
    ф([2, 12600]);
    ctx.at(12700, () => { const h = page.querySelector(".gt-panel-h .gt-pill"); if (h) { h.className = "gt-pill ok"; h.textContent = "клиент подтвердил"; } });
    ctx.end(14600);
  },

  // 9 — склад: остатки, сборка, коробки, «Оформить»
  stock(ctx, page) {
    const т = [...изКат(ctx, перваяКат(ctx, 0), 2), ...изКат(ctx, перваяКат(ctx, 3), 1)];
    page.innerHTML = `<div class="gt-flow"><span class="gt-fs done">Новый</span><span class="gt-fs done">Ждёт подтверждения</span><span class="gt-fs on">Подтверждён</span><span class="gt-fs">Оформлен</span></div>
      <div class="gt-split"><div class="gt-panel"><div class="gt-panel-h"><span>Склад · сборка заказа</span><span class="gt-pill ok">клиент подтвердил</span></div><div class="gt-panel-b">
        ${т.map((p, i) => `<div class="gt-pr gt-pick" data-i="${i}"><span class="gt-chk"></span><div class="gt-pr-ph">${картинка(p, 160)}</div><div class="gt-pr-n"><b>${экран(p.name)}</b><small>${экран(p.code)} · на складе: ${12 + i * 7}</small></div><span class="gt-pr-q">× ${[2, 2, 5][i]}</span></div>`).join("")}
        <div class="gt-places">Мест (коробок): <b>0</b></div><button class="btn-primary gt-issue" style="width:100%;margin-top:10px">Оформить</button></div></div>
        <div class="gt-ware"><div class="gt-shelf">${[0, 1, 2].map(r => `<div class="gt-shelf-row">${[0, 1, 2, 3].map(c => `<span class="gt-bin" style="--d:${(r * 4 + c) * 60}ms"></span>`).join("")}</div>`).join("")}</div>
          <div class="gt-box3"><div class="gt-box3-b"></div><div class="gt-box3-f l"></div><div class="gt-box3-f r"></div><div class="gt-box3-t"></div><div class="gt-box3-l">${ЗНАК("bx")}</div></div></div></div>`;
    [0, 1, 2].forEach(i => { ctx.click(() => page.querySelector(`.gt-pick[data-i="${i}"] .gt-chk`), 1100 + i * 1000, (el) => { el?.closest(".gt-pick")?.classList.add("ok"); const b = page.querySelectorAll(".gt-bin")[i * 3 + 1]; b && b.classList.add("take"); }, { move: 450 }); });
    ctx.mark(".gt-box3", "close", 4400);
    ctx.at(5400, () => { const b = page.querySelector(".gt-places b"); if (b) b.textContent = "2"; });
    ctx.spot(".gt-places", 5400, 1000);
    ctx.click(".gt-issue", 6900);
    ctx.at(7100, () => { page.querySelectorAll(".gt-fs").forEach((e, k) => { e.classList.toggle("on", k === 3); e.classList.toggle("done", k < 3); }); const h = page.querySelector(".gt-panel-h .gt-pill"); if (h) h.textContent = "Оформлен · накладная готова"; });
    ctx.end(9300);
  },

  // 10 — накладная в Telegram и доставка Яндексом или BTS
  delivery(ctx, page) {
    page.innerHTML = `<div class="gt-split"><div class="gt-deliv">
        <svg class="gt-map" viewBox="-20 -30 660 420" aria-hidden="true"><path class="land" d="${ПУТЬ_УЗ}"/>${МАРШРУТЫ.map((d, i) => `<path class="route" style="--d:${i * 260}ms" d="${d}"/>`).join("")}
          <g transform="translate(${СКЛАД[0]},${СКЛАД[1]})"><circle class="halo" r="13"/><circle class="core" r="7"/></g>
          ${ТОЧКИ.map((p, i) => `<g transform="translate(${p[0]},${p[1]})"><circle class="dst" style="--d:${900 + i * 260}ms" r="6"/></g>`).join("")}</svg>
        <div class="gt-ways"><div class="gt-way"><span>${IC.truck}</span><div><b>Яндекс</b><small>доставка курьером</small></div></div><div class="gt-way"><span>${IC.box}</span><div><b>BTS</b><small>почтовое отправление</small></div></div></div>
        <p class="gt-deliv-n">Способ и сроки доставки менеджер согласует с вами.</p></div>${телефонБот()}</div>`;
    ctx.mark(".gt-phone", "show", 200);
    сообщение(ctx, "✅ Ваша накладная готова! Отправляем…", { t: 600 });
    сообщение(ctx, `<div class="gt-pdf"><span>${IC.doc}</span><div><b>Накладная № 4F2A91</b><small>PDF · Мест (коробок): 2</small></div></div>🧾 Ваша накладная`, { t: 1500 });
    ctx.mark(".gt-deliv", "go", 2600);
    ctx.spot(".gt-ways", 5200, 1600);
    ctx.end(8200);
  },

  // 11 — кабинет: показатели, заказы, накладные, оплаты
  cabinet(ctx, page) {
    const ц = ctx.цена;
    page.innerHTML = шапка(ctx.ui, { вошёл: true }) + `<div class="site-main"><div class="cabinet-layout"><div class="cabinet-sidebar"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);padding:6px 12px 10px">Кабинет</div>
      ${["Профиль и долг", "Мои заказы", "Накладные", "Оплаты", "Сменить пароль"].map((n, i) => `<div class="cabinet-nav-item${i ? "" : " active"}" data-i="${i}"><span>${экран(n)}</span></div>`).join("")}</div>
      <div class="cabinet-content gt-cab"></div></div></div>`;
    const раздел = (i, html) => { page.querySelectorAll(".cabinet-nav-item").forEach(n => n.classList.toggle("active", n.dataset.i == i)); const c = page.querySelector(".gt-cab"); c.classList.remove("gt-swap"); void c.offsetWidth; c.classList.add("gt-swap"); c.innerHTML = html; };
    const плитка = (n, v, cls = "") => `<div class="gt-tile ${cls}"><small>${n}</small><b>${v}</b></div>`;
    ctx.at(100, () => раздел(0, `<div class="cabinet-card" style="padding:18px"><div style="display:flex;align-items:center;gap:12px"><span class="gt-ava">Д</span><div><b>Демо клиент</b><div style="color:var(--muted);font-size:13px">+998 90 000 00 00</div></div></div>
      <div style="margin-top:16px;font-weight:700">Мои показатели</div><div class="gt-tiles">${плитка("Оборот", ц)}${плитка("Оплачено", ц)}${плитка("Мой долг", ц, "debt")}</div></div>`));
    ctx.spot(".gt-tiles", 1200, 1300);
    ctx.click('.cabinet-nav-item[data-i="1"]', 3200, () => раздел(1, `<div class="cabinet-card" style="padding:18px">${[["Ждёт подтверждения", "w"], ["Подтверждён", "ok"], ["Оформлен", "done"]].map(([s, c], i) => `<div class="gt-or"><span>Заказ · ${[9, 7, 2][i]} ноября · с сайта</span><span class="gt-pill ${c}">${s}</span></div>`).join("")}<p style="color:var(--muted);font-size:13px;margin:10px 0 0">Цены уточнит менеджер</p></div>`));
    ctx.click('.cabinet-nav-item[data-i="2"]', 5600, () => раздел(2, `<div class="cabinet-card" style="padding:18px">${["Оплачено", "Частично", "Долг"].map((s, i) => `<div class="gt-or"><span>${ц} · ${[2, 28, 15][i]} ${i ? "октября" : "ноября"} · ${3 + i} поз.</span><span class="gt-pill ${["ok", "w", "debt"][i]}">${s}</span>${i ? "" : `<span class="gt-mini">PDF</span><span class="gt-mini">Excel</span>`}</div>`).join("")}</div>`));
    ctx.spot(".gt-mini", 7000, 1100);
    ctx.click('.cabinet-nav-item[data-i="3"]', 8600, () => раздел(3, `<div class="cabinet-card" style="padding:18px"><table class="gt-tbl"><tr><th>Дата</th><th>Сумма</th><th>Примечание</th></tr>${[5, 21, 30].map(d => `<tr><td>${d}.10</td><td>${ц}</td><td>—</td></tr>`).join("")}</table></div>`));
    ctx.end(11200);
  },

  // 12 — бот: язык, меню, долг, новинки
  bot(ctx, page) {
    page.innerHTML = `<div class="gt-split"><div class="gt-side-note"><span class="gt-kicker">Telegram</span><h3>@generalmodernbot</h3><p>Цена на подтверждение, накладные PDF, долг и новые поступления — сами приходят в чат.</p></div>${телефонБот()}</div>`;
    ctx.mark(".gt-phone", "show", 100);
    сообщение(ctx, "/start", { я: true, t: 400 });
    сообщение(ctx, "Выберите язык / Tilni tanlang / Choose language:", { t: 900, кнопки: ["🇷🇺 Русский", "🇺🇿 O‘zbek", "🇬🇧 English"] });
    ctx.click(".gt-msg-btns span", 2200);
    сообщение(ctx, "Здравствуйте, Демо! 👋 Выберите:", { t: 2700, кнопки: ["🛒 Заказать товары", "🌐 Каталог товаров", "💰 Мой оборот и долг", "🧾 Мои накладные"] });
    ctx.click(() => [...page.querySelectorAll(".gt-msg-btns span")].find(s => s.textContent.includes("💰")), 4300);
    сообщение(ctx, `💰 Оборот всего: ${ctx.цена}<br>Текущий долг: ${ctx.цена}`, { t: 4700 });
    сообщение(ctx, "🆕 Поступили новые товары! Загляните в каталог 👇", { t: 6400, кнопки: ["🛒 Заказать в приложении", "🌐 Открыть наш сайт"] });
    ctx.end(9000);
  },

  // 13 — весь путь одной цепочкой → знак → сайт
  final(ctx, page) {
    const шаги = { ru: ["Поиск", "Выбор", "Заказ", "Цена", "Подтверждение", "Сборка", "Накладная", "Доставка"], uz: ["Qidiruv", "Tanlash", "Buyurtma", "Narx", "Tasdiq", "Yig‘ish", "Yuk xati", "Yetkazish"], en: ["Search", "Choose", "Order", "Price", "Confirm", "Packing", "Invoice", "Delivery"] }[ctx.lang];
    page.innerHTML = `<div class="gt-final"><div class="gt-chain">${шаги.map((s, i) => `<span style="--d:${i * 220}ms">${экран(s)}</span>`).join("<i></i>")}</div>
      <div class="gt-fin-mark">${ЗНАК("fm")}</div><p>${экран(ТЕКСТЫ_ТУРА[ctx.lang].final[1])}</p></div>`;
    ctx.mark(".gt-final", "go", 100);
    ctx.end(6500);
  },
};

// Узбекистан, упрощённый контур; склад и несколько точек без названий городов
const КОНТУР = [[56,45],[58.6,45.55],[61,44.4],[62.1,43.5],[64.9,43.7],[65.5,43.3],[66.1,42.9],[66,42],[66.5,41.9],[67.9,41.1],[68.6,40.7],[69,41.4],[70.4,42.1],[71.2,42.2],[70.9,41.5],[71.8,41.4],[73.1,40.85],[72.7,40.5],[71.7,40.2],[70.6,40.2],[70.4,40.6],[69.5,40.1],[68.7,40.1],[68.6,39.4],[67.4,39.15],[67.7,38.4],[68.2,38],[67.8,37.2],[67.3,37.1],[66.6,37.4],[66.5,38],[65,38.6],[64.2,38.95],[63.5,39.4],[62.4,40.1],[61.9,41.1],[61,41.2],[60,41.8],[60.1,42.2],[58.8,42.6],[58.1,42.4],[57.9,41.9],[56.95,41.3],[56,41.3]];
const пт = ([lon, lat]) => [+((lon - 55.5) * 34).toFixed(1), +((45.8 - lat) * 42).toFixed(1)];
const ПУТЬ_УЗ = "M" + КОНТУР.map(p => пт(p).join(",")).join(" L") + " Z";
const СКЛАД = пт([69.25, 41.3]);
const ТОЧКИ = [[66.95, 39.65], [64.4, 39.77], [71.8, 40.75], [59.6, 42.45], [67.3, 37.3], [65.8, 38.85]].map(пт);
const МАРШРУТЫ = ТОЧКИ.map(([x, y]) => `M${СКЛАД[0]},${СКЛАД[1]} Q${((СКЛАД[0] + x) / 2).toFixed(1)},${(Math.min(СКЛАД[1], y) - 40).toFixed(1)} ${x},${y}`);

// ========================================================================
//  ПЕРВЫЙ ВИЗИТ: приглашение (или автозапуск, если так выбрал владелец)
// ========================================================================
function подходит() {
  try {
    const ua = navigator.userAgent || "";
    if (/bot|crawl|spider|slurp|lighthouse|headless|preview|yandex|facebookexternalhit|whatsapp|pagespeed/i.test(ua) || navigator.webdriver) return false;
    if (window.Telegram?.WebApp?.initData) return false;
    if (localStorage.getItem("gm_client_token")) return false;
    const h = location.hash.replace(/^#\/?/, "").split("?")[0];
    if (h && h !== "catalog") return false;
    if (new URLSearchParams(location.search).has("reg")) return false;
    const c = navigator.connection;
    if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ""))) return false;
    return true;
  } catch { return false; }
}
function уже(cfg) {
  const r = прочитать(КЛЮЧ_СМОТРЕЛ);
  if (!r || (Number(r.v) || 0) < (Number(cfg.seen_version) || 1)) return false;
  if (cfg.frequency === "once" || !cfg.frequency) return true;
  if (cfg.frequency === "session") { try { return sessionStorage.getItem("gm_tour_s") === "1"; } catch { return true; } }
  return Date.now() - (Number(r.at) || 0) < (cfg.frequency === "7d" ? 7 : 30) * ДЕНЬ;
}

export async function maybeInviteTour() {
  let q; try { q = new URLSearchParams(location.search); } catch { q = new URLSearchParams(); }
  // ?tour=1 — открыть сразу (кнопка в складе), ?tour=draft — черновик из склада
  if (q.get("tour") === "draft") {
    let draft = null; try { draft = JSON.parse(localStorage.getItem("gm_tour_draft") || "null"); } catch { }
    setTimeout(() => openTour({ draft, preview: true }), 600); return;
  }
  if (q.get("tour") === "1") { setTimeout(() => openTour({ preview: q.has("preview") }), 600); return; }
  if (q.get("tour") === "0" || !подходит()) return;

  const lang = язык();
  const сохр = прочитать(КЛЮЧ_НАСТРОЕК);
  let cfg = сохр;
  if (!сохр || Date.now() - (Number(сохр.at) || 0) > 3600e3) {
    try { const c = await загрузитьНастройки(lang, 4000); cfg = { enabled: !!c.enabled, frequency: c.frequency, seen_version: c.seen_version, howto_button: c.howto_button !== false, tour_mode: c.tour_mode || "invite", at: Date.now() }; записать(КЛЮЧ_НАСТРОЕК, cfg); }
    catch { return; }
  }
  if (!cfg || !cfg.enabled || cfg.tour_mode === "button" || уже(cfg)) return;
  try { sessionStorage.setItem("gm_tour_s", "1"); } catch { }
  if (cfg.tour_mode === "auto" && !меньшеДвижения()) { openTour({}); return; }
  // приглашение: не мешает, сайт работает под ним
  try { await подключитьCss(); } catch { return; }
  const ui = UI[lang];
  const card = узел("div", "gt-invite", `<div class="gt-inv-mark">${ЗНАК("iv")}</div><div class="gt-inv-t"><b>${экран(ui.inviteT)}</b><span>${экран(ui.inviteD)}</span></div>
    <div class="gt-inv-b"><button type="button" class="btn-primary gt-inv-go">▶ ${экран(ui.inviteGo)}</button><button type="button" class="btn-ghost gt-inv-no">${экран(ui.later)}</button></div>`);
  card.setAttribute("role", "dialog"); card.setAttribute("aria-label", ui.tour);
  const убрать = () => { card.classList.remove("open"); setTimeout(() => card.remove(), 300); записать(КЛЮЧ_СМОТРЕЛ, { v: Number(cfg.seen_version) || 1, at: Date.now() }); };
  card.querySelector(".gt-inv-go").addEventListener("click", () => { отметить("invite_accept"); убрать(); openTour({}); });
  card.querySelector(".gt-inv-no").addEventListener("click", () => { отметить("invite_dismiss"); убрать(); });
  setTimeout(() => { document.body.append(card); requestAnimationFrame(() => card.classList.add("open")); отметить("invite_shown"); }, 1800);
}
