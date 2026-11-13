// SPA-роутер публичного сайта: шапка, темы, языки, панель
import { isLoggedIn, clearToken as _clearToken, api } from "./api.js?v=20261111b";
import { renderCatalog } from "./catalog.js?v=20261111b";
import { renderVideos } from "./videos.js?v=20261111b";
import { renderCabinet } from "./cabinet.js?v=20261111b";
import { renderAdminPanel } from "./admin-panel.js?v=20261111b";
import { renderOrder } from "./order.js?v=20261111b";
import { setAuthChangeCallback, openLogin, logout as _logout, pendingAuth, clearPendingAuth } from "./auth.js?v=20261111b";
import { сменитьТемуВолной } from "../temavolna.js?v=20261111b";
import { обновитьЕслиУстарело } from "../version.js?v=20261111b";
import { отметитьВизит, уведомлениеОДанных } from "./visit.js?v=20261111b";
// Экскурсия по сайту: приглашение новым посетителям и кнопка «▶ Как заказать»
import { maybeInviteTour, openTour } from "./tour.js?v=20261111b";
// Короткий ролик при входе (js/site/intro.js) — новым посетителям
import { maybeShowIntro } from "./intro.js?v=20261111b";
// Кнопка «▶ Как заказать» видна, пока владелец не выключил её в складе
export function кнопкаКакЗаказать() { try { const c = JSON.parse(localStorage.getItem("gm_intro_cfg") || "null"); return !c || c.howto_button !== false; } catch { return true; } }

// ---- Translations ----
const TRANSLATIONS = {
  ru: {
    ffPlaced: "Заказ оформлен", ffPacked: "Заказ собран", ffShipped: "Заказ отправлен", ffPending: "ожидается", ffCarrier: "Перевозчик", ffTracking: "Номер накладной",
    catalog: "Каталог", cabinet: "Кабинет", login: "Войти", logout: "Выйти",
    warehouse: "Склад", adminPanel: "Панель", order: "Заказать",
    priceNote: "Цены уточнит менеджер",
    noStock: "Нет в наличии", loginToOrder: "Войти для заказа",
    inStockBadge: "В наличии", noStockBadge: "Нет в наличии", soonBadge: "Скоро", newBadge: "Новинка",
    heroTitle: "Запчасти для швейных машин",
    heroSub: "Иглы, лапки, челноки, ножи и детали для промышленных и бытовых машин. Магазин в Ташкенте, заказ онлайн",
    heroCta: "Смотреть каталог", heroHits: "Хиты недели", hitBadge: "Хит недели",
    authModal: "Войти / Зарегистрироваться", errorMsg: "Ошибка",
    howTo: "Как заказать",
  },
  uz: {
    ffPlaced: "Buyurtma rasmiylashtirildi", ffPacked: "Buyurtma yig‘ildi", ffShipped: "Buyurtma jo‘natildi", ffPending: "kutilmoqda", ffCarrier: "Tashuvchi", ffTracking: "Yuk xati raqami",
    catalog: "Katalog", cabinet: "Kabinet", login: "Kirish", logout: "Chiqish",
    warehouse: "Ombor", adminPanel: "Panel", order: "Buyurtma berish",
    priceNote: "Narxni menejer aniqlashtiradi",
    noStock: "Mavjud emas", loginToOrder: "Kirish va buyurtma berish",
    inStockBadge: "Mavjud", noStockBadge: "Mavjud emas", soonBadge: "Tez kunda", newBadge: "Yangi",
    heroTitle: "Tikuv mashinalari uchun ehtiyot qismlar",
    heroSub: "Sanoat va maishiy mashinalar uchun igna, lapka, moki, pichoq va detallar. Toshkentdagi do‘kon, onlayn buyurtma",
    heroCta: "Katalogni ko'rish", heroHits: "Hafta xitlari", hitBadge: "Hafta xiti",
    authModal: "Kirish / Ro'yxatdan o'tish", errorMsg: "Xato",
    howTo: "Qanday buyurtma berish",
  },
  en: {
    ffPlaced: "Order placed", ffPacked: "Order packed", ffShipped: "Order shipped", ffPending: "pending", ffCarrier: "Carrier", ffTracking: "Tracking number",
    catalog: "Catalog", cabinet: "Cabinet", login: "Login", logout: "Logout",
    warehouse: "Warehouse", adminPanel: "Panel", order: "Order",
    priceNote: "Manager will confirm prices",
    noStock: "Out of Stock", loginToOrder: "Login to Order",
    inStockBadge: "In Stock", noStockBadge: "Out of Stock", soonBadge: "Coming Soon", newBadge: "New",
    heroTitle: "Sewing machine spare parts",
    heroSub: "Needles, presser feet, hooks, knives and parts for industrial and household machines. Shop in Tashkent, order online",
    heroCta: "Browse catalog", heroHits: "Top this week", hitBadge: "Top this week",
    authModal: "Sign In / Register", errorMsg: "Error",
    howTo: "How to order",
  },
};
export function getLang() { return localStorage.getItem("gm_lang") || "ru"; }
export function setLang(l) { localStorage.setItem("gm_lang", l); }
// Перерисовать сайт на месте (шапка + текущий раздел). Нужна, чтобы смена
// языка не перезагружала страницу: прокрутка и раздел остаются как были.
let перерисоватьСайт = null;
export function t(key) { return (TRANSLATIONS[getLang()] || TRANSLATIONS.ru)[key] || key; }

