// ========================================================================
//  ПУБЛИЧНЫЙ КАТАЛОГ — только фото, название, категория и статус (без цен)
// ========================================================================
import { initCursorGlow, initTheme, initStarfield, makeThemeToggle } from "./effects.js";
import { applyI18n, makeLangSwitcher } from "./i18n.js";
import { iconSvg } from "./icons.js";

// увеличение фото по клику (повторный клик — закрыть)
function openLightbox(src) {
  const box = document.createElement("div");
  box.className = "lightbox";
  const img = document.createElement("img");
  img.src = src; box.append(img);
  box.addEventListener("click", () => { box.classList.remove("show"); setTimeout(() => box.remove(), 250); });
  document.body.append(box);
  requestAnimationFrame(() => box.classList.add("show"));
}

// галерея нескольких фото (стрелки + свайп)
function openGallery(photos, start, name) {
  if (!photos || !photos.length) return;
  if (photos.length === 1) return openLightbox(photos[0]);
  let idx = start || 0;
  const box = document.createElement("div");
  box.className = "lightbox";
  const img = document.createElement("img");
  img.addEventListener("click", (e) => e.stopPropagation());
  const counter = document.createElement("div");
  counter.style.cssText = "position:absolute;bottom:18px;left:0;right:0;text-align:center;color:#fff;font-size:14px";
  const prev = document.createElement("button"); prev.textContent = "‹";
  const next = document.createElement("button"); next.textContent = "›";
  [prev, next].forEach(b => b.style.cssText = "position:absolute;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.16);color:#fff;border:none;font-size:42px;width:54px;height:74px;border-radius:12px;cursor:pointer;line-height:1;z-index:2");
  prev.style.left = "12px"; next.style.right = "12px";
  function show() { img.src = photos[idx]; counter.textContent = (name ? name + " · " : "") + (idx + 1) + " / " + photos.length; }
  function go(d, e) { if (e) e.stopPropagation(); idx = (idx + d + photos.length) % photos.length; show(); }
  prev.addEventListener("click", (e) => go(-1, e)); next.addEventListener("click", (e) => go(1, e));
  function close() { document.removeEventListener("keydown", onKey); box.classList.remove("show"); setTimeout(() => box.remove(), 250); }
  const onKey = (e) => { if (e.key === "ArrowLeft") go(-1); else if (e.key === "ArrowRight") go(1); else if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  box.addEventListener("click", close);
  let sx = 0;
  box.addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; }, { passive: true });
  box.addEventListener("touchend", (e) => { const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); });
  box.append(img, counter, prev, next);
  document.body.append(box);
  show();
  requestAnimationFrame(() => box.classList.add("show"));
}

const cfg = window.APP_CONFIG || {};
const useSupabase = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);

