// ========================================================================
//  СТРАНИЦА «КЛИЕНТЫ САЙТА» — просмотр, удаление, блок/разблок
// ========================================================================
import { el, toast, confirmDialog } from "../ui.js?v=20260831b";
import { icon } from "../icons.js?v=20260831b";
import { authHeaders } from "../db.js?v=20260831b";

const BASE = "/api/admin";

// Авторизация складом идёт по кастомному admin-токену (sklad_admin_token), а НЕ через Supabase Auth.
async function apiFetch(method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json", ...(await authHeaders()) } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(path, opts);
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || r.statusText); }
  return r.json();
}

export default async function render(page, ctx) {
  // сохраняем ctx глобально для apiFetch
  window.__skladCtx__ = ctx;

  page.append(el("div.topbar", {}, [
    el("div", {}, [el("h1", { text: "Клиенты сайта" }), el("div.sub", { text: "Зарегистрированные на generalmodern.uz" })]),
  ]));

  const wrap = el("div", { style: { marginTop: "16px" } });
  page.append(wrap);

  async function load() {
    wrap.innerHTML = "";
    wrap.append(el("div.muted", { style: { padding: "20px 0", textAlign: "center" }, text: "Загрузка…" }));
    let data;
    try {
      data = await apiFetch("GET", BASE + "/site-clients");
    } catch (e) {
      wrap.innerHTML = "";
      wrap.append(el("div.empty", {}, [el("div.em-ic", {}, [icon("alert", { size: 32 })]), el("p", { text: "Ошибка: " + e.message })]));
      return;
    }
    const clients = data.clients || [];
    const blocked = data.blocked || [];
    wrap.innerHTML = "";

    // --- tabs ---
    const tabBar = el("div", { style: { display: "flex", gap: "6px", marginBottom: "16px" } });
    let tab = "clients";
    const tabClients = mkTab("Аккаунты сайта (" + clients.length + ")", "clients");
    const tabBlocked = mkTab("Заблокированные (" + blocked.length + ")", "blocked");
    function mkTab(label, id) {
      const b = el("button.btn.btn-outline.btn-sm", { text: label });
      if (tab === id) b.classList.add("active");
      b.addEventListener("click", () => { tab = id; renderTab(); });
      return b;
    }
    tabBar.append(tabClients, tabBlocked);
    wrap.append(tabBar);

    const tabContent = el("div");
    wrap.append(tabContent);

    function renderTab() {
      tabClients.classList.toggle("active", tab === "clients");
      tabBlocked.classList.toggle("active", tab === "blocked");
      tabContent.innerHTML = "";
      if (tab === "clients") renderClients();
      else renderBlocked();
    }

    function renderClients() {
      if (!clients.length) {
        tabContent.append(el("div.empty", {}, [el("div.em-ic", {}, [icon("user", { size: 36 })]), el("p", { text: "Нет зарегистрированных клиентов" })]));
        return;
      }
      clients.forEach(c => {
        const card = el("div.card", {
          style: { display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap", marginBottom: "8px" },
        });
        const info = el("div", { style: { flex: "1", minWidth: "200px" } });
        info.append(
          el("div", { style: { fontWeight: "700", fontSize: "15px" }, text: c.customer_name }),
          el("div.muted", { style: { fontSize: "13px", marginTop: "2px" }, text: "+" + c.phone + (c.tg_verified ? " · Telegram ✓" : " · Telegram ?") }),
          el("div.muted", { style: { fontSize: "12px" }, text: "Рег: " + (c.created_at ? new Date(c.created_at).toLocaleDateString("ru-RU") : "—") + (c.last_login ? " · Вход: " + new Date(c.last_login).toLocaleDateString("ru-RU") : "") }),
        );
        if (c.blocked) info.append(el("span.badge.order", { text: "Номер в блоке", style: { marginTop: "4px", display: "inline-block" } }));

        const actions = el("div", { style: { display: "flex", gap: "8px", flexShrink: "0" } });
        if (c.customer_id) {
          const cardBtn = el("button.btn.btn-outline.btn-sm", {}, [icon("user", { size: 14 }), " Карточка"]);
          cardBtn.addEventListener("click", () => { ctx.navigate("customers"); });
          actions.append(cardBtn);
        }
        const delBtn = el("button.btn.btn-danger.btn-sm", {}, [icon("trash", { size: 14 }), " Удалить"]);
        delBtn.addEventListener("click", () => {
          confirmDialog(`Удалить аккаунт ${c.customer_name}? Номер +${c.phone} будет заблокирован.`, async () => {
            try {
              await apiFetch("POST", BASE + "/site-client-delete", { id: c.id });
              toast("Клиент удалён, номер заблокирован", "ok");
              load();
            } catch (e) { toast("Ошибка: " + e.message, "err"); }
          });
        });
        actions.append(delBtn);
        card.append(info, actions);
        tabContent.append(card);
      });
    }

    function renderBlocked() {
      if (!blocked.length) {
        tabContent.append(el("div.empty", {}, [el("div.em-ic", {}, [icon("lock", { size: 36 })]), el("p", { text: "Нет заблокированных номеров" })]));
        return;
      }
      blocked.forEach(b => {
        const card = el("div.card", {
          style: { display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap", marginBottom: "8px" },
        });
        const info = el("div", { style: { flex: "1" } });
        info.append(
          el("div", { style: { fontWeight: "700", fontSize: "15px" }, text: "+" + b.phone }),
          el("div.muted", { style: { fontSize: "12px", marginTop: "2px" }, text: "Заблокирован: " + (b.blocked_at ? new Date(b.blocked_at).toLocaleDateString("ru-RU") : "—") + (b.blocked_by ? " · " + b.blocked_by : "") }),
        );
        const unblockBtn = el("button.btn.btn-outline.btn-sm", {}, [icon("undo", { size: 14 }), " Разблокировать"]);
        unblockBtn.addEventListener("click", () => {
          confirmDialog(`Разблокировать номер +${b.phone}? Клиент сможет снова зарегистрироваться.`, async () => {
            try {
              await apiFetch("POST", BASE + "/unblock", { phone: b.phone });
              toast("Номер разблокирован", "ok");
              load();
            } catch (e) { toast("Ошибка: " + e.message, "err"); }
          });
        });
        card.append(info, unblockBtn);
        tabContent.append(card);
      });
    }

    renderTab();
  }

  await load();
}
