// POST /api/admin-auth — вход в склад
// Проверяет: data/admin-creds.json (PBKDF2) → .env ADMIN_LOGIN/ADMIN_PASSWORD (plain)
import crypto from "crypto";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { verifyPassword } from "./lib/clientauth.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const CREDS_FILE = join(__dir, "../data/admin-creds.json");

function readCreds() {
  try { return JSON.parse(readFileSync(CREDS_FILE, "utf8")); } catch { return null; }
}

function signJWT(secret) {
  const header  = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const now     = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ role: "admin", iat: now, exp: now + 30 * 24 * 3600 })).toString("base64url");
  const sig     = crypto.createHmac("sha256", secret).update(header + "." + payload).digest().toString("base64url");
  return `${header}.${payload}.${sig}`;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  let body = req.body;
  if (typeof body === "string") try { body = JSON.parse(body); } catch { body = {}; }
  const { login, password } = body || {};

  if (!login || !password)
    return res.status(400).json({ error: "Введите логин и пароль" });

  const creds = readCreds(); // из data/admin-creds.json (после смены через UI)
  let ok = false;

  if (creds?.login && creds?.password_hash) {
    // PBKDF2-хэш (после первой смены через UI)
    ok = login.trim() === creds.login && await verifyPassword(password, creds.password_hash);
  } else {
    // Первичные значения из .env
    const ENV_LOGIN    = process.env.ADMIN_LOGIN    || "";
    const ENV_PASSWORD = process.env.ADMIN_PASSWORD || "";
    if (!ENV_LOGIN || !ENV_PASSWORD)
      return res.status(500).json({ error: "ADMIN_LOGIN и ADMIN_PASSWORD не заданы на сервере (.env)" });
    ok = login.trim() === ENV_LOGIN && password === ENV_PASSWORD;
  }

  if (!ok) return res.status(401).json({ error: "Неверный логин или пароль" });

  const secret = process.env.SITE_JWT_SECRET || "dev-secret-change-in-production";
  return res.status(200).json({ token: signJWT(secret) });
}
