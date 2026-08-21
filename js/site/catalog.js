// Каталог товаров: карточки, поиск, фильтры, корзина
import { api, isLoggedIn } from "./api.js?v=20260821l";
import { t } from "./app.js?v=20260821l";
import { openLogin } from "./auth.js?v=20260821l";
import { thumb } from "../img.js?v=20260821l";

const PLACEHOLDER = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9l4-4 4 4 4-5 4 5"/><circle cx="9" cy="14" r="2"/></svg>`;

// ---- Состояние каталога: товары, фильтр, поиск, позиция прокрутки ----
// Хранится в localStorage (НЕ sessionStorage!): sessionStorage стирается, когда клиент
// закрывает браузер или выходит из Telegram — и всё начиналось сначала. localStorage
// переживает и это, поэтому клиент возвращается ровно туда, где остановился.
// ВАЖНО: храним РАЗДЕЛЬНО. Товаров сотни — их JSON пишем только после загрузки данных.
// Позицию прокрутки/фильтры пишем часто (при скролле), поэтому это отдельный крошечный ключ:
// иначе на телефоне каждые 200 мс сериализовались бы все товары и Safari падал.
const CAT_KEY = "gm_cat_data";   // товары + время загрузки
const UI_KEY = "gm_cat_ui";      // категория, поиск, позиция прокрутки
const CAT_TTL = 5 * 60 * 1000;   // товары считаем свежими 5 минут, дальше тихо обновляем
const UI_TTL = 24 * 60 * 60 * 1000; // место возврата помним сутки; через сутки — начинаем сверху
const PAGE = 48;                 // сколько карточек рисуем за раз (остальные — по мере прокрутки)

let catState = { products: null, fetchedAt: 0, category: "Все", query: "", scrollY: 0 };
try {
  const d = JSON.parse(localStorage.getItem(CAT_KEY) || "null");
  if (d && Array.isArray(d.products)) { catState.products = d.products; catState.fetchedAt = d.fetchedAt || 0; }
  const u = JSON.parse(localStorage.getItem(UI_KEY) || "null");
  if (u && typeof u === "object" && (!u.at || Date.now() - u.at < UI_TTL)) {
    catState.category = u.category || "Все"; catState.query = u.query || ""; catState.scrollY = u.scrollY || 0;
  }
} catch {}

function saveProducts() {
  try { localStorage.setItem(CAT_KEY, JSON.stringify({ products: catState.products, fetchedAt: catState.fetchedAt })); }
  catch { try { localStorage.removeItem(CAT_KEY); } catch {} }   // не влезло — просто не кэшируем
}
function saveUi() {
  try { localStorage.setItem(UI_KEY, JSON.stringify({ category: catState.category, query: catState.query, scrollY: catState.scrollY, at: Date.now() })); } catch {}
}
function rememberScroll() { catState.scrollY = window.scrollY || 0; saveUi(); }

// Подгрузка следующей порции карточек. Основной механизм — IntersectionObserver,
// это — страховка на случай, если он не сработал (старые браузеры, нестандартный скролл).
let currentLoadMore = null;

