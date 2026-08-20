// Панель администратора на публичном сайте
import { req, saveToken } from "./api.js?v=20260820g";

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

// Экранирование пользовательских данных перед вставкой в innerHTML (защита от XSS)
function esc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
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
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn-ghost" id="ap-change-pass" style="padding:8px 14px;font-size:13px;font-weight:600">🔒 Сменить мой пароль</button>
      <a href="/admin" class="btn-warehouse">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
        Открыть склад
      </a>
    </div>`;
  container.append(topBar);
  topBar.querySelector("#ap-change-pass").addEventListener("click", () => openAdminPassword());

  // Смена пароля администратора (у админа нет доступа к кабинету — меняем здесь)
  function openAdminPassword() {
    const ov = mkEl("div");
    ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px";
    const card = mkEl("div");
    card.style.cssText = "background:var(--bg,#fff);border-radius:14px;padding:22px;max-width:380px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.3)";
    card.innerHTML = `<h3 style="margin:0 0 14px;font-size:17px">🔒 Сменить мой пароль</h3>`;
    const mk = (ph) => { const i = document.createElement("input"); i.type = "password"; i.placeholder = ph; i.className = "search-input"; i.style.cssText = "display:block;width:100%;box-sizing:border-box;margin-bottom:10px;padding:9px 12px"; return i; };
    const cur = mk("Текущий пароль"), np = mk("Новый пароль (мин. 6)"), np2 = mk("Повторите новый пароль");
    const err = mkEl("div"); err.style.cssText = "color:var(--err,#dc2626);font-size:13px;margin-bottom:8px;display:none";
    const rowB = mkEl("div"); rowB.style.cssText = "display:flex;gap:8px;justify-content:flex-end;margin-top:6px";
    const cancel = mkEl("button", "btn-ghost"); cancel.textContent = "Отмена"; cancel.style.cssText = "padding:8px 14px;font-size:13px";
    const save = mkEl("button", "btn-primary"); save.textContent = "Сохранить"; save.style.cssText = "padding:8px 16px;font-size:13px;font-weight:600";
    cancel.addEventListener("click", () => ov.remove());
    ov.addEventListener("click", (e) => { if (e.target === ov) ov.remove(); });
    save.addEventListener("click", async () => {
      err.style.display = "none";
      if (!cur.value || !np.value) { err.textContent = "Заполните все поля"; err.style.display = ""; return; }
      if (np.value.length < 6) { err.textContent = "Новый пароль не менее 6 символов"; err.style.display = ""; return; }
      if (np.value !== np2.value) { err.textContent = "Пароли не совпадают"; err.style.display = ""; return; }
      save.disabled = true; save.textContent = "Сохраняю…";
      try { await req("POST", "/client/change-password", { current: cur.value, new: np.value }); apToast("Пароль изменён", "ok"); ov.remove(); }
      catch (e) { err.textContent = e.message; err.style.display = ""; save.disabled = false; save.textContent = "Сохранить"; }
    });
    rowB.append(cancel, save);
    card.append(cur, np, np2, err, rowB);
    ov.append(card); document.body.append(ov);
  }

  // Статистика (заполнится после загрузки)
  const stats = mkEl("div", "ap-stats");
  stats.innerHTML = `
    <div class="ap-stat-card" id="ap-stat-clients"><div class="ap-stat-num">—</div><div class="ap-stat-label">Клиентов</div></div>
    <div class="ap-stat-card" id="ap-stat-orders"><div class="ap-stat-num">—</div><div class="ap-stat-label">Заказов с сайта</div></div>
    <div class="ap-stat-card ap-stat-warn" id="ap-stat-new"><div class="ap-stat-num">—</div><div class="ap-stat-label">Новых (ожидают)</div></div>
    <div class="ap-stat-card ap-stat-debt" id="ap-stat-debtors"><div class="ap-stat-num">—</div><div class="ap-stat-label">Клиентов с долгом</div></div>`;
  container.append(stats);

  // ссылки на числа статистики (container может быть ещё не в документе — getElementById вернул бы null)
  const statNums = {
    clients:  stats.querySelector("#ap-stat-clients .ap-stat-num"),
    orders:   stats.querySelector("#ap-stat-orders .ap-stat-num"),
    new:      stats.querySelector("#ap-stat-new .ap-stat-num"),
    debtors:  stats.querySelector("#ap-stat-debtors .ap-stat-num"),
  };
  const setStat = (k, v) => { if (statNums[k]) statNums[k].textContent = v; };

  // Табы
  const tabsEl = mkEl("div", "s-tabs");
  tabsEl.style.marginBottom = "0";
  const tabs = [
    { id: "clients", label: "Клиенты" },
    { id: "orders",  label: "Заказы" },
    { id: "reports", label: "Отчёты" },
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
        req("GET", "/admin-site/clients"),
        req("GET", "/admin-site/orders"),
      ]);
      clientsData = cRes.clients || [];
      ordersData = oRes.orders || [];

      // Обновляем статистику (через сохранённые ссылки — без getElementById)
      const newOrders = ordersData.filter(o => o.status === "order").length;
      const debtors = clientsData.filter(c => hasDebt(c.debt)).length;
      setStat("clients", clientsData.length);
      setStat("orders", ordersData.length);
      setStat("new", newOrders);
      setStat("debtors", debtors);

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
    else if (tabId === "reports") renderReports();
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
        const nameEl = mkEl("div", "ap-client-name");
        nameEl.textContent = c.name || c.phone;
        // происхождение
        const origin = mkEl("span", "ap-origin-badge " + (c.origin === "warehouse" ? "wh" : "site"));
        origin.style.cssText = "margin-left:8px;font-size:11px;font-weight:600;padding:2px 8px;border-radius:10px;" +
          (c.origin === "warehouse"
            ? "background:#fef3c7;color:#92400e"
            : "background:#dbeafe;color:#1e40af");
        origin.textContent = c.origin === "warehouse" ? "🏪 был в складе" : "🌐 с сайта";
        nameEl.append(origin);

        const metaEl = mkEl("div", "ap-client-meta");
        metaEl.textContent = `+998 ${c.phone} · Заказов: ${c.orders_count}`;
        // ник: ярлык владельца или @username
        const nick = c.tg_nick || (c.tg_username ? "@" + c.tg_username : null);
        if (nick) {
          const ns = mkEl("span", "ap-nick"); ns.style.cssText = "color:var(--navy);font-weight:600";
          ns.textContent = " · " + nick;
          metaEl.append(ns);
        }
        if (c.tg_verified) {
          const tg = mkEl("span", "ap-verified"); tg.textContent = " · Telegram ✓";
          metaEl.append(tg);
        }
        info.append(nameEl, metaEl);
        left.append(ava, info);
        // клик по имени/аватару → карточка клиента
        left.style.cursor = "pointer";
        left.title = "Открыть карточку клиента";
        left.addEventListener("click", () => openClientDetail(c, row));

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

        // Кнопка «Кабинет клиента» (просмотр того, что видит клиент)
        const openBtn = mkEl("button", "btn-primary");
        openBtn.style.cssText = "padding:6px 12px;font-size:12px;font-weight:600";
        openBtn.textContent = "👁 Кабинет клиента";
        openBtn.addEventListener("click", () => openClientDetail(c, row));

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

        const actions = mkEl("div", "ap-client-actions");
        actions.append(openBtn, ordersBtn, delBtn);
        right2.append(debtEl, dates, actions);
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
        <td>${esc(o.items_count || o.items.length)} шт.</td>
        <td><span class="order-badge ${STATUS_CLASS[o.status] || "order"}">${esc(STATUS_LABELS[o.status] || o.status)}</span></td>`;
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
    req("POST", "/admin-site/delete-client", { account_id: c.id })
      .then(() => {
        apToast("Клиент удалён, номер заблокирован", "ok");
        row.remove();
        clientsData = clientsData.filter(cl => cl.id !== c.id);
        setStat("clients", clientsData.length);
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
    const hint = mkEl("div"); hint.style.cssText = "font-size:13px;color:var(--muted);margin-bottom:10px";
    hint.textContent = "Подтвердите заказ здесь, а цены проставьте в Складе → Заказы.";
    card.append(hint);
    const tbl = mkEl("table", "s-table");
    tbl.innerHTML = `<thead><tr><th>Дата</th><th>Клиент</th><th>Товаров</th><th>Статус</th><th></th></tr></thead>`;
    const tbody = document.createElement("tbody");
    ordersData.forEach(o => {
      const tr = document.createElement("tr");
      const statusTd = document.createElement("td");
      const badge = mkEl("span", "order-badge " + (STATUS_CLASS[o.status] || "order"));
      badge.textContent = STATUS_LABELS[o.status] || o.status;
      statusTd.append(badge);

      const actTd = document.createElement("td"); actTd.className = "right";
      if (o.status !== "final" && o.status !== "confirmed") {
        const okBtn = mkEl("button", "btn-primary");
        okBtn.style.cssText = "padding:6px 12px;font-size:12px;font-weight:600";
        okBtn.textContent = "✅ Подтвердить";
        okBtn.addEventListener("click", async () => {
          okBtn.disabled = true;
          try {
            await req("POST", "/admin-site/order-status", { sale_id: o.id, status: "confirmed" });
            o.status = "confirmed";
            badge.className = "order-badge " + (STATUS_CLASS.confirmed || "confirmed");
            badge.textContent = STATUS_LABELS.confirmed || "Подтверждён";
            okBtn.remove();
            apToast("Заказ подтверждён", "ok");
          } catch (e) { apToast("Ошибка: " + e.message, "err"); okBtn.disabled = false; }
        });
        actTd.append(okBtn);
      }

      const c1 = document.createElement("td"); c1.textContent = fmtDate(o.date);
      const c2 = document.createElement("td"); c2.textContent = o.customer_name || "—";
      const c3 = document.createElement("td"); c3.textContent = (o.items_count || 0) + " шт.";
      tr.append(c1, c2, c3, statusTd, actTd);
      tbody.append(tr);
    });
    tbl.append(tbody);
    card.append(tbl);
    tabContent.append(card);
  }

  // ---- Карточка клиента (кабинет): долг, топ-товары, оплаты, накладные ----
  async function openClientDetail(c, row) {
    const existing = row.nextElementSibling;
    if (existing?.classList.contains("ap-client-detail-expand")) { existing.remove(); return; }
    // закрыть прочие раскрытия рядом
    if (existing?.classList.contains("ap-client-orders-expand")) existing.remove();

    const box = mkEl("div", "ap-client-detail-expand");
    box.style.cssText = "padding:16px 20px;background:var(--bg-soft,#f7f8fa);border-radius:12px;margin:4px 0 10px";
    box.innerHTML = `<div class="s-empty" style="padding:16px"><span class="s-spinner" style="border-color:rgba(0,0,0,.1);border-top-color:var(--navy);display:inline-block;width:20px;height:20px;border-width:2px"></span></div>`;
    row.after(box);

    let d;
    try { d = await req("GET", `/admin-site/client-detail?account_id=${encodeURIComponent(c.id)}`); }
    catch (e) { box.innerHTML = `<div style="color:var(--err,#c00);padding:8px">Ошибка: ${esc(e.message)}</div>`; return; }

    const nick = d.account?.tg_nick || (d.account?.tg_username ? "@" + d.account.tg_username : "");
    box.innerHTML = "";

    // Баннер: это «кабинет клиента» — то, что видит сам клиент
    const banner = mkEl("div");
    banner.style.cssText = "display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--navy);background:rgba(28,43,74,.06);border-radius:8px;padding:8px 12px;margin-bottom:12px";
    banner.textContent = "👁 Кабинет клиента — то, что видит сам клиент (долг, заказы, оплаты, накладные)";
    box.append(banner);

    // Шапка карточки: имя + долг + ник-редактор + сброс пароля
    const head = mkEl("div", "ap-detail-head");
    head.style.cssText = "display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-bottom:12px";
    const title = mkEl("div");
    title.innerHTML = `<div style="font-weight:700;font-size:16px">${esc(c.name || c.phone)}</div>
      <div style="font-size:13px;color:var(--muted)">+998 ${esc(c.phone)} · ${c.origin === "warehouse" ? "🏪 был в складе" : "🌐 с сайта"}</div>`;
    const debtBig = mkEl("div");
    debtBig.style.cssText = "font-weight:700;" + (hasDebt(d.debt) ? "color:var(--err,#c0392b)" : "color:var(--ok,#27ae60)");
    debtBig.textContent = hasDebt(d.debt) ? "Долг: " + fmtDebt(d.debt) : "Нет долга";
    head.append(title, debtBig);
    box.append(head);

    // Ярлык (ник владельца) — редактирование
    const nickRow = mkEl("div"); nickRow.style.cssText = "display:flex;gap:8px;align-items:center;margin-bottom:14px;flex-wrap:wrap";
    const nickInput = document.createElement("input");
    nickInput.className = "search-input"; nickInput.style.cssText = "max-width:240px;padding:6px 10px;font-size:13px";
    nickInput.placeholder = "Ярлык (виден только вам)"; nickInput.value = d.account?.tg_nick || "";
    const nickSave = mkEl("button", "btn-ghost"); nickSave.style.cssText = "padding:6px 12px;font-size:12px"; nickSave.textContent = "Сохранить ярлык";
    nickSave.addEventListener("click", async () => {
      nickSave.disabled = true;
      try {
        await req("POST", "/admin-site/update-client", { account_id: c.id, tg_nick: nickInput.value.trim() });
        c.tg_nick = nickInput.value.trim();
        apToast("Ярлык сохранён", "ok");
      } catch (e) { apToast("Ошибка: " + e.message, "err"); }
      nickSave.disabled = false;
    });
    const tgLabel = mkEl("span"); tgLabel.style.cssText = "font-size:12px;color:var(--muted)";
    tgLabel.textContent = d.account?.tg_username ? "Telegram: @" + d.account.tg_username : "Telegram: —";
    nickRow.append(nickInput, nickSave, tgLabel);
    box.append(nickRow);

    // Телефон (логин на сайт) — редактирование для удобного входа
    const phoneRow = mkEl("div"); phoneRow.style.cssText = "display:flex;gap:8px;align-items:center;margin-bottom:14px;flex-wrap:wrap";
    const phoneInput = document.createElement("input");
    phoneInput.className = "search-input"; phoneInput.style.cssText = "max-width:200px;padding:6px 10px;font-size:13px";
    phoneInput.placeholder = "Телефон для входа"; phoneInput.value = c.phone || "";
    const phoneSave = mkEl("button", "btn-ghost"); phoneSave.style.cssText = "padding:6px 12px;font-size:12px"; phoneSave.textContent = "Сохранить телефон";
    phoneSave.addEventListener("click", async () => {
      const np = phoneInput.value.replace(/\D/g, "");
      if (np.length < 7) { apToast("Телефон: минимум 7 цифр", "err"); return; }
      phoneSave.disabled = true;
      try {
        await req("POST", "/admin-site/update-client", { account_id: c.id, phone: np });
        c.phone = np;
        apToast("Телефон обновлён — клиент входит по новому номеру", "ok");
      } catch (e) { apToast("Ошибка: " + e.message, "err"); }
      phoneSave.disabled = false;
    });
    const phoneHint = mkEl("span"); phoneHint.style.cssText = "font-size:12px;color:var(--muted)";
    phoneHint.textContent = "это логин клиента на сайт";
    phoneRow.append(phoneInput, phoneSave, phoneHint);
    box.append(phoneRow);

    // Сброс пароля
    const pwRow = mkEl("div"); pwRow.style.cssText = "margin-bottom:16px";
    const pwBtn = mkEl("button", "btn-ghost"); pwBtn.style.cssText = "padding:6px 12px;font-size:12px";
    pwBtn.textContent = "🔑 Сбросить пароль клиенту";
    pwBtn.addEventListener("click", async () => {
      const np = prompt(`Новый пароль для «${c.name || c.phone}» (минимум 6 символов):`);
      if (np == null) return;
      if (np.length < 6) { apToast("Пароль не менее 6 символов", "err"); return; }
      try { await req("POST", "/admin-site/reset-client-password", { account_id: c.id, new: np }); apToast("Пароль сброшен", "ok"); }
      catch (e) { apToast("Ошибка: " + e.message, "err"); }
    });
    // Войти как этот клиент (тест клиентского опыта) — без пароля/кода
    const impBtn = mkEl("button", "btn-primary"); impBtn.style.cssText = "padding:6px 12px;font-size:12px;font-weight:600;margin-left:8px";
    impBtn.textContent = "🔓 Войти как этот клиент (тест)";
    impBtn.addEventListener("click", async () => {
      try {
        const r = await req("POST", "/admin-site/impersonate", { account_id: c.id });
        const owner = localStorage.getItem("gm_client_token");
        if (owner) localStorage.setItem("gm_owner_token", owner); // чтобы вернуться владельцем
        saveToken(r.token);
        apToast("Вход как клиент…", "ok");
        location.hash = "#cabinet"; location.reload();
      } catch (e) { apToast("Ошибка: " + e.message, "err"); }
    });
    pwRow.append(pwBtn, impBtn);
    box.append(pwRow);

    // Топ-товары
    const cols = mkEl("div"); cols.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px";

    const topCard = mkEl("div", "cabinet-card");
    topCard.innerHTML = `<h3 style="margin:0 0 8px;font-size:14px">Топ заказанных товаров</h3>`;
    if (d.top_products?.length) {
      const t = mkEl("table", "s-table"); t.style.margin = "0";
      t.innerHTML = `<thead><tr><th>Товар</th><th style="text-align:right">Кол-во</th><th style="text-align:right">Цена</th></tr></thead>`;
      const tb = document.createElement("tbody");
      d.top_products.slice(0, 10).forEach(p => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${esc(p.name)}</td><td style="text-align:right">${esc(p.qty)}</td><td style="text-align:right">${esc(Math.round(p.last_price || 0).toLocaleString("ru"))} ${esc(curSym(p.currency))}</td>`;
        tb.append(tr);
      });
      t.append(tb); topCard.append(t);
    } else { topCard.append(emptyNote("Заказов нет")); }

    // Последние оплаты
    const payCard = mkEl("div", "cabinet-card");
    payCard.innerHTML = `<h3 style="margin:0 0 8px;font-size:14px">Последние оплаты</h3>`;
    if (d.payments?.length) {
      const t = mkEl("table", "s-table"); t.style.margin = "0";
      t.innerHTML = `<thead><tr><th>Дата</th><th style="text-align:right">Сумма</th></tr></thead>`;
      const tb = document.createElement("tbody");
      d.payments.slice(0, 10).forEach(p => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${fmtDate(p.date)}</td><td style="text-align:right">${esc(Math.round(p.amount || 0).toLocaleString("ru"))} ${esc(curSym(p.currency))}</td>`;
        tb.append(tr);
      });
      t.append(tb); payCard.append(t);
    } else { payCard.append(emptyNote("Оплат нет")); }

    cols.append(topCard, payCard);
    box.append(cols);

    // Накладные
    const invCard = mkEl("div", "cabinet-card"); invCard.style.marginTop = "16px";
    invCard.innerHTML = `<h3 style="margin:0 0 8px;font-size:14px">Накладные (${d.invoices?.length || 0})</h3>`;
    if (d.invoices?.length) {
      const t = mkEl("table", "s-table"); t.style.margin = "0";
      t.innerHTML = `<thead><tr><th>Дата</th><th>Статус</th><th style="text-align:right">Позиций</th><th style="text-align:right">Сумма</th></tr></thead>`;
      const tb = document.createElement("tbody");
      d.invoices.slice(0, 30).forEach(iv => {
        const totals = Object.entries(iv.totals || {}).map(([cur, v]) => Math.round(v).toLocaleString("ru") + " " + curSym(cur)).join(", ");
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${fmtDate(iv.date)}</td>
          <td><span class="order-badge ${STATUS_CLASS[iv.status] || "order"}">${esc(STATUS_LABELS[iv.status] || iv.status)}</span></td>
          <td style="text-align:right">${esc(iv.items_count)}</td>
          <td style="text-align:right">${esc(totals || "—")}</td>`;
        tb.append(tr);
      });
      t.append(tb); invCard.append(t);
    } else { invCard.append(emptyNote("Накладных нет")); }
    box.append(invCard);
  }

  function emptyNote(text) {
    const e = mkEl("div"); e.style.cssText = "padding:10px;color:var(--muted);font-size:13px"; e.textContent = text; return e;
  }
  function curSym(c) { return c === "usd" ? "$" : c === "yuan" ? "¥" : "сум"; }

  // ---- Вкладка «Отчёты» ----
  let reportPeriod = "month";
  async function renderReports() {
    const wrap = mkEl("div");
    const ctrl = mkEl("div"); ctrl.style.cssText = "display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap";
    [["month", "Месяц"], ["year", "Год"], ["all", "Всё время"]].forEach(([id, label]) => {
      const b = mkEl("button", "s-tab" + (id === reportPeriod ? " active" : ""));
      b.textContent = label;
      b.addEventListener("click", () => { reportPeriod = id; renderReports(); });
      ctrl.append(b);
    });
    wrap.append(ctrl);

    const body = mkEl("div");
    body.innerHTML = `<div style="padding:30px;text-align:center"><span class="s-spinner" style="width:24px;height:24px;border-width:2px;border-color:rgba(0,0,0,.08);border-top-color:var(--navy);display:inline-block"></span></div>`;
    wrap.append(body);
    tabContent.innerHTML = ""; tabContent.append(wrap);

    let rep;
    try { rep = await req("GET", `/admin-site/report?period=${reportPeriod}`); }
    catch (e) { body.innerHTML = `<div class="s-empty"><p>Ошибка: ${esc(e.message)}</p></div>`; return; }

    body.innerHTML = "";
    const grid = mkEl("div"); grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px";
    grid.append(reportGroupCard("🌐 Клиенты с сайта", rep.site), reportGroupCard("🏪 Были в складе", rep.warehouse));
    body.append(grid);
  }

  function reportGroupCard(title, g) {
    const card = mkEl("div", "cabinet-card");
    g = g || {};
    const fmtUSD = (v) => "$" + Math.round(v || 0).toLocaleString("ru");
    const fmtCur = (o) => ["som", "usd", "yuan"].filter(k => (o?.[k] || 0) > 0.5)
      .map(k => Math.round(o[k]).toLocaleString("ru") + " " + curSym(k)).join(" · ") || "—";

    const head = mkEl("div");
    head.innerHTML = `<h3 style="margin:0 0 4px;font-size:15px">${esc(title)}</h3>
      <div style="font-size:12px;color:var(--muted);margin-bottom:12px">Клиентов: ${esc(g.clients_count || 0)}</div>`;
    card.append(head);

    const metrics = mkEl("div"); metrics.style.cssText = "display:grid;gap:8px;margin-bottom:14px";
    metrics.innerHTML = `
      <div class="ap-metric"><span>Оборот</span><b>${esc(fmtCur(g.turnover))} <span style="color:var(--muted)">(${esc(fmtUSD(g.turnover_usd))})</span></b></div>
      <div class="ap-metric"><span>Оплаты получено</span><b>${esc(fmtCur(g.payments))} <span style="color:var(--muted)">(${esc(fmtUSD(g.payments_usd))})</span></b></div>
      <div class="ap-metric"><span>Чистая прибыль</span><b style="color:var(--ok,#27ae60)">${esc(fmtUSD(g.profit_usd))}</b></div>`;
    metrics.querySelectorAll(".ap-metric").forEach(m => m.style.cssText = "display:flex;justify-content:space-between;font-size:13px;padding:6px 0;border-bottom:1px solid var(--border,#eee)");
    card.append(metrics);

    const h = mkEl("div"); h.style.cssText = "font-size:13px;font-weight:600;margin:6px 0 6px"; h.textContent = "Топ-товары и лучший клиент";
    card.append(h);
    if (g.top_products?.length) {
      const t = mkEl("table", "s-table"); t.style.margin = "0";
      t.innerHTML = `<thead><tr><th>Товар</th><th style="text-align:right">Спрос</th><th>Топ-клиент</th></tr></thead>`;
      const tb = document.createElement("tbody");
      g.top_products.forEach(p => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${esc(p.product)}</td><td style="text-align:right">${esc(p.qty)}</td>
          <td>${p.top_client ? esc(p.top_client.name) + " <span style='color:var(--muted)'>(" + esc(p.top_client.qty) + ")</span>" : "—"}</td>`;
        tb.append(tr);
      });
      t.append(tb); card.append(t);
    } else { card.append(emptyNote("Нет данных за период")); }
    return card;
  }

  tabContent.innerHTML = `<div style="padding:40px;text-align:center"><span class="s-spinner" style="width:28px;height:28px;border-width:2.5px;border-color:rgba(0,0,0,.08);border-top-color:var(--navy);display:inline-block"></span></div>`;
  await loadAll();
}
