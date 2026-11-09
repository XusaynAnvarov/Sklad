// ========================================================================
//  ТОЧКА ВХОДА АДМИНКИ: авторизация → каркас → роутер
// ========================================================================
// показатьПоявление больше не зовём: лесенку раздела ведёт js/glassos.js
// (прийти) — она знает порядок слоёв и умеет отменять незаконченный переход.
import { el, $, reveal, showLoader, hideLoader, toast, оживитьЧисла } from "./ui.js?v=20261109k";
import { обновитьЕслиУстарело } from "./version.js?v=20261109k";
import { icon } from "./icons.js?v=20261109k";
import { db, rawClient } from "./db.js?v=20261109k";
import { ensureAccess, alreadyAuthed, logout } from "./auth.js?v=20261109k";
import { setRates } from "./fx.js?v=20261109k";
// версия в импорте обязательна: без неё CDN отдаёт старый effects.js (там тема по умолчанию была светлой)
import { initTheme, initCursorGlow, initStarfield, makeThemeToggle } from "./effects.js?v=20261109k";
import { applyI18n, makeLangSwitcher } from "./i18n.js?v=20261109k";
// GlassOS: подсказки правого рейла, поиск в стиле Apple, последовательные переходы
import { initПодсказкиРейла, создатьПоиск, уйти, прийти, запомнитьЗапрос, применитьЗапрос } from "./glassos.js?v=20261109k";

import dashboard from "./pages/dashboard.js?v=20261109k";
import products from "./pages/products.js?v=20261109k";
import sales from "./pages/sales.js?v=20261109k";
import purchases from "./pages/purchases.js?v=20261109k";
import customers from "./pages/customers.js?v=20261109k";
import orders from "./pages/orders.js?v=20261109k";
import reports from "./pages/reports.js?v=20261109k";
import catalogPage from "./pages/catalog_admin.js?v=20261109k";
import settings from "./pages/settings.js?v=20261109k";
import siteClients from "./pages/site_clients.js?v=20261109k";
import crmPage from "./pages/crm.js?v=20261109k";
import trash from "./pages/trash.js?v=20261109k";
import videosAdmin from "./pages/videos_admin.js?v=20261109k";
import supplierOrder from "./pages/supplier_order.js?v=20261109k";
import stockCheck from "./pages/stock_check.js?v=20261109k";
import packingSetup from "./pages/packing_setup.js?v=20261109k";
import seoPage from "./pages/seo.js?v=20261109k";

const NAV = [
  { id: "dashboard",    label: "Дашборд",        ic: "dashboard", render: dashboard },
  { id: "products",     label: "Товары",          ic: "box",       render: products },
  { id: "stock_check",  label: "Проверка склада", ic: "check",     render: stockCheck },
  { id: "packing",      label: "Настройки упаковок", ic: "box",   render: packingSetup },
  { id: "sales",        label: "Продажи",         ic: "receipt",   render: sales },
  { id: "purchases",    label: "Приход",          ic: "truck",     render: purchases },
  { id: "supplier_order", label: "Заказ поставщику", ic: "truck",   render: supplierOrder },
  { id: "customers",    label: "Клиенты",         ic: "user",      render: customers },
  { id: "orders",       label: "Заказы",          ic: "cart",      render: orders },
  { id: "reports",      label: "Отчёты",          ic: "chart",     render: reports },
  { id: "catalog",      label: "Каталог",         ic: "globe",     render: catalogPage },
  { id: "videos",       label: "Видео",           ic: "broadcast", render: videosAdmin },
  { id: "crm",          label: "Клиенты и безопасность", ic: "shield", render: crmPage },
  { id: "site_clients", label: "Клиенты сайта",   ic: "broadcast", render: siteClients },
  { id: "seo",          label: "SEO",             ic: "search",     render: seoPage },
  { id: "trash",        label: "Корзина",         ic: "trash",     render: trash },
  { id: "settings",     label: "Настройки",       ic: "settings",  render: settings },
];

const root = document.getElementById("root");
let ctx;

