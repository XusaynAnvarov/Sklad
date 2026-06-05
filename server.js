/* ============================================================
   СКЛАД — сервер + Телеграм-бот (Render, версия 3: + Каталог в PDF)
   Переменные окружения на Render:
     BOT_TOKEN — токен бота от @BotFather (обязательно)
     API_KEY   — секретный ключ для приложения (например sklad)
   Команды бота:
     каталог / catalog / прайс  → присылает каталог товаров в PDF
     клиенты                    → список клиентов → накладная в PDF
     /dolg                      → список должников
   ============================================================ */
const http  = require("http");
const https = require("https");
const fs    = require("fs");
let PDFDocument = null;
try { PDFDocument = require("pdfkit"); } catch (e) { console.log("pdfkit не установлен — PDF недоступен, отправлю текстом."); }

const CONFIG = { botToken: process.env.BOT_TOKEN || "", apiKey: process.env.API_KEY || "sklad", port: process.env.PORT || 8787 };
const PUBLIC_URL = (process.env.RENDER_EXTERNAL_URL || process.env.SELF_URL || "").replace(/\/+$/, "");
if (!CONFIG.botToken) console.log("⚠️  Не задан BOT_TOKEN!");

// Чтобы случайная ошибка не «уронила» бота — логируем и продолжаем работать
process.on("uncaughtException", e => console.error("uncaughtException:", (e && e.message) || e));
process.on("unhandledRejection", e => console.error("unhandledRejection:", (e && e.message) || e));

let store = {
  lastUpdateId: 0, seq: 0, payments: [], chatId: null,
  debtorsText: "", clients: [], userState: {},
  catalog: { company: "", telegram: "", products: [] }   // ← каталог для бота
};

const HELP_TEXT =
  "🤖 Что я умею:\n\n" +
  "🛍 каталог — прислать каталог товаров в PDF (фото, наличие)\n" +
  "      (также: /catalog, прайс)\n" +
  "📂 категории — список категорий товаров\n" +
  "👥 клиенты — список клиентов (далее по номеру — накладная PDF)\n" +
  "💰 /dolg — список должников\n" +
  "🔗 ссылка — получить ссылку на веб-каталог\n" +
  "❓ помощь — показать это меню\n\n" +
  "Просто напишите слово команды.";

let FONT_PATH = null;
try {
  FONT_PATH = require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans.ttf");
  console.log("Шрифт DejaVuSans подключён ✓");
} catch (e) { console.log("Шрифт не найден, PDF будет латиницей/текстом:", e.message); }

/* ---------- разбор оплаты из текста ---------- */
function parsePayment(text) {
  if (!text) return null;
  let t = text.trim().replace(/оплатил[аи]?|оплата|töladi|to'ladi|tuladi/gi, " ");
  const m = t.match(/(-?\d[\d\s.,]*)/);
  if (!m) return null;
  const numRaw = m[1].replace(/\s/g, "").replace(/,/g, ".");
  let num = numRaw; const parts = numRaw.split(".");
  if (parts.length > 2) num = parts.slice(0, -1).join("") + "." + parts.slice(-1);
  const amount = Math.abs(parseFloat(num));
  if (!amount || isNaN(amount)) return null;
  let name = t.slice(0, m.index).replace(/[-—:．。]+\s*$/, "").trim();
  if (!name) return null;
  const rest = (t.slice(m.index + m[1].length) || "").toLowerCase();
  const cur = /\$|usd|долл|dollar/.test(rest) ? "USD" : "UZS";
  return { name, amount, cur };
}

/* ---------- Telegram API ---------- */
function tg(method, params) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(params || {});
    const req = https.request({ hostname: "api.telegram.org", path: "/bot" + CONFIG.botToken + "/" + method, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
      res => { let b = ""; res.on("data", c => b += c); res.on("end", () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } }); });
    req.on("error", reject); req.write(data); req.end();
  });
}
// отправка документа (PDF) через multipart
function tgSendDocument(chatId, buffer, filename, caption) {
  return new Promise((resolve, reject) => {
    const boundary = "----skladboundary" + Date.now();
    const pre = Buffer.from(
      "--" + boundary + "\r\nContent-Disposition: form-data; name=\"chat_id\"\r\n\r\n" + chatId + "\r\n" +
      (caption ? "--" + boundary + "\r\nContent-Disposition: form-data; name=\"caption\"\r\n\r\n" + caption + "\r\n" : "") +
      "--" + boundary + "\r\nContent-Disposition: form-data; name=\"document\"; filename=\"" + filename + "\"\r\nContent-Type: application/pdf\r\n\r\n", "utf8");
    const post = Buffer.from("\r\n--" + boundary + "--\r\n", "utf8");
    const body = Buffer.concat([pre, buffer, post]);
    const req = https.request({ hostname: "api.telegram.org", path: "/bot" + CONFIG.botToken + "/sendDocument", method: "POST",
      headers: { "Content-Type": "multipart/form-data; boundary=" + boundary, "Content-Length": body.length } },
      res => { let b = ""; res.on("data", c => b += c); res.on("end", () => { try { resolve(JSON.parse(b)); } catch (e) { resolve({ ok:false }); } }); });
    req.on("error", reject); req.write(body); req.end();
  });
}
function fmtMoney(n, cur) {
  const v = Math.round((+n || 0)).toLocaleString("ru-RU");
  if (cur === "USD") return "$" + v; if (cur === "CNY") return "¥" + v; return v + " сум";
}

