// ========================================================================
//  СТРАНИЦА «КЛИЕНТЫ» + КАРТОЧКА КЛИЕНТА (оборот, долг, оплаты, накладные)
// ========================================================================
import { el, $, toast, modal, confirmDialog, field, input, select, inputList, lightbox, showLoader, hideLoader } from "../ui.js?v=20260802c";
import { fmt, toUSD, convert, CUR, sumByCur } from "../fx.js?v=20260802c";
import { openEditor, buildText, deleteSale } from "./sales.js?v=20260802c";
import { exportCustomerInvoice } from "../xlsx-export.js?v=20260802c";
import { placeholder as placeholderImg } from "./products.js?v=20260802c";
import { sendInvoice, sendInvoicePDF, sendToClient, sendInvoicePDFToClient, sendActToClient, sendActToChannel, logoutClientFromBot } from "../telegram.js?v=20260802c";
import { authHeaders } from "../db.js?v=20260802c";
import { icon } from "../icons.js?v=20260802c";

const saleTotal = (s) => (s.items || []).reduce((t, i) => t + i.qty * i.unit_price, 0);
const saleUSD = (s) => (s.items || []).reduce((t, i) => t + toUSD(i.qty * i.unit_price, s.currency), 0);
const payUSD = (p) => toUSD(p.amount, p.currency);
// накладная считается оплаченной, если все её позиции оплачены
const isPaid = (s) => (s.items || []).length > 0 && s.items.every(i => i.paid);

// строка сумм по валютам (без конвертации): "6 060 000 сум + $40 + ¥10"
function curStr(o) {
  const a = [];
  ["som", "usd", "yuan"].forEach(c => { if (Math.abs(o[c]) >= (c === "som" ? 1 : 0.01)) a.push(fmt(o[c], c)); });
  return a.length ? a.join("  +  ") : "0";
}
// старый долг клиента по валютам
function openingDebt(customer) {
  const o = customer && customer.opening_debt || {};
  return { som: Number(o.som) || 0, usd: Number(o.usd) || 0, yuan: Number(o.yuan) || 0 };
}
// долг по валютам клиента: ВСЕ накладные + старый долг − оплаты.
// (оплата — единый источник истины; флаг «оплачено» на накладной не учитываем — статус по оплатам)
function debtByCur(custSales, custPays, customer) {
  const d = { som: 0, usd: 0, yuan: 0 };
  custSales.forEach(s => (s.items || []).forEach(it => { const c = it.currency || s.currency; if (d[c] !== undefined) d[c] += it.qty * it.unit_price; }));
  const od = openingDebt(customer);
  ["som", "usd", "yuan"].forEach(c => d[c] += od[c]);
  (custPays || []).forEach(p => { if (d[p.currency] !== undefined) d[p.currency] -= Number(p.amount) || 0; });
  return d;
}
const onlyPositive = (o) => ({ som: Math.max(0, o.som), usd: Math.max(0, o.usd), yuan: Math.max(0, o.yuan) });

// статус каждой накладной по оплатам (оплаты гасят накладные старые-первыми, по валютам).
// Флаг «оплачено» не учитываем → статус меняется автоматически при оплате. { saleId: 'paid'|'partial'|'debt' }
function coverageMap(custSales, custPays, openDebt) {
  const pool = { som: 0, usd: 0, yuan: 0 };
  (custPays || []).forEach(p => { if (pool[p.currency] !== undefined) pool[p.currency] += Number(p.amount) || 0; });
  // старый долг (до системы) гасится оплатами ПЕРВЫМ — он самый старый
  const od = openDebt || {};
  ["som", "usd", "yuan"].forEach(c => { pool[c] -= Math.max(0, Number(od[c]) || 0); if (pool[c] < 0) pool[c] = 0; });
  const asc = [...custSales].sort((a, b) => new Date(a.date) - new Date(b.date));
  const map = {};
  for (const s of asc) {
    const need = { som: 0, usd: 0, yuan: 0 };
    (s.items || []).forEach(it => { const c = it.currency || s.currency; if (need[c] !== undefined) need[c] += it.qty * it.unit_price; });
    let anyNeed = false, allMet = true, tookAny = false;
    ["som", "usd", "yuan"].forEach(c => {
      if (need[c] <= 0.0001) return; anyNeed = true;
      const take = Math.min(pool[c], need[c]); pool[c] -= take;
      if (take > 0.0001) tookAny = true;
      if (take < need[c] - 0.01) allMet = false;
    });
    map[s.id] = !anyNeed ? "paid" : allMet ? "paid" : tookAny ? "partial" : "debt";
  }
  return map;
}

export default async function render(page, ctx) {
  const id = (location.hash.match(/[?&]id=([^&]+)/) || [])[1];
  if (id) return renderCard(page, ctx, decodeURIComponent(id));
  return renderList(page, ctx);
}

