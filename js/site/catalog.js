// Каталог товаров: карточки, поиск, фильтры, корзина
import { api, isLoggedIn } from "./api.js";
import { sToast, openModal, cartState, cartAdd, cartRemove, cartQty, renderCartDrawer } from "./app.js";
import { openLogin } from "./auth.js";

const PLACEHOLDER = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9l4-4 4 4 4-5 4 5"/><circle cx="9" cy="14" r="2"/></svg>`;

export async function renderCatalog(container) {
  container.innerHTML = "";
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

  // скелетоны при загрузке
  for (let i = 0; i < 8; i++) grid.append(buildSkeleton());

  let products = [];
  let categories = ["Все"];
  let activeCategory = "Все";
  let searchQuery = "";

  try {
    const res = await api.catalog();
    products = Array.isArray(res) ? res : (res.products || []);
    const cats = [...new Set(products.map(p => p.category).filter(Boolean))];
    categories = ["Все", ...cats];
  } catch (e) {
    grid.innerHTML = "";
    grid.append(buildEmpty("Не удалось загрузить каталог. Попробуйте позже."));
    return;
  }

  // рендер фильтров
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
      setTimeout(() => card.classList.add("in"), i * 35);
      grid.append(card);
    });
  }

  renderCards();

  // обновить кнопки при изменении корзины
  document.addEventListener("gm:cart-change", () => {
    grid.querySelectorAll(".btn-add-cart[data-product-id]").forEach(btn => {
      const id = btn.dataset.productId;
      const qty = cartQty(id);
      const inStock = btn.dataset.inStock === "1";
      if (!inStock) return;
      if (qty > 0) {
        btn.className = "btn-add-cart in-cart";
        btn.textContent = "В корзине (" + qty + ")";
      } else {
        btn.className = "btn-add-cart available";
        btn.textContent = "+ В корзину";
      }
    });
  });
}

function buildCard(p) {
  const card = mkEl("div", "product-card");
  const inStock = p.status === "available" || p.status === "in_stock";

  // фото
  const imgWrap = mkEl("div", "product-card-img");
  imgWrap.style.position = "relative";
  if (p.photo_url) {
    const img = document.createElement("img");
    img.src = p.photo_url; img.alt = p.name;
    img.loading = "lazy";
    img.onerror = () => { imgWrap.innerHTML = `<div class="product-card-img-placeholder">${PLACEHOLDER}</div>`; };
    imgWrap.append(img);
  } else {
    imgWrap.innerHTML = `<div class="product-card-img-placeholder">${PLACEHOLDER}</div>`;
  }
  const badge = mkEl("span", "product-badge " + (inStock ? "in-stock" : "out-stock"));
  badge.textContent = inStock ? "В наличии" : "Нет в наличии";
  imgWrap.append(badge);

  const body = mkEl("div", "product-card-body");
  const name = mkEl("div", "product-name"); name.textContent = p.name;
  const cat = mkEl("div", "product-category"); cat.textContent = p.category || "";
  const footer = mkEl("div", "product-card-footer");

  const btn = document.createElement("button");
  btn.dataset.productId = p.id;
  btn.dataset.inStock = inStock ? "1" : "0";

  const qty = cartQty(p.id);
  if (!inStock) {
    btn.className = "btn-add-cart unavailable"; btn.textContent = "Нет в наличии"; btn.disabled = true;
  } else if (!isLoggedIn()) {
    btn.className = "btn-add-cart need-login"; btn.textContent = "Войти, чтобы заказать";
    btn.addEventListener("click", () => openLogin());
  } else if (qty > 0) {
    btn.className = "btn-add-cart in-cart"; btn.textContent = "В корзине (" + qty + ")";
    btn.addEventListener("click", () => { cartAdd(p); dispatchCartChange(); });
  } else {
    btn.className = "btn-add-cart available"; btn.textContent = "+ В корзину";
    btn.addEventListener("click", () => { cartAdd(p); dispatchCartChange(); sToast(p.name + " добавлен в корзину", "ok"); });
  }

  footer.append(btn);
  body.append(name, cat, footer);
  card.append(imgWrap, body);
  return card;
}

function dispatchCartChange() {
  document.dispatchEvent(new CustomEvent("gm:cart-change"));
}

function buildSkeleton() {
  const c = mkEl("div", "skeleton-card");
  c.innerHTML = `<div class="skeleton skeleton-img"></div><div class="skeleton-body"><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line short"></div><div class="skeleton skeleton-btn"></div></div>`;
  return c;
}

function buildEmpty(text) {
  const w = mkEl("div", "s-empty");
  w.innerHTML = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 21l-4.35-4.35M11 19A8 8 0 1 0 11 3a8 8 0 0 0 0 16z"/></svg>`;
  const p = document.createElement("p"); p.textContent = text;
  w.append(p);
  return w;
}

function mkEl(tag, cls = "") {
  const e = document.createElement(tag);
  if (cls) cls.split(" ").forEach(c => c && e.classList.add(c));
  return e;
}
