// ========================================================================
//  СТРАНИЦА «ЗАКАЗ ПОСТАВЩИКУ» — собрать список товаров (фото + кол-во +
//  себестоимость) и выгрузить в PDF (с реальными фото) или Excel (с фото),
//  чтобы отправить поставщику. Можно сохранить как «приход (в дороге)».
// ========================================================================
import { el, toast, field, input, select, inputList, lightbox, showLoader, hideLoader } from "../ui.js?v=20260821b";
import { fmt, CUR, convert } from "../fx.js?v=20260821b";
import { placeholder } from "./products.js?v=20260821b";
import { icon } from "../icons.js?v=20260821b";
import { authHeaders } from "../db.js?v=20260821b";
import { exportSupplierOrderExcel } from "../xlsx-export.js?v=20260821b";
import { downloadTemplate, parseRows, pickFile } from "../xlsx-import.js?v=20260821b";
import { showNotFound } from "./purchases.js?v=20260821b";
import { thumb } from "../img.js?v=20260821b";

const PCUR = [{ value: "yuan", label: "Юань ¥" }, { value: "usd", label: "Доллар $" }, { value: "som", label: "Сум" }];

export default async function render(page, ctx) {
  const [products, purchases, allSales] = await Promise.all([ctx.db.products.list(), ctx.db.purchases.list().catch(() => []), ctx.db.sales.list().catch(() => [])]);
  const pmap = Object.fromEntries(products.map(p => [p.id, p]));
  const nameToId = {}; products.forEach(p => { nameToId[(p.name || "").toLowerCase()] = p.id; });
  const suppliers = [...new Set((purchases || []).map(p => p.supplier).filter(Boolean))];

  // продажи за 30 дней — для сортировки отсутствующих товаров (что заказывать в первую очередь)
  const since30 = Date.now() - 30 * 864e5;
  const sold30 = {};
  (allSales || []).forEach(s => { if (new Date(s.date).getTime() < since30) return; (s.items || []).forEach(it => { sold30[it.product_id] = (sold30[it.product_id] || 0) + (Number(it.qty) || 0); }); });
  // сколько каждого товара уже «в пути» (приход in_transit)
  const transitQty = {};
  (purchases || []).filter(p => p.status === "in_transit").forEach(p => (p.items || []).forEach(it => { const k = String(it.product_id); transitQty[k] = (transitQty[k] || 0) + (Number(it.qty) || 0); }));
  // товары, которых нет на складе (0), первыми — по продажам за 30 дней
  const outOfStock = products.filter(p => (Number(p.stock_qty) || 0) <= 0)
    .sort((a, b) => (sold30[b.id] || 0) - (sold30[a.id] || 0) || (a.name || "").localeCompare(b.name || "", "ru"));

  const state = { supplier: "", currency: "yuan", lang: "ru", items: [] };
  const LANGS = [{ value: "ru", label: "Русский" }, { value: "uz", label: "Oʻzbekcha" }, { value: "zh", label: "中文 (хитойча)" }, { value: "en", label: "English" }];

  page.append(el("div.topbar", {}, [
    el("div", {}, [el("h1", { text: "Заказ поставщику" }), el("div.sub", { text: "Соберите список с фото → выгрузите PDF/Excel и отправьте поставщику" })]),
  ]));

  // ----- шапка -----
  const fSupplier = inputList(suppliers, { value: "", placeholder: "Поставщик (выбор или ввод)" });
  const fCurrency = select(PCUR, state.currency);
  const fLang = select(LANGS, state.lang);
  fSupplier.addEventListener("input", () => { state.supplier = fSupplier.value.trim(); });
  fCurrency.addEventListener("change", () => { state.currency = fCurrency.value; refreshAdd(); drawItems(); });
  fLang.addEventListener("change", () => { state.lang = fLang.value; });

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
        el("img.thumb", { src: p.photo_url ? thumb(p.photo_url, 60) : placeholder(p.name), loading: "lazy", decoding: "async", style: { cursor: "zoom-in" }, onclick: () => p.photo_url && lightbox(p.photo_url), onerror: function () { this.src = placeholder(p.name); } }),
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

  // ----- блок «нет на складе» (отсутствующие товары — быстро добавить в заказ) -----
  function addProduct(p) {
    if (state.items.some(it => it.product_id === p.id)) return; // уже в заказе
    state.items.push({ product_id: p.id, qty: 1, cost: defCost(p) || 0, currency: state.currency });
    drawItems();
  }
  const oosBox = el("div", { style: { maxHeight: "300px", overflowY: "auto", marginTop: "8px", display: "none" } });
  function drawOOS() {
    oosBox.innerHTML = "";
    if (!outOfStock.length) { oosBox.append(el("div.muted", { style: { padding: "10px" }, text: "Все товары есть на складе 👍" })); return; }
    outOfStock.forEach(p => {
      const inCart = state.items.some(it => it.product_id === p.id);
      const sold = sold30[p.id] || 0, tr = transitQty[String(p.id)] || 0;
      const info = [sold > 0 ? "продано за 30 дн: " + sold : null, tr > 0 ? "в пути: " + tr : null].filter(Boolean).join(" · ") || "нет продаж за 30 дн";
      oosBox.append(el("div.card", { style: { padding: "8px 10px", marginBottom: "8px", display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" } }, [
        el("img.thumb", { src: p.photo_url ? thumb(p.photo_url, 60) : placeholder(p.name), loading: "lazy", decoding: "async", style: { width: "42px", height: "42px", cursor: "zoom-in" }, onclick: () => p.photo_url && lightbox(p.photo_url), onerror: function () { this.src = placeholder(p.name); } }),
        el("div", { style: { flex: "1", minWidth: "140px" } }, [el("div", { style: { fontWeight: "600" }, text: p.name }), el("div.muted", { style: { fontSize: "11px" }, text: info })]),
        el("button" + (inCart ? ".btn.btn-outline.btn-sm" : ".btn.btn-ok.btn-sm"), { disabled: inCart, onclick: () => { addProduct(p); drawOOS(); } }, [inCart ? "✓ в заказе" : "＋ в заказ"]),
      ]));
    });
  }
  drawOOS();
  const oosToggle = el("button.btn.btn-outline", { style: { width: "100%", justifyContent: "space-between", display: "flex" }, onclick: () => {
    const open = oosBox.style.display !== "none";
    oosBox.style.display = open ? "none" : "block";
    oosToggle.firstChild.textContent = (open ? "▸ " : "▾ ") + `Нет на складе — добавить в заказ (${outOfStock.length})`;
  } }, [el("span", { text: `▸ Нет на складе — добавить в заказ (${outOfStock.length})` })]);

  // ----- выгрузка -----
  async function downloadPDF() {
    if (!state.items.length) { toast("Добавьте товары", "err"); return; }
    showLoader("Готовим PDF (с фото)…");
    try {
      const r = await fetch("/api/supplier-order-pdf", {
        method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ supplier: state.supplier, currency: state.currency, lang: state.lang, items: state.items }),
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
    try { await exportSupplierOrderExcel(state.items, state.supplier, state.currency, products, state.lang); toast("Excel готов", "ok"); }
    catch (e) { toast("Ошибка: " + (e.message || e), "err"); }
    finally { hideLoader(); }
  }
  // импорт списка из Excel (название + кол-во + себестоимость), как в «Приходе»
  async function importFromExcel(file) {
    showLoader("Импорт из Excel…");
    try {
      const rows = await parseRows(file, "purchase");
      if (!rows.length) { toast("В файле нет строк. Нужны колонки: Название, Количество, Себестоимость (скачайте «Шаблон»).", "err"); return; }
      // надёжное сопоставление названий: схожие кириллица/латиница → один вид
      const FOLD = { а: "a", в: "b", е: "e", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c", т: "t", у: "y", х: "x", ё: "e" };
      const keyOf = (s) => String(s || "").toLowerCase().split("").map(ch => FOLD[ch] || ch).join("").replace(/[^a-zа-я0-9]+/gi, "");
      const lookup = {};
      products.forEach(p => { const k = keyOf(p.name); if (k) lookup[k] = p.id; if (p.sku) { const ks = keyOf(p.sku); if (ks) lookup[ks] = p.id; } });
      const notFound = []; let added = 0;
      rows.forEach(r => {
        const id = lookup[keyOf(r.name)];
        if (!id) { notFound.push(r.name); return; }
        state.items.push({ product_id: id, qty: r.qty || 1, cost: r.cost || 0, currency: state.currency });
        added++;
      });
      drawItems();
      toast(`Добавлено: ${added} из ${rows.length}` + (notFound.length ? ` · не найдено: ${notFound.length}` : ""), added ? "ok" : "err");
      if (notFound.length) showNotFound(notFound);
    } catch (e) { toast("Ошибка: " + (e.message || e), "err"); }
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
    el("div.row3", {}, [field("Поставщик", fSupplier), field("Валюта", fCurrency), field("Язык документа", fLang)]),
    el("div.hint", { text: "Язык применяется к PDF и Excel (кроме названия товара). Китайский (中文) работает и в PDF, и в Excel." }),
    el("div", { style: { marginTop: "12px" } }, [oosToggle, oosBox]),
    el("div", { style: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginTop: "10px" } }, [
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
