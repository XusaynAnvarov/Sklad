// ========================================================================
//  СТРАНИЦА «ТОВАРЫ» — список, добавление, редактирование, фото, остатки
// ========================================================================
import { el, $, toast, modal, confirmDialog, field, input, select, inputList, lightbox, showLoader, hideLoader } from "../ui.js?v=20260901a";
import { icon } from "../icons.js?v=20260901a";
import { fmt, convert } from "../fx.js?v=20260901a";
import { consumeFIFO, ensureBatches, sumQty, currentCost, costOutlook } from "../inventory.js?v=20260901a";
import { downloadTemplate, parseRows, pickFile } from "../xlsx-import.js?v=20260901a";
import { openEditor } from "./sales.js?v=20260901a";
import { thumbAttrs, thumb } from "../img.js?v=20260901a";
import { LOW_STOCK } from "../advice.js?v=20260901a";
import { qrSvg, skuPayload } from "../qr.js?v=20260901a";
// Себестоимость в той валюте, в которой её ввели. Расчёт общий со складом
// в телефоне — иначе один товар показывает разные цифры на разных экранах.
import { костСтрока as costShow, костВалюта, костПоля, ВАЛЮТЫ } from "../cost.js?v=20260901a";
// Единица измерения: товар считают штуками, пачками, коробками. Смена
// единицы пересчитывает и остаток, и себестоимость, и все партии.
import { ЕДИНИЦЫ, единица, вЕдинице, считаетсяПачками, подпись as подписьКол, перевести, объяснение } from "../unit.js?v=20260901a";

// Себестоимость для показа — цена ТОЙ партии, что продаётся сейчас (FIFO),
// а не сохранённое поле: у старых товаров оно могло остаться от прежнего поведения,
// когда приход сразу перезаписывал цену. Если склад пуст — берём сохранённое.
function costLine(p) {
  const o = costOutlook(ensureBatches(p));
  const cy = o ? o.cost_yuan : (Number(p.cost_yuan) || 0);
  const cu = o ? o.cost_usd : (Number(p.cost_usd) || 0);
  let note = "";
  if (o && o.next) {
    const up = (Number(o.next.cost_yuan) || 0) > cy;
    note = `  · ещё ${o.qty} шт, дальше ${costShow(o.next.cost_yuan, o.next.cost_usd, костВалюта(p))}${up ? " ↑" : " ↓"}`;
  }
  return { text: "себест: " + costShow(cy, cu, костВалюта(p)), note };
}

// список партий товара (FIFO) для карточки
function batchesView(p) {
  const bs = (Array.isArray(p.batches) ? p.batches : []).filter(b => Number(b.qty) > 0);
  if (!bs.length) return el("div");
  const o = costOutlook(bs);
  return el("div", { style: { margin: "4px 0 12px" } }, [
    el("div.field-label", { text: "Партии на складе (сначала продаётся верхняя):" }),
    el("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" } },
      bs.map(b => el("span.last-price", { text: `${b.qty} × ${costShow(b.cost_yuan, b.cost_usd, костВалюта(p))} · ${(b.date || "").slice(0, 10)}` }))),
    (o && o.next) ? el("div.hint", {
      text: `Сейчас продаётся по ${costShow(o.cost_yuan, o.cost_usd, костВалюта(p))} — осталось ${o.qty} шт. Дальше себестоимость станет ${costShow(o.next.cost_yuan, o.next.cost_usd, костВалюта(p))}.`,
      style: { marginTop: "8px", marginBottom: 0 },
    }) : null,
  ].filter(Boolean));
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

const WAREHOUSE_NEW_DAYS = 7;
// догрузчик текущего показа списка — сюда пишет render(), а единственный
// слушатель прокрутки только вызывает его (см. ниже)
let loadMore = null;
const freshness = p => Math.max(
  p.created_at ? +new Date(p.created_at) : 0,
  p.last_arrival_at ? +new Date(p.last_arrival_at) : 0
);

