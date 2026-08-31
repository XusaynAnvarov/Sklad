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

// ------------------------------------------------------------------
//  Ширина колонок накладной — по ФАКТИЧЕСКОМУ тексту, а не на глаз.
//  Ширины на глаз и подвели: «3 600 000 сум» не влезало в отведённое
//  место, и колонка «Цена» налезала на «Сумму». Здесь каждая денежная
//  колонка получает ровно столько, сколько занимает её самое длинное
//  значение, плюс поля; остаток отдаётся названию товара.
//  Вынесено отдельно, чтобы это можно было проверить тестом.
// ------------------------------------------------------------------
export function колонкиНакладной({ позиции, reg, bold, M, R, PAD }) {
  const ш = (s, size, f) => f.widthOfTextAtSize(String(s == null ? "" : s), size);
  const макс = (тексты, size, f, минимум) => Math.max(минимум, ...тексты.map(t => ш(t, size, f)));

  const шN = макс([...позиции.map(p => p.n), "№"], 9.5, reg, 12) + PAD * 2;
  const шКво = макс([...позиции.map(p => p.кво), "КОЛ-ВО"], 9.5, bold, 30) + PAD * 2;
  const шЦена = макс([...позиции.map(p => p.цена), "ЦЕНА"], 9.5, bold, 40) + PAD * 2;
  const шСумма = макс([...позиции.map(p => p.сумма), "СУММА"], 9.5, bold, 50) + PAD * 2;
  // Названию — всё, что осталось. Если товаров с длинными ценами много,
  // места под название становится меньше, и оно обрезается многоточием.
  const шИмя = (R - M) - шN - шКво - шЦена - шСумма;

  const xИмя = M + шN + PAD;
  return {
    n: M + PAD,
    имя: xИмя,
    имяПредел: xИмя + шИмя - PAD * 2,
    квоR: M + шN + шИмя + шКво - PAD,
    ценаR: M + шN + шИмя + шКво + шЦена - PAD,
    суммаR: R - PAD,
    ширины: { шN, шИмя, шКво, шЦена, шСумма },
  };
}

