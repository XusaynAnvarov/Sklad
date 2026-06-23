// POST /api/admin-change-password — смена логина/пароля склада
// Новые данные сохраняются в data/admin-creds.json (приоритет выше .env)
import { getUser } from "./lib/auth.js";
import { hashPassword, verifyPassword } from "./lib/clientauth.js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const CREDS_FILE = join(__dir, "../data/admin-creds.json");

export function readCreds() {
  try { return JSON.parse(readFileSync(CREDS_FILE, "utf8")); } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: "Не авторизован" });

  let body = req.body;
  if (typeof body === "string") try { body = JSON.parse(body); } catch { body = {}; }
  const { current_password, new_login, new_password } = body || {};

  if (!current_password) return res.status(400).json({ error: "Введите текущий пароль" });
  if (!new_password || new_password.length < 6) return res.status(400).json({ error: "Новый пароль — минимум 6 символов" });

  // Проверяем текущий пароль
  const stored = readCreds();
  const envLogin = process.env.ADMIN_LOGIN || "";
  const envPass  = process.env.ADMIN_PASSWORD || "";

  let currentOk = false;
  if (stored?.password_hash) {
    currentOk = await verifyPassword(current_password, stored.password_hash);
  } else {
    currentOk = (current_password === envPass);
  }
  if (!currentOk) return res.status(401).json({ error: "Текущий пароль неверный" });

  const login = (new_login || "").trim() || (stored?.login || envLogin);
  if (!login) return res.status(400).json({ error: "Укажите логин" });

  const password_hash = await hashPassword(new_password);
  try {
    mkdirSync(join(__dir, "../data"), { recursive: true });
    writeFileSync(CREDS_FILE, JSON.stringify({ login, password_hash }, null, 2), "utf8");
  } catch (e) {
    return res.status(500).json({ error: "Не удалось сохранить: " + e.message });
  }

  return res.status(200).json({ ok: true, login });
}
