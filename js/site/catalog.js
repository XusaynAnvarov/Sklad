// Каталог товаров: карточки, поиск, фильтры, корзина
import { api, isLoggedIn } from "./api.js?v=20261109a";
import { t, sToast } from "./app.js?v=20261109a";
import { openLogin } from "./auth.js?v=20261109a";
import { thumb, full } from "../img.js?v=20261109a";
import { подходит } from "../productsearch.js?v=20261109a";
import { подписьКода } from "../catalogcode.js?v=20261109a";
// Главное фото товара выбирает владелец (звезда в карточке товара на
// складе), и это не обязательно первый снимок: см. js/photo.js.
import { снимки, главноеФото, индексГлавного } from "../photo.js?v=20261109a";
// Пружина, бросок, сопротивление на краю и ведение пальцем (js/spring.js).
import { пустить, проекция, резинка, вести } from "../spring.js?v=20261109a";

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

  // Пришли со страницы товара (/p/…) по кнопке «Заказать»: адрес
  // #catalog?q=MK-003 сразу открывает каталог с этим товаром в поиске.
  try {
    const m = /^#catalog\?(.*)$/.exec(location.hash || "");
    const q = m ? new URLSearchParams(m[1]).get("q") : "";
    if (q) {
      catState.query = q.slice(0, 100); catState.category = "Все"; catState.scrollY = 0; saveUi();
      history.replaceState(null, "", location.pathname + location.search + "#catalog");
    }
  } catch {}

  // ---- Витрина: слева лента категорий, справа товар ----
  // Категорий у нас больше двадцати: в строку они не помещаются и занимали
  // три ряда, отодвигая товар вниз. В ленте они стоят столбиком со счётчиком,
  // а на телефоне лента ложится горизонтальной полосой (css/site.css).
  const layout = mkEl("div", "cat-layout");
  const rail = mkEl("aside", "cat-rail");
  rail.setAttribute("aria-label", "Категории товара");
  const railTitle = mkEl("div", "cat-rail-title"); railTitle.textContent = "Категории";
  rail.append(railTitle);
  const main = mkEl("div", "cat-main");
  layout.append(rail, main);
  container.append(layout);

  // Витрина первого экрана. Как только клиент начал искать или выбрал
  // категорию — она убирается, чтобы не отодвигать товар вниз (renderCards).
  const hero = mkEl("section", "feature-tile");
  const heroText = mkEl("div", "feature-text");
  // Надписи «GENERAL MODERN» вразрядку над заголовком больше нет: то же имя
  // уже стоит слева в шапке, и строка только отодвигала заголовок вниз.
  const heroH1 = document.createElement("h1"); heroH1.textContent = t("heroTitle");
  const heroP = document.createElement("p"); heroP.textContent = t("heroSub");
  const heroBtns = mkEl("div", "feature-btns");
  const heroBtn = document.createElement("button");
  heroBtn.className = "btn-primary"; heroBtn.textContent = t("heroCta");
  heroBtn.addEventListener("click", () => toolbar.scrollIntoView({ behavior: "smooth", block: "start" }));
  heroBtns.append(heroBtn);
  heroText.append(heroH1, heroP, heroBtns);
  const heroImg = mkEl("div", "feature-img");
  hero.append(heroText, heroImg);
  main.append(hero);

  // Toolbar
  // ------------------------------------------------------------------
  //  ПОИСК: КНОПКА, КОТОРАЯ РАЗЪЕЗЖАЕТСЯ В ПОЛЕ
  //
  //  Длинная строка поиска занимала всю ширину панели и стояла пустой
  //  почти всегда. Теперь на её месте круглая лупа: по нажатию поле
  //  разъезжается вправо, соседи (фильтры категорий) плавно уезжают —
  //  их двигает сама строка, потому что поле занимает место. Escape и
  //  повторное нажатие закрывают. Поиск и его обработчик — прежние.
  // ------------------------------------------------------------------
  const toolbar = mkEl("div", "catalog-toolbar");
  const searchWrap = mkEl("div", "gm-search gm-search-cat");
  const searchBtn = document.createElement("button");
  searchBtn.type = "button";
  searchBtn.className = "gm-search-btn";
  searchBtn.setAttribute("aria-label", "Поиск по каталогу");
  searchBtn.setAttribute("aria-expanded", "false");
  searchBtn.innerHTML = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>`;
  const searchField = mkEl("div", "gm-search-field");
  const searchInput = document.createElement("input");
  searchInput.className = "search-input"; searchInput.placeholder = "Поиск по названию или артикулу…"; searchInput.type = "search";
  searchField.append(searchInput);
  // Поле стоит ПЕРЕД кнопкой: раскрываясь, оно отодвигает её и фильтры.
  searchWrap.append(searchField, searchBtn);
  // Сколько товаров сейчас на экране. Раньше кнопка поиска стояла в пустой
  // строке одна, и панель выглядела недоделанной; а главное — клиент не
  // видел, сузил ли его запрос выборку и насколько.
  const счётчик = mkEl("div", "catalog-count");
  toolbar.append(счётчик, searchWrap);

  function открытьПоиск() {
    if (searchWrap.classList.contains("open")) return;
    searchWrap.classList.add("open");
    searchBtn.setAttribute("aria-expanded", "true");
    searchInput.focus();                 // сразу, иначе Safari не поднимет клавиатуру
  }
  function закрытьПоиск({ очистить = true } = {}) {
    if (!searchWrap.classList.contains("open")) return;
    searchWrap.classList.remove("open");
    searchBtn.setAttribute("aria-expanded", "false");
    if (очистить && searchInput.value) {
      searchInput.value = "";
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    }
    searchInput.blur();
  }
  searchBtn.addEventListener("click", () => {
    searchWrap.classList.contains("open") ? закрытьПоиск() : открытьПоиск();
  });
  searchInput.addEventListener("keydown", (e) => { if (e.key === "Escape") закрытьПоиск(); });
  // Нажатие мимо закрывает, но только пустой поиск: закрывать поле с
  // набранным запросом нельзя — человек потеряет фильтр, не поняв почему.
  document.addEventListener("pointerdown", (e) => {
    if (!searchWrap.contains(e.target) && !searchInput.value) закрытьПоиск({ очистить: false });
  });
  main.append(toolbar);

  const grid = mkEl("div", "product-grid");
  main.append(grid);

  // В витрине — фирменный знак, а не фотография товара.
  // Снимок одного случайного товара рядом с надписью «Оборудование для
  // вашего бизнеса» обещал не то: человек думал, что речь про эту вещь.
  // Знак на тёплом свете ничего не обещает и не устаревает.
  function оформитьВитрину() {
    if (heroImg.childElementCount) return;
    const знак = document.createElement("div");
    знак.className = "hero-znak";
    знак.setAttribute("aria-hidden", "true");
    знак.innerHTML = `
      <svg viewBox="0 0 512 512" width="150" height="150" role="img" aria-label="GENERAL MODERN">
        <defs>
          <linearGradient id="hzst" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#f2f4f9"/><stop offset="1" stop-color="#e4e9f2"/>
          </linearGradient>
          <linearGradient id="hzzl" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#f7e9a6"/><stop offset=".42" stop-color="#e3c163"/>
            <stop offset=".74" stop-color="#c79a33"/><stop offset="1" stop-color="#a87b1f"/>
          </linearGradient>
        </defs>
        <rect width="512" height="512" rx="116" fill="url(#hzst)"/>
        <rect x="5" y="5" width="502" height="502" rx="111" fill="none" stroke="#c8cedd" stroke-width="5"/>
        <circle cx="256" cy="256" r="182" fill="none" stroke="url(#hzzl)" stroke-width="14" stroke-linecap="round" stroke-dasharray="1062 1144"/>
        <text x="256" y="312" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif"
              font-size="172" font-weight="700" letter-spacing="-6" fill="#16203a">GM</text>
      </svg>`;
    heroImg.append(знак);
  }

  // Карточки рисуем ПОРЦИЯМИ по PAGE штук: на телефоне 800+ карточек с фото разом
  // съедали всю память и Safari «падал». Остальные догружаются при прокрутке.
  // (объявлено до первых вызовов renderCards — иначе ReferenceError)
  let shown = 0, filteredList = [], sentinel = null, io = null;

  // восстанавливаем то, что было: товары из кэша, поиск, категория
  let products = Array.isArray(catState.products) ? catState.products : [];
  let activeCategory = catState.category || "Все";
  let searchQuery = catState.query || "";
  searchInput.value = catState.query || "";
  // Вернулись на каталог с набранным запросом — поиск должен быть уже
  // раскрыт, иначе фильтр работает, а поля не видно, и это выглядит как
  // «каталог почему-то показывает не всё».
  if (searchInput.value) {
    searchWrap.classList.add("open");
    searchBtn.setAttribute("aria-expanded", "true");
  }
  const fresh = products.length && (Date.now() - (catState.fetchedAt || 0) < CAT_TTL);

  if (products.length) { drawChips(); renderCards(); restoreScroll(); }
  else for (let i = 0; i < 8; i++) grid.append(buildSkeleton()); // первый заход — скелетоны

  // Пока каталог грузится, кольцо на знаке в шапке медленно идёт по кругу —
  // человек видит, что сайт работает, а не завис.
  const занято = (да) => { const ш = document.querySelector(".site-header"); if (ш) ш.classList.toggle("zanyato", да); };

  // данные тянем всегда, но если кэш свежий — в фоне (экран не мигает и место не теряется)
  const load = async () => {
    занято(true);
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
    } finally {
      занято(false);
    }
  };
  if (fresh) load(); else await load();

  // Лента категорий со счётчиками: сразу видно, где товара много, а где две
  // позиции. Счёт — по тому же списку, что и карточки, поэтому цифры всегда
  // сходятся с тем, что откроется по нажатию.
  function drawChips() {
    const счёт = {};
    products.forEach(p => { if (p.category) счёт[p.category] = (счёт[p.category] || 0) + 1; });
    const cats = Object.keys(счёт).sort((a, b) => a.localeCompare(b, "ru"));
    const categories = ["Все", ...cats];
    if (!categories.includes(activeCategory)) activeCategory = "Все";

    rail.innerHTML = "";
    rail.append(railTitle);
    categories.forEach(cat => {
      const item = mkEl("button", "rail-item");
      item.type = "button";
      const имя = document.createElement("span");
      имя.textContent = cat === "Все" ? "Все товары" : cat;
      const число = mkEl("span", "rail-count");
      число.textContent = cat === "Все" ? String(products.length) : String(счёт[cat] || 0);
      item.append(имя, число);
      if (cat === activeCategory) { item.classList.add("active"); item.setAttribute("aria-current", "true"); }
      item.addEventListener("click", () => {
        if (activeCategory === cat) return;
        activeCategory = cat;
        catState.category = cat; catState.scrollY = 0; saveUi();
        rail.querySelectorAll(".rail-item").forEach(c => {
          const свой = c === item;
          c.classList.toggle("active", свой);
          if (свой) c.setAttribute("aria-current", "true"); else c.removeAttribute("aria-current");
        });
        renderCards({ волной: true });
        кНачалуСписка();
      });
      rail.append(item);
    });
  }

  searchInput.addEventListener("input", () => {
    searchQuery = searchInput.value.toLowerCase();
    catState.query = searchInput.value; catState.scrollY = 0; saveUi();
    renderCards();
    кНачалуСписка();          // по той же причине, что и при смене категории
  });

  // ------------------------------------------------------------------
  //  ПОКАЗАТЬ НАЧАЛО СПИСКА ПОСЛЕ ФИЛЬТРА
  //
  //  Из-за чего понадобилось. Клиент листает все 949 товаров — страница
  //  вырастает до 86 000 пикселей. Он выбирает категорию, в ней девять
  //  товаров, и страница в тот же миг становится короче в двадцать раз.
  //  Браузер подрезает позицию прокрутки до нового предела — человек
  //  оказывается В САМОМ НИЗУ короткой страницы, где после сетки уже
  //  ничего нет. На экране пусто. Перезагрузка «чинит» только потому,
  //  что сбрасывает прокрутку.
  //
  //  Прежняя попытка увести наверх не работала: прокрутка была плавной
  //  и не успевала — подрезка происходит в том же кадре и отменяет её.
  //  Замерено на боевом: до клика 85191 из 86091, после — 3629 из 4529,
  //  то есть внизу.
  //
  //  Поэтому: мгновенно и ПОСЛЕ перерисовки, когда новая высота уже
  //  известна. Плавную прокрутку темы тоже отключаем на этот миг —
  //  иначе html{scroll-behavior:smooth} снова сделает её плавной.
  // ------------------------------------------------------------------
  function кНачалуСписка() {
    const цель = Math.max(0, toolbar.offsetTop - 80);
    const было = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, цель);
    // Второй заход следующим кадром: высота могла измениться ещё раз,
    // пока браузер считал раскладку новой сетки.
    requestAnimationFrame(() => {
      window.scrollTo(0, Math.max(0, toolbar.offsetTop - 80));
      document.documentElement.style.scrollBehavior = было;
    });
  }

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

  function renderCards(как = {}) {
    grid.innerHTML = "";
    shown = 0;
    // Смена категории — карточки выезжают волной. Класс снимаем после
    // анимации, иначе следующее нажатие её не запустит: браузер считает
    // анимацию уже проигранной.
    grid.classList.remove("gm-smena");
    if (как.волной) { void grid.offsetWidth; grid.classList.add("gm-smena"); }
    // клиент ищет или выбрал категорию — витрина уходит, товар поднимается вверх
    hero.style.display = (searchQuery || activeCategory !== "Все") ? "none" : "";
    if (hero.style.display === "") оформитьВитрину();
    if (io) { io.disconnect(); io = null; }
    filteredList = products.filter(p => {
      const matchCat = activeCategory === "Все" || p.category === activeCategory;
      // название, категория, артикул и код из печатного каталога
      const matchQ = подходит(p, searchQuery);
      return matchCat && matchQ;
    });
    // хиты недели — вверх (только признак, без чисел: количество клиенту не показываем)
    filteredList.sort((a, b) => (b.hit ? 1 : 0) - (a.hit ? 1 : 0));
    счётчик.textContent = подписьСчётчика(filteredList.length, products.length, searchQuery, activeCategory);
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

// Подпись над сеткой: сколько показано и почему именно столько.
// «Показан 1 товар» / «Показано 4 товара» / «Показано 13 товаров» —
// склонение считаем сами, чужих библиотек ради одной строки не берём.
function подписьСчётчика(сколько, всего, запрос, категория) {
  if (!сколько) return "";
  const слово = товарПо(сколько);
  const глагол = (сколько % 10 === 1 && сколько % 100 !== 11) ? "Показан" : "Показано";
  const сузили = запрос || категория !== "Все";
  return сузили && сколько < всего
    ? `${глагол} ${сколько} ${слово} из ${всего}`
    : `${глагол} ${сколько} ${слово}`;
}
function товарПо(n) {
  const д = n % 10, с = n % 100;
  if (д === 1 && с !== 11) return "товар";
  if (д >= 2 && д <= 4 && (с < 10 || с >= 20)) return "товара";
  return "товаров";
}

function buildCard(p) {
  const card = mkEl("div", "product-card");
  const inStock = p.status === "in_stock";
  const isSoon  = p.status === "soon";

  // Фото (одно или несколько — галерея по клику)
  const photos = снимки(p);
  // В плитке — главное фото, в галерее — все снимки по порядку.
  const главный = главноеФото(p);
  const imgWrap = mkEl("div", "product-card-img");
  if (photos.length) {
    const img = document.createElement("img");
    // в сетке — миниатюра: сотни полноразмерных фото занимают в памяти телефона
    // гигабайты и браузер зависает. В галерее по клику открываются оригиналы.
    img.src = thumb(главный, 480); img.alt = p.name;
    img.loading = "lazy"; img.decoding = "async"; img.style.cursor = "zoom-in";
    img.onerror = () => {
      // Миниатюра не вышла — пробуем полный размер, но тоже через свой сервер.
      // Прямой адрес из базы брать нельзя: у большей части товаров там
      // остался адрес прежнего проекта Supabase, и он больше не отвечает.
      const запасной = full(главный);
      if (img.src !== запасной) { img.src = запасной; return; }
      imgWrap.innerHTML = `<div class="product-card-img-placeholder">${PLACEHOLDER}</div>`;
    };
    // Галерея открывается на том снимке, который виден в плитке.
    img.addEventListener("click", (e) => { e.stopPropagation(); openGallery(photos, индексГлавного(p), p.name); });
    // Поля по краям вписанного снимка заполняет его же размытая копия
    // (css/site.css, .product-card-img::before). Берём самую мелкую
    // миниатюру — её всё равно размывает, зато грузится мгновенно.
    imgWrap.style.setProperty("--фото", "url('" + thumb(главный, 64) + "')");
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

  // ------------------------------------------------------------------
  //  ЧТО ГДЕ НА КАРТОЧКЕ
  //
  //  Поверх снимка остаётся только то, что про рекламу: «Новинка», «Хит»
  //  и число фотографий. Наличие оттуда убрано и стоит в теле карточки
  //  строкой с точкой — ОДНО И ТО ЖЕ МЕСТО на каждой карточке. Раньше
  //  зелёная плашка «В наличии» висела в углу снимка, на светлом фото
  //  терялась, а глазу приходилось искать её заново у каждого товара.
  //
  //  Код товара — не подпись, а то, что клиент диктует в заказе. Поэтому
  //  он стал кнопкой: нажатие копирует код в буфер.
  // ------------------------------------------------------------------
  const метки = mkEl("div", "product-badges");
  if (p.is_new) {
    const newBadge = mkEl("span", "product-badge new-badge");
    newBadge.textContent = t("newBadge");
    метки.append(newBadge);
  }
  if (p.hit) {
    const hitBadge = mkEl("span", "product-badge hit-badge");
    hitBadge.textContent = "Хит недели";
    метки.append(hitBadge);
  }
  // Прежний бейдж наличия поверх снимка. На телефоне владелец просил
  // вернуть вид, который был до редизайна, — там наличие показывалось
  // именно так. На компьютере его прячет css/glassos-site.css, и там
  // работает строка состояния в теле карточки. Рисуем оба сразу, чтобы
  // переключение было чисто стилевым: карточка строится один раз, и
  // ветвиться по ширине экрана в коде нельзя — при повороте телефона
  // получилось бы не то.
  const старыйБейдж = mkEl("span", "product-badge старый " + (inStock ? "in-stock" : isSoon ? "soon" : "out-stock"));
  старыйБейдж.textContent = inStock ? t("inStockBadge") : isSoon ? t("soonBadge") : t("noStockBadge");
  метки.prepend(старыйБейдж);
  imgWrap.append(метки);

  const body = mkEl("div", "product-card-body");
  const name = mkEl("div", "product-name"); name.textContent = p.name;
  const cat  = mkEl("div", "product-category"); cat.textContent = p.category || "";

  // Код и артикул: по ним клиент находит нужную деталь и называет её в заказе.
  let skuEl = null;
  if (подписьКода(p)) {
    skuEl = mkEl("div", "product-sku");
    const чтоКопировать = p.code || p.sku || "";
    const кнопка = document.createElement("button");
    кнопка.type = "button";
    кнопка.className = "sku-copy";
    кнопка.title = "Нажмите, чтобы скопировать: " + чтоКопировать;
    кнопка.setAttribute("aria-label", "Скопировать код товара " + чтоКопировать);
    const код = mkEl("span", "sku-code"); код.textContent = p.code || p.sku || "";
    кнопка.append(код, значокКопии());
    кнопка.addEventListener("click", (e) => {
      e.stopPropagation();
      скопировать(чтоКопировать, кнопка);
    });
    skuEl.append(кнопка);
    // Артикул поставщика — рядом, но тише: его называют реже, чем код.
    if (p.code && p.sku) {
      const арт = mkEl("span", "sku-vendor");
      арт.textContent = "Арт.: " + p.sku;
      skuEl.append(арт);
    }
  }

  // Наличие — строка с точкой, одна и та же у всех карточек.
  const статус = mkEl("div", "product-status " + (inStock ? "есть" : isSoon ? "скоро" : "нет"));
  const точка = mkEl("span", "status-dot");
  const подпись = mkEl("span");
  подпись.textContent = inStock ? t("inStockBadge") : isSoon ? t("soonBadge") : t("noStockBadge");
  статус.append(точка, подпись);

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
  body.append(статус, footer);
  card.append(imgWrap, body);
  return card;
}

// Значок «скопировать» у кода товара. Отдельной функцией, потому что
// после копирования он на секунду сменяется галочкой.
function значокКопии(галочка) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("width", "13"); s.setAttribute("height", "13");
  s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor");
  s.setAttribute("stroke-width", "2");
  s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round");
  s.classList.add("sku-ic");
  s.innerHTML = галочка
    ? `<path d="M20 6 9 17l-5-5"/>`
    : `<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>`;
  return s;
}

// Копируем код товара. clipboard доступен не везде (старый браузер,
// страница без https) — тогда уходим на скрытое поле и execCommand,
// иначе нажатие просто ничего не делало бы и выглядело как поломка.
function скопировать(текст, кнопка) {
  const получилось = () => {
    кнопка.classList.add("скопировано");
    const старый = кнопка.querySelector(".sku-ic");
    if (старый) старый.replaceWith(значокКопии(true));
    setTimeout(() => {
      кнопка.classList.remove("скопировано");
      const тек = кнопка.querySelector(".sku-ic");
      if (тек) тек.replaceWith(значокКопии(false));
    }, 1400);
    sToast("Код скопирован: " + текст, "ok");
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(текст).then(получилось).catch(() => запасноеКопирование(текст, получилось));
  } else запасноеКопирование(текст, получилось);
}

function запасноеКопирование(текст, готово) {
  try {
    const поле = document.createElement("textarea");
    поле.value = текст;
    поле.style.cssText = "position:fixed;top:-1000px;opacity:0";
    document.body.append(поле);
    поле.select();
    document.execCommand("copy");
    поле.remove();
    готово();
  } catch {
    sToast("Не удалось скопировать — выделите код вручную", "err");
  }
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
  // Снимок берём через свой сервер (full), а не по адресу из базы: у большей
  // части товаров там лежит адрес прежнего проекта Supabase, который уже не
  // отвечает — на телефоне вместо фото открывался значок «картинка не
  // загрузилась». /api/img ходит в ту базу, на которой сервер работает сейчас.
  function show() { img.src = full(photos[idx]); counter.textContent = (name ? name + " · " : "") + (idx + 1) + " / " + photos.length; }

  // Фото тянется за пальцем один к одному и долетает туда, куда брошено.
  // Раньше было «сдвинул больше 40 px — листаем»: палец вёл, а фото стояло.
  let тяга = null, сдвиг = 0;
  const ширина = () => Math.max(1, ov.clientWidth || window.innerWidth);
  const поставить = (x) => { сдвиг = x; img.style.transform = "translate3d(" + x + "px,0,0)"; };
  const долететь = (куда, скорость, после) => {
    if (тяга) тяга.стоп();
    тяга = пустить({ от: сдвиг, к: куда, скорость, затухание: 1, отклик: 0.32,
      наКадр: поставить, наКонец: () => { тяга = null; if (после) после(); } });
  };
  function go(d, e) {
    if (e) e.stopPropagation();
    idx = (idx + d + photos.length) % photos.length;
    const край = ширина();
    долететь(-d * край * 0.6, 0, () => { show(); поставить(d * край * 0.6); долететь(0, 0); });
  }
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

    // После перетаскивания браузер всё равно шлёт клик, а клик по фону
    // закрывает галерею — без этой отметки пролистывание пальцем закрывало
    // бы её каждый раз.
    let вели = 0;
    ov.addEventListener("click", (e) => { if (Date.now() - вели < 400) { e.stopPropagation(); e.preventDefault(); } }, true);

    вести(ov, {
      наНачало: () => { if (тяга) { тяга.стоп(); тяга = null; } },   // поймали на лету
      наДвижение: ({ дх }) => {
        const край = (idx === 0 && дх > 0) || (idx === photos.length - 1 && дх < 0);
        поставить(край ? резинка(дх, ширина()) : дх);
      },
      наОтпускание: ({ дх, скорость }) => {
        вели = Date.now();
        const долёт = дх + проекция(скорость.x);     // куда бросок летит, а не где отпустили
        const порог = ширина() * 0.28;
        if (долёт < -порог && idx < photos.length - 1) {
          долететь(-ширина() * 0.6, скорость.x, () => { idx++; show(); поставить(ширина() * 0.6); долететь(0, 0); });
        } else if (долёт > порог && idx > 0) {
          долететь(ширина() * 0.6, скорость.x, () => { idx--; show(); поставить(-ширина() * 0.6); долететь(0, 0); });
        } else {
          долететь(0, скорость.x);
        }
      },
    });
  }
  document.body.append(ov);
  show();
}