// ----------------------- СПИСОК -----------------------
async function renderList(page, ctx) {
  const [list, sales, payments] = await Promise.all([ctx.db.customers.list(), ctx.db.sales.list(), ctx.db.payments.list()]);

  const sub = el("div.sub", { text: `Всего: ${list.length}` });
  page.append(el("div.topbar", {}, [
    el("div", {}, [el("h1", { text: "Клиенты" }), sub]),
    el("button.btn.btn-primary", { onclick: () => openForm(ctx, null, list) }, [icon("plus", { size: 16 }), "Добавить клиента"]),
  ]));

  if (!list.length) { page.append(el("div.empty", {}, [el("div.em-ic", {}, [icon("user", { size: 40 })]), el("p", { text: "Клиентов пока нет" })])); return; }

  // поиск по имени и по номеру телефона (учитываются все номера клиента)
  const search = input({ placeholder: "Поиск: имя или номер телефона…", style: { maxWidth: "340px" } });
  page.append(el("div.toolbar", {}, [search]));
  const phonesOf = (c) => (Array.isArray(c.phones) && c.phones.length) ? c.phones : (c.contact ? [c.contact] : []);

  const tbody = el("tbody");
  function draw(rows) {
  tbody.innerHTML = "";
  sub.textContent = rows.length === list.length ? `Всего: ${list.length}` : `Найдено: ${rows.length} из ${list.length}`;
  if (!rows.length) tbody.append(el("tr", {}, [el("td", { colSpan: 5, style: { textAlign: "center", padding: "22px", color: "var(--muted)" }, text: "Никого не нашли — измените запрос" })]));
  rows.forEach(c => {
    const cs = sales.filter(s => s.customer_id === c.id);
    const cp = payments.filter(p => p.customer_id === c.id);
    const raw = debtByCur(cs, cp, c);
    const owe = onlyPositive(raw), adv = onlyPositive({ som: -raw.som, usd: -raw.usd, yuan: -raw.yuan });
    const debtTxt = curStr(owe), advTxt = curStr(adv);
    const badge = debtTxt !== "0" ? el("span.badge.order", { text: debtTxt })
      : advTxt !== "0" ? el("span.badge.ok", { text: "Аванс " + advTxt })
        : el("span.badge.muted", { text: "0" });
    tbody.append(el("tr", { style: { cursor: "pointer" }, onclick: () => ctx.navigate("customers?id=" + c.id) }, [
      el("td", {}, [el("strong", { text: c.name })]),
      el("td", { text: (() => { const ns = phonesOf(c); return ns.length ? ns[0] + (ns.length > 1 ? " +" + (ns.length - 1) : "") : "—"; })() }),
      el("td", { text: cs.length + " накл." }),
      el("td", {}, [badge]),
      el("td.right", {}, [el("div.row-actions", {}, [
        el("button.btn.btn-outline.btn-sm", { text: "Открыть", onclick: (e) => { e.stopPropagation(); ctx.navigate("customers?id=" + c.id); } }),
        el("button.btn.btn-danger.btn-sm.btn-icon", { title: "Удалить", onclick: (e) => { e.stopPropagation(); confirmDialog("Удалить клиента?", async () => { await ctx.db.customers.remove(c.id); toast("Удалено", "ok"); ctx.refresh(); }); } }, [icon("trash", { size: 16 })]),
      ])]),
    ]));
  });
  }

  search.addEventListener("input", () => {
    const q = (search.value || "").trim().toLowerCase();
    if (!q) return draw(list);
    const qd = q.replace(/\D/g, ""); // цифры запроса — поиск по номеру телефона
    draw(list.filter(c =>
      (c.name || "").toLowerCase().includes(q) ||
      (!!qd && phonesOf(c).some(n => String(n || "").replace(/\D/g, "").includes(qd)))));
  });
  draw(list);

  page.append(el("div", { style: { overflowX: "auto" } }, [el("table.tbl", {}, [
    el("thead", {}, [el("tr", {}, ["Имя", "Контакт", "Накладные", "Долг", ""].map(h => el("th", { text: h })))]),
    tbody,
  ])]));
}

function debtBadge(usd) {
  if (usd > 0.5) return el("span.badge.order", { text: "Долг " + fmt(usd, "usd") });
  if (usd < -0.5) return el("span.badge.ok", { text: "Аванс " + fmt(-usd, "usd") });
  return el("span.badge.muted", { text: "0" });
}

