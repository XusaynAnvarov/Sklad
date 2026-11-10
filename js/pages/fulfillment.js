// ========================================================================
//  РАЗДЕЛ «СБОРКА И ОТПРАВКА» — три этапа после «Оформить (склад + PDF)».
//
//    Оформлен, не собран  →  Оформлен, собран, не отправлен  →  Отправлен
//
//  Каждый шаг — только ручное подтверждение в окне. Карточка меняется ТОЛЬКО
//  после ответа сервера: пока база не записала этап, на экране прежний.
//  Если заказ тем временем изменил другой сотрудник, сервер отвечает 409 —
//  показываем актуальное состояние, повторно ничего не подтверждаем.
//
//  Остатки, суммы и оплата накладной здесь не меняются.
//  Расчёты — в js/fulfillment-core.js, сервер — api/admin/fulfillment.js.
// ========================================================================
import { el, toast, modal, inputList } from "../ui.js?v=20261110b";
import { icon } from "../icons.js?v=20261110b";
import { authHeaders } from "../db.js?v=20261110b";
import { fmt } from "../fx.js?v=20261110b";
import { thumb } from "../img.js?v=20261110b";
import {
  ЭТАПЫ, ЭТАП, ДАЛЬШЕ, собратьЗаказы, счётчики, отфильтровать, история, шкала, вУчёте, номерЗаказа, итогНакладной,
} from "../fulfillment-core.js?v=20261110b";

const API = "/api/admin/fulfillment";
const ПЕРЕВОЗЧИКИ = ["BTS Express", "Fargo", "Yandex Доставка", "Узбекистон почтаси", "Автобус / попутка", "Своя доставка", "Самовывоз"];
const КЛЮЧ_ФИЛЬТРОВ = "ff_filters_v1";
const КЛЮЧ_ИМЕНИ = "ff_actor";
const ОПРОС_МС = 45000;