/* ---------- генерация PDF накладной ---------- */
function buildInvoicePDF(inv) {
  return new Promise((resolve, reject) => {
    if (!PDFDocument) return reject(new Error("pdfkit недоступен"));
    try {
      const doc = new PDFDocument({ size: "A4", margin: 40 });
      const chunks = []; doc.on("data", c => chunks.push(c)); doc.on("end", () => resolve(Buffer.concat(chunks)));
      if (FONT_PATH) { try { doc.font(FONT_PATH); } catch (e) {} }
      doc.fontSize(18).text(sanitizeForFont(inv.title) || "НАКЛАДНАЯ", { align: "center" });
      doc.moveDown(0.3).fontSize(10).text("от " + (inv.date || ""), { align: "center" });
      doc.moveDown(0.8).fontSize(11);
      doc.text("Поставщик: " + (sanitizeForFont(inv.supplier) || "____________"));
      doc.text("Покупатель: " + sanitizeForFont(inv.client) + (inv.phone ? ", тел. " + sanitizeForFont(inv.phone) : ""));
      doc.moveDown(0.6);
      const startX = 40; let y = doc.y;
      const cols = [30, 230, 60, 45, 75, 75]; const heads = ["№", "Наименование", "Кол-во", "Ед.", "Цена", "Сумма"];
      doc.fontSize(9);
      let x = startX; heads.forEach((h, i) => { doc.text(h, x + 2, y, { width: cols[i] - 4 }); x += cols[i]; });
      y += 16; doc.moveTo(startX, y - 3).lineTo(startX + cols.reduce((a, b) => a + b, 0), y - 3).stroke();
      (inv.items || []).forEach(it => {
        x = startX; const cells = [it.n, sanitizeForFont(it.name), it.qty, it.unit, fmtMoney(it.price, it.cur), fmtMoney(it.sum, it.cur)];
        const h = Math.max(14, Math.ceil(String(sanitizeForFont(it.name)).length / 38) * 12);
        cells.forEach((c, i) => { doc.text(String(c), x + 2, y, { width: cols[i] - 4 }); x += cols[i]; });
        y += h; if (y > 760) { doc.addPage(); y = 40; }
      });
      doc.moveTo(startX, y).lineTo(startX + cols.reduce((a, b) => a + b, 0), y).stroke();
      y += 8; doc.fontSize(11).text("ИТОГО: " + (inv.total || ""), startX, y, { align: "right" });
      doc.moveDown(3); doc.fontSize(10).text("Отпустил ______________            Получил ______________");
      doc.end();
    } catch (e) { reject(e); }
  });
}
async function sendInvoice(chatId, inv) {
  try {
    if (PDFDocument && FONT_PATH) {
      const pdf = await buildInvoicePDF(inv);
      const r = await tgSendDocument(chatId, pdf, "nakladnaya_" + (inv.date || "") + ".pdf", "🧾 Накладная — " + inv.client + " (" + inv.date + ")");
      if (r && r.ok) return;
    }
  } catch (e) { console.log("PDF error:", e.message); }
  let msg = "🧾 НАКЛАДНАЯ от " + inv.date + "\nПокупатель: " + inv.client + "\n\n";
  (inv.items || []).forEach(it => { msg += it.n + ". " + it.name + " — " + it.qty + " " + it.unit + " × " + fmtMoney(it.price, it.cur) + " = " + fmtMoney(it.sum, it.cur) + "\n"; });
  msg += "\nИТОГО: " + inv.total;
  await tg("sendMessage", { chat_id: chatId, text: msg });
}

/* ---------- генерация PDF каталога ---------- */
// Убираем символы, которых нет в шрифте (иероглифы, эмодзи и т.п.),
// чтобы в PDF не появлялись пустые квадраты / «вопросики».
function sanitizeForFont(s) {
  if (s == null) return "";
  s = String(s).replace(/[\u200D\uFE0E\uFE0F]/g, "");
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0);
    const ok =
      c < 0x250 ||                         // лат., Latin-1, Latin Ext-A (½ × ° и т.д.)
      (c >= 0x2B0 && c <= 0x36F) ||        // модификаторы (узб. oʻ gʻ) + комбинируемые
      (c >= 0x400 && c <= 0x4FF) ||        // кириллица
      (c >= 0x2010 && c <= 0x205F) ||      // тире, кавычки, • …
      (c >= 0x20A0 && c <= 0x20BF) ||      // валюты
      c === 0x2116 || c === 0x2122 ||      // № ™
      (c >= 0x2150 && c <= 0x218F) ||      // дроби
      c === 0x2713 ||                      // ✓
      (c >= 0x25A0 && c <= 0x25FF);        // ◀ ▶ ■ …
    if (ok) out += ch;
  }
  return out.replace(/\s{2,}/g, " ").trim();
}
function clip(s, n) { s = sanitizeForFont(s); return s.length > n ? s.slice(0, n - 1) + "…" : s; }

