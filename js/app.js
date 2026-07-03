// ========================================================================
//  ТОЧКА ВХОДА АДМИНКИ: авторизация → каркас → роутер
// ========================================================================
import { el, $, reveal, showLoader, hideLoader } from "./ui.js";
import { icon } from "./icons.js";
import { db, rawClient } from "./db.js";
import { ensureAccess, alreadyAuthed, logout } from "./auth.js?v=20260623b";
import { setRates } from "./fx.js";
import { initTheme, initCursorGlow, initStarfield, makeThemeToggle } from "./effects.js";
import { applyI18n, makeLangSwitcher } from "./i18n.js";

import dashboard from "./pages/dashboard.js";
import products from "./pages/products.js";
import sales from "./pages/sales.js";
import purchases from "./pages/purchases.js";
import customers from "./pages/customers.js";
import orders from "./pages/orders.js";
import reports from "./pages/reports.js";
import catalogPage from "./pages/catalog_admin.js";
import settings from "./pages/settings.js";
import siteClients from "./pages/site_clients.js";
import trash from "./pages/trash.js";
import videosAdmin from "./pages/videos_admin.js";

const NAV = [
  { id: "dashboard",    label: "Дашборд",        ic: "dashboard", render: dashboard },
  { id: "products",     label: "Товары",          ic: "box",       render: products },
  { id: "sales",        label: "Продажи",         ic: "receipt",   render: sales },
  { id: "purchases",    label: "Приход",          ic: "truck",     render: purchases },
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
  try { const s = await db.getSettings(); setRates(s); } catch (e) { console.warn(e); }
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
}
function $$(s){return [...document.querySelectorAll(s)];}

boot();

// PWA: регистрация service worker (оффлайн-оболочка, установка на телефон)
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js?v=59", { updateViaCache: "none" }).catch(() => {}));
  // когда активируется новый SW — страница сама перезагружается со свежим кодом (без DevTools)
  let _swRefreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (_swRefreshing) return; _swRefreshing = true; location.reload();
  });
}