function placeholder(name = "?") {
  const ch = encodeURIComponent((name[0] || "?").toUpperCase());
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect width='200' height='200' fill='%23f1ebdc'/%3E%3Ctext x='50%25' y='54%25' font-size='90' fill='%23c9c0a8' text-anchor='middle' font-family='sans-serif'%3E${ch}%3C/text%3E%3C/svg%3E`;
}

async function loadItems() {
  const norm = (d) => ({ id: d.id, name: d.name, category: d.category, photo_url: d.photo_url, photos: (Array.isArray(d.photos) && d.photos.length) ? d.photos : (d.photo_url ? [d.photo_url] : []), status: d.status, is_new: !!d.is_new, week_sold: Number(d.week_sold) || 0 });
  if (useSupabase) {
    // публичный API (отдаёт все фото товара)
    try {
      const r = await fetch("/api/catalog");
      if (r.ok) { const data = await r.json(); if (Array.isArray(data)) return data.map(norm); }
    } catch {}
  }
  // локальный режим: берём из того же хранилища, что и админка, БЕЗ цен
  const raw = localStorage.getItem("sklad_db_v1");
  const store = raw ? JSON.parse(raw) : { products: [] };
  return (store.products || []).map(p => {
    const ref = Math.max(p.created_at ? +new Date(p.created_at) : 0, p.last_arrival_at ? +new Date(p.last_arrival_at) : 0);
    return {
      id: p.id, name: p.name, category: p.category, photo_url: p.photo_url,
      photos: (Array.isArray(p.photos) && p.photos.length) ? p.photos : (p.photo_url ? [p.photo_url] : []),
      status: p.status_override || (Number(p.stock_qty) > 0 ? "in_stock" : "on_order"),
      is_new: ref > 0 && (Date.now() - ref) / 86400000 <= 7,
      week_sold: 0,
    };
  });
}

const grid = document.getElementById("grid");
const catSelect = document.getElementById("catSelect");
const search = document.getElementById("search");
let items = [], query = "", selectedCat = "all";
const slug = (s) => "cat-" + encodeURIComponent((s || "no-cat").toLowerCase().replace(/\s+/g, "-")).replace(/%/g, "");

// Владелец (только он видит кнопку «Скачать PDF»): вошёл в админку на этом
// устройстве (localStorage) ИЛИ открыл каталог с секретным ключом ?key=…
function isOwner() {
  try { if (localStorage.getItem("sklad_authed") === "1") return true; } catch {}
  const k = new URLSearchParams(location.search).get("key") || (location.hash.match(/key=([^&]+)/) || [])[1];
  return !!(k && cfg.SECRET_KEY && k === cfg.SECRET_KEY);
}

// --- режим заказа (Telegram Mini App) ---
const TG = window.Telegram && window.Telegram.WebApp;
const orderMode = !!(TG && TG.initData);   // открыто как Mini App с подписью
const cart = new Map();                     // id → qty
const byId = (id) => items.find(p => String(p.id) === String(id));

function statusBadge(status) {
  return status === "in_stock"
    ? `<span class="badge ok">${iconSvg("check", { size: 13 })} Есть в наличии</span>`
    : `<span class="badge order">${iconSvg("x", { size: 13 })} Нет в наличии</span>`;
}

function cardHtml(p, i) {
  const id = escapeHtml(String(p.id));
  const qty = cart.get(String(p.id)) || 0;
  // в режиме заказа: товар в наличии — поле «кол-во» + «В корзину»;
  // нет в наличии — заказать НЕЛЬЗЯ (кнопка неактивна)
  const inStock = p.status === "in_stock";
  const addRow = orderMode
    ? (inStock
      ? `<div class="add-row">
        <input class="qty-inp" type="number" inputmode="numeric" min="1" placeholder="Кол-во" data-id="${id}" />
        <button class="add-btn" data-id="${id}">＋ В корзину</button>
        <span class="in-cart" data-cart="${id}"${qty > 0 ? "" : ' style="display:none"'}>×${qty}</span>
      </div>`
      : `<div class="add-row"><button class="add-btn off" type="button" disabled>Нет в наличии</button></div>`)
    : "";
  const np = (p.photos && p.photos.length) ? p.photos.length : (p.photo_url ? 1 : 0);
  const mainPhoto = (p.photos && p.photos.length) ? p.photos[0] : p.photo_url;
  return `<div class="prod reveal" data-id="${id}" style="animation-delay:${(i % 12) * 0.03}s">
      <div style="position:relative">
        <img class="ph" loading="lazy" src="${mainPhoto || placeholder(p.name)}" onerror="this.src='${placeholder(p.name)}'" />
        ${np > 1 ? `<span style="position:absolute;left:8px;bottom:8px;background:rgba(0,0,0,.62);color:#fff;font-size:12px;font-weight:600;padding:3px 8px;border-radius:20px">📷 ${np}</span>` : ""}
        ${p.is_new ? `<span style="position:absolute;right:8px;top:8px;background:var(--accent,#4f7cf0);color:#fff;font-size:11px;font-weight:700;padding:3px 9px;border-radius:20px">Новый</span>` : ""}
      </div>
      <div class="body">
        <div class="nm">${escapeHtml(p.name)}</div>
        <div class="cat">${escapeHtml(p.category || "")}</div>
        ${p.week_sold > 0 ? `<div style="font-size:12px;font-weight:600;color:#e8810c;margin-top:3px">🔥 За неделю: ${p.week_sold} шт</div>` : ""}
        <div style="margin-top:auto">${statusBadge(p.status)}</div>
        ${addRow}
      </div></div>`;
}

// Группировка по категориям: по алфавиту, «Без категории» — в конец.
// list по умолчанию — все товары (для PDF); для сайта передаём отфильтрованный.
function groupByCategory(list = items) {
  const map = new Map();
  list.forEach(p => {
    const key = (p.category && String(p.category).trim()) || "Без категории";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  });
  // внутри каждой категории — хиты недели вверх (по убыванию недельных продаж)
  for (const arr of map.values()) arr.sort((a, b) => (Number(b.week_sold) || 0) - (Number(a.week_sold) || 0));
  const groups = [...map.entries()].sort((a, b) => {
    if (a[0] === "Без категории") return 1;
    if (b[0] === "Без категории") return -1;
    return a[0].localeCompare(b[0], "ru");
  });
  // новинки (последние 7 дней) — отдельной секцией сверху, когда не выбрана конкретная категория
  if (selectedCat === "all") {
    const news = list.filter(p => p.is_new);
    if (news.length) groups.unshift(["🆕 Новинки", news]);
  }
  return groups;
}

const catKey = (p) => (p.category && String(p.category).trim()) || "Без категории";

// Фильтр: выбранная категория (выпадающий список) + поисковый запрос.
function filteredItems() {
  const q = query.trim().toLowerCase();
  return items.filter(p =>
    (selectedCat === "all" || catKey(p) === selectedCat) &&
    (!q || (p.name || "").toLowerCase().includes(q) || (p.category || "").toLowerCase().includes(q)));
}

// Выпадающий список категорий (строится один раз).
function buildCatSelect() {
  if (!catSelect || catSelect.dataset.built) return;
  const counts = {};
  items.forEach(p => { const k = catKey(p); counts[k] = (counts[k] || 0) + 1; });
  const cats = Object.keys(counts).sort((a, b) => {
    if (a === "Без категории") return 1; if (b === "Без категории") return -1;
    return a.localeCompare(b, "ru");
  });
  catSelect.innerHTML = `<option value="all">Все категории (${items.length})</option>` +
    cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)} (${counts[c]})</option>`).join("");
  catSelect.dataset.built = "1";
  catSelect.addEventListener("change", () => { selectedCat = catSelect.value; draw(); window.scrollTo({ top: 0, behavior: "smooth" }); });
}

