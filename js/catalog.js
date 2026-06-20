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

const cfg = window.APP_CONFIG || {};
const useSupabase = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);

function placeholder(name = "?") {
  const ch = encodeURIComponent((name[0] || "?").toUpperCase());
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect width='200' height='200' fill='%23f1ebdc'/%3E%3Ctext x='50%25' y='54%25' font-size='90' fill='%23c9c0a8' text-anchor='middle' font-family='sans-serif'%3E${ch}%3C/text%3E%3C/svg%3E`;
}

async function loadItems() {
  if (useSupabase) {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const sb = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    const { data, error } = await sb.from("catalog_view").select("*");
    if (error) throw error;
    return data.map(d => ({ id: d.id, name: d.name, category: d.category, photo_url: d.photo_url, status: d.status }));
  }
  // локальный режим: берём из того же хранилища, что и админка, БЕЗ цен
  const raw = localStorage.getItem("sklad_db_v1");
  const store = raw ? JSON.parse(raw) : { products: [] };
  return (store.products || []).map(p => ({
    id: p.id, name: p.name, category: p.category, photo_url: p.photo_url,
    status: p.status_override || (Number(p.stock_qty) > 0 ? "in_stock" : "on_order"),
  }));
}

const grid = document.getElementById("grid");
const catnav = document.getElementById("catnav");
let items = [];
const slug = (s) => "cat-" + encodeURIComponent((s || "no-cat").toLowerCase().replace(/\s+/g, "-")).replace(/%/g, "");

// --- режим заказа (Telegram Mini App) ---
const TG = window.Telegram && window.Telegram.WebApp;
const orderMode = !!(TG && TG.initData);   // открыто как Mini App с подписью
const cart = new Map();                     // id → qty
const byId = (id) => items.find(p => String(p.id) === String(id));

function statusBadge(status) {
  return status === "in_stock"
    ? `<span class="badge ok">${iconSvg("check", { size: 13 })} Есть в наличии</span>`
    : `<span class="badge order">${iconSvg("clock", { size: 13 })} Под заказ</span>`;
}

function cardHtml(p, i) {
  const qty = cart.get(String(p.id)) || 0;
  const qrow = orderMode ? `<div class="qrow" data-id="${escapeHtml(String(p.id))}">${qrowInner(qty)}</div>` : "";
  return `<div class="prod reveal" style="animation-delay:${(i % 12) * 0.03}s">
      <img class="ph" loading="lazy" src="${p.photo_url || placeholder(p.name)}" onerror="this.src='${placeholder(p.name)}'" />
      <div class="body">
        <div class="nm">${escapeHtml(p.name)}</div>
        <div class="cat">${escapeHtml(p.category || "")}</div>
        <div style="margin-top:auto">${statusBadge(p.status)}</div>
        ${qrow}
      </div></div>`;
}

// Группировка по категориям: по алфавиту, «Без категории» — в конец.
function groupByCategory() {
  const map = new Map();
  items.forEach(p => {
    const key = (p.category && String(p.category).trim()) || "Без категории";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  });
  return [...map.entries()].sort((a, b) => {
    if (a[0] === "Без категории") return 1;
    if (b[0] === "Без категории") return -1;
    return a[0].localeCompare(b[0], "ru");
  });
}

// Лента чипсов категорий сверху — клик прокручивает к разделу.
function buildCatNav(groups) {
  if (!catnav) return;
  catnav.innerHTML = "";
  groups.forEach(([cat, list]) => {
    const chip = document.createElement("a");
    chip.className = "cat-chip";
    chip.href = "#" + slug(cat);
    chip.innerHTML = `${escapeHtml(cat)} <b>${list.length}</b>`;
    chip.addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById(slug(cat))?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    catnav.append(chip);
  });
}

function draw() {
  const groups = groupByCategory();
  grid.innerHTML = "";
  if (!items.length) { grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="em-ic">📦</div><p>Каталог пуст</p></div>`; return; }
  buildCatNav(groups);
  let gi = 0;
  groups.forEach(([cat, list]) => {
    const section = document.createElement("section");
    section.className = "cat-section";
    section.id = slug(cat);
    section.innerHTML = `<h2 class="cat-section-h">${escapeHtml(cat)} <span>${list.length}</span></h2>
      <div class="cat-grid">${list.map(p => cardHtml(p, gi++)).join("")}</div>`;
    grid.append(section);
  });
  requestAnimationFrame(() => grid.querySelectorAll(".reveal").forEach((n, i) => setTimeout(() => n.classList.add("in"), Math.min(i, 30) * 25)));
  applyI18n(document.body);
}

