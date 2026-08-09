// ========================================================================
//  Telegram-бот @generalmodernbot (webhook).
//  Клиент: /start → выбор языка (ru/uz/en) → телефон → меню (каталог/долг/накладные→PDF).
//  Владелец (ADMIN_CHAT_ID): панель Каталог/Клиенты/Долги (на русском).
//  Бот остаётся только в чатах, где владелец — админ/создатель.
//  ENV: CLIENT_BOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY,
//       TELEGRAM_BOT_TOKEN, ADMIN_CHAT_ID, PUBLIC_URL
// ========================================================================
import { sget, spatch, supsert } from "./lib/supa.js";
import { buildInvoicePDF, buildReconciliationPDF } from "./lib/pdf.js";
import { invoiceCoverageStatus, invoiceDebtSummary } from "./lib/debt.js";

const TOKEN = process.env.CLIENT_BOT_TOKEN;
const ADMIN_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT = process.env.ADMIN_CHAT_ID;
const PUBLIC_URL = process.env.PUBLIC_URL || "https://generalmodern.uz";
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const SIGN = { yuan: "¥", usd: "$", som: "сум" };

const api = (m) => `https://api.telegram.org/bot${TOKEN}/${m}`;
const tg = (method, payload) => fetch(api(method), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then(r => r.json());

// Номер подтверждён — зовём клиента обратно на сайт КНОПКОЙ, сразу на шаг пароля.
// Ссылка с токеном обязательна: встроенный браузер Telegram имеет своё хранилище,
// и сохранённое в Safari/Chrome состояние регистрации там недоступно.
// Токен тот же одноразовый (48 hex, живёт 1 час, сгорает после регистрации).
// Двумя сообщениями: убрать клавиатуру «Поделиться номером» и показать инлайн-кнопку
// в одном сообщении Telegram не позволяет.
async function verifiedGoSetPassword(chatId, token) {
  await tg("sendMessage", { chat_id: chatId, text: "✅ Номер подтверждён!", reply_markup: { remove_keyboard: true } });
  await tg("sendMessage", {
    chat_id: chatId,
    text: "Осталось задать пароль — нажмите кнопку ниже, и сайт откроется сразу на этом шаге.",
    reply_markup: { inline_keyboard: [[{ text: "🔐 Задать пароль на сайте", url: `${PUBLIC_URL}/?reg=${encodeURIComponent(token)}` }]] },
  });
}
async function notifyAdmin(text) {
  if (!ADMIN_TOKEN || !ADMIN_CHAT) return;
  try { await fetch(`https://api.telegram.org/bot${ADMIN_TOKEN}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: ADMIN_CHAT, text }) }); } catch {}
}
const isAdmin = (id) => String(id) === String(ADMIN_CHAT);

// Антифрод-уведомление владельцу: кто-то прислал ЧУЖОЙ контакт (попытка войти в чужой аккаунт).
async function alertImpersonation(from, sharedPhone, where) {
  const who = [from?.first_name, from?.last_name].filter(Boolean).join(" ") || "—";
  const uname = from?.username ? "@" + from.username : "—";
  let targetName = "не наш номер";
  try {
    const all = await sget("customers?select=name,contact,phones");
    const tgt = all.find(x => custNumbers(x).some(n => norm(n) === norm(sharedPhone)));
    if (tgt) targetName = `клиента «${tgt.name}»`;
  } catch {}
  await notifyAdmin(
    `🚨 Попытка входа по ЧУЖОМУ номеру (${where})\n\n` +
    `Кто пытается войти:\n` +
    `• Имя: ${who}\n` +
    `• Username: ${uname}\n` +
    `• Telegram ID: ${from?.id || "—"}\n` +
    `• chat_id: ${from?.id || "—"}\n\n` +
    `Отправил контакт:\n` +
    `• Номер: ${sharedPhone}\n` +
    `• Это номер: ${targetName}\n\n` +
    `❌ Доступ заблокирован — контакт не принадлежит отправителю.`
  );
}
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

// все номера клиента: основной contact + дополнительные phones[]
function custNumbers(c) { return [c.contact, ...(Array.isArray(c.phones) ? c.phones : [])].filter(Boolean); }
async function findByChat(chatId) {
  const id = String(chatId);
  const byMain = (await sget(`customers?tg_chat_id=eq.${encodeURIComponent(id)}&select=*`))[0];
  if (byMain) return byMain;
  // также среди дополнительных привязанных Telegram-аккаунтов клиента (tg_chat_ids)
  try { const byArr = (await sget(`customers?tg_chat_ids=cs.${encodeURIComponent(JSON.stringify([id]))}&select=*`))[0]; if (byArr) return byArr; } catch {}
  return null;
}
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
  const products = await sget("products?select=id,name,sku");
  await tg("sendChatAction", { chat_id: chatId, action: "upload_document" });
  let status, debt;
  if (sale.customer_id) {
    const [cs, pays] = await Promise.all([sget(`sales?customer_id=eq.${sale.customer_id}&select=id,date,currency,items,status`), sget(`payments?customer_id=eq.${sale.customer_id}&select=amount,currency,date`)]);
    status = invoiceCoverageStatus(sale.id, cs, pays, customer.opening_debt);
    debt = invoiceDebtSummary(sale.id, cs, pays, customer.opening_debt);
  }
  const bytes = await buildInvoicePDF({ sale, customer, products, status, debt });
  const fd = new FormData();
  fd.append("chat_id", String(chatId));
  fd.append("caption", cap || `🧾 ${dt(sale.date)}`);
  fd.append("document", new Blob([bytes], { type: "application/pdf" }), `nakladnaya-${new Date(sale.date).toISOString().slice(0, 10)}.pdf`);
  await fetch(api("sendDocument"), { method: "POST", body: fd });
}

// ---------- Акт сверки (PDF) для владельца ----------
// собрать PDF акта по клиенту: только оформленные накладные (final) + оплаты
async function buildActBytes(custId) {
  const customer = (await sget(`customers?id=eq.${encodeURIComponent(custId)}&select=*`))[0];
  if (!customer) return null;
  const [sales, payments] = await Promise.all([
    sget(`sales?customer_id=eq.${custId}&status=eq.final&select=id,date,currency,items&order=date.asc`),
    sget(`payments?customer_id=eq.${custId}&select=amount,currency,date&order=date.asc`),
  ]);
  const bytes = await buildReconciliationPDF({ customer, sales, payments });
  return { customer, bytes };
}
async function sendActTo(chatId, custId) {
  await tg("sendChatAction", { chat_id: chatId, action: "upload_document" });
  const a = await buildActBytes(custId);
  if (!a) return false;
  const fd = new FormData();
  fd.append("chat_id", String(chatId));
  fd.append("caption", `📋 Акт сверки — ${a.customer.name}\nна ${dt(Date.now())}`);
  fd.append("document", new Blob([a.bytes], { type: "application/pdf" }), `akt-sverki-${new Date().toISOString().slice(0, 10)}.pdf`);
  await fetch(api("sendDocument"), { method: "POST", body: fd });
  return true;
}
// меню выбора: «Все клиенты» + список клиентов
async function adminActs(chatId) {
  const cs = await sget("customers?select=id,name&order=name.asc");
  if (!cs.length) return tg("sendMessage", { chat_id: chatId, text: "Клиентов нет." });
  const kb = [[{ text: "📚 Все клиенты — прислать все PDF", callback_data: "act_all" }], ...cs.map(c => [{ text: "📋 " + c.name, callback_data: "act:" + c.id }])];
  return tg("sendMessage", { chat_id: chatId, text: "📋 Акт сверки — выберите клиента или «Все клиенты»:", reply_markup: { inline_keyboard: kb } });
}
// прислать акты по ВСЕМ клиентам с движением (по одному PDF на клиента)
async function adminActAll(chatId) {
  try {
    const [cs, sales, pays] = await Promise.all([
      sget("customers?select=id,name&order=name.asc"),
      sget("sales?status=eq.final&select=customer_id"),
      sget("payments?select=customer_id"),
    ]);
    const active = new Set([...sales.map(s => s.customer_id), ...pays.map(p => p.customer_id)].filter(Boolean));
    const list = cs.filter(c => active.has(c.id));
    if (!list.length) { await tg("sendMessage", { chat_id: chatId, text: "Нет клиентов с движением для акта." }); return; }
    await tg("sendMessage", { chat_id: chatId, text: `📋 Готовлю акты сверки по ${list.length} клиентам… пришлю по одному PDF.` });
    let ok = 0;
    for (const c of list) { try { if (await sendActTo(chatId, c.id)) ok++; } catch (e) { console.error("act_all", c.id, e); } }
    await tg("sendMessage", { chat_id: chatId, text: `✅ Готово. Отправлено актов: ${ok} из ${list.length}.` });
  } catch (e) { console.error("adminActAll error", e); await tg("sendMessage", { chat_id: chatId, text: "Не удалось сформировать акты. Попробуйте позже." }); }
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
// Заставка-логотип при входе (анимация GENERAL MODERN). Не блокирует /start, если файл недоступен.
const sendIntro = (chatId) => tg("sendAnimation", { chat_id: chatId, animation: PUBLIC_URL + "/brand/bot-intro.gif" }).catch(() => {});

async function linkByPhone(phone, chatId, fromUser, username) {
  const ph = norm(phone);
  const all = await sget("customers?select=*");
  // совпадение по ЛЮБОМУ из номеров клиента (основной + дополнительные)
  const c = all.find(x => ph.length >= 7 && custNumbers(x).some(n => norm(n) === ph));
  if (c) {
    const cid = String(chatId);
    const ids = Array.isArray(c.tg_chat_ids) ? c.tg_chat_ids.map(String) : [];
    const accs = Array.isArray(c.tg_accounts) ? c.tg_accounts : [];
    const isNewLink = !ids.includes(cid) && String(c.tg_chat_id || "") !== cid; // этот Telegram привязывается ВПЕРВЫЕ
    const patch = {};
    if (!c.tg_chat_id) patch.tg_chat_id = cid;          // основной получатель накладных — первый привязавшийся
    if (!ids.includes(cid)) patch.tg_chat_ids = [...ids, cid]; // все привязанные аккаунты (для входа в бот)
    // запоминаем, КАКОЙ номер привязал ЭТОТ Telegram → потом владелец выбирает получателя по телефону
    if (!accs.some(a => String(a.chat_id) === cid)) patch.tg_accounts = [...accs, { phone: String(phone), chat_id: cid, name: fromUser || "" }];
    if (Object.keys(patch).length) {
      const tryPatch = async (obj) => { try { await spatch(`customers?id=eq.${c.id}`, obj); return true; } catch { return false; } };
      // полный патч → без tg_accounts → только tg_chat_id (фолбэк, если новых колонок ещё нет)
      if (!(await tryPatch(patch))) {
        const { tg_accounts, ...noAcc } = patch;
        if (!(await tryPatch(noAcc)) && patch.tg_chat_id) await tryPatch({ tg_chat_id: patch.tg_chat_id });
      }
    }
    // владельцу — уведомление, что клиент ПОДКЛЮЧИЛСЯ к боту (только при первой привязке этого Telegram)
    if (isNewLink) {
      await notifyAdmin(
        `✅ Клиент подключился к Telegram-боту\n\n` +
        `Клиент: ${c.name}\n` +
        `Номер: ${phone}\n` +
        `Имя в Telegram: ${fromUser || "—"}\n` +
        `Username: ${username ? "@" + username : "—"}\n` +
        `chat_id: ${cid}`
      );
    }
    return c;
  }
  await notifyAdmin(`🔔 Клиент пишет боту, номер не найден:\nТел: ${phone}\nchat_id: ${chatId}\nTG: ${fromUser || "—"}`);
  return null;
}

// ---------- админ-панель (русский) ----------
function adminMenu(chatId) {
  return tg("sendMessage", { chat_id: chatId, text: "🛠 Панель владельца:", reply_markup: { inline_keyboard: [
    [{ text: "🛒 Заказать (как клиент — для демо)", web_app: { url: PUBLIC_URL + "/catalog?order=1" } }],
    [{ text: "🌐 Каталог", callback_data: "a_cat" }],
    [{ text: "👥 Клиенты", callback_data: "a_clients" }],
    [{ text: "💸 Долги", callback_data: "a_debts" }],
    [{ text: "🔔 Напомнить должникам", callback_data: "a_remind" }],
    [{ text: "📋 Акты сверки", callback_data: "a_acts" }],
  ] } });
}
// Разослать должникам напоминание об оплате в их Telegram (через клиентского бота)
async function adminRemindDebtors(chatId) {
  try {
    const [cs, sales, pays] = await Promise.all([
      sget("customers?select=id,name,opening_debt,tg_chat_id"),
      sget("sales?select=customer_id,currency,items,status"),
      sget("payments?select=customer_id,amount,currency"),
    ]);
    let sent = 0, noTg = 0;
    for (const c of cs) {
      const { debt } = debtAndTurnover(sales.filter(s => s.customer_id === c.id), pays.filter(p => p.customer_id === c.id), c);
      if (!["som", "usd", "yuan"].some(k => debt[k] > (k === "som" ? 1 : 0.01))) continue; // нет долга
      if (!c.tg_chat_id) { noTg++; continue; }
      try {
        await tg("sendMessage", { chat_id: c.tg_chat_id, parse_mode: "Markdown", text: `Здравствуйте, ${c.name}! 👋\n\nНапоминаем о текущей задолженности: *${curStr(debt)}*.\nПросьба погасить при возможности. Спасибо! 🙏` });
        sent++;
      } catch {}
    }
    await tg("sendMessage", { chat_id: chatId, text: `🔔 Напоминания отправлены: ${sent}.${noTg ? ` Без Telegram (не привязаны): ${noTg}.` : ""}` });
  } catch (e) { console.error("remind error", e); await tg("sendMessage", { chat_id: chatId, text: "Не удалось разослать напоминания." }); }
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
  const inv = sales.slice(0, 20).map(s => { const t = (s.items || []).reduce((a, i) => a + i.qty * i.unit_price, 0); const st = invoiceCoverageStatus(s.id, sales, pays, c.opening_debt); return [{ text: `${dt(s.date)} · ${money(t, s.currency)} ${stIcon(st)}`, callback_data: "ainv:" + s.id }]; });
  const hasAdv = ["som", "usd", "yuan"].some(k => advance[k] > (k === "som" ? 1 : 0.01));
  let body = `👤 *${c.name}*\n${c.contact ? "📞 " + c.contact + "\n" : ""}\nОборот: ${curStr(turn)}\nДолг: *${curStr(debt)}*`;
  if (hasAdv) body += `\n🔴 Аванс (мы должны): *${curStr(advance)}*`; // наша задолженность клиенту
  const kb = [[{ text: "📋 Акт сверки (PDF)", callback_data: "act:" + custId }], ...(inv.length ? inv : [[{ text: "Нет накладных", callback_data: "noop" }]])];
  await tg("sendMessage", { chat_id: chatId, parse_mode: "Markdown", text: body, reply_markup: { inline_keyboard: kb } });
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
  const nLow = name.toLowerCase().trim();
  // 1) ТОЧНОЕ совпадение имени (чтобы «Илхом Ака» не уходил в «Илхом Ака (Андижон)»)
  let matches = all.filter(x => (x.name || "").trim().toLowerCase() === nLow);
  // 2) иначе — частичное (имя содержится)
  if (!matches.length) matches = all.filter(x => (x.name || "").toLowerCase().includes(nLow));
  if (!matches.length) { await tg("sendMessage", { chat_id: chatId, text: `❌ Клиент «${name}» не найден.` }); return true; }
  if (matches.length === 1) { await recordPayment(chatId, matches[0], amount, currency); return true; }
  // 3) несколько подходящих → спрашиваем, кому записать (оплату запоминаем во временном состоянии)
  try { await supsert("bot_sessions", { chat_id: String(chatId), state: { pending_payment: { amount, currency } }, updated_at: new Date().toISOString() }); } catch {}
  const kb = matches.slice(0, 16).map(c => [{ text: c.name, callback_data: "paysel:" + c.id }]);
  await tg("sendMessage", { chat_id: chatId, text: `🔎 Под «${name}» подходит несколько клиентов. Кому записать оплату ${money(amount, currency)}?`, reply_markup: { inline_keyboard: kb } });
  return true;
}

// записать оплату конкретному клиенту + показать новый долг
async function recordPayment(chatId, c, amount, currency) {
  await supsert("payments", { customer_id: c.id, amount, currency, date: new Date().toISOString(), note: "Оплата (из бота)" });
  const [sales, pays] = await Promise.all([clientSales(c.id), sget(`payments?customer_id=eq.${c.id}&select=*`)]);
  const { debt } = debtAndTurnover(sales, pays, c);
  await tg("sendMessage", { chat_id: chatId, parse_mode: "Markdown", text: `✅ Оплата *${money(amount, currency)}* записана клиенту *${c.name}*.\nТекущий долг: *${curStr(debt)}*` });
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

      // --- Регистрация на сайте идёт РАНЬШЕ админ-меню (чтобы работала и для владельца бота) ---
      const rawMsg0 = (u.message.text || "").trim();
      const verifyStartMatch = rawMsg0.match(/^\/start verify_([a-f0-9]{48})$/i);
      let pendingVerifyToken = null;
      if (verifyStartMatch || (u.message.contact && u.message.contact.phone_number)) {
        try { const s = await sget(`bot_sessions?chat_id=eq.${chatId}&select=state`); pendingVerifyToken = s[0]?.state?.verify_token || null; } catch {}
      }
      // 1) /start verify_TOKEN — начать верификацию (даже для админа/владельца)
      if (verifyStartMatch) {
        const token = verifyStartMatch[1].toLowerCase();
        const vrows = await sget(`site_verifications?token=eq.${encodeURIComponent(token)}&select=phone,verified,expires_at`);
        const v = vrows[0];
        if (!v || new Date(v.expires_at) < new Date()) { await tg("sendMessage", { chat_id: chatId, text: "Ссылка недействительна или истекла. Вернитесь на сайт и начните регистрацию заново." }); return res.status(200).send("ok"); }
        if (v.verified) { await verifiedGoSetPassword(chatId, token); return res.status(200).send("ok"); }
        try { await supsert("bot_sessions", { chat_id: String(chatId), state: { verify_token: token }, updated_at: new Date().toISOString() }); } catch {}
        await tg("sendMessage", { chat_id: chatId, text: "Для подтверждения регистрации на generalmodern.uz нажмите кнопку ниже и поделитесь номером телефона.", reply_markup: { keyboard: [[{ text: "Поделиться номером", request_contact: true }]], resize_keyboard: true, one_time_keyboard: true } });
        return res.status(200).send("ok");
      }
      // 2) шаринг контакта при активной верификации (даже для админа/владельца)
      if (u.message.contact && u.message.contact.phone_number && pendingVerifyToken) {
        const vrows = await sget(`site_verifications?token=eq.${encodeURIComponent(pendingVerifyToken)}&select=phone,verified,expires_at`);
        const v = vrows[0];
        if (v && !v.verified && new Date(v.expires_at) > new Date()) {
          const sharedOwn = String(u.message.contact.user_id || "") === String(u.message.from?.id || "");
          if (u.message.from?.is_bot || !sharedOwn) {
            await alertImpersonation(u.message.from, u.message.contact.phone_number, "регистрация на сайте");
            await tg("sendMessage", { chat_id: chatId, text: "Поделитесь СВОИМ контактом кнопкой ниже — пересланный чужой номер не подходит для регистрации.", reply_markup: { keyboard: [[{ text: "Поделиться номером", request_contact: true }]], resize_keyboard: true, one_time_keyboard: true } });
            return res.status(200).send("ok");
          }
          if (norm(u.message.contact.phone_number) === norm(v.phone)) {
            await spatch(`site_verifications?token=eq.${encodeURIComponent(pendingVerifyToken)}`, { verified: true, chat_id: String(chatId), tg_username: u.message.from?.username || null });
            try { await supsert("bot_sessions", { chat_id: String(chatId), state: {}, updated_at: new Date().toISOString() }); } catch {}
            await verifiedGoSetPassword(chatId, pendingVerifyToken);
          } else {
            await tg("sendMessage", { chat_id: chatId, text: "Номер не совпадает с тем, что вы указали при регистрации. Попробуйте снова.", reply_markup: { remove_keyboard: true } });
          }
          return res.status(200).send("ok");
        }
      }

      if (isAdmin(chatId)) {
        const raw = (u.message.text || "").trim();
        const t = raw.toLowerCase();
        if (t === "/clients") await adminClients(chatId);
        else if (t === "/debts") await adminDebts(chatId);
        else if (t === "/akt" || t === "/act" || t === "/sverka") await adminActs(chatId);
        else if (t === "/remind" || t === "/dolg") await adminRemindDebtors(chatId);
        else if (t === "/catalog") await tg("sendMessage", { chat_id: chatId, text: `🌐 ${PUBLIC_URL}/catalog` });
        else if (t === "/start" || t === "/menu") await adminMenu(chatId);
        else { const handled = await tryAdminPayment(chatId, raw); if (!handled) await adminMenu(chatId); }
        return res.status(200).send("ok");
      }
      const fromName = [u.message.from?.first_name, u.message.from?.last_name].filter(Boolean).join(" ");
      // поделился контактом
      if (u.message.contact && u.message.contact.phone_number) {
        const phone = u.message.contact.phone_number;
        let verifiedSite = false;
        try {
          const sess = await sget(`bot_sessions?chat_id=eq.${chatId}&select=state`);
          const verifyToken = sess[0]?.state?.verify_token;
          if (verifyToken) {
            const ph = norm(phone);
            const vrows = await sget(`site_verifications?token=eq.${encodeURIComponent(verifyToken)}&select=phone,verified,expires_at`);
            const v = vrows[0];
            if (v && !v.verified && new Date(v.expires_at) > new Date()) {
              // антифрод: контакт должен быть СВОИМ (user_id == from.id) и не бот-аккаунт
              const sharedOwn = String(u.message.contact.user_id || "") === String(u.message.from?.id || "");
              if (u.message.from?.is_bot || !sharedOwn) {
                await alertImpersonation(u.message.from, u.message.contact.phone_number, "регистрация на сайте");
                await tg("sendMessage", { chat_id: chatId, text: "Поделитесь СВОИМ контактом кнопкой ниже — пересланный чужой номер не подходит для регистрации.", reply_markup: { keyboard: [[{ text: "Поделиться номером", request_contact: true }]], resize_keyboard: true, one_time_keyboard: true } });
                return res.status(200).send("ok");
              }
              if (ph && ph === norm(v.phone)) {
                await spatch(`site_verifications?token=eq.${encodeURIComponent(verifyToken)}`, { verified: true, chat_id: String(chatId), tg_username: u.message.from?.username || null });
                try { await supsert("bot_sessions", { chat_id: String(chatId), state: {}, updated_at: new Date().toISOString() }); } catch {}
                await verifiedGoSetPassword(chatId, verifyToken);
                verifiedSite = true;
              } else {
                await tg("sendMessage", { chat_id: chatId, text: "Номер не совпадает с тем, что вы указали при регистрации. Попробуйте снова.", reply_markup: { remove_keyboard: true } });
                return res.status(200).send("ok");
              }
            }
          }
        } catch (e) { console.error("site verify contact error", e); }
        if (!verifiedSite) {
          // АНТИФРОД: привязка к аккаунту клиента — ТОЛЬКО по СВОЕМУ контакту (request_contact),
          // а не по пересланной чужой карточке. Иначе любой, переслав контакт клиента, войдёт в его аккаунт.
          const sharedOwn = String(u.message.contact.user_id || "") === String(u.message.from?.id || "");
          if (u.message.from?.is_bot || !sharedOwn) {
            await alertImpersonation(u.message.from, u.message.contact.phone_number, "вход в бота");
            await tg("sendMessage", { chat_id: chatId, text: "Поделитесь СВОИМ контактом кнопкой ниже. Пересланный чужой номер для входа не подходит.", reply_markup: { keyboard: [[{ text: "📱 Поделиться номером", request_contact: true }]], resize_keyboard: true, one_time_keyboard: true } });
            return res.status(200).send("ok");
          }
          // директория контактов бота — чтобы владелец мог ПРИВЯЗАТЬ клиента вручную, если авто-match не сработал
          try { await supsert("bot_sessions", { chat_id: String(chatId), phone: String(phone), tg_name: fromName || "", tg_username: u.message.from?.username || "", updated_at: new Date().toISOString() }); } catch {}
          const c = await linkByPhone(phone, chatId, fromName, u.message.from?.username);
          const L = T[await getLang(chatId, c)] || T.ru;
          if (c) { await setLang(chatId, await getLang(chatId, null), c); await tg("sendMessage", { chat_id: chatId, text: L.found(c.name), reply_markup: { remove_keyboard: true } }); await clientMenu(chatId, c, L); }
          else await tg("sendMessage", { chat_id: chatId, text: L.notFound, reply_markup: { remove_keyboard: true } });
        }
        return res.status(200).send("ok");
      }
      const raw = (u.message.text || "").trim();
      const text = raw.toLowerCase();
      const existing = await findByChat(chatId);
      if (text === "/lang") { await askLang(chatId); return res.status(200).send("ok"); }
      // /start verify_TOKEN — верификация номера при регистрации на сайте
      const verifyMatch = raw.match(/^\/start verify_([a-f0-9]{48})$/i);
      if (verifyMatch) {
        const token = verifyMatch[1].toLowerCase();
        const vrows = await sget(`site_verifications?token=eq.${encodeURIComponent(token)}&select=phone,verified,expires_at`);
        const v = vrows[0];
        if (!v || new Date(v.expires_at) < new Date()) {
          await tg("sendMessage", { chat_id: chatId, text: "Ссылка недействительна или истекла. Вернитесь на сайт и начните регистрацию заново." });
          return res.status(200).send("ok");
        }
        if (v.verified) {
          await verifiedGoSetPassword(chatId, token);
          return res.status(200).send("ok");
        }
        try { await supsert("bot_sessions", { chat_id: String(chatId), state: { verify_token: token }, updated_at: new Date().toISOString() }); } catch {}
        await tg("sendMessage", { chat_id: chatId, text: "Для подтверждения регистрации на generalmodern.uz нажмите кнопку ниже и поделитесь номером телефона.", reply_markup: { keyboard: [[{ text: "Поделиться номером", request_contact: true }]], resize_keyboard: true, one_time_keyboard: true } });
        return res.status(200).send("ok");
      }
      if (text === "/start" || !existing) {
        if (text === "/start") await sendIntro(chatId);   // показать логотип-анимацию при входе
        await askLang(chatId);
        return res.status(200).send("ok");
      }
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

      // подтверждение / отказ по заказу (после того как владелец проставил цены)
      if (data.startsWith("ocf:") || data.startsWith("ocd:")) {
        const sid = data.slice(4);
        const sale = (await sget(`sales?id=eq.${encodeURIComponent(sid)}&select=*`))[0];
        if (!sale) { await tg("sendMessage", { chat_id: chatId, text: "Заказ не найден." }); return res.status(200).send("ok"); }
        let owns = String(sale.order_from?.chat_id || "") === String(chatId);
        // подтвердить может ЛЮБОЙ привязанный к клиенту Telegram-аккаунт (несколько номеров клиента)
        if (!owns && sale.customer_id) {
          const cu = (await sget(`customers?id=eq.${sale.customer_id}&select=tg_chat_id,tg_chat_ids`))[0];
          const ids = Array.isArray(cu?.tg_chat_ids) ? cu.tg_chat_ids.map(String) : [];
          owns = String(cu?.tg_chat_id || "") === String(chatId) || ids.includes(String(chatId));
        }
        if (!owns) { await tg("sendMessage", { chat_id: chatId, text: "Этот заказ не привязан к вам." }); return res.status(200).send("ok"); }
        const confirm = data.startsWith("ocf:");
        await spatch(`sales?id=eq.${encodeURIComponent(sid)}`, { status: confirm ? "confirmed" : "order" });
        await tg("sendMessage", { chat_id: chatId, text: confirm ? "✅ Спасибо! Заказ подтверждён — мы готовим накладную." : "❌ Заказ отклонён. Мы свяжемся с вами." });
        // владельцу — КТО и КАКОЙ клиент подтвердил/отменил
        const custName = sale.customer_id ? ((await sget(`customers?id=eq.${sale.customer_id}&select=name`))[0]?.name || "Клиент") : (sale.order_from?.name || "Клиент");
        const who = ([cq.from?.first_name, cq.from?.last_name].filter(Boolean).join(" ") || "—") + (cq.from?.username ? " (@" + cq.from.username + ")" : "");
        const nPos = (sale.items || []).length;
        await notifyAdmin(confirm
          ? `✅ Заказ ПОДТВЕРЖДЁН\nКлиент: ${custName}\nПодтвердил: ${who}\nПозиций: ${nPos}`
          : `❌ Заказ ОТМЕНЁН клиентом\nКлиент: ${custName}\nОтменил: ${who}\nПозиций: ${nPos}`);
        return res.status(200).send("ok");
      }

      if (isAdmin(chatId)) {
        if (data === "a_cat") await tg("sendMessage", { chat_id: chatId, text: `🌐 ${PUBLIC_URL}/catalog` });
        else if (data === "a_clients") await adminClients(chatId);
        else if (data === "a_debts") await adminDebts(chatId);
        else if (data === "a_remind") { adminRemindDebtors(chatId); } // рассылка — без await, чтобы вебхук не таймаутил
        else if (data === "a_acts") await adminActs(chatId);
        else if (data === "act_all") { adminActAll(chatId); } // длинная рассылка — без await, чтобы вебхук не таймаутил
        else if (data.startsWith("act:")) await sendActTo(chatId, data.slice(4));
        else if (data.startsWith("cust:")) await adminClientCard(chatId, data.slice(5));
        else if (data.startsWith("ainv:")) await sendPDFto(chatId, data.slice(5));
        else if (data.startsWith("paysel:")) {
          // выбор клиента для оплаты, когда имя подходило нескольким
          const custId = data.slice(7);
          const sess = await sget(`bot_sessions?chat_id=eq.${chatId}&select=state`);
          const pp = sess[0]?.state?.pending_payment;
          if (!pp || !(Number(pp.amount) > 0)) { await tg("sendMessage", { chat_id: chatId, text: "Оплата устарела — введите заново «Имя сумма»." }); return res.status(200).send("ok"); }
          const cust = (await sget(`customers?id=eq.${encodeURIComponent(custId)}&select=id,name,opening_debt`))[0];
          if (!cust) { await tg("sendMessage", { chat_id: chatId, text: "Клиент не найден." }); return res.status(200).send("ok"); }
          await recordPayment(chatId, cust, Number(pp.amount), pp.currency || "som");
          try { await supsert("bot_sessions", { chat_id: String(chatId), state: {}, updated_at: new Date().toISOString() }); } catch {}
        }
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
        const rows = sales.slice(0, 20).map(s => { const t = (s.items || []).reduce((a, i) => a + i.qty * i.unit_price, 0); const st = invoiceCoverageStatus(s.id, sales, ipays, c.opening_debt); return [{ text: `${dt(s.date)} · ${money(t, s.currency)} ${stIcon(st)}`, callback_data: "inv:" + s.id }]; });
        await tg("sendMessage", { chat_id: chatId, text: L.invList, reply_markup: { inline_keyboard: rows } });
      } else if (data.startsWith("inv:")) {
        await sendPDFto(chatId, data.slice(4), L.invCap(dt((await sget(`sales?id=eq.${data.slice(4)}&select=date`))[0]?.date || Date.now())));
      }
      return res.status(200).send("ok");
    }
    return res.status(200).send("ok");
  } catch (e) { console.error("bot error", e); return res.status(200).send("ok"); }
}