// ----------------------- КАРТОЧКА КЛИЕНТА -----------------------
async function renderCard(page, ctx, id) {
  const [customers, products, allSales, allPay] = await Promise.all([
    ctx.db.customers.list(), ctx.db.products.list(), ctx.db.sales.list(), ctx.db.payments.list(),
  ]);
  const c = customers.find(x => x.id === id);
  if (!c) { page.append(el("div.empty", {}, [el("p", { text: "Клиент не найден" })])); return; }

  const sales = allSales.filter(s => s.customer_id === id).sort((a, b) => new Date(b.date) - new Date(a.date));
  const payments = allPay.filter(p => p.customer_id === id).sort((a, b) => new Date(b.date) - new Date(a.date));
  const finals = sales; // считаем все накладные клиента

  const pmap = Object.fromEntries(products.map(p => [p.id, p]));
  // по валютам, без конвертации. Долг = неоплаченное − оплаты (не ниже 0);
  // Оплачено = Оборот − Долг → всегда Оплачено + Долг = Оборот.
  const turn = { som: 0, usd: 0, yuan: 0 }, unpaid = { som: 0, usd: 0, yuan: 0 }, pay = { som: 0, usd: 0, yuan: 0 };
  finals.forEach(s => (s.items || []).forEach(it => {
    const cur = it.currency || s.currency, v = it.qty * it.unit_price;
    if (turn[cur] === undefined) return;
    turn[cur] += v;
    if (!it.paid) unpaid[cur] += v;
  }));
  payments.forEach(p => { if (pay[p.currency] !== undefined) pay[p.currency] += p.amount; });
  const od = openingDebt(c); // старый долг
  const debt = { som: 0, usd: 0, yuan: 0 }, paidObj = { som: 0, usd: 0, yuan: 0 }, advance = { som: 0, usd: 0, yuan: 0 };
  // Долг = Оборот + старый долг − оплаты. Если оплат больше — это АВАНС (мы должны клиенту).
  // При новой покупке Оборот растёт → аванс автоматически уменьшается.
  ["som", "usd", "yuan"].forEach(cc => {
    const raw = turn[cc] + od[cc] - pay[cc];
    debt[cc] = Math.max(0, raw);
    advance[cc] = Math.max(0, -raw);
    paidObj[cc] = pay[cc];
  });
  const lastPay = payments[0];

  // --- шапка ---
  const allNums = (Array.isArray(c.phones) && c.phones.length) ? c.phones : (c.contact ? [c.contact] : []);
  const subText = [allNums.join(", "), c.tg_chat_id ? "chat: " + c.tg_chat_id : null, c.note].filter(Boolean).join(" · ");
  // «К списку» — отдельной строкой сверху, чтобы шапка не была высокой (иначе под кнопками большой пустой отступ)
  page.append(el("button.btn.btn-outline.btn-sm", { onclick: () => ctx.navigate("customers"), style: { marginBottom: "12px" } }, [icon("arrow-left", { size: 15 }), "К списку"]));
  page.append(el("div.topbar", {}, [
    el("div", {}, [
      el("h1", { text: c.name }),
      ...(subText ? [el("div.sub", { text: subText })] : []),
    ]),
    el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } }, [
      el("button.btn.btn-outline", { onclick: () => openForm(ctx, c, customers) }, [icon("edit", { size: 16 }), "Изменить"]),
      el("button.btn.btn-outline", { title: "Привязать Telegram клиента (если он написал боту, но не подвязался)", onclick: () => linkTelegram(ctx, c) }, ["🔗 Telegram"]),
      el("button.btn.btn-outline", { title: "Акт сверки: оплаты и отгрузки по датам, с PDF", onclick: () => openActSverki(ctx, c, sales, payments) }, ["📋 Акт сверки"]),
      el("button.btn.btn-ok", { onclick: () => openPayment(ctx, c) }, [icon("plus", { size: 16 }), "Оплата"]),
      el("button.btn.btn-primary", { onclick: () => openEditor(ctx, null, customers, products, c.id) }, [icon("plus", { size: 16 }), "Накладная"]),
      el("button.btn.btn-danger", { onclick: () => confirmDialog("Удалить клиента «" + c.name + "»? Он также выйдет из Telegram-бота. Накладные сохранятся, но без привязки к нему.", async () => {
        const chatIds = [c.tg_chat_id, ...(Array.isArray(c.tg_chat_ids) ? c.tg_chat_ids : [])].map(x => String(x || "")).filter(Boolean);
        await ctx.db.customers.remove(c.id);
        if (chatIds.length) { try { await logoutClientFromBot([...new Set(chatIds)]); } catch {} } // выгнать из бота + уведомить
        toast("Клиент удалён", "ok"); ctx.navigate("customers");
      }) }, [icon("trash", { size: 16 }), "Удалить"]),
    ]),
  ]));

  // --- статистика (по валютам, без конвертации) ---
  page.append(el("div.stat-grid", {}, [
    statCard("Оборот", curStr(turn), "по валютам", "wallet", true),
    statCard("Оплачено", curStr(paidObj), "по валютам", "check"),
    statCardDebt(debt, advance),
    statCard("Последняя оплата", lastPay ? new Date(lastPay.date).toLocaleDateString("ru-RU") : "—", lastPay ? fmt(lastPay.amount, lastPay.currency) : "нет оплат", "clock"),
  ]));
  if (curStr(onlyPositive(od)) !== "0") page.append(el("div.hint", { style: { marginTop: "2px" }, text: "Из общего долга старый долг (до системы): " + curStr(onlyPositive(od)) }));

  // --- оплаты (сверху) — выпадающий (сворачиваемый) список, добавить / изменить / удалить ---
  {
    // содержимое списка (таблица или «пусто»)
    let payContent;
    if (!payments.length) payContent = el("div.empty", { style: { padding: "22px" } }, [el("p", { text: "Оплат пока нет" })]);
    else {
      const tbp = el("tbody");
      payments.forEach(p => {
        tbp.append(el("tr", {}, [
          el("td", { text: new Date(p.date).toLocaleDateString("ru-RU") }),
          el("td", {}, [el("strong", { text: fmt(p.amount, p.currency) })]),
          el("td", {}, [el("span.badge.cur", { text: CUR[p.currency].label })]),
          el("td", { text: p.note || "—" }),
          el("td.right", {}, [el("div.row-actions", {}, [
            el("button.btn.btn-outline.btn-sm.btn-icon", { title: "Изменить оплату", onclick: () => openPayment(ctx, c, p) }, [icon("edit", { size: 15 })]),
            el("button.btn.btn-danger.btn-sm.btn-icon", { title: "Удалить", onclick: () => confirmDialog("Удалить оплату?", async () => { await ctx.db.payments.remove(p.id); toast("Удалено", "ok"); ctx.refresh(); }) }, [icon("trash", { size: 15 })]),
          ])]),
        ]));
      });
      payContent = el("div", { style: { overflowX: "auto" } }, [el("table.tbl", {}, [
        el("thead", {}, [el("tr", {}, ["Дата", "Сумма", "Валюта", "Комментарий", ""].map(h => el("th", { text: h })))]),
        tbp,
      ])]);
    }
    // сворачиваемая обёртка (по умолчанию свёрнута)
    const payBody = el("div", { style: { display: "none", marginTop: "10px" } }, [payContent]);
    const chevron = el("span", { text: "▸", style: { transition: "transform .15s", fontSize: "13px", color: "var(--muted)" } });
    const header = el("div.card", { style: { padding: "12px 14px", display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", userSelect: "none" }, onclick: (e) => {
      if (e.target.closest("button")) return;
      const open = payBody.style.display !== "none";
      payBody.style.display = open ? "none" : "block";
      chevron.style.transform = open ? "" : "rotate(90deg)";
    } }, [
      chevron,
      el("span", { style: { display: "flex", color: "var(--muted)" } }, [icon("wallet", { size: 17 })]),
      el("strong", { text: "История оплат" }),
      el("span.badge.cur", { text: String(payments.length), style: { marginLeft: "2px" } }),
      el("button.btn.btn-ok.btn-sm", { style: { marginLeft: "auto" }, onclick: (e) => { e.stopPropagation(); openPayment(ctx, c); } }, [icon("plus", { size: 14 }), "Оплата"]),
    ]);
    page.append(el("div.section-h", { text: "Оплаты" }));
    page.append(header, payBody);
  }

  // --- накладные (по датам, раскрываются по клику) ---
  page.append(el("div.section-h", { text: "Накладные клиента" }));
  page.append(el("div.hint", { text: "Нажмите на накладную, чтобы посмотреть, что заказано в этот день." }));
  if (!sales.length) page.append(el("div.empty", { style: { padding: "30px" } }, [el("p", { text: "Накладных нет" })]));
  else {
    // бейдж = статус с учётом оплат (оплаты гасят старые «в долг» накладные первыми)
    const cov = coverageMap(sales, payments, od);
    const payBadgeFor = (s) => {
      const st = cov[s.id];
      if (st === "paid") return el("span.badge.ok", {}, [icon("check", { size: 13 }), "Оплачено"]);
      if (st === "partial") return el("span.badge.transit", {}, [icon("clock", { size: 13 }), "Частично"]);
      return el("span.badge.order", {}, [icon("dot", { size: 12 }), "В долг"]);
    };
    const tb = el("tbody");
    sales.forEach(s => {
      const payBadge = payBadgeFor(s);

      // строка-детали (что заказано) — скрыта, появляется по клику
      const detail = el("tr.detail", { style: { display: "none" } }, [
        el("td", { colspan: 6 }, [buildItemsTable(s, pmap)]),
      ]);
      const mainRow = el("tr", { style: { cursor: "pointer" }, title: "Показать товары",
        onclick: (e) => { if (e.target.closest("button")) return; detail.style.display = detail.style.display === "none" ? "" : "none"; } }, [
        el("td", {}, [el("strong", { text: new Date(s.date).toLocaleDateString("ru-RU") }), " ", el("span.muted", { text: "▾", style: { fontSize: "11px" } })]),
        el("td", {}, [el("span.badge.cur", { text: [...new Set((s.items || []).map(i => CUR[i.currency || s.currency]?.sign || ""))].join(" ") })]),
        el("td", {}, [el("strong", { text: curStr(sumByCur(s.items)) })]),
        el("td", {}, [payBadge]),
        el("td", { text: (s.items || []).length + " поз." }),
        el("td.right", {}, [el("div.row-actions", {}, [
          el("button.btn.btn-outline.btn-sm.btn-icon", { title: "Скачать накладную в Excel", text: "📊", onclick: async () => { showLoader("Готовим Excel…"); try { await exportCustomerInvoice(s, c, products, { debt, advance, lastPay }); } catch (e) { toast("Ошибка: " + (e.message || e), "err"); } finally { hideLoader(); } } }),
          el("button.btn.btn-outline.btn-sm.btn-icon", { title: isPaid(s) ? "Отметить «в долг»" : "Отметить «оплачено»", onclick: () => togglePaid(ctx, s) }, [icon(isPaid(s) ? "dot" : "check", { size: 16 })]),
          el("button.btn.btn-outline.btn-sm.btn-icon", { title: "Редактировать (цена/кол-во/товары)", onclick: () => openEditor(ctx, s, customers, products, c.id) }, [icon("edit", { size: 16 })]),
          el("button.btn.btn-outline.btn-sm.btn-icon", { title: "Отправить клиенту", onclick: () => sendInvToClient(ctx, s, c, products) }, [icon("send", { size: 16 })]),
          el("button.btn.btn-outline.btn-sm.btn-icon", { title: "Отправить в канал", onclick: () => sendInvToChannel(ctx, s, c, products) }, [icon("broadcast", { size: 16 })]),
          el("button.btn.btn-danger.btn-sm.btn-icon", { title: "Удалить", onclick: () => confirmDialog("Удалить накладную? Товары вернутся на склад.", () => deleteSale(ctx, s, products)) }, [icon("trash", { size: 16 })]),
        ])]),
      ]);
      tb.append(mainRow, detail);
    });
    page.append(el("div", { style: { overflowX: "auto" } }, [el("table.tbl", {}, [
      el("thead", {}, [el("tr", {}, ["Дата", "Валюта", "Сумма", "Оплата", "Позиции", ""].map(h => el("th", { text: h })))]),
      tb,
    ])]));
  }

  // --- заказанные товары (агрегировано по всем накладным клиента) ---
  page.append(el("div.section-h", { text: "Заказанные товары" }));
  const agg = {};
  sales.forEach(s => (s.items || []).forEach(it => {
    const a = agg[it.product_id] = agg[it.product_id] || { qty: 0, last: 0, cur: it.currency, date: null };
    a.qty += it.qty;
    if (!a.date || new Date(s.date) >= new Date(a.date)) { a.date = s.date; a.last = it.unit_price; a.cur = it.currency; }
  }));
  const aggRows = Object.entries(agg).sort((a, b) => b[1].qty - a[1].qty);
  if (!aggRows.length) page.append(el("div.empty", { style: { padding: "30px" } }, [el("p", { text: "Клиент ещё ничего не заказывал" })]));
  else {
    const tb = el("tbody");
    aggRows.forEach(([pid, a]) => {
      const p = pmap[pid] || { name: "?", photo_url: "" };
      tb.append(el("tr", {}, [
        el("td", {}, [el("div", { style: { display: "flex", alignItems: "center", gap: "10px" } }, [
          el("img.thumb", { src: p.photo_url || placeholderImg(p.name), style: { width: "38px", height: "38px" }, onerror: function () { this.src = placeholderImg(p.name); } }),
          el("strong", { text: p.name }),
        ])]),
        el("td", {}, [el("strong", { text: a.qty })]),
        el("td", { text: fmt(a.last, a.cur) }),
        el("td", { text: a.date ? new Date(a.date).toLocaleDateString("ru-RU") : "—" }),
      ]));
    });
    page.append(el("div", { style: { overflowX: "auto" } }, [el("table.tbl", {}, [
      el("thead", {}, [el("tr", {}, ["Товар", "Всего заказано", "Последняя цена", "Последний заказ"].map(h => el("th", { text: h })))]),
      tb,
    ])]));
  }

}

