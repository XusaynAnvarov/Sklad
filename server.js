/* ============================================================
   СКЛАД — сервер + Телеграм-бот (версия для хостинга Render.com)
   Работает 24/7 в интернете, без вашего компьютера.

   Настройки берутся из переменных окружения (Environment) на Render:
     BOT_TOKEN  — токен бота от @BotFather (обязательно)
     API_KEY    — секретный ключ для приложения (например sklad)
   Порт Render задаёт сам через переменную PORT.
   ============================================================ */

const http  = require("http");
const https = require("https");

/* ---------- НАСТРОЙКИ из переменных окружения ---------- */
const CONFIG = {
  botToken: process.env.BOT_TOKEN || "",
  apiKey:   process.env.API_KEY   || "sklad",
  port:     process.env.PORT      || 8787
};
if (!CONFIG.botToken) console.log("⚠️  Не задан BOT_TOKEN в переменных окружения Render!");

/* ---------- ХРАНИЛИЩЕ (в памяти; Телеграм хранит сообщения ~24ч, бот догонит) ---------- */
let store = { lastUpdateId: 0, seq: 0, payments: [], chatId: null, debtorsText: "" };

/* ---------- РАСПОЗНАВАНИЕ ОПЛАТЫ ИЗ ТЕКСТА ----------
   Форматы: "Анвар Ака 645000", "Комол Ака 35 $", "Имя оплатил 100000 сум"
--------------------------------------------------------- */
function parsePayment(text) {
  if (!text) return null;
  let t = text.trim().replace(/оплатил[аи]?|оплата|töladi|to'ladi|tuladi/gi, " ");
  const m = t.match(/(-?\d[\d\s.,]*)/);
  if (!m) return null;
  const numRaw = m[1].replace(/\s/g, "").replace(/,/g, ".");
  let num = numRaw;
  const parts = numRaw.split(".");
  if (parts.length > 2) num = parts.slice(0, -1).join("") + "." + parts.slice(-1);
  const amount = Math.abs(parseFloat(num));
  if (!amount || isNaN(amount)) return null;
  let name = t.slice(0, m.index).replace(/[-—:．。]+\s*$/, "").trim();
  if (!name) return null;
  const rest = (t.slice(m.index + m[1].length) || "").toLowerCase();
  const cur = /\$|usd|долл|dollar/.test(rest) ? "USD" : "UZS";
  return { name, amount, cur };
}

/* ---------- TELEGRAM API ---------- */
function tg(method, params) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(params || {});
    const req = https.request({
      hostname: "api.telegram.org",
      path: `/bot${CONFIG.botToken}/${method}`,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }
    }, res => {
      let body = ""; res.on("data", c => body += c);
      res.on("end", () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    });
    req.on("error", reject); req.write(data); req.end();
  });
}

/* ---------- LONG POLLING ---------- */
async function poll() {
  if (!CONFIG.botToken) { setTimeout(poll, 5000); return; }
  try {
    const res = await tg("getUpdates", { offset: store.lastUpdateId + 1, timeout: 30, allowed_updates: ["message", "channel_post"] });
    if (res && res.ok && res.result.length) {
      for (const upd of res.result) {
        store.lastUpdateId = upd.update_id;
        const msg = upd.channel_post || upd.message;
        if (!msg || !msg.text) continue;
        if (msg.chat && (msg.chat.type === "channel" || msg.chat.type === "supergroup" || msg.chat.type === "group"))
          store.chatId = msg.chat.id;
        const p = parsePayment(msg.text);
        if (p) {
          store.seq += 1;
          store.payments.push({ id: store.seq, name: p.name, amount: p.amount, cur: p.cur,
            date: new Date(msg.date * 1000).toISOString().slice(0, 10), raw: msg.text, ts: Date.now() });
          console.log(`💰 Оплата: ${p.name} — ${p.amount} ${p.cur}`);
        }
        if (/^\/(dolg|debt|долг|должники)/i.test(msg.text.trim())) {
          await tg("sendMessage", { chat_id: msg.chat.id, text: store.debtorsText || "Список должников ещё не получен от приложения." });
        }
      }
    }
  } catch (e) { console.error("poll error:", e.message); }
  setTimeout(poll, 1000);
}

/* ---------- HTTP API ---------- */
function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Api-Key");
}
const server = http.createServer((req, res) => {
  cors(res);
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  const url = new URL(req.url, "http://localhost");
  const isHealth = (url.pathname === "/" || url.pathname === "/health" || url.pathname === "/api/health");
  if (CONFIG.apiKey && !isHealth) {
    const key = req.headers["x-api-key"] || url.searchParams.get("key");
    if (key !== CONFIG.apiKey) { res.writeHead(401); res.end(JSON.stringify({ error: "bad key" })); return; }
  }

  if (isHealth) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, hasToken: !!CONFIG.botToken, chatId: store.chatId, total: store.payments.length }));
    return;
  }
  if ((url.pathname === "/payments" || url.pathname === "/api/payments") && req.method === "GET") {
    const sinceTs = +url.searchParams.get("since") || 0;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(store.payments.filter(p => (p.ts || 0) > sinceTs)));
    return;
  }
  if ((url.pathname === "/post-debtors" || url.pathname === "/api/post-debtors") && req.method === "POST") {
    let body = ""; req.on("data", c => body += c);
    req.on("end", async () => {
      try {
        const { text } = JSON.parse(body || "{}");
        store.debtorsText = text || "";
        if (!store.chatId) { res.writeHead(400); res.end(JSON.stringify({ error: "Канал не определён. Напишите сообщение в канал." })); return; }
        const r = await tg("sendMessage", { chat_id: store.chatId, text: text || "Список пуст" });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: !!(r && r.ok) }));
      } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }
  if (url.pathname === "/set-debtors" && req.method === "POST") {
    let body = ""; req.on("data", c => body += c);
    req.on("end", () => { try { store.debtorsText = (JSON.parse(body || "{}").text) || ""; res.writeHead(200); res.end(JSON.stringify({ ok: true })); }
      catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); } });
    return;
  }
  res.writeHead(404); res.end(JSON.stringify({ error: "not found" }));
});

server.listen(CONFIG.port, () => {
  console.log(`✅ Сервер запущен на порту ${CONFIG.port}`);
  console.log(`   Бот-токен: ${CONFIG.botToken ? "задан ✓" : "НЕ ЗАДАН ✗"}`);
  poll();
});
