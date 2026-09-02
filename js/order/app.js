// ========================================================================
//  МИНИ-ПРИЛОЖЕНИЕ ЗАКАЗА — для клиентов, открывается кнопкой в боте.
//
//  Три вкладки: Каталог · Корзина · Мои заказы.
//  «Мои заказы» — главное, чего тут раньше не было: клиент отправлял заказ
//  и больше его не видел. Теперь виден и заказ, и что с ним происходит.
//
//  Кто открыл — подтверждает Telegram (initData). Пароля нет.
//  Цен в каталоге нет и не будет: цену клиент видит только в своём заказе,
//  и только после того, как владелец её проставил.
// ========================================================================
import { el } from "../el.js?v=20260902b";
import { icon } from "../icons.js?v=20260902b";
import { toast } from "../ui.js?v=20260902b";
import { setLang, applyI18n } from "../i18n.js?v=20260902b";
import { кнопкаРазвернуть } from "../miniapp.js?v=20260902b";
import { мои, каталог, подпись } from "./api.js?v=20260902b";
import * as корзина from "./cart.js?v=20260902b";

const TG = window.Telegram && window.Telegram.WebApp;
const корень = () => document.getElementById("ord-root");

// Общее состояние: экраны его читают, но не загружают сами — иначе каждая
// вкладка дёргала бы сервер заново при каждом переключении.
export const ctx = {
  товары: [],
  поИд: new Map(),
  заказы: [],
  клиент: null,
  корзина,
  // Перечитать заказы после отправки, правки или отмены.
  async обновитьЗаказы() {
    const о = await мои("list");
    ctx.заказы = о.orders || [];
    ctx.клиент = о.customer || null;
    перерисоватьЗначки();
    return ctx.заказы;
  },
};

const ЭКРАНЫ = {
  catalog: { title: "Каталог", mod: () => import("./screens/catalog.js?v=20260902b") },
  cart:    { title: "Корзина", mod: () => import("./screens/cart.js?v=20260902b") },
  orders:  { title: "Мои заказы", mod: () => import("./screens/myorders.js?v=20260902b") },
};
const ВКЛАДКИ = [
  { id: "catalog", label: "Каталог",    ic: "box" },
  { id: "cart",    label: "Корзина",    ic: "cart" },
  { id: "orders",  label: "Мои заказы", ic: "receipt" },
];

let текущий = "catalog";
let очиститьЭкран = null;

export function идти(id) {
  const цель = "#" + (ЭКРАНЫ[id] ? id : "catalog");
  // Повторное нажатие на ту же вкладку возвращает экран к началу. Иначе,
  // открыв заказ и нажав «Мои заказы», клиент не понимает, почему ничего
  // не происходит: адрес не изменился — и перерисовки не было.
  if (location.hash === цель) нарисовать();
  else location.hash = цель;
}

// ---------- экраны-заглушки ----------
function отказ(заголовок, пояснение) {
  корень().innerHTML = "";
  корень().append(el("div.mini-deny", {}, [
    el("div", {}, [icon("lock", { size: 34 })]),
    el("div.t", { text: заголовок }),
    el("div.s", { text: пояснение }),
  ]));
}

function загрузка(текст) {
  корень().innerHTML = "";
  корень().append(el("div.mini-boot", {}, [
    el("div.mini-spin"),
    el("div.mini-boot-t", { text: текст }),
  ]));
}

// ---------- каркас ----------
function каркас() {
  корень().innerHTML = "";
  const head = el("div.mini-head");
  const body = el("div.mini-wrap", { id: "ord-body" });
  const bar = el("div.mini-bar.ord-bar");
  ВКЛАДКИ.forEach(в => {
    bar.append(el("button.mini-tab", { "data-tab": в.id, onclick: () => идти(в.id) }, [
      el("span.ord-ic", {}, [icon(в.ic, { size: 20 }), el("i.ord-badge", { "data-badge": в.id })]),
      el("span", { text: в.label }),
    ]));
  });
  корень().append(head, body, bar);
}