function buildCatalogPDF(cat) {
  return new Promise((resolve, reject) => {
    if (!PDFDocument) return reject(new Error("pdfkit недоступен"));
    try {
      const doc = new PDFDocument({ size: "A4", margin: 40 });
      const chunks = []; doc.on("data", c => chunks.push(c)); doc.on("end", () => resolve(Buffer.concat(chunks)));
      const setFont = () => { if (FONT_PATH) { try { doc.font(FONT_PATH); } catch (e) {} } };
      setFont();
      const GOLD = "#b8860b", X0 = 40, RIGHT = 555, BOTTOM = 800;
      const COLW = 165, GAP = 11, IMGH = 92, CELLH = 150, ROWGAP = 12;

      const company = cat.company || "Каталог";
      const today = new Date().toLocaleDateString("ru-RU");
      doc.fillColor(GOLD).fontSize(22).text(clip(company, 40), X0, 40);
      doc.fillColor("#777777").fontSize(10).text("Каталог · " + today + (cat.telegram ? " · " + cat.telegram : ""), X0, doc.y + 2);
      let y = doc.y + 6;
      doc.moveTo(X0, y).lineTo(RIGHT, y).lineWidth(2).strokeColor("#d8a02b").stroke();
      y += 16;

      const groups = {};
      (cat.products || []).forEach(p => { const k = (p.category || "Без категории"); (groups[k] = groups[k] || []).push(p); });
      const names = Object.keys(groups).sort((a, b) => a.localeCompare(b, "ru"));

      for (const cn of names) {
        const items = groups[cn];
        if (y + 30 > BOTTOM) { doc.addPage(); setFont(); y = 40; }
        setFont();
        doc.fillColor(GOLD).fontSize(14).text(clip(cn, 40) + "  (" + items.length + ")", X0, y);
        y = doc.y + 2;
        doc.moveTo(X0, y).lineTo(RIGHT, y).lineWidth(0.5).strokeColor("#e2c98a").stroke();
        y += 8;
        for (let i = 0; i < items.length; i += 3) {
          if (y + CELLH > BOTTOM) { doc.addPage(); setFont(); y = 40; }
          const row = items.slice(i, i + 3);
          for (let j = 0; j < row.length; j++) {
            drawCatalogCell(doc, row[j], X0 + j * (COLW + GAP), y, COLW, IMGH, CELLH, setFont, GOLD);
          }
          y += CELLH + ROWGAP;
        }
      }
      doc.end();
    } catch (e) { reject(e); }
  });
}
function drawCatalogCell(doc, p, x, y, w, imgh, cellh, setFont, GOLD) {
  doc.lineWidth(0.5).strokeColor("#dddddd").rect(x, y, w, cellh).stroke();
  let drew = false;
  const photo = p.photo || "";
  if (typeof photo === "string" && photo.indexOf("base64,") > -1) {
    try {
      const buf = Buffer.from(photo.split("base64,")[1], "base64");
      doc.image(buf, x + 4, y + 4, { fit: [w - 8, imgh], align: "center", valign: "center" });
      drew = true;
    } catch (e) { drew = false; }
  }
  if (!drew) {
    setFont(); doc.fillColor("#cccccc").fontSize(26).text("—", x, y + imgh / 2 - 8, { width: w, align: "center" });
  }
  setFont();
  doc.fillColor("#1d2129").fontSize(9).text(clip(p.name, 64), x + 5, y + imgh + 8, { width: w - 10, height: 24, ellipsis: true });
  const inStock = !!p.inStock;
  doc.fillColor(inStock ? "#3c8c1e" : "#b5701a").fontSize(9.5);
  doc.text(inStock ? "✓ В наличии" : "Под заказ", x + 5, y + cellh - 15, { width: w - 10, lineBreak: false });
}
async function buildAndSendCatalog(chatId) {
  const cat = store.catalog || { products: [] };
  if (!cat.products || !cat.products.length) return { ok: false, reason: "empty" };
  try {
    if (PDFDocument && FONT_PATH) {
      const pdf = await buildCatalogPDF(cat);
      const r = await tgSendDocument(chatId, pdf, "catalog.pdf", "🛍 Каталог — " + (cat.company || ""));
      if (r && r.ok) return { ok: true };
    }
  } catch (e) { console.log("Catalog PDF error:", e.message); }
  // запасной вариант — текстовый список
  let msg = "🛍 КАТАЛОГ — " + (cat.company || "") + "\n\n";
  const groups = {};
  cat.products.forEach(p => { const k = (p.category || "Без категории"); (groups[k] = groups[k] || []).push(p); });
  Object.keys(groups).sort((a, b) => a.localeCompare(b, "ru")).forEach(cn => {
    msg += "▪ " + cn + "\n";
    groups[cn].forEach(p => { msg += "  • " + p.name + (p.inStock ? " — ✓ в наличии" : " — под заказ") + "\n"; });
    msg += "\n";
  });
  if (msg.length > 3900) msg = msg.slice(0, 3900) + "…";
  await tg("sendMessage", { chat_id: chatId, text: msg });
  return { ok: true, text: true };
}
async function sendCatalog(chatId) {
  const cat = store.catalog || { products: [] };
  if (!cat.products || !cat.products.length) {
    await tg("sendMessage", { chat_id: chatId, text: "Каталог ещё не загружен. В приложении: «🛍 Каталог» → «🤖 Отправить каталог боту».", reply_markup: kbMenuOnly() });
    return;
  }
  await tg("sendMessage", { chat_id: chatId, text: "Готовлю каталог в PDF… ⏳" });
  await buildAndSendCatalog(chatId);
  if (PUBLIC_URL) {
    await tg("sendMessage", { chat_id: chatId, text: "🔎 Чтобы листать с крупными фото (нажми на фото — откроется на весь экран):", reply_markup: { inline_keyboard: catalogLinkRow() } });
  }
}

