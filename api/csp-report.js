// POST /api/csp-report — отчёты браузера о нарушениях CSP (режим наблюдения, api/lib/csp.js).
//
// Отчёты складываются в память по ключу «правило + откуда грузили». О каждом
// НОВОМ ключе владелец получает одно сообщение в Telegram (не больше 15 в сутки),
// чтобы было видно, что ещё надо добавить в список перед включением защиты.
// Мусор от расширений браузера и внутренние адреса не считаем.
const ADMIN_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT = process.env.ADMIN_CHAT_ID;

const виденные = new Map();       // ключ → { count, first, page }
let сутки = { день: "", отправлено: 0 };
const МАКС_КЛЮЧЕЙ = 300;

const чистый = (v, n = 200) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, n);
function откуда(uri) {
  const s = чистый(uri, 300);
  if (!s || s === "inline" || s === "eval" || s === "data" || s === "blob") return s || "(пусто)";
  try { const u = new URL(s); return u.protocol === "https:" || u.protocol === "http:" ? u.origin : u.protocol; } catch { return s.slice(0, 80); }
}
const шум = (blocked, source) => /^(chrome|moz|safari|safari-web|ms-browser)-extension/i.test(blocked + " " + source) || /^(about|chrome|edge):/i.test(blocked);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  res.status(204).end();   // браузеру ответ не нужен — отвечаем сразу

  let body = req.body;
  if (typeof body === "string") try { body = JSON.parse(body); } catch { return; }
  // старый формат { "csp-report": {...} } и новый (Reporting API) — массив [{ body: {...} }]
  const пачка = Array.isArray(body) ? body.slice(0, 20).map(x => x && x.body) : [body && body["csp-report"]];
  for (const r of пачка) {
    if (!r || typeof r !== "object") continue;
    const правило = чистый(r["effective-directive"] || r.effectiveDirective || r["violated-directive"] || r.violatedDirective, 40).split(" ")[0];
    const заблок = откуда(r["blocked-uri"] || r.blockedURL);
    const источник = чистый(r["source-file"] || r.sourceFile, 200);
    if (!правило || шум(заблок, источник)) continue;
    let страница = "";
    try { страница = new URL(чистый(r["document-uri"] || r.documentURL, 300)).pathname.slice(0, 80); } catch {}
    const ключ = `${правило} ← ${заблок}`;
    const был = виденные.get(ключ);
    if (был) { был.count++; continue; }
    if (виденные.size >= МАКС_КЛЮЧЕЙ) continue;
    виденные.set(ключ, { count: 1, first: new Date().toISOString(), page: страница });
    console.warn("[CSP] новое нарушение:", ключ, "на", страница || "?");

    const день = new Date().toISOString().slice(0, 10);
    if (сутки.день !== день) сутки = { день, отправлено: 0 };
    if (ADMIN_TOKEN && ADMIN_CHAT && сутки.отправлено < 15) {
      сутки.отправлено++;
      fetch(`https://api.telegram.org/bot${ADMIN_TOKEN}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: ADMIN_CHAT, disable_web_page_preview: true, text: `🛡 CSP (наблюдение): сайт загрузил то, чего нет в списке разрешённого.\n\nПравило: ${правило}\nОткуда: ${заблок}\nСтраница: ${страница || "?"}\n\nНичего не сломано — это только отчёт. Перешлите это сообщение разработчику, чтобы добавить адрес в список.` }),
      }).catch(() => {});
    }
  }
}

// для тестов
export const _виденные = виденные;
