// Страница «Заказать»: товары карточками (как в каталоге) + ручной ввод количества,
// и отдельный экран «Мои заказанные товары» (проверить / удалить / добавить ещё).
import { api, isLoggedIn } from "./api.js?v=20261114e";
import { sToast, t } from "./app.js?v=20261114e";
import { openLogin } from "./auth.js?v=20261114e";
import { поставитьСнимок } from "../img.js?v=20261114e";

function mkEl(tag, cls = "") {
  const e = document.createElement(tag);
  if (cls) cls.split(" ").forEach(c => c && e.classList.add(c));
  return e;
}
const PLACEHOLDER = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9l4-4 4 4 4-5 4 5"/><circle cx="9" cy="14" r="2"/></svg>`;
const statusRank = (p) => p.status === "in_stock" ? 0 : p.status === "soon" ? 1 : 2;
// Сколько карточек рисуем за раз; остальные — по мере прокрутки.
const ПОРЦИЯ = 48;
// Наблюдатель за маячком живёт на уровне модуля: страницу перерисовывают
// целиком (render()), и старый наблюдатель иначе остался бы висеть на
// выброшенном маячке.
let наблюдатель = null;
function снятьНаблюдение() { if (наблюдатель) { наблюдатель.disconnect(); наблюдатель = null; } }

