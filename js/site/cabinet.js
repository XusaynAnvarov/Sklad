// Личный кабинет клиента: профиль, заказы, накладные, оплаты, экспорт
import { api } from "./api.js";
import { sToast } from "./app.js";

const CURRENCIES = { som: "сум", usd: "$", yuan: "¥" };
const STATUS_LABEL = { order: "Новый", pending_confirm: "Ждёт подтверждения", confirmed: "Подтверждён", final: "Оформлен" };
const STATUS_CLASS = { order: "order", pending_confirm: "pending", confirmed: "confirmed", final: "final" };
const DEBT_LABEL = { paid: "Оплачено", partial: "Частично", debt: "Долг" };

function fmt(n, cur) {
  const v = Number(n) || 0;
  if (cur === "som") return Math.round(v).toLocaleString("ru-RU") + " сум";
  return (CURRENCIES[cur] || cur) + (Math.round(v * 100) / 100).toLocaleString("ru-RU");
}

function mkEl(tag, cls = "") {
  const e = document.createElement(tag);
  if (cls) cls.split(" ").filter(Boolean).forEach(c => e.classList.add(c));
  return e;
}
function el(tag, opts = {}, children = []) {
  const e = document.createElement(tag);
  if (opts.className) e.className = opts.className;
  if (opts.text) e.textContent = opts.text;
  if (opts.style) e.style.cssText = opts.style;
  if (opts.html) e.innerHTML = opts.html;
  children.forEach(c => c && e.append(c));
  return e;
}

export async function renderCabinet(container) {
  container.innerHTML = "";
  const layout = mkEl("div", "cabinet-layout");
  const sidebar = mkEl("div", "cabinet-sidebar");
  const content = mkEl("div", "cabinet-content");
  layout.append(sidebar, content);
  container.append(layout);

  const sections = [
    { id: "profile", label: "Профиль и долг", icon: svgUser() },
    { id: "orders", label: "Мои заказы", icon: svgCart() },
    { id: "invoices", label: "Накладные", icon: svgReceipt() },
    { id: "payments", label: "Оплаты", icon: svgWallet() },
  ];
  let active = "profile";

  function buildNav() {
    sidebar.innerHTML = "";
    const title = mkEl("div", "");
    title.style.cssText = "font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);padding:6px 12px 10px";
    title.textContent = "Кабинет";
    sidebar.append(title);
    sections.forEach(s => {
      const item = mkEl("div", "cabinet-nav-item" + (s.id === active ? " active" : ""));
      item.append(s.icon.cloneNode(true));
      const span = document.createElement("span"); span.textContent = s.label;
      item.append(span);
      item.addEventListener("click", () => { active = s.id; buildNav(); loadSection(); });
      sidebar.append(item);
    });
  }

  async function loadSection() {
    content.innerHTML = `<div style="padding:40px;text-align:center;color:var(--muted)"><span class="s-spinner" style="width:28px;height:28px;border-width:3px;border-color:rgba(0,0,0,.1);border-top-color:var(--navy);display:inline-block"></span></div>`;
    try {
      if (active === "profile") await renderProfile(content);
      else if (active === "orders") await renderOrders(content);
      else if (active === "invoices") await renderInvoices(content);
      else if (active === "payments") await renderPayments(content);
    } catch (e) {
      content.innerHTML = `<div class="s-empty"><p>Ошибка загрузки: ${e.message}</p></div>`;
    }
  }

  buildNav();
  await loadSection();
}

