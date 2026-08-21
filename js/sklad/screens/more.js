// «Ещё»: разделы, которые не поместились внизу.
// Внизу оставлено пять кнопок — то, за чем заходят каждый день. Остальное
// здесь: больше пяти кнопок в ряд на телефоне превращаются в кашу, по
// которой не попасть пальцем.
import { el, go, VERSION, isGuest } from "../app.js?v=20260821e";
import { icon } from "../../icons.js?v=20260821e";
import { toast, modal } from "../../ui.js?v=20260821e";

// Показать ссылку и дать её скопировать. Буфер обмена в Telegram бывает
// недоступен, поэтому ссылку ещё и показываем текстом — её можно выделить.
function кнопкаСсылки(ctx) {
  const b = el("button.mini-act.wide", {}, [
    icon("send", { size: 20 }),
    el("div", {}, [
      el("div", { text: "Дать посмотреть" }),
      el("div.sub", { text: "ссылка на сутки, только просмотр" }),
    ]),
  ]);
  b.addEventListener("click", async () => {
    b.disabled = true;
    try {
      const r = await fetch("/api/admin/guest-link", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + (localStorage.getItem("sklad_admin_token") || "") },
        body: JSON.stringify({ hours: 24 }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast(j.error || "Не удалось получить ссылку", "err"); return; }
      показатьСсылку(j);
    } catch { toast("Нет связи с сервером", "err"); }
    finally { b.disabled = false; }
  });
  return el("div.mini-acts", { style: { marginTop: "16px" } }, [b]);
}

function показатьСсылку(j) {
  const поле = el("textarea.inp", {
    readonly: "readonly", rows: "3",
    style: { width: "100%", fontSize: "13px", lineHeight: "1.45", wordBreak: "break-all" },
  });
  поле.value = j.url;
  поле.addEventListener("focus", () => поле.select());

  const до = new Date(j.expires_at);
  modal({
    title: "Ссылка для проверки",
    wide: true,
    body: el("div", {}, [
      el("div.hint", { style: { marginBottom: "10px" },
        text: "Отправьте её одному человеку. Он увидит склад, но ничего не изменит — сервер не примет от него никаких правок." }),
      поле,
      el("div.sku", { style: { marginTop: "8px" },
        text: "Действует до " + (isFinite(до) ? до.toLocaleString("ru-RU") : "—") + ". Потом перестанет открываться." }),
      el("div.hint", { style: { marginTop: "8px" },
        text: "Открывать её на своём телефоне не нужно: склад в этом браузере переключится на просмотр, пока не зайдёте заново из бота." }),
    ]),
    actions: [
      { label: "Скопировать", kind: "btn-outline", onClick: async () => {
        try { await navigator.clipboard.writeText(j.url); toast("Ссылка скопирована", "ok"); }
        catch { поле.focus(); поле.select(); toast("Выделено — скопируйте вручную", "ok"); }
      } },
      { label: "Готово", kind: "btn-primary", onClick: c => c() },
    ],
  });
}

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

  // Ссылка «дать посмотреть». Нужна, чтобы один человек открыл склад,
  // походил по нему и нашёл ошибки. Только просмотр и с коротким сроком:
  // ссылка без срока живёт вечно и однажды окажется не у того.
  if (!isGuest()) box.append(кнопкаСсылки(ctx));

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
