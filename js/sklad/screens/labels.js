// Наклейки: QR-коды показываются прямо на экране — их видно и на ноутбуке,
// и на телефоне, можно сразу сканировать. Отмечаете нужные и печатаете.
//
// Печатаем СО СТРАНИЦЫ, а не через новое окно: Telegram новые окна блокирует
// («Разрешите открытие окна»), поэтому лист собирается тут же и уходит на
// принтер по window.print().
import { el } from "../app.js?v=20260820b";
import { icon } from "../../icons.js?v=20260820b";
import { toast } from "../../ui.js?v=20260820b";
import { qrSvg, skuPayload } from "../../qr.js?v=20260820b";

const PAGE = 24;   // сразу рисовать сотни QR — телефон не потянет

export default async function render(box, ctx) {
  const products = await ctx.db.products.list();
  const chosen = new Set();
  let shown = PAGE;
  let query = "";

  const search = el("input.inp", { type: "search", placeholder: "Название или артикул…", style: { flex: "1", minHeight: "44px", fontSize: "16px" } });
  box.append(el("div.mini-search", {}, [search]));

  const counter = el("div.mini-sec");
  const grid = el("div.qr-grid");
  const more = el("div");
  box.append(counter, grid, more);

  // лист для принтера — на экране скрыт, виден только при печати
  const printArea = el("div", { id: "print-area" });
  document.body.append(printArea);

  const allBtn = el("button.btn.btn-outline", {
    style: { width: "100%", minHeight: "46px", justifyContent: "center", marginTop: "12px" },
  });
  const printBtn = el("button.btn.btn-primary", { text: "Печать" });
  box.append(allBtn, el("div", { style: { height: "8px" } }), el("div.mini-cta", {}, [printBtn]));

  const filtered = () => products.filter(p => !query
    || (p.name || "").toLowerCase().includes(query)
    || (p.sku || "").toLowerCase().includes(query));

  function refresh() {
    const list = filtered();
    counter.textContent = `Отмечено: ${chosen.size} из ${list.length}`;
    printBtn.disabled = chosen.size === 0;
    printBtn.textContent = chosen.size ? `Печать (${chosen.size})` : "Печать";
    const allOn = list.length > 0 && list.every(p => chosen.has(p.id));
    allBtn.textContent = allOn ? "Снять отметки" : `Отметить все товары (${list.length})`;
  }

  function card(p) {
    const c = el("div.qr-card" + (chosen.has(p.id) ? ".on" : ""), {
      title: "Нажмите, чтобы отметить для печати",
      onclick: () => {
        chosen.has(p.id) ? chosen.delete(p.id) : chosen.add(p.id);
        c.classList.toggle("on");
        refresh();
      },
    });
    // QR рисуем строкой — это наш собственный SVG, без внешних файлов
    const qr = el("div");
    qr.innerHTML = qrSvg(skuPayload(p.id), { size: 150 });
    c.append(qr,
      el("div.nm", { text: p.name }),
      el("div.sku", { text: p.sku || "без артикула" }),
      el("div.tick", {}, [icon("check", { size: 13 })]),
    );
    return c;
  }

  function draw() {
    const list = filtered();
    grid.innerHTML = "";
    more.innerHTML = "";
    if (!list.length) { grid.append(el("div.mini-empty", { text: "Ничего не найдено" })); refresh(); return; }
    list.slice(0, shown).forEach(p => grid.append(card(p)));
    if (shown < list.length) {
      more.append(el("button.btn.btn-outline", {
        style: { width: "100%", minHeight: "44px", justifyContent: "center", marginTop: "10px" },
        text: `Показать ещё (${list.length - shown})`,
        onclick: () => { shown += PAGE; draw(); },
      }));
    }
    refresh();
  }

  let t = 0;
  search.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => { query = search.value.trim().toLowerCase(); shown = PAGE; draw(); }, 180);
  });

  allBtn.addEventListener("click", () => {
    const list = filtered();
    const allOn = list.length > 0 && list.every(p => chosen.has(p.id));
    list.forEach(p => allOn ? chosen.delete(p.id) : chosen.add(p.id));
    draw();
  });

  printBtn.addEventListener("click", () => {
    const items = products.filter(p => chosen.has(p.id));
    if (!items.length) { toast("Отметьте наклейки", "err"); return; }
    // собираем лист заново — печатаем именно отмеченные, а не то, что на экране
    printArea.innerHTML = "";
    const sheet = el("div.qr-grid");
    items.forEach(p => {
      const c = el("div.qr-card");
      const qr = el("div");
      qr.innerHTML = qrSvg(skuPayload(p.id), { size: 132 });
      c.append(qr, el("div.nm", { text: p.name }), el("div.sku", { text: p.sku || "" }));
      sheet.append(c);
    });
    printArea.append(sheet);
    // даём браузеру дорисовать, потом зовём принтер
    setTimeout(() => {
      try { window.print(); }
      catch { toast("Печать недоступна — откройте склад на компьютере", "err"); }
    }, 60);
  });

  draw();
}
