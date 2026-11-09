// ========================================================================
//  СТРАНИЦА «ТОВАРЫ» — список, добавление, редактирование, фото, остатки
// ========================================================================
import { el, $, toast, modal, confirmDialog, field, input, select, inputList, lightbox, showLoader, hideLoader } from "../ui.js?v=20261109n";
import { icon } from "../icons.js?v=20261109n";
import { fmt, convert } from "../fx.js?v=20261109n";
import { consumeFIFO, ensureBatches, sumQty, currentCost, costOutlook } from "../inventory.js?v=20261109n";
import { downloadTemplate, parseRows, pickFile } from "../xlsx-import.js?v=20261109n";
import { openEditor } from "./sales.js?v=20261109n";
import { thumbAttrs, thumb } from "../img.js?v=20261109n";
import { LOW_STOCK } from "../advice.js?v=20261109n";
import { qrSvg, skuPayload } from "../qr.js?v=20261109n";
// Себестоимость в той валюте, в которой её ввели. Расчёт общий со складом
// в телефоне — иначе один товар показывает разные цифры на разных экранах.
import { костСтрока as costShow, костВалюта, костПоля, костЧисло, ВАЛЮТЫ } from "../cost.js?v=20261109n";
// Единица измерения: товар считают штуками, пачками, коробками. Смена
// единицы пересчитывает и остаток, и себестоимость, и все партии.
import { ЕДИНИЦЫ, единица, вЕдинице, считаетсяПачками, подпись as подписьКол, перевести, объяснение, заЕдиницу, сЕдиницы } from "../unit.js?v=20261109n";
import { подходит } from "../productsearch.js?v=20261109n";
import { подписьКода, естьКолонкаКода, кодПриСохранении, следующийПосле, КОД_ЗАНЯТ } from "../catalogcode.js?v=20261109n";
import { изменениеСклада } from "../db.js?v=20261109n";
// Главное фото (аватар) и порядок снимков — две независимые вещи.
// Правило общее с каталогом, складом в телефоне и PDF: см. js/photo.js.
import { снимки, главноеФото, индексГлавного } from "../photo.js?v=20261109n";
import { редакторФото } from "../photoedit.js?v=20261109n";
// Упаковка: в чём покупаем, в чём храним, в чём продаём и как пересчитать
// приход. Расчёт общий с приёмкой и сервером — см. js/packing.js.
import {
  настройки as настройкиУпаковки, статус as статусУпаковки, проверки as проверкиУпаковки,
  коэффициент as коэффициентУпаковки, поляНастроек as поляНастроекУпаковки,
  нуженПереводОстатка, цепочка as цепочкаУпаковки, описаниеЗакупки, ПРАВИЛА_ОСТАТКА,
} from "../packing.js?v=20261109n";
// Цена на каждом уровне упаковки и маржа. Считает только показываемое:
// цену продажи от себестоимости этот модуль не двигает — см. js/pricing.js.
import { уровниЦен, маржа } from "../pricing.js?v=20261109n";
import { картаДороги, вДороге, дорожеСейчас, едетВместоНет, подписьДороги } from "../transit.js?v=20261109n";

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
// он же запоминает, докуда долистали (см. «место» ниже)
let запомнитьПрокрутку = null;

// ------------------------------------------------------------------
//  ГДЕ МЫ БЫЛИ В СПИСКЕ.
//  Правка товара перерисовывает страницу целиком, и список начинался
//  заново: поиск сброшен, прокрутка наверх, первые 48 карточек. Найти
//  товар, который только что правил, приходилось снова.
//  Поэтому запоминаем поиск, категорию, сколько карточек показано и
//  какой товар открывали — и после сохранения возвращаемся туда же.
// ------------------------------------------------------------------
const место = { поиск: "", категория: "", показано: 0, прокрутка: 0, товар: "" };
export function запомнитьМесто(показано, товар) {
  место.показано = Math.max(место.показано, показано || 0);
  if (товар) место.товар = товар;
  место.прокрутка = window.scrollY || 0;
}
const freshness = p => Math.max(
  p.created_at ? +new Date(p.created_at) : 0,
  p.last_arrival_at ? +new Date(p.last_arrival_at) : 0
);

