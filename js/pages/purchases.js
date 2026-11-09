// ========================================================================
//  СТРАНИЦА «ПРИХОД» — поступления: «в дороге» / «уже пришёл»
// ========================================================================
import { el, toast, modal, confirmDialog, field, input, select, inputList, lightbox, showLoader, hideLoader, setLoaderText } from "../ui.js?v=20261109j";
import { fmt, CUR, convert } from "../fx.js?v=20261109j";
import { placeholder } from "./products.js?v=20261109j";
import { consumeFIFO, ensureBatches, currentCost } from "../inventory.js?v=20261109j";
import { icon } from "../icons.js?v=20261109j";
import { downloadTemplate, parseRows, pickFile } from "../xlsx-import.js?v=20261109j";
import { notifyOwner } from "../telegram.js?v=20261109j";
import { authHeaders } from "../db.js?v=20261109j";
import { thumb, поставитьСнимок } from "../img.js?v=20261109j";
import { KIND_SHOP, purchaseKind, isShop, kindOptions, kindText, kindWho } from "../purchase.js?v=20261109j";
// Оприходование общее со складом в телефоне — иначе остатки разойдутся.
import { applyArrival, записатьПачкой, откатитьПриход, пересчётПрихода, применитьПравку, ужеОприходован } from "../arrival.js?v=20261109j";
// Единицы, упаковка и главное фото — для предпросмотра прихода.
import { подпись as подписьКол } from "../unit.js?v=20261109j";
import { статус as статусУпаковки, СТАТУС } from "../packing.js?v=20261109j";
// Доставка и растаможка — часть себестоимости. Делёж по позициям общий
// с оприходованием: предпросмотр и склад считают одним кодом.
import { расходы as расходыПрихода, поляРасходов, ПРАВИЛА_РАСХОДОВ } from "../pricing.js?v=20261109j";
import { главноеФото } from "../photo.js?v=20261109j";
import { изменениеСклада } from "../db.js?v=20261109j";

// разослать клиентам в Telegram-бот, что пришли новые товары (не блокирует оприходование)
async function notifyClientsNewProducts(productIds) {
  try {
    const r = await fetch("/api/notify-new-products", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ product_ids: productIds }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) toast(`Клиенты оповещены о новинках (${j.sent || 0})`, "ok");
    else toast("Оповещение не отправлено: " + (j.error || r.status), "err");
  } catch (e) { toast("Оповещение не отправлено: " + (e.message || e), "err"); }
}

// Модалка «не найдено в каталоге» (общая для прихода и продажи).
export function showNotFound(list) {
  modal({
    title: `Не найдено в каталоге (${list.length})`,
    body: el("div", {}, [
      el("div.hint", { text: "Эти позиции пропущены — таких товаров нет в каталоге. Добавьте их в «Товары» или проверьте названия." }),
      el("div", { style: { maxHeight: "40vh", overflow: "auto" } }, list.map(n => el("div", { style: { padding: "6px 2px", borderBottom: "1px solid var(--border)", fontSize: "14px" }, text: "• " + n }))),
    ]),
    actions: [{ label: "Понятно", kind: "btn-primary", onClick: c => c() }],
  });
}

const PCUR = [{ value: "yuan", label: "Юань ¥" }, { value: "usd", label: "Доллар $" }, { value: "som", label: "Сум" }];

// Показать все товары накладной поставщика (фото + название + кол-во) — что в дороге / что пришло
function showPurchaseItems(s, products) {
  const pmap = Object.fromEntries(products.map(p => [p.id, p]));
  const statusTxt = s.status === "arrived" ? "✅ Уже пришёл" : s.status === "ordered" ? "📝 Заказан" : "🚚 В дороге";
  const rows = (s.items || []).map(it => {
    const p = pmap[it.product_id] || { name: "?" };
    return el("div.card", { style: { padding: "8px 10px", marginBottom: "8px", display: "flex", gap: "10px", alignItems: "center" } }, [
      el("img.thumb", { src: p.photo_url ? thumb(p.photo_url, 60) : placeholder(p.name), loading: "lazy", decoding: "async", style: { width: "60px", height: "60px", cursor: "zoom-in" }, title: "Увеличить", onclick: () => p.photo_url && lightbox(p.photo_url), onerror: function () { this.src = placeholder(p.name); } }),
      el("div", { style: { flex: "1", minWidth: "0", fontWeight: "600" }, text: p.name }),
      el("div", { style: { fontWeight: "700", whiteSpace: "nowrap", fontSize: "15px" }, text: "× " + it.qty }),
    ]);
  });
  modal({
    title: `${s.supplier || "—"} · ${statusTxt}`,
    body: el("div", {}, [
      el("div.hint", { text: `Дата: ${new Date(s.date).toLocaleDateString("ru-RU")} · Позиций: ${(s.items || []).length}` }),
      el("div", { style: { maxHeight: "60vh", overflow: "auto", marginTop: "10px" } }, rows.length ? rows : [el("div.empty", {}, [el("p", { text: "Товаров нет" })])]),
    ]),
    actions: [{ label: "Закрыть", kind: "btn-primary", onClick: c => c() }],
  });
}

