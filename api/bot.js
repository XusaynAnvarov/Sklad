// ========================================================================
//  Telegram-бот @generalmodernbot (webhook).
//  Клиент: /start → выбор языка (ru/uz/en) → телефон → меню (каталог/долг/накладные→PDF).
//  Владелец (ADMIN_CHAT_ID): панель Каталог/Клиенты/Долги (на русском).
//  Бот остаётся только в чатах, где владелец — админ/создатель.
//  ENV: CLIENT_BOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY,
//       TELEGRAM_BOT_TOKEN, ADMIN_CHAT_ID, PUBLIC_URL
// ========================================================================
import { sget, spatch, supsert } from "./lib/supa.js";
import { buildInvoicePDF } from "./lib/pdf.js";
import { invoiceCoverageStatus } from "./lib/debt.js";

const TOKEN = process.env.CLIENT_BOT_TOKEN;
const ADMIN_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT = process.env.ADMIN_CHAT_ID;
const PUBLIC_URL = process.env.PUBLIC_URL || "https://skladanvarov.vercel.app";
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const SIGN = { yuan: "¥", usd: "$", som: "сум" };

const api = (m) => `https://api.telegram.org/bot${TOKEN}/${m}`;
const tg = (method, payload) => fetch(api(method), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then(r => r.json());
async function notifyAdmin(text) {
  if (!ADMIN_TOKEN || !ADMIN_CHAT) return;
  try { await fetch(`https://api.telegram.org/bot${ADMIN_TOKEN}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: ADMIN_CHAT, text }) }); } catch {}
}
const isAdmin = (id) => String(id) === String(ADMIN_CHAT);
const money = (n, cur) => { const v = Number(n) || 0; const s = (cur === "som" ? Math.round(v) : Math.round(v * 100) / 100).toLocaleString("ru-RU"); return cur === "som" ? s + " сум" : (SIGN[cur] || "") + s; };
const norm = (s) => (String(s || "").replace(/\D/g, "")).slice(-9);
const dt = (d) => new Date(d).toLocaleDateString("ru-RU");

// ---------- переводы ----------
const T = {
  ru: { welcome: "👋 Добро пожаловать!\nЧтобы найти вас в системе, поделитесь номером телефона.", share: "📱 Поделиться номером", notFound: "❌ Ваш номер не найден. Мы свяжемся с вами.", found: n => `✅ Нашли вас: ${n}`, menu: n => `Здравствуйте, ${n}! 👋\nВыберите:`, advYou: "🟢 Ваш аванс (мы вам должны): ", bOrder: "🛒 Заказать товары", bCat: "🌐 Каталог товаров", bDebt: "💰 Мой оборот и долг", bInv: "🧾 Мои накладные", catMsg: u => `🌐 Наш каталог:\n${u}`, debtMsg: (n, t, d) => `💰 *${n}*\n\nОборот всего: ${t}\nТекущий долг: *${d}*`, noInv: "У вас пока нет накладных.", invList: "🧾 Ваши накладные (нажмите для PDF):", invCap: d => `🧾 Накладная от ${d}` },
  uz: { welcome: "👋 Xush kelibsiz!\nTizimdan topish uchun telefon raqamingizni yuboring.", share: "📱 Raqamni yuborish", notFound: "❌ Raqamingiz topilmadi. Tez orada bog‘lanamiz.", found: n => `✅ Topdik: ${n}`, menu: n => `Assalomu alaykum, ${n}! 👋\nTanlang:`, advYou: "🟢 Avansingiz (sizga qarzdormiz): ", bOrder: "🛒 Buyurtma berish", bCat: "🌐 Mahsulotlar katalogi", bDebt: "💰 Aylanma va qarzim", bInv: "🧾 Mening nakladnoylarim", catMsg: u => `🌐 Katalogimiz:\n${u}`, debtMsg: (n, t, d) => `💰 *${n}*\n\nUmumiy aylanma: ${t}\nJoriy qarz: *${d}*`, noInv: "Sizda hali nakladnoy yo‘q.", invList: "🧾 Nakladnoylaringiz (PDF uchun bosing):", invCap: d => `🧾 ${d} sanadagi nakladnoy` },
  en: { welcome: "👋 Welcome!\nShare your phone number so we can find you.", share: "📱 Share number", notFound: "❌ Your number was not found. We will contact you.", found: n => `✅ Found you: ${n}`, menu: n => `Hello, ${n}! 👋\nChoose:`, advYou: "🟢 Your advance (we owe you): ", bOrder: "🛒 Order products", bCat: "🌐 Product catalog", bDebt: "💰 My turnover & debt", bInv: "🧾 My invoices", catMsg: u => `🌐 Our catalog:\n${u}`, debtMsg: (n, t, d) => `💰 *${n}*\n\nTotal turnover: ${t}\nCurrent debt: *${d}*`, noInv: "You have no invoices yet.", invList: "🧾 Your invoices (tap for PDF):", invCap: d => `🧾 Invoice ${d}` },
};
const CHOOSE_LANG = "Выберите язык / Tilni tanlang / Choose language:";
const langKb = { inline_keyboard: [[{ text: "🇷🇺 Русский", callback_data: "lang:ru" }, { text: "🇺🇿 O‘zbek", callback_data: "lang:uz" }, { text: "🇬🇧 English", callback_data: "lang:en" }]] };

async function getLang(chatId, customer) {
  if (customer?.tg_lang) return customer.tg_lang;
  try { const s = await sget(`bot_sessions?chat_id=eq.${chatId}&select=lang`); if (s[0]?.lang) return s[0].lang; } catch {}
  return "ru";
}
async function setLang(chatId, lang, customer) {
  try { await supsert("bot_sessions", { chat_id: String(chatId), lang, updated_at: new Date().toISOString() }); } catch {}
  if (customer) { try { await spatch(`customers?id=eq.${customer.id}`, { tg_lang: lang }); } catch {} }
}

async function findByChat(chatId) { return (await sget(`customers?tg_chat_id=eq.${encodeURIComponent(chatId)}&select=*`))[0] || null; }
async function clientSales(custId) { return sget(`sales?customer_id=eq.${custId}&select=*&order=date.desc`); }
function debtAndTurnover(sales, payments, customer) {
  const debt = { som: 0, usd: 0, yuan: 0 }, turn = { som: 0, usd: 0, yuan: 0 };
  sales.forEach(s => (s.items || []).forEach(it => { const c = it.currency || s.currency; if (turn[c] === undefined) return; turn[c] += it.qty * it.unit_price; debt[c] += it.qty * it.unit_price; }));
  const od = (customer && customer.opening_debt) || {};
  ["som", "usd", "yuan"].forEach(c => debt[c] += Number(od[c]) || 0); // старый долг
  payments.forEach(p => { if (debt[p.currency] !== undefined) debt[p.currency] -= Number(p.amount) || 0; }); // оплаты вычитаются из долга
  const advance = { som: 0, usd: 0, yuan: 0 };
  ["som", "usd", "yuan"].forEach(c => { if (debt[c] < 0) { advance[c] = -debt[c]; debt[c] = 0; } }); // переплата = аванс
  return { debt, turn, advance };
}
const curStr = (o) => { const a = []; ["som", "usd", "yuan"].forEach(c => { if (Math.abs(o[c]) >= (c === "som" ? 1 : 0.01)) a.push(money(o[c], c)); }); return a.length ? a.join(" + ") : "0"; };
// иконка статуса накладной по реальным оплатам (а не по флагу)
const stIcon = (st) => st === "paid" ? "✅" : st === "partial" ? "🟡" : "🔴";

async function sendPDFto(chatId, saleId, cap) {
  const sale = (await sget(`sales?id=eq.${saleId}&select=*`))[0];
  if (!sale) return;
  const customer = sale.customer_id ? (await sget(`customers?id=eq.${sale.customer_id}&select=*`))[0] : { name: "—" };
  const products = await sget("products?select=id,name");
  await tg("sendChatAction", { chat_id: chatId, action: "upload_document" });
  let status;
  if (sale.customer_id) {
    const [cs, pays] = await Promise.all([sget(`sales?customer_id=eq.${sale.customer_id}&select=id,date,currency,items`), sget(`payments?customer_id=eq.${sale.customer_id}&select=amount,currency`)]);
    status = invoiceCoverageStatus(sale.id, cs, pays);
  }
  const bytes = await buildInvoicePDF({ sale, customer, products, status });
  const fd = new FormData();
  fd.append("chat_id", String(chatId));
  fd.append("caption", cap || `🧾 ${dt(sale.date)}`);
  fd.append("document", new Blob([bytes], { type: "application/pdf" }), `nakladnaya-${new Date(sale.date).toISOString().slice(0, 10)}.pdf`);
  await fetch(api("sendDocument"), { method: "POST", body: fd });
}

function clientMenu(chatId, c, L) {
  return tg("sendMessage", { chat_id: chatId, text: L.menu(c.name), reply_markup: { inline_keyboard: [
    [{ text: L.bOrder, web_app: { url: PUBLIC_URL + "/catalog?order=1" } }],
    [{ text: L.bCat, callback_data: "cat" }],
    [{ text: L.bDebt, callback_data: "debt" }],
    [{ text: L.bInv, callback_data: "inv" }],
  ] } });
}
const askContact = (chatId, L) => tg("sendMessage", { chat_id: chatId, text: L.welcome, reply_markup: { keyboard: [[{ text: L.share, request_contact: true }]], resize_keyboard: true, one_time_keyboard: true } });
const askLang = (chatId) => tg("sendMessage", { chat_id: chatId, text: CHOOSE_LANG, reply_markup: langKb });

async function linkByPhone(phone, chatId, fromUser) {
  const ph = norm(phone);
  const all = await sget("customers?select=*");
  const c = all.find(x => x.contact && norm(x.contact) === ph && ph.length >= 7);
  if (c) { await spatch(`customers?id=eq.${c.id}`, { tg_chat_id: String(chatId) }); return c; }
  await notifyAdmin(`🔔 Клиент пишет боту, номер не найден:\nТел: ${phone}\nchat_id: ${chatId}\nTG: ${fromUser || "—"}`);
  return null;
}

// ---------- админ-панель (русский) ----------
function adminMenu(chatId) {
  return tg("sendMessage", { chat_id: chatId, text: "🛠 Панель владельца:", reply_markup: { inline_keyboard: [[{ text: "🌐 Каталог", callback_data: "a_cat" }], [{ text: "👥 Клиенты", callback_data: "a_clients" }], [{ text: "💸 Долги", callback_data: "a_debts" }]] } });
}
async function adminClients(chatId) {
  const cs = await sget("customers?select=id,name&order=name.asc");
  if (!cs.length) return tg("sendMessage", { chat_id: chatId, text: "Клиентов нет." });
  return tg("sendMessage", { chat_id: chatId, text: "👥 Клиенты:", reply_markup: { inline_keyboard: cs.map(c => [{ text: c.name, callback_data: "cust:" + c.id }]) } });
}
async function adminClientCard(chatId, custId) {
  const c = (await sget(`customers?id=eq.${custId}&select=*`))[0];
  if (!c) return;
  const [sales, pays] = await Promise.all([clientSales(custId), sget(`payments?customer_id=eq.${custId}&select=*`)]);
  const { debt, turn, advance } = debtAndTurnover(sales, pays, c);
  const inv = sales.slice(0, 20).map(s => { const t = (s.items || []).reduce((a, i) => a + i.qty * i.unit_price, 0); const st = invoiceCoverageStatus(s.id, sales, pays); return [{ text: `${dt(s.date)} · ${money(t, s.currency)} ${stIcon(st)}`, callback_data: "ainv:" + s.id }]; });
  const hasAdv = ["som", "usd", "yuan"].some(k => advance[k] > (k === "som" ? 1 : 0.01));
  let body = `👤 *${c.name}*\n${c.contact ? "📞 " + c.contact + "\n" : ""}\nОборот: ${curStr(turn)}\nДолг: *${curStr(debt)}*`;
  if (hasAdv) body += `\n🔴 Аванс (мы должны): *${curStr(advance)}*`; // наша задолженность клиенту
  await tg("sendMessage", { chat_id: chatId, parse_mode: "Markdown", text: body, reply_markup: { inline_keyboard: inv.length ? inv : [[{ text: "Нет накладных", callback_data: "noop" }]] } });
}
async function adminDebts(chatId) {
  const [cs, sales, pays] = await Promise.all([sget("customers?select=id,name,opening_debt"), sget("sales?select=customer_id,currency,items,status"), sget("payments?select=customer_id,amount,currency")]);
  const total = { som: 0, usd: 0, yuan: 0 };
  const rows = [];
  cs.forEach(c => {
    const { debt } = debtAndTurnover(sales.filter(s => s.customer_id === c.id), pays.filter(p => p.customer_id === c.id), c);
    if (["som", "usd", "yuan"].some(k => debt[k] > (k === "som" ? 1 : 0.01))) {
      ["som", "usd", "yuan"].forEach(k => total[k] += debt[k]);
      const key = (debt.som || 0) + (debt.usd || 0) * 13000 + (debt.yuan || 0) * 1800; // для сортировки
      rows.push({ name: c.name, id: c.id, s: curStr(debt), key });
    }
  });
  if (!rows.length) return tg("sendMessage", { chat_id: chatId, text: "🎉 Должников нет." });
  rows.sort((a, b) => b.key - a.key);
  // текстовый список (разбиваем на части под лимит Telegram)
  const lines = rows.map((r, i) => `${i + 1}. ${r.name} — ${r.s}`);
  const chunks = []; let buf = `💸 Должники: ${rows.length}\n\n`;
  for (const ln of lines) { if ((buf + ln).length > 3500) { chunks.push(buf); buf = ""; } buf += ln + "\n"; }
  buf += `\nИтого долгов: ${curStr(total)}`; chunks.push(buf);
  for (const ch of chunks) await tg("sendMessage", { chat_id: chatId, text: ch });
  // кнопки для открытия карточки (топ-30 по сумме)
  await tg("sendMessage", { chat_id: chatId, text: "Открыть карточку клиента:", reply_markup: { inline_keyboard: rows.slice(0, 30).map(r => [{ text: `${r.name} — ${r.s}`, callback_data: "cust:" + r.id }]) } });
}

// Регистрация оплаты владельцем текстом: «Имя сумма [валюта]» → создаёт оплату.
async function tryAdminPayment(chatId, raw) {
  let s = (raw || "").trim(); if (!s) return false;
  let currency = "som";
  if (/¥|cny|юан|yuan/i.test(s)) { currency = "yuan"; s = s.replace(/¥|cny|юань?|yuan/ig, " "); }
  else if (/\$|usd|долл/i.test(s)) { currency = "usd"; s = s.replace(/\$|usd|долл\w*/ig, " "); }
  else { s = s.replace(/сум|som|uzs/ig, " "); }
  const m = s.match(/([\d][\d\s.,]*)\s*$/); if (!m) return false;
  const amount = parseFloat(m[1].replace(/[\s,]/g, "")); if (!(amount > 0)) return false;
  const name = s.slice(0, m.index).trim(); if (name.length < 2) return false;
  const all = await sget("customers?select=id,name,opening_debt");
  const c = all.find(x => (x.name || "").toLowerCase().includes(name.toLowerCase()));
  if (!c) { await tg("sendMessage", { chat_id: chatId, text: `❌ Клиент «${name}» не найден.` }); return true; }
  await supsert("payments", { customer_id: c.id, amount, currency, date: new Date().toISOString(), note: "Оплата (из бота)" });
  const [sales, pays] = await Promise.all([clientSales(c.id), sget(`payments?customer_id=eq.${c.id}&select=*`)]);
  const { debt } = debtAndTurnover(sales, pays, c);
  await tg("sendMessage", { chat_id: chatId, parse_mode: "Markdown", text: `✅ Оплата *${money(amount, currency)}* записана клиенту *${c.name}*.\nТекущий долг: *${curStr(debt)}*` });
  return true;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("ok");
  // Подлинность вебхука: Telegram присылает заголовок с секретом, заданным при setWebhook.
  // Без совпадения секрета запрос отвергается — иначе любой может подделать update
  // (в т.ч. message.chat.id = ADMIN_CHAT_ID) и получить права владельца.
  if (!WEBHOOK_SECRET || req.headers["x-telegram-bot-api-secret-token"] !== WEBHOOK_SECRET) {
    return res.status(401).send("unauthorized");
  }
  let u = req.body; if (typeof u === "string") { try { u = JSON.parse(u); } catch { u = {}; } }
  try {
    // --- бот остаётся только там, где владелец админ/создатель ---
    if (u.my_chat_member) {
      const cm = u.my_chat_member, chat = cm.chat, status = cm.new_chat_member?.status;
      if ((status === "member" || status === "administrator") && ["channel", "group", "supergroup"].includes(chat.type)) {
        let ownerOk = isAdmin(cm.from?.id);
        if (!ownerOk) { try { const r = await tg("getChatAdministrators", { chat_id: chat.id }); if (r.ok) ownerOk = r.result.some(m => String(m.user?.id) === String(ADMIN_CHAT)); } catch {} }
        if (ownerOk) await notifyAdmin(`✅ Бот добавлен в «${chat.title || chat.id}» (id: ${chat.id}).`);
        else { await tg("leaveChat", { chat_id: chat.id }); await notifyAdmin(`🚫 Бота добавили в чужой чат «${chat.title || chat.id}» — он вышел.`); }
      }
      return res.status(200).send("ok");
    }

    // --- сообщения ---
    if (u.message) {
      const chatId = u.message.chat.id;
      if (isAdmin(chatId)) {
        const raw = (u.message.text || "").trim();
        const t = raw.toLowerCase();
        if (t === "/clients") await adminClients(chatId);
        else if (t === "/debts") await adminDebts(chatId);
        else if (t === "/catalog") await tg("sendMessage", { chat_id: chatId, text: `🌐 ${PUBLIC_URL}/catalog` });
        else if (t === "/start" || t === "/menu") await adminMenu(chatId);
        else { const handled = await tryAdminPayment(chatId, raw); if (!handled) await adminMenu(chatId); }
        return res.status(200).send("ok");
      }
      const fromName = [u.message.from?.first_name, u.message.from?.last_name].filter(Boolean).join(" ");
      // поделился контактом
      if (u.message.contact && u.message.contact.phone_number) {
        const c = await linkByPhone(u.message.contact.phone_number, chatId, fromName);
        const L = T[await getLang(chatId, c)] || T.ru;
        if (c) { await setLang(chatId, await getLang(chatId, null), c); await tg("sendMessage", { chat_id: chatId, text: L.found(c.name), reply_markup: { remove_keyboard: true } }); await clientMenu(chatId, c, L); }
        else await tg("sendMessage", { chat_id: chatId, text: L.notFound, reply_markup: { remove_keyboard: true } });
        return res.status(200).send("ok");
      }
      const text = (u.message.text || "").trim().toLowerCase();
      const existing = await findByChat(chatId);
      if (text === "/lang") { await askLang(chatId); return res.status(200).send("ok"); }
      if (text === "/start" || !existing) { await askLang(chatId); return res.status(200).send("ok"); }
      const L = T[await getLang(chatId, existing)] || T.ru;
      await clientMenu(chatId, existing, L);
      return res.status(200).send("ok");
    }

    // --- кнопки ---
    if (u.callback_query) {
      const cq = u.callback_query, chatId = cq.message.chat.id, data = cq.data || "";
      await tg("answerCallbackQuery", { callback_query_id: cq.id });

      // выбор языка
      if (data.startsWith("lang:")) {
        const lang = data.slice(5);
        const c = await findByChat(chatId);
        await setLang(chatId, lang, c);
        const L = T[lang] || T.ru;
        if (c) await clientMenu(chatId, c, L); else await askContact(chatId, L);
        return res.status(200).send("ok");
      }

      if (isAdmin(chatId)) {
        if (data === "a_cat") await tg("sendMessage", { chat_id: chatId, text: `🌐 ${PUBLIC_URL}/catalog` });
        else if (data === "a_clients") await adminClients(chatId);
        else if (data === "a_debts") await adminDebts(chatId);
        else if (data.startsWith("cust:")) await adminClientCard(chatId, data.slice(5));
        else if (data.startsWith("ainv:")) await sendPDFto(chatId, data.slice(5));
        return res.status(200).send("ok");
      }

      const c = await findByChat(chatId);
      const L = T[await getLang(chatId, c)] || T.ru;
      if (!c) { await askLang(chatId); return res.status(200).send("ok"); }
      if (data === "cat") await tg("sendMessage", { chat_id: chatId, text: L.catMsg(PUBLIC_URL + "/catalog") });
      else if (data === "debt") {
        const [sales, pays] = await Promise.all([clientSales(c.id), sget(`payments?customer_id=eq.${c.id}&select=*`)]);
        const { debt, turn, advance } = debtAndTurnover(sales, pays, c);
        let txt = L.debtMsg(c.name, curStr(turn), curStr(debt));
        if (["som", "usd", "yuan"].some(k => advance[k] > (k === "som" ? 1 : 0.01))) txt += "\n\n" + L.advYou + "*" + curStr(advance) + "*"; // переплата — мы должны клиенту (🟢)
        await tg("sendMessage", { chat_id: chatId, parse_mode: "Markdown", text: txt });
      } else if (data === "inv") {
        const [sales, ipays] = await Promise.all([clientSales(c.id), sget(`payments?customer_id=eq.${c.id}&select=amount,currency`)]);
        if (!sales.length) { await tg("sendMessage", { chat_id: chatId, text: L.noInv }); return res.status(200).send("ok"); }
        const rows = sales.slice(0, 20).map(s => { const t = (s.items || []).reduce((a, i) => a + i.qty * i.unit_price, 0); const st = invoiceCoverageStatus(s.id, sales, ipays); return [{ text: `${dt(s.date)} · ${money(t, s.currency)} ${stIcon(st)}`, callback_data: "inv:" + s.id }]; });
        await tg("sendMessage", { chat_id: chatId, text: L.invList, reply_markup: { inline_keyboard: rows } });
      } else if (data.startsWith("inv:")) {
        await sendPDFto(chatId, data.slice(4), L.invCap(dt((await sget(`sales?id=eq.${data.slice(4)}&select=date`))[0]?.date || Date.now())));
      }
      return res.status(200).send("ok");
    }
    return res.status(200).send("ok");
  } catch (e) { console.error("bot error", e); return res.status(200).send("ok"); }
}
