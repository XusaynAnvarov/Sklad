// ========================================================================
//  Подпись Telegram Mini App (initData) и токен склада.
//  Telegram подписывает данные о том, кто открыл приложение, ключом бота.
//  Проверив подпись, мы точно знаем Telegram-аккаунт открывшего — пароль
//  на телефоне набирать не нужно.
//  Используется приёмом заказов (api/order.js) и входом владельца
//  в мини-приложение склада (api/tg-admin-auth.js).
// ========================================================================
import crypto from "crypto";

const MAX_AGE_SEC = 86400;   // подпись старше суток не принимаем

// Сравнение без утечки по времени: обычное !== выдаёт длину совпавшего префикса.
function safeEq(a, b) {
  const A = Buffer.from(String(a || ""), "utf8");
  const B = Buffer.from(String(b || ""), "utf8");
  if (A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
}

// Проверка подписи initData → объект user Telegram или null.
export function verifyInitData(initData, botToken, { maxAgeSec = MAX_AGE_SEC } = {}) {
  if (!initData || !botToken) return null;
  let params;
  try { params = new URLSearchParams(initData); } catch { return null; }
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const dataCheck = [...params.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const calc = crypto.createHmac("sha256", secret).update(dataCheck).digest("hex");
  if (!safeEq(calc, hash)) return null;
  // свежесть: старую подпись могли подсмотреть и переиграть
  const authDate = Number(params.get("auth_date") || 0);
  if (authDate && Date.now() / 1000 - authDate > maxAgeSec) return null;
  try { const u = params.get("user"); return u ? JSON.parse(u) : null; } catch { return null; }
}

// Тот же токен склада, что выдаёт вход по паролю (api/admin-auth.js).
// Один формат — значит /api/admin/db и остальные ручки работают без изменений.
// Токен с ролью и сроком жизни.
// Ролей две: admin — полный доступ, guest — ТОЛЬКО ПРОСМОТР.
// Гостевой нужен, чтобы дать человеку посмотреть склад и поискать ошибки,
// не рискуя данными: сервер не пустит его ни на одну запись.
export function signRoleJWT(secret, role, seconds) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ role, iat: now, exp: now + seconds })).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(header + "." + payload).digest().toString("base64url");
  return `${header}.${payload}.${sig}`;
}

export function signAdminJWT(secret, days = 30) {
  return signRoleJWT(secret, "admin", days * 24 * 3600);
}