export default async function render(page, ctx) {
  const [all, allPurchases] = await Promise.all([ctx.db.products.list(), ctx.db.purchases.list()]);
  all.sort((a, b) => freshness(b) - freshness(a));
  // сколько каждого товара сейчас «в дороге» (приходы со статусом in_transit) + у каких поставщиков
  const transit = {};
  allPurchases.filter(p => p.status === "in_transit").forEach(p => {
    (p.items || []).forEach(it => {
      const k = String(it.product_id); if (!k) return;
      if (!transit[k]) transit[k] = { qty: 0, suppliers: new Set() };
      transit[k].qty += Number(it.qty) || 0;
      if (p.supplier) transit[k].suppliers.add(p.supplier);
    });
  });
  const transitIds = new Set(Object.keys(transit));

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
      (p.name.toLowerCase().includes(q) || (p.category || "").toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q))));
  }

  // ---- порционная отрисовка: 866 карточек разом вешают телефон ----
  const PAGE = 48;
  let shown = 0, drawList = [], sentinel = null, io = null;

  function draw(list) {
    if (io) { io.disconnect(); io = null; }
    grid.innerHTML = "";
    shown = 0; drawList = list; sentinel = null;
    if (!list.length) { grid.append(el("div.empty", {}, [el("div.em-ic", {}, [icon("box", { size: 40 })]), el("p", { text: "Товаров нет" })])); return; }
    appendChunk();
    // догрузка следующей порции, когда «маячок» подходит к экрану
    io = new IntersectionObserver((es) => { if (es.some(e => e.isIntersecting)) appendChunk(); }, { rootMargin: "600px" });
    if (sentinel) io.observe(sentinel);
  }

  function appendChunk() {
    const slice = drawList.slice(shown, shown + PAGE);
    if (!slice.length) { if (sentinel) { sentinel.remove(); sentinel = null; } return; }
    shown += slice.length;
    renderCards(slice);
    // маячок всегда в конце списка
    if (!sentinel) { sentinel = el("div", { style: { gridColumn: "1/-1", height: "1px" } }); }
    grid.append(sentinel);
    if (io) { io.unobserve(sentinel); if (shown < drawList.length) io.observe(sentinel); else { sentinel.remove(); sentinel = null; } }
  }

  // Страховка: если IntersectionObserver не сработал — догружаем по прокрутке.
  // Слушатель на window вешаем ОДИН раз за всё время жизни вкладки: раньше он
  // добавлялся при каждом заходе в «Товары» и никогда не снимался — после
  // нескольких переходов на каждое движение пальца работали десятки копий,
  // и телефон вставал колом.
  loadMore = () => {
    if (!drawList.length || shown >= drawList.length) return;
    if (document.documentElement.scrollHeight - (window.scrollY + window.innerHeight) < 700) appendChunk();
  };
  if (!window.__gmProdScrollBound) {
    window.__gmProdScrollBound = true;
    window.addEventListener("scroll", () => { if (loadMore) loadMore(); }, { passive: true });
  }

  function renderCards(list) {
    list.forEach(p => {
      const isNew  = freshness(p) > 0 && (Date.now() - freshness(p)) / 86400000 <= WAREHOUSE_NEW_DAYS;
      const tr = transit[String(p.id)];
      const isSoon = !!tr && (Number(p.stock_qty) || 0) <= 0;
      // остатка нет, но товар уже едет → примечание с количеством и поставщиком
      const transitNote = isSoon ? el("div", {
        title: tr.suppliers.size ? "Поставщик: " + [...tr.suppliers].join(", ") : "",
        style: { fontSize: "11px", fontWeight: "700", color: "#b45309", background: "rgba(245,158,11,.13)", border: "1px solid rgba(245,158,11,.35)", borderRadius: "6px", padding: "3px 7px", margin: "4px 0 2px", lineHeight: "1.3" },
        text: "🚚 В дороге: " + tr.qty + " шт" + (tr.suppliers.size ? " · " + [...tr.suppliers].join(", ") : ""),
      }) : null;
      // Полоска состояния слева: видно на просмотр, не читая цифру остатка.
      // Порог берём из советов, чтобы «заканчивается» означало одно и то же везде.
      const qty = Number(p.stock_qty) || 0;
      const stateCls = qty < 0 ? ".neg" : (qty <= LOW_STOCK ? ".low" : "");
      const card = el("div.prod.reveal" + stateCls, { onclick: () => openForm(ctx, p, cats) }, [
        // в списке — миниатюра (иначе сотни полноразмерных фото вешают телефон);
        // при увеличении открываются оригиналы
        el("img.ph", { ...thumbAttrs(p.photo_url, placeholder(p.name), 320), alt: p.name, title: "Нажмите для увеличения",
          onclick: (e) => { const ph = (Array.isArray(p.photos) && p.photos.length) ? p.photos : (p.photo_url ? [p.photo_url] : []); if (ph.length) { e.stopPropagation(); lightbox(ph); } } }),
        el("div.body", {}, [
          el("div.nm", { text: p.name }),
          el("div.cat", { text: p.category || "—" }),
          ...(p.sku ? [el("div.muted", { text: "Арт.: " + p.sku, style: { fontSize: "11px", marginTop: "-2px" } })] : []),
          transitNote,
          el("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto" } }, [
            el("div", { style: { display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" } }, [
              isSoon ? el("span.badge.transit", {}, [icon("clock", { size: 13 }), "Скоро"]) : statusBadge(p),
              ...(isNew ? [el("span.badge", { style: "background:var(--gold,#e3c163);color:#1c2b4a;font-size:10px;", text: "Новинка" })] : []),
            ]),
            // минус = товара не хватило (продали больше, чем было) — показываем красным
            el("span" + ((Number(p.stock_qty) || 0) < 0 ? "" : ".muted"), {
              text: "ост: " + подписьКол(Number(p.stock_qty) || 0, p),
              title: (Number(p.stock_qty) || 0) < 0 ? "Продано больше, чем было на складе — долг по товару" : "",
              style: (Number(p.stock_qty) || 0) < 0 ? { color: "var(--danger,#f87171)", fontWeight: "700" } : {},
            }),
          ]),
          // себестоимость = цена партии, которая продаётся сейчас; если следом лежит
          // партия с другой ценой — сразу видно, сколько осталось и почём будет дальше
          (() => { const c = costLine(p); return el("div.pr", {}, [c.text,
            c.note ? el("span.muted", { text: c.note, style: { fontSize: "11px", fontWeight: "500" } }) : null]); })(),
        ]),
      ]);
      grid.append(card);
    });
    // анимация появления — только у новой порции, иначе на телефоне это тысячи таймеров
    requestAnimationFrame(() => grid.querySelectorAll(".reveal:not(.in)").forEach((n, i) => setTimeout(() => n.classList.add("in"), Math.min(i, 20) * 30)));
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
  p = p || { name: "", category: "", sku: "", photo_url: "", stock_qty: 0, cost_usd: 0, cost_yuan: 0, price_yuan: 0, price_usd: 0, price_som: 0, status_override: null };

  const fName = input({ value: p.name, placeholder: "Название" });
  const fCat = inputList(cats, { value: p.category || "", placeholder: "Категория (выбор или ввод)" });
  const fSku = input({ value: p.sku || "", placeholder: "Артикул (виден клиентам)" });
  // несколько фото; первое — главное (показывается в списке и каталоге)
  let photos = (Array.isArray(p.photos) && p.photos.length) ? [...p.photos] : (p.photo_url ? [p.photo_url] : []);
  const thumbsBox = el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "8px", minHeight: "20px" } });
  function renderThumbs() {
    thumbsBox.innerHTML = "";
    if (!photos.length) { thumbsBox.append(el("div.muted", { text: "Фото нет — добавьте ниже", style: { fontSize: "13px" } })); return; }
    photos.forEach((url, idx) => {
      const wrap = el("div", { style: { position: "relative", width: "74px", height: "74px" } });
      const img = el("img.thumb", { src: thumb(url, 160), loading: "lazy", decoding: "async", style: { width: "74px", height: "74px", objectFit: "cover", borderRadius: "8px", cursor: "zoom-in" }, title: "Увеличить", onclick: () => lightbox(url), onerror: function () { this.src = placeholder(fName.value); } });
      const rm = el("button.btn.btn-danger.btn-sm", { title: "Удалить фото", style: { position: "absolute", top: "-7px", right: "-7px", padding: "0", width: "22px", height: "22px", minWidth: "22px", borderRadius: "50%", lineHeight: "1" }, onclick: (e) => { e.preventDefault(); photos.splice(idx, 1); renderThumbs(); } }, ["×"]);
      wrap.append(img, rm);
      if (idx === 0) wrap.append(el("span", { text: "главное", style: { position: "absolute", bottom: "2px", left: "2px", background: "rgba(0,0,0,.6)", color: "#fff", fontSize: "8px", padding: "1px 4px", borderRadius: "4px" } }));
      thumbsBox.append(wrap);
    });
  }
  renderThumbs();
  const fFile = el("input", { type: "file", accept: "image/*", multiple: true, class: "inp" });
  fFile.addEventListener("change", async () => {
    const files = Array.from(fFile.files || []); if (!files.length) return;
    toast("Загрузка фото…", "info");
    for (const f of files) { try { const url = await ctx.db.uploadPhoto(f); photos.push(url); renderThumbs(); } catch (e) { toast("Ошибка фото: " + e.message, "err"); } }
    toast("Готово", "ok"); fFile.value = "";
  });
  const fPhotoUrl = input({ placeholder: "Ссылка на фото (URL)" });
  const addUrlBtn = el("button.btn.btn-outline.btn-sm", { text: "+ Ссылка", onclick: (e) => { e.preventDefault(); const u = fPhotoUrl.value.trim(); if (u) { photos.push(u); fPhotoUrl.value = ""; renderThumbs(); } } });

  const fStock = input({ type: "number", value: p.stock_qty, placeholder: "0" });
  // «Пришло на склад» — прибавляется к текущему остатку. Удобно, когда товар в минусе:
  // вписал сколько привезли, минус погасится сам (считать в уме не нужно).
  const fArrived = input({ type: "number", min: "0", placeholder: "0", value: "" });
  const arrivedHint = el("div.hint", { style: { marginTop: "-6px" } });
  const paintArrived = () => {
    const add = +fArrived.value || 0;
    const have = Number(fStock.value) || 0;
    arrivedHint.textContent = add > 0
      ? `Было ${have} → станет ${have + add}` + (have < 0 ? " (минус погасится)" : "")
      : "Если привезли товар — впишите сколько. Прибавится к остатку, «Остаток» вручную менять не нужно.";
  };
  fArrived.addEventListener("input", paintArrived);
  fStock.addEventListener("input", paintArrived);
  paintArrived();
  // себестоимость одной суммой + валюта прихода (показываем в той валюте, в которой ввели — cost_cur)
  const costCur0 = костВалюта(p);
  const costVal0 = costCur0 === "usd" ? p.cost_usd
    : costCur0 === "som" ? Math.round(convert((Number(p.cost_usd) > 0 ? Number(p.cost_usd) : convert(Number(p.cost_yuan) || 0, "yuan", "usd")), "usd", "som"))
    : p.cost_yuan;
  const fCost = input({ type: "number", step: "0.01", value: costVal0 || "", placeholder: "0" });
  // Что стояло в поле при открытии. Если владелец это изменил — значит он
  // ЗНАЕТ, какая цена верная, и переоценить надо весь остаток.
  const костБыл = Number(costVal0) || 0;
  const fCostCur = select(ВАЛЮТЫ.map(v => ({ value: v.value, label: v.label })), costCur0);

  // ---- единица измерения ----
  const едБыла = единица(p);
  const вЕдБыло = вЕдинице(p);
  const fUnit = select(ЕДИНИЦЫ.map(e => ({ value: e.value, label: e.label })), едБыла);
  const fPack = input({ type: "number", step: "1", value: вЕдБыло > 1 ? String(вЕдБыло) : "", placeholder: "12" });
  const packWrap = field("Штук в одной единице", fPack);
  const unitHint = el("div.hint", {});

  function показатьЕдиницу() {
    const u = fUnit.value;
    packWrap.style.display = считаетсяПачками(u) ? "" : "none";
    const вЕд = u === "шт" ? 1 : (Number(fPack.value) || 1);
    const пробный = перевести(p, { unit: u, pack_size: вЕд });
    unitHint.textContent = (пробный.множитель === 1)
      ? "Товар считается и продаётся в этих единицах."
      : объяснение(p, пробный).split("\n").join("  ·  ");
  }
  fUnit.addEventListener("change", показатьЕдиницу);
  fPack.addEventListener("input", показатьЕдиницу);
  показатьЕдиницу();
  const fStatus = select([
    { value: "", label: "Авто (по остатку)" },
    { value: "in_stock", label: "Есть" },
    { value: "on_order", label: "Под заказ" },
  ], p.status_override || "");

  // история продаж этого товара (кто / когда / по какой цене) — грузится после открытия
  const historyBox = !isNew ? el("div", {}, [el("div.muted", { text: "Загрузка истории…", style: { fontSize: "13px", padding: "6px 0" } })]) : null;

  const body = el("div", {}, [
    field("Название", fName),
    el("div.row2", {}, [field("Категория", fCat), field("Артикул (виден клиентам)", fSku)]),
    el("div.section-h", { text: "Фотографии (можно несколько)" }),
    thumbsBox,
    field("Загрузить файлы (можно выбрать сразу несколько)", fFile),
    el("div", { style: { display: "flex", gap: "8px", alignItems: "flex-end" } }, [
      el("div", { style: { flex: "1" } }, [field("…или добавить по ссылке", fPhotoUrl)]),
      addUrlBtn,
    ]),
    el("div.hint", { text: "Первое фото — главное (в списке и каталоге). Клиенты видят все фото." }),
    el("div.section-h", { text: "Остаток и себестоимость" }),
    el("div.hint", { text: "Остаток, себестоимость и цены считаются в выбранной единице. Смените её — всё пересчитается само." }),
    el("div.row2", {}, [field("Единица измерения", fUnit), packWrap]),
    unitHint,
    el("div.row3", {}, [field("Остаток (кол-во)", fStock), field("Пришло на склад (+)", fArrived), field("Себестоимость", fCost)]),
    arrivedHint,
    field("Валюта прихода", fCostCur),
    el("div.hint", { text: "Цены продажи вводятся при продаже. Вторая валюта себестоимости считается по курсу автоматически." }),
    el("div.hint", { text: "Измените себестоимость — она проставится всему остатку, включая все партии. Пригодится, когда товар переводят из штук в пачки." }),
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
      // Электронная наклейка: тот же код, что на бумажной — можно
      // отсканировать прямо с экрана компьютера телефоном.
      !isNew && { label: "Показать QR", kind: "btn-outline", onClick: () => {
        const holder = el("div", { style: { textAlign: "center" } });
        holder.innerHTML = qrSvg(skuPayload(p.id), { size: 280 });
        modal({
          title: p.name,
          body: el("div", {}, [
            holder,
            el("div.hint", { style: { textAlign: "center", marginTop: "10px" },
              text: (p.sku ? "Арт.: " + p.sku + " · " : "") + "сканируйте с экрана или наклейте на коробку" }),
          ]),
          actions: [{ label: "Закрыть", kind: "btn-primary", onClick: (c) => c() }],
        });
      } },
      !isNew && { label: "Удалить", kind: "btn-danger", onClick: (close) => {
        confirmDialog("Удалить товар «" + p.name + "»?", async () => { await ctx.db.products.remove(p.id); close(); toast("Удалено", "ok"); ctx.refresh(); });
      } },
      { label: "Отмена", kind: "btn-outline", onClick: (c) => c() },
      { label: "Сохранить", kind: "btn-primary", onClick: async (close) => {
        if (!fName.value.trim()) { toast("Введите название", "err"); return; }
        // ---- смена единицы измерения ----
        // Если владелец поменял единицу или размер упаковки, сперва
        // переводим ВЕСЬ товар: остаток, себестоимость и каждую партию.
        // Делаем это до остальной работы, чтобы ниже всё считалось уже в
        // новых единицах. Товара и денег на складе при этом столько же.
        const едСтала = fUnit.value;
        const вЕдСтало = едСтала === "шт" ? 1 : Math.max(1, Number(fPack.value) || 1);
        const переводНужен = едСтала !== едБыла || вЕдСтало !== вЕдБыло;
        let товар = p;
        if (переводНужен && !isNew) {
          const н = перевести(p, { unit: едСтала, pack_size: вЕдСтало });
          товар = { ...p, stock_qty: н.stock_qty, cost_yuan: н.cost_yuan, cost_usd: н.cost_usd, batches: н.batches };
        }

        const amt = +fCost.value || 0, cur = fCostCur.value;
        const { cost_yuan, cost_usd } = костПоля(amt, cur);
        // «Пришло на склад» прибавляем к текущему остатку (в т.ч. гасим минус),
        // иначе берём то, что вписано в поле «Остаток».
        const arrived = Math.max(0, +fArrived.value || 0);
        // В поле «Остаток» лежит число в СТАРЫХ единицах — владелец его не
        // трогал. Если единицу сменили, переводим и его, иначе склад
        // мгновенно раздуется: 4800 пачек вместо 400.
        const вПоле = +fStock.value || 0;
        const остатокПоля = (переводНужен && !isNew && Math.abs(вПоле - (Number(p.stock_qty) || 0)) < 0.001)
          ? (Number(товар.stock_qty) || 0)
          : вПоле;
        const desired = arrived > 0 ? остатокПоля + arrived : остатокПоля;
        // --- партии (FIFO): подгоняем под введённый остаток ---
        let batches = isNew ? [] : ensureBatches(товар);
        const have = sumQty(batches);
        if (desired > have) {
          // если себестоимость не ввели (0) — берём текущую цену товара, чтобы не создавать партию ¥0
          const cur0 = currentCost(batches);
          const by = amt > 0 ? cost_yuan : (cur0.cost_yuan || cost_yuan);
          const bu = amt > 0 ? cost_usd : (cur0.cost_usd || cost_usd);
          batches.push({ qty: desired - have, cost_yuan: by, cost_usd: bu, date: new Date().toISOString() });
        }
        else if (desired < have) batches = consumeFIFO(batches, have - desired).batches;
        // Себестоимость: партии без цены заполняем всегда.
        //
        // А если владелец ИЗМЕНИЛ цену в поле — переоцениваем ВЕСЬ остаток.
        // Раньше введённая цена применялась только когда партия одна, и при
        // двух партиях молча пропадала: человек вписывал верное значение,
        // нажимал «Сохранить» и ничего не происходило. Так и случилось,
        // когда товар перевели из штук в пачки: 4800 шт по ¥0,75 стали
        // 400 пачек, цену пачки ¥9 вписать было невозможно.
        if (amt > 0) {
          batches.forEach(b => {
            if ((Number(b.cost_yuan) || 0) <= 0 && (Number(b.cost_usd) || 0) <= 0) {
              b.cost_yuan = cost_yuan; b.cost_usd = cost_usd;
            }
          });
          // После перевода единиц цена в карточке уже другая — сравнивать
          // надо с ПЕРЕВЕДЁННОЙ, иначе сам перевод выглядел бы как ручная
          // правка цены и затёр бы разные цены партий одной величиной.
          const ожидалось = переводНужен && !isNew ? (Number(товар.cost_yuan) || 0) : костБыл;
          const тронул = Math.abs(amt - ожидалось) > 0.001;
          if (тронул) batches.forEach(b => { b.cost_yuan = cost_yuan; b.cost_usd = cost_usd; });
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
          name: fName.value.trim(), category: fCat.value.trim(),
          sku: fSku.value.trim() || null,
          photo_url: photos[0] || "", photos,
          stock_qty: batches.length ? sumQty(batches) : desired,
          cost_usd: cc.cost_usd, cost_yuan: cc.cost_yuan,
          cost_cur: cur, // валюта, в которой ввели себестоимость — в ней и показываем
          unit: едСтала,
          pack_size: вЕдСтало,
          status_override: fStatus.value || null,
        };
        // продажные цены (price_*) форма не редактирует — НЕ перезаписываем их (иначе обнуляются).
        // Для нового товара зададим явные нули, у существующего PATCH сохранит прежние.
        if (isNew) { obj.price_yuan = 0; obj.price_usd = 0; obj.price_som = 0; }
        const noPhotos = (o) => { const { photos: _ph, cost_cur: _cc, sku: _sk, unit: _u, pack_size: _ps, ...rest } = o; return rest; }; // фолбэк, если колонок photos/cost_cur/sku/unit ещё нет
        try { await ctx.db.products.upsert({ ...obj, batches, ...(cost_prev ? { cost_prev } : {}) }); }
        catch (e) {
          try { await ctx.db.products.upsert({ ...obj, batches }); }
          catch (e2) { try { await ctx.db.products.upsert(noPhotos({ ...obj, batches })); } catch (e3) { await ctx.db.products.upsert(noPhotos(obj)); } }
        }
        // отметить себестоимость как проверенную при этой стоимости (предупреждение на дашборде уйдёт)
        try { const a = JSON.parse(localStorage.getItem("gm_cost_ack") || "{}"); const pid = obj.id || p.id; if (pid) { a[pid] = Number(cc.cost_yuan) || 0; localStorage.setItem("gm_cost_ack", JSON.stringify(a)); } } catch {}
        close(); toast("Сохранено", "ok"); ctx.refresh();
      } },
    ].filter(Boolean),
  });

  if (!isNew) loadProductHistory(ctx, p, historyBox);
}