// Ждём ответа, но не вечно. Любой из шагов ниже может повиснуть: старый
// служебный работник (Service Worker) отдаёт запрос из кэша и не отвечает,
// сеть в Telegram отваливается, сторонний клиент Supabase не грузится. Без
// ограничения весь склад останавливался на надписи «Загрузка…» — экран,
// который владелец и видел. Теперь шаг просто бросается, а склад строится.
function неЖдатьДольше(обещание, мс, что) {
  return Promise.race([
    Promise.resolve(обещание).catch(e => { console.warn(что + ":", e && e.message || e); return null; }),
    new Promise(готово => setTimeout(() => { console.warn(что + ": не ответило за " + мс + " мс, идём дальше"); готово(null); }, мс)),
  ]);
}

async function boot() {
  // Открыто вчерашнее? Страницы кэширует сам браузер, поэтому проверяем
  // версию у сервера и один раз перезагружаемся. Иначе человек смотрит на
  // старый экран и не понимает, почему правки «не пришли».
  if (await обновитьЕслиУстарело({
    onStale: (своя, сервер) => toast(`Открыта старая версия (${своя}), на сервере ${сервер}. Нажмите Ctrl+Shift+R.`, "err"),
  })) return;

  initTheme();
  initCursorGlow();
  initStarfield();
  await неЖдатьДольше(db.ready, 5000, "Клиент базы");
  // Кастомный admin JWT (вход через /api/admin-auth) — сессии Supabase нет и не нужна
  const hasAdminToken = !!localStorage.getItem("sklad_admin_token");
  if (db.mode === "supabase" && !hasAdminToken) {
    try {
      const ответ = await неЖдатьДольше(rawClient().auth.getSession(), 3000, "Проверка сессии");
      if (!ответ || !ответ.data || !ответ.data.session) { localStorage.removeItem("sklad_authed"); }
    } catch { localStorage.removeItem("sklad_authed"); }
  }
  if (!alreadyAuthed()) await ensureAccess(root);
  // загрузка настроек и курсов (после логина — есть токен)
  try {
    const s = await неЖдатьДольше(db.getSettings(), 8000, "Настройки");
    if (s) setRates(s);
    // канал для накладных кладём рядом: отправка в Telegram берёт его отсюда,
    // чтобы не тянуть настройки из облака на каждое нажатие «Отправить»
    if (s && s.telegram_channel) { try { localStorage.setItem("gm_tg_channel", String(s.telegram_channel).trim()); } catch { } }
  } catch (e) { console.warn(e); }
  buildShell();
  route();
  // счётчик новых заказов из бота
  try { const sales = await db.sales.list(); ctx.setNavBadge("orders", sales.filter(s => s.status === "order").length); } catch {}
}