export async function buildInvoicePDF({ sale, customer, products, company = "GENERAL MODERN", status, debt }) {
  const pmap = Object.fromEntries((products || []).map(p => [p.id, p]));
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const reg = await doc.embedFont(readFileSync(join(__dirname, "../fonts/NotoSans-Regular.ttf")));
  const bold = await doc.embedFont(readFileSync(join(__dirname, "../fonts/NotoSans-Bold.ttf")));

  const W = 595, H = 842, M = 45, R = W - M;
  // НИЗ — граница, ниже которой содержимое не опускается. Строки подписи
  // стоят на 96, поэтому запас обязателен: иначе последняя строка таблицы
  // или итог упрутся прямо в «Отпустил / Получил».
  const PAD = 7, ROW = 19, HEAD = 22, НИЗ = 132;

  let pg = doc.addPage([W, H]);
  const ш = (s, size, f) => f.widthOfTextAtSize(String(s == null ? "" : s), size);
  const T = (s, x, y, size, f = reg, c = DARK) => pg.drawText(String(s == null ? "" : s), { x, y, size, font: f, color: c });
  const TR = (s, xr, y, size, f = reg, c = DARK) => T(s, xr - ш(s, size, f), y, size, f, c);
  const линия = (x1, y, x2, толщ = 0.6, цвет = LINE) =>
    pg.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: толщ, color: цвет });

  // ------------------------------------------------------------------
  //  Ширина колонок — по фактическому тексту, а не на глаз.
  //  Иначе «3 600 000 сум» не влезает в отведённое место и наезжает на
  //  соседнюю колонку: именно так и было.
  // ------------------------------------------------------------------
  const позиции = (sale.items || []).map((it, i) => {
    const p = pmap[it.product_id] || { name: "?" };
    const cur = it.currency || sale.currency;
    const сумма = (Number(it.qty) || 0) * (Number(it.unit_price) || 0);
    return { n: String(i + 1), имя: p.name || "?", кво: String(it.qty ?? ""), цена: money(it.unit_price, cur), сумма: money(сумма, cur), cur, число: сумма };
  });
  const кол = колонкиНакладной({ позиции, reg, bold, M, R, PAD });

  // Название обрезаем по ширине, а не по числу букв: буквы разной ширины.
  const вместить = (s, предел, size) => {
    let t = String(s || "");
    if (ш(t, size, reg) <= предел) return t;
    while (t.length > 1 && ш(t + "…", size, reg) > предел) t = t.slice(0, -1);
    return t + "…";
  };

  // ---------------- шапка ----------------
  function шапкаДокумента(y) {
    T(company, M, y, 15, bold);
    TR("№ " + String(sale.id || "").replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase(), R, y, 12, bold);
    y -= 14;
    T("Накладная / Hisob-faktura", M, y, 8.5, reg, GREY);
    TR("от " + new Date(sale.date).toLocaleDateString("ru-RU"), R, y, 9, reg, GREY);
    y -= 12;
    линия(M, y, R, 1.2, DARK);
    return y;
  }

  // ---------------- шапка таблицы ----------------
  function шапкаТаблицы(y) {
    const b = y - 15;
    T("№", кол.n, b, 8.5, bold, GREY);
    T("НАИМЕНОВАНИЕ", кол.имя, b, 8.5, bold, GREY);
    TR("КОЛ-ВО", кол.квоR, b, 8.5, bold, GREY);
    TR("ЦЕНА", кол.ценаR, b, 8.5, bold, GREY);
    TR("СУММА", кол.суммаR, b, 8.5, bold, GREY);
    y -= HEAD;
    линия(M, y, R, 0.9, LINE);
    return y;
  }

  let y = шапкаДокумента(H - 55);

  // ---------------- покупатель ----------------
  y -= 26;
  T("Покупатель:", M, y, 9, reg, GREY);
  T(customer?.name || "—", M + 66, y, 11, bold);
  const st = status || ((sale.items || []).length > 0 && sale.items.every(i => i.paid) ? "paid" : "debt");
  const stTxt = st === "paid" ? "ОПЛАЧЕНО" : st === "partial" ? "ОПЛАЧЕНО ЧАСТИЧНО" : "В ДОЛГ";
  TR("Статус оплаты: " + stTxt, R, y, 9.5, bold);

  if (customer?.contact || Number(sale.boxes) > 0) {
    y -= 15;
    if (customer?.contact) { T("Телефон:", M, y, 9, reg, GREY); T(customer.contact, M + 66, y, 9.5); }
    if (Number(sale.boxes) > 0) TR("Мест (коробок): " + sale.boxes, R, y, 9.5, reg, GREY);
  }

  // ---------------- таблица ----------------
  y -= 24;
  y = шапкаТаблицы(y);
  const итоги = {};

  for (const поз of позиции) {
    if (y - ROW < НИЗ) {
      pg = doc.addPage([W, H]);
      y = шапкаТаблицы(H - 55);
    }
    итоги[поз.cur] = (итоги[поз.cur] || 0) + поз.число;
    const b = y - 13;
    T(поз.n, кол.n, b, 9, reg, GREY);
    T(вместить(поз.имя, кол.имяПредел - кол.имя, 9.5), кол.имя, b, 9.5);
    TR(поз.кво, кол.квоR, b, 9.5);
    TR(поз.цена, кол.ценаR, b, 9.5);
    TR(поз.сумма, кол.суммаR, b, 9.5, bold);
    y -= ROW;
    линия(M, y, R, 0.4, rgb(0.90, 0.90, 0.91));
  }

  // ---------------- итог ----------------
  const строкаИтога = ["som", "yuan", "usd"]
    .filter(c => Math.abs(итоги[c] || 0) >= (c === "som" ? 1 : 0.01))
    .map(c => money(итоги[c], c)).join("  +  ") || money(0, sale.currency);

  const местоПодИтог = 34;
  if (y - местоПодИтог < НИЗ) { pg = doc.addPage([W, H]); y = H - 70; }
  y -= 22;
  TR("ИТОГО К ОПЛАТЕ", кол.суммаR - ш(строкаИтога, 14, bold) - 18, y, 10, bold, GREY);
  TR(строкаИтога, кол.суммаR, y, 14, bold);
  y -= 8;
  линия(Math.max(M, кол.суммаR - ш(строкаИтога, 14, bold) - 170), y, R, 1.2, DARK);

  // ---------------- расчёты с клиентом ----------------
  if (debt) {
    const CURS = ["som", "yuan", "usd"];
    const есть = (v, c) => Math.abs(Number(v) || 0) >= (c === "som" ? 1 : 0.01);
    const показать = CURS.filter(c => есть(debt.invoiceTotal[c], c) || есть(debt.balanceBefore[c], c) || есть(debt.balanceAfter[c], c));
    if (показать.length) {
      const нужно = 26 + показать.length * 72;
      let dy = y - 28;
      if (dy - нужно < НИЗ) { pg = doc.addPage([W, H]); dy = H - 70; }
      T("Расчёты с клиентом", M, dy, 10, bold, GREY);
      dy -= 20;
      for (const c of показать) {
        const было = debt.balanceBefore[c], счёт = debt.invoiceTotal[c], стало = debt.balanceAfter[c];
        if (было > 0 && есть(было, c)) { T("Прошлый долг", M, dy, 9.5, reg, GREY); TR("+ " + money(было, c), R, dy, 9.5); dy -= 15; }
        else if (было < 0 && есть(было, c)) { T("Аванс клиента", M, dy, 9.5, reg, GREY); TR("− " + money(-было, c), R, dy, 9.5); dy -= 15; }
        if (есть(счёт, c)) { T("Эта накладная", M, dy, 9.5, reg, GREY); TR(money(счёт, c), R, dy, 9.5); dy -= 15; }
        линия(M, dy + 7, R, 0.6, LINE);
        dy -= 9;
        if (стало >= 0) { T("Общий долг клиента", M, dy, 10, bold); TR(money(стало, c), R, dy, 10, bold); }
        else { T("Аванс клиенту (мы должны)", M, dy, 10, bold); TR(money(-стало, c), R, dy, 10, bold); }
        dy -= 27;
      }
      y = dy;
    }
  }

  // ---------------- подписи и подвал ----------------
  // Подписи всегда внизу листа: документ подписывают от руки, и место под
  // это должно быть на своём месте, а не ехать за списком товаров.
  линия(M, 96, M + 170, 0.6, LINE);
  линия(R - 170, 96, R, 0.6, LINE);
  T("Отпустил", M, 84, 8.5, reg, GREY);
  TR("Получил", R, 84, 8.5, reg, GREY);

  линия(M, 60, R, 0.6, LINE);
  T(company, M, 44, 9, reg, GREY);
  TR(new Date().toLocaleString("ru-RU"), R, 44, 8.5, reg, rgb(0.62, 0.62, 0.64));

  return await doc.save(); // Uint8Array
}

