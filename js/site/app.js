// SPA-роутер публичного сайта: шапка, корзина, темы, языки, панель
import { isLoggedIn, clearToken as _clearToken, api } from "./api.js?v=20260822c";
import { renderCatalog } from "./catalog.js?v=20260822c";
import { renderVideos } from "./videos.js?v=20260822c";
import { renderCabinet } from "./cabinet.js?v=20260822c";
import { renderAdminPanel } from "./admin-panel.js?v=20260822c";
import { renderOrder } from "./order.js?v=20260822c";
import { setAuthChangeCallback, openLogin, logout as _logout, pendingAuth, clearPendingAuth } from "./auth.js?v=20260822c";

// ---- Translations ----
const TRANSLATIONS = {
  ru: {
    catalog: "Каталог", cabinet: "Кабинет", login: "Войти", logout: "Выйти",
    warehouse: "Склад", adminPanel: "Панель", cart: "Корзина", cartEmpty: "Корзина пуста", order: "Заказать",
    checkout: "Оформить заказ", priceNote: "Цены уточнит менеджер",
    orderSent: "Заказ отправлен! Менеджер свяжется с вами.",
    sending: "Отправляем…", addToCart: "В корзину", inCart: "В корзине",
    addedToCart: "добавлен в корзину",
    noStock: "Нет в наличии", loginToOrder: "Войти для заказа",
    inStockBadge: "В наличии", noStockBadge: "Нет в наличии", soonBadge: "Скоро", newBadge: "Новинка",
    heroTitle: "Оборудование для вашего бизнеса",
    heroSub: "Профессиональная техника General Modern. Широкий ассортимент по лучшим ценам.",
    heroCta: "Смотреть каталог",
    authModal: "Войти / Зарегистрироваться", errorMsg: "Ошибка",
  },
  uz: {
    catalog: "Katalog", cabinet: "Kabinet", login: "Kirish", logout: "Chiqish",
    warehouse: "Ombor", adminPanel: "Panel", cart: "Savat", cartEmpty: "Savat bo'sh", order: "Buyurtma berish",
    checkout: "Buyurtma berish", priceNote: "Narxni menejer aniqlashtiradi",
    orderSent: "Buyurtma yuborildi! Menejer siz bilan bog'lanadi.",
    sending: "Yuborilmoqda…", addToCart: "Savatga", inCart: "Savatda",
    addedToCart: "savatga qo'shildi",
    noStock: "Mavjud emas", loginToOrder: "Kirish va buyurtma berish",
    inStockBadge: "Mavjud", noStockBadge: "Mavjud emas", soonBadge: "Tez kunda", newBadge: "Yangi",
    heroTitle: "Biznesingiz uchun uskunalar",
    heroSub: "General Modern'dan professional texnika. Keng assortiment, eng yaxshi narxlar.",
    heroCta: "Katalogni ko'rish",
    authModal: "Kirish / Ro'yxatdan o'tish", errorMsg: "Xato",
  },
  en: {
    catalog: "Catalog", cabinet: "Cabinet", login: "Login", logout: "Logout",
    warehouse: "Warehouse", adminPanel: "Panel", cart: "Cart", cartEmpty: "Cart is empty", order: "Order",
    checkout: "Place Order", priceNote: "Manager will confirm prices",
    orderSent: "Order sent! A manager will contact you.",
    sending: "Sending…", addToCart: "Add to Cart", inCart: "In Cart",
    addedToCart: "added to cart",
    noStock: "Out of Stock", loginToOrder: "Login to Order",
    inStockBadge: "In Stock", noStockBadge: "Out of Stock", soonBadge: "Coming Soon", newBadge: "New",
    heroTitle: "Equipment for Your Business",
    heroSub: "Professional equipment from General Modern. Wide range at the best prices.",
    heroCta: "Browse catalog",
    authModal: "Sign In / Register", errorMsg: "Error",
  },
};
export function getLang() { return localStorage.getItem("gm_lang") || "ru"; }
export function setLang(l) { localStorage.setItem("gm_lang", l); }
export function t(key) { return (TRANSLATIONS[getLang()] || TRANSLATIONS.ru)[key] || key; }

