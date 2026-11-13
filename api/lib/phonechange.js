// ========================================================================
//  СМЕНА ТЕЛЕФОНА В КАБИНЕТЕ — только по коду из Telegram НОВОГО номера.
//
//  Телефон — это логин. Раньше клиент мог вписать себе любой свободный
//  номер, и настоящий владелец номера потом не мог зарегистрироваться.
//  Теперь код уходит в Telegram того, кто владеет новым номером:
//  чат берём из bot_sessions.phone, а туда бот пишет номер только после
//  того, как человек поделился СВОИМ контактом (проверка user_id в bot.js).
//
//  Коды живут в памяти процесса: таблица и миграция не нужны. После
//  перезапуска сервера код просто придётся запросить заново.
// ========================================================================
import { sget } from "./supa.js";
import { normPhone, genCode, hashCode, verifyCode } from "./clientauth.js";
import { isAdminPhone } from "./siteadmin.js";

const ЖИВЁТ = 5 * 60 * 1000;      // код действует 5 минут
const ПОПЫТОК = 5;                // неверных вводов до сгорания кода
const ПАУЗА = 60 * 1000;          // не чаще одного кода в минуту
const В_ЧАС = 5;                  // и не больше пяти кодов в час

const коды = new Map();           // customer_id → { phone, hash, exp, attempts, chat_id }
const выдачи = new Map();         // customer_id → [время выдачи, …]

function чистить() {
  if (коды.size < 2000 && выдачи.size < 2000) return;
  const now = Date.now();
  for (const [k, v] of коды) if (v.exp < now) коды.delete(k);
  for (const [k, v] of выдачи) if (!v.some(t => now - t < 3600e3)) выдачи.delete(k);
}

// Общие проверки нового номера: формат, служебные, заблокированные, занятые.
// Возвращает { ok, phone } или { ok:false, status, error }.
export async function проверитьНомер(raw, client) {
  const phone = normPhone(raw);
  if (phone.length < 9) return { ok: false, status: 400, error: "Неверный формат телефона (нужно 9 цифр)" };
  if (isAdminPhone(phone) && !isAdminPhone(client.phone))
    return { ok: false, status: 409, error: "Этот номер уже привязан к другому аккаунту" };

  const blocked = await sget(`blocked_phones?phone=eq.${encodeURIComponent(phone)}&select=phone`).catch(() => []);
  if (blocked.length) return { ok: false, status: 409, error: "Этот номер нельзя использовать" };

  const accs = await sget(`site_accounts?phone=eq.${encodeURIComponent(phone)}&select=id,customer_id`);
  if (accs.some(a => String(a.customer_id) !== String(client.customer_id) && String(a.id) !== String(client.sub)))
    return { ok: false, status: 409, error: "Этот номер уже привязан к другому аккаунту" };

  // номер, записанный в складе за ДРУГИМ клиентом, себе не забрать
  const all = await sget("customers?select=id,contact").catch(() => []);
  if (all.some(c => c.contact && String(c.id) !== String(client.customer_id) && normPhone(c.contact) === phone))
    return { ok: false, status: 409, error: "Этот номер записан за другим клиентом. Обратитесь к менеджеру." };

  return { ok: true, phone };
}

// Telegram-чат владельца номера: только из своего, проверенного ботом контакта.
export async function чатНомера(phone) {
  if (!/^\d{9}$/.test(phone)) return null;
  const rows = await sget(`bot_sessions?phone=like.*${phone}&select=chat_id,phone,updated_at&order=updated_at.desc&limit=5`).catch(() => []);
  const r = rows.find(x => normPhone(x.phone) === phone && x.chat_id);
  return r ? String(r.chat_id) : null;
}

// Можно ли выдать новый код (пауза и лимит в час). null — можно, иначе текст ошибки.
export function можноВыдать(cid) {
  чистить();
  const now = Date.now();
  const список = (выдачи.get(cid) || []).filter(t => now - t < 3600e3);
  выдачи.set(cid, список);
  const последний = список[список.length - 1];
  if (последний && now - последний < ПАУЗА)
    return `Код уже отправлен. Повторить можно через ${Math.ceil((ПАУЗА - (now - последний)) / 1000)} с.`;
  if (список.length >= В_ЧАС) return "Слишком много попыток. Попробуйте через час.";
  return null;
}

export function выдатьКод(cid, phone, chat_id) {
  const code = genCode();
  коды.set(cid, { phone, hash: hashCode(code), exp: Date.now() + ЖИВЁТ, attempts: 0, chat_id });
  (выдачи.get(cid) || выдачи.set(cid, []).get(cid)).push(Date.now());
  return code;
}

// Отменить выданный код (например, если сообщение не дошло).
export function забыть(cid) { коды.delete(cid); }

// Проверка кода. При успехе код сгорает и возвращается { ok, chat_id }.
export function проверитьКод(cid, phone, code) {
  const z = коды.get(cid);
  if (!z || z.exp < Date.now()) { коды.delete(cid); return { ok: false, error: "Код истёк. Запросите новый." }; }
  if (z.phone !== phone) return { ok: false, error: "Код выдан для другого номера. Запросите новый." };
  if (!/^\d{6}$/.test(String(code || "").trim()) || !verifyCode(String(code).trim(), z.hash)) {
    z.attempts++;
    if (z.attempts >= ПОПЫТОК) { коды.delete(cid); return { ok: false, error: "Слишком много неверных попыток. Запросите новый код." }; }
    return { ok: false, error: "Неверный код" };
  }
  коды.delete(cid);
  return { ok: true, chat_id: z.chat_id };
}

// для тестов
export function _сброс() { коды.clear(); выдачи.clear(); }
