// «Ещё»: разделы, которые не поместились внизу.
// Внизу оставлено пять кнопок — то, за чем заходят каждый день. Остальное
// здесь: больше пяти кнопок в ряд на телефоне превращаются в кашу, по
// которой не попасть пальцем.
import { el, go, VERSION } from "../app.js?v=20260821d";
import { icon } from "../../icons.js?v=20260821d";

const РАЗДЕЛЫ = [
  { id: "report",    ic: "chart",   title: "Отчёт",           sub: "обороты, прибыль, долги" },
  { id: "orders",    ic: "cart",    title: "Заказы",          sub: "из бота и с сайта" },
  { id: "purchases", ic: "truck",   title: "Приход",          sub: "что в дороге, что пришло" },
  { id: "docs",      ic: "receipt", title: "Накладные и оплаты", sub: "посмотреть, поправить, удалить" },
  { id: "check",     ic: "check",   title: "Проверка склада", sub: "что разошлось с остатками" },
  { id: "labels",    ic: "hash",    title: "Наклейки",        sub: "QR-коды на товар" },
  { id: "trash",     ic: "trash",   title: "Корзина",         sub: "вернуть удалённое" },
];

export default async function render(box, ctx) {
  const acts = el("div.mini-acts");
  РАЗДЕЛЫ.forEach(r => {
    acts.append(el("button.mini-act.wide", { onclick: () => go(r.id) }, [
      icon(r.ic, { size: 20 }),
      el("div", {}, [el("div", { text: r.title }), el("div.sub", { text: r.sub })]),
    ]));
  });
  box.append(acts);

  // Заказы — единственное, что ждёт ответа, поэтому считаем их сразу
  // и показываем числом: иначе про них забывают до вечера.
  try {
    const sales = await ctx.db.sales.list();
    const ждут = sales.filter(s => ["order", "pending_confirm", "confirmed"].includes(s.status)).length;
    if (ждут) {
      box.prepend(el("div.hint", { style: { marginBottom: "12px" },
        text: "Заказов ждёт оформления: " + ждут }));
    }
  } catch { }

  // Версия и принудительное обновление. Телефон умеет держать страницу в
  // своём кэше и после выкладки показывать вчерашнее приложение — по этой
  // строке сразу видно, так ли это.
  const обновить = el("button.btn.btn-outline", {
    style: { width: "100%", justifyContent: "center", minHeight: "44px", marginTop: "16px" },
    text: "Обновить приложение",
    onclick: () => {
      // адрес с новой меткой времени телефон не может взять из кэша
      const u = new URL(location.href);
      u.searchParams.set("r", Date.now().toString(36));
      u.hash = "";
      location.replace(u.toString());
    },
  });
  box.append(обновить, el("div.hint", {
    style: { textAlign: "center", marginTop: "8px" },
    text: "Версия " + VERSION + ". Если разделов меньше, чем ждёте, — нажмите «Обновить приложение».",
  }));
}