/* ---------- меню с кнопками (нажал → прошлое сообщение заменяется) ---------- */
const PAGE_SIZE = 8;
function kbMenuOnly() { return { inline_keyboard: [[{ text: "🏠 Меню", callback_data: "menu" }]] }; }
function mainMenu() {
  return { text: "🤖 Главное меню\nВыберите действие:", reply_markup: { inline_keyboard: [
    ...catalogLinkRow(),
    [{ text: "🛍 Каталог (PDF)", callback_data: "catalog" }],
    [{ text: "📂 Категории", callback_data: "cats" }, { text: "👥 Клиенты", callback_data: "clp:0" }],
    [{ text: "💰 Должники", callback_data: "dolg" }],
    [{ text: "🔗 Ссылка на каталог", callback_data: "link" }, { text: "❓ Команды", callback_data: "help" }]
  ] } };
}
function catsView() {
  const prods = (store.catalog && store.catalog.products) || [];
  if (!prods.length) return { text: "Каталог ещё не загружен. В приложении нажмите «🤖 Отправить каталог боту».", reply_markup: kbMenuOnly() };
  const cnt = {}; prods.forEach(p => { const k = p.category || "Без категории"; cnt[k] = (cnt[k] || 0) + 1; });
  let text = "📂 Категории в каталоге:\n\n";
  Object.keys(cnt).sort((a, b) => a.localeCompare(b, "ru")).forEach(k => { text += "• " + k + " (" + cnt[k] + ")\n"; });
  return { text, reply_markup: { inline_keyboard: [[{ text: "🛍 Каталог в PDF", callback_data: "catalog" }], [{ text: "🏠 Меню", callback_data: "menu" }]] } };
}
function clientsPage(page) {
  const cs = store.clients || [];
  if (!cs.length) return { text: "Список клиентов пуст. Откройте приложение с включённой синхронизацией.", reply_markup: kbMenuOnly() };
  const pages = Math.max(1, Math.ceil(cs.length / PAGE_SIZE));
  page = Math.max(0, Math.min(page, pages - 1));
  const rows = [];
  cs.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE).forEach((c, i) => {
    const idx = page * PAGE_SIZE + i; rows.push([{ text: c.name, callback_data: "c:" + idx }]);
  });
  const nav = [];
  if (page > 0) nav.push({ text: "◀", callback_data: "clp:" + (page - 1) });
  nav.push({ text: (page + 1) + "/" + pages, callback_data: "noop" });
  if (page < pages - 1) nav.push({ text: "▶", callback_data: "clp:" + (page + 1) });
  rows.push(nav);
  rows.push([{ text: "🏠 Меню", callback_data: "menu" }]);
  return { text: "👥 Клиенты (" + cs.length + ") — выберите:", reply_markup: { inline_keyboard: rows } };
}
function clientCard(idx) {
  const c = (store.clients || [])[idx];
  if (!c) return { text: "Клиент не найден.", reply_markup: { inline_keyboard: [[{ text: "⬅️ К списку", callback_data: "clp:0" }]] } };
  let text = "👤 " + c.name + "\n💰 Долг: " + (c.debt != null ? c.debt : "—") + "\n📊 Оборот: " + (c.turnover != null ? c.turnover : "—") + "\n\n";
  const rows = []; const orders = c.orders || [];
  if (orders.length) { text += "📦 Заказы — нажмите для накладной в PDF:"; orders.forEach((o, i) => { rows.push([{ text: "🧾 " + o.date + " — " + o.total, callback_data: "o:" + idx + ":" + i }]); }); }
  else text += "Заказов нет.";
  rows.push([{ text: "⬅️ К списку", callback_data: "clp:0" }, { text: "🏠 Меню", callback_data: "menu" }]);
  return { text, reply_markup: { inline_keyboard: rows } };
}
async function handleCallback(cq) {
  const data = cq.data || ""; const chatId = cq.message.chat.id; const mid = cq.message.message_id;
  try { await tg("answerCallbackQuery", { callback_query_id: cq.id }); } catch (e) {}
  const edit = (o) => tg("editMessageText", { chat_id: chatId, message_id: mid, text: o.text, reply_markup: o.reply_markup });
  try {
    if (data === "noop") return;
    if (data === "menu") return edit(mainMenu());
    if (data === "help") return edit({ text: HELP_TEXT, reply_markup: kbMenuOnly() });
    if (data === "cats") return edit(catsView());
    if (data === "dolg") return edit({ text: store.debtorsText || "Список должников ещё не получен.", reply_markup: kbMenuOnly() });
    if (data === "link") {
      if (!PUBLIC_URL) return edit({ text: "Ссылка появится после запуска на хостинге (Render).", reply_markup: kbMenuOnly() });
      return edit({ text: "🔗 Ссылка на ваш каталог (нажмите и удерживайте, чтобы скопировать):\n\n" + PUBLIC_URL + "/catalog" + "\n\nОтправьте её клиентам или сделайте QR-код. Каталог всегда показывает последние данные.",
        reply_markup: { inline_keyboard: [ ...catalogLinkRow(), [{ text: "🏠 Меню", callback_data: "menu" }] ] } });
    }
    if (data === "catalog") {
      await edit({ text: "🛍 Отправляю каталог…", reply_markup: kbMenuOnly() });
      const r = await buildAndSendCatalog(chatId);
      if (!r.ok && r.reason === "empty")
        return edit({ text: "Каталог ещё не загружен. В приложении нажмите «🤖 Отправить каталог боту».", reply_markup: kbMenuOnly() });
      return edit({ text: "🛍 Каталог отправлен ⬆️", reply_markup: { inline_keyboard: [ ...catalogLinkRow(), [{ text: "🔄 Ещё раз", callback_data: "catalog" }, { text: "🏠 Меню", callback_data: "menu" }] ] } });
    }
    if (data.indexOf("clp:") === 0) return edit(clientsPage(+data.slice(4) || 0));
    if (data.indexOf("c:") === 0) return edit(clientCard(+data.slice(2)));
    if (data.indexOf("o:") === 0) {
      const parts = data.split(":"); const ci = +parts[1], oi = +parts[2];
      const c = (store.clients || [])[ci]; const o = c && (c.orders || [])[oi];
      if (!o) return edit({ text: "Заказ не найден.", reply_markup: kbMenuOnly() });
      await edit({ text: "🧾 Готовлю накладную " + o.date + "…", reply_markup: { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "c:" + ci }]] } });
      const inv = { title: "ТОВАРНАЯ НАКЛАДНАЯ", date: o.date, supplier: c.supplier || "", client: c.name, phone: c.phone || "", items: o.items, total: o.total };
      await sendInvoice(chatId, inv);
      return edit({ text: "🧾 Накладная " + o.date + " отправлена ⬆️", reply_markup: { inline_keyboard: [[{ text: "⬅️ К клиенту", callback_data: "c:" + ci }, { text: "🏠 Меню", callback_data: "menu" }]] } });
    }
  } catch (e) { console.log("callback:", e.message); }
}

