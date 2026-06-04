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
if (!CONFIG.botToken) console.log("⚠️  Не задан BOT_TOKEN!");

let store = {
  lastUpdateId: 0, seq: 0, payments: [], chatId: null,
  debtorsText: "", clients: [], userState: {},
  catalog: { company: "", telegram: "", products: [] }   // ← каталог для бота
};

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
      doc.fontSize(18).text(inv.title || "НАКЛАДНАЯ", { align: "center" });
      doc.moveDown(0.3).fontSize(10).text("от " + (inv.date || ""), { align: "center" });
      doc.moveDown(0.8).fontSize(11);
      doc.text("Поставщик: " + (inv.supplier || "____________"));
      doc.text("Покупатель: " + (inv.client || "") + (inv.phone ? ", тел. " + inv.phone : ""));
      doc.moveDown(0.6);
      const startX = 40; let y = doc.y;
      const cols = [30, 230, 60, 45, 75, 75]; const heads = ["№", "Наименование", "Кол-во", "Ед.", "Цена", "Сумма"];
      doc.fontSize(9);
      let x = startX; heads.forEach((h, i) => { doc.text(h, x + 2, y, { width: cols[i] - 4 }); x += cols[i]; });
      y += 16; doc.moveTo(startX, y - 3).lineTo(startX + cols.reduce((a, b) => a + b, 0), y - 3).stroke();
      (inv.items || []).forEach(it => {
        x = startX; const cells = [it.n, it.name, it.qty, it.unit, fmtMoney(it.price, it.cur), fmtMoney(it.sum, it.cur)];
        const h = Math.max(14, Math.ceil(String(it.name).length / 38) * 12);
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
function clip(s, n) { s = (s == null ? "" : String(s)).trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; }

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
  doc.fillColor("#1d2129").fontSize(9).text(clip(p.name, 64), x + 5, y + imgh + 8, { width: w - 10, height: 26, ellipsis: true });
  const pr = p.priceLabel || "Цена по запросу";
  if (p.price) { doc.fillColor(GOLD).fontSize(11); } else { doc.fillColor("#888888").fontSize(9); }
  doc.text(clip(pr, 30), x + 5, y + cellh - 16, { width: w - 10, lineBreak: false });
}
async function sendCatalog(chatId) {
  const cat = store.catalog || { products: [] };
  if (!cat.products || !cat.products.length) {
    await tg("sendMessage", { chat_id: chatId, text: "Каталог ещё не загружен. Откройте приложение → «🛍 Каталог» → кнопка «📤 Отправить каталог боту»." });
    return;
  }
  await tg("sendMessage", { chat_id: chatId, text: "Готовлю каталог в PDF… ⏳" });
  try {
    if (PDFDocument && FONT_PATH) {
      const pdf = await buildCatalogPDF(cat);
      const r = await tgSendDocument(chatId, pdf, "catalog.pdf", "🛍 Каталог — " + (cat.company || ""));
      if (r && r.ok) return;
    }
  } catch (e) { console.log("Catalog PDF error:", e.message); }
  // запасной вариант — текстовый прайс
  let msg = "🛍 КАТАЛОГ — " + (cat.company || "") + "\n\n";
  const groups = {};
  cat.products.forEach(p => { const k = (p.category || "Без категории"); (groups[k] = groups[k] || []).push(p); });
  Object.keys(groups).sort((a, b) => a.localeCompare(b, "ru")).forEach(cn => {
    msg += "▪ " + cn + "\n";
    groups[cn].forEach(p => { msg += "  • " + p.name + " — " + (p.priceLabel || "Цена по запросу") + "\n"; });
    msg += "\n";
  });
  if (msg.length > 3900) msg = msg.slice(0, 3900) + "…";
  await tg("sendMessage", { chat_id: chatId, text: msg });
}

/* ---------- работа с командами бота ---------- */
async function handleCommand(chatId, text) {
  const t = (text || "").trim();
  const low = t.toLowerCase();
  const st = store.userState[chatId] || {};

  if (low === "/start") {
    await tg("sendMessage", { chat_id: chatId, text: "Здравствуйте! 👋\nНапишите «каталог» — пришлю каталог товаров в PDF.\nЕщё команды: «клиенты», /dolg (должники)." });
    return;
  }
  // КАТАЛОГ → PDF
  if (/^\/?(каталог|katalog|catalog|прайс|price|narx)$/i.test(low)) {
    await sendCatalog(chatId); return;
  }
  if (/^\/?(клиенты|clients|mijozlar)$/i.test(low)) {
    if (!store.clients.length) { await tg("sendMessage", { chat_id: chatId, text: "Список клиентов ещё не получен от приложения. Откройте приложение и включите синхронизацию." }); return; }
    let msg = "👥 КЛИЕНТЫ (напишите номер, чтобы выбрать):\n\n";
    store.clients.forEach((c, i) => { msg += (i + 1) + ". " + c.name + "\n"; });
    store.userState[chatId] = { mode: "pickClient" }; await tg("sendMessage", { chat_id: chatId, text: msg }); return;
  }
  if (/^\/(dolg|debt|долг|должники)/i.test(low)) {
    await tg("sendMessage", { chat_id: chatId, text: store.debtorsText || "Список должников ещё не получен." }); return;
  }
  // выбор клиента по номеру
  if (st.mode === "pickClient" && /^\d+$/.test(t)) {
    const c = store.clients[+t - 1];
    if (!c) { await tg("sendMessage", { chat_id: chatId, text: "Нет клиента с таким номером." }); return; }
    let msg = "👤 " + c.name + "\n💰 Долг: " + c.debt + "\n📊 Оборот: " + c.turnover + "\n\n📦 ЗАКАЗЫ (напишите номер для накладной PDF):\n";
    (c.orders || []).forEach((o, i) => { msg += (i + 1) + ". " + o.date + " — " + o.total + "\n"; });
    if (!(c.orders || []).length) msg += "(заказов нет)";
    store.userState[chatId] = { mode: "pickOrder", clientIdx: +t - 1 };
    await tg("sendMessage", { chat_id: chatId, text: msg }); return;
  }
  // выбор заказа по номеру -> PDF
  if (st.mode === "pickOrder" && /^\d+$/.test(t)) {
    const c = store.clients[st.clientIdx]; const o = c && c.orders[+t - 1];
    if (!o) { await tg("sendMessage", { chat_id: chatId, text: "Нет заказа с таким номером." }); return; }
    const inv = { title: "ТОВАРНАЯ НАКЛАДНАЯ", date: o.date, supplier: c.supplier || "", client: c.name, phone: c.phone || "", items: o.items, total: o.total };
    await sendInvoice(chatId, inv);
    store.userState[chatId] = { mode: "pickClient" }; return;
  }
}

/* ---------- polling ---------- */
async function poll() {
  if (!CONFIG.botToken) { setTimeout(poll, 5000); return; }
  try {
    const res = await tg("getUpdates", { offset: store.lastUpdateId + 1, timeout: 30, allowed_updates: ["message", "channel_post"] });
    if (res && res.ok && res.result.length) {
      for (const upd of res.result) {
        store.lastUpdateId = upd.update_id;
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

const server = http.createServer(async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  const url = new URL(req.url, "http://localhost");
  const isHealth = (url.pathname === "/" || url.pathname === "/health" || url.pathname === "/api/health");
  if (CONFIG.apiKey && !isHealth) {
    const key = req.headers["x-api-key"] || url.searchParams.get("key");
    if (key !== CONFIG.apiKey) { res.writeHead(401); res.end(JSON.stringify({ error: "bad key" })); return; }
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
server.listen(CONFIG.port, () => { console.log("✅ Сервер на порту " + CONFIG.port + ", токен " + (CONFIG.botToken?"✓":"✗")); poll(); });
