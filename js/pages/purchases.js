// ========================================================================
//  СТРАНИЦА «ПРИХОД» — поступления: «в дороге» / «уже пришёл»
// ========================================================================
import { el, toast, modal, confirmDialog, field, input, select, inputList, lightbox, showLoader, hideLoader } from "../ui.js?v=20260820f";
import { fmt, CUR, convert } from "../fx.js?v=20260820f";
import { placeholder } from "./products.js?v=20260820f";
import { consumeFIFO, ensureBatches, sumQty, currentCost, costAfter } from "../inventory.js?v=20260820f";
import { icon } from "../icons.js?v=20260820f";
import { downloadTemplate, parseRows, pickFile } from "../xlsx-import.js?v=20260820f";
import { notifyOwner } from "../telegram.js?v=20260820f";
import { authHeaders } from "../db.js?v=20260820f";
import { thumb } from "../img.js?v=20260820f";
import { KIND_SHOP, purchaseKind, isShop, kindOptions, kindText, kindWho } from "../purchase.js?v=20260820f";

// разослать клиентам в Telegram-бот, что пришли новые товары (не блокирует оприходование)
async function notifyClientsNewProducts(productIds) {
  try {
    const r = await fetch("/api/notify-new-products", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ product_ids: productIds }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) toast(`Клиенты оповещены о новинках (${j.sent || 0})`, "ok");
    else toast("Оповещение не отправлено: " + (j.error || r.status), "err");
  } catch (e) { toast("Оповещение не отправлено: " + (e.message || e), "err"); }
}

// Модалка «не найдено в каталоге» (общая для прихода и продажи).
export function showNotFound(list) {
  modal({
    title: `Не найдено в каталоге (${list.length})`,
    body: el("div", {}, [
      el("div.hint", { text: "Эти позиции пропущены — таких товаров нет в каталоге. Добавьте их в «Товары» или проверьте названия." }),
      el("div", { style: { maxHeight: "40vh", overflow: "auto" } }, list.map(n => el("div", { style: { padding: "6px 2px", borderBottom: "1px solid var(--border)", fontSize: "14px" }, text: "• " + n }))),
    ]),
    actions: [{ label: "Понятно", kind: "btn-primary", onClick: c => c() }],
  });
}

const PCUR = [{ value: "yuan", label: "Юань ¥" }, { value: "usd", label: "Доллар $" }, { value: "som", label: "Сум" }];

// Показать все товары накладной поставщика (фото + название + кол-во) — что в дороге / что пришло
function showPurchaseItems(s, products) {
  const pmap = Object.fromEntries(products.map(p => [p.id, p]));
  const statusTxt = s.status === "arrived" ? "✅ Уже пришёл" : "🚚 В дороге";
  const rows = (s.items || []).map(it => {
    const p = pmap[it.product_id] || { name: "?" };
    return el("div.card", { style: { padding: "8px 10px", marginBottom: "8px", display: "flex", gap: "10px", alignItems: "center" } }, [
      el("img.thumb", { src: p.photo_url ? thumb(p.photo_url, 60) : placeholder(p.name), loading: "lazy", decoding: "async", style: { width: "60px", height: "60px", cursor: "zoom-in" }, title: "Увеличить", onclick: () => p.photo_url && lightbox(p.photo_url), onerror: function () { this.src = placeholder(p.name); } }),
      el("div", { style: { flex: "1", minWidth: "0", fontWeight: "600" }, text: p.name }),
      el("div", { style: { fontWeight: "700", whiteSpace: "nowrap", fontSize: "15px" }, text: "× " + it.qty }),
    ]);
  });
  modal({
    title: `${s.supplier || "—"} · ${statusTxt}`,
    body: el("div", {}, [
      el("div.hint", { text: `Дата: ${new Date(s.date).toLocaleDateString("ru-RU")} · Позиций: ${(s.items || []).length}` }),
      el("div", { style: { maxHeight: "60vh", overflow: "auto", marginTop: "10px" } }, rows.length ? rows : [el("div.empty", {}, [el("p", { text: "Товаров нет" })])]),
    ]),
    actions: [{ label: "Закрыть", kind: "btn-primary", onClick: c => c() }],
  });
}

