// ====================================================================
//  Аутентификация клиентов сайта: JWT (HS256), PBKDF2-пароли, телефоны
//  Все функции без внешних зависимостей (только Node.js crypto).
// ====================================================================
import crypto from "crypto";
import { sget } from "./supa.js";
import { секретПодписи } from "./jwtsecret.js";

const JWT_EXPIRES_SEC = 30 * 24 * 3600; // 30 дней

function secret() {
  return секретПодписи();
}

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

// ---------- JWT ----------
export function signToken(payload) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const body = b64url(JSON.stringify({ ...payload, iat: now, exp: now + JWT_EXPIRES_SEC }));
  const sig = b64url(crypto.createHmac("sha256", secret()).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}

export function verifyToken(token) {
  if (!token) return null;
  try {
    const parts = String(token).split(".");
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expected = b64url(crypto.createHmac("sha256", secret()).update(`${header}.${body}`).digest());
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

export function getClient(req) {
  const h = req.headers["authorization"] || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  return verifyToken(token);
}

// ---------- Пароли (PBKDF2) ----------
const P2_ITER = 100000, P2_LEN = 64, P2_DIG = "sha512";

export function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.pbkdf2(String(password), salt, P2_ITER, P2_LEN, P2_DIG, (err, dk) => {
      if (err) reject(err);
      else resolve(`${salt}:${dk.toString("hex")}`);
    });
  });
}

export function verifyPassword(password, stored) {
  return new Promise((resolve) => {
    const [salt, hash] = (stored || "").split(":");
    if (!salt || !hash) return resolve(false);
    crypto.pbkdf2(String(password), salt, P2_ITER, P2_LEN, P2_DIG, (err, dk) => {
      if (err) return resolve(false);
      const derived = dk.toString("hex");
      try {
        resolve(
          derived.length === hash.length &&
          crypto.timingSafeEqual(Buffer.from(derived), Buffer.from(hash))
        );
      } catch { resolve(false); }
    });
  });
}

// ---------- Телефоны ----------
export function normPhone(s) {
  return String(s || "").replace(/\D/g, "").slice(-9);
}

// ---------- Токены верификации ----------
export function genVerifToken() {
  return crypto.randomBytes(24).toString("hex");
}

// ---------- Коды входа (2FA через Telegram) ----------
export function genCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}
export function hashCode(code) {
  return crypto.createHash("sha256").update(String(code)).digest("hex");
}
export function verifyCode(code, stored) {
  if (!stored) return false;
  const h = hashCode(code);
  try { return h.length === stored.length && crypto.timingSafeEqual(Buffer.from(h), Buffer.from(stored)); }
  catch { return false; }
}

// ---------- Сессии и доверенные устройства ----------
export function genSessionId() {
  return crypto.randomBytes(16).toString("hex");
}
// Отпечаток устройства (хэшируем device_id из localStorage клиента).
export function hashDevice(deviceId) {
  return crypto.createHash("sha256").update(String(deviceId || "")).digest("hex");
}

// ---------- Отзыв входов при смене пароля ----------
// В токен кладётся «отпечаток» пароля (pv) — 12 знаков хэша от хэша. Пароль
// сменился → отпечаток другой → все прежние токены, на всех устройствах,
// перестают работать. Сам пароль из отпечатка не восстановить.
export function отпечатокПароля(password_hash) {
  return crypto.createHash("sha256").update("pv:" + String(password_hash || "")).digest("hex").slice(0, 12);
}
// Токены, выданные ДО появления отпечатка, его не несут. Для них при смене
// пароля в site_accounts.session_id пишется метка «rev:<время>» (колонка
// нигде больше не проверяется): такой старый токен, выданный раньше метки,
// отклоняется. Вход эту метку не затирает (см. login.js).
export const меткаОтзыва = () => "rev:" + Date.now();
function отозванСтарый(payload, session_id) {
  const m = /^rev:(\d+)$/.exec(String(session_id || ""));
  return !!m && (Number(payload.iat || 0) * 1000) < Number(m[1]);
}

// Валидность клиента: аккаунт существует и пароль с момента выдачи токена не менялся.
// НЕ выкидываем при входе с другого устройства — на своём устройстве пользователь остаётся в системе.
// Возвращает payload + customer_id и phone_db из базы; legacy:true — токен без отпечатка
// (такой токен кабинет тихо меняет на новый, см. api/client/cabinet.js).
export async function getValidClient(req) {
  const payload = getClient(req);
  if (!payload || !payload.sub) return null;
  let rows;
  try {
    rows = await sget(`site_accounts?id=eq.${encodeURIComponent(payload.sub)}&select=id,customer_id,phone,password_hash,session_id`);
  } catch { return payload; }   // база недоступна — не выкидываем (как и раньше)
  const acc = rows[0];
  if (!acc) return null;
  if (payload.pv) { if (payload.pv !== отпечатокПароля(acc.password_hash)) return null; }
  else if (отозванСтарый(payload, acc.session_id)) return null;
  // Привязку к клиенту берём из базы, а не из токена: если владелец
  // перепривязал аккаунт, старый токен (живёт 30 дней) не должен
  // показывать данные прежнего клиента.
  return { ...payload, customer_id: acc.customer_id || null, phone_db: acc.phone || null, legacy: !payload.pv, _pv: отпечатокПароля(acc.password_hash) };
}

// Свежий токен для того же входа (после смены пароля/номера или вместо старого без отпечатка).
export function обновитьТокен(client, extra = {}) {
  const { iat, exp, legacy, _pv, phone_db, ...p } = client;
  return signToken({ ...p, ...extra, pv: extra.pv || _pv });
}