// ---- Theme ----
// По умолчанию — светлая тема: главный цвет сайта теперь белое прозрачное
// стекло. Разовый переход на новый вид: у тех, кто раньше сидел на тёмной,
// один раз включаем светлую (метка gm_theme_v3), дальше выбор человека
// снова уважается — переключатель в шапке никуда не делся.
export function getTheme() {
  try {
    if (!localStorage.getItem("gm_theme_v3")) {
      localStorage.setItem("gm_site_theme", "light");
      localStorage.setItem("gm_theme_v3", "1");
    }
  } catch {}
  return localStorage.getItem("gm_site_theme") || "light";
}
export function setTheme(theme) {
  localStorage.setItem("gm_site_theme", theme);
  const root = document.documentElement;
  // отключаем CSS-переходы на момент смены темы — иначе сотни элементов анимируются разом и лагает
  root.classList.add("no-theme-anim");
  root.setAttribute("data-site-theme", theme);
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("no-theme-anim")));
}
export function toggleTheme() { setTheme(getTheme() === "dark" ? "light" : "dark"); }

// ---- Admin check (decode JWT phone field) ----
function getTokenPayload() {
  const token = localStorage.getItem("gm_client_token");
  if (!token) return null;
  try { return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); }
  catch { return null; }
}
const ADMIN_PHONES = ["974090119", "837138321"];
function isAdmin() {
  const p = getTokenPayload();
  return ADMIN_PHONES.includes(p?.phone);
}

// ---- Toast ----
let toastContainer;
export function sToast(msg, type = "") {
  if (!toastContainer) { toastContainer = document.createElement("div"); toastContainer.className = "s-toasts"; document.body.append(toastContainer); }
  const t2 = document.createElement("div"); t2.className = "s-toast " + type; t2.textContent = msg;
  toastContainer.append(t2);
  setTimeout(() => { t2.style.opacity = "0"; t2.style.transition = "opacity .3s"; setTimeout(() => t2.remove(), 300); }, 3000);
}

// ---- Modal ----
const modals = {};
export function openModal(id, content) {
  let overlay = modals[id];
  if (!overlay) {
    overlay = document.createElement("div"); overlay.className = "s-overlay"; overlay.id = "mo-" + id;
    const modal = document.createElement("div"); modal.className = "s-modal";
    const head = document.createElement("div"); head.className = "s-modal-head";
    const title = document.createElement("h2"); title.textContent = id === "auth-modal" ? t("authModal") : "";
    const closeBtn = document.createElement("button"); closeBtn.className = "s-modal-close";
    closeBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    closeBtn.addEventListener("click", () => closeModal(id));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(id); });
    head.append(title, closeBtn);
    modal.append(head);
    const body = document.createElement("div"); body.className = "s-modal-body"; modal.append(body);
    overlay.append(modal);
    document.body.append(overlay);
    modals[id] = overlay;
  }
  const body = overlay.querySelector(".s-modal-body");
  body.innerHTML = ""; if (content) body.append(content);
  requestAnimationFrame(() => overlay.classList.add("open"));
}
export function closeModal(id) {
  const overlay = modals[id] || document.getElementById("mo-" + id);
  if (overlay) overlay.classList.remove("open");
}

// ---- Language Switcher ----
function buildLangSwitcher() {
  const wrap = document.createElement("div"); wrap.className = "lang-switcher";
  const cur = getLang().toUpperCase();
  const btn = document.createElement("button"); btn.className = "lang-btn";
  btn.innerHTML = `<span>${cur}</span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>`;

  const dropdown = document.createElement("div"); dropdown.className = "lang-dropdown";
  const langs = [
    { code: "ru", label: "Русский" },
    { code: "uz", label: "O'zbek" },
    { code: "en", label: "English" },
  ];
  langs.forEach(({ code, label }) => {
    const opt = document.createElement("div"); opt.className = "lang-option" + (getLang() === code ? " active" : "");
    opt.innerHTML = `<span style="font-weight:600;font-size:12px;min-width:24px">${code.toUpperCase()}</span> <span style="font-weight:500">${label}</span>`;
    opt.addEventListener("click", () => {
      if (getLang() === code) { dropdown.classList.remove("open"); btn.classList.remove("open"); return; }
      setLang(code);
      dropdown.classList.remove("open"); btn.classList.remove("open");
      // Раньше тут была перезагрузка страницы — сайт открывался заново,
      // с самого верха каталога. Теперь просто перерисовываем на месте.
      if (перерисоватьСайт) перерисоватьСайт(); else location.reload();
    });
    dropdown.append(opt);
  });

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = dropdown.classList.toggle("open");
    btn.classList.toggle("open", open);
  });
  document.addEventListener("click", () => { dropdown.classList.remove("open"); btn.classList.remove("open"); }, { capture: false });

  wrap.append(btn, dropdown);
  return wrap;
}

