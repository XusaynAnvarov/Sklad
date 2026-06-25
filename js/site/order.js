// Страница «Заказать»: список товаров с ручным вводом количества (вместо корзины).
import { api, isLoggedIn } from "./api.js";
import { sToast, t } from "./app.js";
import { openLogin } from "./auth.js";

function mkEl(tag, cls = "") {
  const e = document.createElement(tag);
  if (cls) cls.split(" ").forEach(c => c && e.classList.add(c));
  return e;
}
const PLACEHOLDER = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".4"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9l4-4 4 4 4-5 4 5"/></svg>`;

export async function renderOrder(container) {
  container.innerHTML = "";

  if (!isLoggedIn()) {
    const empty = mkEl("div", "s-empty");
    empty.innerHTML = `<p style="margin-bottom:12px">Войдите, чтобы оформить заказ</p>`;
    const btn = mkEl("button", "btn-primary"); btn.textContent = "Войти";
    btn.addEventListener("click", () => openLogin());
    empty.append(btn);
    container.append(empty);
    return;
  }

  const wrap = mkEl("div", "order-page");
  const head = mkEl("div");
  head.style.cssText = "margin-bottom:16px";
  head.innerHTML = `<h1 style="font-size:22px;font-weight:700;color:var(--text);margin-bottom:4px">Оформить заказ</h1>
    <div style="font-size:13px;color:var(--muted)">Укажите количество у нужных товаров и отправьте — мы выставим цены и свяжемся с вами.</div>`;
  wrap.append(head);

  // панель фильтров
  const tools = mkEl("div");
  tools.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px";
  const catSel = document.createElement("select");
  catSel.className = "search-input"; catSel.style.cssText = "max-width:220px;cursor:pointer";
  const search = document.createElement("input");
  search.className = "search-input"; search.type = "search"; search.placeholder = "Поиск товара…"; search.style.maxWidth = "260px";
  tools.append(catSel, search);
  wrap.append(tools);

  const listBox = mkEl("div", "order-list");
  listBox.innerHTML = `<div class="s-empty" style="padding:30px"><span class="s-spinner" style="width:26px;height:26px;border-width:2.5px;border-color:rgba(0,0,0,.08);border-top-color:var(--navy);display:inline-block"></span></div>`;
  wrap.append(listBox);

  container.append(wrap);

  // загрузка товаров
  let products = [];
  try {
    const res = await api.catalog();
    products = Array.isArray(res) ? res : (res.products || []);
  } catch (e) {
    listBox.innerHTML = `<div class="s-empty"><p>Не удалось загрузить товары. Попробуйте позже.</p></div>`;
    return;
  }

  const cats = ["Все", ...[...new Set(products.map(p => p.category).filter(Boolean))].sort()];
  cats.forEach(c => { const o = document.createElement("option"); o.value = c; o.textContent = c; catSel.append(o); });

  const order = new Map(); // product_id → qty
  let activeCat = "Все", query = "";

  // плавающая панель-сводка снизу
  const bar = mkEl("div", "order-bar");
  bar.style.cssText = "position:sticky;bottom:0;background:var(--panel,#fff);border-top:1px solid var(--border,#e5e7eb);padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;box-shadow:0 -6px 18px rgba(0,0,0,.06);border-radius:0 0 12px 12px;margin-top:8px";
  const barInfo = mkEl("div"); barInfo.style.cssText = "font-size:14px;font-weight:600;color:var(--text)";
  const sendBtn = mkEl("button", "btn-primary"); sendBtn.style.cssText = "padding:10px 22px;font-size:14px;font-weight:700";
  sendBtn.textContent = "Отправить заказ";
  bar.append(barInfo, sendBtn);
  wrap.append(bar);

  function totalPositions() { let n = 0; order.forEach(q => { if (q > 0) n++; }); return n; }
  function updateBar() {
    const n = totalPositions();
    barInfo.textContent = n ? `Ваш заказ: ${n} поз.` : "Выберите товары и укажите количество";
    sendBtn.disabled = !n;
    sendBtn.style.opacity = n ? "1" : ".5";
  }

  function statusLabel(p) {
    if (p.status === "in_stock") return null;
    if (p.status === "soon") return t("soonBadge");
    return t("noStockBadge");
  }

  function renderList() {
    listBox.innerHTML = "";
    const filt = products.filter(p => {
      const okCat = activeCat === "Все" || p.category === activeCat;
      const okQ = !query || (p.name || "").toLowerCase().includes(query);
      return okCat && okQ;
    });
    if (!filt.length) { listBox.innerHTML = `<div class="s-empty" style="padding:24px"><p>Ничего не найдено</p></div>`; return; }

    const table = mkEl("div");
    filt.forEach(p => {
      const canOrder = p.status === "in_stock";
      const row = mkEl("div", "order-row");
      row.style.cssText = "display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid var(--border,#e9ecf1);border-radius:12px;margin-bottom:8px;background:var(--panel,#fff)";

      const thumb = mkEl("div");
      thumb.style.cssText = "width:48px;height:48px;border-radius:10px;background:var(--bg2,#f3f5f8);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0";
      if (p.photo_url) { const img = document.createElement("img"); img.src = p.photo_url; img.loading = "lazy"; img.style.cssText = "width:100%;height:100%;object-fit:cover"; img.onerror = () => { thumb.innerHTML = PLACEHOLDER; }; thumb.append(img); }
      else thumb.innerHTML = PLACEHOLDER;

      const info = mkEl("div"); info.style.cssText = "flex:1;min-width:0";
      const nm = mkEl("div"); nm.style.cssText = "font-weight:600;font-size:14px;color:var(--text);overflow:hidden;text-overflow:ellipsis"; nm.textContent = p.name;
      const meta = mkEl("div"); meta.style.cssText = "font-size:12px;color:var(--muted);display:flex;gap:6px;align-items:center;flex-wrap:wrap";
      meta.append(document.createTextNode(p.category || ""));
      const sl = statusLabel(p);
      if (sl) { const b = mkEl("span"); b.style.cssText = "color:#b45309;font-weight:600"; b.textContent = "· " + sl; meta.append(b); }
      if (p.is_new) { const nb = mkEl("span"); nb.style.cssText = "color:var(--navy);font-weight:600"; nb.textContent = "· " + t("newBadge"); meta.append(nb); }
      info.append(nm, meta);

      const right = mkEl("div"); right.style.cssText = "flex-shrink:0";
      if (canOrder) {
        const qty = document.createElement("input");
        qty.type = "number"; qty.min = "0"; qty.inputMode = "numeric";
        qty.className = "search-input"; qty.style.cssText = "width:84px;text-align:center;padding:8px";
        qty.placeholder = "0";
        const cur = order.get(p.id) || 0; if (cur > 0) qty.value = cur;
        qty.addEventListener("input", () => {
          const v = Math.max(0, parseInt(qty.value, 10) || 0);
          if (v > 0) order.set(p.id, v); else order.delete(p.id);
          updateBar();
        });
        right.append(qty);
      } else {
        const dis = mkEl("span"); dis.style.cssText = "font-size:12px;color:var(--muted);font-weight:600"; dis.textContent = sl || "Недоступно";
        right.append(dis);
      }
      row.append(thumb, info, right);
      table.append(row);
    });
    listBox.append(table);
  }

  catSel.addEventListener("change", () => { activeCat = catSel.value; renderList(); });
  search.addEventListener("input", () => { query = search.value.toLowerCase(); renderList(); });

  sendBtn.addEventListener("click", async () => {
    const items = [];
    order.forEach((qty, product_id) => { if (qty > 0) items.push({ product_id, qty }); });
    if (!items.length) { sToast("Укажите количество хотя бы у одного товара", "err"); return; }
    sendBtn.disabled = true; const old = sendBtn.textContent; sendBtn.innerHTML = `<span class="s-spinner"></span> Отправка…`;
    try {
      await api.placeOrder(items);
      order.clear();
      sToast("Заказ отправлен! Мы свяжемся с вами.", "ok");
      location.hash = "#cabinet";
    } catch (e) {
      sToast(e.message || "Не удалось отправить заказ", "err");
      sendBtn.disabled = false; sendBtn.textContent = old;
    }
  });

  renderList();
  updateBar();
}
