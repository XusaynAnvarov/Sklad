// Продажа: одна накладная на несколько товаров.
// Сканируем наклейку за наклейкой — каждая позиция ложится в общий список.
// Цена подставляется из прошлой продажи этого товара, остаток показывается
// живой: отсканировали ту же наклейку после продажи — увидели новый остаток.
import { el, go } from "../app.js?v=20260902c";
import { icon } from "../../icons.js?v=20260902c";
import { toast, confirmDialog, modal } from "../../ui.js?v=20260902c";
import { fmt } from "../../fx.js?v=20260902c";
import { LOW_STOCK } from "../../advice.js?v=20260902c";
import { issueInvoice } from "../issue.js?v=20260902c";
import { scanSku, canScan, resolveScan, scanFailText } from "../qr.js?v=20260902c";
import { invoiceHtml, openPrint } from "../print.js?v=20260902c";
import { qrSvg, skuPayload } from "../../qr.js?v=20260902c";
import { setStock } from "../stock.js?v=20260902c";
import { freshFirst, lastAnyMap, lastForCustomerMap, suggestPrice, priceNote, repriceItems } from "../../prices.js?v=20260902c";
import { photoBlock } from "../photo.js?v=20260902c";

// Сум первым — им торгуют каждый день, юань вторым, доллар последним.
const CURS = [{ value: "som", label: "сум" }, { value: "yuan", label: "¥" }, { value: "usd", label: "$" }];