// ========================================================================
//  КАРКАС GLASSOS
//
//  Разделы уехали из полосы под шапкой в правый рейл значков: подписи
//  там не нужны (их показывает подсказка), и вся ширина экрана достаётся
//  цифрам. Служебное разделилось по смыслу: то, что про человека и
//  данные (профиль, режим базы, язык, поиск), — в шапке; то, что про
//  выход из текущего места (тема, сайт, выход), — внизу рейла.
//
//  Разметка:
//    .app
//      ├── .gm-shell   → .gm-head (шапка) + .main#view (содержимое)
//      └── .sidebar.gm-rail → .navrow (значки) + .gm-rail-foot
// ========================================================================
function buildShell() {
  root.innerHTML = "";
  // Тёплое свечение за стеклом (css/theme.css, .gm-glow). Без него матовые
  // поверхности нечего размывать и они выглядят просто серыми.
  if (!document.querySelector(".gm-glow")) document.body.prepend(el("div.gm-glow", { "aria-hidden": "true" }));

  // ---------- Правый рейл: только значки ----------
  const sidebar = el("aside.sidebar.gm-rail");
  const navrow = el("nav.navrow", { "aria-label": "Разделы склада" });
  NAV.forEach(n => {
    const перейти = () => {
      // НА ТЕЛЕФОНЕ ДОК СКЛАДЫВАЕТСЯ.
      // Четырнадцать значков внизу занимают полосу во всю ширину и
      // закрывают нижние строки таблиц. Нажатие на значок РАЗДЕЛА, В
      // КОТОРОМ УЖЕ НАХОДИШЬСЯ, собирает док в одну кнопку — остальное
      // уезжает за неё. Повторное нажатие разворачивает обратно.
      // Переход в другой раздел всегда разворачивает: иначе человек
      // оказался бы в новом месте с собранным доком и не понял, где он.
      const тутЖе = sidebar.querySelector(`.navitem[data-id="${n.id}"]`)?.classList.contains("active");
      if (window.innerWidth <= 860 && тутЖе) { sidebar.classList.toggle("свёрнут"); return; }
      sidebar.classList.remove("свёрнут");
      location.hash = "#/" + n.id;
      // Класс .open остался от прежнего ящика — снимаем, если был.
      if (window.innerWidth <= 860) sidebar.classList.remove("open");
    };
    navrow.append(el("div.navitem", {
      "data-id": n.id,
      // Название раздела читает подсказка (js/glassos.js) и экранный диктор.
      "data-tip": n.label,
      "aria-label": n.label,
      role: "link",
      tabindex: "0",
      title: "",                 // своя подсказка красивее системной
      onclick: перейти,
      onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); перейти(); } },
    }, [
      el("span.ic", {}, [icon(n.ic, { size: 20 })]),
      el("span", { text: n.label }),
      el("span.nav-badge", { "data-badge": n.id, style: { display: "none" } }),
    ]));
  });
  navrow.addEventListener("scroll", отметитьКрая, { passive: true });
  window.addEventListener("resize", отметитьКрая);
  sidebar.append(navrow);

  // Низ рейла: тема, сайт, выход — тоже значками, с подсказками.
  const тема = makeThemeToggle();
  тема.dataset.tip = "Сменить тему";
  const наСайт = el("a.theme-toggle", { href: "/", "data-tip": "На сайт", "aria-label": "На сайт" },
    [icon("globe", { size: 17 }), el("span", { text: "На сайт" })]);
  const выход = el("button.theme-toggle", { onclick: logout, "data-tip": "Выход", "aria-label": "Выход" },
    [icon("logout", { size: 17 }), el("span", { text: "Выход" })]);
  sidebar.append(el("div.gm-rail-foot", {}, [тема, наСайт, выход]));

  // ---------- Стеклянная шапка ----------
  const brand = el("div.brand", {}, [icon("box", { size: 20 }), el("span", { text: "Мой Склад" })]);
  const поиск = создатьПоиск({
    placeholder: "Поиск: товар, клиент, раздел…",
    искать: искатьПоВсему,
    выбрать: (р) => {
      if (р.запрос) запомнитьЗапрос(р.запрос);
      location.hash = "#/" + р.раздел;
      // Уже на этом разделе — хеш не меняется и роутер не сработает:
      // перерисовываем сами, иначе запрос никуда не применится.
      if ((location.hash.replace(/^#\/?/, "").split("?")[0] || "dashboard") === р.раздел) route();
    },
  });
  const профиль = el("div.profile-chip", {}, [
    el("div.avatar", {}, [icon("user", { size: 18 })]),
    el("div", { style: { minWidth: "0" } }, [
      el("div.pname", { text: "Владелец" }),
      el("div.ptag", {}, [el("span.dot"), "Online · PRO"]),
    ]),
  ]);
  const режим = el("div.mode-tag", {}, [
    icon(db.mode === "supabase" ? "cloud" : "database", { size: 13 }), " ",
    db.mode === "supabase" ? "Онлайн (Supabase)" : "Локальный режим",
  ]);
  const язык = makeLangSwitcher(() => applyI18n(document.body));
  const head = el("header.gm-head", {}, [
    brand,
    el("div.gm-head-spacer"),
    поиск,
    язык,
    режим,
    профиль,
  ]);

  const main = el("main.main", { id: "view" });
  const shell = el("div.gm-shell", {}, [head, main]);
  const app = el("div.app", {}, [shell, sidebar]);
  root.append(app);

  // Кнопка «☰» для телефона. Раньше она лежала прямо в admin.html;
  // теперь рождается вместе с каркасом — иначе её нет на страницах,
  // которые строит сам склад.
  const кнопкаМеню = el("button.btn.btn-outline.btn-icon.menu-btn", {
    id: "menuBtn", text: "☰", "aria-label": "Меню",
    onclick: () => sidebar.classList.toggle("open"),
  });
  root.append(кнопкаМеню);
  // Выбрал раздел — ящик закрывается сам.
  navrow.addEventListener("click", () => sidebar.classList.remove("open"));

  подстроитьПодТелефон({ sidebar, head, brand, профиль, режим, язык, navrow });
  initПодсказкиРейла();
  прогретьПоиск();

  ctx = {
    db,
    navigate: (id) => { location.hash = "#/" + id; },
    refresh: () => route(),
    view: main,
    setNavBadge: (id, count) => {
      const b = sidebar.querySelector(`.nav-badge[data-badge="${id}"]`);
      if (!b) return;
      if (count > 0) { b.textContent = count; b.style.display = ""; } else { b.style.display = "none"; }
    },
  };
  window.addEventListener("hashchange", route);
}

// ========================================================================
//  НА ТЕЛЕФОНЕ — ПРЕЖНИЙ СКЛАД
//
//  Правый рейл значков и стеклянная шапка сделаны для компьютера. На
//  телефоне владелец просил вернуть то, что было до редизайна: кнопка
//  «☰» в углу и выезжающее слева меню, внутри которого всё — знак,
//  профиль, разделы, режим базы, язык, тема, «На сайт», «Выход».
//
//  Разметка у обеих раскладок одна и та же, меняется только размещение:
//  на телефоне содержимое шапки переезжает в ящик, а сама шапка
//  прячется. Переключатель — класс gm-rail: пока он есть, работают
//  стили рейла (css/glassos.css); снимаем — и остаётся прежнее боковое
//  меню из css/theme.css, не тронутое редизайном.
// ========================================================================
const ПОРОГ_ТЕЛЕФОНА = 860;

function подстроитьПодТелефон(узлы) {
  const { sidebar, head, brand, профиль, режим, язык, navrow } = узлы;
  let прежний = null;

  const применить = () => {
    const телефон = window.innerWidth <= ПОРОГ_ТЕЛЕФОНА;
    if (телефон === прежний) return;     // раскладка не менялась — не трогаем DOM
    прежний = телефон;

    if (телефон) {
      sidebar.classList.remove("gm-rail");
      sidebar.classList.add("gm-ящик");
      // Порядок как был до редизайна: знак, профиль, разделы, режим,
      // язык, затем служебные кнопки.
      sidebar.prepend(профиль);
      sidebar.prepend(brand);
      navrow.after(язык);
      navrow.after(режим);
    } else {
      sidebar.classList.add("gm-rail");
      sidebar.classList.remove("gm-ящик", "open");
      // Возвращаем всё в шапку, в её собственном порядке.
      head.prepend(brand);
      head.append(язык, режим, профиль);
    }
  };

  применить();
  window.addEventListener("resize", применить, { passive: true });
}

// ========================================================================
//  ГЛОБАЛЬНЫЙ ПОИСК
//
//  Ищет по разделам, товарам и клиентам. Найденное открывает свой раздел
//  и вписывает запрос в его собственное поле поиска (js/glassos.js,
//  применитьЗапрос) — так четырнадцать страниц остаются нетронутыми, а
//  фильтрует каждая своим кодом.
//
//  Списки берём один раз и держим в памяти: перебирать тысячу товаров на
//  каждую букву дешевле, чем ходить за ними в облако.
// ========================================================================
let кэшПоиска = { products: [], customers: [], готов: false };

async function прогретьПоиск() {
  try {
    const [products, customers] = await Promise.all([
      db.products.list().catch(() => []),
      db.customers.list().catch(() => []),
    ]);
    кэшПоиска = { products: products || [], customers: customers || [], готов: true };
  } catch { /* поиск по разделам работает и без списков */ }
}

const склеить = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

function искатьПоВсему(запрос) {
  const q = склеить(запрос);
  if (!q) return [];
  const найдено = [];

  // Разделы — первыми: ответ мгновенный и всегда есть.
  NAV.forEach(n => {
    if (склеить(n.label).includes(q)) найдено.push({ title: n.label, hint: "Раздел", раздел: n.id });
  });

  // Товары: по названию и артикулу.
  for (const p of кэшПоиска.products) {
    if (найдено.length >= 12) break;
    if (склеить(p.name).includes(q) || склеить(p.sku).includes(q)) {
      найдено.push({
        title: p.name || "Без названия",
        hint: "Товар" + (p.sku ? " · " + p.sku : ""),
        раздел: "products",
        запрос: p.name || p.sku || "",
      });
    }
  }

  // Клиенты: по имени и любому из номеров.
  for (const c of кэшПоиска.customers) {
    if (найдено.length >= 12) break;
    const номера = (Array.isArray(c.phones) && c.phones.length) ? c.phones : (c.contact ? [c.contact] : []);
    if (склеить(c.name).includes(q) || номера.some(t => склеить(t).includes(q))) {
      найдено.push({
        title: c.name || "Без имени",
        hint: "Клиент" + (номера[0] ? " · " + номера[0] : ""),
        раздел: "customers",
        запрос: c.name || номера[0] || "",
      });
    }
  }

  return найдено;
}

// Разделов четырнадцать, и в строку они помещаются не на каждом экране.
// Прокрутку у ряда оставляем, но полосу прячем (css/theme.css): вместо неё
// края гаснут — это и показывает, что ряд продолжается. Здесь же следим,
// с какой стороны ещё есть что показать, и подводим активный пункт в
// видимую часть, чтобы после перехода он не оставался за краем.
// Рейл прокручивается по вертикали на компьютере и по горизонтали в
// нижнем доке на телефоне — поэтому сторону определяем по самому ряду,
// а не по ширине окна: так одна функция верна в обеих раскладках.
function вертикальный(ряд) { return ряд.scrollHeight - ряд.clientHeight > 2; }

function отметитьКрая() {
  const ряд = $(".navrow");
  if (!ряд) return;
  const верт = вертикальный(ряд);
  const сдвиг = верт ? ряд.scrollTop : ряд.scrollLeft;
  const запас = верт ? ряд.scrollHeight - ряд.clientHeight : ряд.scrollWidth - ряд.clientWidth;
  const начало = сдвиг > 4;
  const конец = сдвиг < запас - 4;
  ряд.classList.toggle("есть-продолжение", начало && конец);
  ряд.classList.toggle("у-начала", !начало && конец);
  ряд.classList.toggle("у-конца", начало && !конец);
}

function подвестиАктивный() {
  const ряд = $(".navrow");
  const пункт = ряд && ряд.querySelector(".navitem.active");
  if (!ряд || !пункт) return;
  if (вертикальный(ряд)) {
    const цель = пункт.offsetTop - (ряд.clientHeight - пункт.offsetHeight) / 2;
    ряд.scrollTop = Math.max(0, Math.min(цель, ряд.scrollHeight - ряд.clientHeight));
  } else if (ряд.scrollWidth > ряд.clientWidth) {
    // по центру видимой части, но не дальше краёв ряда
    const цель = пункт.offsetLeft - (ряд.clientWidth - пункт.offsetWidth) / 2;
    ряд.scrollLeft = Math.max(0, Math.min(цель, ряд.scrollWidth - ряд.clientWidth));
  }
  отметитьКрая();
}

// Какая навигация сейчас главная. Быстрые нажатия по разделам раньше
// копили очередь: каждая отрисовка дорисовывала свой раздел поверх
// чужого. Теперь у перехода есть номер, и устаревший просто уходит.
let номерНавигации = 0;

async function route() {
  const моя = ++номерНавигации;
  const id = (location.hash.replace(/^#\/?/, "") || "dashboard").split("?")[0];
  const item = NAV.find(n => n.id === id) || NAV[0];
  // Рейл в переходе не участвует: каркас стоит на месте, меняется только
  // содержимое — поэтому активный пункт переключаем сразу.
  $$(".navitem").forEach(n => n.classList.toggle("active", n.getAttribute("data-id") === item.id));
  подвестиАктивный();
  const view = $("#view");

  // 1. Уход: сначала внутренние блоки снизу вверх, потом вся страница.
  const старая = view.firstElementChild;
  if (старая) await уйти(старая);
  if (моя !== номерНавигации) return;   // пока уходили, выбрали другой раздел

  view.innerHTML = "";
  // Имя раздела на странице: по нему стиль можно включить только там, где
  // он нужен (например стекло на главной — css/theme.css, .page-dashboard).
  const page = el("div.page-enter.page-" + item.id);
  view.append(page);
  showLoader();
  try {
    await item.render(page, ctx);
  } catch (e) {
    console.error(e);
    page.append(el("div.empty", {}, [el("div.em-ic", {}, [icon("alert", { size: 40 })]), el("p", { text: "Ошибка: " + e.message })]));
  } finally {
    hideLoader();
  }
  if (моя !== номерНавигации) return;   // отрисовка устарела — рисует следующий

  reveal(view);
  // 2. Приход: заголовок → показатели → карточки → таблицы → остальное.
  прийти(page);
  applyI18n(document.body);
  // Крупные числа набегают от нуля — на любом экране, не только на дашборде.
  оживитьЧисла(page);
  labelTableCells(view);   // подписи для «карточного» вида таблиц на телефоне
  применитьЗапрос(page);   // пришли из глобального поиска — подставляем запрос
  view.scrollTop = 0;
}

// На узких экранах таблица превращается в карточки (css/theme.css), и каждой ячейке
// нужна подпись — берём её из заголовка соответствующей колонки.
function labelTableCells(root) {
  (root || document).querySelectorAll("table.tbl").forEach(tbl => {
    const heads = [...tbl.querySelectorAll("thead th")].map(th => (th.textContent || "").trim());
    if (!heads.length) return;
    tbl.querySelectorAll("tbody tr").forEach(tr => {
      [...tr.children].forEach((td, i) => {
        const h = heads[i];
        if (h) td.setAttribute("data-label", h); else td.removeAttribute("data-label");
      });
    });
  });
}
function $$(s){return [...document.querySelectorAll(s)];}

// Волна от точки нажатия на кнопках и пунктах меню (один слушатель на документ)
(function initRipple() {
  const SEL = ".btn,.navitem,.pill-tabs button,.filter-chip";
  document.addEventListener("pointerdown", (e) => {
    const b = e.target.closest && e.target.closest(SEL);
    if (!b || b.disabled) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = b.getBoundingClientRect();
    const s = Math.max(r.width, r.height);
    const sp = document.createElement("span");
    sp.className = "gm-ripple";
    sp.style.width = sp.style.height = s + "px";
    sp.style.left = (e.clientX - r.left - s / 2) + "px";
    sp.style.top = (e.clientY - r.top - s / 2) + "px";
    b.appendChild(sp);
    setTimeout(() => sp.remove(), 560);
  }, { passive: true });
})();

// Если boot зависнет/упадёт — показываем ошибку и кнопку сброса кэша вместо вечной «Загрузки».
function showBootError(err) {
  console.error("boot failed:", err);
  if (document.querySelector(".app")) return; // уже загрузилось — ничего не делаем
  const msg = (err && err.message) ? err.message : String(err || "неизвестная ошибка");
  root.textContent = "";
  const wrap = el("div.login-wrap", {}, [el("div.login-card", { style: { maxWidth: "460px", textAlign: "center" } }, [
    el("p", { text: "Не удалось загрузить", style: { fontWeight: "800", fontSize: "16px", color: "#b42318", margin: "0 0 8px" } }),
    el("p", { text: msg, style: { fontSize: "13px", color: "#667085", margin: "0 0 14px", wordBreak: "break-word" } }),
    el("button.btn.btn-primary", { text: "Обновить", style: { marginRight: "8px" }, onclick: () => location.reload() }),
    el("button.btn.btn-outline", { text: "Сбросить кэш", onclick: async () => {
      try {
        if ("serviceWorker" in navigator) { const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map(r => r.unregister())); }
        if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); }
      } catch {}
      location.reload();
    } }),
  ])]);
  root.append(wrap);
}

boot().catch(showBootError);
// Сторож: если за 15 с склад не построился (завис await в boot) — показываем
// ошибку. Но не трогаем экран входа: человек там просто вводит пароль, и
// раньше поверх формы вылезало «Загрузка зависла», хотя всё было в порядке.
setTimeout(() => {
  const собрался = document.querySelector(".app");
  const ждётВхода = document.querySelector(".login-wrap input");
  if (!собрался && !ждётВхода) {
    showBootError(new Error("Загрузка зависла. Нажмите «Сбросить кэш» — это очистит устаревший кэш и Service Worker."));
  }
}, 15000);

// PWA: регистрация service worker (оффлайн-оболочка, установка на телефон)
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js?v=255", { updateViaCache: "none" }).catch(() => {}));
  // когда активируется новый SW — страница сама перезагружается со свежим кодом (без DevTools)
  let _swRefreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (_swRefreshing) return; _swRefreshing = true; location.reload();
  });
}
