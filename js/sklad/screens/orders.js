// Заказы из бота и с сайта. Ради них чаще всего и лезут вечером в компьютер:
// клиент прислал список, надо проставить цены и выдать накладную.
// С телефона делаем главное — открыть, поправить цены и оформить.
// Отправку клиенту оставили сайту: с телефона накладные никуда не уходят.
import { el } from "../app.js?v=20260831b";
import { icon } from "../../icons.js?v=20260831b";
import { toast, confirmDialog, modal } from "../../ui.js?v=20260831b";
import { fmt } from "../../fx.js?v=20260831b";
import { issueInvoice, totalsByCur } from "../issue.js?v=20260831b";
import { freshFirst, lastAnyMap, lastForCustomerMap, suggestPrice, priceNote } from "../../prices.js?v=20260831b";

const ЖДУТ = ["order", "pending_confirm", "confirmed"];
// Сум первым — им торгуют каждый день, юань вторым, доллар последним.
const CURS = [{ value: "som", label: "сум" }, { value: "yuan", label: "¥" }, { value: "usd", label: "$" }];
const когда = (d) => { const t = new Date(d); return isFinite(t) ? t.toLocaleString("ru-RU") : "—"; };

export default async function render(box, ctx) {
  const [sales, customers, products] = await Promise.all([
    ctx.db.sales.list(), ctx.db.customers.list(), ctx.db.products.list(),
  ]);
  const pmap = Object.fromEntries(products.map(p => [p.id, p]));
  const cmap = Object.fromEntries(customers.map(c => [c.id, c]));

  const заказы = sales.filter(s => ЖДУТ.includes(s.status)).sort((a, b) => new Date(b.date) - new Date(a.date));

  // история цен — считается так же, как в продаже
  const sorted = freshFirst(sales);
  const anyMap = lastAnyMap(sorted);
  const ownCache = new Map();
  const ownMapFor = (id) => {
    if (!id) return null;
    if (!ownCache.has(id)) ownCache.set(id, lastForCustomerMap(sorted, id));
    return ownCache.get(id);
  };

  const list = el("div.mini-list");
  box.append(list);

  const откуда = (s) => (s.source === "site" ? "с сайта" : "из бота");
  const кто = (s) => (s.customer_id && cmap[s.customer_id] ? cmap[s.customer_id].name : ((s.order_from && s.order_from.name) || "Гость"));

  function draw() {
    list.innerHTML = "";
    if (!заказы.length) { list.append(el("div.mini-empty", { text: "Новых заказов нет" })); return; }
    заказы.forEach(s => {
      const подтверждён = s.status === "confirmed";
      const метка = подтверждён ? "клиент подтвердил" : s.status === "pending_confirm" ? "ждём подтверждения" : "новый";
      list.append(el("div.mini-row" + (подтверждён ? "" : ".low"), { onclick: () => открыть(s) }, [
        el("div.info", {}, [
          el("div.nm", { text: кто(s) }),
          el("div.sku", { text: когда(s.date) + " · " + откуда(s) + " · " + (s.items || []).length + " поз." }),
          el("div.sku", { style: { opacity: ".8" }, text: метка }),
        ]),
        el("div.qty", {}, [icon("cart", { size: 18 })]),
      ]));
    });
  }

  function открыть(s) {
    // Работаем с копией: пока не оформили, заказ в базе не трогаем.
    // manual = цена уже стояла в заказе, её пересчёт по клиенту не затирает.
    const позиции = (s.items || []).map(it => ({
      product_id: it.product_id,
      qty: Number(it.qty) || 0,
      unit_price: Number(it.unit_price) || 0,
      currency: it.currency || s.currency || "som",
      manual: Number(it.unit_price) > 0,
      hint: null,
    }));
    let клиент = s.customer_id || "";

    function подставитьЦены(ownMap) {
      позиции.forEach(it => {
        if (it.manual) return;
        const hint = suggestPrice(it.product_id, { ownMap, anyMap });
        if (hint) { it.unit_price = hint.price; it.currency = hint.currency; it.hint = hint; }
      });
    }
    подставитьЦены(ownMapFor(клиент));

    const строки = el("div.mini-list");
    const итог = el("div", { style: { textAlign: "right", fontWeight: "800", fontSize: "16px", margin: "12px 0 4px" } });

    function итогТекст() {
      const parts = Object.entries(totalsByCur(позиции)).filter(([, v]) => v > 0.001).map(([c, v]) => fmt(v, c));
      return parts.length ? parts.join(" + ") : "0";
    }

    function drawItems() {
      строки.innerHTML = "";
      if (!позиции.length) строки.append(el("div.mini-empty", { text: "В заказе ничего не осталось" }));
      позиции.forEach((it, idx) => {
        const p = pmap[it.product_id];
        const остаток = p ? (Number(p.stock_qty) || 0) : 0;
        const нехватка = p && остаток < it.qty;
        const подпись = нехватка ? "на складе только " + остаток
          : it.unit_price > 0 ? (it.manual ? "цена из заказа" : priceNote(it.hint))
            : "цена не проставлена";
        строки.append(el("div.mini-row" + (нехватка ? ".neg" : ""), { onclick: () => правка(it, idx) }, [
          el("div.info", {}, [
            el("div.nm", { text: p ? p.name : "товар удалён" }),
            el("div.sku", { text: it.qty + " × " + fmt(it.unit_price, it.currency) }),
            el("div.sku", { style: { opacity: ".75" }, text: подпись }),
          ]),
          el("div.qty" + (нехватка ? ".neg" : ""), { text: fmt(it.qty * it.unit_price, it.currency) }),
        ]));
      });
      итог.textContent = "Итого: " + итогТекст();
    }

    function правка(it, idx) {
      const fQty = el("input.inp", { type: "number", inputmode: "numeric", value: String(it.qty),
        style: { width: "100%", minHeight: "46px", fontSize: "17px", textAlign: "center" } });
      const fPrice = el("input.inp", { type: "number", inputmode: "decimal", step: "0.01", value: String(it.unit_price || ""),
        style: { width: "100%", minHeight: "46px", fontSize: "17px" } });
      const fCur = el("select.inp", { style: { width: "100%", minHeight: "46px", fontSize: "17px" } });
      CURS.forEach(c => fCur.append(el("option", { value: c.value, text: c.label })));
      fCur.value = it.currency;

      modal({
        title: (pmap[it.product_id] || {}).name || "Позиция",
        body: el("div", { style: { display: "grid", gridTemplateColumns: "1fr 1.4fr 0.9fr", gap: "8px" } }, [
          el("label.field", {}, [el("span.field-label", { text: "Кол-во" }), fQty]),
          el("label.field", {}, [el("span.field-label", { text: "Цена" }), fPrice]),
          el("label.field", {}, [el("span.field-label", { text: "Валюта" }), fCur]),
        ]),
        actions: [
          { label: "Убрать", kind: "btn-outline", onClick: (close) => { позиции.splice(idx, 1); close(); drawItems(); } },
          { label: "Сохранить", kind: "btn-primary", onClick: (close) => {
            const q = Number(fQty.value) || 0, pr = Number(fPrice.value) || 0;
            if (q <= 0) { toast("Укажите количество", "err"); return; }
            it.qty = q; it.unit_price = pr; it.currency = fCur.value;
            it.manual = true; it.hint = null;
            close(); drawItems();
          } },
        ],
      });
    }

    // Заказ может прийти от гостя — тогда его надо привязать к клиенту,
    // иначе долг не на кого записать.
    const sel = el("select.inp", { style: { width: "100%", minHeight: "44px", fontSize: "16px" } });
    sel.append(el("option", { value: "", text: "— выберите клиента —" }));
    customers.slice().sort((a, b) => (a.name || "").localeCompare(b.name || "", "ru"))
      .forEach(c => sel.append(el("option", { value: c.id, text: c.name })));
    sel.value = клиент;
    sel.addEventListener("change", () => {
      клиент = sel.value;
      подставитьЦены(ownMapFor(клиент));
      drawItems();
      toast(клиент ? "Подставил цены этого клиента" : "Цены общие", "ok");
    });

    drawItems();

    modal({
      title: "Заказ · " + кто(s),
      body: el("div", {}, [
        el("div.sku", { style: { marginBottom: "10px" }, text: когда(s.date) + " · " + откуда(s) }),
        (s.order_from && s.order_from.phone) ? el("div.sku", { style: { marginBottom: "8px" }, text: "тел: " + s.order_from.phone }) : null,
        el("label.field", { style: { marginBottom: "10px" } }, [el("span.field-label", { text: "Кому выдаём" }), sel]),
        строки,
        итог,
        el("div.hint", { text: "Оформление спишет товар со склада и запишет накладную. Клиенту она отсюда не уходит — отправите с сайта." }),
      ].filter(Boolean)),
      actions: [
        { label: "Закрыть", kind: "btn-outline", onClick: c => c() },
        { label: "Удалить заказ", kind: "btn-outline", onClick: (close) => {
          confirmDialog("Удалить заказ? Склад не тронется — по заказу он ещё не списан.", async () => {
            try {
              await ctx.db.sales.remove(s.id);
              заказы.splice(заказы.indexOf(s), 1);
              close(); draw();
              toast("Заказ удалён — лежит в Корзине", "ok");
            } catch (e) { toast("Не удалось: " + (e.message || e), "err"); }
          });
        } },
        { label: "Оформить", kind: "btn-primary", onClick: (close) => {
          if (!позиции.length) { toast("В заказе ничего нет", "err"); return; }
          if (!клиент) { toast("Выберите клиента", "err"); return; }
          const без = позиции.filter(i => !(i.unit_price > 0));
          if (без.length) { toast("Не проставлена цена: позиций " + без.length, "err"); return; }
          confirmDialog("Оформить накладную на " + итогТекст() + "?", async () => {
            try {
              await issueInvoice(ctx.db, {
                id: s.id, customerId: клиент, currency: позиции[0].currency,
                source: s.source || "bot", orderFrom: s.order_from || null,
                items: позиции.map(i => ({ product_id: i.product_id, qty: i.qty, unit_price: i.unit_price, currency: i.currency })),
              });
              заказы.splice(заказы.indexOf(s), 1);
              close(); draw();
              toast("Накладная оформлена, склад списан", "ok");
            } catch (e) { toast("Не удалось: " + (e.message || e), "err"); }
          });
        } },
      ],
    });
  }

  draw();
}
