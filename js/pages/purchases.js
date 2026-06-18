// ========================================================================
//  СТРАНИЦА «ПРИХОД» — поступления: «в дороге» / «уже пришёл»
// ========================================================================
import { el, toast, modal, confirmDialog, field, input, select, inputList } from "../ui.js";
import { fmt, CUR, convert } from "../fx.js";
import { placeholder } from "./products.js";
import { consumeFIFO, ensureBatches, sumQty, currentCost, costAfter } from "../inventory.js";
import { icon } from "../icons.js";

const PCUR = [{ value: "yuan", label: "Юань ¥" }, { value: "usd", label: "Доллар $" }, { value: "som", label: "Сум" }];

export default async function render(page, ctx) {
  const [purchases, products] = await Promise.all([ctx.db.purchases.list(), ctx.db.products.list()]);
  const pmap = Object.fromEntries(products.map(p => [p.id, p]));
  const suppliers = [...new Set(purchases.map(p => p.supplier).filter(Boolean))];

  page.append(
    el("div.topbar", {}, [
      el("div", {}, [el("h1", { text: "Приход товара" }), el("div.sub", { text: `Поступлений: ${purchases.length}` })]),
      el("button.btn.btn-primary", { onclick: () => openEditor(ctx, null, products, suppliers) }, [icon("plus", { size: 16 }), "Новый приход"]),
    ]),
  );

  if (!purchases.length) { page.append(el("div.empty", {}, [el("div.em-ic", {}, [icon("truck", { size: 40 })]), el("p", { text: "Поступлений пока нет" })])); return; }

  const tbody = el("tbody");
  purchases.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(s => {
    const total = (s.items || []).reduce((t, i) => t + i.qty * i.unit_cost, 0);
    tbody.append(el("tr", {}, [
      el("td", { text: new Date(s.date).toLocaleDateString("ru-RU") }),
      el("td", {}, [el("strong", { text: s.supplier || "—" })]),
      el("td", {}, [el("span.badge.cur", { text: CUR[s.currency].label })]),
      el("td", { text: (s.items || []).length + " поз." }),
      el("td", {}, [el("strong", { text: fmt(total, s.currency) })]),
      el("td", {}, [s.status === "arrived"
        ? el("span.badge.arrived", {}, [icon("check", { size: 13 }), "Пришёл"])
        : el("span.badge.transit", {}, [icon("truck", { size: 13 }), "В дороге"])]),
      el("td.right", {}, [el("div.row-actions", {}, [
        s.status !== "arrived" && el("button.btn.btn-ok.btn-sm", { text: "Оприходовать", title: "Отметить «пришёл» и добавить на склад", onclick: () => arrive(ctx, s, products) }),
        el("button.btn.btn-outline.btn-sm.btn-icon", { title: "Редактировать", onclick: () => openEditor(ctx, s, products, suppliers) }, [icon("edit", { size: 16 })]),
        el("button.btn.btn-danger.btn-sm.btn-icon", { title: "Удалить", onclick: () => confirmDialog("Удалить приход?" + (s.status === "arrived" ? " Оприходованные товары спишутся со склада." : ""), async () => {
          if (s.status === "arrived") { for (const it of (s.items || [])) { const p = pmap[it.product_id]; if (!p) continue; const r = consumeFIFO(ensureBatches(p), it.qty); p.batches = r.batches; const cc = costAfter(r.batches, p); const base = { id: p.id, stock_qty: sumQty(r.batches), cost_yuan: cc.cost_yuan, cost_usd: cc.cost_usd }; try { await ctx.db.products.upsert({ ...base, batches: r.batches }); } catch (e) { await ctx.db.products.upsert(base); } } }
          await ctx.db.purchases.remove(s.id); toast("Удалено", "ok"); ctx.refresh();
        }) }, [icon("trash", { size: 16 })]),
      ].filter(Boolean))]),
    ]));
  });
  page.append(el("div", { style: { overflowX: "auto" } }, [el("table.tbl", {}, [
    el("thead", {}, [el("tr", {}, ["Дата", "Поставщик", "Валюта", "Позиции", "Сумма", "Статус", ""].map(h => el("th", { text: h })))]),
    tbody,
  ])]));
}

async function arrive(ctx, s, products) {
  confirmDialog("Оприходовать поступление? Товары добавятся на склад.", async () => {
    await applyArrival(ctx, s, products);
    await ctx.db.purchases.upsert({ id: s.id, status: "arrived" });
    toast("Оприходовано, остатки обновлены", "ok"); ctx.refresh();
  });
}

