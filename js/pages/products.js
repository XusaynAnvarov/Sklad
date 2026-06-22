// ========================================================================
//  СТРАНИЦА «ТОВАРЫ» — список, добавление, редактирование, фото, остатки
// ========================================================================
import { el, $, toast, modal, confirmDialog, field, input, select, inputList, lightbox, showLoader, hideLoader } from "../ui.js";
import { icon } from "../icons.js";
import { fmt, convert } from "../fx.js";
import { consumeFIFO, ensureBatches, sumQty, currentCost } from "../inventory.js";
import { downloadTemplate, parseRows, pickFile } from "../xlsx-import.js";

// список партий товара (FIFO) для карточки
function batchesView(p) {
  const bs = (Array.isArray(p.batches) ? p.batches : []).filter(b => Number(b.qty) > 0);
  if (!bs.length) return el("div");
  return el("div", { style: { margin: "4px 0 12px" } }, [
    el("div.field-label", { text: "Партии на складе (сначала продаётся верхняя):" }),
    el("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" } },
      bs.map(b => el("span.last-price", { text: `${b.qty} × ${fmt(b.cost_yuan, "yuan")} · ${(b.date || "").slice(0, 10)}` }))),
  ]);
}

export function statusOf(p) {
  if (p.status_override) return p.status_override;        // 'in_stock' | 'on_order'
  return Number(p.stock_qty) > 0 ? "in_stock" : "on_order";
}
export function statusBadge(p) {
  const s = statusOf(p);
  return s === "in_stock"
    ? el("span.badge.ok", {}, [icon("check", { size: 13 }), "Есть"])
    : el("span.badge.order", {}, [icon("clock", { size: 13 }), "Под заказ"]);
}

export default async function render(page, ctx) {
  const all = await ctx.db.products.list();

  const search = input({ placeholder: "Поиск товара…", style: { maxWidth: "320px" } });
  const grid = el("div.grid");

  // категории для фильтра и автодополнения
  const cats = [...new Set(all.map(p => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
  const catFilter = select([{ value: "", label: "Все категории" }, ...cats.map(c => ({ value: c, label: c }))], "");

  async function importProducts(file) {
    showLoader("Импорт из Excel…");
    try {
      const rows = await parseRows(file, "products");
      if (!rows.length) { toast("В файле нет строк", "err"); return; }
      const byName = {}; all.forEach(p => byName[(p.name || "").trim().toLowerCase()] = p);
      let created = 0, updated = 0;
      for (const r of rows) {
        const cost_yuan = r.currency === "yuan" ? r.cost : Math.round(convert(r.cost, r.currency, "yuan") * 100) / 100;
        const cost_usd = r.currency === "usd" ? r.cost : Math.round(convert(r.cost, r.currency, "usd") * 100) / 100;
        const ex = byName[r.name.toLowerCase()];
        const batches = r.qty > 0 ? [{ qty: r.qty, cost_yuan, cost_usd, date: new Date().toISOString() }] : [];
        const obj = {
          ...(ex ? { id: ex.id } : {}),
          name: r.name, category: r.category || ex?.category || "", photo_url: ex?.photo_url || "",
          stock_qty: r.qty, cost_yuan, cost_usd,
          price_yuan: ex?.price_yuan || 0, price_usd: ex?.price_usd || 0, price_som: ex?.price_som || 0,
          status_override: ex?.status_override || null,
        };
        try { await ctx.db.products.upsert({ ...obj, batches }); }
        catch { await ctx.db.products.upsert(obj); }
        ex ? updated++ : created++;
      }
      toast(`Импорт: добавлено ${created}, обновлено ${updated}`, "ok");
      ctx.refresh();
    } catch (e) { toast("Ошибка импорта: " + (e.message || e), "err"); }
    finally { hideLoader(); }
  }

  page.append(
    el("div.topbar", {}, [
      el("div", {}, [el("h1", { text: "Товары" }), el("div.sub", { text: `Всего позиций: ${all.length}` })]),
      el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } }, [
        el("button.btn.btn-outline.btn-sm", { text: "📄 Шаблон", title: "Скачать шаблон Excel", onclick: () => downloadTemplate("products") }),
        el("button.btn.btn-outline.btn-sm", { text: "📥 Импорт Excel", title: "Загрузить список из Excel", onclick: () => pickFile(importProducts) }),
        el("button.btn.btn-primary", { onclick: () => openForm(ctx, null, cats) }, [icon("plus", { size: 16 }), "Добавить товар"]),
      ]),
    ]),
    el("div.toolbar", {}, [search, catFilter]),
    grid,
  );

  function applyFilters() {
    const q = search.value.toLowerCase();
    const cat = catFilter.value;
    draw(all.filter(p =>
      (!cat || p.category === cat) &&
      (p.name.toLowerCase().includes(q) || (p.category || "").toLowerCase().includes(q))));
  }

  function draw(list) {
    grid.innerHTML = "";
    if (!list.length) { grid.append(el("div.empty", {}, [el("div.em-ic", {}, [icon("box", { size: 40 })]), el("p", { text: "Товаров нет" })])); return; }
    list.forEach(p => {
      const card = el("div.prod.reveal", { onclick: () => openForm(ctx, p, cats) }, [
        el("img.ph", { src: p.photo_url || placeholder(p.name), alt: p.name, loading: "lazy", title: "Нажмите для увеличения",
          onclick: (e) => { if (p.photo_url) { e.stopPropagation(); lightbox(p.photo_url); } },
          onerror: function () { this.src = placeholder(p.name); } }),
        el("div.body", {}, [
          el("div.nm", { text: p.name }),
          el("div.cat", { text: p.category || "—" }),
          el("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto" } }, [
            statusBadge(p),
            el("span.muted", { text: "ост: " + (Number(p.stock_qty) || 0) }),
          ]),
          el("div.pr", {}, ["себест: " + fmt(p.cost_yuan, "yuan"),
            (p.cost_prev && Number(p.cost_prev.cost_yuan) > 0 && Math.abs(Number(p.cost_prev.cost_yuan) - Number(p.cost_yuan)) > 0.001)
              ? el("span.muted", { text: "  (было " + fmt(p.cost_prev.cost_yuan, "yuan") + ")", style: { fontSize: "11px" } }) : null]),
        ]),
      ]);
      grid.append(card);
    });
    // повторно включить анимацию появления
    requestAnimationFrame(() => grid.querySelectorAll(".reveal").forEach((n, i) => setTimeout(() => n.classList.add("in"), i * 30)));
  }
  draw(all);
  search.addEventListener("input", applyFilters);
  catFilter.addEventListener("change", applyFilters);
}

