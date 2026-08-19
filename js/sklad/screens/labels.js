// Наклейки: лист QR для печати. Наклейка печатается ОДИН раз и живёт вечно —
// внутри неизменный номер товара, а остаток и цена подтягиваются при сканировании.
// Кнопка «Напечатать заново» даёт ту же наклейку: старые на коробках продолжают работать.
import { el } from "../app.js?v=20260819b";
import { icon } from "../../icons.js?v=20260819b";
import { toast } from "../../ui.js?v=20260819b";
import { qrSvg, skuPayload } from "../../qr.js?v=20260819b";
import { LOW_STOCK } from "../../advice.js?v=20260819b";

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Готовый к печати лист: A4, наклейки сеткой, без внешних файлов и шрифтов
function sheetHtml(items) {
  const cells = items.map(p => `
    <div class="lb">
      ${qrSvg(skuPayload(p.id), { size: 118, quiet: 2 })}
      <div class="nm">${esc(p.name)}</div>
      <div class="sku">${esc(p.sku || "")}</div>
    </div>`).join("");
  return `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8">
<title>Наклейки — ${items.length} шт</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',system-ui,-apple-system,Arial,sans-serif;color:#111;padding:10mm;background:#fff}
  .top{margin-bottom:6mm;display:flex;justify-content:space-between;align-items:center;gap:8mm}
  .top h1{font-size:14pt;font-weight:700}
  .top button{padding:8px 18px;font-size:11pt;border:1px solid #111;background:#111;color:#fff;border-radius:6px;cursor:pointer}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:4mm}
  .lb{border:1px dashed #bbb;border-radius:3mm;padding:3mm 2mm;text-align:center;break-inside:avoid;page-break-inside:avoid}
  .lb svg{display:block;margin:0 auto 2mm}
  .nm{font-size:8.5pt;font-weight:600;line-height:1.25;word-break:break-word}
  .sku{font-family:ui-monospace,Consolas,monospace;font-size:8pt;color:#555;margin-top:1mm}
  @media print{ .top{display:none} body{padding:6mm} .lb{border-color:#ddd} }
</style></head><body>
<div class="top"><h1>Наклейки — ${items.length} шт</h1><button onclick="window.print()">Печать</button></div>
<div class="grid">${cells}</div>
</body></html>`;
}

// Открыть лист. В Telegram сам печатать нельзя — открываем во внешнем браузере,
// оттуда работает обычная печать телефона или компьютера.
function openSheet(items) {
  const html = sheetHtml(items);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const TG = window.Telegram && window.Telegram.WebApp;
  if (TG && typeof TG.openLink === "function") {
    // blob-ссылку Telegram открыть не сможет — отдаём во вкладку браузера
    const w = window.open(url, "_blank");
    if (!w) { toast("Разрешите открытие окна, чтобы напечатать", "err"); URL.revokeObjectURL(url); return; }
  } else {
    window.open(url, "_blank");
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export default async function render(box, ctx) {
  const products = await ctx.db.products.list();
  const chosen = new Set();

  const search = el("input.inp", { type: "search", placeholder: "Название или артикул…", style: { flex: "1", minHeight: "44px", fontSize: "16px" } });
  box.append(el("div.mini-search", {}, [search]));

  const counter = el("div.mini-sec", { text: "Выбрано: 0" });
  box.append(counter);

  const list = el("div.mini-list");
  box.append(list);

  const printBtn = el("button.btn.btn-primary", { text: "Напечатать наклейки" });
  const allBtn = el("button.btn.btn-outline", {
    text: "Выбрать все",
    style: { width: "100%", minHeight: "44px", justifyContent: "center", marginTop: "10px" },
  });
  box.append(allBtn, el("div", { style: { height: "8px" } }), el("div.mini-cta", {}, [printBtn]));

  function refresh() {
    counter.textContent = "Выбрано: " + chosen.size;
    printBtn.disabled = chosen.size === 0;
    printBtn.textContent = chosen.size ? `Напечатать наклейки (${chosen.size})` : "Напечатать наклейки";
  }

  function draw() {
    const q = search.value.trim().toLowerCase();
    const shown = products
      .filter(p => !q || (p.name || "").toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q))
      .slice(0, 60);
    list.innerHTML = "";
    if (!shown.length) { list.append(el("div.mini-empty", { text: "Ничего не найдено" })); return; }
    shown.forEach(p => {
      const on = chosen.has(p.id);
      const st = Number(p.stock_qty) || 0;
      const row = el("div.mini-row" + (st < 0 ? ".neg" : st <= LOW_STOCK ? ".low" : ""), {
        style: on ? { borderColor: "var(--accent)" } : {},
        onclick: () => { chosen.has(p.id) ? chosen.delete(p.id) : chosen.add(p.id); draw(); refresh(); },
      }, [
        icon(on ? "check" : "dot", { size: 18 }),
        el("div.info", {}, [
          el("div.nm", { text: p.name }),
          el("div.sku", { text: p.sku ? "Арт.: " + p.sku : "без артикула" }),
        ]),
      ]);
      list.append(row);
    });
  }

  let t = 0;
  search.addEventListener("input", () => { clearTimeout(t); t = setTimeout(draw, 180); });
  allBtn.addEventListener("click", () => {
    const q = search.value.trim().toLowerCase();
    const shown = products.filter(p => !q || (p.name || "").toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q)).slice(0, 60);
    const allOn = shown.every(p => chosen.has(p.id));
    shown.forEach(p => allOn ? chosen.delete(p.id) : chosen.add(p.id));
    draw(); refresh();
  });
  printBtn.addEventListener("click", () => {
    const items = products.filter(p => chosen.has(p.id));
    if (!items.length) { toast("Выберите товары", "err"); return; }
    openSheet(items);
  });

  draw(); refresh();
}