export default async function render(page, ctx) {
  const [purchases, products] = await Promise.all([ctx.db.purchases.list(), ctx.db.products.list()]);
  const pmap = Object.fromEntries(products.map(p => [p.id, p]));
  const suppliers = [...new Set(purchases.map(p => p.supplier).filter(Boolean))];

  page.append(
    el("div.topbar", {}, [
      el("div", {}, [el("h1", { text: "Приход товара" }), el("div.sub", { text: `Поступлений: ${purchases.length}` })]),
      el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } }, [
        el("button.btn.btn-outline", { title: "Отправить всем клиентам в Telegram: «пришли новые товары» + ссылки", onclick: () => confirmDialog("Отправить всем клиентам в Telegram уведомление о новых товарах?", () => notifyClientsNewProducts([])) }, ["📢 Оповестить клиентов"]),
        el("button.btn.btn-primary", { onclick: () => openEditor(ctx, null, products, suppliers) }, [icon("plus", { size: 16 }), "Новый приход"]),
      ]),
    ]),
  );

  if (!purchases.length) { page.append(el("div.empty", {}, [el("div.em-ic", {}, [icon("truck", { size: 40 })]), el("p", { text: "Поступлений пока нет" })])); return; }

  const fFilter = select([{ value: "", label: "Все приходы" }, ...kindOptions()], "");
  fFilter.style.maxWidth = "220px";
  fFilter.addEventListener("change", draw);
  page.append(el("div", { style: { margin: "0 0 12px" } }, [fFilter]));

  const tbody = el("tbody");
  function draw() {
  tbody.textContent = "";
  purchases.filter(s => !fFilter.value || purchaseKind(s) === fFilter.value)
    .sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(s => {
    const total = (s.items || []).reduce((t, i) => t + i.qty * i.unit_cost, 0);
    tbody.append(el("tr", {}, [
      el("td", { text: new Date(s.date).toLocaleDateString("ru-RU") }),
      el("td", {}, [el("strong", { text: s.supplier || "—" }), isShop(s) && el("div", { style: { fontSize: "12px", color: "var(--muted)" }, text: kindText(s.kind) })].filter(Boolean)),
      el("td", {}, [el("span.badge.cur", { text: CUR[s.currency].label })]),
      el("td", { text: (s.items || []).length + " поз." }),
      el("td", {}, [el("strong", { text: fmt(total, s.currency) })]),
      el("td", {}, [s.status === "arrived"
        ? el("span.badge.arrived", {}, [icon("check", { size: 13 }), "Пришёл"])
        : el("span.badge.transit", {}, [icon("truck", { size: 13 }), "В дороге"])]),
      el("td.right", {}, [el("div.row-actions", {}, [
        s.status !== "arrived" && el("button.btn.btn-ok.btn-sm", { text: "Оприходовать", title: "Отметить «пришёл» и добавить на склад", onclick: () => arrive(ctx, s, products) }),
        s.status === "arrived" && el("button.btn.btn-outline.btn-sm", { title: "Если оприходовали дважды — списать товары этого прихода один раз", onclick: () => unarriveOnce(ctx, s, products) }, ["↩️ −1 оприх."]),
        el("button.btn.btn-outline.btn-sm", { title: "Показать товары этого поставщика (фото + кол-во)", text: "👁 Товары", onclick: () => showPurchaseItems(s, products) }),
        el("button.btn.btn-outline.btn-sm.btn-icon", { title: "Редактировать", onclick: () => openEditor(ctx, s, products, suppliers) }, [icon("edit", { size: 16 })]),
        el("button.btn.btn-danger.btn-sm.btn-icon", { title: "Удалить", onclick: () => confirmDialog("Удалить приход?" + (s.status === "arrived" ? " Оприходованные товары спишутся со склада." : ""), async () => {
          if (s.status === "arrived") { for (const it of (s.items || [])) { const p = pmap[it.product_id]; if (!p) continue; const r = consumeFIFO(ensureBatches(p), it.qty); p.batches = r.batches; const cc = costAfter(r.batches, p); const base = { id: p.id, stock_qty: sumQty(r.batches), cost_yuan: cc.cost_yuan, cost_usd: cc.cost_usd }; try { await ctx.db.products.upsert({ ...base, batches: r.batches }); } catch (e) { await ctx.db.products.upsert(base); } } }
          await ctx.db.purchases.remove(s.id); toast("Удалено", "ok"); ctx.refresh();
        }) }, [icon("trash", { size: 16 })]),
      ].filter(Boolean))]),
    ]));
  });
  }
  draw();
  page.append(el("div", { style: { overflowX: "auto" } }, [el("table.tbl", {}, [
    el("thead", {}, [el("tr", {}, ["Дата", "Поставщик / магазин", "Валюта", "Позиции", "Сумма", "Статус", ""].map(h => el("th", { text: h })))]),
    tbody,
  ])]));
}