function statCard(label, value, sub, ic, grad) {
  return el("div" + (grad ? ".stat-card.grad" : ".stat-card"), {}, [
    el("div.st-ic", {}, [icon(ic, { size: 22 })]), el("div.st-label", { text: label }),
    el("div.st-value", { text: value }), el("div.st-sub", { text: sub }),
  ]);
}
function statCardDebt(debt, advance) {
  const owe = onlyPositive(debt);
  const adv = onlyPositive(advance || { som: 0, usd: 0, yuan: 0 });
  const txt = curStr(owe), advTxt = curStr(adv);
  const has = txt !== "0";
  const hasAdv = !has && advTxt !== "0"; // аванс показываем, только если нет долга
  const value = has ? txt : hasAdv ? advTxt : "0";
  const color = has ? "#fbbf24" : "#34d399";
  return el("div.stat-card", { style: has ? { borderColor: "rgba(245,158,11,.5)" } : hasAdv ? { borderColor: "rgba(16,185,129,.5)" } : {} }, [
    el("div.st-ic", {}, [icon(has ? "alert" : hasAdv ? "undo" : "check", { size: 22 })]),
    el("div.st-label", { text: hasAdv ? "Аванс (наш долг)" : "Долг" }),
    el("div.st-value", { text: value, style: { color, fontSize: value.length > 14 ? "20px" : "30px" } }),
    el("div.st-sub", { text: has ? "клиент должен" : hasAdv ? "мы должны клиенту" : "нет долга" }),
  ]);
}

