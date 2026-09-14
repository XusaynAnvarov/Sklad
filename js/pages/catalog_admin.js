// ========================================================================
//  «КАТАЛОГ» в админке — предпросмотр, ссылка, отправка клиенту через бота
// ========================================================================
import { el, toast, field, input } from "../ui.js?v=20260914a";
import { sendToClient } from "../telegram.js?v=20260914a";
import { statusOf, placeholder } from "./products.js?v=20260914a";
import { icon } from "../icons.js?v=20260914a";
import { thumb } from "../img.js?v=20260914a";
import { authHeaders } from "../db.js?v=20260914a";
import { естьКолонкаКода } from "../catalogcode.js?v=20260914a";

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

  page.append(блокКодов(products));

  // предпросмотр
  page.append(el("div.section-h", { text: "Предпросмотр (как видит клиент)" }));
  const grid = el("div.grid");
  products.forEach(p => {
    const s = statusOf(p);
    grid.append(el("div.prod", {}, [
      el("img.ph", { src: p.photo_url ? thumb(p.photo_url, 200) : placeholder(p.name), loading: "lazy", decoding: "async", onerror: function(){ this.src = placeholder(p.name); } }),
      el("div.body", {}, [
        el("div.nm", { text: p.name }),
        el("div.cat", { text: [p.code, p.category].filter(Boolean).join(" · ") }),
        el("div", { style: { marginTop: "auto" } }, [
          s === "in_stock" ? el("span.badge.ok", { text: "✓ Есть" }) : el("span.badge.order", { text: "⏳ Под заказ" }),
        ]),
      ]),
    ]));
  });
  page.append(grid);
}

// ------------------------------------------------------------------------
//  КОДЫ ТОВАРОВ (LP-017) для печатного каталога.
//  Сначала владелец видит весь список «товар → код», и только потом
//  нажимает «Присвоить». Выданный код потом не меняется никогда.
// ------------------------------------------------------------------------
function блокКодов(products) {
  const безКода = products.filter(p => !p.code).length;
  const итог = el("div.hint", { text: естьКолонкаКода(products)
    ? `С кодом: ${products.length - безКода} · без кода: ${безКода}`
    : "Сначала выполните в Supabase файл db/catalog-migration.sql — он добавит товарам поле для кода." });
  const список = el("div");
  const показать = el("button.btn.btn-outline", { text: "Показать список кодов" });
  const card = el("div.card", { style: { marginBottom: "18px" } }, [
    el("div.section-h", { text: "Коды товаров для печатного каталога", style: { marginTop: 0 } }),
    el("div.hint", { text: "Каждому товару — постоянный код вида LP-017. Клиент пишет его из каталога, вы находите товар поиском по коду. Выданный код не меняется, даже если товар перенести в другой раздел." }),
    итог, показать, список,
  ]);

  const запрос = async (method, body) => {
    const r = await fetch("/api/admin/catalog-codes", {
      method, headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || "Ошибка " + r.status);
    return d;
  };

  показать.addEventListener("click", async () => {
    показать.disabled = true;
    список.replaceChildren(el("div.hint", { text: "Считаю…" }));
    try { нарисовать(await запрос("GET")); }
    catch (e) { список.replaceChildren(); toast(e.message, "err"); }
    finally { показать.disabled = false; }
  });

  function нарисовать(план) {
    список.replaceChildren();
    итог.textContent = `Всего товаров: ${план.всего} · с кодом: ${план.сКодом} · получат код: ${план.выдать.length}`;
    if (!план.выдать.length) { список.append(el("div.hint", { text: "Все товары уже с кодами." })); return; }

    const новые = Object.entries(план.новыеРазделы || {});
    if (новые.length) список.append(el("div.hint", { text: "Новые разделы получат буквы: " + новые.map(([k, v]) => `${k} — ${v}`).join(", ") }));

    // по разделам — так проще проверить глазами
    const поРазделам = new Map();
    for (const x of план.выдать) {
      if (!поРазделам.has(x.category)) поРазделам.set(x.category, []);
      поРазделам.get(x.category).push(x);
    }
    const таблица = el("div", { style: { maxHeight: "420px", overflow: "auto", border: "1px solid var(--line, #e5e7eb)", borderRadius: "10px", margin: "10px 0" } });
    for (const [раздел, товары] of поРазделам) {
      таблица.append(el("div", { style: { padding: "8px 12px", fontWeight: "600", background: "var(--bg-soft, #f3f4f6)", position: "sticky", top: "0" },
        text: `${раздел} — ${товары.length} шт. · ${товары[0].code} … ${товары[товары.length - 1].code}` }));
      for (const x of товары) {
        таблица.append(el("div", { style: { display: "flex", gap: "12px", padding: "4px 12px", fontSize: "13px" } }, [
          el("b", { text: x.code, style: { minWidth: "72px", fontFamily: "monospace" } }),
          el("span", { text: x.name }),
        ]));
      }
    }
    const надпись = `Присвоить коды: ${план.выдать.length}`;
    const присвоить = el("button.btn.btn-primary", { text: надпись });
    присвоить.addEventListener("click", async () => {
      if (!confirm(`Записать коды ${план.выдать.length} товарам? Потом они не меняются.`)) return;
      присвоить.disabled = true; присвоить.textContent = "Записываю…";
      try {
        const r = await запрос("POST", { ожидается: план.выдать.length });
        toast(`Записано: ${r.записано}` + (r.ошибки.length ? ` · не записано: ${r.ошибки.length}` : ""), r.ошибки.length ? "err" : "ok");
        if (r.ошибки.length) console.warn("[коды]", r.ошибки);
        нарисовать(await запрос("GET"));
      } catch (e) {
        toast(e.message, "err");
        присвоить.disabled = false; присвоить.textContent = надпись;
      }
    });
    список.append(таблица, присвоить);
  }
  return card;
}