// ---- Заказ поставщику: фото товара + название + кол-во + себестоимость ----
// Фото тянутся из публичного бакета и встраиваются в PDF (тяжелее обычной накладной).
async function embedPhoto(doc, url) {
  if (!url) return null;
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(url, { signal: ctrl.signal }).catch(() => null);
    clearTimeout(to);
    if (!r || !r.ok) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    try { return await doc.embedJpg(buf); } catch { try { return await doc.embedPng(buf); } catch { return null; } }
  } catch { return null; }
}

// Ярлыки PDF. Для zh нужен CJK-шрифт (NotoSansSC) — он же покрывает кириллицу/латиницу,
// поэтому в китайском режиме используем его для ВСЕГО текста (включая русские названия).
const SO_PDF_LABELS = {
  ru: { po: "Заказ поставщику", supplier: "Поставщик", photo: "Фото", name: "Товар", qty: "Кол-во", price: "Себест.", sum: "Сумма", total: "ИТОГО", from: "от" },
  uz: { po: "Yetkazib beruvchiga buyurtma", supplier: "Yetkazib beruvchi", photo: "Rasm", name: "Mahsulot", qty: "Soni", price: "Narx", sum: "Summa", total: "JAMI", from: "sana" },
  en: { po: "Purchase order", supplier: "Supplier", photo: "Photo", name: "Product", qty: "Qty", price: "Price", sum: "Amount", total: "TOTAL", from: "date" },
  zh: { po: "采购订单", supplier: "供应商", photo: "产品图片", name: "品名", qty: "数量", price: "单价", sum: "金额", total: "合计", from: "日期" },
};