export default async function render(page, ctx) {
  const [purchases, products] = await Promise.all([ctx.db.purchases.list(), ctx.db.products.list()]);
  const pmap = Object.fromEntries(products.map(p => [p.id, p]));
  const suppliers = [...new Set(purchases.map(p => p.supplier).filter(Boolean))];

  page.append(
    el("div.topbar", {}, [
      el("div", {}, [el("h1", { text: "Приход товара" }), el("div.sub", { text: `Поступлений: ${purchases.length}` })]),
      el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } }, [
        el("button.btn.btn-outline", { title: "Отправить всем клиентам в Telegram: «пришли новые товары» + ссылки", onclick: () => confirmDialog("Отправить всем клиентам в Telegram уведомление о новых товарах?", () => notifyClientsNewProducts([])) }, ["📢 Оповестить клиентов"]),
        el("button.btn.btn-primary", { onclick: () => openEditor(ctx, null, products, suppliers) }, [icon("plus", { size: 16 }), "Новый приход"]),
      ]),
    ]),
  );

  if (!purchases.length) { page.append(el("div.empty", {}, [el("div.em-ic", {}, [icon("truck", { size: 40 })]), el("p", { text: "Поступлений пока нет" })])); return; }

  const fFilter = select([{ value: "", label: "Все приходы" }, ...kindOptions()], "");
  fFilter.style.maxWidth = "220px";
  fFilter.addEventListener("change", draw);
  page.append(el("div", { style: { margin: "0 0 12px" } }, [fFilter]));

  const tbody = el("tbody");
  function draw() {
  tbody.textContent = "";
  purchases.filter(s => !fFilter.value || purchaseKind(s) === fFilter.value)
    .sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(s => {
    const total = (s.items || []).reduce((t, i) => t + i.qty * i.unit_cost, 0);
    tbody.append(el("tr", {}, [
      el("td", { text: new Date(s.date).toLocaleDateString("ru-RU") }),
      el("td", {}, [el("strong", { text: s.supplier || "—" }), isShop(s) && el("div", { style: { fontSize: "12px", color: "var(--muted)" }, text: kindText(s.kind) })].filter(Boolean)),
      el("td", {}, [el("span.badge.cur", { text: CUR[s.currency].label })]),
      el("td", { text: (s.items || []).length + " поз." }),
      el("td", {}, [el("strong", { text: fmt(total, s.currency) }),
        // Доставка и растаможка — часть того, во что обошлась закупка.
        // В сумму товаров их не складываем: это разные деньги.
        расходыПрихода(s).есть && el("div", { style: { fontSize: "12px", color: "var(--muted)" },
          text: "+ расходы " + fmt(расходыПрихода(s).сумма, расходыПрихода(s).валюта || s.currency) })].filter(Boolean)),
      el("td", {}, [s.status === "arrived"
        ? el("span.badge.arrived", {}, [icon("check", { size: 13 }), "Пришёл"])
        : s.status === "ordered"
          ? el("span.badge.order", {}, [icon("cart", { size: 13 }), "Заказан"])
          : el("span.badge.transit", {}, [icon("truck", { size: 13 }), "В дороге"])]),
      el("td.right", {}, [el("div.row-actions", {}, [
        s.status !== "arrived" && el("button.btn.btn-ok.btn-sm", { text: "Оприходовать", title: "Отметить «пришёл» и добавить на склад", onclick: function () { arrive(ctx, s, products, this); } }),
        s.status === "arrived" && el("button.btn.btn-outline.btn-sm", { title: "Если оприходовали дважды — списать товары этого прихода один раз", onclick: () => unarriveOnce(ctx, s, products) }, ["↩️ −1 оприх."]),
        el("button.btn.btn-outline.btn-sm", { title: "Показать товары этого поставщика (фото + кол-во)", text: "👁 Товары", onclick: () => showPurchaseItems(s, products) }),
        el("button.btn.btn-outline.btn-sm.btn-icon", { title: "Редактировать", onclick: () => openEditor(ctx, s, products, suppliers) }, [icon("edit", { size: 16 })]),
        el("button.btn.btn-danger.btn-sm.btn-icon", { title: "Удалить", onclick: () => confirmDialog("Удалить приход?" + (s.status === "arrived" ? " Оприходованные товары спишутся со склада." : ""), async () => {
          // Списываем ТЕМ ЖЕ откатом, что и кнопка «−1 оприх.».
          //
          // Раньше здесь списывалось количество из накладной — число
          // ЗАКУПОЧНЫХ единиц. У товара с настроенной упаковкой это не то
          // же самое, что лежит на складе: поставщик продал 100 штук, на
          // полке 10 пачек, а удаление прихода списывало 100 пачек — и
          // остаток уходил в −90 с выдуманным долгом на полтора миллиона.
          // откатитьПриход() снимает ровно те партии, которые этот приход
          // и положил.
          if (s.status === "arrived") {
            // Склад двигается — значит это складская операция, и она
            // обязана остаться в журнале, а не быть тихой правкой чисел.
            изменениеСклада("Удаление прихода: " + (s.supplier || "—"), s.id);
            await записатьПачкой(ctx.db, откатитьПриход(s, products, consumeFIFO));
          }
          await ctx.db.purchases.remove(s.id); toast("Удалено", "ok"); ctx.refresh();
        }) }, [icon("trash", { size: 16 })]),
      ].filter(Boolean))]),
    ]));
  });
  }
  draw();
  page.append(el("div", { style: { overflowX: "auto" } }, [el("table.tbl", {}, [
    el("thead", {}, [el("tr", {}, ["Дата", "Поставщик / магазин", "Валюта", "Позиции", "Сумма", "Статус", ""].map(h => el("th", { text: h })))]),
    tbody,
  ])]));
}

