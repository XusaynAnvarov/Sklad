// ========================================================================
//  Мини-приложение «Склад» в Telegram — только для владельца.
//  Вход по подписи Telegram (без пароля): initData → /api/tg-admin-auth →
//  тот же токен склада, что и вход по паролю. Дальше работает обычный
//  js/db.js, поэтому база ОДНА: движение с телефона сразу видно на сайте.
// ========================================================================
import { db } from "../db.js?v=20260901b";
import { el } from "../el.js?v=20260901b";
import { setRates } from "../fx.js?v=20260901b";
import { обновитьЕслиУстарело } from "../version.js?v=20260901b";
import { icon } from "../icons.js?v=20260901b";
import { toast } from "../ui.js?v=20260901b";
import { кнопкаРазвернуть } from "../miniapp.js?v=20260901b";

const TG = window.Telegram && window.Telegram.WebApp;
const TOKEN_KEY = "sklad_admin_token";
const GUEST_KEY = "sklad_guest";

// Открыт ли склад по гостевой ссылке «посмотреть и поискать ошибки».
// Гость видит всё, но ничего не меняет: сервер отклоняет любую запись.
export const isGuest = () => {
  try { return localStorage.getItem(GUEST_KEY) === "1"; } catch { return false; }
};

// Помощник переехал в js/el.js — им пользуется и мини-приложение заказа,
// которому вход в склад не нужен. Экспорт оставлен, чтобы все экраны
// склада продолжали брать его отсюда: import { el } from "../app.js?v=20260901b".
export { el };

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
  // Гостевая ссылка: открывается в обычном браузере, без Telegram.
  // Токен в адресе — забираем его и сразу убираем из строки адреса, чтобы
  // не остался в истории и не уехал случайным скриншотом.
  const гость = new URLSearchParams(location.search).get("guest");
  if (гость) {
    try {
      localStorage.setItem(TOKEN_KEY, гость);
      localStorage.setItem(GUEST_KEY, "1");
      const u = new URL(location.href);
      u.searchParams.delete("guest");
      history.replaceState(null, "", u.toString());
    } catch { }
    return true;
  }

  const initData = TG && TG.initData;
  if (!initData) {
    // Уже заходили по гостевой ссылке — продолжаем как гость
    if (isGuest()) return true;
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
    // вошли как владелец — гостевую пометку снимаем
    try { localStorage.removeItem(GUEST_KEY); } catch { }
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
  home:      { title: "Склад",              mod: () => import("./screens/home.js?v=20260901b") },
  products:  { title: "Товары",             mod: () => import("./screens/products.js?v=20260901b") },
  sale:      { title: "Продажа",            mod: () => import("./screens/sale.js?v=20260901b") },
  report:    { title: "Отчёт",              mod: () => import("./screens/report.js?v=20260901b") },
  labels:    { title: "Наклейки",           mod: () => import("./screens/labels.js?v=20260901b") },
  clients:   { title: "Клиенты",            mod: () => import("./screens/clients.js?v=20260901b") },
  arrival:   { title: "Приход из магазина", mod: () => import("./screens/arrival.js?v=20260901b") },
  docs:      { title: "Накладные и оплаты", mod: () => import("./screens/docs.js?v=20260901b") },
  more:      { title: "Ещё",                mod: () => import("./screens/more.js?v=20260901b") },
  orders:    { title: "Заказы",             mod: () => import("./screens/orders.js?v=20260901b") },
  purchases: { title: "Приход",             mod: () => import("./screens/purchases.js?v=20260901b") },
  check:     { title: "Проверка склада",    mod: () => import("./screens/check.js?v=20260901b") },
  trash:     { title: "Корзина",            mod: () => import("./screens/trash.js?v=20260901b") },
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
  // Гостю сразу и постоянно видно, что он смотрит чужой склад и менять
  // ничего не может — иначе он будет жать кнопки и получать отказы,
  // не понимая почему.
  if (isGuest()) {
    root().append(head, el("div", {
      style: {
        margin: "0 14px 10px", padding: "9px 12px", borderRadius: "10px",
        background: "var(--bg2)", border: "1px solid var(--border)",
        color: "var(--muted)", fontSize: "12.5px", textAlign: "center",
      },
      text: "Режим проверки: только просмотр. Изменения не сохранятся.",
    }), body, bar);
    return { head, body, bar };
  }
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

  // «Развернуть» — только для компьютера и только если версия Telegram
  // это умеет. Кнопку строит общий модуль: приложение заказа делает
  // ровно то же самое, и расходиться им незачем.
  const развернуть = кнопкаРазвернуть();
  if (развернуть) head.append(развернуть);

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
  // Телефон особенно охотно держит страницу в кэше — проверяем версию
  // у сервера и один раз перезагружаемся, если открыто вчерашнее.
  if (await обновитьЕслиУстарело()) return;
  document.documentElement.setAttribute("data-theme", "light");   // мини-приложение всегда светлое
  if (!(await signIn())) return;

  // Курсы валют — из настроек, как на сайте. Раньше телефон их не загружал
  // и считал по значениям «из коробки»: сумма одной и той же накладной в
  // долларах на телефоне и на компьютере получалась разной.
  try { setRates(await db.getSettings()); }
  catch (e) { console.warn("Курсы не загрузились, считаем по умолчанию:", e); }

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
