// Панель администратора на публичном сайте
import { req } from "./api.js";

function apToast(msg, type = "") {
  let wrap = document.querySelector(".s-toasts");
  if (!wrap) { wrap = document.createElement("div"); wrap.className = "s-toasts"; document.body.append(wrap); }
  const t = document.createElement("div"); t.className = "s-toast " + type; t.textContent = msg;
  wrap.append(t);
  setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .3s"; setTimeout(() => t.remove(), 300); }, 3000);
}

const STATUS_LABELS = {
  order: "Новый заказ", pending_confirm: "Ждёт подтверждения",
  confirmed: "Подтверждён", final: "Оформлен",
};
const STATUS_CLASS = {
  order: "order", pending_confirm: "pending", confirmed: "confirmed", final: "final",
};

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
function fmtDebt(debt) {
  if (!debt) return "—";
  const parts = [];
  if (Math.abs(debt.som)   > 0.5) parts.push((debt.som   < 0 ? "+" : "") + Math.abs(Math.round(debt.som)).toLocaleString("ru") + " сум");
  if (Math.abs(debt.usd)   > 0.01) parts.push((debt.usd   < 0 ? "+" : "") + Math.abs(debt.usd.toFixed(2)) + " $");
  if (Math.abs(debt.yuan)  > 0.01) parts.push((debt.yuan  < 0 ? "+" : "") + Math.abs(debt.yuan.toFixed(2)) + " ¥");
  return parts.length ? parts.join(", ") : "Нет долга";
}
function hasDebt(debt) {
  if (!debt) return false;
  return (debt.som > 0.5 || debt.usd > 0.01 || debt.yuan > 0.01);
}

function mkEl(tag, cls = "") {
  const e = document.createElement(tag);
  if (cls) cls.split(" ").forEach(c => c && e.classList.add(c));
  return e;
}