function draw() {
  buildCatSelect();
  const list = filteredItems();
  const groups = groupByCategory(list);
  grid.innerHTML = "";
  if (!items.length) { grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="em-ic">📦</div><p>Каталог пуст</p></div>`; return; }
  if (!list.length) { grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="em-ic">🔍</div><p>Ничего не найдено</p></div>`; return; }
  let gi = 0;
  groups.forEach(([cat, items_]) => {
    const section = document.createElement("section");
    section.className = "cat-section";
    section.id = slug(cat);
    section.innerHTML = `<h2 class="cat-section-h">${escapeHtml(cat)} <span>${items_.length}</span></h2>
      <div class="cat-grid">${items_.map(p => cardHtml(p, gi++)).join("")}</div>`;
    grid.append(section);
  });
  requestAnimationFrame(() => grid.querySelectorAll(".reveal").forEach((n, i) => setTimeout(() => n.classList.add("in"), Math.min(i, 30) * 25)));
  applyI18n(document.body);
}

function escapeHtml(s) { return (s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

// Кнопка «Скачать каталог (PDF)» — только для владельца, генерация на клиенте.
function wirePdfButton() {
  const btn = document.getElementById("pdfBtn");
  if (!btn) return;
  if (orderMode || !isOwner()) { btn.style.display = "none"; return; }  // клиентам — нельзя
  btn.style.display = "";  // владельцу — показать
  const label = btn.innerHTML;
  btn.addEventListener("click", async () => {
    if (!items.length) return;
    btn.disabled = true;
    try {
      const m = await import("./catalog-pdf.js");
      await m.downloadCatalogPDF(groupByCategory(items), (done, total) => {   // PDF — всегда все товары
        btn.textContent = `Готовим PDF… ${done}/${total}`;
      });
    } catch (e) {
      alert("Не удалось сделать PDF: " + e.message);
    } finally {
      btn.innerHTML = label; btn.disabled = false;
    }
  });
}

// ---------- корзина (режим заказа) ----------
function qrowInner(qty) {
  return qty > 0
    ? `<button class="qbtn minus">−</button><input class="qinp" type="number" inputmode="numeric" min="0" value="${qty}"><button class="qbtn plus">＋</button>`
    : `<button class="qbtn add plus">＋ В заказ</button>`;
}
function setQty(id, qty) {
  id = String(id);
  qty = Math.max(0, Math.min(100000, Math.floor(Number(qty) || 0)));
  if (qty <= 0) cart.delete(id); else cart.set(id, qty);
  // обновить маленький бейдж кол-ва на карточке
  const badge = grid.querySelector(`.in-cart[data-cart="${CSS.escape(id)}"]`);
  if (badge) { const n = cart.get(id) || 0; badge.textContent = "×" + n; badge.style.display = n > 0 ? "" : "none"; }
  updateCartBar();
  if (document.getElementById("orderview")?.classList.contains("show")) renderOrderView();
}
function updateCartBar() {
  const bar = document.getElementById("cartbar");
  const info = document.getElementById("cartinfo");
  if (!bar) return;
  let positions = 0, units = 0;
  cart.forEach(q => { positions++; units += q; });
  if (positions > 0) {
    bar.classList.add("show");
    info.innerHTML = `Корзина: ${positions} поз.<small>${units} шт.</small>`;
  } else {
    info.innerHTML = `Корзина пуста<small>выберите товары</small>`;
    bar.classList.remove("show");
  }
}
async function sendOrder() {
  if (!cart.size) return;
  const btn = document.getElementById("cartsend");
  const items_ = [...cart.entries()].map(([id, qty]) => ({ id, qty }));
  btn.disabled = true; btn.textContent = "Отправляем…";
  try {
    const r = await fetch("/api/order", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: TG.initData, items: items_ }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || ("ошибка " + r.status));
    cart.clear(); updateCartBar();
    if (TG.showAlert) TG.showAlert("✅ Заказ отправлен! Мы свяжемся с вами.", () => TG.close());
    else { alert("Заказ отправлен!"); TG.close(); }
  } catch (e) {
    btn.disabled = false; btn.textContent = "✅ Подтвердить заказ";
    if (TG.showAlert) TG.showAlert("Не удалось отправить: " + e.message);
    else alert("Не удалось отправить: " + e.message);
  }
}

// ---------- экран «Ваш заказ» (проверка/правка перед отправкой) ----------
function ensureOverlay() {
  let ov = document.getElementById("orderview");
  if (ov) return ov;
  ov = document.createElement("div"); ov.id = "orderview"; ov.className = "ov";
  ov.innerHTML = `<div class="ov-card">
    <div class="ov-head"><h3>${iconSvg("cart", { size: 19 })} Ваш заказ</h3><button class="ov-x" type="button">${iconSvg("x", { size: 18 })}</button></div>
    <div class="ov-list"></div>
    <div class="ov-foot"><div class="ov-sum"></div>
      <div class="ov-actions">
        <button class="btn btn-outline ov-back" type="button">← Добавить ещё</button>
        <button class="btn btn-primary ov-send" type="button">${iconSvg("check", { size: 16 })} Подтвердить заказ</button>
      </div></div></div>`;
  document.body.append(ov);
  ov.querySelector(".ov-x").addEventListener("click", closeOrderView);
  ov.querySelector(".ov-back").addEventListener("click", closeOrderView);
  ov.querySelector(".ov-send").addEventListener("click", sendOrder);
  const list = ov.querySelector(".ov-list");
  list.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const id = b.closest(".ov-row")?.getAttribute("data-id"); if (!id) return;
    const cur = cart.get(String(id)) || 0;
    if (b.classList.contains("minus")) setQty(id, cur - 1);
    else if (b.classList.contains("plus")) setQty(id, cur + 1);
    else if (b.classList.contains("del")) setQty(id, 0);
  });
  list.addEventListener("change", (e) => {
    const inp = e.target.closest(".qinp"); if (!inp) return;
    const id = inp.closest(".ov-row")?.getAttribute("data-id"); if (id) setQty(id, inp.value, true);
  });
  return ov;
}
function openOrderView() { if (!cart.size) return; ensureOverlay(); renderOrderView(); document.getElementById("orderview").classList.add("show"); }
function closeOrderView() { document.getElementById("orderview")?.classList.remove("show"); }
function renderOrderView() {
  const ov = document.getElementById("orderview"); if (!ov) return;
  const list = ov.querySelector(".ov-list"), sum = ov.querySelector(".ov-sum");
  if (!cart.size) { closeOrderView(); return; }
  let positions = 0, units = 0; list.innerHTML = "";
  cart.forEach((qty, id) => {
    positions++; units += qty;
    const p = byId(id) || { name: "?", photo_url: "" };
    const oos = p.status && p.status !== "in_stock";
    const row = document.createElement("div"); row.className = "ov-row" + (oos ? " oos" : ""); row.setAttribute("data-id", id);
    row.innerHTML = `<img class="ov-ph" src="${p.photo_url || placeholder(p.name)}" onerror="this.src='${placeholder(p.name)}'"/>
      <div class="ov-nm">${escapeHtml(p.name)}${oos ? `<span class="ov-oos">${iconSvg("x", { size: 11 })} нет в наличии</span>` : ""}</div>
      <div class="qrow"><button class="qbtn minus" type="button">−</button><input class="qinp" type="number" inputmode="numeric" min="0" value="${qty}"><button class="qbtn plus" type="button">＋</button></div>
      <button class="qbtn del" type="button" title="Удалить">${iconSvg("trash", { size: 16 })}</button>`;
    list.append(row);
  });
  sum.textContent = `${positions} поз. · ${units} шт.`;
}