// списать товары этого прихода со склада ОДИН раз — если приход случайно оприходован дважды
async function unarriveOnce(ctx, s, products) {
  const pmap = Object.fromEntries(products.map(p => [p.id, p]));
  confirmDialog("Списать товары этого прихода со склада ОДИН раз? (используйте, если оприходовали дважды). Запись прихода останется.", async () => {
    for (const it of (s.items || [])) {
      const p = pmap[it.product_id]; if (!p) continue;
      const r = consumeFIFO(ensureBatches(p), it.qty);
      p.batches = r.batches;
      const cc = costAfter(r.batches, p);
      const base = { id: p.id, stock_qty: sumQty(r.batches), cost_yuan: cc.cost_yuan, cost_usd: cc.cost_usd };
      try { await ctx.db.products.upsert({ ...base, batches: r.batches }); } catch (e) { await ctx.db.products.upsert(base); }
    }
    toast("Списано один раз — остатки исправлены", "ok"); ctx.refresh();
  });
}

async function arrive(ctx, s, products) {
  confirmDialog("Оприходовать поступление? Товары добавятся на склад.", async () => {
    await applyArrival(ctx, s, products);
    await ctx.db.purchases.upsert({ id: s.id, status: "arrived" });
    const pmap2 = Object.fromEntries(products.map(p => [p.id, p]));
    const lines = (s.items || []).map(it => `• ${pmap2[it.product_id]?.name || "?"} × ${it.qty}`);
    try { await notifyOwner(`Новый приход на склад\n${kindWho(s.kind)}: ${s.supplier || "—"}\n\n${lines.join("\n")}`); } catch {}
    toast("Оприходовано, остатки обновлены", "ok");
    // Оповещаем клиентов только о поставках. Приход из магазина — пополнение
    // того, что уже продаётся, рассылать о нём «пришли новинки» незачем.
    if (!isShop(s)) {
      const productIds = [...new Set((s.items || []).map(it => it.product_id).filter(Boolean))];
      if (productIds.length) await notifyClientsNewProducts(productIds);
    }
    ctx.refresh();
  });
}

// Добавить количества на склад. Себестоимость НЕ перескакивает на цену нового
// прихода: пока лежит старая партия, она и продаётся, значит и цена показывается её.
// Новая цена вступит в силу сама, когда FIFO доест старую партию (costAfter в продажах).
async function applyArrival(ctx, s, products) {
  const shop = isShop(s);
  for (const it of s.items || []) {
    const p = products.find(x => x.id === it.product_id);
    if (!p) continue;
    const cur = it.currency || s.currency;
    // FIFO: добавляем новую партию в конец (старые партии не трогаем — продаются первыми)
    const batches = ensureBatches(p);
    const own = currentCost(batches);
    // из магазина — цена наша складская, чтобы себестоимость и прибыль не поехали
    const cy = shop ? own.cost_yuan : Math.round(convert(it.unit_cost, cur, "yuan") * 100) / 100;
    const cu = shop ? own.cost_usd : Math.round(convert(it.unit_cost, cur, "usd") * 100) / 100;
    batches.push({ qty: Number(it.qty) || 0, cost_yuan: cy, cost_usd: cu, date: s.date || new Date().toISOString() });
    p.batches = batches;
    // текущая себестоимость = цена СТАРЕЙШЕЙ непустой партии.
    // Если склада не было (или был минус) — это и будет цена нового прихода.
    const cc = costAfter(batches, { cost_yuan: cy, cost_usd: cu });
    p.cost_yuan = cc.cost_yuan; p.cost_usd = cc.cost_usd;
    // last_arrival_at поднимает товар в начало каталога и помечает его новинкой.
    // Приход из магазина — это пополнение, а не новинка, поэтому дату не трогаем:
    // иначе давно продающийся товар всплывал бы наверх после каждой добавки.
    const base = { id: p.id, stock_qty: sumQty(batches), cost_yuan: cc.cost_yuan, cost_usd: cc.cost_usd };
    if (!shop) base.last_arrival_at = new Date().toISOString();
    try { await ctx.db.products.upsert({ ...base, batches }); }
    catch (e) { await ctx.db.products.upsert(base); }
  }
}