// списать товары этого прихода со склада ОДИН раз — если приход случайно оприходован дважды
async function unarriveOnce(ctx, s, products) {
  confirmDialog("Списать товары этого прихода со склада ОДИН раз? (используйте, если оприходовали дважды). Запись прихода останется.", async () => {
    изменениеСклада("Откат прихода: " + (s.supplier || "—"), s.id);
    showLoader("Списываем…");
    try {
      await записатьПачкой(ctx.db, откатитьПриход(s, products, consumeFIFO));
      toast("Списано один раз — остатки исправлены", "ok");
    } catch (e) { toast("Не получилось списать: " + (e.message || e), "err"); }
    finally { hideLoader(); }
    ctx.refresh();
  });
}

// ========================================================================
//  ПРЕДПРОСМОТР ПРИХОДА — что именно ляжет на склад.
//
//  Показываем ДО записи, потому что пересчёт по упаковке меняет и
//  количество, и себестоимость: поставщик продал 100 штук, а на полку
//  встанет 10 пачек по другой цене. Заметить ошибку здесь стоит одного
//  нажатия «Отмена», а после оприходования — отката склада.
//
//  Возвращает обещание: true — оприходовать, false — передумали.
// ========================================================================
function предпросмотрПрихода(s, products) {
  return new Promise((готово) => {
    const разбор = пересчётПрихода(s, products);
    const pmap = Object.fromEntries(products.map(p => [p.id, p]));
    // Правило «спрашивать» — единственное, что требует отдельной галочки:
    // владелец сам просил не пропускать неполные упаковки молча.
    const спросить = разбор.filter(({ решение }) => решение.пересчитано && решение.правило === "ask" && !решение.ровно);
    let согласен = !спросить.length;

    const расх = расходыПрихода(s);

    const строки = разбор.map(({ it, решение, доп }) => {
      const p = pmap[it.product_id] || { name: "?" };
      const было = подписьКол(решение.кол, { unit: решение.ед })
        + (решение.цена ? " × " + fmt(решение.цена, решение.валюта || s.currency) : "");
      const стало = подписьКол(решение.складских, { unit: решение.складскаяЕд })
        + (решение.себестоимость ? " по " + fmt(решение.себестоимость, решение.валюта || s.currency) : "");

      const метки = [];
      if (решение.изЗаписи) метки.push(["Уже оприходовано", "var(--muted)"]);
      else if (!решение.пересчитано) метки.push([статусУпаковки(p).код === СТАТУС.ПРОВЕРИТЬ ? "Упаковка требует проверки" : "Упаковка не настроена", "var(--muted)"]);
      if (решение.пересчитано && !решение.ровно) {
        метки.push([`Неполная упаковка: ${решение.полных} целых и ${решение.остатокШтук} шт`, "var(--warn)"]);
      }
      if (решение.отложеноШтук) метки.push([`Отложено ${решение.отложеноШтук} шт — на склад не кладём`, "var(--warn)"]);
      // Доля расходов этой позиции. Уже оприходованные показывают свою —
      // ту, что записана в документе, а не посчитанную заново.
      const доляПозиции = Number(решение.изЗаписи ? решение.доп : доп) || 0;
      if (доляПозиции) {
        метки.push([`В себестоимость вошло ${fmt(доляПозиции, расх.валюта || s.currency)} расходов`, "var(--muted)"]);
      }

      return el("div.card", { style: { padding: "10px", marginBottom: "8px", display: "flex", gap: "10px", alignItems: "flex-start" } }, [
        el("img.thumb", { src: главноеФото(p) ? thumb(главноеФото(p), 60) : placeholder(p.name), loading: "lazy", decoding: "async",
          style: { width: "48px", height: "48px", flex: "0 0 auto" }, onerror: function () { this.src = placeholder(p.name); } }),
        el("div", { style: { flex: "1", minWidth: "0" } }, [
          el("div", { style: { fontWeight: "600" }, text: p.name }),
          el("div", { style: { fontSize: "13px", marginTop: "2px" } }, [
            el("span.muted", { text: было }),
            el("span", { text: решение.пересчитано ? "  →  " : "  ", style: { opacity: ".6" } }),
            el("strong", { text: стало }),
          ]),
          ...метки.map(([т, цвет]) => el("div", { text: т, style: { fontSize: "12px", marginTop: "3px", color: цвет } })),
        ]),
      ]);
    });

    const итого = разбор.reduce((t, { решение }) => t + (Number(решение.кол) || 0) * (Number(решение.цена) || 0), 0);
    // Разложенные расходы — ровно столько, сколько легло в себестоимость.
    // Показываем именно эту сумму, а не вписанную: если по какой-то
    // причине разделить не удалось, владелец это увидит.
    const разложено = разбор.reduce((t, { решение, доп }) =>
      t + (Number(решение.изЗаписи ? решение.доп : доп) || 0), 0);
    const правилоТекст = (ПРАВИЛА_РАСХОДОВ.find(п => п.value === расх.правило) || {}).label || "";
    const тело = el("div", {}, [
      el("div.hint", { text: "Проверьте, что встанет на полку. Товары с ненастроенной упаковкой приходуются как раньше — один к одному." }),
      ...строки,
      // У оприходованных позиций доли взяты ИЗ ДОКУМЕНТА, а не посчитаны
      // заново. Тогда и правило называть нельзя: в полях документа могло
      // уже стоять другое, а числа остались прежними — так и должно быть.
      разложено ? el("div.hint", { style: { textAlign: "right", marginTop: "8px" },
        text: разбор.every(({ решение }) => решение.изЗаписи)
          ? `Расходы ${fmt(разложено, расх.валюта || s.currency)} уже разложены по позициям — так записано в документе`
          : `Расходы ${fmt(разложено, расх.валюта || s.currency)} разложены по позициям — ${правилоТекст.toLowerCase()}` }) : null,
      el("div", { style: { textAlign: "right", fontSize: "17px", fontWeight: "800", marginTop: "8px" } },
        ["Закуплено на ", el("span.gradtext", { text: fmt(итого, s.currency) }),
          ...(разложено ? [" + расходы ", el("span.gradtext", { text: fmt(разложено, расх.валюта || s.currency) })] : [])]),
    ].filter(Boolean));

    if (спросить.length) {
      const галка = el("input", { type: "checkbox", style: { width: "18px", height: "18px", flex: "0 0 auto", accentColor: "var(--accent)" } });
      галка.addEventListener("change", () => {
        согласен = галка.checked;
        if (кнопкаОк) кнопкаОк.disabled = !согласен;
      });
      тело.append(el("label", { style: { display: "flex", gap: "9px", alignItems: "center", marginTop: "10px", cursor: "pointer", color: "var(--warn)" } }, [
        галка,
        el("span", { text: `Подтверждаю неполные упаковки (${спросить.length} поз.) — товар просил спрашивать` }),
      ]));
    }

    const окно = modal({
      title: "Что ляжет на склад",
      wide: true,
      body: тело,
      actions: [
        { label: "Отмена", kind: "btn-outline", onClick: c => { готово(false); c(); } },
        { label: "Оприходовать", kind: "btn-ok", onClick: c => { if (!согласен) return; готово(true); c(); } },
      ],
    });
    var кнопкаОк = окно.content.parentElement.querySelector(".modal-foot .btn-ok");
    if (кнопкаОк) кнопкаОк.disabled = !согласен;
    // Закрыли крестиком или мимо окна — это тоже «передумали».
    const overlay = окно.content.closest(".modal-overlay");
    const наблюдатель = new MutationObserver(() => {
      if (!document.body.contains(overlay)) { наблюдатель.disconnect(); готово(false); }
    });
    наблюдатель.observe(document.body, { childList: true });
  });
}