/* ---------- работа с командами бота ---------- */
async function handleCommand(chatId, text) {
  const low = (text || "").trim().toLowerCase();

  if (/^\/?(start|старт|help|помощь|команды|теги|меню|menu|\?)$/i.test(low)) {
    const m = mainMenu();
    await tg("sendMessage", { chat_id: chatId, text: m.text, reply_markup: m.reply_markup });
    return;
  }
  if (/^\/?(каталог|katalog|catalog|прайс|price|narx)$/i.test(low)) {
    await sendCatalog(chatId); return;
  }
  if (/^\/?(категории|категория|categories|kategoriya|kategorii)$/i.test(low)) {
    const v = catsView(); await tg("sendMessage", { chat_id: chatId, text: v.text, reply_markup: v.reply_markup }); return;
  }
  if (/^\/?(клиенты|clients|mijozlar)$/i.test(low)) {
    const v = clientsPage(0); await tg("sendMessage", { chat_id: chatId, text: v.text, reply_markup: v.reply_markup }); return;
  }
  if (/^\/(dolg|debt|долг|должники)/i.test(low)) {
    await tg("sendMessage", { chat_id: chatId, text: store.debtorsText || "Список должников ещё не получен.", reply_markup: kbMenuOnly() }); return;
  }
  if (/^\/?(ссылка|ссылку|link|поделиться|share|ссылки)$/i.test(low)) {
    await sendCatalogLink(chatId); return;
  }
}
async function sendCatalogLink(chatId) {
  if (!PUBLIC_URL) {
    await tg("sendMessage", { chat_id: chatId, text: "Ссылка появится после запуска на хостинге (Render). Адрес каталога — это адрес вашего сервиса + /catalog.", reply_markup: kbMenuOnly() });
    return;
  }
  const link = PUBLIC_URL + "/catalog";
  await tg("sendMessage", { chat_id: chatId, text:
    "🔗 Ссылка на ваш каталог (нажмите и удерживайте, чтобы скопировать):\n\n" + link +
    "\n\nОтправьте её клиентам в Телеграм/WhatsApp, поставьте в описание канала или сделайте из неё QR-код. Каталог по ссылке всегда показывает то, что вы последним отправили боту.",
    reply_markup: { inline_keyboard: [ ...catalogLinkRow(), [{ text: "🏠 Меню", callback_data: "menu" }] ] } });
}

