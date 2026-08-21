// ========================================================================
//  ДОСТУП К СКЛАДУ: простой логин + пароль (ADMIN_LOGIN / ADMIN_PASSWORD из .env)
// ========================================================================
import { el, toast } from "./ui.js?v=20260821f";
import { icon } from "./icons.js?v=20260821f";

// Возвращает Promise, который резолвится после успешного входа.
export function ensureAccess(root) {
  return new Promise((resolve) => {
    renderLogin(root, resolve);
  });
}

function renderLogin(root, resolve) {
  root.innerHTML = "";
  const fLogin = el("input.inp", { type: "text", placeholder: "Логин", autofocus: true });
  const fPass  = el("input.inp", { type: "password", placeholder: "Пароль" });

  const enter = async () => {
    const l = fLogin.value.trim(), p = fPass.value;
    if (!l || !p) { toast("Введите логин и пароль", "err"); return; }
    try {
      const r = await fetch("/api/admin-auth", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ login: l, password: p }),
      });
      const j = await r.json();
      if (!r.ok) { toast(j.error || "Неверный логин или пароль", "err"); return; }
      localStorage.setItem("sklad_authed", "1");
      localStorage.setItem("sklad_admin_token", j.token);
      resolve();
    } catch (e) {
      toast("Ошибка сети: " + e.message, "err");
    }
  };

  const card = el("div.login-card", {}, [
    el("div.lock-emoji", {}, [icon("lock", { size: 38 })]),
    el("div.logo", { text: "Склад" }),
    el("p", { text: "Вход для владельца" }),
    fLogin,
    fPass,
    el("button.btn.btn-primary", {
      text: "Войти",
      style: { width: "100%", justifyContent: "center" },
      onclick: enter,
    }),
  ]);

  [fLogin, fPass].forEach(f => f.addEventListener("keydown", e => { if (e.key === "Enter") enter(); }));
  root.append(el("div.login-wrap", {}, [card]));
  setTimeout(() => fLogin.focus(), 50);
}

export function alreadyAuthed() { return localStorage.getItem("sklad_authed") === "1"; }

export function logout() {
  localStorage.removeItem("sklad_authed");
  localStorage.removeItem("sklad_admin_token");
  location.reload();
}
