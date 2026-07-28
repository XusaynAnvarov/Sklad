// ========================================================================
//  СТРАНИЦА «ПРОДАЖИ» — накладные: создание, редактирование, Telegram
// ========================================================================
import { el, $, toast, modal, confirmDialog, field, input, select, inputList, lightbox } from "../ui.js";
import { fmt, convert, CUR, sumByCur, curStr } from "../fx.js";
import { sendInvoice, sendInvoicePDF, sendInvoicePDFToClient, notifyClient, requestOrderConfirm } from "../telegram.js";
import { placeholder } from "./products.js";
import { consumeFIFO, returnToStock, ensureBatches, sumQty, currentCost, costAfter } from "../inventory.js";
import { icon } from "../icons.js";
import { showLoader, hideLoader } from "../ui.js";
import { downloadTemplate, parseRows, pickFile } from "../xlsx-import.js";
import { exportInvoice } from "../xlsx-export.js";
import { showNotFound } from "./purchases.js";

const cfg = window.APP_CONFIG || {};

export default async function render(page, ctx) {
  const [sales, customers, products] = await Promise.all([
    ctx.db.sales.list(), ctx.db.customers.list(), ctx.db.products.list(),
  ]);
  const cmap = Object.fromEntries(customers.map(c => [c.id, c]));

  page.append(
    el("div.topbar", {}, [
      el("div", {}, [el("h1", { text: "Продажи" }), el("div.sub", { text: `Накладных: ${sales.length}` })]),
      el("button.btn.btn-primary", { onclick: () => openEditor(ctx, null, customers, products) }, [icon("plus", { size: 16 }), "Новая накладная"]),
    ]),
  );

  if (!sales.length) { page.append(el("div.empty", {}, [el("div.em-ic", {}, [icon("receipt", { size: 40 })]), el("p", { text: "Накладных пока нет" })])); return; }

  const tbody = el("tbody");
  sales.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(s => {
    const by = sumByCur(s.items);
    const curs = [...new Set((s.items || []).map(i => i.currency || s.currency))].map(c => CUR[c]?.sign || c).join(" ");
    tbody.append(el("tr", {}, [
      el("td", { text: new Date(s.date).toLocaleDateString("ru-RU") }),
      el("td", {}, [el("strong", { text: cmap[s.customer_id]?.name || "—" })]),
      el("td", {}, [el("span.badge.cur", { text: curs || "—" })]),
      el("td", { text: (s.items || []).length + " поз." }),
      el("td", {}, [el("strong", { text: curStr(by) })]),
      el("td", {}, [(s.items || []).length > 0 && s.items.every(i => i.paid)
        ? el("span.badge.ok", {}, [icon("check", { size: 13 }), "Оплачено"])
        : el("span.badge.order", {}, [icon("dot", { size: 12 }), "В долг"])]),
      el("td", {}, [s.telegram_sent ? el("span.badge.ok", {}, [icon("send", { size: 13 }), "Отправлена"]) : el("span.muted", { text: "—" })]),
      el("td.right", {}, [el("div.row-actions", {}, [
        el("button.btn.btn-outline.btn-sm.btn-icon", { title: "Скачать в Excel", text: "📊", onclick: async () => { showLoader("Готовим Excel…"); try { await exportInvoice(s, cmap[s.customer_id], products); } catch (e) { toast("Ошибка: " + (e.message || e), "err"); } finally { hideLoader(); } } }),
        el("button.btn.btn-outline.btn-sm.btn-icon", { title: "Редактировать", onclick: () => openEditor(ctx, s, customers, products) }, [icon("edit", { size: 16 })]),
        el("button.btn.btn-outline.btn-sm.btn-icon", { title: "Отправить в Telegram", onclick: () => resend(ctx, s, cmap, products) }, [icon("send", { size: 16 })]),
        el("button.btn.btn-danger.btn-sm.btn-icon", { title: "Удалить", onclick: () => confirmDialog("Удалить накладную? Товары вернутся на склад.", () => deleteSale(ctx, s, products)) }, [icon("trash", { size: 16 })]),
      ])]),
    ]));
  });
  page.append(el("div", { style: { overflowX: "auto" } }, [el("table.tbl", {}, [
    el("thead", {}, [el("tr", {}, ["Дата", "Клиент", "Валюта", "Позиции", "Сумма", "Оплата", "Telegram", ""].map(h => el("th", { text: h })))]),
    tbody,
  ])]));
}