export default async function render(box, ctx) {
  const [products, customers, sales] = await Promise.all([
    ctx.db.products.list(), ctx.db.customers.list(), ctx.db.sales.list(),
  ]);
  const pmap = Object.fromEntries(products.map(p => [p.id, p]));

  // Историю цен считаем ОДИН раз при входе. Раньше на каждый скан уходил
  // запрос за всей историей продаж: десять наклеек — десять выкачек.
  const sorted = freshFirst(sales);
  const anyMap = lastAnyMap(sorted);
  const ownCache = new Map();
  const ownMapFor = (id) => {
    if (!id) return null;
    if (!ownCache.has(id)) ownCache.set(id, lastForCustomerMap(sorted, id));
    return ownCache.get(id);
  };
  // Что подставить в цену товара при нынешнем выборе «кому продаём».
  const hintFor = (productId) =>
    suggestPrice(productId, { ownMap: quick ? null : ownMapFor(customerId), anyMap });

  let quick = ctx.params.mode !== "client";   // по умолчанию обычная продажа за прилавком
  let customerId = "";
  let signName = "";                          // имя-подпись, по желанию
  let currency = "som";   // валюта продажи: её выбирают сверху экрана
  const cart = [];

  // ---------- режим ----------
  const modeBox = el("div.mini-acts", { style: { marginBottom: "12px" } });
  const modeBtn = (on, label, sub, fn) => el("button.mini-act", {
    onclick: fn, style: on ? { borderColor: "var(--accent)" } : {},
  }, [
    icon(on ? "check" : "dot", { size: 18 }),
    el("div", {}, [el("div", { text: label }), el("div.sub", { text: sub })]),
  ]);
  // ---------- валюта продажи ----------
  // Продаём в трёх валютах, поэтому выбор вынесен наверх: он задаёт валюту
  // для добавляемых позиций. У каждой позиции её всё равно можно поменять.
  const curBox = el("div", { style: { marginBottom: "12px" } });
  function drawCur() {
    curBox.innerHTML = "";
    const row = el("div", { style: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" } });
    CURS.forEach(c => row.append(el("button.btn" + (currency === c.value ? ".btn-primary" : ".btn-outline"), {
      style: { justifyContent: "center", minHeight: "44px", fontSize: "15px" },
      text: c.label,
      onclick: () => { currency = c.value; drawCur(); },
    })));
    curBox.append(el("div.field-label", { text: "Валюта продажи", style: { marginBottom: "6px" } }), row);
  }

  function drawMode() {
    modeBox.innerHTML = "";
    modeBox.append(
      modeBtn(quick, "Обычная", "имя по желанию", () => { quick = true; drawMode(); drawWho(); repriceCart(); }),
      modeBtn(!quick, "Клиенту", "запишется в долг", () => { quick = false; drawMode(); drawWho(); repriceCart(); }),
    );
  }

  // ---------- кому ----------
  const whoBox = el("div", { style: { marginBottom: "12px" } });
  function drawWho() {
    whoBox.innerHTML = "";
    if (quick) {
      customerId = "";
      const nameInp = el("input.inp", {
        type: "text", placeholder: "Кому (по желанию)", value: signName,
        style: { width: "100%", minHeight: "44px", fontSize: "16px" },
      });
      nameInp.addEventListener("input", () => { signName = nameInp.value.trim(); });
      whoBox.append(nameInp, el("div.sku", { style: { padding: "5px 2px 0" }, text: "Имя только подписывается на накладной. В долг никому не запишется." }));
      return;
    }
    signName = "";
    const sel = el("select.inp", { style: { width: "100%", minHeight: "44px", fontSize: "16px" } });
    sel.append(el("option", { value: "", text: "— выберите клиента —" }));
    customers.slice().sort((a, b) => (a.name || "").localeCompare(b.name || "", "ru"))
      .forEach(c => sel.append(el("option", { value: c.id, text: c.name })));
    sel.value = customerId;
    sel.addEventListener("change", () => { customerId = sel.value; repriceCart(); });
    whoBox.append(sel);
  }

  // ---------- добавление позиции ----------
  const pick = el("input.inp", { type: "search", placeholder: "Товар: название или артикул…", style: { flex: "1", minHeight: "44px", fontSize: "16px" } });
  const scanBtn = el("button.mini-icon-btn", { title: "Сканировать наклейку" }, [icon("hash", { size: 18 })]);
  const found = el("div.mini-list", { style: { marginBottom: "12px" } });

  // Карточка после скана: что за товар, сколько осталось СЕЙЧАС, сколько и по чём продаём
  async function openCard(p, afterAdd) {
    let fresh = p;
    try { fresh = (await ctx.db.products.get(p.id)) || p; } catch { }   // остаток читаем заново
    const st = Number(fresh.stock_qty) || 0;
    // клиенту подставляем ЕГО цену — он привык покупать по ней;
    // обычной продаже — последнюю цену этого товара кому угодно
    const hint = hintFor(p.id);
    let price = hint ? hint.price : 0;
    let cur = hint ? hint.currency : currency;

    const qtyInp = el("input.inp", { type: "number", inputmode: "numeric", value: "1", style: { width: "100%", minHeight: "46px", fontSize: "17px", textAlign: "center" } });
    const priceInp = el("input.inp", { type: "number", inputmode: "decimal", step: "0.01", value: String(price || ""), placeholder: "цена", style: { width: "100%", minHeight: "46px", fontSize: "17px" } });
    const curSel = el("select.inp", { style: { width: "100%", minHeight: "46px", fontSize: "17px" } });
    CURS.forEach(c => curSel.append(el("option", { value: c.value, text: c.label })));
    curSel.value = cur;

    const cls = st < 0 ? ".neg" : st <= LOW_STOCK ? ".low" : "";
    modal({
      title: fresh.name,
      body: el("div", {}, [
        // снимок товара: на складе много похожих названий, и по фото сразу
        // видно, тот ли это товар
        photoBlock(fresh),
        el("div.sku", { style: { marginBottom: "10px" }, text: fresh.sku ? "Арт.: " + fresh.sku : "без артикула" }),
        el("div.mini-row" + cls, { style: { marginBottom: "12px" } }, [
          el("div.info", {}, [el("div.nm", { text: "Остаток сейчас" })]),
          el("div.qty" + cls, { text: String(st) }),
        ]),
        el("div", { style: { display: "grid", gridTemplateColumns: "1fr 1.4fr 0.9fr", gap: "8px" } }, [
          el("label.field", {}, [el("span.field-label", { text: "Кол-во" }), qtyInp]),
          el("label.field", {}, [el("span.field-label", { text: "Цена" }), priceInp]),
          el("label.field", {}, [el("span.field-label", { text: "Валюта" }), curSel]),
        ]),
        hint
          ? el("div.hint", { style: { marginTop: "8px" }, text: priceNote(hint) + (hint.own ? "" : " — не его цена") })
          : el("div.hint", { style: { marginTop: "8px" }, text: "Этот товар ещё не продавали — впишите цену." }),
        el("div", { style: { display: "flex", gap: "8px", marginTop: "12px" } }, [
          el("button.btn.btn-outline", { style: { flex: "1", justifyContent: "center", minHeight: "42px" },
            text: "Остаток на полке", onclick: () => askStock(fresh) }),
          el("button.btn.btn-outline", { style: { flex: "1", justifyContent: "center", minHeight: "42px" },
            text: "Показать QR", onclick: () => showQr(fresh) }),
        ]),
      ].filter(Boolean)),
      actions: [
        { label: "Отмена", kind: "btn-outline", onClick: c => c() },
        {
          label: "В накладную", kind: "btn-primary", onClick: (close) => {
            const q = Number(qtyInp.value) || 0;
            const pr = Number(priceInp.value) || 0;
            if (q <= 0) { toast("Укажите количество", "err"); return; }
            if (pr <= 0) { toast("Укажите цену", "err"); return; }
            // Цену правили руками — при смене клиента её не трогаем.
            // Иначе набранная вручную скидка молча пропала бы.
            const manual = !hint || pr !== hint.price || curSel.value !== hint.currency;
            const ex = cart.find(i => i.product_id === p.id && i.currency === curSel.value && i.unit_price === pr);
            if (ex) ex.qty += q;
            else cart.push({ product_id: p.id, qty: q, unit_price: pr, currency: curSel.value, manual, hint });
            close(); drawCart();
            toast(fresh.name + " × " + q, "ok");
            if (afterAdd) afterAdd();
          },
        },
      ],
    });
  }

  // Остаток «как на полке»: вписали число — стало ровно так. Выводит и из минуса.
  function askStock(p) {
    const inp = el("input.inp", { type: "number", inputmode: "numeric", value: String(Number(p.stock_qty) || 0),
      style: { width: "100%", minHeight: "48px", fontSize: "18px", textAlign: "center" } });
    modal({
      title: "Остаток — " + p.name,
      body: el("div", {}, [
        el("div.sku", { style: { marginBottom: "10px" }, text: "Сейчас в базе: " + (Number(p.stock_qty) || 0) }),
        el("label.field", {}, [el("span.field-label", { text: "Посчитали на полке" }), inp]),
        el("div.hint", { style: { marginTop: "8px" }, text: "Добавленные штуки зачислим по нынешней складской цене — прибыль не изменится." }),
      ]),
      actions: [
        { label: "Отмена", kind: "btn-outline", onClick: c => c() },
        { label: "Сохранить", kind: "btn-primary", onClick: async (close) => {
          const want = Number(inp.value);
          if (!isFinite(want)) { toast("Впишите число", "err"); return; }
          try {
            const r = await setStock(ctx.db, p.id, want);
            const local = pmap[p.id]; if (local) local.stock_qty = r.stock;
            close();
            toast("Остаток: " + r.stock, "ok");
          } catch (e) { toast("Не удалось: " + (e.message || e), "err"); }
        } },
      ],
    });
  }

  // Электронная наклейка: тот же gm:<id>, что и на бумажной
  function showQr(p) {
    const holder = el("div", { style: { textAlign: "center" } });
    holder.innerHTML = qrSvg(skuPayload(p.id), { size: 260 });
    modal({
      title: p.name,
      body: el("div", {}, [
        holder,
        el("div.sku", { style: { textAlign: "center", marginTop: "10px" }, text: p.sku ? "Арт.: " + p.sku : "без артикула" }),
        el("div.hint", { style: { marginTop: "6px" }, text: "Можно сканировать прямо с экрана — код тот же, что на наклейке." }),
      ]),
      actions: [{ label: "Закрыть", kind: "btn-primary", onClick: c => c() }],
    });
  }
  function search() {
    const q = pick.value.trim().toLowerCase();
    found.innerHTML = "";
    if (q.length < 2) return;
    products
      .filter(p => (p.name || "").toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q))
      .slice(0, 8)
      .forEach(p => {
        const st = Number(p.stock_qty) || 0;
        const cls = st < 0 ? ".neg" : st <= LOW_STOCK ? ".low" : "";
        found.append(el("div.mini-row" + cls, { onclick: () => { pick.value = ""; found.innerHTML = ""; openCard(p); } }, [
          el("div.info", {}, [
            el("div.nm", { text: p.name }),
            el("div.sku", { text: p.sku ? "Арт.: " + p.sku : "—" }),
          ]),
          el("div.qty" + cls, { text: String(st) }),
        ]));
      });
  }
  let t = 0;
  pick.addEventListener("input", () => { clearTimeout(t); t = setTimeout(search, 180); });

  // Сканируем подряд: после «В накладную» сканер открывается снова
  async function scanLoop() {
    const raw = await scanSku();
    if (!raw) return;
    const p = await resolveScan(raw, products, ctx.db);
    if (p) { pmap[p.id] = p; openCard(p, scanLoop); return; }
    // не нашли — показываем сам код и оставляем его в поиске,
    // чтобы можно было доискать товар руками
    pick.value = String(raw).trim();
    search();
    toast(scanFailText(raw), "err");
  }
  scanBtn.addEventListener("click", scanLoop);

  // ---------- список к продаже ----------
  const cartBox = el("div.mini-list");
  const totalBox = el("div", { style: { textAlign: "right", fontWeight: "800", fontSize: "17px", margin: "12px 0 4px" } });

  function totals() {
    const t2 = { som: 0, usd: 0, yuan: 0 };
    cart.forEach(i => {
      const c = i.currency || "som";
      if (t2[c] !== undefined) t2[c] += (Number(i.qty) || 0) * (Number(i.unit_price) || 0);
    });
    return t2;
  }
  function totalStr() {
    const t2 = totals();
    const parts = Object.entries(t2).filter(([, v]) => v > 0.001).map(([c, v]) => fmt(v, c));
    return parts.length ? parts.join(" + ") : "0";
  }

  const saveBtn = el("button.btn.btn-primary", { text: "Готово — накладная" });

  // Имя клиента вписывают ПОСЛЕ того, как отсканировали товары — так удобнее
  // за прилавком. Значит цены надо переставить на цены этого клиента задним
  // числом, иначе в накладную уйдут чужие. Цены, набранные руками, не трогаем.
  function repriceCart() {
    const changed = repriceItems(cart, hintFor);
    drawCart();
    if (changed) {
      const кому = quick ? "цены последней продажи" : "цены этого клиента";
      toast("Подставил " + кому + ": позиций " + changed, "ok");
    }
  }

  function drawCart() {
    cartBox.innerHTML = "";
    if (!cart.length) {
      cartBox.append(el("div.mini-empty", { text: canScan() ? "Отсканируйте наклейку или найдите товар" : "Найдите товар" }));
      totalBox.textContent = "";
      saveBtn.disabled = true;
      return;
    }
    saveBtn.disabled = false;
    cart.forEach((it, idx) => {
      const p = pmap[it.product_id] || { name: "?" };
      cartBox.append(el("div.mini-row", {}, [
        el("div.info", {}, [
          el("div.nm", { text: p.name }),
          el("div.sku", { text: `${it.qty} × ${fmt(it.unit_price, it.currency)}` }),
          el("div.sku", { style: { opacity: ".75" }, text: it.manual ? "цена вписана вручную" : priceNote(it.hint) }),
        ]),
        el("div.qty", { text: fmt(it.qty * it.unit_price, it.currency) }),
        el("button.mini-icon-btn", { title: "Убрать", onclick: (e) => { e.stopPropagation(); cart.splice(idx, 1); drawCart(); } }, [icon("trash", { size: 16 })]),
      ]));
    });
    totalBox.textContent = "Итого: " + totalStr();
  }

  // ---------- оформление ----------
  saveBtn.addEventListener("click", () => {
    if (!cart.length) { toast("Список пуст", "err"); return; }
    if (!quick && !customerId) { toast("Выберите клиента", "err"); return; }

    confirmDialog("Оформить накладную на " + totalStr() + "?", async () => {
      saveBtn.disabled = true; saveBtn.textContent = "Оформляем…";
      try {
        // Списание, себестоимость и оплата наличными — общим кодом
        // (js/sklad/issue.js), тем же, каким оформляется принятый заказ.
        const sale = await issueInvoice(ctx.db, {
          quick, customerId, currency, signName,
          items: cart.map(i => ({ product_id: i.product_id, qty: i.qty, unit_price: i.unit_price, currency: i.currency })),
        });
        const saleId = sale.id;

        // PDF уходит владельцу в бот — оттуда перешлёте покупателю
        let pdfOk = false;
        try {
          const r = await fetch("/api/admin/invoice-pdf", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + (localStorage.getItem("sklad_admin_token") || "") },
            body: JSON.stringify({ id: saleId }),
          });
          pdfOk = r.ok;
        } catch { }

        const who = quick ? signName : ((customers.find(c => c.id === customerId) || {}).name || "");
        const printItems = cart.map(i => ({ name: (pmap[i.product_id] || {}).name || "—", qty: i.qty, price: i.unit_price, currency: i.currency }));
        const printTotals = totals();
        toast(pdfOk ? "Накладная готова, PDF ушёл в бот" : "Накладная готова", "ok");

        modal({
          title: "Накладная оформлена",
          body: el("div", {}, [
            el("div.hint", { text: pdfOk ? "PDF уже в вашем боте — оттуда перешлёте покупателю." : "PDF в бот не ушёл, но накладная сохранена. Её можно напечатать." }),
            el("div", { style: { fontWeight: "700", marginTop: "8px" }, text: "Итого: " + totalStr() }),
          ]),
          actions: [
            { label: "Печать", kind: "btn-outline", onClick: (close) => { openPrint(invoiceHtml({ who, date: sale.date, items: printItems, totals: printTotals })); close(); } },
            { label: "Готово", kind: "btn-primary", onClick: (close) => { close(); go("home"); } },
          ],
        });
        cart.length = 0; signName = ""; drawCart(); drawWho();
      } catch (e) {
        toast("Не удалось: " + (e.message || e), "err");
      } finally {
        saveBtn.textContent = "Готово — накладная";
        saveBtn.disabled = cart.length === 0;
      }
    });
  });

  drawMode(); drawCur(); drawWho(); drawCart();
  box.append(
    modeBox, curBox, whoBox,
    el("div.mini-search", {}, canScan() ? [pick, scanBtn] : [pick]),
    found,
    cartBox, totalBox,
    el("div", { style: { height: "8px" } }),
    el("div.mini-cta", {}, [saveBtn]),
  );
}