export async function buildSupplierOrderPDF({ items, supplier, currency = "yuan", products, company = "GENERAL MODERN", lang = "ru" }) {
  const pmap = Object.fromEntries((products || []).map(p => [p.id, p]));
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  let reg = await doc.embedFont(readFileSync(join(__dirname, "../fonts/NotoSans-Regular.ttf")));
  let bold = await doc.embedFont(readFileSync(join(__dirname, "../fonts/NotoSans-Bold.ttf")));
  let LB = SO_PDF_LABELS[lang] || SO_PDF_LABELS.ru;
  if (lang === "zh") {
    try {
      // NotoSansSC покрывает 中文 + кириллицу + латиницу → используем как единый шрифт
      const cjk = await doc.embedFont(readFileSync(join(__dirname, "../fonts/NotoSansSC-Regular.otf")), { subset: true });
      reg = cjk; bold = cjk; LB = SO_PDF_LABELS.zh;
    } catch (e) { LB = SO_PDF_LABELS.en; } // шрифт недоступен → латиница (без «квадратиков»)
  }

  const W = 595, H = 842, M = 44;
  // встраиваем фото уникальных товаров параллельно (id → image | null)
  const uniq = [...new Set((items || []).map(it => it.product_id).filter(Boolean))];
  const imgs = {};
  await Promise.all(uniq.map(async (id) => {
    const p = pmap[id]; if (!p) return;
    const url = (p.photos && p.photos[0]) || p.photo_url || null;
    imgs[id] = await embedPhoto(doc, url);
  }));

  const HEADBG = rgb(0.93, 0.93, 0.97), ZEBRA = rgb(0.975, 0.975, 0.99), WHITE = rgb(1, 1, 1);
  const tableX = M, tableR = W - M;
  const cx = { l: tableX, name: tableX + 112, qty: tableX + 300, cost: tableX + 378, sum: tableX + 455, r: tableR };
  const padR = 8, rowH = 104, headH = 24, BOTTOM = 70, PHOTO = 90;
  const tw = (s, size, f) => f.widthOfTextAtSize(String(s == null ? "" : s), size);

  let pg = doc.addPage([W, H]);
  const PT = (s, x, yy, size, f = reg, c = DARK) => pg.drawText(String(s == null ? "" : s), { x, y: yy, size, font: f, color: c });
  const PRT = (s, xr, yy, size, f, c = DARK) => pg.drawText(String(s == null ? "" : s), { x: xr - tw(s, size, f), y: yy, size, font: f, color: c });
  const hline = (yy) => pg.drawLine({ start: { x: tableX, y: yy }, end: { x: tableR, y: yy }, thickness: 0.8, color: LINE });

  function banner() {
    const bannerH = 96, bannerR = 16;
    pg.drawSvgPath(`M 0 0 H ${W} V ${bannerH - bannerR} Q ${W} ${bannerH} ${W - bannerR} ${bannerH} H ${bannerR} Q 0 ${bannerH} 0 ${bannerH - bannerR} V 0 Z`, { x: 0, y: H, color: DARK });
    roundRect(pg, 16, H - 96 + 18, 6, 60, 3, { color: ACCENT });
    pg.drawText(company, { x: M, y: H - 50, size: 24, font: bold, color: rgb(1, 1, 1) });
    pg.drawText(LB.po, { x: M, y: H - 74, size: 12, font: reg, color: rgb(0.75, 0.75, 0.85) });
    const dateStr = new Date().toLocaleDateString("ru-RU");
    PRT(LB.from + " " + dateStr, W - M, H - 50, 12, reg, rgb(0.85, 0.85, 0.92));
  }
  function colHeader(bandTop) {
    const hw = tableR - tableX, hr = 8;
    pg.drawSvgPath(`M ${hr} 0 H ${hw - hr} Q ${hw} 0 ${hw} ${hr} V ${headH} H 0 V ${hr} Q 0 0 ${hr} 0 Z`, { x: tableX, y: bandTop, color: HEADBG });
    const hb = bandTop - 16;
    PT(LB.photo, cx.l + 8, hb, 10, bold, GREY); PT(LB.name, cx.name + 8, hb, 10, bold, GREY);
    PRT(LB.qty, cx.cost - padR, hb, 10, bold, GREY); PRT(LB.price, cx.sum - padR, hb, 10, bold, GREY); PRT(LB.sum, cx.r - padR, hb, 10, bold, GREY);
    hline(bandTop); hline(bandTop - headH);
  }

  banner();
  let y = H - 130;
  pg.drawText(LB.supplier + ": " + (supplier || "—"), { x: M, y, size: 12, font: bold, color: DARK }); y -= 26;

  let bandTop = y, cy = bandTop - headH;
  colHeader(bandTop);
  let total = 0;
  (items || []).forEach((it, i) => {
    if (cy - rowH < BOTTOM) { pg = doc.addPage([W, H]); banner(); bandTop = H - 130; colHeader(bandTop); cy = bandTop - headH; }
    const p = pmap[it.product_id] || { name: "?" };
    const cur = it.currency || currency;
    const sum = (Number(it.qty) || 0) * (Number(it.cost) || 0);
    total += sum;
    if (i % 2 === 1) pg.drawRectangle({ x: tableX, y: cy - rowH, width: tableR - tableX, height: rowH, color: ZEBRA });
    // фото
    const img = imgs[it.product_id];
    if (img) {
      const box = PHOTO; const dim = img.scale(1);
      const k = Math.min(box / dim.width, box / dim.height);
      const w = dim.width * k, h = dim.height * k;
      pg.drawImage(img, { x: cx.l + 8 + (box - w) / 2, y: cy - rowH + (rowH - h) / 2, width: w, height: h });
    } else {
      pg.drawRectangle({ x: cx.l + 8, y: cy - rowH + (rowH - PHOTO) / 2, width: PHOTO, height: PHOTO, color: rgb(0.95, 0.95, 0.97) });
    }
    const mid = cy - rowH / 2 - 4;
    let nm = String(p.name || "?"); if (nm.length > 40) nm = nm.slice(0, 39) + "…";
    PT(nm, cx.name + 8, mid, 10, reg);
    PRT(String(it.qty), cx.cost - padR, mid, 10, reg);
    PRT(money(it.cost, cur), cx.sum - padR, mid, 10, reg);
    PRT(money(sum, cur), cx.r - padR, mid, 10, bold);
    cy -= rowH; hline(cy);
  });
  [cx.l, cx.name, cx.qty, cx.cost, cx.sum, cx.r].forEach(x => pg.drawLine({ start: { x, y: bandTop - headH }, end: { x, y: cy }, thickness: 0.8, color: LINE }));

  // итог
  const boxH = 34, gap = 16;
  let boxY = cy - gap - boxH;
  if (boxY < BOTTOM) { pg = doc.addPage([W, H]); banner(); boxY = H - 130 - boxH; }
  roundRect(pg, cx.qty, boxY, cx.r - cx.qty, boxH, 10, { color: DARK });
  PT(LB.total + ":", cx.qty + 14, boxY + 11, 13, bold, WHITE);
  PRT(money(total, currency), cx.r - padR, boxY + 11, 13, bold, ACCENT);

  pg.drawText("Сформировано: " + new Date().toLocaleString("ru-RU") + " · " + company, { x: M, y: 40, size: 9, font: reg, color: GREY });
  return await doc.save();
}

