// ========================================================================
//  ОТПРАВКА SMS ЧЕРЕЗ ESKIZ.UZ
//
//  Зачем это рядом с Telegram-ботом. Код в боте человек копирует сам, а
//  код из SMS телефон подставляет в поле САМ — это и есть autocomplete
//  "one-time-code", который у нас уже стоит в поле ввода. Для Telegram
//  такое невозможно: браузер читает только SMS.
//
//  Плюс SMS выручает там, где бота нет вовсе: раньше клиент без
//  @generalmodernbot просто не мог войти.
//
//  Что нужно на сервере (.env):
//     ESKIZ_EMAIL     — почта кабинета eskiz.uz
//     ESKIZ_PASSWORD  — пароль кабинета
//     ESKIZ_FROM      — имя отправителя; до утверждения своего имени
//                       используется служебное 4546
//     CODE_CHANNEL    — telegram (по умолчанию) | sms | both
//
//  Пока ESKIZ_EMAIL и ESKIZ_PASSWORD не заданы, модуль молчит и говорит
//  «не настроено»: вход продолжает работать через Telegram, как раньше.
//
//  Устройство API Eskiz (сверено по трём независимым клиентам — Go, PHP,
//  Python, ссылки в разговоре с владельцем):
//     POST  https://notify.eskiz.uz/api/auth/login        email, password → token
//     PATCH https://notify.eskiz.uz/api/auth/refresh      продлить токен
//     POST  https://notify.eskiz.uz/api/message/sms/send  mobile_phone, message, from
//     Авторизация: заголовок Authorization: Bearer <токен>. Токен живёт
//     около 30 дней — держим его в памяти сервера 25 и берём заново,
//     если пришёл отказ 401.
// ========================================================================
import { взять, положить, забыть } from "./memcache.js";

const БАЗА = "https://notify.eskiz.uz";
const КЛЮЧ_ТОКЕНА = "eskiz:token";
const ТОКЕН_ЖИВЁТ = 25 * 24 * 3600;      // 25 дней, с запасом до тридцати
const ЖДЁМ = 12000;                      // дольше ждать ответа смысла нет

const ПОЧТА = () => process.env.ESKIZ_EMAIL || "";
const ПАРОЛЬ = () => process.env.ESKIZ_PASSWORD || "";
const ОТ = () => process.env.ESKIZ_FROM || "4546";

export const смсНастроены = () => !!(ПОЧТА() && ПАРОЛЬ());

// Какой канал для кода главный. По умолчанию ничего не меняется: код
// идёт в Telegram, а SMS подстраховывает, если бота нет.
export function каналКода() {
  const c = String(process.env.CODE_CHANNEL || "telegram").toLowerCase();
  return ["telegram", "sms", "both"].includes(c) ? c : "telegram";
}

// Eskiz ждёт номер двенадцатью цифрами: 998901112233. У нас в базе
// телефон лежит девятью (normPhone), поэтому дописываем код страны.
export function номерДляSMS(телефон) {
  const цифры = String(телефон || "").replace(/\D/g, "");
  if (цифры.length === 12 && цифры.startsWith("998")) return цифры;
  if (цифры.length === 9) return "998" + цифры;
  if (цифры.length === 13 && цифры.startsWith("9998")) return цифры.slice(1);
  return "";                              // чужой формат — отправлять не станем
}

async function запрос(путь, { метод = "POST", тело, токен } = {}) {
  const ctrl = new AbortController();
  const таймер = setTimeout(() => ctrl.abort(), ЖДЁМ);
  try {
    const заголовки = { Accept: "application/json" };
    if (токен) заголовки.Authorization = "Bearer " + токен;
    let body;
    if (тело) {
      // Форма, а не JSON: Eskiz построен на PHP и принимает поля формы.
      заголовки["Content-Type"] = "application/x-www-form-urlencoded";
      body = new URLSearchParams(тело).toString();
    }
    const r = await fetch(БАЗА + путь, { method: метод, headers: заголовки, body, signal: ctrl.signal });
    const текст = await r.text();
    let json = null;
    try { json = JSON.parse(текст); } catch { }
    return { ok: r.ok, статус: r.status, json, текст };
  } finally {
    clearTimeout(таймер);
  }
}

async function взятьТокен(заново = false) {
  if (!заново) {
    const есть = взять(КЛЮЧ_ТОКЕНА);
    if (есть) return есть;
  }
  const r = await запрос("/api/auth/login", { тело: { email: ПОЧТА(), password: ПАРОЛЬ() } });
  const токен = r.json?.data?.token || r.json?.token || null;
  if (!токен) {
    console.error("sms: не вышло войти в Eskiz —", r.статус, (r.текст || "").slice(0, 200));
    return null;
  }
  положить(КЛЮЧ_ТОКЕНА, токен, ТОКЕН_ЖИВЁТ);
  return токен;
}

// Отправить SMS. Не бросает — возвращает { ok, error }, потому что вход
// не должен падать из-за того, что у оператора что-то не так.
export async function отправитьSMS(телефон, текст) {
  if (!смсНастроены()) return { ok: false, error: "SMS не настроены (нет ESKIZ_EMAIL/ESKIZ_PASSWORD)" };
  const номер = номерДляSMS(телефон);
  if (!номер) return { ok: false, error: "Номер не похож на узбекский" };

  for (const свежий of [false, true]) {          // вторая попытка — с новым токеном
    const токен = await взятьТокен(свежий);
    if (!токен) return { ok: false, error: "Eskiz не дал токен" };
    let r;
    try {
      r = await запрос("/api/message/sms/send", {
        токен, тело: { mobile_phone: номер, message: текст, from: ОТ() },
      });
    } catch (e) {
      return { ok: false, error: "Сеть: " + e.message };
    }
    if (r.ok) return { ok: true, id: r.json?.id || r.json?.data?.id || null };
    // Токен протух — выбрасываем и идём на второй круг.
    if (r.статус === 401 && !свежий) { забыть(КЛЮЧ_ТОКЕНА); continue; }
    const причина = r.json?.message || (r.текст || "").slice(0, 200) || ("код " + r.статус);
    console.error("sms: Eskiz отказал —", r.статус, причина);
    return { ok: false, error: причина };
  }
  return { ok: false, error: "Не удалось отправить SMS" };
}