/* ---------- polling ---------- */
async function poll() {
  if (!CONFIG.botToken) { setTimeout(poll, 5000); return; }
  try {
    const res = await tg("getUpdates", { offset: store.lastUpdateId + 1, timeout: 30, allowed_updates: ["message", "channel_post", "callback_query"] });
    if (res && res.ok && res.result.length) {
      for (const upd of res.result) {
        store.lastUpdateId = upd.update_id;
        if (upd.callback_query) { await handleCallback(upd.callback_query); continue; }
        const msg = upd.channel_post || upd.message;
        if (!msg || !msg.text) continue;
        const chatId = msg.chat.id;
        if (msg.chat.type === "channel" || msg.chat.type === "supergroup" || msg.chat.type === "group") store.chatId = chatId;
        const p = parsePayment(msg.text);
        if (p && msg.chat.type !== "private") {
          store.seq += 1;
          store.payments.push({ id: store.seq, name: p.name, amount: p.amount, cur: p.cur, date: new Date(msg.date * 1000).toISOString().slice(0, 10), raw: msg.text, ts: Date.now() });
          console.log("💰 " + p.name + " — " + p.amount + " " + p.cur);
        }
        await handleCommand(chatId, msg.text);
      }
    }
  } catch (e) { console.error("poll:", e.message); }
  setTimeout(poll, 1000);
}

/* ---------- HTTP API ---------- */
function cors(res){ res.setHeader("Access-Control-Allow-Origin","*"); res.setHeader("Access-Control-Allow-Methods","GET, POST, OPTIONS"); res.setHeader("Access-Control-Allow-Headers","Content-Type, X-Api-Key"); }
function readBody(req){ return new Promise(r=>{ let b=""; req.on("data",c=>b+=c); req.on("end",()=>r(b)); }); }