// ---- Акт сверки взаиморасчётов (по каждой валюте, хронология, остаток) ----
export async function buildReconciliationPDF({ customer, sales, payments, company = "GENERAL MODERN" }) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const reg = await doc.embedFont(readFileSync(join(__dirname, "../fonts/NotoSans-Regular.ttf")));
  const bold = await doc.embedFont(readFileSync(join(__dirname, "../fonts/NotoSans-Bold.ttf")));

  const W = 595, H = 842, M = 45, R = W - M;
  const PAD = 7, ROW = 18, HEAD = 21, НИЗ = 132;
  const CURS = ["som", "yuan", "usd"];
  const ИМЯ_ВАЛЮТЫ = { som: "Расчёты в сумах", usd: "Расчёты в долларах", yuan: "Расчёты в юанях" };

  let pg, y;
  const ш = (s, size, f) => f.widthOfTextAtSize(String(s == null ? "" : s), size);
  const T = (s, x, yy, size, f = reg, c = DARK) => pg.drawText(String(s == null ? "" : s), { x, y: yy, size, font: f, color: c });
  const TR = (s, xr, yy, size, f = reg, c = DARK) => T(s, xr - ш(s, size, f), yy, size, f, c);
  const линия = (x1, yy, x2, толщ = 0.6, цвет = LINE) =>
    pg.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: толщ, color: цвет });

  // ------------------------------------------------------------------
  //  Собираем движения по всем валютам ЗАРАНЕЕ: ширина денежных колонок
  //  считается по самому длинному значению, а не задаётся числом на глаз.
  //  Накладная уже наступала на эти грабли — там «Цена» налезала на «Сумму».
  // ------------------------------------------------------------------
  const начальный = customer?.opening_debt || {};
  const разделы = [];
  for (const cur of CURS) {
    const события = [];
    (sales || []).forEach(s => {
      let сумма = 0;
      (s.items || []).forEach(it => {
        const c = it.currency || s.currency;
        if (c === cur) сумма += (Number(it.qty) || 0) * (Number(it.unit_price) || 0);
      });
      if (сумма > 0.0001) события.push({ date: s.date, type: "ship", amount: сумма });
    });
    (payments || []).forEach(p => {
      if ((p.currency || "som") === cur && (Number(p.amount) || 0) > 0.0001)
        события.push({ date: p.date, type: "pay", amount: Number(p.amount) });
    });
    const открытие = Number(начальный[cur]) || 0;
    if (!события.length && Math.abs(открытие) < (cur === "som" ? 1 : 0.01)) continue;
    события.sort((a, b) => new Date(a.date) - new Date(b.date));

    // прогоняем остаток заранее — заодно узнаём самые длинные строки
    let остаток = открытие;
    const строки = события.map(ev => {
      остаток += ev.type === "ship" ? ev.amount : -ev.amount;
      return {
        дата: new Date(ev.date).toLocaleDateString("ru-RU"),
        операция: ev.type === "ship" ? "Накладная" : "Оплата",
        отгружено: ev.type === "ship" ? money(ev.amount, cur) : "",
        оплачено: ev.type === "pay" ? money(ev.amount, cur) : "",
        остаток: money(остаток, cur),
      };
    });
    разделы.push({ cur, открытие, строки, итог: остаток });
  }

  const все = разделы.flatMap(р => р.строки);
  const макс = (тексты, минимум) => Math.max(минимум, ...тексты.map(t => ш(t, 9, bold)));
  const шДата = макс([...все.map(с => с.дата), "ДАТА"], 44) + PAD * 2;
  const шОтгр = макс([...все.map(с => с.отгружено), "ОТГРУЖЕНО"], 50) + PAD * 2;
  const шОпл = макс([...все.map(с => с.оплачено), "ОПЛАЧЕНО"], 50) + PAD * 2;
  const шОст = макс([...все.map(с => с.остаток), "ОСТАТОК"], 50) + PAD * 2;
  const шОпер = (R - M) - шДата - шОтгр - шОпл - шОст;

  const кол = {
    дата: M + PAD,
    операция: M + шДата + PAD,
    отгрR: M + шДата + шОпер + шОтгр - PAD,
    оплR: M + шДата + шОпер + шОтгр + шОпл - PAD,
    остR: R - PAD,
  };

  // ---------------- страницы ----------------
  function шапка() {
    T(company, M, H - 55, 15, bold);
    TR("от " + new Date().toLocaleDateString("ru-RU"), R, H - 55, 9.5, reg, GREY);
    T("Акт сверки взаиморасчётов", M, H - 69, 8.5, reg, GREY);
    линия(M, H - 81, R, 1.2, DARK);
    y = H - 81;
  }
  function новаяСтраница() { pg = doc.addPage([W, H]); шапка(); }
  function шапкаТаблицы() {
    const b = y - 14;
    T("ДАТА", кол.дата, b, 8, bold, GREY);
    T("ОПЕРАЦИЯ", кол.операция, b, 8, bold, GREY);
    TR("ОТГРУЖЕНО", кол.отгрR, b, 8, bold, GREY);
    TR("ОПЛАЧЕНО", кол.оплR, b, 8, bold, GREY);
    TR("ОСТАТОК", кол.остR, b, 8, bold, GREY);
    y -= HEAD;
    линия(M, y, R, 0.9, LINE);
  }

  новаяСтраница();

  y -= 26;
  T("Клиент:", M, y, 9, reg, GREY);
  T(customer?.name || "—", M + 52, y, 11, bold);
  TR("Период: за всё время", R, y, 9, reg, GREY);
  if (customer?.contact) {
    y -= 15;
    T("Телефон:", M, y, 9, reg, GREY);
    T(customer.contact, M + 52, y, 9.5);
  }
  y -= 24;

  // ---------------- разделы по валютам ----------------
  const итоги = {};
  for (const р of разделы) {
    if (y - (HEAD + ROW * 3 + 46) < НИЗ) { новаяСтраница(); y -= 20; }
    T(ИМЯ_ВАЛЮТЫ[р.cur], M, y - 2, 11, bold);
    TR("начальный долг: " + money(р.открытие, р.cur), R, y - 2, 9, reg, GREY);
    y -= 18;
    шапкаТаблицы();

    for (const с of р.строки) {
      if (y - ROW < НИЗ) { новаяСтраница(); y -= 20; шапкаТаблицы(); }
      const b = y - 12.5;
      T(с.дата, кол.дата, b, 9, reg, GREY);
      T(с.операция, кол.операция, b, 9);
      if (с.отгружено) TR(с.отгружено, кол.отгрR, b, 9);
      if (с.оплачено) TR(с.оплачено, кол.оплR, b, 9);
      TR(с.остаток, кол.остR, b, 9, bold);
      y -= ROW;
      линия(M, y, R, 0.4, rgb(0.90, 0.90, 0.91));
    }
    итоги[р.cur] = р.итог;
    y -= 24;
  }

  // ---------------- итог ----------------
  if (!разделы.length) {
    T("Движений по счёту нет.", M, y, 10, reg, GREY);
  } else {
    const части = CURS
      .filter(c => Math.abs(итоги[c] || 0) >= (c === "som" ? 1 : 0.01))
      .map(c => money(итоги[c], c));
    const строкаДолга = части.length ? части.join("  +  ") : money(0, "som");

    if (y - 40 < НИЗ) { новаяСтраница(); y -= 20; }
    y -= 6;
    TR("ОБЩИЙ ДОЛГ КЛИЕНТА", кол.остR - ш(строкаДолга, 14, bold) - 18, y, 10, bold, GREY);
    TR(строкаДолга, кол.остR, y, 14, bold);
    y -= 8;
    линия(Math.max(M, кол.остR - ш(строкаДолга, 14, bold) - 190), y, R, 1.2, DARK);
  }

  // ---------------- подписи и подвал ----------------
  // Акт подписывают обе стороны — место под это должно быть всегда внизу
  // листа, а не ехать следом за последней строкой таблицы.
  линия(M, 96, M + 190, 0.6, LINE);
  линия(R - 190, 96, R, 0.6, LINE);
  T("От поставщика", M, 84, 8.5, reg, GREY);
  TR("От покупателя", R, 84, 8.5, reg, GREY);

  линия(M, 60, R, 0.6, LINE);
  T(company, M, 44, 9, reg, GREY);
  TR(new Date().toLocaleString("ru-RU"), R, 44, 8.5, reg, rgb(0.62, 0.62, 0.64));

  return await doc.save();
}
