// ========================================================================
//  ДОСТУП К СКЛАДУ: логин + пароль, затем код из Telegram.
//
//  Второй шаг нужен не столько ради пароля, сколько ради того, чтобы
//  владелец ВИДЕЛ каждую попытку входа: код приходит ему в Telegram
//  вместе с городом, адресом и браузером. Даже когда входит он сам —
//  так понятно, он это или кто-то другой.
//
//  Пароль уходит на сервер и на втором шаге тоже: код сам по себе дверь
//  не открывает. Поэтому держим его в замыкании, а не в поле формы.
// ========================================================================
import { el, toast } from "./ui.js?v=20261110a";
import { icon } from "./icons.js?v=20261110a";
// Код из Telegram подставляется из буфера сам — см. js/kodizbufera.js
import { следитьЗаБуфером } from "./kodizbufera.js?v=20261110a";

// Возвращает Promise, который резолвится после успешного входа.
export function ensureAccess(root) {
  return new Promise((resolve) => {
    renderLogin(root, resolve);
  });
}

async function войти(тело) {
  const r = await fetch("/api/admin-auth", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(тело),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, j };
}

function впустить(j, resolve) {
  localStorage.setItem("sklad_authed", "1");
  localStorage.setItem("sklad_admin_token", j.token);
  resolve();
}

function renderLogin(root, resolve) {
  root.innerHTML = "";
  const fLogin = el("input.inp", { type: "text", placeholder: "Логин", autofocus: true });
  const fPass  = el("input.inp", { type: "password", placeholder: "Пароль" });

  const enter = async () => {
    const l = fLogin.value.trim(), p = fPass.value;
    if (!l || !p) { toast("Введите логин и пароль", "err"); return; }
    try {
      const { ok, j } = await войти({ login: l, password: p });
      if (!ok) { toast(j.error || "Неверный логин или пароль", "err"); return; }
      // Бот не настроен или проверку выключили — сервер сразу даёт ключ.
      if (j.token) { впустить(j, resolve); return; }
      if (j.note) toast(j.note, "ok");
      renderCode(root, resolve, { login: l, password: p });
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

// Второй шаг: код из Telegram. Логин с паролем уже проверены, но уходят
// снова — сервер проверяет их оба раза.
function renderCode(root, resolve, доступ) {
  root.innerHTML = "";
  const fCode = el("input.inp", {
    type: "text", placeholder: "Код из Telegram", inputMode: "numeric",
    autocomplete: "one-time-code", maxLength: 6,
    style: { textAlign: "center", letterSpacing: ".3em", fontSize: "1.25rem" },
  });
  const кнопка = el("button.btn.btn-primary", { text: "Подтвердить", style: { width: "100%", justifyContent: "center" } });

  const подтвердить = async () => {
    const c = fCode.value.trim();
    if (c.length < 4) { toast("Введите код из Telegram", "err"); return; }
    кнопка.disabled = true;
    try {
      const { ok, j } = await войти({ ...доступ, code: c });
      if (!ok) {
        toast(j.error || "Код неверный", "err");
        fCode.value = ""; fCode.focus();
        return;
      }
      буфер.стоп();
      впустить(j, resolve);
    } catch (e) {
      toast("Ошибка сети: " + e.message, "err");
    } finally {
      кнопка.disabled = false;
    }
  };
  кнопка.onclick = подтвердить;

  // Вернулись из Telegram, где нажали на код, — подставляем его сами и
  // сразу проверяем. Где браузер не даёт читать буфер молча (Safari на
  // iPhone), вместо этого появляется кнопка: по нажатию буфер читается
  // уже законно. Подробности — js/kodizbufera.js.
  const вставить = el("button.btn.btn-outline", {
    text: "📋 Вставить код", style: { width: "100%", justifyContent: "center", marginTop: "8px", display: "none" },
  });
  const буфер = следитьЗаБуфером({
    длина: 6,
    занято: () => fCode.value.trim().length > 0,
    вставить: (код) => { fCode.value = код; подтвердить(); },
    неВышло: () => { вставить.style.display = ""; },
  });
  вставить.onclick = async () => {
    if (!(await буфер.попробовать()))
      toast("В буфере нет кода. Скопируйте его в Telegram — нажмите на цифры.", "err");
  };

  const card = el("div.login-card", {}, [
    el("div.lock-emoji", {}, [icon("lock", { size: 38 })]),
    el("div.logo", { text: "Код подтверждения" }),
    el("p", { text: "Отправили его вам в Telegram. Там же видно, откуда входят." }),
    fCode,
    кнопка,
    вставить,
    el("button.btn.btn-outline", {
      text: "Назад",
      style: { width: "100%", justifyContent: "center", marginTop: "8px" },
      onclick: () => { буфер.стоп(); renderLogin(root, resolve); },
    }),
  ]);

  fCode.addEventListener("keydown", e => { if (e.key === "Enter") подтвердить(); });
  root.append(el("div.login-wrap", {}, [card]));
  setTimeout(() => fCode.focus(), 50);
}

export function alreadyAuthed() { return localStorage.getItem("sklad_authed") === "1"; }

export function logout() {
  localStorage.removeItem("sklad_authed");
  localStorage.removeItem("sklad_admin_token");
  location.reload();
}