// ---- Theme ----
// по умолчанию — тёмная тема («чёрный и золото»).
// Разовый переход на новый дизайн: у тех, кто раньше выбрал светлую, включаем тёмную
// один раз (метка gm_theme_v2), дальше выбор пользователя снова уважается.
export function getTheme() {
  try {
    if (!localStorage.getItem("gm_theme_v2")) {
      localStorage.setItem("gm_site_theme", "dark");
      localStorage.setItem("gm_theme_v2", "1");
    }
  } catch {}
  return localStorage.getItem("gm_site_theme") || "dark";
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

// ---- Cart state ----
let cart = JSON.parse(localStorage.getItem("gm_cart") || "[]");
function saveCart() { localStorage.setItem("gm_cart", JSON.stringify(cart)); document.dispatchEvent(new CustomEvent("gm:cart-change")); updateCartBadge(); }
export function cartState() { return cart; }
export function cartAdd(product) {
  const ex = cart.find(i => i.id === product.id);
  if (ex) ex.qty++; else cart.push({ id: product.id, name: product.name, photo_url: product.photo_url || null, qty: 1 });
  saveCart();
}
export function cartRemove(id) { cart = cart.filter(i => i.id !== id); saveCart(); }
export function cartSetQty(id, qty) {
  const ex = cart.find(i => i.id === id);
  if (!ex) return;
  if (qty <= 0) { cartRemove(id); return; }
  ex.qty = qty; saveCart();
}
export function cartQty(id) { return (cart.find(i => i.id === id) || {}).qty || 0; }
export function cartCount() { return cart.reduce((s, i) => s + i.qty, 0); }

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

// ---- Cart Drawer ----
let cartDrawer, cartOverlay;
function buildCartDrawer() {
  cartOverlay = document.createElement("div"); cartOverlay.className = "cart-overlay";
  cartDrawer = document.createElement("div"); cartDrawer.className = "cart-drawer";
  cartOverlay.append(cartDrawer);
  document.body.append(cartOverlay);
  cartOverlay.addEventListener("click", (e) => { if (e.target === cartOverlay) closeCartDrawer(); });
}
function openCartDrawer() { renderCartDrawerContent(); cartOverlay.classList.add("open"); }
function closeCartDrawer() { cartOverlay.classList.remove("open"); }
export function renderCartDrawer() { if (cartOverlay?.classList.contains("open")) renderCartDrawerContent(); }

function renderCartDrawerContent() {
  cartDrawer.innerHTML = "";
  const head = document.createElement("div"); head.className = "cart-drawer-head";
  const h2 = document.createElement("h2");
  h2.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg> ${t("cart")}`;
  const closeBtn = document.createElement("button"); closeBtn.className = "cart-close";
  closeBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  closeBtn.addEventListener("click", closeCartDrawer);
  head.append(h2, closeBtn);
  cartDrawer.append(head);

  const items = document.createElement("div"); items.className = "cart-items";
  if (!cart.length) {
    items.innerHTML = `<div class="cart-empty"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg><p>${t("cartEmpty")}</p></div>`;
  } else {
    cart.forEach(it => {
      const row = document.createElement("div"); row.className = "cart-item";
      const imgEl = document.createElement("div");
      imgEl.style.cssText = "width:56px;height:56px;border-radius:10px;background:var(--bg2);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0";
      if (it.photo_url) { const img = document.createElement("img"); img.src = it.photo_url; img.style.cssText = "width:100%;height:100%;object-fit:cover"; imgEl.append(img); }
      else imgEl.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".4"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>`;
      const info = document.createElement("div"); info.className = "cart-item-info";
      const name = document.createElement("div"); name.className = "cart-item-name"; name.textContent = it.name;
      const qtyRow = document.createElement("div"); qtyRow.className = "cart-item-qty";
      const minus = document.createElement("button"); minus.className = "qty-btn"; minus.textContent = "−";
      minus.addEventListener("click", () => { cartSetQty(it.id, it.qty - 1); renderCartDrawerContent(); document.dispatchEvent(new CustomEvent("gm:cart-change")); });
      const qtyVal = document.createElement("span"); qtyVal.className = "qty-val"; qtyVal.textContent = it.qty;
      const plus = document.createElement("button"); plus.className = "qty-btn"; plus.textContent = "+";
      plus.addEventListener("click", () => { cartSetQty(it.id, it.qty + 1); renderCartDrawerContent(); document.dispatchEvent(new CustomEvent("gm:cart-change")); });
      qtyRow.append(minus, qtyVal, plus);
      info.append(name, qtyRow);
      const del = document.createElement("button"); del.className = "cart-item-remove";
      del.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
      del.addEventListener("click", () => { cartRemove(it.id); renderCartDrawerContent(); document.dispatchEvent(new CustomEvent("gm:cart-change")); });
      row.append(imgEl, info, del);
      items.append(row);
    });
  }
  cartDrawer.append(items);

  if (cart.length) {
    const footer = document.createElement("div"); footer.className = "cart-footer";
    const info = document.createElement("div"); info.style.cssText = "font-size:13px;color:var(--muted);text-align:center";
    info.textContent = t("priceNote");
    const orderBtn = document.createElement("button"); orderBtn.className = "btn-primary"; orderBtn.style.width = "100%";
    orderBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> ${t("checkout")}`;
    orderBtn.addEventListener("click", async () => {
      if (!isLoggedIn()) { closeCartDrawer(); openLogin(); return; }
      orderBtn.disabled = true; orderBtn.innerHTML = `<span class="s-spinner"></span> ${t("sending")}`;
      try {
        const { api: siteApi } = await import("./api.js?v=20260822c");
        await siteApi.placeOrder(cart.map(i => ({ product_id: i.id, qty: i.qty })));
        cart = []; saveCart();
        closeCartDrawer();
        sToast(t("orderSent"), "ok");
      } catch (e) {
        sToast(e.message, "err");
        orderBtn.disabled = false; orderBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> ${t("checkout")}`;
      }
    });
    footer.append(info, orderBtn);
    cartDrawer.append(footer);
  }
}

