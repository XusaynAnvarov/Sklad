// ========================================================================
//  Мини-приложение «Склад» в Telegram — только для владельца.
//  Вход по подписи Telegram (без пароля): initData → /api/tg-admin-auth →
//  тот же токен склада, что и вход по паролю. Дальше работает обычный
//  js/db.js, поэтому база ОДНА: движение с телефона сразу видно на сайте.
// ========================================================================
import { db } from "../db.js?v=20260821a";
import { icon } from "../icons.js?v=20260821a";
import { toast } from "../ui.js?v=20260821a";
import { isDesktop } from "./qr.js?v=20260821a";

const TG = window.Telegram && window.Telegram.WebApp;
const TOKEN_KEY = "sklad_admin_token";

export const el = (tag, props = {}, children = []) => {
  const parts = String(tag).split(".");
  const e = document.createElement(parts[0] || "div");
  parts.slice(1).forEach(c => c && e.classList.add(c));
  Object.entries(props).forEach(([k, v]) => {
    if (v == null) return;
    if (k === "text") e.textContent = v;
    else if (k === "style" && typeof v === "object") Object.assign(e.style, v);
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  });
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c == null || c === false) return;
    e.append(c.nodeType ? c : document.createTextNode(String(c)));
  });
  return e;
};

const root = () => document.getElementById("mini-root");

function deny(title, sub) {
  root().innerHTML = "";
  root().append(el("div.mini-deny", {}, [
    el("div", {}, [icon("lock", { size: 34 })]),
    el("div.t", { text: title }),
    el("div.s", { text: sub }),
  ]));
}

// ---------- вход ----------
async function signIn() {
  const initData = TG && TG.initData;
  if (!initData) {
    deny("Откройте склад через Telegram",
      "Эта страница работает только внутри Telegram — по кнопке «Склад» в боте. Так подтверждается, что открыли именно вы.");
    return false;
  }
  try {
    const r = await fetch("/api/tg-admin-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      deny(r.status === 403 ? "Склад доступен только владельцу" : "Не удалось войти",
        j.error || "Попробуйте открыть заново из бота.");
      return false;
    }
    localStorage.setItem(TOKEN_KEY, j.token);
    localStorage.setItem("sklad_authed", "1");
    return true;
  } catch (e) {
    deny("Нет связи с сервером", "Проверьте интернет и откройте склад заново.");
    return false;
  }
}

// Версия приложения. Берём из собственного адреса: при выкладке в него
// подставляется новый ?v=, значит эта строка меняется вместе с кодом.
// Нужна, чтобы по экрану было видно, свежая версия открыта или старая из
// кэша телефона — иначе «обновление не пришло» невозможно проверить.
export const VERSION = ((import.meta.url.split("?v=")[1] || "").split("&")[0]) || "—";

// ---------- экраны ----------
const SCREENS = {
  home:      { title: "Склад",              mod: () => import("./screens/home.js?v=20260821a") },
  products:  { title: "Товары",             mod: () => import("./screens/products.js?v=20260821a") },
  sale:      { title: "Продажа",            mod: () => import("./screens/sale.js?v=20260821a") },
  report:    { title: "Отчёт",              mod: () => import("./screens/report.js?v=20260821a") },
  labels:    { title: "Наклейки",           mod: () => import("./screens/labels.js?v=20260821a") },
  clients:   { title: "Клиенты",            mod: () => import("./screens/clients.js?v=20260821a") },
  arrival:   { title: "Приход из магазина", mod: () => import("./screens/arrival.js?v=20260821a") },
  docs:      { title: "Накладные и оплаты", mod: () => import("./screens/docs.js?v=20260821a") },
  more:      { title: "Ещё",                mod: () => import("./screens/more.js?v=20260821a") },
  orders:    { title: "Заказы",             mod: () => import("./screens/orders.js?v=20260821a") },
  purchases: { title: "Приход",             mod: () => import("./screens/purchases.js?v=20260821a") },
  check:     { title: "Проверка склада",    mod: () => import("./screens/check.js?v=20260821a") },
  trash:     { title: "Корзина",            mod: () => import("./screens/trash.js?v=20260821a") },
};
// Внизу помещается пять кнопок — то, за чем заходят каждый день.
// Всё остальное живёт в «Ещё»: больше пяти в ряд на телефоне превращаются
// в кашу, по которой не попасть пальцем.
const TABS = [
  { id: "home",     label: "Главная", ic: "dashboard" },
  { id: "products", label: "Товары",  ic: "box" },
  { id: "sale",     label: "Продажа", ic: "cart" },
  { id: "clients",  label: "Клиенты", ic: "user" },
  { id: "more",     label: "Ещё",     ic: "menu" },
];

