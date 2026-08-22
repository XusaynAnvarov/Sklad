// ========================================================================
//  ТОЧКА ВХОДА АДМИНКИ: авторизация → каркас → роутер
// ========================================================================
import { el, $, reveal, showLoader, hideLoader, toast } from "./ui.js?v=20260822b";
import { обновитьЕслиУстарело } from "./version.js?v=20260822b";
import { icon } from "./icons.js?v=20260822b";
import { db, rawClient } from "./db.js?v=20260822b";
import { ensureAccess, alreadyAuthed, logout } from "./auth.js?v=20260822b";
import { setRates } from "./fx.js?v=20260822b";
// версия в импорте обязательна: без неё CDN отдаёт старый effects.js (там тема по умолчанию была светлой)
import { initTheme, initCursorGlow, initStarfield, makeThemeToggle } from "./effects.js?v=20260822b";
import { applyI18n, makeLangSwitcher } from "./i18n.js?v=20260822b";

import dashboard from "./pages/dashboard.js?v=20260822b";
import products from "./pages/products.js?v=20260822b";
import sales from "./pages/sales.js?v=20260822b";
import purchases from "./pages/purchases.js?v=20260822b";
import customers from "./pages/customers.js?v=20260822b";
import orders from "./pages/orders.js?v=20260822b";
import reports from "./pages/reports.js?v=20260822b";
import catalogPage from "./pages/catalog_admin.js?v=20260822b";
import settings from "./pages/settings.js?v=20260822b";
import siteClients from "./pages/site_clients.js?v=20260822b";
import trash from "./pages/trash.js?v=20260822b";
import videosAdmin from "./pages/videos_admin.js?v=20260822b";
import supplierOrder from "./pages/supplier_order.js?v=20260822b";
import stockCheck from "./pages/stock_check.js?v=20260822b";

const NAV = [
  { id: "dashboard",    label: "Дашборд",        ic: "dashboard", render: dashboard },
  { id: "products",     label: "Товары",          ic: "box",       render: products },
  { id: "stock_check",  label: "Проверка склада", ic: "check",     render: stockCheck },
  { id: "sales",        label: "Продажи",         ic: "receipt",   render: sales },
  { id: "purchases",    label: "Приход",          ic: "truck",     render: purchases },
  { id: "supplier_order", label: "Заказ поставщику", ic: "truck",   render: supplierOrder },
  { id: "customers",    label: "Клиенты",         ic: "user",      render: customers },
  { id: "orders",       label: "Заказы",          ic: "cart",      render: orders },
  { id: "reports",      label: "Отчёты",          ic: "chart",     render: reports },
  { id: "catalog",      label: "Каталог",         ic: "globe",     render: catalogPage },
  { id: "videos",       label: "Видео",           ic: "broadcast", render: videosAdmin },
  { id: "site_clients", label: "Клиенты сайта",   ic: "broadcast", render: siteClients },
  { id: "trash",        label: "Корзина",         ic: "trash",     render: trash },
  { id: "settings",     label: "Настройки",       ic: "settings",  render: settings },
];

const root = document.getElementById("root");
let ctx;

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
  await db.ready;
  // Кастомный admin JWT (вход через /api/admin-auth) — сессии Supabase нет и не нужна
  const hasAdminToken = !!localStorage.getItem("sklad_admin_token");
  if (db.mode === "supabase" && !hasAdminToken) {
    try { const { data } = await rawClient().auth.getSession(); if (!data || !data.session) { localStorage.removeItem("sklad_authed"); } } catch { localStorage.removeItem("sklad_authed"); }
  }
  if (!alreadyAuthed()) await ensureAccess(root);
  // загрузка настроек и курсов (после логина — есть токен)
  try {
    const s = await db.getSettings();
    setRates(s);
    // канал для накладных кладём рядом: отправка в Telegram берёт его отсюда,
    // чтобы не тянуть настройки из облака на каждое нажатие «Отправить»
    if (s && s.telegram_channel) { try { localStorage.setItem("gm_tg_channel", String(s.telegram_channel).trim()); } catch { } }
  } catch (e) { console.warn(e); }
  buildShell();
  route();
  // счётчик новых заказов из бота
  try { const sales = await db.sales.list(); ctx.setNavBadge("orders", sales.filter(s => s.status === "order").length); } catch {}
}

function buildShell() {
  root.innerHTML = "";
  const sidebar = el("aside.sidebar");
  sidebar.append(el("div.brand", {}, [icon("box", { size: 22 }), el("span", { text: "Мой Склад" })]));
  sidebar.append(el("div.profile-chip", {}, [
    el("div.avatar", {}, [icon("user", { size: 18 })]),
    el("div", { style: { minWidth: "0" } }, [
      el("div.pname", { text: "Владелец" }),
      el("div.ptag", {}, [el("span.dot"), "Online · PRO"]),
    ]),
  ]));
  NAV.forEach(n => {
    sidebar.append(el("div.navitem", {
      "data-id": n.id,
      onclick: () => { location.hash = "#/" + n.id; if (window.innerWidth <= 860) sidebar.classList.remove("open"); },
    }, [el("span.ic", {}, [icon(n.ic, { size: 18 })]), el("span", { text: n.label }), el("span.nav-badge", { "data-badge": n.id, style: { display: "none" } })]));
  });
  sidebar.append(el("div.mode-tag", {}, [icon(db.mode === "supabase" ? "cloud" : "database", { size: 13 }), " ", db.mode === "supabase" ? "Онлайн (Supabase)" : "Локальный режим"]));
  sidebar.append(makeLangSwitcher(() => applyI18n(document.body)));
  sidebar.append(makeThemeToggle());
  sidebar.append(el("a.theme-toggle", { href: "/", style: { marginTop: "6px", textDecoration: "none", display: "flex", alignItems: "center", gap: "6px" } }, [icon("globe", { size: 15 }), el("span", { text: "На сайт" })]));
  sidebar.append(el("button.theme-toggle", { text: "Выход", onclick: logout, style: { marginTop: "4px" } }));

  const main = el("main.main", { id: "view" });
  const app = el("div.app", {}, [sidebar, main]);
  root.append(app);

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

async function route() {
  const id = (location.hash.replace(/^#\/?/, "") || "dashboard").split("?")[0];
  const item = NAV.find(n => n.id === id) || NAV[0];
  $$(".navitem").forEach(n => n.classList.toggle("active", n.getAttribute("data-id") === item.id));
  const view = $("#view");
  view.innerHTML = "";
  const page = el("div.page-enter");
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
  reveal(view);
  applyI18n(document.body);
  labelTableCells(view);   // подписи для «карточного» вида таблиц на телефоне
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
// сторож: если за 15с приложение не построилось (завис await в boot) — показываем ошибку
setTimeout(() => { if (!document.querySelector(".app")) showBootError(new Error("Загрузка зависла. Нажмите «Сбросить кэш» — это очистит устаревший кэш и Service Worker.")); }, 15000);

// PWA: регистрация service worker (оффлайн-оболочка, установка на телефон)
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js?v=141", { updateViaCache: "none" }).catch(() => {}));
  // когда активируется новый SW — страница сама перезагружается со свежим кодом (без DevTools)
  let _swRefreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (_swRefreshing) return; _swRefreshing = true; location.reload();
  });
}