export async function renderCatalog(container) {
  container.innerHTML = "";

  // ---- Витрина: первый экран для того, кто нас ещё не знает ----
  // Как только клиент начал искать или выбрал категорию — он уже работает,
  // и витрина убирается, чтобы не отодвигать товар вниз (см. renderCards).
  const hero = mkEl("div", "site-hero");
  const heroEyebrow = mkEl("div", "hero-eyebrow"); heroEyebrow.textContent = "General Modern";
  const heroH1 = document.createElement("h1"); heroH1.textContent = t("heroTitle");
  const heroP = document.createElement("p"); heroP.textContent = t("heroSub");
  const heroBtns = mkEl("div", "hero-btns");
  const heroBtn = document.createElement("button");
  heroBtn.className = "btn-primary"; heroBtn.textContent = t("heroCta");
  heroBtn.addEventListener("click", () => toolbar.scrollIntoView({ behavior: "smooth", block: "start" }));
  heroBtns.append(heroBtn);
  hero.append(heroEyebrow, heroH1, heroP, heroBtns);
  container.append(hero);

  // Toolbar
  const toolbar = mkEl("div", "catalog-toolbar");
  const searchWrap = mkEl("div", "search-input-wrap");
  searchWrap.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`;
  const searchInput = document.createElement("input");
  searchInput.className = "search-input"; searchInput.placeholder = "Поиск по названию или артикулу…"; searchInput.type = "search";
  searchWrap.append(searchInput);
  const filterChips = mkEl("div", "filter-chips");
  toolbar.append(searchWrap, filterChips);
  container.append(toolbar);

  const grid = mkEl("div", "product-grid");
  container.append(grid);

  // Карточки рисуем ПОРЦИЯМИ по PAGE штук: на телефоне 800+ карточек с фото разом
  // съедали всю память и Safari «падал». Остальные догружаются при прокрутке.
  // (объявлено до первых вызовов renderCards — иначе ReferenceError)
  let shown = 0, filteredList = [], sentinel = null, io = null;

  // восстанавливаем то, что было: товары из кэша, поиск, категория
  let products = Array.isArray(catState.products) ? catState.products : [];
  let activeCategory = catState.category || "Все";
  let searchQuery = catState.query || "";
  searchInput.value = catState.query || "";
  const fresh = products.length && (Date.now() - (catState.fetchedAt || 0) < CAT_TTL);

  if (products.length) { drawChips(); renderCards(); restoreScroll(); }
  else for (let i = 0; i < 8; i++) grid.append(buildSkeleton()); // первый заход — скелетоны

  // данные тянем всегда, но если кэш свежий — в фоне (экран не мигает и место не теряется)
  const load = async () => {
    try {
      const res = await api.catalog();
      const list = Array.isArray(res) ? res : (res.products || []);
      if (!list.length && products.length) return;         // пустой ответ не затирает показанное
      products = list;
      catState.products = list; catState.fetchedAt = Date.now(); saveProducts();
      drawChips();
      const y = window.scrollY;                             // перерисовка не должна сбивать прокрутку
      renderCards();
      requestAnimationFrame(() => window.scrollTo(0, y));
    } catch (e) {
      if (!products.length) { grid.innerHTML = ""; grid.append(buildEmpty("Не удалось загрузить каталог. Попробуйте позже.")); }
    }
  };
  if (fresh) load(); else await load();

  function drawChips() {
    const cats = [...new Set(products.map(p => p.category).filter(Boolean))].sort();
    const categories = ["Все", ...cats];
    if (!categories.includes(activeCategory)) activeCategory = "Все";
    filterChips.innerHTML = "";
    categories.forEach(cat => {
      const chip = mkEl("button", "filter-chip");
      chip.textContent = cat;
      if (cat === activeCategory) chip.classList.add("active");
      chip.addEventListener("click", () => {
        activeCategory = cat;
        catState.category = cat; catState.scrollY = 0; saveUi();
        filterChips.querySelectorAll(".filter-chip").forEach(c => c.classList.toggle("active", c.textContent === cat));
        renderCards();
      });
      filterChips.append(chip);
    });
  }

  searchInput.addEventListener("input", () => {
    searchQuery = searchInput.value.toLowerCase();
    catState.query = searchInput.value; catState.scrollY = 0; saveUi();
    renderCards();
  });

  // запоминаем позицию прокрутки (с троттлингом) + при уходе со страницы/в другое приложение
  // догрузка порции, когда до низа осталось меньше двух экранов
  currentLoadMore = () => {
    if (shown >= filteredList.length) return;
    const left = document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
    if (left < window.innerHeight * 2) appendChunk();
  };

  if (!window.__gmCatScrollBound) {
    window.__gmCatScrollBound = true;
    let t = 0;
    window.addEventListener("scroll", () => {
      if (currentLoadMore) currentLoadMore();
      clearTimeout(t); t = setTimeout(rememberScroll, 200);
    }, { passive: true });
    window.addEventListener("pagehide", rememberScroll);
    document.addEventListener("visibilitychange", () => { if (document.hidden) rememberScroll(); });
  }

  function restoreScroll() {
    const y = Number(catState.scrollY) || 0;
    if (y <= 0) return;
    // Контейнер ещё не вставлен в страницу (роутер добавит его позже), да и карточки
    // рисуются порциями — поэтому по мере попыток догружаем следующие порции.
    let tries = 0;
    const tick = () => {
      if (++tries > 30) return;
      window.scrollTo(0, y);
      if (Math.abs((window.scrollY || 0) - y) > 4) {
        if (typeof shown === "number" && shown < filteredList.length) appendChunk();  // мало высоты — добавим карточек
        setTimeout(tick, 60);
      }
    };
    setTimeout(tick, 40);
  }

  function appendChunk() {
    const slice = filteredList.slice(shown, shown + PAGE);
    if (!slice.length) return;
    const frag = document.createDocumentFragment();
    slice.forEach((p, i) => {
      const card = buildCard(p);
      card.classList.add("card-reveal");
      if (shown === 0 && i < 12) setTimeout(() => card.classList.add("in"), i * 30);
      else card.classList.add("in");
      frag.append(card);
    });
    grid.append(frag);
    shown += slice.length;
    if (sentinel) {                       // маячок всегда в конце списка
      grid.append(sentinel);
      if (shown >= filteredList.length) { sentinel.remove(); if (io) io.disconnect(); }
    }
  }

  function renderCards() {
    grid.innerHTML = "";
    shown = 0;
    // клиент ищет или выбрал категорию — витрина уходит, товар поднимается вверх
    hero.style.display = (searchQuery || activeCategory !== "Все") ? "none" : "";
    if (io) { io.disconnect(); io = null; }
    filteredList = products.filter(p => {
      const matchCat = activeCategory === "Все" || p.category === activeCategory;
      // ищем и по названию, и по артикулу — клиент часто знает именно артикул
      const matchQ = !searchQuery
        || (p.name || "").toLowerCase().includes(searchQuery)
        || (p.sku || "").toLowerCase().includes(searchQuery);
      return matchCat && matchQ;
    });
    // хиты недели — вверх (только признак, без чисел: количество клиенту не показываем)
    filteredList.sort((a, b) => (b.hit ? 1 : 0) - (a.hit ? 1 : 0));
    if (!filteredList.length) { grid.append(buildEmpty("Ничего не найдено")); return; }

    sentinel = mkEl("div", "");
    sentinel.style.cssText = "grid-column:1/-1;height:1px";
    appendChunk();
    if (shown < filteredList.length && "IntersectionObserver" in window) {
      io = new IntersectionObserver((entries) => { if (entries.some(e => e.isIntersecting)) appendChunk(); }, { rootMargin: "600px" });
      io.observe(sentinel);
    }
  }
}

function buildCard(p) {
  const card = mkEl("div", "product-card");
  const inStock = p.status === "in_stock";
  const isSoon  = p.status === "soon";

  // Фото (одно или несколько — галерея по клику)
  const photos = (p.photos && p.photos.length) ? p.photos : (p.photo_url ? [p.photo_url] : []);
  const imgWrap = mkEl("div", "product-card-img");
  if (photos.length) {
    const img = document.createElement("img");
    // в сетке — миниатюра: сотни полноразмерных фото занимают в памяти телефона
    // гигабайты и браузер зависает. В галерее по клику открываются оригиналы.
    img.src = thumb(photos[0], 320); img.alt = p.name;
    img.loading = "lazy"; img.decoding = "async"; img.style.cursor = "zoom-in";
    img.onerror = () => {
      if (img.src !== photos[0]) { img.src = photos[0]; return; }   // миниатюра не вышла — берём оригинал
      imgWrap.innerHTML = `<div class="product-card-img-placeholder">${PLACEHOLDER}</div>`;
    };
    img.addEventListener("click", (e) => { e.stopPropagation(); openGallery(photos, 0, p.name); });
    imgWrap.append(img);
    {
      const pb = mkEl("span");
      pb.style.cssText = "position:absolute;left:8px;bottom:8px;background:rgba(0,0,0,.62);color:#fff;font-size:12px;font-weight:600;padding:3px 8px;border-radius:20px;z-index:2;pointer-events:none";
      pb.textContent = "📷 " + photos.length;
      imgWrap.append(pb);
    }
  } else {
    imgWrap.innerHTML = `<div class="product-card-img-placeholder">${PLACEHOLDER}</div>`;
  }

  // Бейдж статуса
  let badgeCls, badgeText;
  if (inStock)       { badgeCls = "in-stock";  badgeText = t("inStockBadge"); }
  else if (isSoon)   { badgeCls = "soon";       badgeText = t("soonBadge"); }
  else               { badgeCls = "out-stock";  badgeText = t("noStockBadge"); }
  const badge = mkEl("span", "product-badge " + badgeCls);
  badge.textContent = badgeText;
  imgWrap.append(badge);

  // Бейдж «Новинка» — поверх угла
  if (p.is_new) {
    const newBadge = mkEl("span", "product-badge new-badge");
    newBadge.textContent = t("newBadge");
    imgWrap.append(newBadge);
  }

  const body = mkEl("div", "product-card-body");
  const name = mkEl("div", "product-name"); name.textContent = p.name;
  const cat  = mkEl("div", "product-category"); cat.textContent = p.category || "";
  // артикул виден всем клиентам: по нему они находят нужную деталь и называют её в заказе
  let skuEl = null;
  if (p.sku) { skuEl = mkEl("div", "product-sku"); skuEl.textContent = "Арт.: " + p.sku; }
  // хит недели — сколько куплено за 7 дней
  let weekEl = null;
  // «Хит» — без числа продаж: клиент не видит количеств
  if (p.hit) { weekEl = mkEl("div"); weekEl.style.cssText = "font-size:12px;font-weight:600;color:#e8810c;margin-top:3px"; weekEl.textContent = "🔥 Хит недели"; }
  const footer = mkEl("div", "product-card-footer");

  const btn = document.createElement("button");
  if (!inStock && !isSoon) {
    btn.className = "btn-add-cart unavailable"; btn.textContent = t("noStockBadge"); btn.disabled = true;
  } else if (isSoon) {
    btn.className = "btn-add-cart soon-btn"; btn.textContent = t("soonBadge"); btn.disabled = true;
  } else if (!isLoggedIn()) {
    btn.className = "btn-add-cart need-login"; btn.textContent = t("loginToOrder");
    btn.addEventListener("click", () => openLogin());
  } else {
    // каталог — для просмотра; заказ оформляется на странице «Заказать»
    btn.className = "btn-add-cart available"; btn.textContent = t("order") || "Заказать";
    btn.addEventListener("click", () => { location.hash = "#order"; });
  }

  footer.append(btn);
  body.append(name, cat);
  if (skuEl) body.append(skuEl);
  if (weekEl) body.append(weekEl);
  body.append(footer);
  card.append(imgWrap, body);
  return card;
}

function buildSkeleton() {
  const c = mkEl("div", "skeleton-card");
  c.innerHTML = `<div class="skeleton skeleton-img"></div><div class="skeleton-body"><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line short"></div><div class="skeleton skeleton-btn"></div></div>`;
  return c;
}