// ---- Theme Toggle Button ----
function buildThemeToggle() {
  const btn = document.createElement("button"); btn.className = "theme-toggle";
  btn.title = "Сменить тему";
  btn.innerHTML = `
    <svg class="icon-sun" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
    <svg class="icon-moon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>`;
  // Тема раскрывается кругом из самой кнопки (js/temavolna.js) — так же,
  // как в ролике, присланном владельцем.
  btn.addEventListener("click", () => {
    сменитьТемуВолной(btn, () => {
      toggleTheme();
      btn.title = getTheme() === "dark" ? "Светлая тема" : "Тёмная тема";
    });
  });
  return btn;
}

// ---- Телефон магазина ----
// Номер один на весь сайт (config.js → PHONE). Ссылка tel: — на телефоне
// звонок в одно касание; на компьютере номер виден целиком.
export function телефон() { return String((window.APP_CONFIG && window.APP_CONFIG.PHONE) || "+998 97 409 01 19"); }
export function телефонСсылка() { return "tel:+" + телефон().replace(/\D/g, ""); }
function телефонВШапке() {
  const a = document.createElement("a");
  a.className = "site-phone"; a.href = телефонСсылка();
  a.setAttribute("aria-label", "Позвонить: " + телефон());
  a.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;
  const s = document.createElement("span"); s.textContent = телефон();
  a.append(s);
  return a;
}