// таблица позиций накладной (что заказано в этот день)
function buildItemsTable(s, pmap) {
  const tb = el("tbody");
  (s.items || []).forEach((it, n) => {
    const p = pmap[it.product_id] || { name: "?", photo_url: "" };
    tb.append(el("tr", {}, [
      el("td", { text: (n + 1) }),
      el("td", {}, [el("div", { style: { display: "flex", alignItems: "center", gap: "8px" } }, [
        el("img.thumb", { src: p.photo_url || placeholderImg(p.name), style: { width: "36px", height: "36px", cursor: "zoom-in" }, title: "Увеличить", onclick: () => p.photo_url && lightbox(p.photo_url), onerror: function () { this.src = placeholderImg(p.name); } }),
        el("span", { text: p.name }),
      ])]),
      el("td", { text: it.qty }),
      el("td", { text: fmt(it.unit_price, it.currency || s.currency) }),
      el("td", {}, [el("strong", { text: fmt(it.qty * it.unit_price, it.currency || s.currency) })]),
      el("td", {}, [it.paid ? el("span.badge.ok", {}, [icon("check", { size: 12 })]) : el("span.badge.order", {}, [icon("dot", { size: 11 })])]),
    ]));
  });
  return el("div", { style: { padding: "6px 0 10px 0" } }, [
    el("div.muted", { text: "Заказано " + new Date(s.date).toLocaleDateString("ru-RU") + (Number(s.boxes) > 0 ? "  ·  коробок: " + s.boxes : "") + ":", style: { fontSize: "12px", marginBottom: "6px" } }),
    el("table.tbl", { style: { background: "transparent" } }, [
      el("thead", {}, [el("tr", {}, ["#", "Товар", "Кол-во", "Цена", "Сумма", "Опл."].map(h => el("th", { text: h })))]),
      tb,
    ]),
  ]);
}

// переключить статус оплаты накладной
async function togglePaid(ctx, s) {
  const newPaid = !isPaid(s);
  const items = (s.items || []).map(i => ({ ...i, paid: newPaid }));
  await ctx.db.sales.upsert({ id: s.id, items });
  toast(newPaid ? "Отмечено: оплачено" : "Отмечено: в долг", "ok");
  ctx.refresh();
}

// ----------------------- ВЫБОР ПОЛУЧАТЕЛЯ ПО ТЕЛЕФОНУ -----------------------
// Привязанные Telegram-аккаунты клиента: из tg_accounts (телефон↔chat) + основной tg_chat_id.
function recipientsOf(c) {
  const list = [], seen = new Set();
  (Array.isArray(c.tg_accounts) ? c.tg_accounts : []).forEach(a => {
    if (a && a.chat_id && !seen.has(String(a.chat_id))) { seen.add(String(a.chat_id)); list.push({ chat_id: String(a.chat_id), phone: a.phone || "", name: a.name || "" }); }
  });
  if (c.tg_chat_id && !seen.has(String(c.tg_chat_id))) { seen.add(String(c.tg_chat_id)); list.push({ chat_id: String(c.tg_chat_id), phone: c.contact || "", name: "основной" }); }
  return list;
}
// Показать выбор «кому отправить по номеру телефона». Один получатель — отправляем сразу.
function pickRecipient(c, onPick) {
  const rec = recipientsOf(c);
  if (!rec.length) { toast("У клиента нет привязанного Telegram. Клиент должен написать боту и поделиться своим номером.", "err"); return; }
  if (rec.length === 1) { onPick(rec[0].chat_id); return; }
  const m = modal({
    title: "Кому отправить?",
    body: el("div", {}, [
      el("div.hint", { text: "Выберите номер телефона получателя — отправим в его Telegram." }),
      ...rec.map(r => el("button.btn.btn-outline", { style: { display: "block", width: "100%", textAlign: "left", marginBottom: "8px" }, onclick: () => { m.close(); onPick(r.chat_id); } },
        [icon("send", { size: 15 }), "  📱 " + (r.phone || ("chat " + r.chat_id)) + (r.name ? "  ·  " + r.name : "")])),
    ]),
    actions: [{ label: "Отмена", kind: "btn-outline", onClick: x => x() }],
  });
}

