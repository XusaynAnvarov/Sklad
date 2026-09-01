// Приход из магазина. Только магазины — приход от поставщиков остаётся
// в складе на сайте. Товар зачисляется СРАЗУ и по НАШЕЙ складской цене:
// цена магазина нас не касается, иначе себестоимость и прибыль поехали бы.
// Долг магазину не ведём — так решил владелец.
import { el, go } from "../app.js?v=20260901b";
import { icon } from "../../icons.js?v=20260901b";
import { toast, confirmDialog, modal } from "../../ui.js?v=20260901b";
import { fmt } from "../../fx.js?v=20260901b";
import { ensureBatches, currentCost } from "../../inventory.js?v=20260901b";
import { receiveFromShop } from "../stock.js?v=20260901b";
import { scanSku, canScan, resolveScan, scanFailText } from "../qr.js?v=20260901b";
import { photoBlock } from "../photo.js?v=20260901b";
import { KIND_SHOP } from "../../purchase.js?v=20260901b";

const uid = () => "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export default async function render(box, ctx) {
  const [products, purchases] = await Promise.all([
    ctx.db.products.list(), ctx.db.purchases.list().catch(() => []),
  ]);
  const pmap = Object.fromEntries(products.map(p => [p.id, p]));
  const shops = [...new Set(purchases.filter(p => p.kind === KIND_SHOP).map(p => p.supplier).filter(Boolean))];

  let shop = shops[0] || "";
  const cart = [];   // { product_id, qty }

  // ---------- магазин ----------
  const shopInp = el("input.inp", {
    type: "text", placeholder: "Магазин (например: Сирож Акам)", value: shop,
    list: "gm-shops", style: { width: "100%", minHeight: "44px", fontSize: "16px" },
  });
  const datalist = el("datalist", { id: "gm-shops" });
  shops.forEach(s => datalist.append(el("option", { value: s })));
  shopInp.addEventListener("input", () => { shop = shopInp.value.trim(); });
  box.append(el("div", { style: { marginBottom: "12px" } }, [shopInp, datalist]));

  // ---------- добавление ----------
  const pick = el("input.inp", { type: "search", placeholder: "Товар: название или артикул…", style: { flex: "1", minHeight: "44px", fontSize: "16px" } });
  const scanBtn = el("button.mini-icon-btn", { title: "Сканировать наклейку" }, [icon("hash", { size: 18 })]);
  const found = el("div.mini-list", { style: { marginBottom: "12px" } });
  box.append(el("div.mini-search", {}, canScan() ? [pick, scanBtn] : [pick]), found);

  function openCard(p, afterAdd) {
    const own = currentCost(ensureBatches(p));
    const qtyInp = el("input.inp", { type: "number", inputmode: "numeric", value: "1", style: { width: "100%", minHeight: "48px", fontSize: "18px", textAlign: "center" } });
    modal({
      title: p.name,
      body: el("div", {}, [
        photoBlock(p),
        el("div.sku", { style: { marginBottom: "10px" }, text: p.sku ? "Арт.: " + p.sku : "без артикула" }),
        el("div.mini-row", { style: { marginBottom: "12px" } }, [
          el("div.info", {}, [el("div.nm", { text: "Сейчас на складе" })]),
          el("div.qty", { text: String(Number(p.stock_qty) || 0) }),
        ]),
        el("label.field", {}, [el("span.field-label", { text: "Сколько привезли" }), qtyInp]),
        el("div.hint", { style: { marginTop: "8px" }, text: "Зачислим по нашей цене " + fmt(own.cost_yuan, "yuan") + " — себестоимость не изменится." }),
      ]),
      actions: [
        { label: "Отмена", kind: "btn-outline", onClick: c => c() },
        {
          label: "Принять", kind: "btn-primary", onClick: (close) => {
            const q = Number(qtyInp.value) || 0;
            if (q <= 0) { toast("Укажите количество", "err"); return; }
            const ex = cart.find(i => i.product_id === p.id);
            if (ex) ex.qty += q; else cart.push({ product_id: p.id, qty: q });
            close(); drawCart();
            toast(p.name + " × " + q, "ok");
            if (afterAdd) afterAdd();
          },
        },
      ],
    });
  }

  function search() {
    const q = pick.value.trim().toLowerCase();
    found.innerHTML = "";
    if (q.length < 2) return;
    products
      .filter(p => (p.name || "").toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q))
      .slice(0, 8)
      .forEach(p => found.append(el("div.mini-row", { onclick: () => { pick.value = ""; found.innerHTML = ""; openCard(p); } }, [
        el("div.info", {}, [
          el("div.nm", { text: p.name }),
          el("div.sku", { text: p.sku ? "Арт.: " + p.sku : "—" }),
        ]),
        el("div.qty", { text: String(Number(p.stock_qty) || 0) }),
      ])));
  }
  let t = 0;
  pick.addEventListener("input", () => { clearTimeout(t); t = setTimeout(search, 180); });

  async function scanLoop() {
    const raw = await scanSku();
    if (!raw) return;
    const p = await resolveScan(raw, products, ctx.db);
    if (p) pmap[p.id] = p;
    if (!p) {
      pick.value = String(raw).trim();
      search();
      toast(scanFailText(raw), "err");
      return;
    }
    openCard(p, scanLoop);
  }
  scanBtn.addEventListener("click", scanLoop);

  // ---------- список принятого ----------
  const cartBox = el("div.mini-list");
  const totalBox = el("div", { style: { textAlign: "right", fontWeight: "800", fontSize: "16px", margin: "12px 0 4px" } });
  const saveBtn = el("button.btn.btn-primary", { text: "Принять на склад" });
  box.append(cartBox, totalBox, el("div", { style: { height: "8px" } }), el("div.mini-cta", {}, [saveBtn]));

  function drawCart() {
    cartBox.innerHTML = "";
    if (!cart.length) {
      cartBox.append(el("div.mini-empty", { text: canScan() ? "Отсканируйте наклейку или найдите товар" : "Найдите товар" }));
      totalBox.textContent = ""; saveBtn.disabled = true; return;
    }
    saveBtn.disabled = false;
    cart.forEach((it, idx) => {
      const p = pmap[it.product_id] || { name: "?" };
      cartBox.append(el("div.mini-row", {}, [
        el("div.info", {}, [
          el("div.nm", { text: p.name }),
          el("div.sku", { text: (Number(p.stock_qty) || 0) + " → " + ((Number(p.stock_qty) || 0) + it.qty) }),
        ]),
        el("div.qty", { text: "+" + it.qty }),
        el("button.mini-icon-btn", { title: "Убрать", onclick: (e) => { e.stopPropagation(); cart.splice(idx, 1); drawCart(); } }, [icon("trash", { size: 16 })]),
      ]));
    });
    totalBox.textContent = "Позиций: " + cart.length + " · штук: " + cart.reduce((s, i) => s + i.qty, 0);
  }

  // ---------- принять ----------
  saveBtn.addEventListener("click", () => {
    if (!cart.length) { toast("Список пуст", "err"); return; }
    if (!shop) { toast("Впишите магазин", "err"); return; }
    confirmDialog(`Принять ${cart.reduce((s, i) => s + i.qty, 0)} шт от «${shop}»?`, async () => {
      saveBtn.disabled = true; saveBtn.textContent = "Принимаем…";
      try {
        await receiveFromShop(ctx.db, cart);
        // запись прихода — в отчёте склада «Приход из магазинов» появится сама
        const items = cart.map(i => {
          const own = currentCost(ensureBatches(pmap[i.product_id] || {}));
          return { product_id: i.product_id, qty: i.qty, unit_cost: own.cost_yuan, currency: "yuan" };
        });
        const row = { id: uid(), supplier: shop, currency: "yuan", status: "arrived", date: new Date().toISOString(), items };
        try { await ctx.db.purchases.upsert({ ...row, kind: KIND_SHOP }); }
        catch { await ctx.db.purchases.upsert(row); }
        toast("Принято на склад", "ok");
        cart.length = 0; drawCart();
        go("home");
      } catch (e) {
        toast("Не удалось: " + (e.message || e), "err");
      } finally {
        saveBtn.textContent = "Принять на склад";
        saveBtn.disabled = cart.length === 0;
      }
    });
  });

  drawCart();
}