async function arrive(ctx, s, products, кнопка) {
  предпросмотрПрихода(s, products).then(async (да) => {
    if (!да) return;
    // Пока идёт запись, кнопку блокируем: раньше при 43 позициях запись шла
    // почти минуту, владелец считал, что зависло, и нажимал ещё раз —
    // половина прихода ложилась на склад дважды.
    if (кнопка) { кнопка.disabled = true; кнопка.textContent = "Оприходую…"; }
    изменениеСклада("Приход: " + (s.supplier || "—"), s.id);
    showLoader("Оприходование…");
    try {
      await applyArrival(ctx.db, s, products, (готово, всего) => setLoaderText(`Оприходование… ${готово} из ${всего}`), { кто: "склад на сайте" });
      await ctx.db.purchases.upsert({ id: s.id, status: "arrived" });
    } catch (e) {
      hideLoader();
      if (кнопка) { кнопка.disabled = false; кнопка.textContent = "Оприходовать"; }
      toast("Не дошло до конца: " + (e.message || e) + ". Нажмите «Оприходовать» ещё раз — допишется только недостающее.", "err");
      ctx.refresh();
      return;
    }
    hideLoader();
    const pmap2 = Object.fromEntries(products.map(p => [p.id, p]));
    const lines = (s.items || []).map(it => `• ${pmap2[it.product_id]?.name || "?"} × ${it.qty}`);
    try { await notifyOwner(`Новый приход на склад\n${kindWho(s.kind)}: ${s.supplier || "—"}\n\n${lines.join("\n")}`); } catch {}
    toast("Оприходовано, остатки обновлены", "ok");
    // Оповещаем клиентов только о поставках. Приход из магазина — пополнение
    // того, что уже продаётся, рассылать о нём «пришли новинки» незачем.
    if (!isShop(s)) {
      const productIds = [...new Set((s.items || []).map(it => it.product_id).filter(Boolean))];
      if (productIds.length) await notifyClientsNewProducts(productIds);
    }
    ctx.refresh();
  });
}


