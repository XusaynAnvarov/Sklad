// ====================================================================
//  Аутентификация клиентов сайта: JWT (HS256), PBKDF2-пароли, телефоны
//  Все функции без внешних зависимостей (только Node.js crypto).
// ====================================================================
import crypto from "crypto";

const JWT_EXPIRES_SEC = 30 * 24 * 3600; // 30 дней

function secret() {
  return process.env.SITE_JWT_SECRET || "dev-secret-change-in-production";
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

export default (_, res) => res?.status(404).json({ error: 'Not an endpoint' });