export function placeholder(name = "?") {
  const ch = encodeURIComponent((name[0] || "?").toUpperCase());
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect width='200' height='200' fill='%23f1ebdc'/%3E%3Ctext x='50%25' y='54%25' font-size='90' fill='%23c9c0a8' text-anchor='middle' font-family='sans-serif'%3E${ch}%3C/text%3E%3C/svg%3E`;
}

export function openForm(ctx, p, cats = []) {
  const isNew = !p;
  p = p || { name: "", category: "", photo_url: "", stock_qty: 0, cost_usd: 0, cost_yuan: 0, price_yuan: 0, price_usd: 0, price_som: 0, status_override: null };

  const fName = input({ value: p.name, placeholder: "Название" });
  const fCat = inputList(cats, { value: p.category || "", placeholder: "Категория (выбор или ввод)" });
  const fPhotoUrl = input({ value: p.photo_url || "", placeholder: "Ссылка на фото (URL)" });
  const fFile = el("input", { type: "file", accept: "image/*", class: "inp" });
  const preview = el("img.thumb", { src: p.photo_url || placeholder(p.name), style: { width: "80px", height: "80px", cursor: "zoom-in" }, title: "Увеличить",
    onclick: () => { const s = fPhotoUrl.value || p.photo_url; if (s) lightbox(s); },
    onerror: function () { this.src = placeholder(fName.value); } });

  fPhotoUrl.addEventListener("input", () => preview.src = fPhotoUrl.value || placeholder(fName.value));
  fFile.addEventListener("change", async () => {
    if (!fFile.files[0]) return;
    toast("Загрузка фото…", "info");
    try { const url = await ctx.db.uploadPhoto(fFile.files[0]); fPhotoUrl.value = url; preview.src = url; toast("Фото загружено", "ok"); }
    catch (e) { toast("Ошибка фото: " + e.message, "err"); }
  });

  const fStock = input({ type: "number", value: p.stock_qty, placeholder: "0" });
  // себестоимость одной суммой + валюта прихода
  const costCur0 = (Number(p.cost_usd) > 0 && !(Number(p.cost_yuan) > 0)) ? "usd" : "yuan";
  const costVal0 = costCur0 === "usd" ? p.cost_usd : p.cost_yuan;
  const fCost = input({ type: "number", step: "0.01", value: costVal0 || "", placeholder: "0" });
  const fCostCur = select([{ value: "yuan", label: "Юань ¥" }, { value: "usd", label: "Доллар $" }, { value: "som", label: "Сум" }], costCur0);
  const fStatus = select([
    { value: "", label: "Авто (по остатку)" },
    { value: "in_stock", label: "Есть" },
    { value: "on_order", label: "Под заказ" },
  ], p.status_override || "");

  // история продаж этого товара (кто / когда / по какой цене) — грузится после открытия
  const historyBox = !isNew ? el("div", {}, [el("div.muted", { text: "Загрузка истории…", style: { fontSize: "13px", padding: "6px 0" } })]) : null;

  const body = el("div", {}, [
    field("Название", fName),
    field("Категория", fCat),
    el("div", { style: { display: "flex", gap: "14px", alignItems: "flex-end" } }, [
      el("div", { style: { flex: "1" } }, [
        field("Фото — ссылка", fPhotoUrl),
        field("…или загрузить файл", fFile),
      ]),
      preview,
    ]),
    el("div.section-h", { text: "Остаток и себестоимость" }),
    el("div.row3", {}, [field("Остаток (кол-во)", fStock), field("Себестоимость", fCost), field("Валюта прихода", fCostCur)]),
    el("div.hint", { text: "Цены продажи вводятся при продаже. Вторая валюта себестоимости считается по курсу автоматически." }),
    (p.cost_prev && Number(p.cost_prev.cost_yuan) > 0 && Math.abs(Number(p.cost_prev.cost_yuan) - Number(p.cost_yuan)) > 0.001)
      ? el("div.hint", { text: "Прошлая себестоимость: " + fmt(p.cost_prev.cost_yuan, "yuan") }) : null,
    batchesView(p),
    field("Статус в каталоге", fStatus),
    !isNew && el("div.section-h", { text: "История продаж (кто, когда, по какой цене)" }),
    !isNew && historyBox,
  ].filter(Boolean));

  const m = modal({
    title: isNew ? "Новый товар" : "Редактировать товар",
    wide: true,
    body,
    actions: [
      !isNew && { label: "Удалить", kind: "btn-danger", onClick: (close) => {
        confirmDialog("Удалить товар «" + p.name + "»?", async () => { await ctx.db.products.remove(p.id); close(); toast("Удалено", "ok"); ctx.refresh(); });
      } },
      { label: "Отмена", kind: "btn-outline", onClick: (c) => c() },
      { label: "Сохранить", kind: "btn-primary", onClick: async (close) => {
        if (!fName.value.trim()) { toast("Введите название", "err"); return; }
        const amt = +fCost.value || 0, cur = fCostCur.value;
        const cost_yuan = cur === "yuan" ? amt : Math.round(convert(amt, cur, "yuan") * 100) / 100;
        const cost_usd = cur === "usd" ? amt : Math.round(convert(amt, cur, "usd") * 100) / 100;
        const desired = +fStock.value || 0;
        // --- партии (FIFO): подгоняем под введённый остаток ---
        let batches = isNew ? [] : ensureBatches(p);
        const have = sumQty(batches);
        if (desired > have) {
          // если себестоимость не ввели (0) — берём текущую цену товара, чтобы не создавать партию ¥0
          const cur0 = currentCost(batches);
          const by = amt > 0 ? cost_yuan : (cur0.cost_yuan || cost_yuan);
          const bu = amt > 0 ? cost_usd : (cur0.cost_usd || cost_usd);
          batches.push({ qty: desired - have, cost_yuan: by, cost_usd: bu, date: new Date().toISOString() });
        }
        else if (desired < have) batches = consumeFIFO(batches, have - desired).batches;
        // если ввели себестоимость — проставить её партиям без цены (и переоценить единственную партию)
        if (amt > 0) {
          let touched = false;
          batches.forEach(b => { if ((Number(b.cost_yuan) || 0) <= 0 && (Number(b.cost_usd) || 0) <= 0) { b.cost_yuan = cost_yuan; b.cost_usd = cost_usd; touched = true; } });
          if (!touched && batches.length === 1) { batches[0].cost_yuan = cost_yuan; batches[0].cost_usd = cost_usd; }
        }
        if (isNew && desired > 0 && !batches.length) batches = [{ qty: desired, cost_yuan, cost_usd, date: new Date().toISOString() }];
        // склад пуст → не теряем себестоимость (сохраняем введённую/прежнюю)
        const cc = batches.length ? currentCost(batches) : { cost_yuan: cost_yuan || Number(p.cost_yuan) || 0, cost_usd: cost_usd || Number(p.cost_usd) || 0 };
        // если себестоимость изменилась вручную — запомним прошлую
        const oldC = { cost_yuan: Number(p.cost_yuan) || 0, cost_usd: Number(p.cost_usd) || 0 };
        const changed = !isNew && (oldC.cost_yuan || oldC.cost_usd) && (Math.abs(oldC.cost_yuan - cc.cost_yuan) > 0.001 || Math.abs(oldC.cost_usd - cc.cost_usd) > 0.001);
        const cost_prev = changed ? oldC : (p.cost_prev || null);
        const obj = {
          ...(isNew ? {} : { id: p.id }),
          name: fName.value.trim(), category: fCat.value.trim(), photo_url: fPhotoUrl.value.trim(),
          stock_qty: batches.length ? sumQty(batches) : desired,
          cost_usd: cc.cost_usd, cost_yuan: cc.cost_yuan,
          price_yuan: p.price_yuan || 0, price_usd: p.price_usd || 0, price_som: p.price_som || 0,
          status_override: fStatus.value || null,
        };
        try { await ctx.db.products.upsert({ ...obj, batches, ...(cost_prev ? { cost_prev } : {}) }); }
        catch (e) { try { await ctx.db.products.upsert({ ...obj, batches }); } catch (e2) { await ctx.db.products.upsert(obj); } } // если колонок ещё нет
        close(); toast("Сохранено", "ok"); ctx.refresh();
      } },
    ].filter(Boolean),
  });

  if (!isNew) loadProductHistory(ctx, p.id, historyBox);
}

// История продаж товара: кто (клиент), когда (дата) и по какой цене покупал.
async function loadProductHistory(ctx, pid, box) {
  if (!box) return;
  try {
    const [sales, customers] = await Promise.all([ctx.db.sales.list(), ctx.db.customers.list()]);
    const cmap = Object.fromEntries(customers.map(c => [c.id, c.name]));
    const rows = [];
    sales.forEach(s => (s.items || []).forEach(it => {
      if (String(it.product_id) === String(pid)) {
        rows.push({ date: s.date, client: cmap[s.customer_id] || "—", qty: Number(it.qty) || 0, price: it.unit_price, cur: it.currency || s.currency, status: s.status });
      }
    }));
    rows.sort((a, b) => new Date(b.date) - new Date(a.date));
    box.innerHTML = "";
    if (!rows.length) { box.append(el("div.muted", { text: "Этот товар ещё никто не покупал", style: { fontSize: "13px", padding: "8px 0" } })); return; }
    const tb = el("tbody");
    rows.forEach(r => tb.append(el("tr", {}, [
      el("td", { text: new Date(r.date).toLocaleDateString("ru-RU") }),
      el("td", {}, [el("strong", { text: r.client })]),
      el("td", { text: r.qty + " шт." }),
      el("td", {}, [el("strong", { text: r.price > 0 ? fmt(r.price, r.cur) : "—" })]),
    ])));
    box.append(el("div", { style: { overflowX: "auto", maxHeight: "280px", overflowY: "auto" } }, [
      el("table.tbl", {}, [
        el("thead", {}, [el("tr", {}, ["Дата", "Клиент", "Кол-во", "Цена"].map(h => el("th", { text: h })))]),
        tb,
      ]),
    ]));
  } catch (e) {
    box.innerHTML = ""; box.append(el("div.muted", { text: "Не удалось загрузить историю: " + (e.message || e) }));
  }
}
