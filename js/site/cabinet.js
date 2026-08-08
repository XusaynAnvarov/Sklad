// Личный кабинет клиента: профиль, заказы, накладные, оплаты, экспорт
import { api } from "./api.js?v=20260808a";
import { sToast } from "./app.js?v=20260808a";

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
    { id: "security", label: "Сменить пароль", icon: svgLock() },
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
      else if (active === "security") await renderSecurity(content);
    } catch (e) {
      content.innerHTML = `<div class="s-empty"><p>Ошибка загрузки: ${escHtml(e.message)}</p></div>`;
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
  clientName = res.customer?.name || clientName;   // пригодится для имени в Excel
  const head = mkEl("div", "");
  head.style.cssText = "display:flex;align-items:center;gap:14px;margin-bottom:16px";
  const ava = mkEl("div", "");
  ava.style.cssText = "width:52px;height:52px;border-radius:50%;background:var(--navy);display:flex;align-items:center;justify-content:center;color:var(--gold);font-size:20px;font-weight:700;flex-shrink:0";
  ava.textContent = (name[0] || "?").toUpperCase();
  const info = mkEl("div", ""); info.style.flex = "1";
  info.innerHTML = `<div style="font-size:17px;font-weight:700;color:var(--navy)">${escHtml(name)}</div><div style="font-size:13px;color:var(--muted);margin-top:2px">${escHtml(phone)}</div>`;
  const editToggle = mkEl("button", "btn-ghost");
  editToggle.style.cssText = "padding:6px 12px;font-size:12px;flex-shrink:0";
  editToggle.textContent = "Изменить";
  head.append(ava, info, editToggle);
  card.append(head);

  // --- форма редактирования ---
  const editForm = mkEl("div", "");
  editForm.style.cssText = "display:none;padding:14px;background:var(--bg,#f8f5ef);border-radius:10px;margin-bottom:16px;border:1px solid var(--border)";
  const fName  = document.createElement("input");
  fName.type  = "text"; fName.className = "search-input"; fName.placeholder = "Имя";
  fName.value = name === "—" ? "" : name;
  fName.style.cssText = "margin-bottom:8px;display:block;width:100%;box-sizing:border-box";
  const fPhone = document.createElement("input");
  fPhone.type = "tel";  fPhone.className = "search-input"; fPhone.placeholder = "Телефон (+998...)";
  fPhone.value = phone === "—" ? "" : phone;
  fPhone.style.cssText = "margin-bottom:10px;display:block;width:100%;box-sizing:border-box";
  const saveBtn = mkEl("button", "btn btn-primary");
  saveBtn.style.cssText = "font-size:13px;padding:8px 18px";
  saveBtn.textContent = "Сохранить";
  const errMsg = mkEl("div", ""); errMsg.style.cssText = "color:#dc2626;font-size:13px;margin-top:6px;display:none";
  editForm.append(fName, fPhone, saveBtn, errMsg);
  card.append(editForm);

  editToggle.addEventListener("click", () => {
    const open = editForm.style.display !== "none";
    editForm.style.display = open ? "none" : "block";
    editToggle.textContent = open ? "Изменить" : "Отмена";
  });

  saveBtn.addEventListener("click", async () => {
    errMsg.style.display = "none";
    saveBtn.disabled = true; saveBtn.textContent = "Сохраняю…";
    try {
      await api.updateProfile({ name: fName.value.trim(), phone: fPhone.value.trim() });
      sToast("Данные обновлены");
      await renderProfile(container); // обновить страницу
    } catch (e) {
      errMsg.textContent = e.message || "Ошибка сохранения";
      errMsg.style.display = "block";
      saveBtn.disabled = false; saveBtn.textContent = "Сохранить";
    }
  });

  container.append(card);

  // --- личный дашборд: оборот / оплачено / долг с периодом и детализацией ---
  const dash = mkEl("div", "cabinet-card");
  dash.style.marginTop = "12px";
  dash.innerHTML = `<div style="padding:24px;text-align:center;color:var(--muted)">Загрузка данных…</div>`;
  container.append(dash);
  try {
    const inv = await api.invoices();
    renderDashboard(dash, inv.invoices || [], res);
  } catch (e) {
    dash.innerHTML = "";
    dash.append(el("p", { text: "Не удалось загрузить: " + (e.message || e), style: "color:var(--muted);padding:16px" }));
  }
}