// добавить количества на склад + обновить себестоимость на цену нового прихода (прошлую запомнить)
async function applyArrival(ctx, s, products) {
  for (const it of s.items || []) {
    const p = products.find(x => x.id === it.product_id);
    if (!p) continue;
    const cur = it.currency || s.currency;
    const cy = Math.round(convert(it.unit_cost, cur, "yuan") * 100) / 100;
    const cu = Math.round(convert(it.unit_cost, cur, "usd") * 100) / 100;
    const prev = { cost_yuan: Number(p.cost_yuan) || 0, cost_usd: Number(p.cost_usd) || 0 }; // себестоимость ДО прихода
    // FIFO: добавляем новую партию (старые партии не трогаем — продаются первыми)
    const batches = ensureBatches(p);
    batches.push({ qty: Number(it.qty) || 0, cost_yuan: cy, cost_usd: cu, date: s.date || new Date().toISOString() });
    p.batches = batches;
    // текущая себестоимость = цена нового прихода; прошлую запоминаем, если изменилась
    const changed = (prev.cost_yuan || prev.cost_usd) && (Math.abs(prev.cost_yuan - cy) > 0.001 || Math.abs(prev.cost_usd - cu) > 0.001);
    const cost_prev = changed ? prev : (p.cost_prev || null);
    p.cost_yuan = cy; p.cost_usd = cu; if (cost_prev) p.cost_prev = cost_prev;
    const base = { id: p.id, stock_qty: sumQty(batches), cost_yuan: cy, cost_usd: cu };
    const ext = { ...base, batches, ...(cost_prev ? { cost_prev } : {}) };
    try { await ctx.db.products.upsert(ext); }
    catch (e) { try { await ctx.db.products.upsert({ ...base, batches }); } catch (e2) { await ctx.db.products.upsert(base); } }
  }
}

function openEditor(ctx, purchase, products, suppliers = []) {
  const isNew = !purchase;
  const pmap = Object.fromEntries(products.map(p => [p.id, p]));
  const state = purchase
    ? { supplier: purchase.supplier, currency: purchase.currency, status: purchase.status, date: purchase.date, items: JSON.parse(JSON.stringify(purchase.items || [])) }
    : { supplier: "", currency: "yuan", status: "in_transit", date: new Date().toISOString(), items: [] };

  const fSupplier = inputList(suppliers, { value: state.supplier || "", placeholder: "Поставщик (выбор или ввод)" });
  const fCurrency = select(PCUR, state.currency);
  const fStatus = select([{ value: "in_transit", label: "В дороге" }, { value: "arrived", label: "Уже пришёл" }], state.status);
  const itemsBox = el("div");
  const totalBox = el("div", { style: { textAlign: "right", fontSize: "20px", fontWeight: "800", marginTop: "10px" } });
  const nameToId = {}; products.forEach(p => { nameToId[(p.name || "").toLowerCase()] = p.id; });
  const addInput = inputList(products.map(p => p.name), { placeholder: "Введите или выберите товар…", style: { flex: "1" } });
  const tryAdd = () => { const id = nameToId[(addInput.value || "").trim().toLowerCase()]; if (!id) { toast("Товар не найден — выберите из списка", "err"); return; } addItem(id); addInput.value = ""; };
  addInput.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); tryAdd(); } });

  fCurrency.addEventListener("change", () => { state.currency = fCurrency.value; drawItems(); });

  function addItem(pid) {
    if (!pid) return; const p = pmap[pid];
    const def = state.currency === "usd" ? p.cost_usd : state.currency === "yuan" ? p.cost_yuan : Math.round(convert(p.cost_yuan, "yuan", "som"));
    state.items.push({ product_id: pid, qty: 1, unit_cost: +def || 0, currency: state.currency });
    drawItems();
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
        el("img.thumb", { src: p.photo_url || placeholder(p.name), onerror: function(){ this.src = placeholder(p.name); } }),
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
    el("div.row2", {}, [field("Поставщик", fSupplier), field("Валюта", fCurrency)]),
    field("Статус", fStatus),
    el("div.hint", { text: "При статусе «Уже пришёл» товары автоматически добавятся на склад." }),
    el("div.section-h", { text: "Товары" }),
    el("div", { style: { display: "flex", gap: "10px", marginBottom: "14px" } }, [addInput, el("button.btn.btn-ok.btn-sm", { onclick: tryAdd }, [icon("plus", { size: 15 }), "Добавить"])]),
    itemsBox, totalBox,
  ]);

  modal({
    title: isNew ? "Новый приход" : "Приход", wide: true, body,
    actions: [
      { label: "Отмена", kind: "btn-outline", onClick: c => c() },
      { label: "Сохранить", kind: "btn-primary", onClick: async (close) => {
        if (!state.items.length) { toast("Добавьте товары", "err"); return; }
        const wasArrived = purchase?.status === "arrived";
        const obj = { ...(purchase ? { id: purchase.id } : {}), supplier: fSupplier.value.trim(), currency: state.currency, status: fStatus.value, date: state.date, items: state.items };
        const saved = await ctx.db.purchases.upsert(obj);
        // если только что отметили «пришёл» — добавить на склад
        if (fStatus.value === "arrived" && !wasArrived) await applyArrival(ctx, saved || obj, products);
        toast("Сохранено", "ok"); close(); ctx.refresh();
      } },
    ],
  });
}
