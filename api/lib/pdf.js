// ========================================================================
//  Генерация PDF накладной (pdf-lib + кириллический шрифт Noto Sans)
// ========================================================================
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { clientName } from "./name.js";

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
    let nm = clientName(p.name, p.sku) || "?"; if (nm.length > 42) nm = nm.slice(0, 41) + "…"; // клиент не видит артикул в имени
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

// ---- Акт сверки взаиморасчётов (по каждой валюте, хронология, остаток) ----
export async function buildReconciliationPDF({ customer, sales, payments, company = "GENERAL MODERN" }) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const reg = await doc.embedFont(readFileSync(join(__dirname, "../fonts/NotoSans-Regular.ttf")));
  const bold = await doc.embedFont(readFileSync(join(__dirname, "../fonts/NotoSans-Bold.ttf")));
  const W = 595, H = 842, M = 44, tableR = W - M;
  const cDate = M, cOper = M + 70, xShip = 372, xPaid = 462, xBal = tableR;
  const rowH = 20, headH = 22, BOTTOM = 64;
  const CURS = ["som", "usd", "yuan"];
  const CURNAME = { som: "Расчёты в сумах", usd: "Расчёты в долларах ($)", yuan: "Расчёты в юанях (¥)" };

  let pg, y;
  const tw = (s, size, f) => f.widthOfTextAtSize(String(s == null ? "" : s), size);
  const T = (s, x, yy, size, f = reg, c = DARK) => pg.drawText(String(s == null ? "" : s), { x, y: yy, size, font: f, color: c });
  const TR = (s, xr, yy, size, f = reg, c = DARK) => pg.drawText(String(s == null ? "" : s), { x: xr - tw(s, size, f), y: yy, size, font: f, color: c });

  function header() {
    const bannerH = 88, bannerR = 16;
    pg.drawSvgPath(`M 0 0 H ${W} V ${bannerH - bannerR} Q ${W} ${bannerH} ${W - bannerR} ${bannerH} H ${bannerR} Q 0 ${bannerH} 0 ${bannerH - bannerR} V 0 Z`, { x: 0, y: H, color: DARK });
    roundRect(pg, 16, H - bannerH + 15, 6, 58, 3, { color: ACCENT });
    T(company, M, H - 46, 22, bold, rgb(1, 1, 1));
    T("Акт сверки взаиморасчётов", M, H - 68, 12, reg, rgb(0.75, 0.75, 0.85));
    TR("от " + new Date().toLocaleDateString("ru-RU"), tableR, H - 46, 12, reg, rgb(0.75, 0.75, 0.85));
    y = H - 112;
  }
  function newPage() { pg = doc.addPage([W, H]); header(); }
  function colHead() {
    const hw = tableR - M, hr = 9;
    pg.drawSvgPath(`M ${hr} 0 H ${hw - hr} Q ${hw} 0 ${hw} ${hr} V ${headH} H 0 V ${hr} Q 0 0 ${hr} 0 Z`, { x: M, y, color: rgb(0.93, 0.93, 0.97) });
    const hb = y - 15;
    T("Дата", cDate + 6, hb, 9, bold, GREY);
    T("Операция", cOper + 6, hb, 9, bold, GREY);
    TR("Отгружено", xShip - 4, hb, 9, bold, GREY);
    TR("Оплачено", xPaid - 4, hb, 9, bold, GREY);
    TR("Остаток", xBal - 4, hb, 9, bold, GREY);
    y -= headH;
  }

  newPage();
  T("Клиент:", M, y, 11, reg, GREY); T(customer?.name || "—", M + 56, y, 13, bold);
  if (customer?.contact) { y -= 16; T("Контакт: " + customer.contact, M, y, 11, reg, GREY); }
  y -= 16; T("Период: за всё время", M, y, 11, reg, GREY);
  y -= 26;

  const opening = customer?.opening_debt || {};
  const closing = {};
  let drew = false;

  for (const cur of CURS) {
    const events = [];
    (sales || []).forEach(s => {
      let sum = 0;
      (s.items || []).forEach(it => { const c = it.currency || s.currency; if (c === cur) sum += (Number(it.qty) || 0) * (Number(it.unit_price) || 0); });
      if (sum > 0.0001) events.push({ date: s.date, type: "ship", amount: sum });
    });
    (payments || []).forEach(p => { if ((p.currency || "som") === cur && (Number(p.amount) || 0) > 0.0001) events.push({ date: p.date, type: "pay", amount: Number(p.amount) }); });
    const open = Number(opening[cur]) || 0;
    if (!events.length && Math.abs(open) < (cur === "som" ? 1 : 0.01)) continue;
    events.sort((a, b) => new Date(a.date) - new Date(b.date));
    drew = true;

    if (y - (headH + rowH * 3 + 60) < BOTTOM) newPage();
    T(CURNAME[cur], M, y - 2, 13, bold, ACCENT); y -= 20;
    T("Начальный долг (до системы): " + money(open, cur), M, y - 2, 10, reg, GREY); y -= 16;
    colHead();

    let bal = open, ship = 0, paid = 0, i = 0;
    for (const ev of events) {
      if (y - rowH < BOTTOM) { newPage(); colHead(); }
      const base = y - 14;
      if (i % 2 === 1) pg.drawRectangle({ x: M, y: y - rowH, width: tableR - M, height: rowH, color: rgb(0.975, 0.975, 0.99) });
      T(new Date(ev.date).toLocaleDateString("ru-RU"), cDate + 6, base, 9, reg);
      if (ev.type === "ship") { bal += ev.amount; ship += ev.amount; T("Накладная", cOper + 6, base, 9, reg); TR(money(ev.amount, cur), xShip - 4, base, 9, reg, rgb(0.7, 0.2, 0.1)); }
      else { bal -= ev.amount; paid += ev.amount; T("Оплата", cOper + 6, base, 9, reg); TR(money(ev.amount, cur), xPaid - 4, base, 9, reg, rgb(0.06, 0.5, 0.3)); }
      TR(money(bal, cur), xBal - 4, base, 9, bold);
      y -= rowH;
      pg.drawLine({ start: { x: M, y }, end: { x: tableR, y }, thickness: 0.6, color: LINE });
      i++;
    }
    closing[cur] = bal;
    y -= 26;
  }

  if (!drew) {
    T("Движений по счёту нет.", M, y, 12, reg, GREY);
  } else {
    // общий долг по всем валютам — в конце
    const parts = CURS.filter(c => Math.abs(closing[c] || 0) >= (c === "som" ? 1 : 0.01)).map(c => money(closing[c], c));
    const debtStr = parts.length ? parts.join("     +     ") : money(0, "som");
    if (y - 64 < BOTTOM) newPage();
    const boxH = 50;
    roundRect(pg, M, y - boxH, tableR - M, boxH, 16, { color: DARK });
    T("Общий долг клиента", M + 20, y - 19, 11, reg, rgb(0.72, 0.74, 0.88));
    T(debtStr, M + 20, y - 39, 17, bold, ACCENT);
    y -= boxH + 12;
  }
  pg.drawText("Сформировано: " + new Date().toLocaleString("ru-RU") + " · " + company, { x: M, y: 32, size: 9, font: reg, color: GREY });

  return await doc.save();
}
