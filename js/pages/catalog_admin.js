// ========================================================================
//  «КАТАЛОГ» в админке — предпросмотр, ссылка, отправка клиенту через бота
// ========================================================================
import { el, toast, field, input } from "../ui.js?v=20260815a";
import { sendToClient } from "../telegram.js?v=20260815a";
import { statusOf, placeholder } from "./products.js?v=20260815a";
import { icon } from "../icons.js?v=20260815a";
import { thumb } from "../img.js?v=20260815a";

const cfg = window.APP_CONFIG || {};

export default async function render(page, ctx) {
  const products = await ctx.db.products.list();
  const catalogUrl = new URL(cfg.CATALOG_URL || "catalog.html", location.href).href;
  const inStock = products.filter(p => statusOf(p) === "in_stock").length;

  page.append(el("div.topbar", {}, [
    el("div", {}, [el("h1", { text: "Каталог" }), el("div.sub", { text: `${products.length} товаров · ${inStock} в наличии` })]),
    el("a.btn.btn-primary", { href: catalogUrl, target: "_blank" }, [icon("globe", { size: 16 }), "Открыть каталог"]),
  ]));

  // ссылка + копирование
  const f = input({ value: catalogUrl, readonly: true });
  page.append(el("div.card", { style: { marginBottom: "18px" } }, [
    el("div.section-h", { text: "Ссылка на каталог", style: { marginTop: 0 } }),
    el("div.hint", { text: "Каталог публичный, без цен — показывает только статус «есть / под заказ». Отправляйте эту ссылку клиентам." }),
    el("div", { style: { display: "flex", gap: "8px" } }, [
      f, el("button.btn.btn-outline.btn-sm", { text: "Копировать", onclick: () => { navigator.clipboard?.writeText(catalogUrl); toast("Скопировано", "ok"); } }),
    ]),
  ]));

  // отправка клиенту через бота
  const fChat = input({ placeholder: "chat_id клиента (он должен написать боту /start)" });
  const fMsg = el("textarea.inp", { placeholder: "Сообщение (необязательно)" });
  fMsg.value = "Здравствуйте! Наш каталог товаров: " + catalogUrl;
  page.append(el("div.card", { style: { marginBottom: "18px" } }, [
    el("div.section-h", { text: "Отправить каталог клиенту", style: { marginTop: 0 } }),
    field("Chat ID клиента", fChat),
    field("Текст", fMsg),
    el("button.btn.btn-primary", { text: "Отправить", onclick: async () => {
      if (!fChat.value.trim()) { toast("Укажите chat_id", "err"); return; }
      try { await sendToClient(fChat.value.trim(), fMsg.value); toast("Отправлено", "ok"); }
      catch (e) { toast(e.message, "err"); }
    } }),
  ]));

  // предпросмотр
  page.append(el("div.section-h", { text: "Предпросмотр (как видит клиент)" }));
  const grid = el("div.grid");
  products.forEach(p => {
    const s = statusOf(p);
    grid.append(el("div.prod", {}, [
      el("img.ph", { src: p.photo_url ? thumb(p.photo_url, 200) : placeholder(p.name), loading: "lazy", decoding: "async", onerror: function(){ this.src = placeholder(p.name); } }),
      el("div.body", {}, [
        el("div.nm", { text: p.name }),
        el("div.cat", { text: p.category || "" }),
        el("div", { style: { marginTop: "auto" } }, [
          s === "in_stock" ? el("span.badge.ok", { text: "✓ Есть" }) : el("span.badge.order", { text: "⏳ Под заказ" }),
        ]),
      ]),
    ]));
  });
  page.append(grid);
}