function escapeHtml(s) { return (s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

// Кнопка «Скачать каталог (PDF)» — генерация на клиенте (модуль грузится по клику).
function wirePdfButton() {
  const btn = document.getElementById("pdfBtn");
  if (!btn || orderMode) { if (btn) btn.style.display = "none"; return; }
  const label = btn.innerHTML;
  btn.addEventListener("click", async () => {
    if (!items.length) return;
    btn.disabled = true;
    try {
      const m = await import("./catalog-pdf.js");
      await m.downloadCatalogPDF(groupByCategory(), (done, total) => {
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
function setQty(id, qty, skipCardRow) {
  id = String(id);
  qty = Math.max(0, Math.min(100000, Math.floor(Number(qty) || 0)));
  if (qty <= 0) cart.delete(id); else cart.set(id, qty);
  // обновить строку карточки (если правка пришла не из самой карточки)
  if (!skipCardRow) {
    const row = grid.querySelector(`.qrow[data-id="${CSS.escape(id)}"]`);
    if (row) row.innerHTML = qrowInner(cart.get(id) || 0);
  }
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
    btn.disabled = false; btn.textContent = "Оформить заказ";
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
        <button class="btn btn-primary ov-send" type="button">${iconSvg("send", { size: 16 })} Отправить заказ</button>
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
    const row = document.createElement("div"); row.className = "ov-row"; row.setAttribute("data-id", id);
    row.innerHTML = `<img class="ov-ph" src="${p.photo_url || placeholder(p.name)}" onerror="this.src='${placeholder(p.name)}'"/>
      <div class="ov-nm">${escapeHtml(p.name)}</div>
      <div class="qrow"><button class="qbtn minus" type="button">−</button><input class="qinp" type="number" inputmode="numeric" min="0" value="${qty}"><button class="qbtn plus" type="button">＋</button></div>
      <button class="qbtn del" type="button" title="Удалить">${iconSvg("trash", { size: 16 })}</button>`;
    list.append(row);
  });
  sum.textContent = `${positions} поз. · ${units} шт.`;
}

// PWA: service worker (не в Telegram-мини-аппе)
if (!TG && "serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

(async function init() {
  initTheme();
  initCursorGlow();
  initStarfield();
  // Telegram Mini App: развернуть, включить режим заказа
  if (TG) { try { TG.ready(); TG.expand(); } catch {} }
  if (orderMode) {
    document.body.classList.add("order-mode");
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
  // клики по сетке: кнопки заказа (+/−) или увеличение фото
  grid.addEventListener("click", (e) => {
    const qbtn = e.target.closest(".qrow .qbtn");
    if (qbtn) {
      const row = qbtn.closest(".qrow"); const id = row.getAttribute("data-id");
      const cur = cart.get(String(id)) || 0;
      setQty(id, qbtn.classList.contains("minus") ? cur - 1 : cur + 1);
      return;
    }
    const img = e.target.closest(".prod .ph");
    if (img) openLightbox(img.src);
  });
  // ручной ввод количества на карточке
  grid.addEventListener("change", (e) => {
    const inp = e.target.closest(".qrow .qinp"); if (!inp) return;
    const id = inp.closest(".qrow")?.getAttribute("data-id"); if (id) setQty(id, inp.value);
  });
  applyI18n(document.body);
  try {
    items = await loadItems();
    draw();
    wirePdfButton();
  } catch (e) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="em-ic">${iconSvg("alert", { size: 40 })}</div><p>Ошибка загрузки: ${escapeHtml(e.message)}</p></div>`;
  }
})();
