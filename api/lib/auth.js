// ========================================================================
//  Серверная проверка авторизации для эндпоинтов /api/*.
//  Принимает JWT администратора (Supabase Auth) из заголовка
//  Authorization: Bearer <token> и проверяет его у Supabase.
//  Возвращает объект пользователя или null. В Supabase Auth должны
//  существовать ТОЛЬКО доверенные аккаунты-админы.
// ========================================================================
const SUPA_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;

export async function getUser(req) {
  const h = req.headers.authorization || req.headers.Authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token || !SUPA_URL || !KEY) return null;
  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/user`, {
      headers: { apikey: KEY, Authorization: "Bearer " + token },
    });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? u : null;
  } catch {
    return null;
  }
}
