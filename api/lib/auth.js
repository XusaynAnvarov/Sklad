// ========================================================================
//  Серверная проверка авторизации для эндпоинтов /api/*.
//  Принимает:
//    1. Кастомный admin JWT (выдаётся /api/admin-auth по логину+паролю из .env)
//    2. Суpabase Auth JWT (legacy, если Supabase-аккаунт настроен)
// ========================================================================
import crypto from "crypto";

const SUPA_URL = process.env.SUPABASE_URL;
const KEY      = process.env.SUPABASE_SERVICE_KEY;

function verifyAdminJWT(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const [header, payload, sig] = parts;
    const secret = process.env.SITE_JWT_SECRET || "dev-secret-change-in-production";
    const expected = crypto.createHmac("sha256", secret).update(header + "." + payload).digest().toString("base64url");
    if (sig.length !== expected.length) return false;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (data.exp && data.exp < Math.floor(Date.now() / 1000)) return false;
    return data.role === "admin";
  } catch { return false; }
}

export async function getUser(req) {
  const h     = req.headers.authorization || req.headers.Authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return null;

  // Кастомный admin JWT (быстро, без сети)
  if (verifyAdminJWT(token)) return { id: "admin", role: "admin" };

  // Supabase Auth JWT (legacy)
  if (!SUPA_URL || !KEY) return null;
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