let current = "home";

export function go(id, params) {
  current = SCREENS[id] ? id : "home";
  location.hash = "#" + current + (params ? "?" + new URLSearchParams(params) : "");
}

function shell() {
  root().innerHTML = "";
  const head = el("div.mini-head");
  const body = el("div.mini-wrap", { id: "mini-body" });
  const bar = el("div.mini-bar");
  TABS.forEach(t => {
    bar.append(el("button.mini-tab", { onclick: () => go(t.id) }, [
      icon(t.ic, { size: 20 }),
      el("span", { text: t.label }),
    ]));
  });
  root().append(head, body, bar);
  return { head, body, bar };
}

async function draw() {
  const raw = (location.hash || "#home").replace(/^#/, "");
  const [id, qs] = raw.split("?");
  current = SCREENS[id] ? id : "home";
  const params = Object.fromEntries(new URLSearchParams(qs || ""));

  const head = document.querySelector(".mini-head");
  const body = document.getElementById("mini-body");
  const bar = document.querySelector(".mini-bar");
  if (!head || !body) return;

  // шапка: на не-главных экранах — кнопка «назад»
  head.innerHTML = "";
  if (current !== "home") {
    head.append(el("button.mini-back", { title: "Назад", onclick: () => go("home") }, [icon("arrow-left", { size: 18 })]));
  }
  head.append(el("h1", { text: SCREENS[current].title }));

  // «Развернуть» — только для компьютера (кнопка скрыта стилями ниже 900px)
  // и только если версия Telegram это умеет. Не умеет — кнопки нет.
  // На компьютере окно Telegram узкое, поэтому привязка к ширине не работала —
  // смотрим на платформу: tdesktop, macOS или веб.
  if (TG && isDesktop() && typeof TG.requestFullscreen === "function") {
    head.append(el("button.mini-full", { title: "Развернуть на весь экран", onclick: () => {
      try { TG.isFullscreen ? TG.exitFullscreen() : TG.requestFullscreen(); } catch { }
    } }, [icon("arrow-up-right", { size: 17 })]));
  }

  [...bar.children].forEach((b, i) => b.classList.toggle("on", TABS[i].id === current));

  body.innerHTML = "";
  body.append(el("div.mini-empty", { text: "Загрузка…" }));
  try {
    const mod = await SCREENS[current].mod();
    body.innerHTML = "";
    await mod.default(body, { db, go, params });
  } catch (e) {
    console.error(e);
    body.innerHTML = "";
    body.append(el("div.mini-empty", { text: "Ошибка: " + (e.message || e) }));
  }
}

export async function boot() {
  if (TG) { try { TG.ready(); TG.expand(); } catch { } }
  document.documentElement.setAttribute("data-theme", "light");   // мини-приложение всегда светлое
  if (!(await signIn())) return;
  shell();

  // Наклейку отсканировали обычной камерой телефона — она открыла ссылку
  // вида /sklad?p=<товар>. Показываем сразу этот товар.
  // Telegram передаёт тот же параметр как start_param, когда открывают из чата.
  const fromUrl = new URLSearchParams(location.search).get("p");
  const fromTg = TG && TG.initDataUnsafe && TG.initDataUnsafe.start_param;
  const openId = String(fromUrl || fromTg || "").trim();
  if (openId && /^[\w-]{1,64}$/.test(openId) && !location.hash) {
    location.hash = "#products?q=" + encodeURIComponent(openId) + "&open=" + encodeURIComponent(openId);
  }

  window.addEventListener("hashchange", draw);
  await draw();
}