function openEditor(ctx, purchase, products, suppliers = []) {
  const isNew = !purchase;
  const pmap = Object.fromEntries(products.map(p => [p.id, p]));
  const state = purchase
    ? { supplier: purchase.supplier, currency: purchase.currency, status: purchase.status, date: purchase.date, kind: purchaseKind(purchase), items: JSON.parse(JSON.stringify(purchase.items || [])) }
    : { supplier: "", currency: "yuan", status: "in_transit", date: new Date().toISOString(), kind: "supplier", items: [] };

  const fKind = select(kindOptions(), state.kind);
  const fSupplier = inputList(suppliers, { value: state.supplier || "", placeholder: "Поставщик (выбор или ввод)" });
  const supplierField = field(kindWho(state.kind), fSupplier);
  const shopHint = el("div", { style: { fontSize: "13px", margin: "-4px 0 6px", color: "var(--muted)", display: state.kind === KIND_SHOP ? "" : "none" },
    text: "Товар из магазина приходует по НАШЕЙ складской цене — себестоимость менять не нужно." });
  const fCurrency = select(PCUR, state.currency);
  const fStatus = select([{ value: "in_transit", label: "В дороге" }, { value: "arrived", label: "Уже пришёл" }], state.status);
  const itemsBox = el("div");
  const totalBox = el("div", { style: { textAlign: "right", fontSize: "20px", fontWeight: "800", marginTop: "10px" } });
  const nameToId = {}; products.forEach(p => { nameToId[(p.name || "").toLowerCase()] = p.id; });

  // ----- панель добавления (как в продажах): товар + кол-во + себестоимость -----
  const fProduct = inputList(products.map(p => p.name), { placeholder: "впишите или выберите", style: { flex: "1", minWidth: "180px" } });
  const fQty = input({ type: "number", placeholder: "0", style: { width: "110px" } });
  const fCost = input({ type: "number", step: "0.01", placeholder: "0", style: { width: "130px" } });
  const preview = el("img.thumb", { style: { width: "72px", height: "72px", cursor: "zoom-in", display: "none" }, title: "Увеличить" });
  const costHint = el("div", { style: { fontSize: "13px", margin: "6px 0", color: "var(--muted)" } });
  const selId = () => nameToId[(fProduct.value || "").trim().toLowerCase()] || "";

  function refreshAdd() {
    const p = pmap[selId()];
    if (!p) { preview.style.display = "none"; costHint.textContent = ""; return; }
    preview.src = p.photo_url || placeholder(p.name); preview.style.display = ""; preview.onclick = () => p.photo_url && lightbox(p.photo_url);
    // цена по FIFO-партиям — то, во что товар обходится нам прямо сейчас
    const own = currentCost(ensureBatches(p));
    const def = state.currency === "usd" ? own.cost_usd : state.currency === "yuan" ? own.cost_yuan : Math.round(convert(own.cost_yuan, "yuan", "som"));
    // из магазина — цена всегда наша, поле только для справки
    if (state.kind === KIND_SHOP) { fCost.value = def || 0; fCost.disabled = true; fCost.title = "Из магазина товар приходует по нашей складской цене"; }
    else { fCost.disabled = false; fCost.title = ""; if (!fCost.value) fCost.value = def || ""; }
    costHint.textContent = "Текущая себестоимость: " + fmt(own.cost_yuan, "yuan");
  }
  fProduct.addEventListener("input", refreshAdd);
  fCurrency.addEventListener("change", () => { state.currency = fCurrency.value; refreshAdd(); drawItems(); });
  fKind.addEventListener("change", () => {
    state.kind = fKind.value;
    const who = kindWho(state.kind);
    supplierField.querySelector(".field-label").textContent = who;
    fSupplier.placeholder = who + " (выбор или ввод)";
    shopHint.style.display = state.kind === KIND_SHOP ? "" : "none";
    fCost.value = ""; refreshAdd();
  });

  function addToCart() {
    const id = selId(); if (!id) { toast("Выберите товар из списка", "err"); return; }
    const qv = +fQty.value || 0; if (qv <= 0) { toast("Укажите количество", "err"); return; }
    state.items.push({ product_id: id, qty: qv, unit_cost: +fCost.value || 0, currency: state.currency });
    drawItems();
    fProduct.value = ""; fQty.value = ""; fCost.value = ""; refreshAdd();
  }
  const addBtn = el("button.btn.btn-ok", { onclick: addToCart }, [icon("plus", { size: 16 }), "Добавить"]);
  fQty.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addToCart(); } });
  fCost.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addToCart(); } });

  // импорт списка прихода из Excel (название + кол-во + себестоимость)
  async function importFromExcel(file) {
    showLoader("Импорт из Excel…");
    try {
      const rows = await parseRows(file, "purchase");
      const notFound = []; let added = 0;
      rows.forEach(r => {
        const id = nameToId[(r.name || "").toLowerCase()];
        if (!id) { notFound.push(r.name); return; }
        state.items.push({ product_id: id, qty: r.qty || 1, unit_cost: r.cost || 0, currency: state.currency });
        added++;
      });
      drawItems();
      toast(`Добавлено позиций: ${added}`, added ? "ok" : "err");
      if (notFound.length) showNotFound(notFound);
    } catch (e) { toast("Ошибка: " + (e.message || e), "err"); }
    finally { hideLoader(); }
  }
  function drawItems() {
    itemsBox.innerHTML = "";
    if (!state.items.length) itemsBox.append(el("div.empty", { style: { padding: "24px" } }, [el("p", { text: "Добавьте товары" })]));
    state.items.forEach((it, idx) => {
      const p = pmap[it.product_id] || { name: "?" };
      const qty = input({ type: "number", value: it.qty, style: { width: "80px" } });
      const cost = input({ type: "number", step: "0.01", value: it.unit_cost, style: { width: "110px" } });
      const lt = el("strong", { text: fmt(it.qty * it.unit_cost, state.currency) });
      qty.addEventListener("input", () => { it.qty = +qty.value || 0; lt.textContent = fmt(it.qty * it.unit_cost, state.currency); recalc(); });
      cost.addEventListener("input", () => { it.unit_cost = +cost.value || 0; it.currency = state.currency; lt.textContent = fmt(it.qty * it.unit_cost, state.currency); recalc(); });
      itemsBox.append(el("div.card", { style: { padding: "12px", marginBottom: "10px", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" } }, [
        el("img.thumb", { src: p.photo_url ? thumb(p.photo_url, 60) : placeholder(p.name), loading: "lazy", decoding: "async", onerror: function(){ this.src = placeholder(p.name); } }),
        el("div", { style: { flex: "1", minWidth: "140px", fontWeight: "600" }, text: p.name }),
        el("div", {}, [el("div.field-label", { text: "Кол-во" }), qty]),
        el("div", {}, [el("div.field-label", { text: "Себест. " + CUR[state.currency].sign }), cost]),
        el("div", { style: { minWidth: "90px", textAlign: "right" } }, [el("div.field-label", { text: "Сумма" }), lt]),
        el("button.btn.btn-danger.btn-sm.btn-icon", { title: "Убрать", onclick: () => { state.items.splice(idx, 1); drawItems(); } }, [icon("x", { size: 15 })]),
      ]));
    });
    recalc();
  }
  function recalc() {
    const total = state.items.reduce((t, i) => t + i.qty * i.unit_cost, 0);
    totalBox.innerHTML = ""; totalBox.append("Итого: ", el("span.gradtext", { text: fmt(total, state.currency) }));
  }
  drawItems();

  const body = el("div", {}, [
    el("div.row2", {}, [field("Тип прихода", fKind), field("Валюта", fCurrency)]),
    supplierField, shopHint,
    field("Статус", fStatus),
    el("div.hint", { text: "При статусе «Уже пришёл» товары автоматически добавятся на склад." }),
    el("div", { style: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginTop: "8px" } }, [
      el("div.section-h", { text: "Добавьте товары", style: { margin: "0", flex: "1" } }),
      el("button.btn.btn-outline.btn-sm", { text: "📄 Шаблон", title: "Скачать шаблон Excel", onclick: () => downloadTemplate("purchase") }),
      el("button.btn.btn-outline.btn-sm", { text: "📥 Из Excel", title: "Импорт списка из Excel", onclick: () => pickFile(importFromExcel) }),
    ]),
    el("div", { style: { display: "flex", gap: "12px", alignItems: "flex-start", flexWrap: "wrap", marginBottom: "10px" } }, [
      preview,
      el("div", { style: { flex: "1", minWidth: "260px" } }, [
        el("div", { style: { display: "flex", gap: "10px", alignItems: "flex-end", flexWrap: "wrap" } }, [
          el("div", { style: { flex: "1", minWidth: "180px" } }, [el("div.field-label", { text: "Товар (впишите или выберите)" }), fProduct]),
          el("div", {}, [el("div.field-label", { text: "Кол-во" }), fQty]),
          el("div", {}, [el("div.field-label", { text: "Себест. за ед." }), fCost]),
          addBtn,
        ]),
        costHint,
      ]),
    ]),
    el("div.section-h", { text: "Список прихода" }),
    itemsBox, totalBox,
  ]);

  modal({
    title: isNew ? "Новый приход" : "Приход", wide: true, body,
    actions: [
      { label: "Отмена", kind: "btn-outline", onClick: c => c() },
      { label: "Сохранить", kind: "btn-primary", onClick: async (close) => {
        if (!state.items.length) { toast("Добавьте товары", "err"); return; }
        showLoader("Сохранение…");
        try {
          const wasArrived = purchase?.status === "arrived";
          const obj = { ...(purchase ? { id: purchase.id } : {}), supplier: fSupplier.value.trim(), currency: state.currency, status: fStatus.value, date: state.date, items: state.items };
          // колонка kind могла ещё не появиться в базе — тогда сохраняем без неё
          let saved;
          try { saved = await ctx.db.purchases.upsert({ ...obj, kind: state.kind }); obj.kind = state.kind; }
          catch { saved = await ctx.db.purchases.upsert(obj); }
          // если только что отметили «пришёл» — добавить на склад
          if (fStatus.value === "arrived" && !wasArrived) {
            // тип передаём явно: если колонки kind ещё нет в базе, ответ придёт
            // без него, и приход из магазина ошибочно посчитался бы поставкой
            await applyArrival(ctx, { ...(saved || obj), kind: state.kind }, products);
            const pmap3 = Object.fromEntries(products.map(p => [p.id, p]));
            const lines3 = (state.items || []).map(it => `• ${pmap3[it.product_id]?.name || "?"} × ${it.qty}`);
            try { await notifyOwner(`Новый приход на склад\n${kindWho(state.kind)}: ${fSupplier.value.trim() || "—"}\n\n${lines3.join("\n")}`); } catch {}
          } else if (wasArrived && fStatus.value !== "arrived") {
            // сняли «пришёл» → списываем товары со склада (по прежним позициям), чтобы повторное оприходование не задвоило остаток
            const pmap4 = Object.fromEntries(products.map(p => [p.id, p]));
            for (const it of (purchase.items || [])) {
              const p = pmap4[it.product_id]; if (!p) continue;
              const r = consumeFIFO(ensureBatches(p), it.qty);
              p.batches = r.batches;
              const cc = costAfter(r.batches, p);
              const base = { id: p.id, stock_qty: sumQty(r.batches), cost_yuan: cc.cost_yuan, cost_usd: cc.cost_usd };
              try { await ctx.db.products.upsert({ ...base, batches: r.batches }); } catch (e) { await ctx.db.products.upsert(base); }
            }
          }
          toast("Сохранено", "ok"); close(); ctx.refresh();
        } catch (e) { toast("Ошибка: " + (e.message || e), "err"); }
        finally { hideLoader(); }
      } },
    ],
  });
}