// Значки на вкладках: сколько в корзине и сколько заказов ждут ответа
// клиента. Без них клиент не замечает, что владелец выставил цену.
function перерисоватьЗначки() {
  const { позиций } = корзина.итого();
  const ждут = ctx.заказы.filter(o => o.status === "pending_confirm").length;
  const значение = { catalog: 0, cart: позиций, orders: ждут };
  document.querySelectorAll(".ord-badge").forEach(b => {
    const n = значение[b.getAttribute("data-badge")] || 0;
    b.textContent = n > 99 ? "99+" : String(n);
    // Показываем классом: сброс инлайн-стиля вернул бы display:none из CSS,
    // и значок не появлялся бы вовсе.
    b.classList.toggle("on", n > 0);
  });
}

async function нарисовать() {
  const id = (location.hash || "#catalog").replace(/^#/, "").split("?")[0];
  текущий = ЭКРАНЫ[id] ? id : "catalog";

  const head = document.querySelector(".mini-head");
  const body = document.getElementById("ord-body");
  const bar = document.querySelector(".ord-bar");
  if (!head || !body) return;

  head.innerHTML = "";
  head.append(el("h1", { text: ЭКРАНЫ[текущий].title }));
  if (ctx.клиент?.name) head.append(el("span.ord-who", { text: ctx.клиент.name }));
  // На компьютере окно Telegram узкое — даём развернуть его на весь экран.
  // На телефоне кнопки нет: там и так весь экран.
  const развернуть = кнопкаРазвернуть();
  if (развернуть) head.append(развернуть);

  [...bar.children].forEach(b => b.classList.toggle("on", b.getAttribute("data-tab") === текущий));

  // Экран мог подписаться на изменения корзины — снимаем это до того,
  // как он исчезнет с глаз, иначе подписки копятся с каждым переходом.
  if (очиститьЭкран) { try { очиститьЭкран(); } catch {} очиститьЭкран = null; }
  body.innerHTML = "";
  try {
    const m = await ЭКРАНЫ[текущий].mod();
    const итог = await m.default(body, ctx);
    if (typeof итог === "function") очиститьЭкран = итог;
  } catch (e) {
    body.append(el("div.mini-empty", { text: "Не удалось открыть: " + (e.message || e) }));
  }
  перерисоватьЗначки();
  applyI18n(document.body);
}

// ---------- запуск ----------
export async function boot() {
  // Приложение открывают из чата бота. Открыли иначе — подтвердить, кто это,
  // невозможно, а без этого нельзя показывать чужие заказы и цены.
  if (!TG || !подпись()) {
    отказ("Откройте заказ через Telegram",
      "Эта страница работает внутри Telegram — по кнопке «Заказать» в нашем боте. Так мы понимаем, чей это заказ.");
    return;
  }
  try { TG.ready(); TG.expand(); } catch {}

  загрузка("Открываем каталог…");

  // Каталог и свои заказы тянем разом: заказы нужны сразу, чтобы корзина
  // могла честно сказать «допишем к вашему заказу», а не узнала об этом
  // только при отправке.
  const [кат, свои] = await Promise.allSettled([каталог(), мои("list")]);

  if (кат.status === "fulfilled") {
    ctx.товары = кат.value;
    ctx.поИд = new Map(ctx.товары.map(p => [String(p.id), p]));
    // Товар могли убрать из каталога, пока корзина лежала в телефоне.
    const убрали = корзина.оставитьТолько(ctx.поИд.keys());
    if (убрали) toast("Из корзины убрано товаров: " + убрали + " — их больше нет в каталоге", "err");
  }

  if (свои.status === "fulfilled") {
    ctx.заказы = свои.value.orders || [];
    ctx.клиент = свои.value.customer || null;
    // Язык клиент уже выбрал в боте — заново спрашивать незачем.
    if (свои.value.lang) { try { setLang(свои.value.lang); } catch {} }
  }

  if (кат.status === "rejected" && свои.status === "rejected") {
    отказ("Нет связи с сервером", "Попробуйте открыть заказ ещё раз через минуту.");
    return;
  }

  каркас();
  корзина.подписаться(перерисоватьЗначки);
  window.addEventListener("hashchange", нарисовать);
  await нарисовать();
}