// Ручная привязка Telegram: список тех, кто писал боту → выбрать этого клиента.
// Нужно, когда клиент написал боту ДО того, как его номер появился в системе (авто-match не сработал).
async function linkTelegram(ctx, c) {
  showLoader("Загрузка контактов бота…");
  let contacts = [];
  try { const r = await fetch("/api/admin/bot-contacts", { headers: await authHeaders() }); contacts = await r.json(); } catch {}
  hideLoader();
  if (!Array.isArray(contacts) || !contacts.length) { toast("Пока никто не делился номером с ботом. Попросите клиента открыть бот и нажать «📱 Поделиться номером».", "err"); return; }
  const search = input({ placeholder: "Поиск по номеру или имени…" });
  const listBox = el("div", { style: { maxHeight: "46vh", overflow: "auto", marginTop: "10px" } });
  const render = () => {
    const q = (search.value || "").toLowerCase().replace(/\D/g, "");
    const qt = (search.value || "").toLowerCase();
    listBox.innerHTML = "";
    const fl = contacts.filter(x => !qt || (q && String(x.phone || "").replace(/\D/g, "").includes(q)) || (x.tg_name || "").toLowerCase().includes(qt) || (x.tg_username || "").toLowerCase().includes(qt));
    if (!fl.length) { listBox.append(el("div.muted", { text: "Ничего не найдено", style: { padding: "10px" } })); return; }
    fl.forEach(x => listBox.append(el("button.btn.btn-outline", { style: { display: "block", width: "100%", textAlign: "left", marginBottom: "6px" }, onclick: () => doLink(x) },
      ["📱 " + (x.phone || x.chat_id) + (x.tg_name ? "  ·  " + x.tg_name : "") + (x.tg_username ? "  ·  @" + x.tg_username : "")])));
  };
  search.addEventListener("input", render);
  const m = modal({
    title: "Привязать Telegram клиента «" + c.name + "»",
    body: el("div", {}, [el("div.hint", { text: "Кто из написавших боту — этот клиент? Выберите — привяжем его Telegram к карточке." }), search, listBox]),
    actions: [{ label: "Отмена", kind: "btn-outline", onClick: x => x() }],
  });
  render();
  async function doLink(x) {
    const cid = String(x.chat_id);
    const accs = Array.isArray(c.tg_accounts) ? c.tg_accounts : [];
    const ids = Array.isArray(c.tg_chat_ids) ? c.tg_chat_ids.map(String) : [];
    const patch = { id: c.id, tg_chat_id: c.tg_chat_id || cid };
    if (!ids.includes(cid)) patch.tg_chat_ids = [...ids, cid];
    if (!accs.some(a => String(a.chat_id) === cid)) patch.tg_accounts = [...accs, { phone: x.phone || "", chat_id: cid, name: x.tg_name || "" }];
    try { await ctx.db.customers.upsert(patch); }
    catch { try { await ctx.db.customers.upsert({ id: c.id, tg_chat_id: patch.tg_chat_id, tg_chat_ids: patch.tg_chat_ids }); } catch { await ctx.db.customers.upsert({ id: c.id, tg_chat_id: patch.tg_chat_id }); } }
    m.close(); toast("Telegram привязан к клиенту", "ok"); ctx.refresh();
  }
}

// ----------------------- ОТПРАВКА НАКЛАДНОЙ -----------------------
async function sendInvToClient(ctx, s, c, products) {
  // выбираем получателя по номеру телефона → сразу отправляем в его Telegram (клиентский бот)
  pickRecipient(c, async (chatId) => {
    try { await sendInvoicePDFToClient(s.id, chatId, "Ваша накладная"); toast("Отправлено клиенту", "ok"); }
    catch (e) { toast("Не отправлено: " + e.message, "err"); }
  });
}
async function sendInvToChannel(ctx, s, c, products) {
  showLoader("Отправляем в канал…");
  try {
    // канал: из настроек, иначе из локальной резервной копии (на случай если облако не вернуло)
    let channel = "";
    try { const st = await ctx.db.getSettings(); channel = (st && st.telegram_channel) || ""; } catch {}
    if (!channel) { try { channel = localStorage.getItem("gm_tg_channel") || ""; } catch {} }
    if (!channel) { hideLoader(); toast("Канал не указан. Откройте Настройки → Telegram и впишите @канал/-100…", "err"); return; }
    await sendInvoicePDF(s.id, channel);
    await ctx.db.sales.upsert({ id: s.id, telegram_sent: true });
    toast("Отправлено в канал (PDF)", "ok"); ctx.refresh();
  }
  catch (e) { toast(e.message || "Не отправлено. Укажите канал в Настройках и сделайте бота админом канала.", "err"); }
  finally { hideLoader(); }
}