// PWA: service worker (не в Telegram-мини-аппе)
if (!TG && "serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js?v=47", { updateViaCache: "none" }).catch(() => {}));
  let _swRefreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (_swRefreshing) return; _swRefreshing = true; location.reload();
  });
}

(async function init() {
  initTheme();
  initCursorGlow();
  initStarfield();
  // Telegram Mini App: развернуть, включить режим заказа
  if (TG) { try { TG.ready(); TG.expand(); } catch {} }
  if (orderMode) {
    document.body.classList.add("order-mode");
    const hint = document.getElementById("orderHint");
    if (hint) hint.textContent = "🛒 Выберите товары и нажмите «Добавить». Когда закончите — нажмите «Подтвердить список» внизу, проверьте количество и отправьте заказ.";
    const bar = document.getElementById("cartbar");
    if (bar) bar.addEventListener("click", openOrderView);   // вся панель открывает экран заказа
  }
  // язык + тема — аккуратной строкой сверху (не плавающие, чтобы не налезали на поиск)
  const topbar = document.createElement("div");
  topbar.className = "cat-topbar";
  const ls = makeLangSwitcher(() => { draw(); applyI18n(document.body); });
  const tg = makeThemeToggle();
  topbar.append(ls, tg);
  document.body.insertBefore(topbar, document.body.firstChild);
  // добавить товар с введённым вручную количеством
  function addFromCard(add) {
    if (add.disabled) return;
    const id = add.getAttribute("data-id");
    const prod = byId(id);
    if (prod && prod.status && prod.status !== "in_stock") return;   // нет в наличии — заказать нельзя
    const inp = add.closest(".add-row")?.querySelector(".qty-inp");
    const typed = Math.max(1, Math.floor(Number(inp && inp.value) || 1));
    setQty(id, (cart.get(String(id)) || 0) + typed);
    if (inp) inp.value = "";
    add.classList.add("added"); add.textContent = "✓ Добавлено";
    clearTimeout(add._t); add._t = setTimeout(() => { add.classList.remove("added"); add.textContent = "＋ В корзину"; }, 900);
  }
  // клики по сетке: «В корзину» (с введённым кол-вом) или увеличение фото
  grid.addEventListener("click", (e) => {
    const add = e.target.closest(".add-btn");
    if (add) { addFromCard(add); return; }
    const img = e.target.closest(".prod .ph");
    if (img) {
      const id = img.closest(".prod")?.getAttribute("data-id");
      const prod = byId(id);
      const photos = (prod && prod.photos && prod.photos.length) ? prod.photos : (prod && prod.photo_url ? [prod.photo_url] : [img.src]);
      openGallery(photos, 0, prod ? prod.name : "");
    }
  });
  // Enter в поле количества → добавить
  grid.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const inp = e.target.closest(".qty-inp"); if (!inp) return;
    e.preventDefault();
    const add = inp.closest(".add-row")?.querySelector(".add-btn");
    if (add) addFromCard(add);
  });
  applyI18n(document.body);
  try {
    items = await loadItems();
    draw();
    wirePdfButton();
    if (search) search.addEventListener("input", () => { query = search.value; draw(); });
  } catch (e) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="em-ic">${iconSvg("alert", { size: 40 })}</div><p>Ошибка загрузки: ${escapeHtml(e.message)}</p></div>`;
  }
})();
