// Продажа: клиенту (пишется накладная) или быстрая (без клиента).
// Цена товара подставляется из прошлой продажи — её же можно поменять.
import { el, go } from "../app.js?v=20260819b";
import { icon } from "../../icons.js?v=20260819b";
import { toast, confirmDialog } from "../../ui.js?v=20260819b";
import { fmt } from "../../fx.js?v=20260819b";
import { LOW_STOCK } from "../../advice.js?v=20260819b";
import { sellItems } from "../stock.js?v=20260819b";
import { scanSku, canScan } from "../qr.js?v=20260819b";

const CURS = [{ value: "som", label: "сум" }, { value: "usd", label: "$" }, { value: "yuan", label: "¥" }];
const uid = () => "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export default async function render(box, ctx) {
  const [products, customers] = await Promise.all([ctx.db.products.list(), ctx.db.customers.list()]);
  const pmap = Object.fromEntries(products.map(p => [p.id, p]));

  let quick = ctx.params.mode === "quick";   // быстрая продажа — без клиента
  let customerId = "";
  const currency = "som";
  const cart = [];                            // { product_id, qty, unit_price, currency }

  // ---------- переключатель режима ----------
  const modeBox = el("div.mini-acts", { style: { marginBottom: "12px" } });
  const modeBtn = (on, label, sub, fn) => el("button.mini-act", {
    onclick: fn, style: on ? { borderColor: "var(--accent)" } : {},
  }, [
    icon(on ? "check" : "dot", { size: 18 }),
    el("div", {}, [el("div", { text: label }), el("div.sub", { text: sub })]),
  ]);
  function drawMode() {
    modeBox.innerHTML = "";
    modeBox.append(
      modeBtn(!quick, "Клиенту", "будет накладная", () => { quick = false; drawMode(); drawWho(); }),
      modeBtn(quick, "Быстро", "без клиента", () => { quick = true; drawMode(); drawWho(); }),
    );
  }

  // ---------- кому ----------
  const whoBox = el("div", { style: { marginBottom: "12px" } });
  function drawWho() {
    whoBox.innerHTML = "";
    if (quick) {
      customerId = "";
      whoBox.append(el("div.sku", { style: { padding: "2px" }, text: "Продажа без клиента — никому в долг не запишется." }));
      return;
    }
    const sel = el("select.inp", { style: { width: "100%", minHeight: "44px", fontSize: "16px" } });
    sel.append(el("option", { value: "", text: "— выберите клиента —" }));
    customers.slice().sort((a, b) => (a.name || "").localeCompare(b.name || "", "ru"))
      .forEach(c => sel.append(el("option", { value: c.id, text: c.name })));
    sel.value = customerId;
    sel.addEventListener("change", () => { customerId = sel.value; });
    whoBox.append(sel);
  }

  // ---------- поиск и добавление позиции ----------
  const pick = el("input.inp", { type: "search", placeholder: "Товар: название или артикул…", style: { flex: "1", minHeight: "44px", fontSize: "16px" } });
  const scanBtn = el("button.mini-icon-btn", { title: "Сканировать наклейку" }, [icon("hash", { size: 18 })]);
  const found = el("div.mini-list", { style: { marginBottom: "12px" } });

  async function addProduct(p) {
    if (cart.some(i => i.product_id === p.id)) { toast("Этот товар уже в списке", "err"); return; }
    let price = 0, cur = currency;
    try {
      const last = await ctx.db.lastPriceAny(p.id);      // цена прошлой продажи
      if (last) { price = last.price; cur = last.currency; }
    } catch { }
    cart.push({ product_id: p.id, qty: 1, unit_price: price, currency: cur });
    pick.value = ""; found.innerHTML = "";
    drawCart();
    if (!price) toast("Этот товар ещё не продавали — впишите цену", "err");
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
        found.append(el("div.mini-row" + cls, { onclick: () => addProduct(p) }, [
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
  scanBtn.addEventListener("click", async () => {
    const sku = await scanSku();
    if (!sku) return;
    const p = products.find(x => String(x.sku || "").toLowerCase() === sku.toLowerCase());
    if (p) { addProduct(p); return; }
    pick.value = sku; search();
    toast("Товар с таким артикулом не найден", "err");
  });

  // ---------- список к продаже ----------
  const cartBox = el("div.mini-list");
  const totalBox = el("div", { style: { textAlign: "right", fontWeight: "800", fontSize: "17px", margin: "12px 0 4px" } });

  function totalStr() {
    const t2 = { som: 0, usd: 0, yuan: 0 };
    cart.forEach(i => {
      const c = i.currency || "som";
      if (t2[c] !== undefined) t2[c] += (Number(i.qty) || 0) * (Number(i.unit_price) || 0);
    });
    const parts = Object.entries(t2).filter(([, v]) => v > 0.001).map(([c, v]) => fmt(v, c));
    return parts.length ? parts.join(" + ") : "0";
  }
  const refreshTotal = () => { totalBox.textContent = "Итого: " + totalStr(); };

  function drawCart() {
    cartBox.innerHTML = "";
    if (!cart.length) { cartBox.append(el("div.mini-empty", { text: "Добавьте товары" })); totalBox.textContent = ""; return; }
    cart.forEach((it, idx) => {
      const p = pmap[it.product_id] || { name: "?" };
      const qty = el("input.inp", { type: "number", inputmode: "numeric", value: String(it.qty), style: { width: "68px", minHeight: "42px", textAlign: "center", fontSize: "16px" } });
      const price = el("input.inp", { type: "number", inputmode: "decimal", step: "0.01", value: String(it.unit_price || ""), placeholder: "цена", style: { width: "104px", minHeight: "42px", fontSize: "16px" } });
      const cur = el("select.inp", { style: { width: "76px", minHeight: "42px", fontSize: "16px" } });
      CURS.forEach(c => cur.append(el("option", { value: c.value, text: c.label })));
      cur.value = it.currency || "som";
      qty.addEventListener("input", () => { it.qty = Math.max(0, Number(qty.value) || 0); refreshTotal(); });
      price.addEventListener("input", () => { it.unit_price = Number(price.value) || 0; refreshTotal(); });
      cur.addEventListener("change", () => { it.currency = cur.value; refreshTotal(); });

      cartBox.append(el("div.mini-row", { style: { flexWrap: "wrap" } }, [
        el("div.info", { style: { flexBasis: "100%" } }, [
          el("div.nm", { text: p.name }),
          el("div.sku", { text: p.sku ? "Арт.: " + p.sku : "" }),
        ]),
        qty, price, cur,
        el("button.mini-icon-btn", { title: "Убрать", onclick: () => { cart.splice(idx, 1); drawCart(); } }, [icon("trash", { size: 16 })]),
      ]));
    });
    refreshTotal();
  }

  // ---------- сохранение ----------
  const saveBtn = el("button.btn.btn-primary", { text: "Провести продажу" });
  saveBtn.addEventListener("click", () => {
    if (!cart.length) { toast("Список пуст", "err"); return; }
    if (cart.some(i => (Number(i.qty) || 0) <= 0)) { toast("У каждой позиции нужно количество", "err"); return; }
    if (!quick && !customerId) { toast("Выберите клиента", "err"); return; }
    const noPrice = cart.filter(i => (Number(i.unit_price) || 0) <= 0).length;
    if (noPrice) { toast("Не проставлена цена: " + noPrice + " поз.", "err"); return; }

    confirmDialog("Провести продажу на " + totalStr() + "?", async () => {
      saveBtn.disabled = true; saveBtn.textContent = "Проводим…";
      try {
        // 1) списываем со склада по FIFO, пакетом
        await sellItems(ctx.db, cart.map(i => ({ product_id: i.product_id, qty: i.qty })));
        // 2) пишем продажу в ту же таблицу, что читает склад на сайте
        await ctx.db.sales.upsert({
          id: uid(),
          customer_id: quick ? null : customerId,
          currency,
          date: new Date().toISOString(),
          status: "final",
          source: quick ? "quick" : "mini",
          items: cart.map(i => ({ product_id: i.product_id, qty: i.qty, unit_price: i.unit_price, currency: i.currency, paid: !!quick })),
        });
        toast("Продажа проведена", "ok");
        cart.length = 0; drawCart();
        go("home");
      } catch (e) {
        toast("Не удалось: " + (e.message || e), "err");
        saveBtn.disabled = false; saveBtn.textContent = "Провести продажу";
      }
    });
  });

  drawMode(); drawWho(); drawCart();
  box.append(
    modeBox, whoBox,
    el("div.mini-search", {}, canScan() ? [pick, scanBtn] : [pick]),
    found,
    cartBox, totalBox,
    el("div", { style: { height: "8px" } }),
    el("div.mini-cta", {}, [saveBtn]),
  );
}