// История продаж товара: кто / когда / по какой цене + остаток; правка кол-ва/цены через накладную.
async function loadProductHistory(ctx, p, box) {
  if (!box) return;
  const pid = p.id;
  try {
    const [sales, customers, products] = await Promise.all([ctx.db.sales.list(), ctx.db.customers.list(), ctx.db.products.list()]);
    const cmap = Object.fromEntries(customers.map(c => [c.id, c.name]));
    const fresh = products.find(x => x.id === pid) || p;
    const rows = [];
    sales.forEach(s => (s.items || []).forEach(it => {
      if (String(it.product_id) === String(pid)) {
        rows.push({ sale: s, date: s.date, client: cmap[s.customer_id] || "—", qty: Number(it.qty) || 0, price: it.unit_price, cur: it.currency || s.currency });
      }
    }));
    rows.sort((a, b) => new Date(b.date) - new Date(a.date));
    box.innerHTML = "";
    const left = Number(fresh.stock_qty) || 0;
    box.append(el("div.card", { style: { padding: "10px 14px", marginBottom: "10px", display: "flex", alignItems: "center", gap: "8px" } }, [
      el("span", { text: "📦" }),
      el("strong", { text: "Осталось в остатке: " + left + " шт." }),
      el("span.muted", { style: { fontSize: "12px" }, text: "(изменить остаток — поле «Остаток» выше)" }),
    ]));
    if (!rows.length) { box.append(el("div.muted", { text: "Этот товар ещё никто не покупал", style: { fontSize: "13px", padding: "8px 0" } })); return; }
    const tb = el("tbody");
    rows.forEach(r => tb.append(el("tr", {}, [
      el("td", { text: new Date(r.date).toLocaleDateString("ru-RU") }),
      el("td", {}, [el("strong", { text: r.client })]),
      el("td", { text: r.qty + " шт." }),
      el("td", {}, [el("strong", { text: r.price > 0 ? fmt(r.price, r.cur) : "—" })]),
      el("td.right", {}, [el("button.btn.btn-outline.btn-sm.btn-icon", { title: "Изменить кол-во/цену или удалить (в накладной)", onclick: () => openEditor(ctx, r.sale, customers, products, r.sale.customer_id) }, [icon("edit", { size: 15 })])]),
    ])));
    box.append(el("div", { style: { overflowX: "auto", maxHeight: "280px", overflowY: "auto" } }, [
      el("table.tbl", {}, [
        el("thead", {}, [el("tr", {}, ["Дата", "Клиент", "Кол-во", "Цена", ""].map(h => el("th", { text: h })))]),
        tb,
      ]),
    ]));
  } catch (e) {
    box.innerHTML = ""; box.append(el("div.muted", { text: "Не удалось загрузить историю: " + (e.message || e) }));
  }
}
