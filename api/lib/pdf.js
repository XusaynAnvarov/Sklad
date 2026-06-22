// ========================================================================
//  Генерация PDF накладной (pdf-lib + кириллический шрифт Noto Sans)
// ========================================================================
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SIGN = { yuan: "¥", usd: "$", som: "сум" };
const ACCENT = rgb(0.486, 0.361, 1);      // #7c5cff
const DARK = rgb(0.08, 0.08, 0.13);
const GREY = rgb(0.42, 0.42, 0.5);
const LINE = rgb(0.86, 0.86, 0.9);

function money(n, cur) {
  const v = Number(n) || 0;
  const s = (cur === "som" ? Math.round(v) : Math.round(v * 100) / 100).toLocaleString("ru-RU");
  return cur === "som" ? s + " сум" : (SIGN[cur] || "") + s;
}

// прямоугольник со скруглёнными углами (через SVG-path). x,y — левый-НИЖНИЙ угол (как в pdf-lib).
function roundRect(pg, x, y, w, h, r, opts = {}) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  const path = `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
  // drawSvgPath рисует от точки (x, yTop) вниз → передаём верхнюю грань
  pg.drawSvgPath(path, { x, y: y + h, ...opts });
}

export async function buildInvoicePDF({ sale, customer, products, company = "GENERAL MODERN", status }) {
  const pmap = Object.fromEntries((products || []).map(p => [p.id, p]));
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const reg = await doc.embedFont(readFileSync(join(__dirname, "../fonts/NotoSans-Regular.ttf")));
  const bold = await doc.embedFont(readFileSync(join(__dirname, "../fonts/NotoSans-Bold.ttf")));

  const page = doc.addPage([595, 842]);
  const W = 595;
  const M = 44;
  const T = (s, x, y, size, font = reg, color = DARK) => page.drawText(String(s == null ? "" : s), { x, y, size, font, color });

  // ---- шапка (плашка со скруглёнными нижними углами) ----
  const bannerH = 96, bannerR = 16;
  const bannerPath = `M 0 0 H ${W} V ${bannerH - bannerR} Q ${W} ${bannerH} ${W - bannerR} ${bannerH} H ${bannerR} Q 0 ${bannerH} 0 ${bannerH - bannerR} V 0 Z`;
  page.drawSvgPath(bannerPath, { x: 0, y: 842, color: DARK });
  roundRect(page, 16, 842 - 96 + 18, 6, 60, 3, { color: ACCENT });
  T(company, M, 842 - 50, 24, bold, rgb(1, 1, 1));
  T("Накладная / Hisob-faktura", M, 842 - 74, 12, reg, rgb(0.75, 0.75, 0.85));

  const shortNo = String(sale.id || "").replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase();
  const dateStr = new Date(sale.date).toLocaleDateString("ru-RU");
  T("№ " + shortNo, W - M - 120, 842 - 50, 13, bold, rgb(1, 1, 1));
  T("от " + dateStr, W - M - 120, 842 - 70, 12, reg, rgb(0.75, 0.75, 0.85));

  // ---- клиент / статус ----
  let y = 842 - 130;
  T("Клиент:", M, y, 11, reg, GREY);
  T(customer?.name || "—", M + 60, y, 13, bold);
  // статус: реальный по оплатам (передан в status) либо по флагам накладной (резерв)
  const st = status || ((sale.items || []).length > 0 && sale.items.every(i => i.paid) ? "paid" : "debt");
  const stTxt = st === "paid" ? "ОПЛАЧЕНО" : st === "partial" ? "ЧАСТИЧНО" : "В ДОЛГ";
  const stColor = st === "paid" ? rgb(0.06, 0.72, 0.51) : st === "partial" ? rgb(0.96, 0.62, 0.04) : rgb(0.94, 0.35, 0.14);
  const bw = 120, stW = bold.widthOfTextAtSize(stTxt, 12);
  roundRect(page, W - M - bw, y - 6, bw, 24, 12, { color: stColor });
  T(stTxt, W - M - bw / 2 - stW / 2, y + 1, 12, bold, rgb(1, 1, 1));
  if (customer?.contact) { y -= 18; T("Контакт: " + customer.contact, M, y, 11, reg, GREY); }
  if (Number(sale.boxes) > 0) { y -= 18; T("Отправлено коробок: ", M, y, 11, reg, GREY); T(String(sale.boxes), M + 130, y, 12, bold, ACCENT); }

  // ---- таблица с рамками (с разбивкой на страницы) ----
  const HEADBG = rgb(0.93, 0.93, 0.97), ZEBRA = rgb(0.975, 0.975, 0.99), WHITE = rgb(1, 1, 1);
  const tableX = M, tableR = W - M;
  // границы колонок: l | name | qty | price | sum | r  (5 колонок, без пустых)
  const cx = { l: tableX, name: tableX + 30, qty: tableX + 245, price: tableX + 305, sum: tableX + 383, r: tableR };
  const padR = 8, rowH = 22, headH = 26, BOTTOM = 80;
  const tw = (s, size, f) => f.widthOfTextAtSize(String(s == null ? "" : s), size);

  let pg = page;
  const PT = (s, x, yy, size, f = reg, c = DARK) => pg.drawText(String(s == null ? "" : s), { x, y: yy, size, font: f, color: c });
  const PRT = (s, xr, yy, size, f, c = DARK) => pg.drawText(String(s == null ? "" : s), { x: xr - tw(s, size, f), y: yy, size, font: f, color: c });
  const hline = (yy) => pg.drawLine({ start: { x: tableX, y: yy }, end: { x: tableR, y: yy }, thickness: 0.8, color: LINE });
  const verticals = (top, bot) => [cx.l, cx.name, cx.qty, cx.price, cx.sum, cx.r].forEach(x => pg.drawLine({ start: { x, y: top }, end: { x, y: bot }, thickness: 0.8, color: LINE }));
  function colHeader(bandTop) {
    const hw = tableR - tableX, hr = 8;
    pg.drawSvgPath(`M ${hr} 0 H ${hw - hr} Q ${hw} 0 ${hw} ${hr} V ${headH} H 0 V ${hr} Q 0 0 ${hr} 0 Z`, { x: tableX, y: bandTop, color: HEADBG });
    const hb = bandTop - 17;
    PT("#", cx.l + 8, hb, 10, bold, GREY); PT("Товар", cx.name + 8, hb, 10, bold, GREY);
    PRT("Кол-во", cx.price - padR, hb, 10, bold, GREY); PRT("Цена", cx.sum - padR, hb, 10, bold, GREY); PRT("Сумма", cx.r - padR, hb, 10, bold, GREY);
    hline(bandTop); hline(bandTop - headH);
  }

  let bandTop = y - 30, segTop = bandTop, cy = bandTop - headH;
  const totals = {};
  colHeader(bandTop);
  (sale.items || []).forEach((it, i) => {
    if (cy - rowH < BOTTOM) {            // нет места — закрываем сегмент, новая страница
      verticals(segTop, cy);
      pg = doc.addPage([595, 842]); bandTop = 842 - 50; segTop = bandTop; colHeader(bandTop); cy = bandTop - headH;
    }
    const p = pmap[it.product_id] || { name: "?" };
    const cur = it.currency || sale.currency;
    const sum = it.qty * it.unit_price;
    totals[cur] = (totals[cur] || 0) + sum;
    if (i % 2 === 1) pg.drawRectangle({ x: tableX, y: cy - rowH, width: tableR - tableX, height: rowH, color: ZEBRA });
    const base = cy - 15;
    PT(i + 1, cx.l + 8, base, 10, reg);
    let nm = p.name || "?"; if (nm.length > 42) nm = nm.slice(0, 41) + "…";
    PT(nm, cx.name + 8, base, 10, reg);
    PRT(it.qty, cx.price - padR, base, 10, reg);
    PRT(money(it.unit_price, cur), cx.sum - padR, base, 10, reg);
    PRT(money(sum, cur), cx.r - padR, base, 10, bold);
    cy -= rowH; hline(cy);
  });
  verticals(segTop, cy);

  // ---- итог по валютам (в рамке) ----
  const totalStr = ["som", "usd", "yuan"].filter(c => Math.abs(totals[c] || 0) >= (c === "som" ? 1 : 0.01)).map(c => money(totals[c], c)).join("  +  ") || money(0, sale.currency);
  const boxH = 34, gap = 18;
  let boxY = cy - gap - boxH;            // нижняя грань блока
  if (boxY < BOTTOM) { pg = doc.addPage([595, 842]); boxY = 842 - 80 - boxH; }
  const boxX = totalStr.length > 22 ? cx.name : cx.qty;
  roundRect(pg, boxX, boxY, cx.r - boxX, boxH, 10, { color: DARK });
  PT("ИТОГО:", boxX + 14, boxY + 11, 13, bold, WHITE);
  PRT(totalStr, cx.r - padR, boxY + 11, 13, bold, ACCENT);

  // ---- подвал ----
  pg.drawLine({ start: { x: M, y: 64 }, end: { x: W - M, y: 64 }, thickness: 0.6, color: LINE });
  pg.drawText("Спасибо за покупку! " + company, { x: M, y: 48, size: 10, font: reg, color: GREY });
  pg.drawText(new Date().toLocaleString("ru-RU"), { x: W - M - 130, y: 48, size: 9, font: reg, color: rgb(0.6, 0.6, 0.68) });

  return await doc.save(); // Uint8Array
}

export default (_, res) => res?.status(404).json({ error: 'Not an endpoint' });
