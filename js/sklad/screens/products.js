// Товары: поиск по названию и артикулу, сканер наклейки, правка карточки
// и добавление нового товара прямо с телефона.
// Показываем то, за чем сюда заходят: остаток и себестоимость.
import { el, go } from "../app.js?v=20260819g";
import { icon } from "../../icons.js?v=20260819g";
import { toast, modal, confirmDialog } from "../../ui.js?v=20260819g";
import { ensureBatches, currentCost, costOutlook } from "../../inventory.js?v=20260819g";
import { fmt, convert } from "../../fx.js?v=20260819g";
import { thumb } from "../../img.js?v=20260819g";
import { LOW_STOCK } from "../../advice.js?v=20260819g";
import { scanSku } from "../qr.js?v=20260819g";
import { parsePayload, qrSvg, skuPayload } from "../../qr.js?v=20260819g";
import { setStock } from "../stock.js?v=20260819g";

const PAGE = 40;   // рисуем порциями: 866 карточек разом вешают телефон
const uid = () => "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const field = (label, input) => el("label.field", {}, [el("span.field-label", { text: label }), input]);
const inp = (props) => el("input.inp", { style: { width: "100%", minHeight: "46px", fontSize: "16px" }, ...props });

export default async function render(box, ctx) {
  const products = await ctx.db.products.list();
  let filter = ctx.params.f || "";        // low | neg | пусто
  let query = (ctx.params.q || "").toLowerCase();

  const search = el("input.inp", { type: "search", placeholder: "Название или артикул…", value: ctx.params.q || "", style: { flex: "1", minHeight: "44px", fontSize: "16px" } });
  const scanBtn = el("button.mini-icon-btn", { title: "Сканировать наклейку" }, [icon("hash", { size: 18 })]);
  const addBtn = el("button.mini-icon-btn", { title: "Новый товар" }, [icon("plus", { size: 18 })]);
  box.append(el("div.mini-search", {}, [search, scanBtn, addBtn]));

  const list = el("div.mini-list");
  const more = el("div");
  box.append(list, more);

  let shown = 0, filtered = [];

  // ---------- правка карточки ----------
  function openEdit(p) {
    const isNew = !p;
    const item = p || { id: uid(), name: "", sku: "", category: "", stock_qty: 0, cost_yuan: 0, cost_usd: 0, price_som: 0 };
    const own = isNew ? { cost_yuan: 0 } : currentCost(ensureBatches(item));

    const fName = inp({ type: "text", value: item.name || "", placeholder: "Название" });
    const fSku = inp({ type: "text", value: item.sku || "", placeholder: "Артикул" });
    const fCat = inp({ type: "text", value: item.category || "", placeholder: "Категория" });
    const fCost = inp({ type: "number", inputmode: "decimal", step: "0.01", value: String(own.cost_yuan || item.cost_yuan || ""), placeholder: "0" });
    const fPrice = inp({ type: "number", inputmode: "numeric", value: String(item.price_som || ""), placeholder: "0" });
    const fQty = isNew ? inp({ type: "number", inputmode: "numeric", value: "0" }) : null;

    const actions = [
      { label: "Отмена", kind: "btn-outline", onClick: c => c() },
      {
        label: isNew ? "Добавить" : "Сохранить", kind: "btn-primary", onClick: async (close) => {
          const name = fName.value.trim();
          if (!name) { toast("Впишите название", "err"); return; }
          const cy = Number(fCost.value) || 0;
          const row = {
            id: item.id, name, sku: fSku.value.trim(), category: fCat.value.trim(),
            cost_yuan: cy,
            cost_usd: cy ? Math.round(convert(cy, "yuan", "usd") * 100) / 100 : 0,
            price_som: Number(fPrice.value) || 0,
          };
          try {
            if (isNew) {
              const qty = Number(fQty.value) || 0;
              row.stock_qty = qty;
              row.batches = qty > 0 ? [{ qty, cost_yuan: cy, cost_usd: row.cost_usd, date: new Date().toISOString() }] : [];
              try { await ctx.db.products.upsert(row); }
              catch { await ctx.db.products.upsert((({ batches, ...x }) => x)(row)); }
              products.unshift(row);
            } else {
              // остаток и партии не трогаем — для них есть «Остаток на полке»
              await ctx.db.products.upsert(row);
              Object.assign(item, row);
            }
            close(); draw();
            toast(isNew ? "Товар добавлен" : "Сохранено", "ok");
          } catch (e) { toast("Не удалось: " + (e.message || e), "err"); }
        },
      },
    ];
    if (!isNew) {
      actions.unshift({
        label: "Удалить", kind: "btn-danger", onClick: (close) => {
          confirmDialog(`Удалить товар «${item.name}»? Он пропадёт из каталога и склада.`, async () => {
            try {
              await ctx.db.products.remove(item.id);
              const i = products.findIndex(x => x.id === item.id);
              if (i >= 0) products.splice(i, 1);
              close(); draw();
              toast("Удалено", "ok");
            } catch (e) { toast("Не удалось: " + (e.message || e), "err"); }
          });
        },
      });
    }

    modal({
      title: isNew ? "Новый товар" : item.name,
      wide: true,
      body: el("div", { style: { display: "grid", gap: "10px" } }, [
        field("Название", fName),
        el("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" } }, [
          field("Артикул", fSku), field("Категория", fCat),
        ]),
        el("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" } }, [
          field("Себестоимость ¥", fCost), field("Цена продажи, сум", fPrice),
        ]),
        isNew ? field("Остаток сейчас", fQty) : null,
        !isNew ? el("div", { style: { display: "flex", gap: "8px", marginTop: "4px" } }, [
          el("button.btn.btn-outline", { style: { flex: "1", justifyContent: "center", minHeight: "42px" }, text: "Остаток на полке", onclick: () => askStock(item) }),
          el("button.btn.btn-outline", { style: { flex: "1", justifyContent: "center", minHeight: "42px" }, text: "Показать QR", onclick: () => showQr(item) }),
        ]) : null,
      ].filter(Boolean)),
      actions,
    });
  }

  // ---------- остаток «как на полке» ----------
  function askStock(p) {
    const f = inp({ type: "number", inputmode: "numeric", value: String(Number(p.stock_qty) || 0), style: { width: "100%", minHeight: "48px", fontSize: "18px", textAlign: "center" } });
    modal({
      title: "Остаток — " + p.name,
      body: el("div", {}, [
        el("div.sku", { style: { marginBottom: "10px" }, text: "Сейчас в базе: " + (Number(p.stock_qty) || 0) }),
        field("Посчитали на полке", f),
        el("div.hint", { style: { marginTop: "8px" }, text: "Добавленные штуки зачислим по нынешней складской цене." }),
      ]),
      actions: [
        { label: "Отмена", kind: "btn-outline", onClick: c => c() },
        {
          label: "Сохранить", kind: "btn-primary", onClick: async (close) => {
            const want = Number(f.value);
            if (!isFinite(want)) { toast("Впишите число", "err"); return; }
            try {
              const r = await setStock(ctx.db, p.id, want);
              p.stock_qty = r.stock;
              close(); draw();
              toast("Остаток: " + r.stock, "ok");
            } catch (e) { toast(e.message || String(e), "err"); }
          },
        },
      ],
    });
  }

  // ---------- электронная наклейка ----------
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

  // ---------- список ----------
  function pass(p) {
    const q = Number(p.stock_qty) || 0;
    if (filter === "low" && !(q > 0 && q <= LOW_STOCK)) return false;
    if (filter === "neg" && !(q < 0)) return false;
    if (!query) return true;
    return (p.name || "").toLowerCase().includes(query) || (p.sku || "").toLowerCase().includes(query);
  }

  function row(p) {
    const q = Number(p.stock_qty) || 0;
    const cls = q < 0 ? ".neg" : q <= LOW_STOCK ? ".low" : "";
    const own = currentCost(ensureBatches(p));
    const out = costOutlook(ensureBatches(p));
    const sub = [p.sku ? "Арт.: " + p.sku : null, "себест: " + (own.cost_yuan ? fmt(own.cost_yuan, "yuan") : "—")]
      .filter(Boolean).join(" · ");
    return el("div.mini-row" + cls, { onclick: () => openEdit(p) }, [
      p.photo_url
        ? el("img.ph", { src: thumb(p.photo_url, 84), loading: "lazy", decoding: "async", alt: "" })
        : el("div.ph"),
      el("div.info", {}, [
        el("div.nm", { text: p.name }),
        el("div.sku", { text: sub + (out && out.next ? ` · дальше ${fmt(out.next.cost_yuan, "yuan")}` : "") }),
      ]),
      el("div.qty" + cls, { text: String(q) }),
    ]);
  }

  function chunk() {
    filtered.slice(shown, shown + PAGE).forEach(p => list.append(row(p)));
    shown += Math.min(PAGE, filtered.length - shown);
    more.innerHTML = "";
    if (shown < filtered.length) {
      more.append(el("button.btn.btn-outline", {
        style: { width: "100%", marginTop: "10px", minHeight: "44px", justifyContent: "center" },
        text: `Показать ещё (${filtered.length - shown})`,
        onclick: chunk,
      }));
    }
  }

  function draw() {
    list.innerHTML = ""; shown = 0;
    filtered = products.filter(pass);
    if (!filtered.length) { list.append(el("div.mini-empty", { text: "Ничего не найдено" })); more.innerHTML = ""; return; }
    chunk();
  }

  let t = 0;
  search.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => { query = search.value.trim().toLowerCase(); filter = ""; draw(); }, 180);
  });
  scanBtn.addEventListener("click", async () => {
    const raw = await scanSku();
    if (!raw) return;
    const id = parsePayload(raw);
    const p = id ? products.find(x => x.id === id) : null;
    if (p) { openEdit(p); return; }
    search.value = raw; query = String(raw).toLowerCase(); filter = ""; draw();
  });
  addBtn.addEventListener("click", () => openEdit(null));

  draw();
}