function buildEmpty(text) {
  const w = mkEl("div", "s-empty");
  w.innerHTML = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 21l-4.35-4.35M11 19A8 8 0 1 0 11 3a8 8 0 0 0 0 16z"/></svg>`;
  const p2 = document.createElement("p"); p2.textContent = text;
  w.append(p2);
  return w;
}

function mkEl(tag, cls = "") {
  const e = document.createElement(tag);
  if (cls) cls.split(" ").forEach(c => c && e.classList.add(c));
  return e;
}

// Полноэкранная галерея фото товара (стрелки + свайп), видна всем клиентам
function openGallery(photos, start, name) {
  if (!photos || !photos.length) return;
  let idx = start || 0;
  const ov = mkEl("div");
  ov.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.92);display:flex;align-items:center;justify-content:center;cursor:zoom-out";
  const img = document.createElement("img");
  img.style.cssText = "max-width:92vw;max-height:80vh;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.6);object-fit:contain";
  img.addEventListener("click", (e) => e.stopPropagation());
  const counter = mkEl("div"); counter.style.cssText = "position:absolute;bottom:18px;left:0;right:0;text-align:center;color:#fff;font-size:14px";
  function show() { img.src = photos[idx]; counter.textContent = (name ? name + " · " : "") + (idx + 1) + " / " + photos.length; }
  function go(d, e) { if (e) e.stopPropagation(); idx = (idx + d + photos.length) % photos.length; show(); }
  function close() { document.removeEventListener("keydown", onKey); ov.remove(); }
  const onKey = (e) => { if (e.key === "Escape") close(); else if (photos.length > 1 && e.key === "ArrowLeft") go(-1); else if (photos.length > 1 && e.key === "ArrowRight") go(1); };
  document.addEventListener("keydown", onKey);
  ov.addEventListener("click", close);
  ov.append(img, counter);
  if (photos.length > 1) {
    const prev = mkEl("button"); prev.textContent = "‹";
    const next = mkEl("button"); next.textContent = "›";
    [prev, next].forEach(b => b.style.cssText = "position:absolute;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.16);color:#fff;border:none;font-size:42px;width:54px;height:74px;border-radius:12px;cursor:pointer;line-height:1");
    prev.style.left = "12px"; next.style.right = "12px";
    prev.addEventListener("click", (e) => go(-1, e)); next.addEventListener("click", (e) => go(1, e));
    ov.append(prev, next);
    let sx = 0;
    ov.addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; }, { passive: true });
    ov.addEventListener("touchend", (e) => { const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); });
  }
  document.body.append(ov);
  show();
}