// ----------------------- АКТ СВЕРКИ -----------------------
function openActSverki(ctx, c, sales, payments) {
  const finals = (sales || []).filter(s => s.status === "final");
  const opening = c.opening_debt || {};
  const body = el("div", { style: { maxHeight: "60vh", overflowY: "auto" } });
  let any = false;
  const closing = {};
  ["som", "usd", "yuan"].forEach(cur => {
    const events = [];
    finals.forEach(s => {
      let sum = 0; (s.items || []).forEach(it => { const cc = it.currency || s.currency; if (cc === cur) sum += (it.qty || 0) * (it.unit_price || 0); });
      if (sum > 0.0001) events.push({ date: s.date, type: "ship", amount: sum });
    });
    (payments || []).forEach(p => { if ((p.currency || "som") === cur && (Number(p.amount) || 0) > 0.0001) events.push({ date: p.date, type: "pay", amount: Number(p.amount) }); });
    const open = Number(opening[cur]) || 0;
    if (!events.length && Math.abs(open) < (cur === "som" ? 1 : 0.01)) return;
    any = true;
    events.sort((a, b) => new Date(a.date) - new Date(b.date));
    body.append(el("div.section-h", { text: cur === "som" ? "Сумы" : cur === "usd" ? "Доллары $" : "Юани ¥" }));
    body.append(el("div.hint", { text: "Начальный долг: " + fmt(open, cur) }));
    const tb = el("tbody");
    let bal = open;
    events.forEach(ev => {
      let ship = "", paid2 = "";
      if (ev.type === "ship") { bal += ev.amount; ship = fmt(ev.amount, cur); } else { bal -= ev.amount; paid2 = fmt(ev.amount, cur); }
      tb.append(el("tr", {}, [
        el("td", { text: new Date(ev.date).toLocaleDateString("ru-RU") }),
        el("td", { text: ev.type === "ship" ? "Накладная" : "Оплата" }),
        el("td.right", { text: ship }),
        el("td.right", { text: paid2 }),
        el("td.right", {}, [el("strong", { text: fmt(bal, cur) })]),
      ]));
    });
    body.append(el("table.tbl", {}, [
      el("thead", {}, [el("tr", {}, ["Дата", "Операция", "Отгружено", "Оплачено", "Остаток"].map(h => el("th", { text: h })))]),
      tb,
    ]));
    closing[cur] = bal;
    body.append(el("div", { style: { marginBottom: "18px" } }));
  });
  if (!any) body.append(el("div.empty", { style: { padding: "20px" } }, [el("p", { text: "Движений по счёту нет" })]));
  else {
    const parts = ["som", "usd", "yuan"].filter(cu => Math.abs(closing[cu] || 0) >= (cu === "som" ? 1 : 0.01)).map(cu => fmt(closing[cu], cu));
    const debtStr = parts.length ? parts.join("   +   ") : fmt(0, "som");
    body.append(el("div", {
      style: { background: "var(--navy,#16233b)", color: "#fff", borderRadius: "14px", padding: "14px 18px", marginTop: "4px" },
    }, [
      el("div", { text: "Общий долг клиента", style: { fontSize: "12px", opacity: ".75", marginBottom: "4px" } }),
      el("div", { text: debtStr, style: { fontSize: "18px", fontWeight: "800", color: "var(--gold,#e3c163)" } }),
    ]));
  }

  modal({
    title: "Акт сверки — " + c.name,
    body,
    actions: [
      { label: "Закрыть", kind: "btn-outline", onClick: x => x() },
      { label: "📄 Скачать PDF", kind: "btn-outline", onClick: async () => {
        showLoader("Готовим PDF…");
        try {
          const r = await fetch("/api/admin/act-pdf?customer_id=" + encodeURIComponent(c.id), { headers: await authHeaders() });
          if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || r.status); }
          const blob = await r.blob();
          const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
          a.download = `akt-sverki-${String(c.name || "client").replace(/[^\wа-яёА-ЯЁ]/gi, "_")}.pdf`; a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 1500);
        } catch (e) { toast("Ошибка: " + (e.message || e), "err"); } finally { hideLoader(); }
      } },
      { label: "📤 Клиенту", kind: "btn-ok", onClick: async (close) => {
        // выбор получателя по номеру телефона → сразу отправляем акт в его Telegram
        pickRecipient(c, async (chatId) => {
          showLoader("Отправляем клиенту…");
          try { await sendActToClient(c.id, chatId); toast("Акт отправлен клиенту", "ok"); close(); }
          catch (e) { toast("Не отправлено: " + (e.message || e), "err"); } finally { hideLoader(); }
        });
      } },
      { label: "📢 В канал", kind: "btn-primary", onClick: async (close) => {
        showLoader("Отправляем в канал…");
        try {
          let ch = ""; try { const st = await ctx.db.getSettings(); ch = (st && st.telegram_channel) || ""; } catch {}
          await sendActToChannel(c.id, ch); toast("Акт отправлен в канал", "ok"); close();
        } catch (e) { toast("Не отправлено: " + (e.message || e), "err"); } finally { hideLoader(); }
      } },
    ],
  });
}