// ---- Профиль + долг ----
async function renderProfile(container) {
  const res = await api.me();
  container.innerHTML = "";
  const card = mkEl("div", "cabinet-card");

  const name = res.customer?.name || "—";
  const phone = res.customer?.contact || "—";
  const head = mkEl("div", "");
  head.style.cssText = "display:flex;align-items:center;gap:14px;margin-bottom:20px";
  const ava = mkEl("div", "");
  ava.style.cssText = "width:52px;height:52px;border-radius:50%;background:var(--navy);display:flex;align-items:center;justify-content:center;color:var(--gold);font-size:20px;font-weight:700;flex-shrink:0";
  ava.textContent = (name[0] || "?").toUpperCase();
  const info = mkEl("div", "");
  info.innerHTML = `<div style="font-size:17px;font-weight:700;color:var(--navy)">${escHtml(name)}</div><div style="font-size:13px;color:var(--muted);margin-top:2px">${escHtml(phone)}</div>`;
  head.append(ava, info);
  card.append(head);

  const debtTitle = el("div", { text: "Текущий долг", style: "font-size:13px;font-weight:600;color:var(--muted);margin-bottom:12px;text-transform:uppercase;letter-spacing:.05em" });
  card.append(debtTitle);

  const currencies = ["som", "usd", "yuan"];
  let hasDebt = false;
  currencies.forEach(cur => {
    const d = (res.debt || {})[cur] || 0;
    if (d > 0.001) {
      hasDebt = true;
      const row = mkEl("div", "");
      row.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:rgba(239,68,68,.05);border:1.5px solid rgba(239,68,68,.15);border-radius:10px;margin-bottom:8px";
      row.innerHTML = `<span style="font-size:14px;font-weight:600;color:var(--muted)">${cur === "som" ? "Сумы" : cur === "usd" ? "Доллары" : "Юани"}</span><span style="font-size:18px;font-weight:700;color:#dc2626">${fmt(d, cur)}</span>`;
      card.append(row);
    }
    const adv = (res.advance || {})[cur] || 0;
    if (adv > 0.001) {
      hasDebt = true;
      const row = mkEl("div", "");
      row.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:rgba(34,197,94,.05);border:1.5px solid rgba(34,197,94,.2);border-radius:10px;margin-bottom:8px";
      row.innerHTML = `<span style="font-size:14px;font-weight:600;color:var(--muted)">Аванс (переплата)</span><span style="font-size:18px;font-weight:700;color:#16a34a">+ ${fmt(adv, cur)}</span>`;
      card.append(row);
    }
  });
  if (!hasDebt) {
    const zero = mkEl("div", "");
    zero.style.cssText = "padding:16px;text-align:center;color:#16a34a;font-weight:600;font-size:15px;background:rgba(34,197,94,.07);border-radius:10px";
    zero.textContent = "Долгов нет";
    card.append(zero);
  }
  container.append(card);
}

// ---- Заказы ----
async function renderOrders(container) {
  const res = await api.orders();
  container.innerHTML = "";
  const orders = res.orders || [];
  if (!orders.length) { container.append(emptyState("Заказов пока нет")); return; }
  orders.forEach(o => {
    const card = mkEl("div", "cabinet-card");
    card.style.marginBottom = "12px";
    const head = mkEl("div", "");
    head.style.cssText = "display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;margin-bottom:10px";
    const date = new Date(o.date).toLocaleDateString("ru-RU");
    const cls = STATUS_CLASS[o.status] || "order";
    const lbl = STATUS_LABEL[o.status] || o.status;
    const src = o.source === "site" ? "с сайта" : o.source === "bot" ? "из бота" : "";
    head.innerHTML = `
      <div>
        <div style="font-size:13px;color:var(--muted)">${date}${src ? " · " + src : ""}</div>
      </div>
      <span class="order-badge ${cls}">${lbl}</span>`;
    const items = mkEl("div", "");
    (o.items || []).forEach(it => {
      const row = mkEl("div", "");
      row.style.cssText = "display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:14px";
      row.innerHTML = `<span>${escHtml(it.product_name)}</span><span style="color:var(--muted)">× ${it.qty}</span>`;
      items.append(row);
    });
    card.append(head, items);
    container.append(card);
  });
}

// ---- Накладные ----
async function renderInvoices(container) {
  const res = await api.invoices();
  container.innerHTML = "";
  const invoices = res.invoices || [];
  if (!invoices.length) { container.append(emptyState("Оформленных накладных пока нет")); return; }
  invoices.forEach(inv => {
    const card = mkEl("div", "cabinet-card");
    card.style.marginBottom = "12px";
    const head = mkEl("div", "");
    head.style.cssText = "display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px";
    const date = new Date(inv.date).toLocaleDateString("ru-RU");
    const dCls = DEBT_LABEL[inv.status] ? inv.status : "debt";
    head.innerHTML = `
      <div>
        <div style="font-size:15px;font-weight:700;color:var(--navy)">${fmt(inv.total, inv.currency)}</div>
        <div style="font-size:13px;color:var(--muted);margin-top:2px">${date}</div>
      </div>
      <span class="debt-badge ${dCls}">${DEBT_LABEL[inv.status] || "Долг"}</span>`;
    const items = mkEl("div", "");
    (inv.items || []).forEach(it => {
      const row = mkEl("div", "");
      row.style.cssText = "display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border);font-size:13px";
      row.innerHTML = `<span>${escHtml(it.product_name)}</span><span style="color:var(--muted)">${it.qty} × ${fmt(it.unit_price, it.currency)}</span>`;
      items.append(row);
    });
    const btns = mkEl("div", "");
    btns.style.cssText = "display:flex;gap:8px;margin-top:14px;flex-wrap:wrap";
    const pdfBtn = document.createElement("button");
    pdfBtn.className = "btn-ghost"; pdfBtn.innerHTML = svgDownload().outerHTML + " PDF";
    pdfBtn.addEventListener("click", () => {
      const token = localStorage.getItem("gm_client_token");
      const url = api.invoicePdfUrl(inv.id);
      fetch(url, { headers: { Authorization: "Bearer " + token } })
        .then(r => r.blob()).then(blob => {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = `nakladnaya-${date.replace(/\./g, "-")}.pdf`;
          a.click();
        }).catch(() => sToast("Ошибка загрузки PDF", "err"));
    });
    const xlsBtn = document.createElement("button");
    xlsBtn.className = "btn-ghost"; xlsBtn.innerHTML = svgDownload().outerHTML + " Excel";
    xlsBtn.addEventListener("click", () => exportExcel(inv, date));
    btns.append(pdfBtn, xlsBtn);
    card.append(head, items, btns);
    container.append(card);
  });
}