export default async function render(page, ctx) {
  const [all, allPurchases] = await Promise.all([ctx.db.products.list(), ctx.db.purchases.list()]);
  all.sort((a, b) => freshness(b) - freshness(a));
  // Что едет: считает общий js/transit.js — тем же кодом пользуются
  // Главная и телефон, иначе «в дороге» везде показывало бы разное.
  const дорога = картаДороги(allPurchases);
  const transitIds = new Set(Object.keys(дорога));

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

  function applyFilters(сбросить = true) {
    const q = search.value.toLowerCase();
    const cat = catFilter.value;
    // Сам искал или менял категорию — значит начинаем список сначала.
    // А при возврате после правки товара (сбросить = false) место храним.
    if (сбросить) { место.поиск = search.value; место.категория = cat; место.показано = 0; место.прокрутка = 0; место.товар = ""; }
    draw(all.filter(p =>
      (!cat || p.category === cat) &&
      подходит(p, q)));
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
  запомнитьПрокрутку = () => { место.прокрутка = window.scrollY || 0; место.показано = shown; };
  // Слушатель один на всё время жизни вкладки: раньше он добавлялся при
  // каждом заходе в «Товары» и никогда не снимался.
  if (!window.__gmProdScrollBound) {
    window.__gmProdScrollBound = true;
    window.addEventListener("scroll", () => { if (loadMore) loadMore(); if (запомнитьПрокрутку) запомнитьПрокрутку(); }, { passive: true });
  }

  function renderCards(list) {
    list.forEach(p => {
      const isNew  = freshness(p) > 0 && (Date.now() - freshness(p)) / 86400000 <= WAREHOUSE_NEW_DAYS;
      const tr = вДороге(дорога, p);
      const isSoon = едетВместоНет(дорога, p);
      // Что едет — показываем ВСЕГДА, есть товар на складе или нет:
      // владельцу надо видеть, что докупать уже не нужно.
      const transitNote = tr ? el("div", {
        title: tr.поставщики.length ? "Поставщик: " + tr.поставщики.join(", ") : "",
        style: { fontSize: "11px", fontWeight: "700", color: "#b45309", background: "rgba(245,158,11,.13)", border: "1px solid rgba(245,158,11,.35)", borderRadius: "6px", padding: "3px 7px", margin: "4px 0 2px", lineHeight: "1.3" },
        text: "🚚 " + подписьДороги(tr),
      }) : null;
      // Едущая партия дороже той, что продаётся сейчас: после прихода
      // себестоимость вырастет — цену продажи лучше поднять заранее.
      const дороже = tr ? дорожеСейчас(tr, p) : null;
      const вал = костВалюта(p);
      const ценаБыло = дороже ? costShow(дороже.было.yuan, дороже.было.usd, вал) : "";
      const ценаСтанет = дороже ? costShow(дороже.станет.yuan, дороже.станет.usd, вал) : "";
      const transitPrice = дороже ? el("div", {
        title: "Сейчас продаётся партия по " + ценаБыло + ", а едущая обойдётся в " + ценаСтанет
          + ". Когда старый товар кончится, себестоимость вырастет — цену продажи стоит поднять заранее.",
        style: { fontSize: "11px", fontWeight: "700", color: "var(--danger,#f87171)", background: "rgba(239,68,68,.10)", border: "1px solid rgba(239,68,68,.35)", borderRadius: "6px", padding: "3px 7px", margin: "0 0 2px", lineHeight: "1.3" },
        text: "↑ В дороге дороже: " + ценаБыло + " → " + ценаСтанет + " (+" + дороже.процент + "%)",
      }) : null;
      // Полоска состояния слева: видно на просмотр, не читая цифру остатка.
      // Порог берём из советов, чтобы «заканчивается» означало одно и то же везде.
      const qty = Number(p.stock_qty) || 0;
      const stateCls = qty < 0 ? ".neg" : (qty <= LOW_STOCK ? ".low" : "");
      const card = el("div.prod.reveal" + stateCls, { "data-id": p.id, onclick: () => { запомнитьМесто(shown, p.id); openForm(ctx, p, cats); } }, [
        // Поля по краям вписанного снимка заполняет его же размытая копия
        // (css/theme.css, .prod::before) — переменная ставится ниже.
        // в списке — миниатюра (иначе сотни полноразмерных фото вешают телефон);
        // при увеличении открываются оригиналы
        el("img.ph", { ...thumbAttrs(главноеФото(p), placeholder(p.name), 480), alt: p.name, title: "Нажмите для увеличения",
          // Открываем просмотр на ТОМ снимке, который виден в списке, —
          // иначе нажатие на главное фото показывало бы первое по порядку.
          onclick: (e) => { const ph = снимки(p); if (ph.length) { e.stopPropagation(); lightbox(ph, индексГлавного(p)); } } }),
        el("div.body", {}, [
          el("div.nm", { text: p.name }),
          el("div.cat", { text: p.category || "—" }),
          ...(подписьКода(p) ? [el("div.muted", { text: подписьКода(p), style: { fontSize: "11px", marginTop: "-2px" } })] : []),
          transitNote,
          transitPrice,
          el("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto" } }, [
            el("div", { style: { display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" } }, [
              isSoon ? el("span.badge.transit", { title: подписьДороги(tr) }, [icon("truck", { size: 13 }), "В дороге"]) : statusBadge(p),
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
      // Размытая копия снимка заполняет поля по краям (css/theme.css,
      // .prod::before). Берём самую мелкую миниатюру: её всё равно
      // размывает, зато грузится мгновенно и памяти не ест.
      if (p.photo_url) card.style.setProperty("--фото", "url('" + thumb(p.photo_url, 64) + "')");
      grid.append(card);
    });
    // анимация появления — только у новой порции, иначе на телефоне это тысячи таймеров
    requestAnimationFrame(() => grid.querySelectorAll(".reveal:not(.in)").forEach((n, i) => setTimeout(() => n.classList.add("in"), Math.min(i, 20) * 30)));
  }
  // Возвращаемся туда, где были до правки товара: тот же поиск, та же
  // категория, столько же показанных карточек и та же прокрутка.
  search.value = место.поиск || "";
  // Список категорий — свой, не браузерный <select>: перебирать options у него нельзя.
  if (место.категория && cats.includes(место.категория)) catFilter.value = место.категория;
  applyFilters(false);
  вернутьсяНаМесто();

  search.addEventListener("input", () => applyFilters());
  catFilter.addEventListener("change", () => applyFilters());

  function вернутьсяНаМесто() {
    if (!место.показано && !место.прокрутка) return;
    // сперва догружаем столько же карточек, сколько было видно
    let защита = 200;
    while (shown < место.показано && shown < drawList.length && защита-- > 0) appendChunk();
    // затем возвращаем взгляд: на сам товар, если он ещё в списке
    requestAnimationFrame(() => {
      const карточка = место.товар && grid.querySelector(`[data-id="${место.товар}"]`);
      if (карточка) карточка.scrollIntoView({ block: "center" });
      else window.scrollTo({ top: место.прокрутка });
    });
  }
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
  // Постоянный код из печатного каталога. Пусто — присвоится сам при сохранении.
  const fCode = input({ value: p.code || "", placeholder: "присвоится сам: LP-017", style: { textTransform: "uppercase" } });
  // ---- фотографии: порядок снимков и главное фото ----
  //
  // Порядок и аватар сохраняются СРАЗУ, не дожидаясь кнопки «Сохранить»:
  // человек расставил снимки, выбрал главное, закрыл карточку — и
  // справедливо считает, что расставил. Записываем ровно две колонки
  // (photos и photo_url), поэтому остаток, себестоимость и партии эта
  // запись не трогает: /api/admin/db обновляет присланные поля (PATCH),
  // а не всю строку. В журнал остатков она тоже не попадает — там
  // пропускаются записи без stock_qty.
  let фотоИзменены = false;
  let таймерФото = 0;
  async function записатьФото(данные) {
    const строка = { id: p.id, photos: данные.photos, photo_url: данные.photo_url };
    try { await ctx.db.products.upsert(строка); }
    catch (e) {
      // Колонки photos может не быть (база до миграции галереи) — тогда
      // хотя бы главное фото сохраняем, иначе выбор пропадёт молча.
      try { await ctx.db.products.upsert({ id: p.id, photo_url: данные.photo_url }); }
      catch { throw e; }
    }
    p.photos = данные.photos;
    p.photo_url = данные.photo_url;
  }
  const сохранитьФото = (данные) => {
    фотоИзменены = true;
    // У нового товара строки в базе ещё нет — снимки запишутся вместе с
    // товаром, когда нажмут «Добавить».
    if (isNew) return;
    // Стрелками порядок меняют подряд, по снимку за нажатие: пишем не
    // каждое нажатие, а то, на чём человек остановился.
    clearTimeout(таймерФото);
    таймерФото = setTimeout(async () => {
      изменениеСклада("Фотографии товара", p.id || "");
      try { await записатьФото(данные); }
      catch (e) { toast("Фото не сохранились: " + (e.message || e), "err"); }
    }, 500);
  };
  const ред = редакторФото({
    фото: снимки(p),
    главное: главноеФото(p),
    наПросмотр: (список, i) => lightbox(список, i),
    наСообщение: (т) => toast(т, "info"),
    наИзменение: сохранитьФото,
  });
  const thumbsBox = ред.узел;
  const fFile = el("input", { type: "file", accept: "image/*", multiple: true, class: "inp" });
  fFile.addEventListener("change", async () => {
    const files = Array.from(fFile.files || []); if (!files.length) return;
    toast("Загрузка фото…", "info");
    for (const f of files) { try { const url = await ctx.db.uploadPhoto(f); ред.добавить(url); } catch (e) { toast("Ошибка фото: " + e.message, "err"); } }
    toast("Готово", "ok"); fFile.value = "";
  });
  const fPhotoUrl = input({ placeholder: "Ссылка на фото (URL)" });
  const addUrlBtn = el("button.btn.btn-outline.btn-sm", { text: "+ Ссылка", onclick: (e) => { e.preventDefault(); const u = fPhotoUrl.value.trim(); if (u) { ред.добавить(u); fPhotoUrl.value = ""; } } });

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
  // Себестоимость товара числом — в той валюте, что выбрана в поле.
  // Нужна там, где надо понять, «та же это цена или владелец её правил»:
  // сравнивать сумму в сумах с суммой в юанях нельзя.
  const ценаВПоле = (т, валюта) => {
    const v = костЧисло(Number(т.cost_yuan) || 0, Number(т.cost_usd) || 0, валюта);
    return валюта === "som" ? Math.round(v) : Math.round(v * 100) / 100;
  };
  const fCostCur = select(ВАЛЮТЫ.map(v => ({ value: v.value, label: v.label })), costCur0);

  // ---- цена продажи и маржа ----
  //
  // Цена продажи в сумах — та же колонка price_som, которую правят в
  // складе в телефоне: на компьютере её не было вовсе, и маржу посмотреть
  // было негде. Она ПОДСТАВЛЯЕТСЯ при продаже, и менять её можно только
  // руками: себестоимость выросла — цена остаётся прежней, система её
  // сама не пересчитывает. Это требование владельца.
  const fSell = input({ type: "number", step: "1", min: "0", placeholder: "0", value: Number(p.price_som) > 0 ? String(p.price_som) : "" });
  const priceLevels = el("div.hint", {});
  const marginLine = el("div.hint", {});

  // ---- единицы измерения и упаковка ----
  //
  // Три разные единицы: в чём берём у поставщика, в чём лежит на складе,
  // в чём продаём. Плюс два размера: штук в упаковке и упаковок в коробке.
  // Настроил один раз — дальше приход пересчитывается сам (js/packing.js).
  //
  // ВАЖНО, И ЭТО ЛЕГКО СПУТАТЬ. Единица закупки, коробка, правило остатка
  // и автопреобразование — правила для БУДУЩИХ приходов: остаток на полке
  // от них не меняется. А вот складская единица и размер упаковки меняют
  // то, ЧЕМ МЕРЯЮТ уже лежащий товар, — это перевод склада, и он идёт
  // только с показом «было → станет» и подтверждением владельца.
  const нБыло = настройкиУпаковки(p);
  const едБыла = единица(p);
  const вЕдБыло = вЕдинице(p);
  const вариантыЕдиниц = ЕДИНИЦЫ.map(e => ({ value: e.value, label: e.label }));

  const fUnit = select(вариантыЕдиниц, едБыла);
  const fPack = input({ type: "number", step: "1", min: "1", value: вЕдБыло > 1 ? String(вЕдБыло) : "", placeholder: "12" });
  const packWrap = field("Штук в одной складской единице", fPack);
  const fBuyUnit = select(вариантыЕдиниц, нБыло.закуп);
  const fSellUnit = select(вариантыЕдиниц, нБыло.продажа);
  const fBox = input({ type: "number", step: "1", min: "1", value: нБыло.вКоробке > 0 ? String(нБыло.вКоробке) : "", placeholder: "20" });
  const boxWrap = field("Складских единиц в одной коробке", fBox);
  const fOdd = select(ПРАВИЛА_ОСТАТКА.map(п => ({ value: п.value, label: п.label })), нБыло.правило);
  const oddWrap = field("Если упаковка выходит неполной", fOdd);
  const fAuto = el("input", { type: "checkbox", style: { width: "18px", height: "18px", flex: "0 0 auto", accentColor: "var(--accent)" } });
  fAuto.checked = нБыло.авто;

  const packStatus = el("span.badge", { style: { fontSize: "11px" } });
  const packChain = el("div.hint", {});
  const packBuy = el("div.hint", {});
  const packWarn = el("div.hint", { style: { color: "var(--warn)" } });
  const unitHint = el("div.hint", {});

  // Товар, каким он станет с тем, что сейчас стоит в полях. Нужен и для
  // подсказок, и для проверки противоречий — считает их один модуль.
  const пробныйТовар = () => ({
    ...p,
    ...поляНастроекУпаковки(p, {
      unit: fUnit.value,
      pack_size: Number(fPack.value) || 1,
      buy_unit: fBuyUnit.value,
      sell_unit: fSellUnit.value,
      box_size: Number(fBox.value) || null,
      sell_units: [...new Set([fSellUnit.value, ...нБыло.разрешено])],
      auto_convert: fAuto.checked,
      odd_rule: fOdd.value,
    }),
  });

  function показатьЕдиницу() {
    const u = fUnit.value;
    packWrap.style.display = считаетсяПачками(u) ? "" : "none";
    // Коробку спрашиваем, только когда ей есть что означать: коробками
    // или покупают, или продают.
    const нуженЯщик = (fBuyUnit.value === "коробка" || fSellUnit.value === "коробка") && u !== "коробка";
    boxWrap.style.display = нуженЯщик ? "" : "none";

    const проба = пробныйТовар();
    packChain.textContent = цепочкаУпаковки(проба) || "";
    packBuy.textContent = описаниеЗакупки(проба);

    // Неполные упаковки возможны, только если закупочная единица мельче
    // складской, — иначе спрашивать про остаток не о чем.
    oddWrap.style.display = коэффициентУпаковки(проба) > 0 && коэффициентУпаковки(проба) < 1 ? "" : "none";

    const беды = проверкиУпаковки(проба);
    packWarn.textContent = беды.join("  ·  ");
    packWarn.style.display = беды.length ? "" : "none";

    const с = статусУпаковки(проба);
    packStatus.textContent = беды.length ? "Требует проверки" : (нБыло.версия < 1 ? "Ещё не настроено" : с.подпись);
    packStatus.style.background = беды.length ? "var(--warn)" : (нБыло.версия < 1 ? "var(--muted)" : "var(--ok)");
    packStatus.style.color = "#fff";

    // Перевод остатка — отдельная, заметная строка: это единственное
    // здесь, что двигает уже лежащий на складе товар.
    const вЕд = u === "шт" ? 1 : (Number(fPack.value) || 1);
    const пробный = перевести(p, { unit: u, pack_size: вЕд });
    unitHint.textContent = (пробный.множитель === 1)
      ? "Остаток на полке эти настройки не меняют."
      : "ПЕРЕСЧЁТ ОСТАТКА: " + объяснение(p, пробный).split("\n").join("  ·  ");
    unitHint.style.color = пробный.множитель === 1 ? "" : "var(--warn)";
    // Упаковка меняет уровни цен: цена за коробку зависит от её размера,
    // а цена за штуку — от того, сколько штук в упаковке.
    пересчитатьЦены();
  }
  // Единица продажи шла следом за складской — пусть и дальше идёт.
  // Если же её выбрали отдельно (продаём поштучно, а храним пачками),
  // переключение склада её не трогает.
  let едПрежняя = едБыла;
  fUnit.addEventListener("change", () => {
    if (fSellUnit.value === едПрежняя) fSellUnit.value = fUnit.value;
    едПрежняя = fUnit.value;
  });
  // Цена на каждом уровне упаковки и прибыль с одной складской единицы.
  // Ничего не записывает — только показывает, во что обходится товар и
  // сколько на нём остаётся при нынешней цене продажи.
  const пересчитатьЦены = () => {
    const валюта = fCostCur.value;
    const себест = Number(fCost.value) || 0;
    const проба = пробныйТовар();
    const н = настройкиУпаковки(проба);
    const уровни = уровниЦен(проба, { цена: себест, ед: н.склад });
    priceLevels.textContent = (себест > 0 && уровни.length > 1)
      ? "Закупка: " + уровни.map(у => fmt(у.цена, валюта) + " за " + заЕдиницу(у.ед)).join("  ·  ")
      : (себест > 0 ? "" : "Впишите себестоимость — покажу цену за штуку, за упаковку и за коробку.");

    // Считаем в сумах: цена продажи в сумах, а себестоимость могла быть
    // введена в юанях. Сравнивать суммы в разных валютах нельзя.
    const себВСумах = валюта === "som" ? себест : convert(себест, валюта, "som");
    const м = маржа({ себестоимость: себВСумах, цена: Number(fSell.value) || 0 });
    // Проценты в сотых долях читаются только у маленьких чисел. «Маржа
    // -28151,27%» — это не точность, а шум: округляем до целого.
    const пц = (v) => (Math.abs(v) >= 10 ? Math.round(v) : v);
    marginLine.textContent = !м.есть
      ? "Цена продажи не задана — маржу считать не из чего. Она подставляется при продаже."
      : `Прибыль ${fmt(м.прибыль, "som")} ${сЕдиницы(н.склад)}  ·  маржа ${пц(м.маржа)}%  ·  наценка ${пц(м.наценка)}%`
        + (себВСумах > 0 ? "  ·  себестоимость " + fmt(Math.round(себВСумах), "som") : "");
    marginLine.style.color = м.вМинус ? "var(--warn)" : "";
  };
  [fUnit, fBuyUnit, fSellUnit, fOdd].forEach(п => п.addEventListener("change", показатьЕдиницу));
  [fPack, fBox].forEach(п => п.addEventListener("input", показатьЕдиницу));
  fAuto.addEventListener("change", показатьЕдиницу);
  [fCost, fSell].forEach(п => п.addEventListener("input", пересчитатьЦены));
  fCostCur.addEventListener("change", пересчитатьЦены);
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
    field("Код в каталоге", fCode),
    el("div.section-h", { text: "Фотографии (можно несколько)" }),
    thumbsBox,
    field("Загрузить файлы (можно выбрать сразу несколько)", fFile),
    el("div", { style: { display: "flex", gap: "8px", alignItems: "flex-end" } }, [
      el("div", { style: { flex: "1" } }, [field("…или добавить по ссылке", fPhotoUrl)]),
      addUrlBtn,
    ]),
    el("div.hint", { text: "Порядок снимков и главное фото сохраняются сразу — отдельно нажимать «Сохранить» для них не нужно. Клиенты видят все фото в этом порядке." }),
    el("div", { style: { display: "flex", alignItems: "center", gap: "10px", marginTop: "18px" } }, [
      el("div.section-h", { text: "Единицы измерения и упаковка", style: { margin: "0" } }),
      packStatus,
    ]),
    el("div.hint", { text: "Настройте один раз — дальше приход от поставщика будет пересчитываться в складские единицы сам." }),
    el("div.row3", {}, [
      field("Покупаем у поставщика в", fBuyUnit),
      field("На складе считаем в", fUnit),
      field("Продаём в", fSellUnit),
    ]),
    el("div.row2", {}, [packWrap, boxWrap]),
    packChain,
    packBuy,
    oddWrap,
    el("label", { style: { display: "flex", alignItems: "center", gap: "9px", margin: "10px 0 2px", cursor: "pointer" } }, [
      fAuto,
      el("span", { text: "Пересчитывать приход автоматически" }),
    ]),
    el("div.hint", { text: "Пока выключено, приход зачисляется как раньше — без пересчёта. Включайте, когда проверите размеры упаковки." }),
    packWarn,
    unitHint,
    el("div.section-h", { text: "Остаток и себестоимость" }),
    el("div.hint", { text: "Остаток, себестоимость и цены считаются в складской единице." }),
    el("div.row3", {}, [field("Остаток (кол-во)", fStock), field("Пришло на склад (+)", fArrived), field("Себестоимость", fCost)]),
    arrivedHint,
    field("Валюта прихода", fCostCur),
    el("div.hint", { text: "Вторая валюта себестоимости считается по курсу автоматически." }),
    el("div.hint", { text: "Измените себестоимость — она проставится всему остатку, включая все партии. Пригодится, когда товар переводят из штук в пачки." }),
    el("div.section-h", { text: "Цена продажи и маржа" }),
    priceLevels,
    field("Цена продажи, сум", fSell),
    el("div.hint", { text: "Подставится при продаже — поменять её там можно. Себестоимость на неё не влияет: выросла закупка — цена остаётся прежней, пока вы сами её не измените." }),
    marginLine,
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
              text: (подписьКода(p) ? подписьКода(p) + " · " : "") + "сканируйте с экрана или наклейте на коробку" }),
          ]),
          actions: [{ label: "Закрыть", kind: "btn-primary", onClick: (c) => c() }],
        });
      } },
      !isNew && { label: "Удалить", kind: "btn-danger", onClick: (close) => {
        confirmDialog("Удалить товар «" + p.name + "»?", async () => { await ctx.db.products.remove(p.id); close(); toast("Удалено", "ok"); ctx.refresh(); });
      } },
      // «Отмена» отменяет правку полей, но не фотографии: порядок и главное
      // фото уже записаны. Поэтому список за карточкой надо перерисовать —
      // иначе в нём остался бы прежний аватар.
      { label: "Отмена", kind: "btn-outline", onClick: (c) => { c(); if (фотоИзменены && !isNew) { clearTimeout(таймерФото); записатьФото(ред.данные()).then(() => ctx.refresh()).catch(() => {}); } } },
      { label: "Сохранить", kind: "btn-primary", onClick: async (close) => {
        if (!fName.value.trim()) { toast("Введите название", "err"); return; }
        // ---- смена единицы измерения ----
        // Если владелец поменял единицу или размер упаковки, сперва
        // переводим ВЕСЬ товар: остаток, себестоимость и каждую партию.
        // Делаем это до остальной работы, чтобы ниже всё считалось уже в
        // новых единицах. Товара и денег на складе при этом столько же.
        const едСтала = fUnit.value;
        const вЕдСтало = едСтала === "шт" ? 1 : Math.max(1, Number(fPack.value) || 1);
        const переводНужен = !isNew && нуженПереводОстатка(p, { unit: едСтала, pack_size: вЕдСтало });
        // Перевод двигает ВЕСЬ остаток и все партии. Это единственное
        // место в карточке, где одно нажатие меняет склад целиком, —
        // поэтому показываем «было → станет» и ждём явного «Да».
        // Настройка упаковки (единица закупки, коробка, правило остатка)
        // сюда не попадает: она остаток не трогает.
        let пересчёт = null;
        if (переводНужен && !isNew) {
          пересчёт = перевести(p, { unit: едСтала, pack_size: вЕдСтало });
          const н = пересчёт;
          const согласен = await new Promise(готово => confirmDialog(
            "Меняется то, чем считают остаток этого товара.\n\n"
              + объяснение(p, н)
              // Цену продажи система НЕ пересчитывает — это правило
              // владельца. Но молчать тут нельзя: она была назначена за
              // старую единицу, и после перевода означает уже другое.
              + (Number(p.price_som) > 0
                ? "\n\nЦена продажи (" + fmt(Number(p.price_som), "som") + ") останется прежней — сама она не меняется."
                  + " Проверьте её: теперь это цена за " + заЕдиницу(едСтала) + "."
                : "")
              + "\n\nПересчитать склад?",
            () => готово(true)));
          if (!согласен) return;
          // Цена в поле — за СТАРУЮ единицу, и владелец её не трогал.
          // Значит она должна поехать вместе с остатком: иначе 24 шт по
          // ¥44 превратятся в 2,4 пачки по ¥44, и запасы подешевеют
          // ровно в десять раз. Проверено на этом самом примере.
          if (Math.abs((+fCost.value || 0) - костБыл) < 0.001) {
            fCost.value = String(ценаВПоле(н, fCostCur.value) || "");
          }
        }
        let товар = p;
        if (пересчёт) {
          товар = { ...p, stock_qty: пересчёт.stock_qty, cost_yuan: пересчёт.cost_yuan, cost_usd: пересчёт.cost_usd, batches: пересчёт.batches };
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
          // Сравниваем в ТОЙ ЖЕ валюте, что в поле: товар хранит юани и
          // доллары, а в поле могут стоять сумы, и разница валют читалась
          // бы как ручная правка цены.
          const ожидалось = переводНужен && !isNew ? ценаВПоле(товар, cur) : костБыл;
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
        // Постоянный код. Решаем по свежему списку товаров, а не по тому, что
        // был при открытии формы: за это время код мог уйти другому товару.
        // До миграции колонки code нет — тогда код не пишем вовсе.
        let код = null;
        try {
          const все = await ctx.db.products.list();
          if (естьКолонкаКода(все)) {
            const решение = кодПриСохранении({ товар: isNew ? {} : p, вписано: fCode.value, категория: fCat.value.trim(), товары: все });
            if (решение.ошибка) { toast(решение.ошибка, "err"); return; }
            код = решение.code;
          }
        } catch { }
        const obj = {
          ...(isNew ? {} : { id: p.id }),
          ...(код ? { code: код } : {}),
          name: fName.value.trim(), category: fCat.value.trim(),
          sku: fSku.value.trim() || null,
          // Главное фото выбирает владелец звездой — это НЕ «первое в
          // списке»: порядок снимков и аватар меняют независимо.
          ...ред.данные(),
          stock_qty: batches.length ? sumQty(batches) : desired,
          cost_usd: cc.cost_usd, cost_yuan: cc.cost_yuan,
          cost_cur: cur, // валюта, в которой ввели себестоимость — в ней и показываем
          // Упаковка: единица закупки и продажи, коробка, правило остатка
          // и версия настроек. unit и pack_size идут отсюда же — их
          // нормализует поляНастроек (js/packing.js).
          ...поляНастроекУпаковки(p, {
            unit: едСтала,
            pack_size: вЕдСтало,
            buy_unit: fBuyUnit.value,
            sell_unit: fSellUnit.value,
            box_size: Number(fBox.value) || null,
            sell_units: [...new Set([fSellUnit.value, ...нБыло.разрешено])],
            auto_convert: fAuto.checked,
            odd_rule: fOdd.value,
          }),
          status_override: fStatus.value || null,
        };
        // Цену продажи в сумах форма теперь правит — её и пишем. Цены в
        // юанях и долларах форма не трогает: у существующего товара PATCH
        // сохранит прежние, новому ставим явные нули.
        obj.price_som = Math.max(0, +fSell.value || 0);
        if (isNew) { obj.price_yuan = 0; obj.price_usd = 0; }
        изменениеСклада(isNew ? "Новый товар" : "Правка карточки товара", p && p.id ? p.id : "");
        // Запасной путь, если колонок в базе ещё нет. Сперва снимаем только
        // упаковку (db/packing-migration.sql не выполнен) — терять из-за
        // неё артикул и фото незачем, — и лишь потом всё остальное.
        const noPacking = (o) => { const { buy_unit: _b, sell_unit: _s, box_size: _bs, sell_units: _su, auto_convert: _a, odd_rule: _o, packing_ver: _v, ...rest } = o; return rest; };
        const noPhotos = (o) => { const { photos: _ph, cost_cur: _cc, sku: _sk, unit: _u, pack_size: _ps, code: _cd, ...rest } = noPacking(o); return rest; }; // фолбэк, если колонок photos/cost_cur/sku/unit/code ещё нет
        const сохранить = async (o) => {
          try { await ctx.db.products.upsert({ ...o, batches, ...(cost_prev ? { cost_prev } : {}) }); }
          catch (e) {
            // Код успел уйти другому товару — это решаем снаружи, следующим
            // номером. Молча сохранить товар без кода было бы хуже.
            if (o.code && КОД_ЗАНЯТ.test(String((e && e.message) || e))) throw e;
            try { await ctx.db.products.upsert({ ...o, batches }); }
            catch (e2) {
              // Колонок упаковки может ещё не быть — пробуем без них, и
              // только если и это не прошло, снимаем фото и остальное.
              try { await ctx.db.products.upsert(noPacking({ ...o, batches })); }
              catch (e3) { try { await ctx.db.products.upsert(noPhotos({ ...o, batches })); } catch (e4) { await ctx.db.products.upsert(noPhotos(o)); } }
            }
          }
        };
        for (let попытка = 0; ; попытка++) {
          try { await сохранить(obj); break; }
          catch (e) {
            if (попытка < 5 && obj.code && КОД_ЗАНЯТ.test(String((e && e.message) || e))) { obj.code = следующийПосле(obj.code); continue; }
            throw e;
          }
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
        rows.push({ sale: s, date: s.date, client: cmap[s.customer_id] || s.order_from?.name || "—", qty: Number(it.qty) || 0, price: it.unit_price, cur: it.currency || s.currency, оформлена: s.status === "final" });
      }
    }));
    rows.sort((a, b) => new Date(b.date) - new Date(a.date));
    box.innerHTML = "";
    const left = Number(fresh.stock_qty) || 0;
    // Считаем только ОФОРМЛЕННЫЕ накладные: заказ, который ещё не
    // оформили, со склада не списан — складывать его с продажами нельзя.
    const продано = rows.filter(r => r.оформлена).reduce((s, r) => s + r.qty, 0);
    const вЗаказах = rows.filter(r => !r.оформлена).reduce((s, r) => s + r.qty, 0);
    box.append(el("div.card", { style: { padding: "10px 14px", marginBottom: "10px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" } }, [
      el("span", { text: "📦" }),
      el("strong", { text: "Осталось в остатке: " + left + " шт." }),
      rows.length ? el("span", { style: { fontWeight: "600" }, text: "· продано за всё время: " + продано + " шт." }) : null,
      вЗаказах ? el("span.muted", { style: { fontSize: "12px" }, text: "· в заказах ещё " + вЗаказах }) : null,
      el("span.muted", { style: { fontSize: "12px" }, text: "(изменить остаток — поле «Остаток» выше)" }),
    ].filter(Boolean)));
    if (!rows.length) { box.append(el("div.muted", { text: "Этот товар ещё никто не покупал", style: { fontSize: "13px", padding: "8px 0" } })); return; }
    const tb = el("tbody");
    rows.forEach(r => tb.append(el("tr", {}, [
      el("td", { text: new Date(r.date).toLocaleDateString("ru-RU") }),
      el("td", {}, [
        el("strong", { text: r.client }),
        // Заказ, который ещё не оформили, выглядел как обычная продажа —
        // и было непонятно, почему остаток не сходится.
        r.оформлена ? null : el("div.muted", { style: { fontSize: "11px" }, text: "заказ, не оформлен" }),
      ].filter(Boolean)),
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
