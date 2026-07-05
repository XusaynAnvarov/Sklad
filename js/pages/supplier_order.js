// ========================================================================
//  СТРАНИЦА «ЗАКАЗ ПОСТАВЩИКУ» — собрать список товаров (фото + кол-во +
//  себестоимость) и выгрузить в PDF (с реальными фото) или Excel (с фото),
//  чтобы отправить поставщику. Можно сохранить как «приход (в дороге)».
// ========================================================================
import { el, toast, field, input, select, inputList, lightbox, showLoader, hideLoader } from "../ui.js";
import { fmt, CUR, convert } from "../fx.js";
import { placeholder } from "./products.js";
import { icon } from "../icons.js";
import { authHeaders } from "../db.js";
import { exportSupplierOrderExcel } from "../xlsx-export.js";

const PCUR = [{ value: "yuan", label: "Юань ¥" }, { value: "usd", label: "Доллар $" }, { value: "som", label: "Сум" }];

export default async function render(page, ctx) {
  const [products, purchases] = await Promise.all([ctx.db.products.list(), ctx.db.purchases.list().catch(() => [])]);
  const pmap = Object.fromEntries(products.map(p => [p.id, p]));
  const nameToId = {}; products.forEach(p => { nameToId[(p.name || "").toLowerCase()] = p.id; });
  const suppliers = [...new Set((purchases || []).map(p => p.supplier).filter(Boolean))];

  const state = { supplier: "", currency: "yuan", items: [] };

  page.append(el("div.topbar", {}, [
    el("div", {}, [el("h1", { text: "Заказ поставщику" }), el("div.sub", { text: "Соберите список с фото → выгрузите PDF/Excel и отправьте поставщику" })]),
  ]));

  // ----- шапка -----
  const fSupplier = inputList(suppliers, { value: "", placeholder: "Поставщик (выбор или ввод)" });
  const fCurrency = select(PCUR, state.currency);
  fSupplier.addEventListener("input", () => { state.supplier = fSupplier.value.trim(); });
  fCurrency.addEventListener("change", () => { state.currency = fCurrency.value; refreshAdd(); drawItems(); });

  // ----- панель добавления -----
  const fProduct = inputList(products.map(p => p.name), { placeholder: "впишите или выберите", style: { flex: "1", minWidth: "180px" } });
  const fQty = input({ type: "number", placeholder: "0", style: { width: "110px" } });
  const fCost = input({ type: "number", step: "0.01", placeholder: "0", style: { width: "130px" } });
  const preview = el("img.thumb", { style: { width: "72px", height: "72px", cursor: "zoom-in", display: "none" }, title: "Увеличить" });
  const costHint = el("div", { style: { fontSize: "13px", margin: "6px 0", color: "var(--muted)" } });
  const selId = () => nameToId[(fProduct.value || "").trim().toLowerCase()] || "";

  function defCost(p) {
    return state.currency === "usd" ? p.cost_usd : state.currency === "yuan" ? p.cost_yuan : Math.round(convert(p.cost_yuan, "yuan", "som"));
  }
  function refreshAdd() {
    const p = pmap[selId()];
    if (!p) { preview.style.display = "none"; costHint.textContent = ""; return; }
    preview.src = p.photo_url || placeholder(p.name); preview.style.display = ""; preview.onclick = () => p.photo_url && lightbox(p.photo_url);
    if (!fCost.value) fCost.value = defCost(p) || "";
    costHint.textContent = "Текущая себестоимость: " + fmt(p.cost_yuan, "yuan");
  }
  fProduct.addEventListener("input", refreshAdd);

  function addToCart() {
    const id = selId(); if (!id) { toast("Выберите товар из списка", "err"); return; }
    const qv = +fQty.value || 0; if (qv <= 0) { toast("Укажите количество", "err"); return; }
    state.items.push({ product_id: id, qty: qv, cost: +fCost.value || 0, currency: state.currency });
    drawItems();
    fProduct.value = ""; fQty.value = ""; fCost.value = ""; refreshAdd();
  }
  const addBtn = el("button.btn.btn-ok", { onclick: addToCart }, [icon("plus", { size: 16 }), "Добавить"]);
  fQty.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addToCart(); } });
  fCost.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addToCart(); } });

  // ----- список -----
  const itemsBox = el("div");
  const totalBox = el("div", { style: { textAlign: "right", fontSize: "20px", fontWeight: "800", marginTop: "10px" } });
  function drawItems() {
    itemsBox.innerHTML = "";
    if (!state.items.length) { itemsBox.append(el("div.empty", { style: { padding: "24px" } }, [el("p", { text: "Добавьте товары в заказ" })])); recalc(); return; }
    state.items.forEach((it, idx) => {
      const p = pmap[it.product_id] || { name: "?" };
      const qty = input({ type: "number", value: it.qty, style: { width: "80px" } });
      const cost = input({ type: "number", step: "0.01", value: it.cost, style: { width: "110px" } });
      const lt = el("strong", { text: fmt(it.qty * it.cost, it.currency || state.currency) });
      qty.addEventListener("input", () => { it.qty = +qty.value || 0; lt.textContent = fmt(it.qty * it.cost, it.currency || state.currency); recalc(); });
      cost.addEventListener("input", () => { it.cost = +cost.value || 0; lt.textContent = fmt(it.qty * it.cost, it.currency || state.currency); recalc(); });
      itemsBox.append(el("div.card", { style: { padding: "12px", marginBottom: "10px", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" } }, [
        el("img.thumb", { src: p.photo_url || placeholder(p.name), style: { cursor: "zoom-in" }, onclick: () => p.photo_url && lightbox(p.photo_url), onerror: function () { this.src = placeholder(p.name); } }),
        el("div", { style: { flex: "1", minWidth: "140px", fontWeight: "600" }, text: p.name }),
        el("div", {}, [el("div.field-label", { text: "Кол-во" }), qty]),
        el("div", {}, [el("div.field-label", { text: "Себест. " + (CUR[it.currency || state.currency]?.sign || "") }), cost]),
        el("div", { style: { minWidth: "90px", textAlign: "right" } }, [el("div.field-label", { text: "Сумма" }), lt]),
        el("button.btn.btn-danger.btn-sm.btn-icon", { title: "Убрать", onclick: () => { state.items.splice(idx, 1); drawItems(); } }, [icon("x", { size: 15 })]),
      ]));
    });
    recalc();
  }
  function recalc() {
    const total = state.items.reduce((t, i) => t + i.qty * i.cost, 0);
    totalBox.innerHTML = ""; totalBox.append("Итого: ", el("span.gradtext", { text: fmt(total, state.currency) }));
  }

  // ----- выгрузка -----
  async function downloadPDF() {
    if (!state.items.length) { toast("Добавьте товары", "err"); return; }
    showLoader("Готовим PDF (с фото)…");
    try {
      const r = await fetch("/api/supplier-order-pdf", {
        method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ supplier: state.supplier, currency: state.currency, items: state.items }),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || ("PDF " + r.status)); }
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `zakaz-postavshiku-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
      toast("PDF готов", "ok");
    } catch (e) { toast("Ошибка: " + (e.message || e), "err"); }
    finally { hideLoader(); }
  }
  async function downloadExcel() {
    if (!state.items.length) { toast("Добавьте товары", "err"); return; }
    showLoader("Готовим Excel (с фото)…");
    try { await exportSupplierOrderExcel(state.items, state.supplier, state.currency, products); toast("Excel готов", "ok"); }
    catch (e) { toast("Ошибка: " + (e.message || e), "err"); }
    finally { hideLoader(); }
  }
  async function saveAsPurchase() {
    if (!state.items.length) { toast("Добавьте товары", "err"); return; }
    showLoader("Сохранение…");
    try {
      const items = state.items.map(it => ({ product_id: it.product_id, qty: it.qty, unit_cost: it.cost, currency: it.currency || state.currency }));
      await ctx.db.purchases.upsert({ supplier: state.supplier || "—", currency: state.currency, status: "in_transit", date: new Date().toISOString(), items });
      toast("Сохранено в «Приход» (в дороге)", "ok");
    } catch (e) { toast("Ошибка: " + (e.message || e), "err"); }
    finally { hideLoader(); }
  }

  page.append(el("div.card", { style: { padding: "16px" } }, [
    el("div.row2", {}, [field("Поставщик", fSupplier), field("Валюта", fCurrency)]),
    el("div.section-h", { text: "Добавьте товары", style: { marginTop: "10px" } }),
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
    el("div.section-h", { text: "Список заказа" }),
    itemsBox, totalBox,
    el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "16px" } }, [
      el("button.btn.btn-primary", { onclick: downloadPDF }, ["📄 PDF поставщику"]),
      el("button.btn.btn-outline", { onclick: downloadExcel }, ["📊 Excel"]),
      el("button.btn.btn-outline", { onclick: saveAsPurchase, title: "Появится в разделе «Приход» как «в дороге»" }, ["💾 Сохранить как приход"]),
    ]),
  ]));

  drawItems();
}