const меньшеДвижения = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
const ждать = (мс) => new Promise(r => setTimeout(r, меньшеДвижения() ? 0 : мс));
const хранилище = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  json(k, d) { try { return JSON.parse(sessionStorage.getItem(k)) || d; } catch { return d; } },
  setJson(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

async function запрос(method, body, query = "") {
  let r;
  try {
    r = await fetch(API + query, {
      method, cache: "no-store",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    const e = new Error("Нет связи с сервером. Этап не изменён — попробуйте ещё раз.");
    e.code = "network"; throw e;
  }
  let j = {};
  try { j = await r.json(); } catch {}
  if (!r.ok) {
    const e = new Error(j.error || (r.status === 401 ? "Нужен вход администратора" : "Ошибка сервера " + r.status));
    e.status = r.status; e.code = j.code; e.stage = j.stage; throw e;
  }
  return j;
}

const времяДаты = (d) => d ? new Date(d).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const суммаСтрокой = (t) => {
  const a = ["som", "usd", "yuan"].filter(c => Math.abs(t[c] || 0) >= (c === "som" ? 1 : 0.01)).map(c => fmt(t[c], c));
  return a.length ? a.join(" + ") : "цена не указана";
};
const штукСтрокой = (n) => {
  const v = Math.round(n * 100) / 100;
  return v.toLocaleString("ru-RU") + " шт";
};

// Число набегает от прежнего значения к новому.
function плавноЧисло(node, to) {
  const from = Number(node.dataset.v || 0);
  node.dataset.v = String(to);
  if (меньшеДвижения() || from === to) { node.textContent = String(to); return; }
  const start = performance.now(), dur = 520;
  const step = (now) => {
    const t = Math.min(1, (now - start) / dur);
    node.textContent = String(Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3))));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  node.classList.remove("ff-bump"); void node.offsetWidth; node.classList.add("ff-bump");
}

export default async function render(page, ctx) {
  const [sales, customers, products] = await Promise.all([
    ctx.db.sales.list(), ctx.db.customers.list(), ctx.db.products.list(),
  ]);
  const pmap = new Map(products.map(p => [String(p.id), p]));
  const имяТовара = (id) => pmap.get(String(id))?.name || "";

  let state = { migrated: true, since: null, rows: [], log: [] };
  let ошибкаЗагрузки = null;
  try { state = await запрос("GET"); } catch (e) { ошибкаЗагрузки = e; }

  const ф = Object.assign({ q: "", stage: "all", from: "", to: "", customer: "" }, хранилище.json(КЛЮЧ_ФИЛЬТРОВ, {}));
  if (!ЭТАПЫ.includes(ф.stage) && ф.stage !== "all") ф.stage = "all";
  // На телефоне три колонки не помещаются — показываем по одному разделу.
  const узко = () => matchMedia("(max-width: 900px)").matches;
  if (узко() && ф.stage === "all") ф.stage = "placed";
  const открыты = new Set();
  let заказы = собратьЗаказы(sales, state, customers);
  let занят = false;

  page.classList.add("ff-page", "gm-сквозной");

  // ---------- шапка ----------
  const кнопкаОбновить = el("button.btn.btn-outline.btn-sm", { title: "Обновить", onclick: () => обновить({ тихо: false }) }, [icon("refresh", { size: 15 }), el("span.ff-lbl", { text: "Обновить" })]);
  const кнопкаСтарые = el("button.btn.btn-outline.btn-sm", { onclick: () => окноСтарых() }, [icon("plus", { size: 15 }), el("span.ff-lbl", { text: "Старая накладная" })]);
  const значокЖурнала = el("button.ff-integrity", { type: "button", title: "Проверка журнала изменений" }, [icon("shield", { size: 14 }), el("span", { text: "Проверяю журнал…" })]);
  page.append(el("div.topbar.ff-top", {}, [
    el("div", {}, [
      el("h1", { text: "Сборка и отправка" }),
      el("div.sub", { text: "Каждый этап — только после вашего подтверждения. Остатки и оплата здесь не меняются." }),
    ]),
    el("div.ff-top-actions", {}, [значокЖурнала, кнопкаСтарые, кнопкаОбновить]),
  ]));

  const баннер = el("div.ff-banner");
  page.append(баннер);
  function показатьБаннер() {
    баннер.innerHTML = "";
    if (ошибкаЗагрузки) {
      баннер.append(icon("alert", { size: 18 }), el("div", {}, [el("b", { text: "Не удалось загрузить этапы. " }), el("span", { text: ошибкаЗагрузки.message })]));
      баннер.hidden = false; return;
    }
    if (state.migrated === false) {
      баннер.append(icon("database", { size: 18 }), el("div", {}, [
        el("b", { text: "Учёт сборки ещё не включён. " }),
        el("span", { text: "Выполните в Supabase → SQL Editor файл db/order-fulfillment-migration.sql. До этого этапы не сохраняются." }),
      ]));
      баннер.hidden = false; return;
    }
    баннер.hidden = true;
  }
  показатьБаннер();

  // ---------- три счётчика ----------
  const kpi = {};
  const полосаKpi = el("div.ff-kpis");
  ЭТАПЫ.forEach((s, i) => {
    const num = el("div.ff-kpi-num", { text: "0", "data-v": "0" });
    const card = el("button.ff-kpi.ff-tone-" + ЭТАП[s].tone, {
      type: "button", style: { "--i": i },
      onclick: () => { ф.stage = ф.stage === s && !узко() ? "all" : s; сохранитьФильтры(); рисовать(); },
    }, [
      el("span.ff-orb", {}, [icon(ЭТАП[s].ic, { size: 20 })]),
      el("div.ff-kpi-txt", {}, [el("div.ff-kpi-lab", { text: ЭТАП[s].short }), num]),
      el("span.ff-kpi-hint", { text: s === "placed" ? "оформлены, не собраны" : s === "packed" ? "сборка подтверждена" : "отправка подтверждена" }),
    ]);
    kpi[s] = { card, num };
    полосаKpi.append(card);
  });
  page.append(полосаKpi);

  // ---------- поиск и фильтры ----------
  const поиск = el("input.inp.ff-search", { type: "search", placeholder: "Номер, клиент, телефон, товар, трек…", value: ф.q });
  let таймерПоиска = 0;
  поиск.addEventListener("input", () => { clearTimeout(таймерПоиска); таймерПоиска = setTimeout(() => { ф.q = поиск.value; сохранитьФильтры(); рисовать(); }, 160); });
  const вкладки = el("div.ff-seg", { role: "tablist" });
  const отДаты = el("input.inp.ff-date", { type: "date", value: ф.from, title: "Оформлен с" });
  const доДаты = el("input.inp.ff-date", { type: "date", value: ф.to, title: "Оформлен по" });
  [отДаты, доДаты].forEach(i => i.addEventListener("change", () => { ф.from = отДаты.value; ф.to = доДаты.value; сохранитьФильтры(); рисовать(); }));
  const клиентСел = el("select.inp.ff-client", { title: "Клиент" });
  клиентСел.addEventListener("change", () => { ф.customer = клиентСел.value; сохранитьФильтры(); рисовать(); });
  const сброс = el("button.btn.btn-outline.btn-sm.ff-reset", {
    type: "button",
    onclick: () => { Object.assign(ф, { q: "", from: "", to: "", customer: "", stage: узко() ? ф.stage : "all" }); поиск.value = ""; отДаты.value = ""; доДаты.value = ""; клиентСел.value = ""; сохранитьФильтры(); рисовать(); },
  }, [icon("x", { size: 14 }), "Сбросить"]);
  page.append(el("div.ff-tools", {}, [
    el("div.ff-search-wrap", {}, [icon("search", { size: 16 }), поиск]),
    вкладки,
    el("div.ff-tools-row", {}, [отДаты, el("span.ff-dash", { text: "—" }), доДаты, клиентСел, сброс]),
  ]));

  function сохранитьФильтры() { хранилище.setJson(КЛЮЧ_ФИЛЬТРОВ, ф); }

  function заполнитьКлиентов() {
    const есть = new Map();
    заказы.forEach(z => { if (z.customer_id) есть.set(String(z.customer_id), z.клиент); });
    const список = [...есть.entries()].sort((a, b) => a[1].localeCompare(b[1], "ru"));
    клиентСел.innerHTML = "";
    клиентСел.append(el("option", { value: "", text: "Все клиенты" }));
    список.forEach(([id, name]) => клиентСел.append(el("option", { value: id, text: name })));
    if (ф.customer && !есть.has(String(ф.customer))) ф.customer = "";
    клиентСел.value = ф.customer;
  }

  // ---------- доска ----------
  const доска = el("div.ff-board");
  const колонки = {};
  ЭТАПЫ.forEach(s => {
    const cnt = el("span.ff-col-count", { text: "0" });
    const list = el("div.ff-list");
    const col = el("section.ff-col.ff-tone-" + ЭТАП[s].tone, { "data-stage": s }, [
      el("header.ff-col-h", {}, [el("span.ff-dot"), el("span", { text: ЭТАП[s].label }), cnt]),
      list,
    ]);
    колонки[s] = { col, list, cnt };
    доска.append(col);
  });
  page.append(доска);

  // ---------- карточка ----------
  function шкалаУзел(stage) {
    const wrap = el("div.ff-track", { "data-stage": stage });
    шкала(stage).forEach((p, i) => {
      if (i > 0) wrap.append(el("span.ff-line" + (p.state !== "todo" ? ".on" : ""), {}, [el("i")]));
      wrap.append(el("span.ff-node.ff-" + p.state + ".ff-n-" + p.stage, { title: ЭТАП[p.stage].step }, [
        el("span.ff-node-ic", {}, [icon(p.state === "done" ? "check" : ЭТАП[p.stage].ic, { size: 14, stroke: p.state === "done" ? 2.4 : 1.8 })]),
        el("span.ff-node-lab", { text: ЭТАП[p.stage].step }),
      ]));
    });
    return wrap;
  }

  function карточка(z, i) {
    const тон = ЭТАП[z.stage].tone;
    const дальше = ДАЛЬШЕ[z.stage];
    const card = el("article.ff-card.ff-tone-" + тон, { "data-id": z.id, style: { "--i": Math.min(i, 12) } });
    if (открыты.has(z.id)) card.classList.add("open");

    const кнопкаДальше = дальше
      ? el("button.btn.btn-primary.btn-sm.ff-next", { type: "button", onclick: (e) => { e.stopPropagation(); подтвердить(z, дальше.action); } },
          [icon(z.stage === "placed" ? "package" : "truck", { size: 15 }), дальше.label])
      : el("span.ff-done-chip", {}, [icon("check", { size: 14, stroke: 2.4 }), "Отправлен " + времяДаты(z.row?.shipped_at)]);
    const кнопкаПодробнее = el("button.btn.btn-outline.btn-sm.ff-more", {
      type: "button", "aria-expanded": String(открыты.has(z.id)),
      onclick: (e) => { e.stopPropagation(); раскрыть(card, z); },
    }, [el("span", { text: "Подробнее" }), icon("arrow-up-right", { size: 13, class: "ff-chev" })]);

    card.append(
      el("div.ff-card-top", {}, [
        el("span.ff-orb", {}, [icon(ЭТАП[z.stage].ic, { size: 19 })]),
        el("div.ff-card-title", {}, [
          el("div.ff-num", { text: "№ " + z.номер }),
          el("div.ff-client", { text: z.клиент, title: z.клиент }),
        ]),
        el("span.ff-chip", { text: ЭТАП[z.stage].step }),
      ]),
      el("div.ff-meta", {}, [
        el("span", {}, [icon("clock", { size: 13 }), времяДаты(z.дата)]),
        el("span", {}, [icon("box", { size: 13 }), `${штукСтрокой(z.штук)} · ${z.позиций} поз.`]),
        el("span.ff-sum", { text: суммаСтрокой(z.totals) }),
      ]),
      шкалаУзел(z.stage),
      el("div.ff-actions", {}, [кнопкаПодробнее, кнопкаДальше]),
      el("div.ff-details", {}, [el("div.ff-details-in")]),
    );
    card.addEventListener("click", (e) => {
      if (e.target.closest("button, a, input, select, textarea")) return;
      раскрыть(card, z);
    });
    if (открыты.has(z.id)) наполнитьПодробности(card, z);
    return card;
  }

  function раскрыть(card, z) {
    const станет = !card.classList.contains("open");
    if (станет) { открыты.add(z.id); наполнитьПодробности(card, z); } else открыты.delete(z.id);
    card.classList.toggle("open", станет);
    card.querySelector(".ff-more")?.setAttribute("aria-expanded", String(станет));
    const lab = card.querySelector(".ff-more span"); if (lab) lab.textContent = станет ? "Свернуть" : "Подробнее";
  }

  function наполнитьПодробности(card, z) {
    const box = card.querySelector(".ff-details-in");
    box.innerHTML = "";
    // Состав заказа
    const состав = el("div.ff-items");
    (z.sale.items || []).forEach(it => {
      const p = pmap.get(String(it.product_id));
      const cur = it.currency || z.sale.currency || "som";
      const фото = p?.photo_url
        ? el("img.ff-thumb", { src: thumb(p.photo_url, 100), alt: "", loading: "lazy", decoding: "async" })
        : el("span.ff-thumb.ff-thumb-empty", {}, [icon("image", { size: 16 })]);
      состав.append(el("div.ff-item", {}, [
        фото,
        el("div.ff-item-name", {}, [
          el("div", { text: p?.name || "Товар удалён" }),
          (p?.sku || p?.category) ? el("div.ff-item-sub", { text: [p?.sku ? "Арт. " + p.sku : "", p?.category || ""].filter(Boolean).join(" · ") }) : null,
        ]),
        el("div.ff-item-qty", {}, [
          el("b", { text: "× " + (Number(it.qty) || 0).toLocaleString("ru-RU") }),
          Number(it.unit_price) > 0 ? el("span", { text: fmt(it.unit_price, cur) }) : null,
        ]),
      ]));
    });
    box.append(el("h4.ff-h", {}, [icon("clipboard", { size: 15 }), "Состав заказа"]), состав);

    // Доставка
    if (z.stage === "shipped" && z.row) {
      box.append(el("h4.ff-h", {}, [icon("truck", { size: 15 }), "Доставка"]), el("div.ff-ship", {}, [
        el("div", {}, [el("span", { text: "Перевозчик" }), el("b", { text: z.row.carrier || "не указан" })]),
        el("div", {}, [el("span", { text: "Номер накладной" }), el("b", { text: z.row.tracking || "не указан" })]),
        z.row.ship_comment ? el("div.ff-ship-wide", {}, [el("span", { text: "Комментарий" }), el("b", { text: z.row.ship_comment })]) : null,
      ]));
    }

    // История статусов
    const лента = el("ol.ff-history");
    история(z).forEach((e, i) => {
      лента.append(el("li.ff-ev.ff-ev-" + e.kind, { style: { "--i": i } }, [
        el("span.ff-ev-dot"),
        el("div.ff-ev-body", {}, [
          el("div.ff-ev-title", {}, [el("b", { text: e.title }), el("time", { text: времяДаты(e.at) })]),
          e.text ? el("div.ff-ev-text", { text: e.text }) : null,
          e.reason ? el("div.ff-ev-reason", { text: "Причина: " + e.reason }) : null,
          e.who ? el("div.ff-ev-who", {}, [icon("user", { size: 12 }), e.who]) : null,
        ]),
      ]));
    });
    box.append(el("h4.ff-h", {}, [icon("history", { size: 15 }), "История статусов"]), лента);

    if (z.stage !== "placed") {
      box.append(el("div.ff-fix", {}, [
        el("button.btn.btn-outline.btn-sm", { type: "button", onclick: (e) => { e.stopPropagation(); подтвердить(z, "correct"); } },
          [icon("undo", { size: 14 }), "Исправить статус…"]),
        el("span.ff-fix-note", { text: "Ошибочное подтверждение откатывается на шаг назад с причиной — запись остаётся в журнале." }),
      ]));
    }
  }

  // ---------- отрисовка с перемещением ----------
  function рисовать({ перенос = false } = {}) {
    // FLIP: запомнить, где карточки были, перерисовать, плавно довести.
    const были = new Map();
    if (перенос && !меньшеДвижения()) доска.querySelectorAll(".ff-card").forEach(n => были.set(n.dataset.id, n.getBoundingClientRect()));

    const n = счётчики(заказы);
    ЭТАПЫ.forEach(s => {
      плавноЧисло(kpi[s].num, n[s]);
      kpi[s].card.classList.toggle("active", ф.stage === s);
      kpi[s].card.setAttribute("aria-pressed", String(ф.stage === s));
    });
    if (ctx.setNavBadge) ctx.setNavBadge("fulfillment", n.placed);

    вкладки.innerHTML = "";
    const варианты = узко() ? ЭТАПЫ : ["all", ...ЭТАПЫ];
    варианты.forEach(s => {
      const b = el("button", { type: "button", role: "tab", "aria-selected": String(ф.stage === s), text: s === "all" ? "Все" : ЭТАП[s].step + " · " + n[s] });
      if (ф.stage === s) b.classList.add("active");
      b.addEventListener("click", () => { ф.stage = s; сохранитьФильтры(); рисовать(); });
      вкладки.append(b);
    });
    заполнитьКлиентов();

    const видно = отфильтровать(заказы, { ...ф, stage: "all" }, имяТовара);
    доска.classList.toggle("ff-one", ф.stage !== "all");
    ЭТАПЫ.forEach(s => {
      const { col, list, cnt } = колонки[s];
      col.hidden = ф.stage !== "all" && ф.stage !== s;
      const свои = видно.filter(z => z.stage === s);
      cnt.textContent = String(свои.length);
      list.innerHTML = "";
      if (!свои.length) {
        list.append(el("div.ff-empty", {}, [
          icon(ЭТАП[s].ic, { size: 26 }),
          el("p", { text: заказы.some(z => z.stage === s) ? "Ничего не найдено по фильтрам" : s === "placed" ? "Все заказы собраны" : s === "packed" ? "Нет заказов, ждущих отправки" : "Отправленных пока нет" }),
        ]));
      }
      свои.forEach((z, i) => list.append(карточка(z, i)));
    });

    if (были.size) {
      доска.querySelectorAll(".ff-card").forEach(node => {
        const r0 = были.get(node.dataset.id);
        if (!r0) { node.classList.add("ff-fresh"); return; }
        const r1 = node.getBoundingClientRect();
        const dx = r0.left - r1.left, dy = r0.top - r1.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        node.classList.add("ff-moving");
        node.style.transform = `translate(${dx}px, ${dy}px)`;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          node.style.transition = "transform 520ms var(--e-out)";
          node.style.transform = "";
          setTimeout(() => { node.style.transition = ""; node.classList.remove("ff-moving"); }, 560);
        }));
      });
    } else if (!меньшеДвижения()) {
      доска.querySelectorAll(".ff-card").forEach(node => node.classList.add("ff-enter"));
    }
  }

  // ---------- синхронизация ----------
  const отпечаток = (st) => (st.rows || []).map(r => r.sale_id + ":" + r.version).sort().join("|");
  async function обновить({ тихо = true, перенос = true } = {}) {
    try {
      const свежее = await запрос("GET");
      const было = отпечаток(state);
      state = свежее; ошибкаЗагрузки = null;
      показатьБаннер();
      if (было === отпечаток(свежее) && тихо) return false;
      заказы = собратьЗаказы(sales, state, customers);
      рисовать({ перенос });
      if (тихо && было !== отпечаток(свежее)) toast("Этапы обновлены: изменения другого сотрудника", "ok");
      return true;
    } catch (e) {
      if (!тихо) toast(e.message, "err");
      return false;
    }
  }

  async function проверитьЖурнал() {
    if (state.migrated === false || ошибкаЗагрузки) { значокЖурнала.hidden = true; return; }
    значокЖурнала.hidden = false;
    try {
      const v = await запрос("GET", null, "?verify=1");
      значокЖурнала.className = "ff-integrity " + (v.ok ? "ok" : "bad");
      значокЖурнала.lastChild.textContent = v.ok ? `Журнал защищён · ${v.checked}` : `Журнал нарушен · ${v.problems.length}`;
      значокЖурнала.onclick = () => modal({
        title: v.ok ? "Журнал изменений цел" : "Найдены нарушения журнала",
        body: el("div.ff-modal-text", {}, [
          el("p", { text: v.ok
            ? `Проверено записей: ${v.checked}. Каждая запись сцеплена с предыдущей, правка и удаление запрещены базой, этапы заказов совпадают с журналом.`
            : "Запись журнала изменена, вырезана или этап заказа поменяли в обход подтверждения. Ниже — что именно не сошлось." }),
          ...(v.problems || []).slice(0, 30).map(p => el("div.ff-problem", { text: (p.kind === "hash" ? "Запись журнала #" + p.log_id : "Этап заказа") + " · № " + номерЗаказа(p.sale_id) })),
        ]),
        actions: [{ label: "Понятно", kind: "btn-primary", onClick: c => c() }],
      });
    } catch {
      значокЖурнала.className = "ff-integrity";
      значокЖурнала.lastChild.textContent = "Журнал не проверен";
    }
  }

  // ---------- подтверждение этапа ----------
  const ТЕКСТ = {
    pack: { title: "Подтверждение сборки", q: "Вы подтверждаете, что все товары этого заказа собраны и проверены?", ok: "Подтвердить сборку", done: "Сборка подтверждена" },
    ship: { title: "Подтверждение отправки", q: "Вы подтверждаете, что этот заказ действительно передан на отправку?", ok: "Подтвердить отправку", done: "Отправка подтверждена" },
    correct: { title: "Исправление статуса", q: "Статус вернётся на шаг назад. Исправление и причина навсегда останутся в истории заказа.", ok: "Исправить статус", done: "Статус исправлен" },
    track: { title: "Взять в учёт", q: "Накладная оформлена до запуска учёта. Добавить её в очередь сборки?", ok: "Взять в учёт", done: "Накладная в очереди сборки" },
  };

  function подтвердить(z, action, { послеУспеха } = {}) {
    if (занят) return;
    const T = ТЕКСТ[action];
    const кто = el("input.inp", { value: хранилище.get(КЛЮЧ_ИМЕНИ, ""), placeholder: "Имя сотрудника", maxlength: "80", autocomplete: "name" });
    const ошибка = el("div.ff-err", { role: "alert", hidden: true });
    const поля = [];
    let перевозчик, трек, коммент, причина, уведомить;
    if (action === "ship") {
      const прежние = (state.rows || []).map(r => r.carrier).filter(Boolean);
      перевозчик = inputList([...ПЕРЕВОЗЧИКИ, ...прежние], { placeholder: "Например, BTS Express", maxlength: "120" });
      трек = el("input.inp", { placeholder: "Номер транспортной накладной", maxlength: "120" });
      коммент = el("textarea.inp", { rows: "2", placeholder: "Например: 3 коробки, передал водителю Алишеру", maxlength: "500" });
      поля.push(
        el("div.ff-grid2", {}, [поле("Транспортная компания", перевозчик), поле("Номер накладной", трек)]),
        поле("Комментарий (только для склада)", коммент),
      );
    }
    if (action === "correct") {
      const куда = z.stage === "shipped" ? "packed" : "placed";
      поля.push(el("div.ff-step-change", {}, [
        el("span.ff-chip.ff-tone-" + ЭТАП[z.stage].tone, { text: ЭТАП[z.stage].step }),
        el("span.ff-arrow", { text: "→", "aria-label": "станет" }),
        el("span.ff-chip.ff-tone-" + ЭТАП[куда].tone, { text: ЭТАП[куда].label }),
      ]));
      причина = el("textarea.inp", { rows: "3", placeholder: "Обязательно: почему подтверждение было ошибочным", maxlength: "500" });
      поля.push(поле("Причина исправления", причина));
    }
    if (action === "pack" || action === "ship") {
      уведомить = el("input", { type: "checkbox", checked: "checked" });
      поля.push(el("label.ff-check", {}, [уведомить, el("span", { text: "Сообщить клиенту в Telegram (если бот у него подключён)" })]));
    }

    const тело = el("div.ff-confirm", {}, [
      el("div.ff-confirm-head.ff-tone-" + ЭТАП[action === "ship" ? "shipped" : action === "pack" ? "packed" : z.stage].tone, {}, [
        el("span.ff-orb", {}, [icon(action === "ship" ? "truck" : action === "pack" ? "package" : action === "track" ? "plus" : "undo", { size: 20 })]),
        el("div", {}, [
          el("div.ff-num", { text: "№ " + z.номер + " · " + z.клиент }),
          el("div.ff-confirm-sub", { text: `${штукСтрокой(z.штук)} · ${z.позиций} поз. · ${суммаСтрокой(z.totals)}` }),
        ]),
      ]),
      el("p.ff-q", { text: T.q }),
      ...поля,
      поле("Кто подтверждает", кто),
      ошибка,
    ]);

    const m = modal({
      title: T.title, body: тело,
      actions: [
        { label: "Отмена", kind: "btn-outline", onClick: c => { if (!занят) c(); } },
        { label: T.ok, kind: "btn-primary", onClick: () => отправить() },
      ],
    });
    const кнопка = m.content.parentElement.querySelector(".modal-foot .btn-primary");
    setTimeout(() => (action === "correct" ? причина : кто.value ? (трек || кнопка) : кто)?.focus?.(), 60);

    async function отправить() {
      if (занят) return;
      ошибка.hidden = true;
      const имя = кто.value.trim();
      if (!имя) return показать("Укажите, кто подтверждает этап.", кто);
      if (action === "correct" && причина.value.trim().length < 3) return показать("Опишите причину исправления (не короче 3 символов).", причина);
      занят = true;
      кнопка.disabled = true; кнопка.classList.add("ff-loading");
      const текстКнопки = кнопка.textContent; кнопка.textContent = "Сохраняю…";
      try {
        const ответ = await запрос("POST", {
          sale_id: z.id, action, expected: action === "track" ? null : z.stage, actor: имя,
          reason: причина?.value, carrier: перевозчик?.value, tracking: трек?.value, comment: коммент?.value,
          notify: уведомить ? уведомить.checked : false,
        });
        хранилище.set(КЛЮЧ_ИМЕНИ, имя);
        m.close();
        занят = false;
        await послеПерехода(z, action, ответ);
        if (послеУспеха) послеУспеха();
      } catch (e) {
        занят = false;
        кнопка.disabled = false; кнопка.classList.remove("ff-loading"); кнопка.textContent = текстКнопки;
        if (e.status === 409) {
          m.close();
          toast(e.message, "err");
          await обновить({ тихо: false, перенос: true });
          return;
        }
        показать(e.message);
      }
    }
    function показать(текст, поле) {
      ошибка.textContent = текст; ошибка.hidden = false;
      ошибка.classList.remove("ff-shake"); void ошибка.offsetWidth; ошибка.classList.add("ff-shake");
      поле?.focus?.();
    }
  }

  function поле(подпись, узел) {
    return el("label.ff-field", {}, [el("span", { text: подпись }), узел]);
  }

  // Успех: сначала шкала на карточке доходит до нового этапа и ставит
  // галочку, затем карточка переезжает в свой раздел.
  async function послеПерехода(z, action, ответ) {
    const card = доска.querySelector(`.ff-card[data-id="${CSS.escape(String(z.id))}"]`);
    const куда = ответ?.row?.stage;
    if (card && куда && action !== "correct" && action !== "track") {
      card.classList.add("ff-success");
      const новая = шкалаУзел(куда);
      новая.classList.add("ff-advance");
      const линии = новая.querySelectorAll(".ff-line.on");
      линии[линии.length - 1]?.classList.add("ff-new");
      const готовые = новая.querySelectorAll(".ff-node.ff-done");
      готовые[готовые.length - 1]?.classList.add("ff-new-done");
      новая.querySelector(".ff-node.ff-current")?.classList.add("ff-new-cur");
      card.querySelector(".ff-track")?.replaceWith(новая);
      await ждать(700);
    }
    const T = ТЕКСТ[action];
    toast(T.done + (ответ?.notified ? " · клиент уведомлён" : ""), "ok");
    // Этап из ответа сервера, журнал — свежий с сервера.
    if (ответ?.row) {
      const rows = (state.rows || []).filter(r => String(r.sale_id) !== String(z.id));
      rows.push(ответ.row);
      state = { ...state, rows };
    }
    const ок = await обновить({ тихо: false, перенос: true });
    if (!ок) { заказы = собратьЗаказы(sales, state, customers); рисовать({ перенос: true }); }
    const нов = доска.querySelector(`.ff-card[data-id="${CSS.escape(String(z.id))}"]`);
    if (нов) { нов.classList.add("ff-landed"); setTimeout(() => нов.classList.remove("ff-landed"), 1400); }
    проверитьЖурнал();
  }

  // ---------- старые накладные ----------
  function окноСтарых() {
    if (state.migrated === false) { toast("Сначала примените миграцию учёта сборки", "err"); return; }
    const есть = new Set((state.rows || []).map(r => String(r.sale_id)));
    const cmap = new Map(customers.map(c => [String(c.id), c.name]));
    const кандидаты = sales
      .filter(s => s.status === "final" && s.source !== "refund" && !вУчёте(s, state.since, есть.has(String(s.id))))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    const q = el("input.inp", { type: "search", placeholder: "Номер или клиент" });
    const список = el("div.ff-old-list");
    const нарисовать = () => {
      const t = q.value.trim().toLowerCase().replace(/^№\s*/, "");
      список.innerHTML = "";
      const видно = кандидаты.filter(s => !t || номерЗаказа(s.id).toLowerCase().includes(t) || (cmap.get(String(s.customer_id)) || s.order_from?.name || "").toLowerCase().includes(t)).slice(0, 60);
      if (!видно.length) { список.append(el("div.ff-empty", {}, [el("p", { text: "Нет подходящих накладных" })])); return; }
      видно.forEach(s => {
        const { totals, штук } = итогНакладной(s);
        список.append(el("div.ff-old", {}, [
          el("div", {}, [
            el("b", { text: "№ " + номерЗаказа(s.id) + " · " + (cmap.get(String(s.customer_id)) || s.order_from?.name || "Без клиента") }),
            el("div.ff-item-sub", { text: `${времяДаты(s.date)} · ${штукСтрокой(штук)} · ${суммаСтрокой(totals)}` }),
          ]),
          el("button.btn.btn-outline.btn-sm", { type: "button", onclick: () => {
            m.close();
            const z = { id: s.id, номер: номерЗаказа(s.id), клиент: cmap.get(String(s.customer_id)) || s.order_from?.name || "Без клиента", stage: "placed", штук, позиций: (s.items || []).length, totals };
            подтвердить(z, "track");
          } }, [icon("plus", { size: 14 }), "В учёт"]),
        ]));
      });
    };
    q.addEventListener("input", нарисовать);
    const m = modal({
      title: "Старая накладная в учёт сборки", wide: true,
      body: el("div.ff-old-wrap", {}, [
        el("p.ff-q", { text: "В очередь автоматически попадают накладные, оформленные после запуска учёта. Более ранние можно добавить вручную — по одной." }),
        q, список,
      ]),
      actions: [{ label: "Закрыть", kind: "btn-outline", onClick: c => c() }],
    });
    нарисовать();
  }

  // ---------- старт ----------
  рисовать();
  проверитьЖурнал();

  // Другой сотрудник мог подтвердить этап — тихо сверяемся, пока раздел открыт.
  const таймер = setInterval(() => {
    if (!page.isConnected) { clearInterval(таймер); return; }
    if (document.visibilityState !== "visible" || занят || document.querySelector(".modal-overlay")) return;
    обновить({ тихо: true, перенос: true });
  }, ОПРОС_МС);
  let ширина = узко();
  const наРесайз = () => {
    if (!page.isConnected) { removeEventListener("resize", наРесайз); return; }
    const теперь = узко();
    if (теперь === ширина) return;
    ширина = теперь;
    if (теперь && ф.stage === "all") ф.stage = "placed";
    рисовать();
  };
  addEventListener("resize", наРесайз);
}
