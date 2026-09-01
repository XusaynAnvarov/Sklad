// ========================================================================
//  ПУБЛИЧНЫЙ КАТАЛОГ — только фото, название, категория и статус (без цен)
//
//  Это витрина сайта. Заказ переехал в отдельное приложение (/order):
//  он открывается из бота и рассчитан только на телефон. Пока заказ жил
//  здесь же, мобильный вид приходилось выбивать заплатками поверх
//  десктопных стилей — и в итоге страдало и то, и другое.
// ========================================================================
import { initCursorGlow, initTheme, initStarfield, makeThemeToggle } from "./effects.js?v=20260901a";
import { applyI18n, makeLangSwitcher } from "./i18n.js?v=20260901a";
import { iconSvg } from "./icons.js?v=20260901a";
import { thumb } from "./img.js?v=20260901a";

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
  // клиенту — только «есть / нет / скоро» и признак хита; количеств и цен не показываем
  const norm = (d) => ({ id: d.id, name: d.name, sku: d.sku || "", category: d.category, photo_url: d.photo_url, photos: (Array.isArray(d.photos) && d.photos.length) ? d.photos : (d.photo_url ? [d.photo_url] : []), status: d.status, is_new: !!d.is_new, hit: !!d.hit });
  if (useSupabase) {
    // публичный API (отдаёт все фото товара)
    try {
      const r = await fetch("/api/catalog");
      if (r.ok) { const data = await r.json(); if (Array.isArray(data)) return data.map(norm); }
    } catch {}
  }
  // локальный режим: берём из того же хранилища, что и админка, БЕЗ цен
  const raw = localStorage.getItem("sklad_db_v1");
  let store = { products: [] };
  try { if (raw) store = JSON.parse(raw) || store; } catch { store = { products: [] }; }  // повреждённые данные не должны ронять каталог
  return (store.products || []).map(p => {
    const ref = Math.max(p.created_at ? +new Date(p.created_at) : 0, p.last_arrival_at ? +new Date(p.last_arrival_at) : 0);
    return {
      id: p.id, name: p.name, sku: p.sku || "", category: p.category, photo_url: p.photo_url,
      photos: (Array.isArray(p.photos) && p.photos.length) ? p.photos : (p.photo_url ? [p.photo_url] : []),
      status: p.status_override || (Number(p.stock_qty) > 0 ? "in_stock" : "on_order"),
      is_new: ref > 0 && (Date.now() - ref) / 86400000 <= 7,
      hit: false,
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

const TG = window.Telegram && window.Telegram.WebApp;
const byId = (id) => items.find(p => String(p.id) === String(id));

function statusBadge(status) {
  return status === "in_stock"
    ? `<span class="badge ok">${iconSvg("check", { size: 13 })} Есть в наличии</span>`
    : `<span class="badge order">${iconSvg("x", { size: 13 })} Нет в наличии</span>`;
}

function cardHtml(p, i) {
  const id = escapeHtml(String(p.id));
  const np = (p.photos && p.photos.length) ? p.photos.length : (p.photo_url ? 1 : 0);
  const mainPhoto = (p.photos && p.photos.length) ? p.photos[0] : p.photo_url;
  return `<div class="prod reveal" data-id="${id}" style="animation-delay:${(i % 12) * 0.03}s">
      <div style="position:relative">
        <img class="ph" loading="lazy" decoding="async" style="cursor:zoom-in" src="${escapeHtml(mainPhoto ? thumb(mainPhoto, 320) : placeholder(p.name))}" data-full="${escapeHtml(mainPhoto || "")}" data-ph="${escapeHtml(placeholder(p.name))}" onerror="if(this.dataset.full&&this.src!==this.dataset.full){this.src=this.dataset.full}else{this.src=this.dataset.ph}" />
        ${np >= 1 ? `<span style="position:absolute;left:8px;bottom:8px;background:rgba(0,0,0,.62);color:#fff;font-size:12px;font-weight:600;padding:3px 8px;border-radius:20px;pointer-events:none">📷 ${np}</span>` : ""}
        ${p.is_new ? `<span style="position:absolute;right:8px;top:8px;background:var(--accent,#4f7cf0);color:#fff;font-size:11px;font-weight:700;padding:3px 9px;border-radius:20px">Новый</span>` : ""}
      </div>
      <div class="body">
        <div class="nm">${escapeHtml(p.name)}</div>
        <div class="cat">${escapeHtml(p.category || "")}</div>
        ${p.sku ? `<div class="cat" style="font-size:11px;opacity:.8">Арт.: ${escapeHtml(p.sku)}</div>` : ""}
        ${p.hit ? `<div style="font-size:12px;font-weight:600;color:#e8810c;margin-top:3px">🔥 Хит недели</div>` : ""}
        <div style="margin-top:auto">${statusBadge(p.status)}</div>
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
  // внутри каждой категории — хиты недели вверх (только признак, чисел клиенту не даём)
  for (const arr of map.values()) arr.sort((a, b) => (b.hit ? 1 : 0) - (a.hit ? 1 : 0));
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
    // ищем по названию, категории И артикулу — клиент часто знает именно артикул
    (!q || (p.name || "").toLowerCase().includes(q) || (p.category || "").toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q)));
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
  if (!isOwner()) { btn.style.display = "none"; return; }  // клиентам — нельзя
  btn.style.display = "";  // владельцу — показать
  const label = btn.innerHTML;
  btn.addEventListener("click", async () => {
    if (!items.length) return;
    btn.disabled = true;
    try {
      const m = await import("./catalog-pdf.js?v=20260901a");
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

// PWA: service worker (не в Telegram-мини-аппе)
if (!TG && "serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js?v=152", { updateViaCache: "none" }).catch(() => {}));
  let _swRefreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (_swRefreshing) return; _swRefreshing = true; location.reload();
  });
}

(async function init() {
  // Кнопки в переписке живут вечно: у клиентов остались сообщения со старой
  // ссылкой на каталог в режиме заказа. Открыли её из Telegram — уводим
  // в приложение заказа, чтобы старые кнопки продолжали работать.
  if (TG && TG.initData) { location.replace("/order"); return; }

  initTheme();
  initCursorGlow();
  initStarfield();
  // язык + тема — аккуратной строкой сверху (не плавающие, чтобы не налезали на поиск)
  const topbar = document.createElement("div");
  topbar.className = "cat-topbar";
  const ls = makeLangSwitcher(() => { draw(); applyI18n(document.body); });
  const tg = makeThemeToggle();
  topbar.append(ls, tg);
  document.body.insertBefore(topbar, document.body.firstChild);
  // клик по снимку — открыть галерею товара
  grid.addEventListener("click", (e) => {
    const img = e.target.closest(".prod .ph");
    if (!img) return;
    const id = img.closest(".prod")?.getAttribute("data-id");
    const prod = byId(id);
    const photos = (prod && prod.photos && prod.photos.length) ? prod.photos : (prod && prod.photo_url ? [prod.photo_url] : [img.src]);
    openGallery(photos, 0, prod ? prod.name : "");
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