/* ---------- ВЕБ-КАТАЛОГ (страница с фото; тап по фото — на весь экран, тап ещё раз — назад) ---------- */
function esc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"); }
function catalogHTML(cat){
  const company = esc(cat.company || "Каталог");
  const tg = (cat.telegram || "").trim();
  const tgHref = tg ? (/^https?:\/\//i.test(tg) ? tg : "https://t.me/" + tg.replace(/^@/,"")) : "";
  const groups = {};
  (cat.products || []).forEach(p => { const k = p.category || "Без категории"; (groups[k] = groups[k] || []).push(p); });
  const names = Object.keys(groups).sort((a,b)=>a.localeCompare(b,"ru"));
  let cards = "";
  names.forEach(cn => {
    cards += '<h2 class="cathead" data-cat="'+esc(cn)+'">'+esc(cn)+' <span>('+groups[cn].length+')</span></h2><div class="grid">';
    groups[cn].forEach(p => {
      const img = p.photo ? '<div class="imgwrap"><img loading="lazy" src="'+p.photo+'" alt=""></div>' : '<div class="imgwrap"><span class="noimg">📦</span></div>';
      const badge = p.inStock ? '<span class="badge yes">✓ В наличии</span>' : '<span class="badge no">Под заказ</span>';
      const desc = p.desc ? '<div class="desc">'+esc(p.desc)+'</div>' : "";
      cards += '<div class="card" data-name="'+esc((p.name||"").toLowerCase())+'" data-cat="'+esc(cn)+'">'+img+'<div class="cbody"><div class="cname">'+esc(p.name)+'</div>'+desc+badge+'</div></div>';
    });
    cards += '</div>';
  });
  const opt = names.map(c => '<option value="'+esc(c)+'">'+esc(c)+'</option>').join("");
  const date = new Date().toLocaleDateString("ru-RU");
  const contact = tgHref ? '<a class="tg" href="'+esc(tgHref)+'" target="_blank">📲 Написать</a>' : "";
  const empty = names.length ? "" : '<div class="empty">Каталог пока пуст.</div>';
  const close = "<"+"/script>";
  return '<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">'
   +'<title>'+company+' — Каталог</title><style>'
   +':root{--bg:#f3f4f6;--card:#fff;--line:#e4e6eb;--ink:#1d2129;--muted:#8a8d91;--gold:#c8881f;--gold2:#a96f12}'
   +'*{box-sizing:border-box;margin:0;padding:0}html{-webkit-text-size-adjust:100%}'
   +'body{font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif;background:var(--bg);color:var(--ink);line-height:1.4;padding-bottom:40px;-webkit-font-smoothing:antialiased}'
   +'header{position:sticky;top:0;z-index:5;background:#fff;border-bottom:1px solid var(--line);padding:12px 14px;box-shadow:0 2px 10px rgba(0,0,0,.05)}'
   +'.htop{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;max-width:1100px;margin:0 auto}'
   +'.brand{font-size:20px;font-weight:800;color:var(--gold)}.brand small{display:block;font-size:10.5px;font-weight:600;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-top:2px}'
   +'.tg{background:#229ED9;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 16px;border-radius:10px;white-space:nowrap}'
   +'.controls{max-width:1100px;margin:10px auto 0;display:flex;gap:8px;flex-wrap:wrap}'
   +'.controls input,.controls select{flex:1;min-width:140px;padding:13px 14px;border:1px solid #d5d8dd;border-radius:11px;font-size:16px;background:#fff;color:var(--ink);-webkit-appearance:none}'
   +'main{max-width:1100px;margin:0 auto;padding:16px 14px 0}'
   +'.cathead{font-size:16px;font-weight:800;color:var(--gold2);margin:22px 0 10px;padding-bottom:7px;border-bottom:2px solid var(--gold);display:flex;gap:8px;align-items:baseline}'
   +'.cathead span{font-size:12.5px;font-weight:600;color:var(--muted)}'
   +'.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}'
   +'.card{background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 1px 4px rgba(0,0,0,.05)}'
   +'.imgwrap{aspect-ratio:1/1;background:#fff;display:grid;place-items:center;overflow:hidden;padding:8px;cursor:zoom-in}'
   +'.imgwrap img{max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;display:block}'
   +'.imgwrap .noimg{font-size:42px;opacity:.35}'
   +'.cbody{padding:10px 11px 12px;display:flex;flex-direction:column;gap:7px;flex:1}'
   +'.cname{font-size:13.5px;font-weight:600;color:var(--ink);line-height:1.3}.desc{font-size:11.5px;color:var(--muted)}'
   +'.badge{align-self:flex-start;font-size:11px;font-weight:700;padding:3px 9px;border-radius:20px;margin-top:auto}'
   +'.badge.yes{background:#e3f3da;color:#3c8c1e}.badge.no{background:#fdeede;color:#b5701a}'
   +'.foot{max-width:1100px;margin:26px auto 0;padding:18px 16px;text-align:center;color:var(--muted);font-size:12px}'
   +'.lb{position:fixed;inset:0;background:rgba(0,0,0,.92);display:none;place-items:center;z-index:50;padding:12px}'
   +'.lb.show{display:grid}.lb img{max-width:100%;max-height:100%;border-radius:10px}'
   +'.empty{text-align:center;color:var(--muted);padding:40px}'
   +'@media(max-width:520px){.brand{font-size:18px}main{padding:12px 10px 0}.grid{gap:10px}}'
   +'</style></head><body>'
   +'<header><div class="htop"><div class="brand">'+company+'<small>Каталог · '+date+'</small></div>'+contact+'</div>'
   +'<div class="controls"><input id="q" placeholder="🔍 Поиск по названию…"><select id="cat"><option value="">Все категории</option>'+opt+'</select></div></header>'
   +'<main>'+cards+empty+'<div class="empty" id="nores" style="display:none">Ничего не найдено.</div></main>'
   +'<div class="foot">'+company+' · Наличие уточняйте при заказе.'+(tg?' · '+esc(tg):'')+'</div>'
   +'<div class="lb" id="lb"><img id="lbi" alt=""></div>'
   +'<script>'
   +'var lb=document.getElementById("lb"),lbi=document.getElementById("lbi");'
   +'document.querySelectorAll(".imgwrap img").forEach(function(im){im.onclick=function(){lbi.src=im.src;lb.classList.add("show");};});'
   +'lb.onclick=function(){lb.classList.remove("show");lbi.src="";};'
   +'function flt(){var q=(document.getElementById("q").value||"").trim().toLowerCase();var c=document.getElementById("cat").value;var any=false;'
   +'document.querySelectorAll(".card").forEach(function(card){var ok=(!q||card.dataset.name.indexOf(q)>-1)&&(!c||card.dataset.cat===c);card.style.display=ok?"":"none";if(ok)any=true;});'
   +'document.querySelectorAll(".cathead").forEach(function(h){var cat=h.dataset.cat;var vis=Array.prototype.some.call(document.querySelectorAll(\'.card[data-cat="\'+CSS.escape(cat)+\'"]\'),function(c){return c.style.display!=="none";});h.style.display=vis?"":"none";var g=h.nextElementSibling;if(g)g.style.display=vis?"":"none";});'
   +'var nr=document.getElementById("nores");if(nr)nr.style.display=any?"none":"block";}'
   +'var qi=document.getElementById("q");if(qi)qi.addEventListener("input",flt);var ci=document.getElementById("cat");if(ci)ci.addEventListener("change",flt);'
   +close+'</body></html>';
}
function catalogLinkRow(){ return PUBLIC_URL ? [[{ text: "🌐 Открыть каталог (фото крупно)", url: PUBLIC_URL + "/catalog" }]] : []; }

const server = http.createServer(async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  const url = new URL(req.url, "http://localhost");
  const isHealth = (url.pathname === "/" || url.pathname === "/health" || url.pathname === "/api/health");
  const isCatalogPage = (url.pathname === "/catalog" || url.pathname === "/katalog");
  if (CONFIG.apiKey && !isHealth && !isCatalogPage) {
    const key = req.headers["x-api-key"] || url.searchParams.get("key");
    if (key !== CONFIG.apiKey) { res.writeHead(401); res.end(JSON.stringify({ error: "bad key" })); return; }
  }
  if (isCatalogPage && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(catalogHTML(store.catalog || { products: [] }));
    return;
  }
  if (isHealth) {
    res.writeHead(200, {"Content-Type":"application/json"});
    res.end(JSON.stringify({ ok:true, hasToken:!!CONFIG.botToken, pdf:!!(PDFDocument && FONT_PATH), chatId:store.chatId, clients:store.clients.length, catalog:(store.catalog.products||[]).length }));
    return;
  }
  if ((url.pathname === "/payments" || url.pathname === "/api/payments") && req.method === "GET") {
    const since = +url.searchParams.get("since") || 0;
    res.writeHead(200, {"Content-Type":"application/json"}); res.end(JSON.stringify(store.payments.filter(p => (p.ts||0) > since))); return;
  }
  if (url.pathname === "/set-debtors" && req.method === "POST") {
    const b = await readBody(req); try { store.debtorsText = (JSON.parse(b||"{}").text)||""; } catch(e){}
    res.writeHead(200); res.end(JSON.stringify({ ok:true })); return;
  }
  if (url.pathname === "/set-clients" && req.method === "POST") {
    const b = await readBody(req); try { store.clients = (JSON.parse(b||"{}").clients)||[]; } catch(e){}
    res.writeHead(200); res.end(JSON.stringify({ ok:true, count: store.clients.length })); return;
  }
  if (url.pathname === "/set-catalog" && req.method === "POST") {
    const b = await readBody(req);
    try { const d = JSON.parse(b || "{}");
      store.catalog = { company: d.company || "", telegram: d.telegram || "", products: Array.isArray(d.products) ? d.products : [] };
    } catch (e) {}
    res.writeHead(200); res.end(JSON.stringify({ ok:true, count: (store.catalog.products||[]).length })); return;
  }
  if ((url.pathname === "/post-debtors" || url.pathname === "/api/post-debtors") && req.method === "POST") {
    const b = await readBody(req);
    try { const { text } = JSON.parse(b || "{}"); store.debtorsText = text || "";
      if (!store.chatId) { res.writeHead(400); res.end(JSON.stringify({ error:"Канал не определён. Напишите сообщение в канал." })); return; }
      const r = await tg("sendMessage", { chat_id: store.chatId, text: text || "Список пуст" });
      res.writeHead(200); res.end(JSON.stringify({ ok: !!(r && r.ok) }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    return;
  }
  if (url.pathname === "/send-invoice" && req.method === "POST") {
    const b = await readBody(req);
    try { const inv = JSON.parse(b || "{}");
      if (!store.chatId) { res.writeHead(400); res.end(JSON.stringify({ error:"Канал не определён. Напишите сообщение в канал." })); return; }
      await sendInvoice(store.chatId, inv); res.writeHead(200); res.end(JSON.stringify({ ok:true }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    return;
  }
  // отправить каталог в Телеграм прямо из приложения (необязательно)
  if (url.pathname === "/post-catalog" && req.method === "POST") {
    try {
      if (!store.chatId) { res.writeHead(400); res.end(JSON.stringify({ error:"Канал не определён. Напишите сообщение боту/в канал." })); return; }
      await sendCatalog(store.chatId);
      res.writeHead(200); res.end(JSON.stringify({ ok:true }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    return;
  }
  res.writeHead(404); res.end(JSON.stringify({ error:"not found" }));
});
server.listen(CONFIG.port, () => {
  console.log("✅ Сервер на порту " + CONFIG.port + ", токен " + (CONFIG.botToken?"✓":"✗"));
  if (CONFIG.botToken) {
    tg("setMyCommands", { commands: [
      { command: "catalog",    description: "🛍 Каталог товаров в PDF" },
      { command: "kategorii",  description: "📂 Категории товаров" },
      { command: "clients",    description: "👥 Список клиентов" },
      { command: "dolg",       description: "💰 Должники" },
      { command: "help",       description: "❓ Что умеет бот" }
    ]}).catch(function(){});
  }
  poll();

  // Самопинг: не даём бесплатному Render «засыпать» (пинг себя раз в 10 мин)
  const SELF_URL = (process.env.RENDER_EXTERNAL_URL || process.env.SELF_URL || "").replace(/\/+$/, "");
  if (SELF_URL) {
    console.log("Keep-alive самопинг включён: " + SELF_URL + "/health");
    setInterval(() => {
      try { https.get(SELF_URL + "/health", r => r.resume()).on("error", () => {}); } catch (e) {}
    }, 10 * 60 * 1000);
  }
});