// ---------- Редактор накладной (стиль «Оформить продажу») ----------
export function openEditor(ctx, sale, customers, products, preselectId) {
  const isNew = !sale;
  const pmap = Object.fromEntries(products.map(p => [p.id, p]));
  const nameToId = {}; products.forEach(p => { nameToId[(p.name || "").toLowerCase()] = p.id; }); // поиск товара в накладной — ТОЛЬКО по названию (не по артикулу)
  const state = sale
    ? { customer_id: sale.customer_id, currency: sale.currency, date: sale.date, status: sale.status, boxes: sale.boxes || 0, paid: (sale.items || []).length > 0 && sale.items.every(i => i.paid), items: JSON.parse(JSON.stringify(sale.items || [])) }
    : { customer_id: preselectId || customers[0]?.id || "", currency: "som", date: new Date().toISOString(), status: "draft", boxes: 0, paid: false, items: [] };

  // если правим УЖЕ оформленную накладную — её позиции уже списаны со склада;
  // при проверке остатка возвращаем их, иначе ложно показывает «на складе 0» красным
  const alreadyDeducted = sale && !["order", "pending_confirm", "confirmed", "draft"].includes(sale.status);
  const consumedByProduct = {};
  if (alreadyDeducted) (sale.items || []).forEach(it => { consumedByProduct[it.product_id] = (consumedByProduct[it.product_id] || 0) + (Number(it.qty) || 0); });

  // карта последних цен этого клиента по товарам (для подсказки на строках заказа)
  let lastPriceMap = new Map();
  async function loadLastPrices() { try { lastPriceMap = await ctx.db.lastPricesForCustomer(state.customer_id); drawCart(); } catch {} }

  // ----- шапка -----
  const custNameToId = {}; customers.forEach(c => { custNameToId[(c.name || "").toLowerCase()] = c.id; });
  const curCust = customers.find(c => c.id === state.customer_id);
  const fCustomer = inputList(customers.map(c => c.name), { value: curCust ? curCust.name : "", placeholder: "поиск: впишите или выберите" });
  const fPaid = select([{ value: "debt", label: "В долг" }, { value: "paid", label: "Оплачено" }], state.paid ? "paid" : "debt");
  const fCurrency = select(Object.values(CUR).map(c => ({ value: c.code, label: c.label })), state.currency);
  const fDate = input({ type: "date", value: (state.date || "").slice(0, 10) });
  const fBoxes = input({ type: "number", value: state.boxes || "", placeholder: "0" });

  fPaid.addEventListener("change", () => { state.paid = fPaid.value === "paid"; });
  fDate.addEventListener("change", () => { state.date = fDate.value ? new Date(fDate.value).toISOString() : state.date; });
  fBoxes.addEventListener("input", () => { state.boxes = +fBoxes.value || 0; });
  // «Не списывать со склада» — для восстановления накладной, чей товар уже отгружён ранее
  const chkNoStock = el("input", { type: "checkbox" });
  const noStockRow = el("label", { style: { display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer", marginTop: "8px" } }, [chkNoStock, el("span", { text: "Не списывать со склада (товар уже отгружён ранее)" })]);
  fCustomer.addEventListener("input", () => { state.customer_id = custNameToId[(fCustomer.value || "").toLowerCase()] || ""; refreshAdd(); loadLastPrices(); });
  // валюта по умолчанию — только для новых позиций (старые не трогаем)
  fCurrency.addEventListener("change", () => { state.currency = fCurrency.value; refreshAdd(); });

  // ----- панель добавления товара -----
  const fProduct = inputList(products.map(p => p.name), { placeholder: "впишите название", style: { flex: "1", minWidth: "180px" } });
  const qtyLbl = el("div.field-label", { text: "Кол-во" });
  const fQty = input({ type: "number", placeholder: "0", style: { width: "120px" } });
  const fPrice = input({ type: "number", step: "0.01", placeholder: "0", style: { width: "140px" } });
  const preview = el("img.thumb", { style: { width: "76px", height: "76px", cursor: "zoom-in", display: "none" }, title: "Увеличить" });
  const lastHint = el("div", { style: { fontSize: "13px", margin: "8px 0", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" } });
  const substBtn = el("button.btn.btn-outline.btn-sm", { text: "Подставить", style: { display: "none" } });
  const costBtn = el("button.btn.btn-outline.btn-sm", { text: "👁 Показать себестоимость (только для меня)" });
  const costLine = el("div.card", { style: { display: "none", padding: "10px 14px", margin: "10px 0", color: "#fbbf24", borderColor: "rgba(245,158,11,.4)" } });
  let costShown = false;
  costBtn.addEventListener("click", () => { costShown = !costShown; costLine.style.display = costShown ? "" : "none"; costBtn.textContent = costShown ? "🙈 Скрыть себестоимость" : "👁 Показать себестоимость (только для меня)"; });

  const selId = () => nameToId[(fProduct.value || "").trim().toLowerCase()] || "";
  fProduct.addEventListener("input", refreshAdd);

  async function refreshAdd() {
    const id = selId(); const p = pmap[id];
    if (!p) { preview.style.display = "none"; qtyLbl.textContent = "Кол-во"; lastHint.innerHTML = ""; costLine.style.display = "none"; substBtn.style.display = "none"; return; }
    // фото
    preview.src = p.photo_url || placeholder(p.name); preview.style.display = ""; preview.onclick = () => p.photo_url && lightbox(p.photo_url);
    // доступно
    const inCart = state.items.filter(i => i.product_id === id).reduce((t, i) => t + i.qty, 0);
    const avail = (Number(p.stock_qty) || 0) - inCart;
    qtyLbl.innerHTML = 'Кол-во <span style="color:#fbbf24">(доступно: ' + avail + ')</span>';
    // цена по умолчанию
    const def = state.currency === "yuan" ? p.price_yuan : state.currency === "usd" ? p.price_usd : p.price_som;
    if (!fPrice.value) fPrice.value = def || "";
    // себестоимость
    costLine.textContent = "Себестоимость 1 ед.: " + fmt(p.cost_yuan, "yuan") + " ≈ " + fmt(convert(p.cost_yuan, "yuan", "som"), "som") + " ≈ " + fmt(convert(p.cost_yuan, "yuan", "usd"), "usd");
    costLine.style.display = costShown ? "" : "none";
    // прошлая цена этому клиенту
    const li = await ctx.db.lastSaleInfoForCustomer(state.customer_id, id);
    if (li) {
      // показываем ТОЧНУЮ цену в её исходной валюте (без пересчёта → без дрейфа)
      const lcur = li.currency || "som";
      const lprice = li.price != null ? li.price : convert(li.priceYuan, "yuan", lcur);
      lastHint.innerHTML = 'Прошлая цена (этому клиенту): <b style="color:var(--accent3)">' + fmt(lprice, lcur) + '</b> · ' + (li.date || "").slice(0, 10);
      // «Подставить»: если валюта совпадает — точное значение, иначе пересчёт в текущую валюту чека
      substBtn.style.display = ""; substBtn.onclick = () => { fPrice.value = lcur === state.currency ? round(lprice) : round(convert(lprice, lcur, state.currency)); };
      lastHint.append(substBtn);
    } else { lastHint.textContent = "Этот товар клиент ещё не покупал"; substBtn.style.display = "none"; }
  }

  function addToCart() {
    const id = selId(); if (!id) { toast("Выберите товар из списка", "err"); return; }
    const qv = +fQty.value || 0; if (qv <= 0) { toast("Укажите количество", "err"); return; }
    const pv = +fPrice.value || 0;
    state.items.push({ product_id: id, qty: qv, unit_price: pv, currency: state.currency, price_yuan_norm: round(convert(pv, state.currency, "yuan")), paid: state.paid });
    drawCart();
    fProduct.value = ""; fQty.value = ""; fPrice.value = ""; refreshAdd();
  }
  const addBtn = el("button.btn.btn-ok", { onclick: addToCart }, [icon("plus", { size: 16 }), "В чек"]);
  fQty.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addToCart(); } });

  // импорт списка продажи из Excel (название + кол-во + цена)
  async function importFromExcel(file) {
    showLoader("Импорт из Excel…");
    try {
      const rows = await parseRows(file, "sale");
      // Надёжная нормализация: схожие кириллица/латиница (P↔Р, C↔С, O↔О…) → один вид,
      // и убираем регистр, пробелы, скобки, |, /, дефисы — чтобы коды моделей совпадали.
      const FOLD = { а: "a", в: "b", е: "e", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c", т: "t", у: "y", х: "x", ё: "e", ѕ: "s", і: "i", ј: "j" };
      const keyOf = (s) => String(s || "").toLowerCase().split("").map(ch => FOLD[ch] || ch).join("").replace(/[^a-zа-я0-9]+/gi, "");
      const lookup = {};
      products.forEach(p => { const k = keyOf(p.name); if (k) lookup[k] = p.id; if (p.sku) { const ks = keyOf(p.sku); if (ks) lookup[ks] = p.id; } });
      if (!rows.length) { toast("В файле не найдено строк. Нужны колонки: Название, Количество, Цена (скачайте «Шаблон»).", "err"); return; }
      const notFound = []; let added = 0;
      rows.forEach(r => {
        const id = lookup[keyOf(r.name)];
        if (!id) { notFound.push(r.name); return; }
        const cur = r.currency || state.currency; // валюта из файла (если есть), иначе валюта чека
        state.items.push({ product_id: id, qty: r.qty || 1, unit_price: r.price || 0, currency: cur, price_yuan_norm: round(convert(r.price || 0, cur, "yuan")), paid: state.paid });
        added++;
      });
      drawCart();
      toast(`Добавлено: ${added} из ${rows.length}` + (notFound.length ? ` · не найдено: ${notFound.length}` : ""), added ? "ok" : "err");
      if (notFound.length) showNotFound(notFound);
    } catch (e) { toast("Ошибка: " + (e.message || e), "err"); }
    finally { hideLoader(); }
  }

  // ----- чек -----
  const itemsBox = el("div");
  const totalBox = el("div", { style: { textAlign: "right", fontSize: "20px", fontWeight: "800", marginTop: "10px" } });
  function drawCart() {
    itemsBox.innerHTML = "";
    if (!state.items.length) { itemsBox.append(el("div.empty", { style: { padding: "20px" } }, [el("p", { text: "Чек пуст — добавьте товары" })])); recalc(); return; }
    state.items.forEach((it, idx) => {
      if (!it.currency) it.currency = state.currency;
      const p = pmap[it.product_id] || { name: "?", photo_url: "" };
      const stock = Number(p.stock_qty) || 0;
      const q = input({ type: "number", value: it.qty, style: { width: "70px" } });
      const pr = input({ type: "number", step: "0.01", value: it.unit_price, style: { width: "100px" } });
      const fCur = select(Object.values(CUR).map(c => ({ value: c.code, label: c.sign })), it.currency, { style: { width: "76px" } });
      const lt = el("strong", { text: fmt(it.qty * it.unit_price, it.currency) });
      // остаток на складе рядом с товаром (видно, если клиент заказал больше, чем есть)
      const stockEl = el("div", { style: { fontSize: "12px", marginTop: "2px" } });
      // если накладная уже оформлена, её позиции уже списаны → доступно = остаток + уже списанное этой накладной
      const avail = stock + (consumedByProduct[it.product_id] || 0);
      const paintStock = () => {
        stockEl.innerHTML = "";
        if ((+it.qty || 0) > avail) stockEl.append(el("span", { text: `⚠ на складе ${avail}, заказано ${+it.qty || 0}`, style: { color: "var(--danger,#f87171)", fontWeight: "700" } }));
        else stockEl.append(el("span", { text: `на складе: ${avail}`, style: { color: "var(--muted)" } }));
      };
      paintStock();
      // подсказка владельцу при выставлении цены: себестоимость в ¥ + прошлая цена этому клиенту
      const li = lastPriceMap.get(it.product_id);
      const lastTxt = li
        ? " · Пред. цена клиенту: " + fmt(li.price != null ? li.price : convert(li.priceYuan, "yuan", li.currency), li.currency) + " · " + (li.date || "").slice(0, 10)
        : " · клиент не покупал";
      const infoEl = el("div", { style: { fontSize: "12px", color: "var(--muted)", marginTop: "2px" } }, [
        el("span", { text: "Себест.: " + fmt(p.cost_yuan, "yuan"), style: { color: "#fbbf24" } }),
        el("span", { text: lastTxt }),
      ]);
      const upd = () => { lt.textContent = fmt(it.qty * it.unit_price, it.currency); paintStock(); recalc(); };
      q.addEventListener("input", () => { it.qty = +q.value || 0; upd(); });
      pr.addEventListener("input", () => { it.unit_price = +pr.value || 0; it.price_yuan_norm = round(convert(it.unit_price, it.currency, "yuan")); upd(); });
      fCur.addEventListener("change", () => { it.currency = fCur.value; it.price_yuan_norm = round(convert(it.unit_price, it.currency, "yuan")); upd(); });
      itemsBox.append(el("div.card.sale-item", { style: { padding: "10px 12px", marginBottom: "9px", display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" } }, [
        el("img.thumb", { src: p.photo_url || placeholder(p.name), style: { cursor: "zoom-in" }, onclick: () => p.photo_url && lightbox(p.photo_url), onerror: function () { this.src = placeholder(p.name); } }),
        el("div", { style: { flex: "1", minWidth: "130px" } }, [el("div", { text: p.name, style: { fontWeight: "600" } }), stockEl, infoEl]),
        el("div", {}, [el("div.field-label", { text: "Кол-во" }), q]),
        el("div", {}, [el("div.field-label", { text: "Цена" }), pr]),
        el("div", {}, [el("div.field-label", { text: "Валюта" }), fCur]),
        el("div", { style: { minWidth: "90px", textAlign: "right" } }, [el("div.field-label", { text: "Сумма" }), lt]),
        el("button.btn.btn-danger.btn-sm.btn-icon", { title: "Убрать", onclick: () => { state.items.splice(idx, 1); drawCart(); refreshAdd(); } }, [icon("x", { size: 15 })]),
      ]));
    });
    recalc();
  }
  function recalc() {
    totalBox.innerHTML = ""; totalBox.append("Итого: ", el("span.gradtext", { text: curStr(sumByCur(state.items)) }));
  }

  const body = el("div", {}, [
    el("div.sale-head", {}, [
      el("div", { style: { fontWeight: "800", fontSize: "16px", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" } }, [el("span", { style: { color: "#fbbf24" }, text: "●" }), "Оформить продажу"]),
      el("div.row3", {}, [field("Клиент (поиск)", fCustomer), field("Оплата", fPaid), field("Валюта по умолч.", fCurrency)]),
      el("div.row2", {}, [field("Дата", fDate), field("Коробок отправлено", fBoxes)]),
      noStockRow,
    ]),
    el("div", { style: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginTop: "4px" } }, [
      el("div.section-h", { text: "Добавьте товары в чек", style: { margin: "0", flex: "1" } }),
      el("button.btn.btn-outline.btn-sm", { text: "📄 Шаблон", title: "Скачать шаблон Excel", onclick: () => downloadTemplate("sale") }),
      el("button.btn.btn-outline.btn-sm", { text: "📥 Из Excel", title: "Импорт списка из Excel", onclick: () => pickFile(importFromExcel) }),
    ]),
    el("div", { style: { display: "flex", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" } }, [
      preview,
      el("div", { style: { flex: "1", minWidth: "260px" } }, [
        el("div", { style: { display: "flex", gap: "10px", alignItems: "flex-end", flexWrap: "wrap" } }, [
          el("div", { style: { flex: "1", minWidth: "180px" } }, [el("div.field-label", { text: "Товар (впишите или выберите)" }), fProduct]),
          el("div", {}, [qtyLbl, fQty]),
          el("div", {}, [el("div.field-label", { text: "Цена за ед." }), fPrice]),
          addBtn,
        ]),
        lastHint,
        costBtn, costLine,
      ]),
    ]),
    el("div.section-h", { text: "Чек" }),
    itemsBox, totalBox,
  ]);
  drawCart();
  loadLastPrices(); // подтянуть прошлые цены клиента и перерисовать строки с подсказками

  // «заказ из бота/сайта» — пока НЕ оформлен (по статусу). Как только оформлен (final) — это обычная накладная,
  // кнопку «На подтверждение» больше не показываем.
  const isBotOrder = sale && ["order", "pending_confirm", "confirmed"].includes(sale.status);

  modal({
    title: isNew ? "Новая продажа" : (isBotOrder ? "Заказ из бота" : "Накладная"),
    wide: true, body,
    actions: isBotOrder ? [
      { label: "Отмена", kind: "btn-outline", onClick: c => c() },
      { label: "📤 На подтверждение клиенту", kind: "btn-outline", onClick: (close) => sendForConfirm(ctx, sale, state, close, customers) },
      { label: "✅ Оформить и отправить PDF клиенту", kind: "btn-primary", onClick: (close) => save(ctx, sale, state, "final", close, customers, products, false, true) },
    ] : [
      { label: "Отмена", kind: "btn-outline", onClick: c => c() },
      { label: "💾 Сохранить", kind: "btn-outline", onClick: (close) => save(ctx, sale, state, "final", close, customers, products, false, false, chkNoStock.checked) },
      { label: "Сохранить + Telegram", kind: "btn-primary", onClick: (close) => save(ctx, sale, state, "final", close, customers, products, true, false, chkNoStock.checked) },
    ],
  });
}

// Отправить заказ клиенту на подтверждение цены (статус pending_confirm, склад НЕ списываем).
async function sendForConfirm(ctx, sale, state, close, customers) {
  if (!state.items.length) { toast("Добавьте позиции с ценами", "err"); return; }
  if (state.items.some(it => !(it.unit_price > 0))) { toast("У некоторых позиций нет цены", "err"); return; }
  showLoader("Отправка клиенту…");
  try {
    const customer_id = state.customer_id || sale.customer_id || null;
    await ctx.db.sales.upsert({ id: sale.id, customer_id, date: state.date || sale.date, currency: state.currency, status: "pending_confirm", items: state.items });
    const cust = customers.find(c => c.id === customer_id);
    const chatId = cust?.tg_chat_id || sale?.order_from?.chat_id;
    if (!chatId) { toast("У клиента нет Telegram (chat_id) — отправьте подтверждение вручную", "err"); close(); ctx.refresh(); return; }
    await requestOrderConfirm(sale.id, chatId);
    toast("Отправлено клиенту на подтверждение ✅", "ok");
    close(); ctx.refresh();
  } catch (e) { toast("Ошибка: " + (e.message || e), "err"); }
  finally { hideLoader(); }
}

async function save(ctx, sale, state, status, close, customers, products, doSend, toClient, noStock) {
  if (!state.customer_id) { toast("Выберите клиента", "err"); return; }
  if (!state.items.length) { toast("Добавьте товары", "err"); return; }
  state.items.forEach(it => { it.paid = !!state.paid; });
  showLoader(doSend || toClient ? "Сохранение и отправка…" : "Сохранение…");
  const wasOrder = sale && ["order", "pending_confirm", "confirmed"].includes(sale.status); // заказ из бота: склад ещё НЕ списывался
  const obj = {
    ...(sale ? { id: sale.id } : {}),
    customer_id: state.customer_id, date: state.date || new Date().toISOString(),
    currency: state.currency, status, telegram_sent: sale?.telegram_sent || false, items: state.items,
    boxes: +state.boxes || 0, // раньше писали отдельным запросом — теперь сразу (быстрее)
  };
  try {
    if (noStock) {
      // «Не списывать со склада»: товар уже отгружён ранее (восстановление накладной).
      // Остаток НЕ трогаем, но проставим себестоимость, чтобы при УДАЛЕНИИ накладной товар корректно вернулся на склад.
      state.items.forEach(it => {
        const p = products.find(x => x.id === it.product_id); if (!p) return;
        it.cogs_yuan = (Number(p.cost_yuan) || 0) * (Number(it.qty) || 0);
        it.cogs_usd = (Number(p.cost_usd) || 0) * (Number(it.qty) || 0);
      });
    } else {
      // --- FIFO: вернуть старые позиции (если правка обычной накладной) и списать новые ---
      const touched = new Set([...((sale && sale.items) || []).map(i => i.product_id), ...state.items.map(i => i.product_id)].filter(Boolean));
      // ВАЖНО: берём КАРТОЧКИ ТОВАРОВ СВЕЖИМИ с сервера. Список в памяти мог устареть
      // (страницу открыли давно / правили с другого устройства) — тогда остаток записывался неверно.
      const fresh = {};
      await Promise.all([...touched].map(async (pid) => {
        try { const p = await ctx.db.products.get(pid); if (p && p.id) fresh[pid] = p; } catch {}
      }));
      const P = (id) => fresh[id] || products.find(x => x.id === id);

      // для заказа из бота старые позиции НЕ возвращаем — их со склада ещё не списывали
      if (sale && !wasOrder) (sale.items || []).forEach(it => {
        const p = P(it.product_id); if (!p) return;
        const perY = it.qty ? (Number(it.cogs_yuan) || 0) / it.qty : (Number(p.cost_yuan) || 0);
        const perU = it.qty ? (Number(it.cogs_usd) || 0) / it.qty : (Number(p.cost_usd) || 0);
        p.batches = returnToStock(ensureBatches(p), it.qty, perY, perU, sale.date);
      });
      state.items.forEach(it => {
        const p = P(it.product_id); if (!p) return;
        const r = consumeFIFO(ensureBatches(p), it.qty);
        p.batches = r.batches; it.cogs_yuan = r.cogY; it.cogs_usd = r.cogU;
      });

      // пишем все затронутые товары ПАРАЛЛЕЛЬНО (раньше — по очереди, отсюда долгое сохранение)
      const expected = {};
      const notFound = [];
      await Promise.all([...touched].map(async (pid) => {
        const p = P(pid);
        if (!p) { notFound.push(pid); return; }
        // склад распродан → сохраняем прежнюю себестоимость (не обнуляем)
        const cc = costAfter(p.batches || [], p);
        const qty = sumQty(p.batches || []);
        expected[pid] = qty;
        const base = { id: p.id, stock_qty: qty, cost_yuan: cc.cost_yuan, cost_usd: cc.cost_usd };
        try { await ctx.db.products.upsert({ ...base, batches: p.batches }); }
        catch (e) { await ctx.db.products.upsert(base); } // если колонки batches ещё нет
      }));

      // ПРОВЕРКА: остаток действительно изменился на сервере (раньше сбой проходил незаметно)
      const bad = [];
      await Promise.all(Object.keys(expected).map(async (pid) => {
        try {
          const now = await ctx.db.products.get(pid);
          if (!now || Math.abs((Number(now.stock_qty) || 0) - expected[pid]) > 0.001) {
            await ctx.db.products.upsert({ id: pid, stock_qty: expected[pid] });   // повторная попытка
            const again = await ctx.db.products.get(pid);
            if (!again || Math.abs((Number(again.stock_qty) || 0) - expected[pid]) > 0.001) bad.push(P(pid)?.name || pid);
          }
        } catch { bad.push(P(pid)?.name || pid); }
      }));
      if (notFound.length) toast("Товар не найден в базе (остаток не изменён): " + notFound.length + " поз.", "err");
      if (bad.length) toast("⚠ Остаток НЕ записался: " + bad.slice(0, 3).join(", ") + (bad.length > 3 ? " и ещё " + (bad.length - 3) : "") + ". Проверьте связь и повторите.", "err");
    }
    let saved;
    try { saved = await ctx.db.sales.upsert(obj); }
    catch (e) {
      // на случай, если колонки boxes ещё нет в старой БД — повторяем без неё
      if (/boxes/i.test(String(e.message || ""))) { const { boxes, ...noBox } = obj; saved = await ctx.db.sales.upsert(noBox); }
      else throw e;
    }
    // новая «оплаченная» (наличная) продажа → записываем оплату (статус долга считается по оплатам)
    if (!sale && state.paid) {
      try {
        const byCur = {};
        state.items.forEach(it => { const cu = it.currency || state.currency; byCur[cu] = (byCur[cu] || 0) + it.qty * it.unit_price; });
        for (const cu of Object.keys(byCur)) if (byCur[cu] > 0.0001) await ctx.db.payments.upsert({ customer_id: state.customer_id, amount: byCur[cu], currency: cu, date: state.date || new Date().toISOString(), note: "Оплата по накладной" });
      } catch (e) { console.warn("autopay:", e.message); }
    }
    toast("Сохранено", "ok");
    if (doSend) {
      try {
        await sendInvoicePDF((saved || obj).id);
        await ctx.db.sales.upsert({ id: (saved || obj).id, telegram_sent: true });
        toast("Отправлено в канал (PDF)", "ok");
      } catch (e) { toast("Telegram: " + e.message + " (накладная сохранена)", "err"); }
    }
    // --- подтверждение заказа: отправить накладную клиенту в его бот ---
    if (toClient) {
      const cust = customers.find(c => c.id === state.customer_id);
      const chatId = cust?.tg_chat_id || sale?.order_from?.chat_id;
      if (chatId) {
        try {
          await notifyClient(chatId, "✅ Ваша накладная готова! Отправляем…");
          await sendInvoicePDFToClient((saved || obj).id, chatId, "🧾 Ваша накладная");
          toast("Отправлено клиенту", "ok");
        } catch (e) { toast("Клиенту не отправлено: " + e.message, "err"); }
      } else {
        toast("У клиента нет Telegram — отправьте вручную (нет chat_id)", "err");
      }
    }
    close(); ctx.refresh();
  } catch (e) {
    console.error(e);
    const msg = String(e.message || e);
    if (/row-level|JWT|expired|permission|not authenticated/i.test(msg)) toast("Сессия истекла. Обновите страницу (Ctrl+F5) и войдите заново.", "err");
    else toast("Ошибка сохранения: " + msg, "err");
  } finally { hideLoader(); }
}

// удаление накладной с возвратом товаров на склад
export async function deleteSale(ctx, sale, products) {
  try {
    // склад списывался ТОЛЬКО при оформлении (final). Заказ из бота/сайта (order/confirmed) — не списывался,
    // поэтому при его удалении остаток НЕ трогаем (иначе ложно прибавим).
    const wasDeducted = sale.status === "final";
    if (wasDeducted) for (const it of (sale.items || [])) {
      const p = products.find(x => x.id === it.product_id); if (!p) continue;
      const perY = it.qty ? (Number(it.cogs_yuan) || 0) / it.qty : (Number(p.cost_yuan) || 0);
      const perU = it.qty ? (Number(it.cogs_usd) || 0) / it.qty : (Number(p.cost_usd) || 0);
      p.batches = returnToStock(ensureBatches(p), it.qty, perY, perU, sale.date);
      const cc = costAfter(p.batches, p);
      const base = { id: p.id, stock_qty: sumQty(p.batches), cost_yuan: cc.cost_yuan, cost_usd: cc.cost_usd };
      try { await ctx.db.products.upsert({ ...base, batches: p.batches }); } catch (e) { await ctx.db.products.upsert(base); }
    }
    await ctx.db.sales.remove(sale.id);
    toast(wasDeducted ? "Удалено, остаток возвращён" : "Удалено", "ok"); ctx.refresh();
  } catch (e) { toast("Ошибка удаления: " + (e.message || e), "err"); }
}

async function resend(ctx, s, cmap, products) {
  try {
    await sendInvoicePDF(s.id);
    await ctx.db.sales.upsert({ id: s.id, telegram_sent: true });
    toast("Отправлено в канал (PDF)", "ok"); ctx.refresh();
  } catch (e) { toast(e.message, "err"); }
}

export function buildText(s, cust, products) {
  const pmap = Object.fromEntries(products.map(p => [p.id, p]));
  const lines = (s.items || []).map((i, n) => {
    const c = i.currency || s.currency;
    return `${n + 1}. ${pmap[i.product_id]?.name || "?"} — ${i.qty} × ${fmt(i.unit_price, c)} = ${fmt(i.qty * i.unit_price, c)}`;
  });
  return [
    "🧾 *НАКЛАДНАЯ*",
    `📅 ${new Date(s.date).toLocaleDateString("ru-RU")}`,
    `👤 Клиент: ${cust?.name || "—"}`,
    "",
    ...lines,
    "",
    `💰 *ИТОГО: ${curStr(sumByCur(s.items))}*`,
  ].join("\n");
}

const round = (n) => Math.round((Number(n) || 0) * 100) / 100;
