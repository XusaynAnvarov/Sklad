// ========================================================================
//  ДОСТУП К АДМИНКЕ: секретная ссылка (?key=) + пароль
// ========================================================================
import { el, $, toast } from "./ui.js";
import { db, rawClient } from "./db.js";
import { icon } from "./icons.js";

const cfg = window.APP_CONFIG || {};
const KEY_STORE = "sklad_key_ok";

// Ключ ищем и в ?key=, и в #key=… (хэш не теряется при редиректах сервера)
function getKeyFromUrl() {
  const sp = new URLSearchParams(location.search);
  if (sp.get("key")) return sp.get("key");
  const m = (location.hash || "").match(/[#?&]key=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function isInstalledPWA() {
  try {
    return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  } catch { return false; }
}

function keyOk() {
  const k = getKeyFromUrl();
  if (k && k === cfg.SECRET_KEY) {
    localStorage.setItem(KEY_STORE, "1");
    // убираем ключ из адреса, оставляя чистый роут
    if (/key=/.test(location.hash)) location.hash = "#/products";
    return true;
  }
  if (localStorage.getItem(KEY_STORE) === "1") return true;
  // установленное приложение (PWA в полноэкранном режиме) — это владелец: пускаем к экрану входа
  if (isInstalledPWA()) { localStorage.setItem(KEY_STORE, "1"); return true; }
  return false;
}

function screenLocked(root) {
  root.innerHTML = "";
  root.append(el("div.login-wrap", {}, [
    el("div.login-card", {}, [
      el("div.lock-emoji", {}, [icon("lock", { size: 38 })]),
      el("div.logo", { text: "Доступ закрыт" }),
      el("p", { text: "Эта страница доступна только по личной секретной ссылке." }),
    ]),
  ]));
}

// Возвращает Promise, который резолвится после успешного входа.
export function ensureAccess(root) {
  return new Promise((resolve) => {
    if (!keyOk()) { screenLocked(root); return; }
    renderLogin(root, resolve);
  });
}

function renderLogin(root, resolve) {
  root.innerHTML = "";
  const pass = el("input.inp", { type: "password", placeholder: "Пароль", autofocus: true });
  const email = el("input.inp", { type: "email", placeholder: "Email" });
  const fields = [];
  if (db.mode === "supabase") fields.push(email);
  fields.push(pass);

  const enter = async () => {
    if (db.mode === "supabase") {
      await db.ready;
      // вход через ТОТ ЖЕ клиент, что используется для записи — иначе сессия не подхватится
      const sb = rawClient();
      const { error } = await sb.auth.signInWithPassword({ email: email.value.trim(), password: pass.value });
      if (error) { toast("Неверный email или пароль", "err"); return; }
      localStorage.setItem("sklad_authed", "1");
      resolve();
    } else {
      if (pass.value === (cfg.ADMIN_PASSWORD || "")) { localStorage.setItem("sklad_authed", "1"); resolve(); }
      else toast("Неверный пароль", "err");
    }
  };

  const card = el("div.login-card", {}, [
    el("div.lock-emoji", {}, [icon("lock", { size: 38 })]),
    el("div.logo", { text: "Склад" }),
    el("p", { text: "Вход для владельца" }),
    ...fields,
    el("button.btn.btn-primary", { text: "Войти", style: { width: "100%", justifyContent: "center" }, onclick: enter }),
  ]);
  fields.forEach(f => f.addEventListener("keydown", e => { if (e.key === "Enter") enter(); }));
  root.append(el("div.login-wrap", {}, [card]));
  setTimeout(() => fields[0]?.focus(), 50);
}

export function alreadyAuthed() { return localStorage.getItem("sklad_authed") === "1"; }

export function logout() {
  localStorage.removeItem("sklad_authed");
  location.reload();
}
