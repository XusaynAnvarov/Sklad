// Товары: поиск по названию и артикулу + сканер QR-наклейки.
// Показываем ровно то, за чем сюда заходят: остаток и себестоимость.
import { el, go } from "../app.js?v=20260819a";
import { icon } from "../../icons.js?v=20260819a";
import { ensureBatches, currentCost, costOutlook } from "../../inventory.js?v=20260819a";
import { fmt } from "../../fx.js?v=20260819a";
import { thumb } from "../../img.js?v=20260819a";
import { LOW_STOCK } from "../../advice.js?v=20260819a";
import { scanSku } from "../qr.js?v=20260819a";

const PAGE = 40;   // рисуем порциями: 866 карточек разом вешают телефон

export default async function render(box, ctx) {
  const products = await ctx.db.products.list();
  let filter = ctx.params.f || "";        // low | neg | пусто
  let query = (ctx.params.q || "").toLowerCase();

  const input = el("input.inp", { type: "search", placeholder: "Название или артикул…", value: ctx.params.q || "" });
  const scanBtn = el("button.mini-icon-btn", { title: "Сканировать наклейку" }, [icon("hash", { size: 18 })]);
  box.append(el("div.mini-search", {}, [input, scanBtn]));

  const list = el("div.mini-list");
  const more = el("div");
  box.append(list, more);

  let shown = 0, filtered = [];

  function pass(p) {
    const q = Number(p.stock_qty) || 0;
    if (filter === "low" && !(q > 0 && q <= LOW_STOCK)) return false;
    if (filter === "neg" && !(q < 0)) return false;
    if (!query) return true;
    return (p.name || "").toLowerCase().includes(query) || (p.sku || "").toLowerCase().includes(query);
  }

  function row(p) {
    const q = Number(p.stock_qty) || 0;
    const cls = q < 0 ? ".neg" : (q <= LOW_STOCK ? ".low" : "");
    const own = currentCost(ensureBatches(p));
    const out = costOutlook(ensureBatches(p));
    const cost = own.cost_yuan ? fmt(own.cost_yuan, "yuan") : "—";
    const sub = [p.sku ? "Арт.: " + p.sku : null, "себест: " + cost].filter(Boolean).join(" · ");
    return el("div.mini-row" + cls, {}, [
      p.photo_url
        ? el("img.ph", { src: thumb(p.photo_url, 84), loading: "lazy", decoding: "async", alt: "" })
        : el("div.ph"),
      el("div.info", {}, [
        el("div.nm", { text: p.name }),
        el("div.sku", { text: sub + (out && out.next ? ` · дальше ${fmt(out.next.cost_yuan, "yuan")}` : "") }),
      ]),
      el("div.qty" + (q < 0 ? ".neg" : q <= LOW_STOCK ? ".low" : ""), { text: String(q) }),
    ]);
  }

  function chunk() {
    const slice = filtered.slice(shown, shown + PAGE);
    slice.forEach(p => list.append(row(p)));
    shown += slice.length;
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
  input.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => { query = input.value.trim().toLowerCase(); filter = ""; draw(); }, 180);
  });

  scanBtn.addEventListener("click", async () => {
    const sku = await scanSku();
    if (!sku) return;
    input.value = sku; query = sku.toLowerCase(); filter = ""; draw();
  });

  draw();
}