function openEditor(ctx, purchase, products, suppliers = []) {
  const isNew = !purchase;
  const pmap = Object.fromEntries(products.map(p => [p.id, p]));
  const state = purchase
    ? { supplier: purchase.supplier, currency: purchase.currency, status: purchase.status, date: purchase.date, kind: purchaseKind(purchase), items: JSON.parse(JSON.stringify(purchase.items || [])) }
    : { supplier: "", currency: "yuan", status: "in_transit", date: new Date().toISOString(), kind: "supplier", items: [] };
  const расхБыло = расходыПрихода(purchase || { currency: state.currency });

  const fKind = select(kindOptions(), state.kind);
  const fSupplier = inputList(suppliers, { value: state.supplier || "", placeholder: "Поставщик (выбор или ввод)" });
  const supplierField = field(kindWho(state.kind), fSupplier);
  const shopHint = el("div", { style: { fontSize: "13px", margin: "-4px 0 6px", color: "var(--muted)", display: state.kind === KIND_SHOP ? "" : "none" },
    text: "Товар из магазина приходует по НАШЕЙ складской цене — себестоимость менять не нужно." });
  const fCurrency = select(PCUR, state.currency);
  // «Заказан» — приход оформлен поставщику, но товар ещё не выехал. Нужен
  // дашборду: по нему считается показатель «Деньги в заказанных товарах»
  // отдельно от «Денег в дороге», чтобы одни деньги не считались дважды.
  const fStatus = select([
    { value: "ordered", label: "Заказан (ещё не выехал)" },
    { value: "in_transit", label: "В дороге" },
    { value: "arrived", label: "Уже пришёл" },
  ], state.status);
  // ----- дополнительные расходы на эту закупку -----
  //
  // Доставка, растаможка, комиссия — это тоже себестоимость товара. Если
  // их не разложить по позициям, прибыль окажется завышенной ровно на
  // стоимость доставки. Делятся они по правилу учёта, и делятся до
  // копейки: сумма долей равна вписанной сумме (js/pricing.js).
  //
  // Из магазина товар приходуется по НАШЕЙ складской цене — чужие расходы
  // к ней не прибавляются, поэтому поле там и не показывается.
  const fExtra = input({ type: "number", step: "0.01", min: "0", placeholder: "0", value: расхБыло.есть ? String(расхБыло.сумма) : "" });
  const fExtraRule = select(ПРАВИЛА_РАСХОДОВ.map(п => ({ value: п.value, label: п.label })), расхБыло.правило);
  const fExtraNote = input({ placeholder: "например: доставка до Ташкента" });
  fExtraNote.value = расхБыло.примечание || "";
  const extraHint = el("div.hint", {});
  const extraWrap = el("div", { style: { display: state.kind === KIND_SHOP ? "none" : "" } }, [
    el("div.section-h", { text: "Дополнительные расходы на закупку" }),
    el("div.hint", { text: "Доставка, растаможка, комиссия. Разложатся по позициям и войдут в себестоимость — остаток от этого не меняется." }),
    el("div.row2", {}, [field("Сумма расходов", fExtra), field("Как распределить", fExtraRule)]),
    field("Примечание (необязательно)", fExtraNote),
    extraHint,
  ]);

  const itemsBox = el("div");
  const totalBox = el("div", { style: { textAlign: "right", fontSize: "20px", fontWeight: "800", marginTop: "10px" } });
  const nameToId = {}; products.forEach(p => { nameToId[(p.name || "").toLowerCase()] = p.id; });

  // ----- панель добавления (как в продажах): товар + кол-во + себестоимость -----
  const fProduct = inputList(products.map(p => p.name), { placeholder: "впишите или выберите", style: { flex: "1", minWidth: "180px" } });
  const fQty = input({ type: "number", placeholder: "0", style: { width: "110px" } });
  const fCost = input({ type: "number", step: "0.01", placeholder: "0", style: { width: "130px" } });
  const preview = el("img.thumb", { style: { width: "72px", height: "72px", cursor: "zoom-in", display: "none" }, title: "Увеличить" });
  const costHint = el("div", { style: { fontSize: "13px", margin: "6px 0", color: "var(--muted)" } });
  const selId = () => nameToId[(fProduct.value || "").trim().toLowerCase()] || "";

  function refreshAdd() {
    const p = pmap[selId()];
    if (!p) { preview.style.display = "none"; costHint.textContent = ""; return; }
    поставитьСнимок(preview, p.photo_url, placeholder(p.name), 96); preview.style.display = ""; preview.onclick = () => p.photo_url && lightbox(p.photo_url);
    // цена по FIFO-партиям — то, во что товар обходится нам прямо сейчас
    const own = currentCost(ensureBatches(p));
    const def = state.currency === "usd" ? own.cost_usd : state.currency === "yuan" ? own.cost_yuan : Math.round(convert(own.cost_yuan, "yuan", "som"));
    // из магазина — цена всегда наша, поле только для справки
    if (state.kind === KIND_SHOP) { fCost.value = def || 0; fCost.disabled = true; fCost.title = "Из магазина товар приходует по нашей складской цене"; }
    else { fCost.disabled = false; fCost.title = ""; if (!fCost.value) fCost.value = def || ""; }
    costHint.textContent = "Текущая себестоимость: " + fmt(own.cost_yuan, "yuan");
  }
  fProduct.addEventListener("input", refreshAdd);
  fCurrency.addEventListener("change", () => { state.currency = fCurrency.value; refreshAdd(); drawItems(); });
  fKind.addEventListener("change", () => {
    state.kind = fKind.value;
    const who = kindWho(state.kind);
    supplierField.querySelector(".field-label").textContent = who;
    fSupplier.placeholder = who + " (выбор или ввод)";
    shopHint.style.display = state.kind === KIND_SHOP ? "" : "none";
    extraWrap.style.display = state.kind === KIND_SHOP ? "none" : "";
    fCost.value = ""; refreshAdd(); recalc();
  });

  function addToCart() {
    const id = selId(); if (!id) { toast("Выберите товар из списка", "err"); return; }
    const qv = +fQty.value || 0; if (qv <= 0) { toast("Укажите количество", "err"); return; }
    state.items.push({ product_id: id, qty: qv, unit_cost: +fCost.value || 0, currency: state.currency });
    drawItems();
    fProduct.value = ""; fQty.value = ""; fCost.value = ""; refreshAdd();
  }
  const addBtn = el("button.btn.btn-ok", { onclick: addToCart }, [icon("plus", { size: 16 }), "Добавить"]);
  fQty.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addToCart(); } });
  fCost.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addToCart(); } });

  // импорт списка прихода из Excel (название + кол-во + себестоимость)
  async function importFromExcel(file) {
    showLoader("Импорт из Excel…");
    try {
      const rows = await parseRows(file, "purchase");
      const notFound = []; let added = 0;
      rows.forEach(r => {
        const id = nameToId[(r.name || "").toLowerCase()];
        if (!id) { notFound.push(r.name); return; }
        state.items.push({ product_id: id, qty: r.qty || 1, unit_cost: r.cost || 0, currency: state.currency });
        added++;
      });
      drawItems();
      toast(`Добавлено позиций: ${added}`, added ? "ok" : "err");
      if (notFound.length) showNotFound(notFound);
    } catch (e) { toast("Ошибка: " + (e.message || e), "err"); }
    finally { hideLoader(); }
  }
  function drawItems() {
    itemsBox.innerHTML = "";
    if (!state.items.length) itemsBox.append(el("div.empty", { style: { padding: "24px" } }, [el("p", { text: "Добавьте товары" })]));
    state.items.forEach((it, idx) => {
      const p = pmap[it.product_id] || { name: "?" };
      const qty = input({ type: "number", value: it.qty, style: { width: "80px" } });
      const cost = input({ type: "number", step: "0.01", value: it.unit_cost, style: { width: "110px" } });
      const lt = el("strong", { text: fmt(it.qty * it.unit_cost, state.currency) });
      // Правим через применитьПравку: она снимает замороженную запись
      // позиции, если поехали числа. Без этого исправление не доходило до
      // склада — приход брал записанное и клал прежнее количество.
      qty.addEventListener("input", () => { применитьПравку(it, { qty: +qty.value || 0 }); lt.textContent = fmt(it.qty * it.unit_cost, state.currency); recalc(); });
      cost.addEventListener("input", () => { применитьПравку(it, { unit_cost: +cost.value || 0, currency: state.currency }); lt.textContent = fmt(it.qty * it.unit_cost, state.currency); recalc(); });
      itemsBox.append(el("div.card", { style: { padding: "12px", marginBottom: "10px", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" } }, [
        el("img.thumb", { src: p.photo_url ? thumb(p.photo_url, 60) : placeholder(p.name), loading: "lazy", decoding: "async", onerror: function(){ this.src = placeholder(p.name); } }),
        el("div", { style: { flex: "1", minWidth: "140px", fontWeight: "600" }, text: p.name }),
        el("div", {}, [el("div.field-label", { text: "Кол-во" }), qty]),
        el("div", {}, [el("div.field-label", { text: "Себест. " + CUR[state.currency].sign }), cost]),
        el("div", { style: { minWidth: "90px", textAlign: "right" } }, [el("div.field-label", { text: "Сумма" }), lt]),
        el("button.btn.btn-danger.btn-sm.btn-icon", { title: "Убрать", onclick: () => { state.items.splice(idx, 1); drawItems(); } }, [icon("x", { size: 15 })]),
      ]));
    });
    recalc();
  }
  function recalc() {
    const total = state.items.reduce((t, i) => t + i.qty * i.unit_cost, 0);
    totalBox.innerHTML = ""; totalBox.append("Итого: ", el("span.gradtext", { text: fmt(total, state.currency) }));
    const доп = state.kind === KIND_SHOP ? 0 : Math.max(0, +fExtra.value || 0);
    if (доп > 0) {
      totalBox.append(el("div", { style: { fontSize: "14px", fontWeight: "600", marginTop: "4px", color: "var(--muted)" },
        text: "С расходами: " + fmt(total + доп, state.currency) }));
    }
    // Насколько подорожает товар. Процент — то, на что владелец смотрит:
    // по нему сразу видно, не вписана ли доставка на порядок больше.
    extraHint.textContent = доп > 0
      ? (total > 0
        ? `Себестоимость вырастет на ${Math.round((доп / total) * 1000) / 10}% — это ${fmt(доп, state.currency)} на ${state.items.length} поз.`
        : "Добавьте товары — расходы разложатся по ним.")
      : "Пусто — значит расходов нет, и приход считается как раньше.";
  }
  [fExtra, fExtraNote].forEach(п => п.addEventListener("input", recalc));
  fExtraRule.addEventListener("change", recalc);
  drawItems();

  const body = el("div", {}, [
    el("div.row2", {}, [field("Тип прихода", fKind), field("Валюта", fCurrency)]),
    supplierField, shopHint,
    field("Статус", fStatus),
    el("div.hint", { text: "При статусе «Уже пришёл» товары автоматически добавятся на склад." }),
    el("div", { style: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginTop: "8px" } }, [
      el("div.section-h", { text: "Добавьте товары", style: { margin: "0", flex: "1" } }),
      el("button.btn.btn-outline.btn-sm", { text: "📄 Шаблон", title: "Скачать шаблон Excel", onclick: () => downloadTemplate("purchase") }),
      el("button.btn.btn-outline.btn-sm", { text: "📥 Из Excel", title: "Импорт списка из Excel", onclick: () => pickFile(importFromExcel) }),
    ]),
    el("div", { style: { display: "flex", gap: "12px", alignItems: "flex-start", flexWrap: "wrap", marginBottom: "10px" } }, [
      preview,
      el("div", { style: { flex: "1", minWidth: "260px" } }, [
        el("div", { style: { display: "flex", gap: "10px", alignItems: "flex-end", flexWrap: "wrap" } }, [
          el("div", { style: { flex: "1", minWidth: "180px" } }, [el("div.field-label", { text: "Товар (впишите или выберите)" }), fProduct]),
          el("div", {}, [el("div.field-label", { text: "Кол-во" }), fQty]),
          el("div", {}, [el("div.field-label", { text: "Себест. за ед." }), fCost]),
          addBtn,
        ]),
        costHint,
      ]),
    ]),
    el("div.section-h", { text: "Список прихода" }),
    // Приход уже на складе. Исправить документ можно, но склад от правки
    // не изменится: партии этого прихода уже лежат на полке, а второй раз
    // он не зачислится (и не должен). Сказать об этом надо ЗДЕСЬ, пока
    // владелец не исправил количество в уверенности, что остаток поедет.
    ...(!isNew && ужеОприходован(purchase, products) ? [el("div.hint", {
      style: { color: "var(--warn)", fontWeight: "600" },
      text: "Этот приход уже оприходован — товары на складе, и правка сама по себе их не изменит. "
        + "Чтобы исправление дошло до склада: поставьте статус «В дороге» и сохраните — товары спишутся; "
        + "потом исправьте количество и снова поставьте «Уже пришёл».",
    })] : []),
    itemsBox,
    extraWrap,
    totalBox,
  ]);

  modal({
    title: isNew ? "Новый приход" : "Приход", wide: true, body,
    actions: [
      { label: "Отмена", kind: "btn-outline", onClick: c => c() },
      { label: "Сохранить", kind: "btn-primary", onClick: async (close) => {
        if (!state.items.length) { toast("Добавьте товары", "err"); return; }
        showLoader("Сохранение…");
        try {
          const wasArrived = purchase?.status === "arrived";
          const obj = { ...(purchase ? { id: purchase.id } : {}), supplier: fSupplier.value.trim(), currency: state.currency, status: fStatus.value, date: state.date, items: state.items };
          // Расходы. Из магазина их не бывает: цена там наша складская.
          const extra = state.kind === KIND_SHOP ? null : поляРасходов({
            сумма: fExtra.value, валюта: state.currency,
            правило: fExtraRule.value, примечание: fExtraNote.value.trim(),
          });
          // Пробуем от полного к урезанному: колонок extra и kind могло
          // ещё не появиться в базе — но из-за них терять сам приход
          // незачем. Что именно записалось, помним: от этого зависит, с
          // расходами ли считать склад.
          const варианты = [
            ...(extra ? [{ ...obj, kind: state.kind, extra }] : []),
            { ...obj, kind: state.kind },
            obj,
          ];
          let saved = null, расходыЗаписаны = !extra, беда = null;
          for (const вариант of варианты) {
            try {
              saved = await ctx.db.purchases.upsert(вариант);
              if (вариант.extra) расходыЗаписаны = true;
              if (вариант.kind) obj.kind = state.kind;
              беда = null; break;
            } catch (e) { беда = e; }
          }
          if (беда) throw беда;
          // Расходы не записались — колонки extra ещё нет в базе
          // (db/purchase-extra-migration.sql). Молчать тут нельзя: иначе
          // владелец думает, что доставка вошла в себестоимость, а она
          // нигде не сохранилась. И в склад её тоже не берём — приход
          // должен считаться ровно по тому, что лежит в документе.
          if (extra && !расходыЗаписаны) {
            toast("Расходы не сохранились: в базе нет колонки extra. Выполните db/purchase-extra-migration.sql", "err");
          }
          const документ = { ...(saved || obj), kind: state.kind, ...(расходыЗаписаны && extra ? { extra } : {}) };
          // если только что отметили «пришёл» — добавить на склад
          if (fStatus.value === "arrived" && !wasArrived) {
            // тип передаём явно: если колонки kind ещё нет в базе, ответ придёт
            // без него, и приход из магазина ошибочно посчитался бы поставкой
            await applyArrival(ctx.db, документ, products, null, { кто: "склад на сайте" });
            const pmap3 = Object.fromEntries(products.map(p => [p.id, p]));
            const lines3 = (state.items || []).map(it => `• ${pmap3[it.product_id]?.name || "?"} × ${it.qty}`);
            try { await notifyOwner(`Новый приход на склад\n${kindWho(state.kind)}: ${fSupplier.value.trim() || "—"}\n\n${lines3.join("\n")}`); } catch {}
          } else if (wasArrived && fStatus.value !== "arrived") {
            // Сняли «пришёл» → списываем товары со склада, чтобы повторное
            // оприходование не задвоило остаток.
            //
            // Снимаем ТЕМ ЖЕ откатом, что и кнопка «−1 оприх.»: он убирает
            // ровно те партии, которые этот приход положил. Раньше здесь
            // списывалось количество из накладной — число ЗАКУПОЧНЫХ
            // единиц. У товара с упаковкой это не то, что лежит на складе:
            // поставщик продал 100 штук, на полке 10 пачек, а списывалось
            // 100 пачек — остаток проваливался в минус на целую поставку.
            //
            // Берём ПРЕЖНИЕ позиции документа (purchase.items): списать
            // надо то, что когда-то положили, а не то, что владелец
            // только что вписал в форму.
            изменениеСклада("Снят статус «пришёл»: " + (fSupplier.value.trim() || "—"), purchase.id);
            await записатьПачкой(ctx.db, откатитьПриход(purchase, products, consumeFIFO));
          }
          toast("Сохранено", "ok"); close(); ctx.refresh();
        } catch (e) { toast("Ошибка: " + (e.message || e), "err"); }
        finally { hideLoader(); }
      } },
    ],
  });
}
