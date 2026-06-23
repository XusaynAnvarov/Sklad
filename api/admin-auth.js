// POST /api/admin-auth — вход в склад по логину+паролю из env
// Возвращает JWT, который getUser() в api/lib/auth.js принимает наравне с Supabase токеном.
import crypto from "crypto";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  let body = req.body;
  if (typeof body === "string") try { body = JSON.parse(body); } catch { body = {}; }
  const { login, password } = body || {};

  const ADMIN_LOGIN    = process.env.ADMIN_LOGIN;
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

  if (!ADMIN_LOGIN || !ADMIN_PASSWORD)
    return res.status(500).json({ error: "ADMIN_LOGIN и ADMIN_PASSWORD не заданы на сервере (.env)" });
  if (!login || !password)
    return res.status(400).json({ error: "Введите логин и пароль" });

  const loginOk = login.trim() === ADMIN_LOGIN;
  const passOk  = password === ADMIN_PASSWORD;
  if (!loginOk || !passOk)
    return res.status(401).json({ error: "Неверный логин или пароль" });

  const secret  = process.env.SITE_JWT_SECRET || "dev-secret-change-in-production";
  const header  = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const now     = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ role: "admin", iat: now, exp: now + 30 * 24 * 3600 })).toString("base64url");
  const sig     = crypto.createHmac("sha256", secret).update(header + "." + payload).digest().toString("base64url");

  return res.status(200).json({ token: `${header}.${payload}.${sig}` });
}