// ----------------------- ФОРМА ОПЛАТЫ -----------------------
// pay — если передан, режим редактирования существующей оплаты
function openPayment(ctx, c, pay) {
  const isEdit = !!pay;
  const fAmount = input({ type: "number", step: "0.01", placeholder: "Сумма", value: isEdit ? pay.amount : "" });
  const fCur = select(Object.values(CUR).map(x => ({ value: x.code, label: x.label })), isEdit ? pay.currency : "yuan");
  const fDate = input({ type: "date", value: (isEdit && pay.date ? pay.date : new Date().toISOString()).slice(0, 10) });
  const fNote = input({ placeholder: "Комментарий (необязательно)", value: isEdit ? (pay.note || "") : "" });
  modal({
    title: (isEdit ? "Изменить оплату — " : "Новая оплата — ") + c.name,
    body: el("div", {}, [
      el("div.row2", {}, [field("Сумма", fAmount), field("Валюта", fCur)]),
      el("div.row2", {}, [field("Дата", fDate), field("Комментарий", fNote)]),
    ]),
    actions: [
      { label: "Отмена", kind: "btn-outline", onClick: x => x() },
      { label: "Сохранить", kind: "btn-primary", onClick: async (close) => {
        if (!(+fAmount.value > 0)) { toast("Введите сумму", "err"); return; }
        const amount = +fAmount.value, currency = fCur.value;
        const date = fDate.value ? new Date(fDate.value).toISOString() : (isEdit ? pay.date : new Date().toISOString());
        await ctx.db.payments.upsert({ ...(isEdit ? { id: pay.id } : {}), customer_id: c.id, amount, currency, date, note: fNote.value.trim() });
        close(); toast(isEdit ? "Оплата изменена, долг обновлён" : "Оплата добавлена, долг обновлён", "ok"); ctx.refresh();
      } },
    ],
  });
}

// ----------------------- ФОРМА КЛИЕНТА -----------------------
function openForm(ctx, c, allCustomers = []) {
  const isNew = !c; c = c || { name: "", contact: "", note: "", tg_chat_id: "" };
  const fName = inputList(allCustomers.map(x => x.name), { value: c.name, placeholder: "Имя / магазин" });
  // несколько номеров: первый — основной (contact), остальные — дополнительные. Клиент может войти в бот с любого.
  let numbers = (Array.isArray(c.phones) && c.phones.length) ? [...c.phones] : (c.contact ? [c.contact] : [""]);
  const phonesBox = el("div", {});
  function renderPhones() {
    phonesBox.innerHTML = "";
    numbers.forEach((num, i) => {
      const inp = input({ value: num, placeholder: i === 0 ? "Основной телефон / @username" : "Доп. номер" });
      inp.addEventListener("input", () => { numbers[i] = inp.value; });
      const rm = el("button.btn.btn-danger.btn-sm.btn-icon", { title: "Удалить номер", onclick: (e) => { e.preventDefault(); numbers.splice(i, 1); if (!numbers.length) numbers = [""]; renderPhones(); } }, [icon("x", { size: 14 })]);
      phonesBox.append(el("div", { style: { display: "flex", gap: "8px", marginBottom: "6px", alignItems: "center" } }, [el("div", { style: { flex: "1" } }, [inp]), ...(numbers.length > 1 ? [rm] : [])]));
    });
  }
  renderPhones();
  const addPhoneBtn = el("button.btn.btn-outline.btn-sm", { onclick: (e) => { e.preventDefault(); numbers.push(""); renderPhones(); } }, [icon("plus", { size: 14 }), "Добавить номер"]);
  const fChat = input({ value: c.tg_chat_id || "", placeholder: "chat_id (для отправки накладных)" });
  const fNote = input({ value: c.note || "", placeholder: "Заметка" });
  const od0 = openingDebt(c);
  const fOdSom = input({ type: "number", value: od0.som || "", placeholder: "сум" });
  const fOdUsd = input({ type: "number", step: "0.01", value: od0.usd || "", placeholder: "$" });
  const fOdYuan = input({ type: "number", step: "0.01", value: od0.yuan || "", placeholder: "¥" });
  modal({
    title: isNew ? "Новый клиент" : "Клиент",
    body: el("div", {}, [
      field("Имя", fName),
      el("div.field-label", { text: "Телефоны (клиент может войти в бот с любого номера)" }),
      phonesBox,
      addPhoneBtn,
      el("div.hint", { text: "Первый номер — основной (на него отправляются накладные). Остальные тоже привязываются к этому клиенту." }),
      field("Telegram chat_id", fChat),
      el("div.hint", { text: "chat_id нужен, чтобы отправлять накладные клиенту. Клиент должен сначала написать боту /start." }),
      field("Заметка", fNote),
      el("div.section-h", { text: "Старый долг (до системы)" }),
      el("div.row3", {}, [field("Сум", fOdSom), field("Доллар $", fOdUsd), field("Юань ¥", fOdYuan)]),
      el("div.hint", { text: "Долг, который был у клиента до начала учёта. Входит в общий долг, гасится оплатами." }),
    ]),
    actions: [
      { label: "Отмена", kind: "btn-outline", onClick: x => x() },
      { label: "Сохранить", kind: "btn-primary", onClick: async (close) => {
        if (!fName.value.trim()) { toast("Введите имя", "err"); return; }
        const cleanNums = numbers.map(s => String(s || "").trim()).filter(Boolean);
        const contact = cleanNums[0] || "";
        const base = { ...(isNew ? {} : { id: c.id }), name: fName.value.trim(), contact, tg_chat_id: fChat.value.trim(), note: fNote.value.trim() };
        const opening_debt = { som: +fOdSom.value || 0, usd: +fOdUsd.value || 0, yuan: +fOdYuan.value || 0 };
        // пробуем сохранить с phones+opening_debt; при отсутствии колонок — поэтапный фолбэк
        try {
          const r = await ctx.db.customers.upsert({ ...base, phones: cleanNums, opening_debt });
          if (isNew && r) await ctx.db.customers.upsert({ id: r.id, phones: cleanNums, opening_debt });
        } catch (e) {
          try { await ctx.db.customers.upsert({ ...base, phones: cleanNums }); toast("Старый долг не сохранён (нужен SQL)", "err"); }
          catch { await ctx.db.customers.upsert(base); toast("Доп. номера/долг не сохранены (нужен SQL): " + e.message, "err"); }
        }
        close(); toast("Сохранено", "ok"); ctx.refresh();
      } },
    ],
  });
}