function exportExcel(inv, dateStr) {
  const rows = [
    ["Товар", "Кол-во", "Цена", "Валюта", "Сумма"],
    ...(inv.items || []).map(it => [it.product_name, it.qty, it.unit_price, it.currency || inv.currency, it.qty * it.unit_price]),
    [],
    ["Итого", "", "", "", inv.total, inv.currency],
  ];
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const bom = "﻿";
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `nakladnaya-${dateStr.replace(/\./g, "-")}.csv`; a.click();
  sToast("Excel (CSV) сохранён", "ok");
}

// ---- Оплаты ----
async function renderPayments(container) {
  const res = await api.payments();
  container.innerHTML = "";
  const payments = res.payments || [];
  if (!payments.length) { container.append(emptyState("Оплат пока не записано")); return; }
  const card = mkEl("div", "cabinet-card");
  const table = mkEl("table", "s-table");
  table.innerHTML = `<thead><tr><th>Дата</th><th>Сумма</th><th>Примечание</th></tr></thead>`;
  const tbody = document.createElement("tbody");
  payments.forEach(p => {
    const tr = document.createElement("tr");
    const date = p.date ? new Date(p.date).toLocaleDateString("ru-RU") : "—";
    tr.innerHTML = `<td>${date}</td><td style="font-weight:600;color:#16a34a">${fmt(p.amount, p.currency)}</td><td style="color:var(--muted)">${escHtml(p.note || "—")}</td>`;
    tbody.append(tr);
  });
  table.append(tbody);
  card.append(table);
  container.append(card);
}

function emptyState(text) {
  const w = mkEl("div", "s-empty cabinet-card");
  w.innerHTML = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".3"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg><p>${escHtml(text)}</p>`;
  return w;
}
function escHtml(s) { return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

// SVG иконки (inline, без внешних зависимостей)
function svgUser()    { const s=mkEl("svg",""); s.setAttribute("width","16"); s.setAttribute("height","16"); s.setAttribute("viewBox","0 0 24 24"); s.setAttribute("fill","none"); s.setAttribute("stroke","currentColor"); s.setAttribute("stroke-width","2"); s.innerHTML=`<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>`; return s; }
function svgCart()    { const s=mkEl("svg",""); s.setAttribute("width","16"); s.setAttribute("height","16"); s.setAttribute("viewBox","0 0 24 24"); s.setAttribute("fill","none"); s.setAttribute("stroke","currentColor"); s.setAttribute("stroke-width","2"); s.innerHTML=`<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>`; return s; }
function svgReceipt() { const s=mkEl("svg",""); s.setAttribute("width","16"); s.setAttribute("height","16"); s.setAttribute("viewBox","0 0 24 24"); s.setAttribute("fill","none"); s.setAttribute("stroke","currentColor"); s.setAttribute("stroke-width","2"); s.innerHTML=`<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>`; return s; }
function svgWallet()  { const s=mkEl("svg",""); s.setAttribute("width","16"); s.setAttribute("height","16"); s.setAttribute("viewBox","0 0 24 24"); s.setAttribute("fill","none"); s.setAttribute("stroke","currentColor"); s.setAttribute("stroke-width","2"); s.innerHTML=`<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>`; return s; }
function svgDownload(){ const s=mkEl("svg",""); s.setAttribute("width","14"); s.setAttribute("height","14"); s.setAttribute("viewBox","0 0 24 24"); s.setAttribute("fill","none"); s.setAttribute("stroke","currentColor"); s.setAttribute("stroke-width","2"); s.innerHTML=`<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>`; return s; }
