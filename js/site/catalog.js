// Каталог товаров: карточки, поиск, фильтры, корзина
import { api, isLoggedIn } from "./api.js";
import { t } from "./app.js";
import { openLogin } from "./auth.js";

const PLACEHOLDER = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9l4-4 4 4 4-5 4 5"/><circle cx="9" cy="14" r="2"/></svg>`;

export async function renderCatalog(container) {
  container.innerHTML = "";

  // Toolbar
  const toolbar = mkEl("div", "catalog-toolbar");
  const searchWrap = mkEl("div", "search-input-wrap");
  searchWrap.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`;
  const searchInput = document.createElement("input");
  searchInput.className = "search-input"; searchInput.placeholder = "Поиск товаров…"; searchInput.type = "search";
  searchWrap.append(searchInput);
  const filterChips = mkEl("div", "filter-chips");
  toolbar.append(searchWrap, filterChips);
  container.append(toolbar);

  const grid = mkEl("div", "product-grid");
  container.append(grid);

  // Скелетоны при загрузке
  for (let i = 0; i < 8; i++) grid.append(buildSkeleton());

  let products = [];
  let categories = ["Все"];
  let activeCategory = "Все";
  let searchQuery = "";

  try {
    const res = await api.catalog();
    products = Array.isArray(res) ? res : (res.products || []);
    const cats = [...new Set(products.map(p => p.category).filter(Boolean))].sort();
    categories = ["Все", ...cats];
  } catch (e) {
    grid.innerHTML = "";
    grid.append(buildEmpty("Не удалось загрузить каталог. Попробуйте позже."));
    return;
  }

  // Фильтры
  filterChips.innerHTML = "";
  categories.forEach(cat => {
    const chip = mkEl("button", "filter-chip");
    chip.textContent = cat;
    if (cat === activeCategory) chip.classList.add("active");
    chip.addEventListener("click", () => {
      activeCategory = cat;
      filterChips.querySelectorAll(".filter-chip").forEach(c => c.classList.toggle("active", c.textContent === cat));
      renderCards();
    });
    filterChips.append(chip);
  });

  searchInput.addEventListener("input", () => { searchQuery = searchInput.value.toLowerCase(); renderCards(); });

  function renderCards() {
    grid.innerHTML = "";
    const filtered = products.filter(p => {
      const matchCat = activeCategory === "Все" || p.category === activeCategory;
      const matchQ = !searchQuery || (p.name || "").toLowerCase().includes(searchQuery);
      return matchCat && matchQ;
    });
    if (!filtered.length) { grid.append(buildEmpty("Ничего не найдено")); return; }
    filtered.forEach((p, i) => {
      const card = buildCard(p);
      card.classList.add("card-reveal");
      // только первые карточки анимируем со сдвигом — иначе на телефоне с сотнями товаров лагает
      if (i < 16) setTimeout(() => card.classList.add("in"), i * 30);
      else card.classList.add("in");
      grid.append(card);
    });
  }

  renderCards();
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
    img.src = photos[0]; img.alt = p.name;
    img.loading = "lazy"; img.style.cursor = "zoom-in";
    img.onerror = () => { imgWrap.innerHTML = `<div class="product-card-img-placeholder">${PLACEHOLDER}</div>`; };
    img.addEventListener("click", (e) => { e.stopPropagation(); openGallery(photos, 0, p.name); });
    imgWrap.append(img);
    if (photos.length > 1) {
      const pb = mkEl("span");
      pb.style.cssText = "position:absolute;left:8px;bottom:8px;background:rgba(0,0,0,.62);color:#fff;font-size:12px;font-weight:600;padding:3px 8px;border-radius:20px;z-index:2";
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
  body.append(name, cat, footer);
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
