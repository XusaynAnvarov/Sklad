// ========================================================================
//  ВХОД В СКЛАД — ТОЛЬКО НАШИМ ТОКЕНОМ.   node _tools/tests/t-auth-legacy.mjs
//
//  До 24.11.2026 getUser пускал как администратора ЛЮБОГО, у кого есть
//  вход через Supabase Auth, а регистрация там открыта публичным ключом
//  из кода сайта. Проверяем, что дверь закрыта: чужой токен не проходит,
//  и в Supabase за его проверкой мы даже не ходим.
// ========================================================================
import crypto from "crypto";

process.env.SITE_JWT_SECRET = process.env.SITE_JWT_SECRET || "test-secret-for-auth-legacy-0123456789";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "service-key-test";

const корень = new URL("../../", import.meta.url);
const { getUser } = await import(new URL("api/lib/auth.js", корень));
const { секретПодписи } = await import(new URL("api/lib/jwtsecret.js", корень));

let плохо = 0;
const ok = (имя, условие) => { if (условие) console.log("✅", имя); else { console.log("❌", имя); плохо++; } };

let сеть = 0;
globalThis.fetch = async () => { сеть++; return new Response(JSON.stringify({ id: "supabase-user-1", email: "x@y.z" })); };

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const наш = (role) => {
  const h = b64({ alg: "HS256", typ: "JWT" }), p = b64({ role, exp: Math.floor(Date.now() / 1000) + 600 });
  const s = crypto.createHmac("sha256", секретПодписи()).update(h + "." + p).digest().toString("base64url");
  return `${h}.${p}.${s}`;
};
const запрос = (токен) => ({ headers: { authorization: "Bearer " + токен } });

ok("наш токен администратора проходит", (await getUser(запрос(наш("admin"))))?.role === "admin");
ok("гость проходит только там, где разрешено", (await getUser(запрос(наш("guest")))) === null
  && (await getUser(запрос(наш("guest")), { allowGuest: true }))?.role === "guest");

сеть = 0;
const чужой = b64({ alg: "HS256" }) + "." + b64({ sub: "supabase-user-1", role: "authenticated" }) + ".подпись";
ok("токен Supabase Auth администратором НЕ делает", (await getUser(запрос(чужой))) === null);
ok("и в Supabase за проверкой не ходим", сеть === 0);
ok("без токена — нет входа", (await getUser({ headers: {} })) === null);

console.log(плохо ? `\n❌ Провалено проверок: ${плохо}` : "\n✅ Всё сошлось");
process.exit(плохо ? 1 : 0);