// ---- updateCartBadge ----
function updateCartBadge() {
  const count = cartCount();
  document.querySelectorAll(".cart-count").forEach(el => {
    el.textContent = count;
    el.classList.toggle("zero", count === 0);
  });
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
    opt.innerHTML = `<span style="font-weight:700;font-size:11px;letter-spacing:.05em;min-width:24px">${code.toUpperCase()}</span> <span style="font-weight:500">${label}</span>`;
    opt.addEventListener("click", () => {
      if (getLang() === code) { dropdown.classList.remove("open"); btn.classList.remove("open"); return; }
      setLang(code);
      location.reload();
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
  btn.addEventListener("click", () => {
    toggleTheme();
    const isDark = getTheme() === "dark";
    btn.title = isDark ? "Светлая тема" : "Тёмная тема";
  });
  return btn;
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

  const right = document.createElement("div"); right.className = "site-header-right";

  // Кнопка «Заказать» (вместо корзины) — ведёт на страницу-форму заказа
  const orderBtn = document.createElement("button"); orderBtn.className = "btn-primary"; orderBtn.style.cssText = "padding:8px 16px;font-size:13px;font-weight:600";
  orderBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg> ${t("order") || "Заказать"}`;
  orderBtn.addEventListener("click", () => { location.hash = "#order"; });

  right.append(orderBtn);

  // Кнопка "Склад" — только для администратора (доступ по JWT phone)
  if (isAdmin()) {
    const skladBtn = document.createElement("a"); skladBtn.href = "/admin";
    skladBtn.className = "btn-warehouse";
    skladBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg> ${t("warehouse")}`;
    right.append(skladBtn);
  }

  // Telegram-бот — иконка-ссылка (видна всем)
  const tgLink = document.createElement("a");
  tgLink.href = (window.APP_CONFIG && window.APP_CONFIG.TELEGRAM_BOT_URL) || "https://t.me/generalmodernbot";
  tgLink.target = "_blank"; tgLink.rel = "noopener";
  tgLink.className = "site-tg-link"; tgLink.title = "Наш Telegram-бот"; tgLink.setAttribute("aria-label", "Telegram-бот");
  tgLink.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71l-4.14-3.05-1.99 1.93c-.23.23-.42.42-.83.42z"/></svg>`;
  right.append(tgLink);

  // Theme + Lang
  right.append(buildThemeToggle(), buildLangSwitcher());

  if (isLoggedIn()) {
    if (isAdmin()) {
      const panelBtn = document.createElement("button"); panelBtn.className = "btn-navy"; panelBtn.style.cssText = "padding:8px 16px;font-size:13px";
      panelBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> ${t("adminPanel")}`;
      panelBtn.addEventListener("click", () => { location.hash = "#admin-panel"; });
      right.append(panelBtn);
    } else {
      const cabinetBtn = document.createElement("button"); cabinetBtn.className = "btn-navy"; cabinetBtn.style.cssText = "padding:8px 16px;font-size:13px";
      cabinetBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ${t("cabinet")}`;
      cabinetBtn.addEventListener("click", () => { location.hash = "#cabinet"; });
      right.append(cabinetBtn);
    }
    const logoutBtn = document.createElement("button"); logoutBtn.className = "btn-ghost"; logoutBtn.style.cssText = "padding:8px 14px;font-size:13px";
    logoutBtn.textContent = t("logout");
    logoutBtn.addEventListener("click", () => { _logout(); location.hash = "#catalog"; location.reload(); });
    right.append(logoutBtn);
  } else {
    const loginBtn = document.createElement("button"); loginBtn.className = "btn-primary"; loginBtn.style.cssText = "padding:9px 18px;font-size:13px";
    loginBtn.textContent = t("login");
    loginBtn.addEventListener("click", openLogin);
    right.append(loginBtn);
  }

  inner.append(logo, nav, right);
  header.append(inner);
  return header;
}

// ---- Router ----
function getRoute() {
  const h = location.hash.replace(/^#\/?/, "") || "catalog";
  return h.split("?")[0];
}

// Волна от точки нажатия (материальный отклик). Один слушатель на весь документ.
function initRipple() {
  const SEL = ".btn-primary,.btn-navy,.btn-ghost,.btn-add-cart,.filter-chip,.cabinet-nav-item,.cart-btn";
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

// ---- Boot ----
export async function boot() {
  // Применяем сохранённую тему сразу
  const savedTheme = getTheme();
  document.documentElement.setAttribute("data-site-theme", savedTheme);

  const loader = document.getElementById("gm-loader");
  if (loader) setTimeout(() => loader.classList.add("hide"), 600);

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
    app.append(buildHeader(), main);
    route(main);
  }
  rebuild();
  window.addEventListener("hashchange", () => route(document.getElementById("site-main") || document.createElement("div")));

  resumeRegistration();   // продолжить незаконченную регистрацию/вход
  initRipple();           // волна от точки нажатия на кнопках

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
  const txt = document.createElement("span"); txt.textContent = "👁 Вы вошли как клиент (тест-режим)";
  const btn = document.createElement("button");
  btn.textContent = "← Вернуться владельцем";
  btn.style.cssText = "background:#e3c163;color:#1c2b4a;border:none;border-radius:8px;padding:7px 14px;font-weight:700;cursor:pointer;font-size:13px";
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
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js?v=142", { updateViaCache: "none" }).catch(() => {}));
  // когда активируется новый SW — страница сама перезагружается со свежим кодом
  let _swRefreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (_swRefreshing) return; _swRefreshing = true; location.reload();
  });
}

function logoSvg() {
  return `<svg width="36" height="36" viewBox="0 0 512 512"><defs><linearGradient id="hnv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22324f"/><stop offset="1" stop-color="#141f33"/></linearGradient><linearGradient id="hgd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7e9a6"/><stop offset=".5" stop-color="#e3c163"/><stop offset="1" stop-color="#a87b1f"/></linearGradient></defs><rect width="512" height="512" rx="100" fill="url(#hnv)"/><circle cx="256" cy="256" r="182" fill="none" stroke="url(#hgd)" stroke-width="10"/><text x="256" y="312" text-anchor="middle" font-family="Georgia,serif" font-size="168" font-weight="700" fill="url(#hgd)">GM</text></svg>`;
}
