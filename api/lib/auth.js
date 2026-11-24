// ========================================================================
//  Серверная проверка авторизации для эндпоинтов /api/*.
//  Принимает:
//    только наш JWT (выдаётся /api/admin-auth по логину, паролю и коду).
//    Вход через Supabase Auth больше не принимается — см. getUser.
// ========================================================================
import crypto from "crypto";
import { секретПодписи } from "./jwtsecret.js";


// Разбирает наш токен и возвращает роль ("admin" | "guest") либо null.
function verifyOurJWT(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, payload, sig] = parts;
    const secret = секретПодписи();
    const expected = crypto.createHmac("sha256", secret).update(header + "." + payload).digest().toString("base64url");
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (data.exp && data.exp < Math.floor(Date.now() / 1000)) return null;
    if (data.role === "admin" || data.role === "guest") return data.role;
    return null;
  } catch { return null; }
}

// Гостевой токен даёт ТОЛЬКО просмотр и принимается лишь там, где это
// разрешено явно: getUser(req, { allowGuest: true }). По умолчанию гость
// не проходит нигде — иначе достаточно забыть одну проверку в одной ручке,
// чтобы «посмотреть склад» превратилось в «поменять склад».
export async function getUser(req, { allowGuest = false } = {}) {
  const h     = req.headers.authorization || req.headers.Authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return null;

  // Наш токен (быстро, без сети)
  const role = verifyOurJWT(token);
  if (role === "admin") return { id: "admin", role: "admin" };
  if (role === "guest") return allowGuest ? { id: "guest", role: "guest" } : null;

  // Раньше здесь принимался ЛЮБОЙ вход через Supabase Auth — и пускал его
  // как администратора. Закрыто 24.11.2026: в проекте 0 пользователей
  // Supabase Auth, сайт этим входом не пользуется, а регистрация в
  // Supabase открыта по умолчанию и делается публичным ключом, который
  // лежит в коде сайта. То есть любой мог завести себе аккаунт и получить
  // права владельца склада. Вход в склад — только нашим токеном выше.
  return null;
}