export async function renderOrder(container) {
  container.innerHTML = "";

  if (!isLoggedIn()) {
    const empty = mkEl("div", "s-empty");
    empty.innerHTML = `<p style="margin-bottom:12px">Войдите, чтобы оформить заказ</p>`;
    const b = mkEl("button", "btn-primary"); b.textContent = "Войти"; b.addEventListener("click", () => openLogin());
    empty.append(b); container.append(empty); return;
  }

  // загрузка товаров
  let products = [];
  const loadWrap = mkEl("div", "s-empty");
  loadWrap.innerHTML = `<span class="s-spinner" style="width:28px;height:28px;border-width:2.5px;border-color:rgba(0,0,0,.08);border-top-color:var(--navy);display:inline-block"></span>`;
  container.append(loadWrap);
  try {
    const res = await api.catalog();
    products = Array.isArray(res) ? res : (res.products || []);
  } catch (e) {
    container.innerHTML = `<div class="s-empty"><p>Не удалось загрузить товары. Попробуйте позже.</p></div>`; return;
  }
  // в наличии — первыми, «Скоро»/нет — в конце
  products.sort((a, b) => statusRank(a) - statusRank(b) || (a.name || "").localeCompare(b.name || "", "ru"));
  const pmap = Object.fromEntries(products.map(p => [p.id, p]));
  const cats = ["Все", ...[...new Set(products.map(p => p.category).filter(Boolean))].sort()];

  const order = new Map(); // product_id → qty
  let view = "list";       // list | review
  let activeCat = "Все", query = "";

  container.innerHTML = "";
  const root = mkEl("div", "order-page");
  container.append(root);

  function orderCount() { let n = 0; order.forEach(q => { if (q > 0) n++; }); return n; }
  let revTabEl = null, goBtnEl = null;
  function updateCounts() {
    if (revTabEl) revTabEl.textContent = `Мои заказанные товары (${orderCount()})`;
    if (goBtnEl) { goBtnEl.textContent = `Перейти к заказу (${orderCount()}) →`; goBtnEl.style.display = orderCount() ? "block" : "none"; }
  }

  function render() {
    снятьНаблюдение();                 // старый маячок сейчас будет выброшен
    root.innerHTML = ""; goBtnEl = null;

    // переключатель Товары / Мой заказ
    const tabs = mkEl("div"); tabs.style.cssText = "display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap";
    const tabList = mkEl("button", "s-tab" + (view === "list" ? " active" : "")); tabList.textContent = "Товары";
    tabList.addEventListener("click", () => { view = "list"; render(); });
    const tabRev = mkEl("button", "s-tab" + (view === "review" ? " active" : "")); tabRev.textContent = `Мои заказанные товары (${orderCount()})`;
    tabRev.addEventListener("click", () => { view = "review"; render(); });
    revTabEl = tabRev;
    tabs.append(tabList, tabRev);
    root.append(tabs);

    if (view === "list") renderList();
    else renderReview();
    кНачалуСтраницы();
  }

  // ------------------------------------------------------------------
  //  ПОКАЗАТЬ НАЧАЛО СТРАНИЦЫ ПОСЛЕ ПЕРЕРИСОВКИ
  //
  //  Из-за чего понадобилось. Человек листает товары — страница вырастает
  //  до шестнадцати тысяч пикселей. Он нажимает «Мои заказанные товары»,
  //  там три строки, и страница в тот же миг становится короче в двадцать
  //  раз. Браузер подрезает прокрутку до нового предела — и человек
  //  оказывается В САМОМ НИЗУ короткой страницы. Замерено: прокрутка 147
  //  при высоте 959, то есть ровно предел; на экране при этом пусто.
  //  Выглядит как зависание: нажал — и ничего нет.
  //
  //  Такой же случай уже был в каталоге при смене категории
  //  (js/site/catalog.js, кНачалуСписка) и лечится так же: прокрутка
  //  МГНОВЕННАЯ, иначе подрезка происходит в том же кадре и отменяет её,
  //  и повторяется в следующем кадре — после того как браузер пересчитал
  //  высоту под новое содержимое.
  function кНачалуСтраницы() {
    const цель = () => Math.max(0, (root.offsetTop || 0) - 80);
    const было = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, цель());
    requestAnimationFrame(() => {
      window.scrollTo(0, цель());
      document.documentElement.style.scrollBehavior = было;
    });
  }

  // ---- Список товаров (карточки) ----
  function renderList() {
    const tools = mkEl("div"); tools.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px";
    const catSel = document.createElement("select");
    catSel.className = "search-input"; catSel.style.cssText = "max-width:220px;cursor:pointer";
    cats.forEach(c => { const o = document.createElement("option"); o.value = c; o.textContent = c; if (c === activeCat) o.selected = true; catSel.append(o); });
    const search = document.createElement("input");
    search.className = "search-input"; search.type = "search"; search.placeholder = "Поиск товара…"; search.style.maxWidth = "260px"; search.value = query;
    catSel.addEventListener("change", () => { activeCat = catSel.value; render(); });
    search.addEventListener("input", () => { query = search.value.toLowerCase(); refreshGrid(); });
    tools.append(catSel, search);
    root.append(tools);

    const grid = mkEl("div", "product-grid");
    root.append(grid);

    // КАРТОЧКИ РИСУЕМ ПОРЦИЯМИ.
    //
    // Раньше здесь было `filt.forEach(p => grid.append(buildCard(p)))` — все
    // товары разом. На боевой базе их больше девятисот, и Safari на телефоне
    // убивал вкладку: «На странице повторно возникла проблема». Дело не в
    // самих снимках — они с loading="lazy" и по сети не едут, — а в карточках:
    // каждая это около десятка узлов и отдельный слой размытия.
    //
    // В каталоге так уже сделано (js/site/catalog.js), здесь просто забылось.
    // Маячок в конце списка добавляет следующую порцию, когда человек до него
    // долистывает.
    let показано = 0, отобранные = [], маячок = null;

    function добавитьПорцию() {
      const кусок = отобранные.slice(показано, показано + ПОРЦИЯ);
      if (!кусок.length) return;
      const часть = document.createDocumentFragment();
      кусок.forEach(p => часть.append(buildCard(p)));
      grid.append(часть);
      показано += кусок.length;
      if (маячок) {                      // маячок всегда остаётся последним
        grid.append(маячок);
        if (показано >= отобранные.length) { маячок.remove(); маячок = null; снятьНаблюдение(); }
      }
    }

    function refreshGrid() {
      снятьНаблюдение();
      grid.innerHTML = "";
      показано = 0;
      отобранные = products.filter(p => {
        const okCat = activeCat === "Все" || p.category === activeCat;
        const okQ = !query || (p.name || "").toLowerCase().includes(query);
        return okCat && okQ;
      });
      if (!отобранные.length) { grid.innerHTML = `<div class="s-empty" style="padding:24px"><p>Ничего не найдено</p></div>`; return; }
      маячок = mkEl("div", "");
      маячок.style.cssText = "grid-column:1/-1;height:1px";
      добавитьПорцию();
      if (маячок && "IntersectionObserver" in window) {
        наблюдатель = new IntersectionObserver(
          события => { if (события.some(e => e.isIntersecting)) добавитьПорцию(); },
          { rootMargin: "600px" }
        );
        наблюдатель.observe(маячок);
      }
    }
    refreshGrid();

    // плавающая кнопка перехода к заказу (видна, когда что-то добавлено)
    const go = mkEl("button", "btn-primary");
    go.style.cssText = "position:sticky;bottom:14px;margin:14px auto 0;padding:12px 26px;font-size:14px;font-weight:700;box-shadow:0 8px 24px rgba(0,0,0,.18)";
    go.textContent = `Перейти к заказу (${orderCount()}) →`;
    go.style.display = orderCount() ? "block" : "none";
    go.addEventListener("click", () => { view = "review"; render(); });
    goBtnEl = go;
    root.append(go);
  }

  function buildCard(p) {
    const canOrder = p.status === "in_stock";
    const card = mkEl("div", "product-card");
    const imgWrap = mkEl("div", "product-card-img");
    if (p.photo_url) {
      const img = document.createElement("img"); img.alt = p.name; поставитьСнимок(img, p.photo_url, "", 480, true);
      img.onerror = () => { imgWrap.innerHTML = `<div class="product-card-img-placeholder">${PLACEHOLDER}</div>`; reBadges(); };
      imgWrap.append(img);
    } else imgWrap.innerHTML = `<div class="product-card-img-placeholder">${PLACEHOLDER}</div>`;

    function reBadges() {
      let cls, txt;
      if (canOrder) { cls = "in-stock"; txt = t("inStockBadge"); }
      else if (p.status === "soon") { cls = "soon"; txt = t("soonBadge"); }
      else { cls = "out-stock"; txt = t("noStockBadge"); }
      // одна строка на оба бейджа — иначе на узкой карточке телефона
      // «Нет в наличии» и «Новинка» налезают друг на друга
      const бейджи = mkEl("div", "product-badges");
      const badge = mkEl("span", "product-badge " + cls); badge.textContent = txt; бейджи.append(badge);
      if (p.is_new) { const nb = mkEl("span", "product-badge new-badge"); nb.textContent = t("newBadge"); бейджи.append(nb); }
      imgWrap.append(бейджи);
    }
    reBadges();

    const body = mkEl("div", "product-card-body");
    const name = mkEl("div", "product-name"); name.textContent = p.name;
    const cat = mkEl("div", "product-category"); cat.textContent = p.category || "";
    const footer = mkEl("div", "product-card-footer");

    if (canOrder) {
      const wrap = mkEl("div"); wrap.style.cssText = "display:flex;align-items:center;gap:8px;width:100%";
      const lbl = mkEl("span"); lbl.style.cssText = "font-size:13px;color:var(--muted)"; lbl.textContent = "Кол-во:";
      const qty = document.createElement("input");
      qty.type = "number"; qty.min = "0"; qty.inputMode = "numeric"; qty.placeholder = "0";
      qty.className = "search-input"; qty.style.cssText = "flex:1;text-align:center;padding:9px;font-weight:600";
      const cur = order.get(p.id) || 0; if (cur > 0) qty.value = cur;
      qty.addEventListener("input", () => {
        const v = Math.max(0, parseInt(qty.value, 10) || 0);
        if (v > 0) order.set(p.id, v); else order.delete(p.id);
        updateCounts();
      });
      wrap.append(lbl, qty);
      footer.append(wrap);
    } else {
      const dis = mkEl("button", "btn-add-cart " + (p.status === "soon" ? "soon-btn" : "unavailable"));
      dis.disabled = true; dis.textContent = p.status === "soon" ? t("soonBadge") : t("noStockBadge");
      footer.append(dis);
    }
    body.append(name, cat, footer);
    card.append(imgWrap, body);
    return card;
  }

  // ---- Мои заказанные товары ----
  function renderReview() {
    const card = mkEl("div", "cabinet-card");
    card.style.cssText = "padding:16px";
    const h = mkEl("h2"); h.style.cssText = "font-size:18px;font-weight:700;margin-bottom:12px;color:var(--text)"; h.textContent = "Мои заказанные товары";
    card.append(h);

    if (!orderCount()) {
      const e = mkEl("div", "s-empty"); e.style.padding = "20px";
      e.innerHTML = `<p style="margin-bottom:12px">Вы ещё ничего не добавили</p>`;
      const add = mkEl("button", "btn-primary"); add.textContent = "Добавить товары";
      add.addEventListener("click", () => { view = "list"; render(); });
      e.append(add); card.append(e); root.append(card); return;
    }

    order.forEach((qty, pid) => {
      const p = pmap[pid] || { name: "?" };
      const row = mkEl("div"); row.style.cssText = "display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border,#eee)";
      const thumb = mkEl("div"); thumb.style.cssText = "width:46px;height:46px;border-radius:10px;background:var(--bg2,#f3f5f8);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0";
      if (p.photo_url) { const img = document.createElement("img"); img.style.cssText = "width:100%;height:100%;object-fit:cover"; поставитьСнимок(img, p.photo_url, "", 160); thumb.append(img); }
      else thumb.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".4"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>`;
      const info = mkEl("div"); info.style.cssText = "flex:1;min-width:0";
      const nm = mkEl("div"); nm.style.cssText = "font-weight:600;font-size:14px"; nm.textContent = p.name;
      const qrow = mkEl("div"); qrow.style.cssText = "display:flex;align-items:center;gap:8px;margin-top:4px";
      const qlbl = mkEl("span"); qlbl.style.cssText = "font-size:13px;color:var(--muted)"; qlbl.textContent = "Кол-во:";
      const qinp = document.createElement("input");
      qinp.type = "number"; qinp.min = "1"; qinp.value = qty; qinp.className = "search-input"; qinp.style.cssText = "width:80px;text-align:center;padding:6px";
      // ПУСТОЕ ПОЛЕ — ЕЩЁ НЕ ОТКАЗ ОТ ТОВАРА.
      //
      // Раньше здесь на пустом поле товар удалялся и вызывался render() —
      // прямо во время набора. Человек хочет исправить 5 на 12: выделяет
      // цифру, стирает — и в этот миг строка исчезает, вся страница
      // перерисовывается, поле, в котором он печатает, уничтожается,
      // клавиатура закрывается. На телефоне это и ощущается как зависание.
      //
      // Теперь набор ничего не ломает, а решение принимается, когда человек
      // уходит из поля: ушёл пустым — значит товар не нужен.
      qinp.addEventListener("input", () => {
        const v = Math.max(0, parseInt(qinp.value, 10) || 0);
        if (v > 0) { order.set(pid, v); updateCounts(); }
      });
      qinp.addEventListener("blur", () => {
        const v = Math.max(0, parseInt(qinp.value, 10) || 0);
        if (v > 0) { order.set(pid, v); updateCounts(); return; }
        order.delete(pid); render();
      });
      qrow.append(qlbl, qinp);
      info.append(nm, qrow);
      const del = mkEl("button", "cart-item-remove");
      del.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
      del.title = "Удалить";
      del.addEventListener("click", () => { order.delete(pid); render(); });
      row.append(thumb, info, del);
      card.append(row);
    });

    const actions = mkEl("div"); actions.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;margin-top:16px";
    const addMore = mkEl("button", "btn-ghost"); addMore.textContent = "Добавить товары";
    addMore.addEventListener("click", () => { view = "list"; render(); });
    const send = mkEl("button", "btn-primary"); send.style.cssText = "padding:10px 22px;font-weight:700;flex:1;min-width:160px"; send.textContent = "Отправить заказ";
    send.addEventListener("click", async () => {
      const items = [];
      order.forEach((q, product_id) => { if (q > 0) items.push({ product_id, qty: q }); });
      if (!items.length) { sToast("Добавьте товары", "err"); return; }
      send.disabled = true; const old = send.textContent; send.innerHTML = `<span class="s-spinner"></span> Отправка…`;
      try {
        await api.placeOrder(items);
        order.clear();
        sToast("Заказ отправлен! Мы свяжемся с вами.", "ok");
        location.hash = "#cabinet";
      } catch (e) {
        sToast(e.message || "Не удалось отправить заказ", "err");
        send.disabled = false; send.textContent = old;
      }
    });
    actions.append(addMore, send);
    card.append(actions);
    root.append(card);
  }

  render();
}