// ---- Header ----
function buildHeader() {
  const header = document.createElement("header"); header.className = "site-header";
  const inner = document.createElement("div"); inner.className = "site-header-inner";

  const logo = document.createElement("a"); logo.className = "site-logo"; logo.href = "#catalog";
  logo.innerHTML = `${logoSvg()}<span class="site-logo-text">GENERAL<span>MODERN</span></span>`;

  const nav = document.createElement("nav"); nav.className = "site-nav";
  const links = [{ hash: "#catalog", label: t("catalog") }];
  if (isLoggedIn()) links.push({ hash: "#videos", label: "Видео" });
  if (isAdmin()) links.push({ hash: "#admin-panel", label: t("adminPanel") });
  else if (isLoggedIn()) links.push({ hash: "#cabinet", label: t("cabinet") });
  links.forEach(l => {
    const a = document.createElement("a"); a.className = "site-nav-link"; a.href = l.hash; a.textContent = l.label;
    nav.append(a);
  });
  // «▶ Как заказать» — окно с тем же роликом и шагами текстом, не уходя со страницы
  const кнопкаКак = (cls) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "site-nav-link gm-howto " + cls;
    b.title = t("howTo");
    b.innerHTML = `<span class="gm-howto-ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg></span>`;
    const s = document.createElement("span"); s.textContent = t("howTo");
    b.append(s);
    b.addEventListener("click", () => openTour());
    return b;
  };
  const естьКак = кнопкаКакЗаказать();
  if (естьКак) nav.append(кнопкаКак(""));

  const right = document.createElement("div"); right.className = "site-header-right";
  // На телефоне в шапке остаётся только логотип, «Заказать» и кнопка меню.
  // Всё остальное — внутри меню: раньше кнопки переносились на вторую и
  // третью строку, шапка занимала треть экрана и выглядела неопрятно.
  const menu = document.createElement("div"); menu.className = "site-menu";
  const burger = document.createElement("button");
  burger.className = "site-burger"; burger.type = "button";
  burger.setAttribute("aria-label", "Меню"); burger.setAttribute("aria-expanded", "false");
  burger.title = "Меню";
  // Подписываем словом, а не только значком: по трём полоскам не всем
  // очевидно, что внутри «Склад» и «Панель».
  burger.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg><span>Меню</span><svg class="site-burger-arrow" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><polyline points="6 9 12 15 18 9"/></svg>`;

  // Кнопка «Заказать» (вместо корзины) — ведёт на страницу-форму заказа
  const orderBtn = document.createElement("button"); orderBtn.className = "btn-primary btn-sm";
  orderBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg> ${t("order") || "Заказать"}`;
  orderBtn.addEventListener("click", () => { location.hash = "#order"; });

  right.append(телефонВШапке(), orderBtn);
  // Те же ссылки, что в строке меню на компьютере: на телефоне строка
  // спрятана, и попасть в «Каталог» или «Кабинет» было неоткуда.
  // «Панель» и «Кабинет» ниже есть кнопками — в списке они не нужны дважды.
  links.filter(l => l.hash !== "#admin-panel" && l.hash !== "#cabinet").forEach(l => {
    const a = document.createElement("a");
    a.className = "site-nav-link menu-only"; a.href = l.hash; a.textContent = l.label;
    menu.append(a);
  });
  if (естьКак) menu.append(кнопкаКак("menu-only"));

  // Кнопка "Склад" — только для администратора (доступ по JWT phone)
  if (isAdmin()) {
    const skladBtn = document.createElement("a"); skladBtn.href = "/admin";
    skladBtn.className = "btn-warehouse";
    skladBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg> ${t("warehouse")}`;
    menu.append(skladBtn);
  }

  // Telegram-бот — иконка-ссылка (видна всем)
  const tgLink = document.createElement("a");
  tgLink.href = (window.APP_CONFIG && window.APP_CONFIG.TELEGRAM_BOT_URL) || "https://t.me/generalmodernbot";
  tgLink.target = "_blank"; tgLink.rel = "noopener";
  tgLink.className = "site-tg-link"; tgLink.title = "Наш Telegram-бот"; tgLink.setAttribute("aria-label", "Telegram-бот");
  tgLink.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71l-4.14-3.05-1.99 1.93c-.23.23-.42.42-.83.42z"/></svg>`;
  menu.append(tgLink);

  // Theme + Lang
  menu.append(buildThemeToggle(), buildLangSwitcher());

  if (isLoggedIn()) {
    if (isAdmin()) {
      const panelBtn = document.createElement("button"); panelBtn.className = "btn-navy btn-sm";
      panelBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> ${t("adminPanel")}`;
      panelBtn.addEventListener("click", () => { location.hash = "#admin-panel"; });
      menu.insertBefore(panelBtn, menu.firstChild && menu.querySelector(".btn-warehouse, .site-tg-link"));
    } else {
      const cabinetBtn = document.createElement("button"); cabinetBtn.className = "btn-navy btn-sm";
      cabinetBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ${t("cabinet")}`;
      cabinetBtn.addEventListener("click", () => { location.hash = "#cabinet"; });
      menu.insertBefore(cabinetBtn, menu.querySelector(".site-tg-link"));
    }
    const logoutBtn = document.createElement("button"); logoutBtn.className = "btn-ghost btn-sm";
    logoutBtn.textContent = t("logout");
    logoutBtn.addEventListener("click", () => { _logout(); location.hash = "#catalog"; location.reload(); });
    menu.append(logoutBtn);
  } else {
    const loginBtn = document.createElement("button"); loginBtn.className = "btn-primary btn-sm";
    loginBtn.textContent = t("login");
    loginBtn.addEventListener("click", openLogin);
    menu.append(loginBtn);
  }

  right.append(menu);

  // Меню закрывается щелчком мимо, по Esc и при переходе в раздел —
  // иначе оно остаётся висеть поверх каталога.
  const закрыть = () => {
    menu.classList.remove("open");
    burger.classList.remove("open");
    burger.setAttribute("aria-expanded", "false");
  };
  burger.addEventListener("click", (e) => {
    e.stopPropagation();
    const открыто = menu.classList.toggle("open");
    burger.classList.toggle("open", открыто);
    burger.setAttribute("aria-expanded", открыто ? "true" : "false");
  });
  menu.addEventListener("click", (e) => {
    // Тема и язык — настройки: после них список должен остаться открытым,
    // иначе чтобы сменить и то и другое, меню приходится открывать дважды.
    if (e.target.closest(".theme-toggle, .lang-switcher")) return;
    if (e.target.closest("a,button")) закрыть();
  });
  document.addEventListener("click", (e) => { if (!menu.contains(e.target) && e.target !== burger) закрыть(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") закрыть(); });
  window.addEventListener("hashchange", закрыть);

  // Кнопка меню — слева, как в складе на телефоне: большой палец достаёт
  // до левого верхнего угла, и порядок одинаковый в обоих приложениях.
  inner.append(burger, logo, nav, right);
  header.append(inner);
  собиратьШапкуПриПрокрутке(header, logo);
  return header;
}

// ========================================================================
//  ШАПКА СОБИРАЕТСЯ ПРИ ПРОКРУТКЕ
//
//  Пока человек наверху — шапка целая: знак, разделы, «Заказ», язык,
//  тема, вход. Как только он поехал вниз, всё это по очереди уходит
//  вправо и шапка остаётся знаком в левом верхнем углу: товар важнее
//  кнопок, а место под него освобождается.
//
//  Обратно разворачивается от первого же движения ВВЕРХ — не дожидаясь
//  самого верха страницы. Так устроено во всех приложениях, где шапка
//  прячется: человек тянет вверх именно тогда, когда ему снова нужна
//  навигация.
//
//  Считаем в requestAnimationFrame и слушаем с passive:true: обработчик
//  прокрутки, который считает на каждый пиксель, — самый простой способ
//  сделать страницу дёрганой на телефоне.
// ========================================================================
let слушаемПрокрутку = false;   // обработчик вешаем один раз на всю жизнь страницы

const ТЕЛЕФОН = 760;        // ниже этой ширины действует прежний вид

function собиратьШапкуПриПрокрутке(header, logo) {
  const ПОРОГ = 150;          // до этой высоты шапка всегда целая
  const ЧУВСТВИТЕЛЬНОСТЬ = 5; // меньше — дрожание пальца переключало бы туда-сюда

  if (!слушаемПрокрутку) {
    слушаемПрокрутку = true;
    let прошлый = window.scrollY || 0;
    let последний = 0;
    const ШАГ = 80;   // чаще считать незачем: переход всё равно длится дольше

    // Считаем прямо в обработчике, но не чаще раза в 80 мс. Через
    // requestAnimationFrame было бы «правильнее», но в фоновой вкладке
    // кадры не рисуются: флажок «кадр заказан» оставался поднятым
    // навсегда, и после возврата на вкладку шапка больше не собиралась.
    // Здесь мы читаем только scrollY — это не заставляет браузер
    // пересчитывать раскладку, поэтому прокрутка остаётся плавной.
    function обновить() {
      // На телефоне шапка не собирается: там владелец просил прежний
      // вид — обычная шапка, которая просто уезжает вверх вместе со
      // страницей, как было до редизайна.
      if (window.innerWidth <= ТЕЛЕФОН) {
        const ш = document.querySelector(".site-header");
        if (ш) ш.classList.remove("собрана");
        return;
      }
      const сейчас = Date.now();
      if (сейчас - последний < ШАГ) return;
      последний = сейчас;
      // Шапку ищем КАЖДЫЙ РАЗ, а не держим в замыкании. Сайт
      // пересобирает её при смене раздела и при входе-выходе, и
      // обработчик, запомнивший старый элемент, продолжал бы ставить
      // класс выброшенному узлу: на экране при этом не менялось
      // ничего, и казалось, что сворачивание просто не работает.
      const шапка = document.querySelector(".site-header");
      if (!шапка) return;
      const y = window.scrollY || 0;
      const вниз = y > прошлый + ЧУВСТВИТЕЛЬНОСТЬ;
      const вверх = y < прошлый - ЧУВСТВИТЕЛЬНОСТЬ;
      if (вниз || вверх) прошлый = y;
      if (y < 60) { шапка.classList.remove("собрана"); return; }
      if (вниз && y > ПОРОГ) шапка.classList.add("собрана");
      else if (вверх) шапка.classList.remove("собрана");
    }

    window.addEventListener("scroll", обновить, { passive: true });
  }

  запомнитьШирины(header);

  // Новая шапка рождается развёрнутой. Если человек в этот момент стоит
  // внизу страницы, она должна сразу быть собранной — иначе после
  // перерисовки целая шапка выскакивает поверх товара. На телефоне не
  // собираем никогда.
  if (window.innerWidth > ТЕЛЕФОН && (window.scrollY || 0) > ПОРОГ) header.classList.add("собрана");

  // Собранный знак — кнопка «наверх»: это единственное, что осталось от
  // шапки, и нажатие на него должно возвращать туда, где шапка целая.
  logo.addEventListener("click", (e) => {
    if (!header.classList.contains("собрана")) return;
    e.preventDefault();
    header.classList.remove("собрана");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

// ========================================================================
//  ЗАМЕРЫ ДЛЯ СБОРА ШАПКИ
//
//  Два числа, которых нет в стилях, потому что они зависят от раскладки:
//
//  --путь  — сколько правой группе ехать влево, чтобы встать к знаку.
//            Считается как расстояние от её левого края до правого края
//            знака. Едет группа через transform, а не через ширину:
//            ширина — это раскладка, её браузер пересчитывает каждый
//            кадр вместе с размытием прилипшей шапки, и получаются
//            рывки. Transform считает видеокарта.
//
//  --кол и --кол-отступ — ширина и левый край колонки категорий.
//            Собранная шапка встаёт ровно над ней, поэтому и по ширине,
//            и по левому краю должна совпадать: две плитки одна под
//            другой иначе выглядят как случайно разные.
// ========================================================================
function запомнитьШирины(header) {
  const мерить = () => {
    if (!document.body.contains(header)) return;
    const полоса = header.querySelector(".site-header-inner");
    const знак = header.querySelector(".site-logo");
    const группа = header.querySelector(".site-header-right");

    // Путь меряем только у РАЗВЁРНУТОЙ шапки: у собранной группа уже
    // уехала, и замер дал бы ноль — на следующем сворачивании она
    // никуда бы не поехала.
    if (знак && группа && !header.classList.contains("собрана")) {
      const путь = Math.round(группа.getBoundingClientRect().left - знак.getBoundingClientRect().right);
      if (путь > 0) header.style.setProperty("--путь", путь + "px");
    }

    const колонка = document.querySelector(".cat-rail");
    if (колонка && полоса) {
      const к = колонка.getBoundingClientRect();
      const п = полоса.getBoundingClientRect();
      if (к.width > 0) {
        header.style.setProperty("--кол", Math.round(к.width) + "px");
        header.style.setProperty("--кол-отступ", Math.max(0, Math.round(к.left - п.left)) + "px");
      }
    } else {
      // На других страницах колонки нет — знак берёт свою ширину.
      header.style.removeProperty("--кол");
      header.style.removeProperty("--кол-отступ");
    }
  };

  мерить();
  // Шрифт Inter приходит из сети: до него кнопки шире или уже, и
  // померенное «до» было бы неверным.
  try { if (document.fonts && document.fonts.ready) document.fonts.ready.then(мерить); } catch { }
  window.addEventListener("resize", мерить, { passive: true });
  window.addEventListener("hashchange", () => setTimeout(мерить, 50));
  // Колонка категорий появляется ПОСЛЕ загрузки каталога — до неё
  // мерить нечего. Поэтому ещё пара замеров вдогонку.
  setTimeout(мерить, 400);
  setTimeout(мерить, 1500);
}

// ---- Подвал со ссылками на страницы каталога ----
// Обычные ссылки на /c/… — по ним Google с главной находит каталог,
// категории и товары (в самом магазине товары открываются без перехода).
function подвалКаталога() {
  const f = document.createElement("footer");
  f.className = "site-подвал";
  const ссылки = [
    ["/c/", "Каталог запчастей для швейных машин"], ["/c/lapki", "Лапки"], ["/c/igly", "Иглы"],
    ["/c/chelnoki", "Челноки"], ["/c/shpulnye-kolpachki", "Шпульные колпачки"], ["/c/petliteli", "Петлители"],
    ["/c/nozhi", "Ножи"], ["/c/zapchasti-jack", "Запчасти JACK"], ["/uz/c/", "Tikuv mashinasi ehtiyot qismlari"],
    ["/en/c/", "Sewing machine spare parts"], ["/faq", "Вопросы и ответы"],
  ];
  const nav = document.createElement("nav");
  nav.setAttribute("aria-label", "Каталог");
  ссылки.forEach(([href, text], i) => {
    if (i) nav.append(document.createTextNode(" · "));
    const a = document.createElement("a"); a.href = href; a.textContent = text;
    nav.append(a);
  });
  const адрес = document.createElement("div");
  const тел = document.createElement("a"); тел.href = телефонСсылка(); тел.textContent = телефон();
  адрес.append("GENERAL MODERN — швейные запчасти, Ташкент, рынок Абу Сахий · ", тел, " · вт–вс 9:00–17:00");
  f.append(nav, адрес);
  return f;
}

// ---- Router ----
function getRoute() {
  const h = location.hash.replace(/^#\/?/, "") || "catalog";
  return h.split("?")[0];
}

// Позиция прокрутки по каждому разделу — чтобы возврат не начинался «сначала».
// localStorage, а НЕ sessionStorage: sessionStorage стирается при закрытии браузера
// и при выходе из Telegram, поэтому клиент терял своё место.
const SCROLL_KEY = (r) => "gm_scroll_" + r;
const LAST_ROUTE_KEY = "gm_last_route";       // где клиент был в прошлый раз
const RESUME_TTL = 24 * 60 * 60 * 1000;       // возвращаем на место в течение суток
let curRoute = null;
function saveScroll() {
  if (!curRoute) return;
  try { localStorage.setItem(SCROLL_KEY(curRoute), String(window.scrollY || 0)); } catch {}
  rememberRoute();
}
// «последний раздел» пишем сразу при переходе, а не только при прокрутке:
// клиент может открыть раздел и тут же свернуть браузер, не прокрутив ничего.
function rememberRoute() {
  if (!curRoute) return;
  try { localStorage.setItem(LAST_ROUTE_KEY, JSON.stringify({ route: curRoute, at: Date.now() })); } catch {}
}
// куда вернуть клиента, если он открыл сайт без конкретной ссылки
function lastRoute() {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_ROUTE_KEY) || "null");
    if (v && v.route && Date.now() - (v.at || 0) < RESUME_TTL) return v.route;
  } catch {}
  return null;
}
function restoreScrollFor(r) {
  let y = 0;
  try { y = Number(localStorage.getItem(SCROLL_KEY(r))) || 0; } catch {}
  if (y <= 0) return;
  let tries = 0;
  const tick = () => {
    if (++tries > 12) return;
    window.scrollTo(0, y);
    if (Math.abs((window.scrollY || 0) - y) > 4) setTimeout(tick, 60);
  };
  setTimeout(tick, 40);
}

async function route(main) {
  const r = getRoute();
  saveScroll();               // запомнить, где были в предыдущем разделе
  curRoute = r;
  rememberRoute();            // и сразу отметить новый раздел как «последний»
  document.querySelectorAll(".site-nav-link").forEach(a => {
    a.classList.toggle("active", a.getAttribute("href") === "#" + r);
  });
  main.innerHTML = `<div style="padding:60px;text-align:center"><span class="s-spinner" style="width:32px;height:32px;border-width:3px;border-color:rgba(0,0,0,.08);border-top-color:var(--navy);display:inline-block"></span></div>`;
  const inner = document.createElement("div"); inner.className = "site-main";
  try {
    if (r === "catalog") await renderCatalog(inner);
    else if (r === "videos") { if (!isLoggedIn()) { openLogin(); await renderCatalog(inner); } else await renderVideos(inner); }
    else if (r === "order") await renderOrder(inner);
    else if (r === "admin-panel") {
      if (!isAdmin()) { await renderCatalog(inner); }
      else await renderAdminPanel(inner);
    } else if (r === "cabinet") {
      if (!isLoggedIn()) { openLogin(); await renderCatalog(inner); }
      else if (isAdmin()) await renderAdminPanel(inner);
      else await renderCabinet(inner);
    } else await renderCatalog(inner);
  } catch (e) {
    // текст ошибки вставляем как ТЕКСТ (не HTML) — иначе разметка из сообщения попадёт на страницу
    inner.innerHTML = "";
    const box = document.createElement("div"); box.className = "s-empty";
    const p = document.createElement("p"); p.textContent = `${t("errorMsg")}: ${e.message}`;
    box.append(p); inner.append(box);
  }
  // Раздел не подменяется разом, а «наводится на резкость»: приходит из
  // размытия со сдвигом вверх (css/site.css, .site-смена). Такой же переход
  // уже стоит в складе — на сайте его не было, и разделы щёлкали.
  inner.classList.add("site-смена");
  main.innerHTML = ""; main.append(inner);
  restoreScrollFor(r);        // вернуть клиента туда, где он остановился
}

// Продолжить незаконченную регистрацию/вход.
// Два пути возврата клиента:
//  1) кнопка из Telegram-бота — ссылка «/?reg=ТОКЕН». Она нужна именно потому, что
//     встроенный браузер Telegram имеет СВОЁ хранилище: сохранённое в Safari/Chrome
//     состояние там недоступно, и продолжение приходится передавать прямо в ссылке;
//  2) клиент сам вернулся в свою вкладку — берём шаг из localStorage.
function resumeRegistration() {
  if (isLoggedIn()) { clearPendingAuth(); return; }
  let token = "";
  try { token = new URLSearchParams(location.search).get("reg") || ""; } catch {}
  if (token) {
    // убираем токен из адреса, чтобы он не оставался в истории браузера
    try { const u = new URL(location.href); u.searchParams.delete("reg"); history.replaceState(null, "", u.pathname + u.search + u.hash); } catch {}
    openLogin({ mode: "verify", token });
    return;
  }
  const pending = pendingAuth();
  if (pending) openLogin(pending);
}

// ------------------------------------------------------------------
//  СТАРАЯ СТРАНИЦА В ТЕЛЕФОНЕ.
//  Сервер отдаёт страницу без кэша, но телефон держит её в своей памяти:
//  вкладка висит сутками, человек возвращается к ней из Telegram — и
//  видит вчерашний сайт, хотя на сервере уже новый. Склад и приложение
//  это давно ловят (js/version.js), а публичный сайт — нет.
//  Теперь ловит: при запуске и при каждом возврате во вкладку сверяем
//  версию страницы с выложенной и, если разошлись, перезагружаемся один
//  раз. Если перезагрузка не помогла (держит кэш браузера) — показываем
//  полоску с кнопкой.
// ------------------------------------------------------------------
function полоскаОбновления() {
  if (document.getElementById("gm-update-bar")) return;
  const бар = document.createElement("div");
  бар.id = "gm-update-bar";
  бар.style.cssText = "position:fixed;left:12px;right:12px;bottom:14px;z-index:300;display:flex;gap:10px;align-items:center;justify-content:space-between;padding:12px 14px;border-radius:14px;background:var(--navy,#16233b);color:#fff;box-shadow:0 14px 34px rgba(0,0,0,.28);font-size:14px";
  const текст = document.createElement("span");
  текст.textContent = "Вышла новая версия сайта";
  const кнопка = document.createElement("button");
  кнопка.textContent = "Обновить";
  кнопка.style.cssText = "flex:0 0 auto;padding:9px 16px;border-radius:10px;border:0;background:var(--gold,#d9b45a);color:#1c2b4a;font-weight:600;font-size:14px;cursor:pointer";
  кнопка.addEventListener("click", async () => {
    кнопка.disabled = true; кнопка.textContent = "Обновляем…";
    try { if (window.caches) { const k = await caches.keys(); await Promise.all(k.map(x => caches.delete(x))); } } catch {}
    try {
      const r = await navigator.serviceWorker?.getRegistration();
      if (r) await r.unregister();
    } catch {}
    const u = new URL(location.href);
    u.searchParams.set("v", String(Date.now()));
    location.replace(u.toString());
  });
  бар.append(текст, кнопка);
  document.body.append(бар);
}

async function следитьЗаВерсией() {
  try { if (await обновитьЕслиУстарело({ onStale: полоскаОбновления })) return true; } catch {}
  return false;
}

// ---- Boot ----
export async function boot() {
  // Страница могла пролежать во вкладке со вчера — проверяем версию ДО всего
  // остального: перезагрузка всё равно отменит начатую работу.
  if (await следитьЗаВерсией()) return;
  document.addEventListener("visibilitychange", () => { if (!document.hidden) следитьЗаВерсией(); });

  // Визит (время, примерный город по IP, устройство) и разовое уведомление об этом
  отметитьВизит();
  setTimeout(() => уведомлениеОДанных(getLang()), 1500);

  // Применяем сохранённую тему сразу
  const savedTheme = getTheme();
  document.documentElement.setAttribute("data-site-theme", savedTheme);

  // Не ждём: приглашение появляется поверх уже готового сайта и ничего не блокирует.
  // Короткий ролик при входе — новым посетителям; подробная экскурсия —
  // только по кнопке «▶ Как заказать» (или приглашением, если так выбрано в складе).
  try { maybeShowIntro().catch(() => {}); } catch {}
  try { maybeInviteTour().catch(() => {}); } catch {}

  // Заставка уходит, когда первый экран ГОТОВ, а не по таймеру. Раньше тут
  // стояли жёсткие 600 мс: на быстром соединении человек ждал их впустую,
  // на медленном — всё равно видел пустоту после них. Прячем в rebuild(),
  // сразу после отрисовки. Здесь — только страховка: если что-то пойдёт не
  // так и до отрисовки дело не дойдёт, заставка не останется навсегда.
  const loader = document.getElementById("gm-loader");
  const убратьЗаставку = () => { if (loader) loader.classList.add("hide"); };
  if (loader) setTimeout(убратьЗаставку, 8000);

  setAuthChangeCallback(() => { location.reload(); });

  const app = document.getElementById("site-app");
  if (!app) return;

  // Открыли сайт без конкретной ссылки — вернуть в тот раздел, где клиент был
  // в прошлый раз (после закрытия браузера или выхода из Telegram).
  if (!location.hash) {
    const last = lastRoute();
    if (last && last !== "catalog") { try { history.replaceState(null, "", "#" + last); } catch { location.hash = "#" + last; } }
  }

  function rebuild() {
    app.innerHTML = "";
    const main = document.createElement("div"); main.id = "site-main";
    app.append(buildHeader(), main, подвалКаталога());
    const готово = route(main);
    // Шапка и каркас уже в странице — заставке больше нечего закрывать.
    // Без requestAnimationFrame: в фоновой вкладке браузер кадры не рисует,
    // и заставка висела бы до страховочного таймера (проверено — 8 секунд).
    убратьЗаставку();
    return готово;
  }
  перерисоватьСайт = rebuild;
  rebuild();
  window.addEventListener("hashchange", () => route(document.getElementById("site-main") || document.createElement("div")));

  resumeRegistration();   // продолжить незаконченную регистрацию/вход

  // сами управляем позицией прокрутки: браузер не должен сбрасывать её наверх
  try { if ("scrollRestoration" in history) history.scrollRestoration = "manual"; } catch {}
  // запоминаем место при прокрутке, уходе со страницы и переключении в другое приложение
  let _st = 0;
  window.addEventListener("scroll", () => { clearTimeout(_st); _st = setTimeout(saveScroll, 200); }, { passive: true });
  window.addEventListener("pagehide", saveScroll);
  document.addEventListener("visibilitychange", () => { if (document.hidden) saveScroll(); });

  startSessionWatch();
  showOwnerReturnBar();
}

// Плашка «вернуться владельцем», если владелец вошёл как клиент (тест)
function showOwnerReturnBar() {
  const ownerToken = localStorage.getItem("gm_owner_token");
  if (!ownerToken) return;
  const bar = document.createElement("div");
  bar.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:9998;background:#1c2b4a;color:#fff;padding:10px 16px;display:flex;align-items:center;justify-content:center;gap:14px;font-size:14px;box-shadow:0 -4px 16px rgba(0,0,0,.2)";
  const txt = document.createElement("span"); txt.textContent = "Вы вошли как клиент (тест-режим)";
  const btn = document.createElement("button");
  btn.textContent = "← Вернуться владельцем";
  btn.style.cssText = "background:#e3c163;color:#1c2b4a;border:none;border-radius:8px;padding:8px 16px;font-weight:600;cursor:pointer;font-size:13px";
  btn.addEventListener("click", () => {
    localStorage.setItem("gm_client_token", ownerToken);
    localStorage.removeItem("gm_owner_token");
    location.hash = "#admin-panel";
    location.reload();
  });
  bar.append(txt, btn);
  document.body.append(bar);
}

// Одна сессия: если вошли с другого устройства — текущее при ближайшей проверке выкидывает на вход.
function startSessionWatch() {
  let checking = false;
  async function check() {
    if (checking || !isLoggedIn()) return;
    checking = true;
    try { await api.me(); }
    catch (e) {
      // 401 от /me = токен недействителен (истёк или аккаунт удалён)
      if (/автор/i.test(e.message || "")) {
        _clearToken();
        sToast("Сессия истекла — войдите снова", "err");
        setTimeout(() => location.reload(), 1200);
      }
    } finally { checking = false; }
  }
  window.addEventListener("focus", check);
  setInterval(check, 45000);
  check();
}

// PWA/кэш: регистрируем service worker с сетевым приоритетом для кода.
// Без него сайт держал старый JS (nginx отдаёт .js с Cache-Control: immutable на 7 дней).
const _isTGWebApp = !!(window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData);
if (!_isTGWebApp && "serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js?v=263", { updateViaCache: "none" }).catch(() => {}));
  // когда активируется новый SW — страница сама перезагружается со свежим кодом.
  // Только при ОБНОВЛЕНИИ: на самом первом визите работника ещё не было, и
  // clients.claim() тоже вызывает controllerchange — страница и так свежая,
  // а перезагрузка обрывала новому посетителю и первый экран, и вступление.
  const _hadController = !!navigator.serviceWorker.controller;
  let _swRefreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!_hadController) return;
    if (_swRefreshing) return; _swRefreshing = true; location.reload();
  });
}

function logoSvg() {
  return `<svg class="gm-znak" width="36" height="36" viewBox="0 0 512 512" aria-hidden="true">
    <defs>
      <linearGradient id="hst" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#f2f4f9"/><stop offset="1" stop-color="#e4e9f2"/></linearGradient>
      <linearGradient id="hzl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7e9a6"/><stop offset=".42" stop-color="#e3c163"/><stop offset=".74" stop-color="#c79a33"/><stop offset="1" stop-color="#a87b1f"/></linearGradient>
    </defs>
    <rect width="512" height="512" rx="116" fill="url(#hst)"/>
    <rect x="5" y="5" width="502" height="502" rx="111" fill="none" stroke="#c8cedd" stroke-width="5"/>
    <circle class="gm-koltso" cx="256" cy="256" r="182" fill="none" stroke="url(#hzl)" stroke-width="14" stroke-linecap="round" stroke-dasharray="1062 1144"/>
    <text x="256" y="312" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="172" font-weight="700" letter-spacing="-6" fill="#16203a">GM</text>
  </svg>`;
}