// ---- Дашборд клиента: сколько закупил, оплатил и должен ----
const CUR_NAME = { som: "Сумы", usd: "Доллары", yuan: "Юани" };
const inPeriod = (d, p) => {
  if (p === "all") return true;
  const dt = new Date(d), now = new Date();
  if (p === "month") return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear();
  if (p === "year") return dt.getFullYear() === now.getFullYear();
  return true;
};
// суммы по валютам → строка «1 000 сум + ¥250»
function byCurStr(map) {
  const parts = [];
  ["som", "usd", "yuan"].forEach(c => { if (Math.abs(map[c] || 0) >= (c === "som" ? 1 : 0.01)) parts.push(fmt(map[c], c)); });
  return parts.length ? parts.join("  +  ") : "0";
}

function renderDashboard(box, invoices, me) {
  let period = "all";
  let openCard = null;   // turn | paid | debt | null

  function draw() {
    box.innerHTML = "";
    const list = invoices.filter(i => inPeriod(i.date, period));
    const turn = { som: 0, usd: 0, yuan: 0 }, paid = { som: 0, usd: 0, yuan: 0 }, debt = { som: 0, usd: 0, yuan: 0 };
    list.forEach(i => {
      const c = i.currency || "som";
      if (turn[c] === undefined) return;
      turn[c] += Number(i.total) || 0;
      paid[c] += Number(i.covered) || 0;
      debt[c] += Number(i.remaining) || 0;
    });

    // заголовок + период
    const head = mkEl("div", "");
    head.style.cssText = "display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px";
    head.append(el("div", { text: "Мои показатели", style: "font-size:15px;font-weight:700;color:var(--navy);flex:1" }));
    const tabs = mkEl("div", "");
    tabs.style.cssText = "display:flex;gap:4px;background:var(--bg2);padding:3px;border-radius:10px";
    [["month", "Месяц"], ["year", "Год"], ["all", "Всё время"]].forEach(([v, label]) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.style.cssText = "border:none;background:" + (period === v ? "var(--navy)" : "transparent") + ";color:" + (period === v ? "var(--white)" : "var(--muted)") + ";font-size:12px;font-weight:600;padding:6px 12px;border-radius:8px;cursor:pointer;transition:background .2s,color .2s";
      b.addEventListener("click", () => { period = v; draw(); });
      tabs.append(b);
    });
    head.append(tabs);
    box.append(head);

    // три карточки
    const grid = mkEl("div", "");
    grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px";
    const stat = (key, label, value, color, sub) => {
      const c = mkEl("div", "");
      const active = openCard === key;
      c.style.cssText = "padding:14px;border-radius:12px;background:var(--bg2);border:1.5px solid " + (active ? "var(--navy)" : "transparent") + ";cursor:pointer;transition:border-color .2s,transform .15s";
      c.addEventListener("click", () => { openCard = active ? null : key; draw(); });
      c.addEventListener("mouseenter", () => { c.style.transform = "translateY(-2px)"; });
      c.addEventListener("mouseleave", () => { c.style.transform = ""; });
      c.append(el("div", { text: label + " ›", style: "font-size:12px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.04em" }));
      c.append(el("div", { text: value, style: "font-size:18px;font-weight:800;color:" + color + ";margin-top:6px;word-break:break-word" }));
      if (sub) c.append(el("div", { text: sub, style: "font-size:12px;color:var(--muted);margin-top:2px" }));
      return c;
    };
    grid.append(
      stat("turn", "Оборот", byCurStr(turn), "var(--navy)", list.length + " накл."),
      stat("paid", "Оплачено", byCurStr(paid), "#16a34a"),
      stat("debt", "Мой долг", byCurStr(debt), byCurStr(debt) === "0" ? "#16a34a" : "#dc2626", byCurStr(debt) === "0" ? "долгов нет" : null),
    );
    box.append(grid);

    // аванс (переплата) — если есть
    const adv = me && me.advance;
    if (adv && ["som", "usd", "yuan"].some(c => (adv[c] || 0) > 0.001)) {
      box.append(el("div", {
        text: "Аванс (переплата): " + byCurStr(adv),
        style: "margin-top:10px;padding:10px 14px;border-radius:10px;background:rgba(34,197,94,.08);color:#16a34a;font-weight:600;font-size:13px",
      }));
    }

    if (openCard) box.append(buildDetails(openCard, list));
  }

  // детализация под карточками
  function buildDetails(kind, list) {
    const wrap = mkEl("div", "");
    wrap.style.cssText = "margin-top:14px;border-top:1px solid var(--border);padding-top:12px";
    const rows = kind === "turn" ? list
      : kind === "paid" ? list.filter(i => (Number(i.covered) || 0) > 0.001)
        : list.filter(i => (Number(i.remaining) || 0) > 0.001);
    const title = kind === "turn" ? "Накладные периода" : kind === "paid" ? "По каким накладным прошла оплата" : "За какие накладные есть долг";
    wrap.append(el("div", { text: title, style: "font-size:13px;font-weight:700;color:var(--navy);margin-bottom:10px" }));
    if (!rows.length) { wrap.append(el("div", { text: "Здесь пока пусто", style: "color:var(--muted);font-size:13px;padding:8px 0" })); return wrap; }

    rows.forEach(inv => {
      const cur = inv.currency || "som";
      const line = mkEl("div", "");
      line.style.cssText = "border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:8px;cursor:pointer;transition:border-color .2s";
      const right = kind === "paid" ? `оплачено ${fmt(inv.covered, cur)} из ${fmt(inv.total, cur)}`
        : kind === "debt" ? `осталось ${fmt(inv.remaining, cur)} из ${fmt(inv.total, cur)}`
          : fmt(inv.total, cur);
      const headRow = mkEl("div", "");
      headRow.style.cssText = "display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap";
      headRow.append(
        el("div", { text: new Date(inv.date).toLocaleDateString("ru-RU"), style: "font-weight:700;font-size:14px" }),
        el("div", { text: right, style: "font-size:13px;font-weight:600;color:" + (kind === "debt" ? "#dc2626" : kind === "paid" ? "#16a34a" : "var(--navy)") }),
      );
      const items = mkEl("div", "");
      items.style.cssText = "display:none;margin-top:10px;padding-top:8px;border-top:1px dashed var(--border)";
      (inv.items || []).forEach(it => {
        const r = mkEl("div", "");
        r.style.cssText = "display:flex;align-items:center;gap:10px;padding:6px 0;font-size:13px";
        if (it.photo) {
          const im = document.createElement("img");
          im.src = it.photo; im.loading = "lazy";
          im.style.cssText = "width:34px;height:34px;border-radius:7px;object-fit:cover;flex-shrink:0;cursor:zoom-in;border:1px solid var(--border)";
          im.onerror = () => { im.style.display = "none"; };
          im.addEventListener("click", (e) => { e.stopPropagation(); openPhoto(it.photo, it.product_name); });
          r.append(im);
        }
        r.append(el("span", { text: it.product_name, style: "flex:1;min-width:0" }));
        const c2 = it.currency || cur;
        r.append(el("span", {
          text: `${it.qty} × ${fmt(it.unit_price, c2)} = ${fmt(it.qty * it.unit_price, c2)}`,
          style: "color:var(--muted);white-space:nowrap",
        }));
        items.append(r);
      });
      line.addEventListener("click", () => {
        const open = items.style.display !== "none";
        items.style.display = open ? "none" : "block";
        line.style.borderColor = open ? "var(--border)" : "var(--navy)";
      });
      line.append(headRow, items);
      wrap.append(line);
    });
    return wrap;
  }

  draw();
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
    const lbl = STATUS_LABEL[o.status] || "Заказ";   // только известные подписи (значение из БД в HTML не вставляем)
    const src = o.source === "site" ? "с сайта" : o.source === "bot" ? "из бота" : "";
    head.innerHTML = `
      <div>
        <div style="font-size:13px;color:var(--muted)">${date}${src ? " · " + src : ""}</div>
      </div>
      <span class="order-badge ${cls}">${lbl}</span>`;
    const items = mkEl("div", "");
    const totals = { som: 0, usd: 0, yuan: 0 };
    let allPriced = true;
    (o.items || []).forEach(it => {
      const row = mkEl("div", "");
      row.style.cssText = "display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:14px";
      const cur = it.currency || o.currency || "som";
      const price = Number(it.unit_price) || 0;
      if (price > 0) { if (totals[cur] !== undefined) totals[cur] += it.qty * price; } else allPriced = false;
      // цена и сумма по позиции; если цену ещё не проставили — так и пишем
      const right = price > 0
        ? `× ${it.qty} · ${fmt(price, cur)} = ${fmt(it.qty * price, cur)}`
        : `× ${it.qty} · цена уточняется`;
      row.append(
        el("span", { text: it.product_name, style: "flex:1;min-width:0" }),
        el("span", { text: right, style: "color:var(--muted);white-space:nowrap" }),
      );
      items.append(row);
    });
    card.append(head, items);
    if (allPriced && ["som", "usd", "yuan"].some(c => totals[c] > 0.001)) {
      card.append(el("div", {
        text: "Итого по заказу: " + byCurStr(totals),
        style: "margin-top:10px;text-align:right;font-weight:700;font-size:15px;color:var(--navy)",
      }));
    }
    container.append(card);
  });
}

