// ========================================================================
//  «КАТАЛОГ» в админке — предпросмотр, ссылка, отправка клиенту через бота
// ========================================================================
import { el, toast, field, input } from "../ui.js?v=20260914b";
import { sendToClient } from "../telegram.js?v=20260914b";
import { statusOf, placeholder } from "./products.js?v=20260914b";
import { icon } from "../icons.js?v=20260914b";
import { thumb } from "../img.js?v=20260914b";
import { authHeaders } from "../db.js?v=20260914b";
import { естьКолонкаКода, раздел } from "../catalogcode.js?v=20260914b";
import { РАЗДЕЛЫ } from "../catalogbook-text.js?v=20260914b";

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
  page.append(await блокКниги(products, ctx));

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

// ------------------------------------------------------------------------
//  ПЕЧАТНЫЙ КАТАЛОГ — книга для типографии.
//  Данные для обложки и последней страницы хранятся в settings.catalog_info.
//  Книга собирается на сервере (фото там уже лежат), здесь — только
//  запуск, полоса хода и ссылки на готовые файлы.
// ------------------------------------------------------------------------
const ЯЗЫК_КНИГИ = { ru: "Русский", uz: "O‘zbekcha", en: "English" };

async function блокКниги(products, ctx) {
  let настройки = {};
  try { настройки = await ctx.db.getSettings(); } catch { }
  const инфо = (настройки && настройки.catalog_info) || {};
  const естьКолонка = настройки && Object.prototype.hasOwnProperty.call(настройки, "catalog_info");
  const поЯзыку = (v, я) => (v && typeof v === "object" ? (v[я] || "") : (я === "ru" ? String(v || "") : ""));

  const fИмя = input({ value: инфо.название || "", placeholder: "GENERAL MODERN" });
  const fСайт = input({ value: инфо.сайт || "", placeholder: "generalmodern.uz" });
  const fБот = input({ value: инфо.telegram || "", placeholder: "https://t.me/generalmodernbot" });
  const fТел = el("textarea.inp", { placeholder: "+998 90 123 45 67\n+998 91 765 43 21", rows: 2 });
  fТел.value = (Array.isArray(инфо.телефоны) ? инфо.телефоны : String(инфо.телефоны || "").split(/[,;\n]/)).map(s => s.trim()).filter(Boolean).join("\n");
  const fАдрес = {};
  const fО = {};
  for (const я of Object.keys(ЯЗЫК_КНИГИ)) {
    fАдрес[я] = input({ value: поЯзыку(инфо.адрес, я), placeholder: `Адрес — ${ЯЗЫК_КНИГИ[я]}` });
    fО[я] = el("textarea.inp", { rows: 3, placeholder: `2–3 предложения о компании — ${ЯЗЫК_КНИГИ[я]}. Пусто — не печатается.` });
    fО[я].value = поЯзыку(инфо.оКомпании, я);
  }

  // названия разделов в книге — только те разделы, что есть в складе
  const разделы = [...new Set(products.map(p => раздел(p.category)))].sort((a, b) => a.localeCompare(b, "ru"));
  const правки = инфо.разделы || {};
  const fРазделы = {};
  const таблица = el("div", { style: { overflowX: "auto" } });
  const сетка = el("div", { style: { display: "grid", gridTemplateColumns: "minmax(120px,1fr) repeat(3, minmax(140px,1.3fr))", gap: "6px", alignItems: "center", minWidth: "620px" } });
  сетка.append(el("b", { text: "В складе" }), ...Object.values(ЯЗЫК_КНИГИ).map(t => el("b", { text: t })));
  for (const р of разделы) {
    fРазделы[р] = {};
    сетка.append(el("span", { text: р, style: { fontSize: "13px" } }));
    for (const я of Object.keys(ЯЗЫК_КНИГИ)) {
      const поУмолчанию = (РАЗДЕЛЫ[р] && РАЗДЕЛЫ[р][я]) || р;
      fРазделы[р][я] = input({ value: (правки[р] && правки[р][я]) || "", placeholder: поУмолчанию });
      сетка.append(fРазделы[р][я]);
    }
  }
  таблица.append(сетка);

  const сохранить = el("button.btn.btn-outline", { text: "Сохранить данные каталога" });
  сохранить.addEventListener("click", async () => {
    const обЯзыках = (поля) => Object.fromEntries(Object.entries(поля).map(([я, f]) => [я, f.value.trim()]).filter(([, v]) => v));
    const новыеПравки = {};
    for (const [р, поля] of Object.entries(fРазделы)) {
      const своё = обЯзыках(поля);
      if (Object.keys(своё).length) новыеПравки[р] = своё;
    }
    const данные = {
      название: fИмя.value.trim(),
      сайт: fСайт.value.trim(),
      telegram: fБот.value.trim(),
      телефоны: fТел.value.split("\n").map(s => s.trim()).filter(Boolean),
      адрес: обЯзыках(fАдрес),
      оКомпании: обЯзыках(fО),
      разделы: новыеПравки,
    };
    сохранить.disabled = true;
    try { await ctx.db.saveSettings({ catalog_info: данные }); toast("Данные каталога сохранены", "ok"); }
    catch (e) { toast(e.message, "err"); }
    finally { сохранить.disabled = false; }
  });

  // ---- сборка ----
  const язык = el("select.inp", { style: { maxWidth: "200px" } });
  for (const [k, t] of Object.entries(ЯЗЫК_КНИГИ)) язык.append(el("option", { value: k, text: t }));
  const кнОбразец = el("button.btn.btn-outline", { text: "Собрать образец (7 стр.)" });
  const кнВся = el("button.btn.btn-primary", { text: "Собрать весь каталог" });
  const полоса = el("div", { style: { height: "8px", background: "var(--line, #e5e7eb)", borderRadius: "4px", overflow: "hidden", margin: "10px 0 4px" } });
  const заливка = el("div", { style: { height: "100%", width: "0%", background: "var(--accent, #c9a24a)", transition: "width .4s" } });
  полоса.append(заливка);
  const ходТекст = el("div.hint");
  const ходБлок = el("div", {}, [полоса, ходТекст]);
  ходБлок.hidden = true;
  const книги = el("div");

  const card = el("div.card", { style: { marginBottom: "18px" } }, [
    el("div.section-h", { text: "Печатный каталог (книга для типографии)", style: { marginTop: 0 } }),
    el("div.hint", { text: "Книга A4 с обложкой, содержанием и всеми товарами, кроме скрытых, — с фото, кодом и названием, без цен. Собирается из того, что сейчас в складе: добавили фото или товар — соберите заново." }),
    естьКолонка ? null : el("div.hint", { style: { color: "var(--danger, #b91c1c)" }, text: "Для сохранения данных нужен db/catalog-migration.sql (поле catalog_info)." }),
    el("div.row2", {}, [field("Название на обложке", fИмя), field("Сайт", fСайт)]),
    el("div.row2", {}, [field("Telegram-бот (для QR)", fБот), field("Телефоны — по одному в строке", fТел)]),
    el("details", { style: { margin: "8px 0" } }, [
      el("summary", { text: "Адрес и текст «О компании» на трёх языках", style: { cursor: "pointer", fontWeight: "600" } }),
      ...Object.keys(ЯЗЫК_КНИГИ).map(я => el("div", { style: { marginTop: "8px" } }, [field("Адрес — " + ЯЗЫК_КНИГИ[я], fАдрес[я]), field("О компании — " + ЯЗЫК_КНИГИ[я], fО[я])])),
    ]),
    el("details", { style: { margin: "8px 0" } }, [
      el("summary", { text: "Названия разделов в книге", style: { cursor: "pointer", fontWeight: "600" } }),
      el("div.hint", { text: "Серым — как будет напечатано сейчас. Впишите своё, если перевод не подходит." }),
      таблица,
    ]),
    сохранить,
    el("div.section-h", { text: "Собрать", style: { marginTop: "18px" } }),
    el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" } }, [язык, кнОбразец, кнВся]),
    ходБлок,
    книги,
  ].filter(Boolean));

  const запрос = async (method, body) => {
    const r = await fetch("/api/admin/catalog-book", {
      method, headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok && r.status !== 409) throw new Error(d.error || "Ошибка " + r.status);
    if (r.status === 409) toast(d.error, "err");
    return d;
  };

  const ЭТАП = { запуск: "Запуск…", товары: "Читаю товары…", фото: "Фото", страницы: "Страницы", сохранение: "Сохраняю файл…", готово: "Готово" };
  const мб = (b) => (b / 1024 / 1024).toFixed(1) + " МБ";
  let таймер = 0;

  function нарисовать(с) {
    const з = с.задача;
    const идёт = з && !з.закончено;
    кнОбразец.disabled = кнВся.disabled = !!идёт;
    if (з) {
      ходБлок.hidden = false;
      const доля = з.всего ? з.готово / з.всего : 0;
      // фото — первая половина полосы, страницы — вторая
      const общая = з.закончено ? 1 : з.этап === "фото" ? доля * 0.5 : з.этап === "страницы" ? 0.5 + доля * 0.45 : з.этап === "сохранение" ? 0.97 : 0.02;
      заливка.style.width = Math.round(общая * 100) + "%";
      const что = `${ЯЗЫК_КНИГИ[з.язык] || з.язык}, ${з.образец ? "образец" : "весь каталог"}`;
      if (з.ошибка) ходТекст.textContent = `${что}: ошибка — ${з.ошибка}`;
      else if (з.закончено) ходТекст.textContent = `${что}: готово — ${з.всегоСтраниц ? (з.образец ? `${з.страниц} из ${з.всегоСтраниц}` : з.всегоСтраниц) + " стр., " : ""}${з.байт ? мб(з.байт) : ""}`;
      else ходТекст.textContent = `${что}: ${ЭТАП[з.этап] || з.этап}${з.всего ? ` ${з.готово} из ${з.всего}` : ""}`;
    }
    книги.replaceChildren();
    if (с.книги && с.книги.length) {
      книги.append(el("div.section-h", { text: "Готовые файлы", style: { marginTop: "14px" } }));
      for (const к of с.книги) {
        книги.append(el("div", { style: { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", padding: "6px 0", borderTop: "1px solid var(--line, #e5e7eb)" } }, [
          el("span", { text: `${ЯЗЫК_КНИГИ[к.язык] || к.язык} · ${к.образец ? "образец" : "весь каталог"}`, style: { fontWeight: "600" } }),
          el("span.muted", { text: `${мб(к.байт)} · ${new Date(к.собрана).toLocaleString("ru-RU")}` }),
          el("a.btn.btn-outline.btn-sm", { href: к.ссылка, download: к.имя, text: "Скачать" }),
        ]));
      }
    }
    clearTimeout(таймер);
    // пока идёт сборка и страница открыта — спрашиваем ход
    if (идёт) таймер = setTimeout(() => { if (document.body.contains(card)) обновить(); }, 1500);
  }
  const обновить = async () => { try { нарисовать(await запрос("GET")); } catch (e) { ходТекст.textContent = e.message; } };
  const собрать = async (образец) => {
    кнОбразец.disabled = кнВся.disabled = true;
    try { нарисовать(await запрос("POST", { язык: язык.value, образец })); }
    catch (e) { toast(e.message, "err"); кнОбразец.disabled = кнВся.disabled = false; }
  };
  кнОбразец.addEventListener("click", () => собрать(true));
  кнВся.addEventListener("click", () => собрать(false));
  обновить();
  return card;
}