export async function renderAdminPanel(container) {
  container.innerHTML = "";

  // Заголовок панели
  const topBar = mkEl("div", "ap-topbar");
  topBar.innerHTML = `
    <div class="ap-title-wrap">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
      <h1 class="ap-title">Панель администратора</h1>
    </div>
    <a href="/admin" class="btn-warehouse">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
      Открыть склад
    </a>`;
  container.append(topBar);

  // Статистика (заполнится после загрузки)
  const stats = mkEl("div", "ap-stats");
  stats.innerHTML = `
    <div class="ap-stat-card" id="ap-stat-clients"><div class="ap-stat-num">—</div><div class="ap-stat-label">Клиентов</div></div>
    <div class="ap-stat-card" id="ap-stat-orders"><div class="ap-stat-num">—</div><div class="ap-stat-label">Заказов с сайта</div></div>
    <div class="ap-stat-card ap-stat-warn" id="ap-stat-new"><div class="ap-stat-num">—</div><div class="ap-stat-label">Новых (ожидают)</div></div>
    <div class="ap-stat-card ap-stat-debt" id="ap-stat-debtors"><div class="ap-stat-num">—</div><div class="ap-stat-label">Клиентов с долгом</div></div>`;
  container.append(stats);

  // Табы
  const tabsEl = mkEl("div", "s-tabs");
  tabsEl.style.marginBottom = "0";
  const tabs = [
    { id: "clients", label: "Клиенты" },
    { id: "orders",  label: "Заказы" },
  ];
  tabs.forEach(tab => {
    const btn = mkEl("button", "s-tab" + (tab.id === "clients" ? " active" : ""));
    btn.textContent = tab.label; btn.dataset.tab = tab.id;
    btn.addEventListener("click", () => {
      tabsEl.querySelectorAll(".s-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab.id));
      renderTab(tab.id);
    });
    tabsEl.append(btn);
  });
  container.append(tabsEl);

  const tabContent = mkEl("div", "ap-tab-content");
  container.append(tabContent);

  // Загрузка данных
  let clientsData = [], ordersData = [];

  async function loadAll() {
    try {
      const [cRes, oRes] = await Promise.all([
        req("GET", "/api/admin-site/clients"),
        req("GET", "/api/admin-site/orders"),
      ]);
      clientsData = cRes.clients || [];
      ordersData = oRes.orders || [];

      // Обновляем статистику
      const newOrders = ordersData.filter(o => o.status === "order").length;
      const debtors = clientsData.filter(c => hasDebt(c.debt)).length;
      document.getElementById("ap-stat-clients").querySelector(".ap-stat-num").textContent = clientsData.length;
      document.getElementById("ap-stat-orders").querySelector(".ap-stat-num").textContent = ordersData.length;
      document.getElementById("ap-stat-new").querySelector(".ap-stat-num").textContent = newOrders;
      document.getElementById("ap-stat-debtors").querySelector(".ap-stat-num").textContent = debtors;

      renderTab(tabsEl.querySelector(".s-tab.active")?.dataset.tab || "clients");
    } catch (e) {
      const errDiv = document.createElement("div"); errDiv.className = "s-empty";
      const errP = document.createElement("p"); errP.textContent = "Ошибка загрузки: " + e.message;
      errDiv.append(errP); tabContent.innerHTML = ""; tabContent.append(errDiv);
    }
  }

  function renderTab(tabId) {
    tabContent.innerHTML = "";
    if (tabId === "clients") renderClients();
    else renderOrders();
  }

  // ---- Вкладка «Клиенты» ----
  function renderClients() {
    if (!clientsData.length) {
      tabContent.innerHTML = `<div class="s-empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg><p>Клиентов пока нет</p></div>`;
      return;
    }

    // Поиск
    const searchRow = mkEl("div", "ap-search-row");
    const si = document.createElement("input"); si.className = "search-input"; si.placeholder = "Поиск по имени или телефону…"; si.type = "search";
    searchRow.append(si);
    tabContent.append(searchRow);

    const list = mkEl("div", "ap-client-list");
    tabContent.append(list);

    function renderList(filter = "") {
      list.innerHTML = "";
      const filt = filter.toLowerCase();
      const shown = filter
        ? clientsData.filter(c => (c.name || "").toLowerCase().includes(filt) || (c.phone || "").includes(filt))
        : clientsData;

      if (!shown.length) { list.innerHTML = `<div class="s-empty" style="padding:24px"><p>Не найдено</p></div>`; return; }

      shown.forEach(c => {
        const row = mkEl("div", "ap-client-row");
        const left = mkEl("div", "ap-client-left");
        const ava = mkEl("div", "ap-client-avatar");
        ava.textContent = (c.name || c.phone || "?")[0].toUpperCase();

        const info = mkEl("div", "ap-client-info");
        const nameEl = mkEl("div", "ap-client-name"); nameEl.textContent = c.name || c.phone;
        const metaEl = mkEl("div", "ap-client-meta");
        metaEl.textContent = `+998 ${c.phone} · Заказов: ${c.orders_count}`;
        if (c.tg_verified) {
          const tg = mkEl("span", "ap-verified"); tg.textContent = " · Telegram ✓";
          metaEl.append(tg);
        }
        info.append(nameEl, metaEl);
        left.append(ava, info);

        const right2 = mkEl("div", "ap-client-right");

        // Долг
        const debtEl = mkEl("div", "ap-client-debt");
        if (hasDebt(c.debt)) {
          debtEl.className = "ap-client-debt has-debt";
          debtEl.textContent = "Долг: " + fmtDebt(c.debt);
        } else {
          debtEl.textContent = "Нет долга";
        }

        const dates = mkEl("div", "ap-client-dates");
        dates.textContent = "Рег: " + fmtDate(c.created_at) + (c.last_login ? " · Вход: " + fmtDate(c.last_login) : "");

        // Кнопка «Заказы»
        const ordersBtn = mkEl("button", "btn-ghost");
        ordersBtn.style.cssText = "padding:6px 12px;font-size:12px";
        ordersBtn.textContent = "Заказы";
        ordersBtn.addEventListener("click", () => openClientOrders(c, row));

        // Кнопка «Удалить»
        const delBtn = mkEl("button", "ap-del-btn");
        delBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
        delBtn.title = "Удалить клиента и заблокировать номер";
        delBtn.addEventListener("click", () => confirmDelete(c, row));

        right2.append(debtEl, dates, mkEl("div", "ap-client-actions"));
        right2.querySelector(".ap-client-actions").append(ordersBtn, delBtn);
        row.append(left, right2);
        list.append(row);
      });
    }

    si.addEventListener("input", () => renderList(si.value));
    renderList();
  }

  // ---- Раскрыть заказы клиента ----
  function openClientOrders(c, row) {
    const existing = row.nextElementSibling;
    if (existing?.classList.contains("ap-client-orders-expand")) { existing.remove(); return; }

    const expand = mkEl("div", "ap-client-orders-expand");
    expand.innerHTML = `<div class="s-empty" style="padding:16px"><span class="s-spinner" style="border-color:rgba(0,0,0,.1);border-top-color:var(--navy);display:inline-block;width:20px;height:20px;border-width:2px"></span></div>`;
    row.after(expand);

    const clientOrders = ordersData.filter(o => o.customer_id === c.customer_id);
    if (!clientOrders.length) {
      expand.innerHTML = `<div style="padding:14px 20px;color:var(--muted);font-size:13px">Заказов с сайта нет</div>`;
      return;
    }

    const tbl = mkEl("table", "s-table");
    tbl.style.cssText = "margin:0";
    tbl.innerHTML = `<thead><tr><th>Дата</th><th>Товаров</th><th>Статус</th></tr></thead>`;
    const tbody = document.createElement("tbody");
    clientOrders.forEach(o => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${fmtDate(o.date)}</td>
        <td>${o.items_count || o.items.length} шт.</td>
        <td><span class="order-badge ${STATUS_CLASS[o.status] || "order"}">${STATUS_LABELS[o.status] || o.status}</span></td>`;
      tbody.append(tr);
    });
    tbl.append(tbody);
    expand.innerHTML = ""; expand.append(tbl);
  }

  // ---- Подтверждение удаления ----
  function confirmDelete(c, row) {
    const msg = `Удалить «${c.name || c.phone}» и заблокировать номер +998 ${c.phone}?`;
    if (!confirm(msg)) return;
    row.style.opacity = "0.5";
    req("POST", "/api/admin-site/delete-client", { account_id: c.id })
      .then(() => {
        apToast("Клиент удалён, номер заблокирован", "ok");
        row.remove();
        clientsData = clientsData.filter(cl => cl.id !== c.id);
        document.getElementById("ap-stat-clients").querySelector(".ap-stat-num").textContent = clientsData.length;
      })
      .catch(e => { apToast("Ошибка: " + e.message, "err"); row.style.opacity = "1"; });
  }

  // ---- Вкладка «Заказы» ----
  function renderOrders() {
    if (!ordersData.length) {
      tabContent.innerHTML = `<div class="s-empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg><p>Заказов с сайта пока нет</p></div>`;
      return;
    }

    const card = mkEl("div", "cabinet-card");
    const tbl = mkEl("table", "s-table");
    tbl.innerHTML = `<thead><tr><th>Дата</th><th>Клиент</th><th>Товаров</th><th>Статус</th></tr></thead>`;
    const tbody = document.createElement("tbody");
    ordersData.forEach(o => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${fmtDate(o.date)}</td>
        <td>${o.customer_name}</td>
        <td>${o.items_count} шт.</td>
        <td><span class="order-badge ${STATUS_CLASS[o.status] || "order"}">${STATUS_LABELS[o.status] || o.status}</span></td>`;
      tbody.append(tr);
    });
    tbl.append(tbody);
    card.append(tbl);
    tabContent.append(card);
  }

  tabContent.innerHTML = `<div style="padding:40px;text-align:center"><span class="s-spinner" style="width:28px;height:28px;border-width:2.5px;border-color:rgba(0,0,0,.08);border-top-color:var(--navy);display:inline-block"></span></div>`;
  await loadAll();
}