// ---- Накладные ----
let clientName = "";   // имя клиента для файлов (заполняется в профиле / при первом заходе сюда)

async function renderInvoices(container) {
  const res = await api.invoices();
  if (!clientName) { try { const me = await api.me(); clientName = me.customer?.name || ""; } catch {} }
  container.innerHTML = "";
  const invoices = res.invoices || [];
  if (!invoices.length) { container.append(emptyState("Оформленных накладных пока нет")); return; }
  invoices.forEach(inv => {
    const card = mkEl("div", "cabinet-card");
    card.style.marginBottom = "12px";
    // шапка накладной — кликабельная: список товаров и кнопки раскрываются по нажатию
    const head = mkEl("div", "");
    head.style.cssText = "display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;cursor:pointer;user-select:none";
    const date = new Date(inv.date).toLocaleDateString("ru-RU");
    const dCls = ({ paid: "paid", partial: "partial", debt: "debt" })[inv.status] || "debt";  // только известные классы
    const chevron = mkEl("span", "");
    chevron.textContent = "▸";
    chevron.style.cssText = "font-size:14px;color:var(--muted);transition:transform .18s;flex-shrink:0";
    const headLeft = mkEl("div", "");
    headLeft.style.cssText = "display:flex;align-items:center;gap:10px;flex:1;min-width:0";
    const headInfo = mkEl("div", "");
    headInfo.innerHTML = `
      <div style="font-size:15px;font-weight:700;color:var(--navy)">${fmt(inv.total, inv.currency)}</div>
      <div style="font-size:13px;color:var(--muted);margin-top:2px">${date} · ${(inv.items || []).length} поз.</div>`;
    headLeft.append(chevron, headInfo);
    const badge = mkEl("span", "debt-badge " + dCls);
    badge.textContent = DEBT_LABEL[inv.status] || "Долг";
    head.append(headLeft, badge);

    // всё, что раскрывается (товары + кнопки)
    const details = mkEl("div", "");
    details.style.cssText = "display:none;margin-top:12px";
    head.addEventListener("click", () => {
      const open = details.style.display !== "none";
      details.style.display = open ? "none" : "block";
      chevron.style.transform = open ? "" : "rotate(90deg)";
    });

    const items = mkEl("div", "");
    (inv.items || []).forEach(it => {
      const row = mkEl("div", "");
      row.style.cssText = "display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);font-size:13px";
      if (it.photo) {
        const im = document.createElement("img");
        im.src = it.photo; im.loading = "lazy";
        im.style.cssText = "width:40px;height:40px;border-radius:8px;object-fit:cover;flex-shrink:0;cursor:zoom-in;border:1px solid var(--border)";
        im.onerror = () => { im.style.display = "none"; };
        im.addEventListener("click", () => openPhoto(it.photo, it.product_name));
        row.append(im);
      }
      const nameEl = mkEl("span", ""); nameEl.style.cssText = "flex:1;min-width:0"; nameEl.textContent = it.product_name;
      const qtyEl = mkEl("span", ""); qtyEl.style.cssText = "color:var(--muted);flex-shrink:0"; qtyEl.textContent = `${it.qty} × ${fmt(it.unit_price, it.currency)}`;
      row.append(nameEl, qtyEl);
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
    xlsBtn.addEventListener("click", async () => {
      const old = xlsBtn.innerHTML;
      xlsBtn.disabled = true; xlsBtn.innerHTML = '<span class="s-spinner"></span> Готовим…';
      try {
        const { exportClientInvoiceExcel } = await import("../xlsx-export.js?v=20260808a");
        await exportClientInvoiceExcel(inv, clientName);
        sToast("Excel файл сохранён", "ok");
      } catch (e) { sToast("Ошибка: " + (e.message || e), "err"); }
      finally { xlsBtn.disabled = false; xlsBtn.innerHTML = old; }
    });
    btns.append(pdfBtn, xlsBtn);
    details.append(items, btns);
    card.append(head, details);
    container.append(card);
  });
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

// ---- Смена пароля ----
async function renderSecurity(container) {
  container.innerHTML = "";
  const card = mkEl("div", "cabinet-card");
  card.style.maxWidth = "440px";
  const title = el("div", { text: "Сменить пароль", style: "font-size:16px;font-weight:700;color:var(--navy);margin-bottom:16px" });
  card.append(title);

  function field(ph) {
    const i = document.createElement("input");
    i.type = "password"; i.className = "search-input"; i.placeholder = ph;
    i.style.cssText = "margin-bottom:10px;display:block;width:100%;box-sizing:border-box";
    return i;
  }
  const fCur = field("Текущий пароль");
  const fNew = field("Новый пароль (минимум 6 символов)");
  const fNew2 = field("Повторите новый пароль");
  const err = el("div", { style: "color:#dc2626;font-size:13px;margin:4px 0 8px;display:none" });
  const btn = mkEl("button", "btn btn-primary");
  btn.style.cssText = "font-size:14px;padding:9px 20px"; btn.textContent = "Сменить пароль";
  card.append(fCur, fNew, fNew2, err, btn);

  btn.addEventListener("click", async () => {
    err.style.display = "none";
    const cur = fCur.value, np = fNew.value, np2 = fNew2.value;
    if (!cur || !np) { err.textContent = "Заполните все поля"; err.style.display = "block"; return; }
    if (np.length < 6) { err.textContent = "Новый пароль не менее 6 символов"; err.style.display = "block"; return; }
    if (np !== np2) { err.textContent = "Пароли не совпадают"; err.style.display = "block"; return; }
    btn.disabled = true; btn.textContent = "Сохраняю…";
    try {
      await api.changePassword(cur, np);
      sToast("Пароль изменён", "ok");
      fCur.value = fNew.value = fNew2.value = "";
    } catch (e) {
      err.textContent = e.message || "Ошибка"; err.style.display = "block";
    }
    btn.disabled = false; btn.textContent = "Сменить пароль";
  });

  container.append(card);
}

function emptyState(text) {
  const w = mkEl("div", "s-empty cabinet-card");
  w.innerHTML = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".3"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg><p>${escHtml(text)}</p>`;
  return w;
}
function escHtml(s) { return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

// Полноэкранный просмотр фото товара (клик по миниатюре в накладной)
function openPhoto(src, name) {
  const ov = document.createElement("div");
  ov.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.9);display:flex;align-items:center;justify-content:center;cursor:zoom-out;padding:16px";
  const img = document.createElement("img");
  img.src = src; img.alt = name || "";
  img.style.cssText = "max-width:92vw;max-height:82vh;border-radius:12px;object-fit:contain;box-shadow:0 20px 60px rgba(0,0,0,.6)";
  img.addEventListener("click", e => e.stopPropagation());
  if (name) { const cap = document.createElement("div"); cap.textContent = name; cap.style.cssText = "position:absolute;bottom:18px;left:0;right:0;text-align:center;color:#fff;font-size:14px;padding:0 16px"; ov.append(cap); }
  ov.addEventListener("click", () => ov.remove());
  document.addEventListener("keydown", function esc(e) { if (e.key === "Escape") { ov.remove(); document.removeEventListener("keydown", esc); } });
  ov.append(img); document.body.append(ov);
}

// SVG иконки (inline, без внешних зависимостей)
function svgUser()    { const s=mkEl("svg",""); s.setAttribute("width","16"); s.setAttribute("height","16"); s.setAttribute("viewBox","0 0 24 24"); s.setAttribute("fill","none"); s.setAttribute("stroke","currentColor"); s.setAttribute("stroke-width","2"); s.innerHTML=`<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>`; return s; }
function svgCart()    { const s=mkEl("svg",""); s.setAttribute("width","16"); s.setAttribute("height","16"); s.setAttribute("viewBox","0 0 24 24"); s.setAttribute("fill","none"); s.setAttribute("stroke","currentColor"); s.setAttribute("stroke-width","2"); s.innerHTML=`<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>`; return s; }
function svgReceipt() { const s=mkEl("svg",""); s.setAttribute("width","16"); s.setAttribute("height","16"); s.setAttribute("viewBox","0 0 24 24"); s.setAttribute("fill","none"); s.setAttribute("stroke","currentColor"); s.setAttribute("stroke-width","2"); s.innerHTML=`<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>`; return s; }
function svgWallet()  { const s=mkEl("svg",""); s.setAttribute("width","16"); s.setAttribute("height","16"); s.setAttribute("viewBox","0 0 24 24"); s.setAttribute("fill","none"); s.setAttribute("stroke","currentColor"); s.setAttribute("stroke-width","2"); s.innerHTML=`<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>`; return s; }
function svgDownload(){ const s=mkEl("svg",""); s.setAttribute("width","14"); s.setAttribute("height","14"); s.setAttribute("viewBox","0 0 24 24"); s.setAttribute("fill","none"); s.setAttribute("stroke","currentColor"); s.setAttribute("stroke-width","2"); s.innerHTML=`<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>`; return s; }
function svgLock()    { const s=mkEl("svg",""); s.setAttribute("width","16"); s.setAttribute("height","16"); s.setAttribute("viewBox","0 0 24 24"); s.setAttribute("fill","none"); s.setAttribute("stroke","currentColor"); s.setAttribute("stroke-width","2"); s.innerHTML=`<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>`; return s; }
