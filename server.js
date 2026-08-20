// Express-сервер для VPS: маршрутизирует /api/* на обработчики
import express from "express";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// загружаем .env если есть
try {
  const { config } = await import("dotenv");
  config({ path: join(__dirname, ".env") });
} catch {}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true, limit: "12mb" }));

// совместимость res.status(n).json/.send с форматом Vercel-хендлеров
function wrapRes(res) {
  if (res._wrapped) return res;
  const orig = res;
  const proxy = new Proxy(orig, {
    get(target, prop) {
      if (prop === "status") return (code) => { target.statusCode = code; return proxy; };
      if (prop === "json") return (body) => { target.setHeader("Content-Type","application/json"); target.end(JSON.stringify(body)); };
      if (prop === "send") return (body) => { if (typeof body === "object" && body !== null) { target.setHeader("Content-Type","application/json"); target.end(JSON.stringify(body)); } else { target.end(String(body)); } };
      return typeof target[prop] === "function" ? target[prop].bind(target) : target[prop];
    }
  });
  proxy._wrapped = true;
  return proxy;
}

async function loadHandler(path) {
  const mod = await import(path + "?t=" + Date.now());
  return mod.default;
}

// таблица маршрутов: метод(ы) → путь
const routes = [
  // верификация и регистрация
  [["POST"],  "/api/client/verify-start",      "./api/client/verify-start.js"],
  [["GET"],   "/api/client/verify-status",     "./api/client/verify-status.js"],
  [["POST"],  "/api/client/register",          "./api/client/register.js"],
  [["POST"],  "/api/client/login-start",       "./api/client/login-start.js"],
  [["POST"],  "/api/client/login",             "./api/client/login.js"],
  // логин в склад (кастомный admin JWT)
  [["POST","OPTIONS"], "/api/admin-auth",           "./api/admin-auth.js"],
  [["POST"],  "/api/tg-admin-auth",           "./api/tg-admin-auth.js"],
  [["POST"],  "/api/admin/invoice-pdf",       "./api/admin/invoice-pdf.js"],
  [["POST"],  "/api/admin/day-report",        "./api/admin/day-report.js"],
  [["POST","OPTIONS"], "/api/admin-change-password","./api/admin-change-password.js"],
  // кабинет
  [["GET"],   "/api/client/me",               "./api/client/me.js"],
  [["POST"],  "/api/client/update-profile",   "./api/client/update-profile.js"],
  [["GET"],   "/api/client/orders",           "./api/client/orders.js"],
  [["GET"],   "/api/client/invoices",         "./api/client/invoices.js"],
  [["GET"],   "/api/client/payments",         "./api/client/payments.js"],
  [["GET"],   "/api/client/invoice-pdf",      "./api/client/invoice-pdf.js"],
  // заказ
  [["POST"],  "/api/site-order",              "./api/site-order.js"],
  // рассылка клиентам о новинках (при оприходовании прихода)
  [["POST"],  "/api/notify-new-products",     "./api/notify-new-products.js"],
  [["POST","OPTIONS"], "/api/send-guide",     "./api/send-guide.js"],
  // каталог (переиспользуем если есть)
  [["GET"],   "/api/catalog",                 "./api/catalog.js"],
  // загрузка фото товара в Supabase Storage (бакет product-photos)
  [["POST","OPTIONS"], "/api/upload",         "./api/upload.js"],
  // склад-админ: универсальный CRUD прокси (service_key, минуя RLS)
  [["GET","POST","DELETE","OPTIONS"], "/api/admin/db", "./api/admin/db.js"],
  [["GET"],   "/api/admin/site-clients",      "./api/admin/site-clients.js"],
  [["GET"],   "/api/admin/act-pdf",           "./api/admin/act-pdf.js"],
  [["GET"],   "/api/admin/bot-contacts",      "./api/admin/bot-contacts.js"],
  [["POST","OPTIONS"], "/api/video-sign-upload", "./api/video-sign-upload.js"],
  [["POST","OPTIONS"], "/api/supplier-order-pdf", "./api/supplier-order-pdf.js"],
  [["GET"],   "/api/videos",                  "./api/videos.js"],
  [["GET"],   "/api/video-url",               "./api/video-url.js"],
  [["POST","DELETE"], "/api/admin/site-client-delete", "./api/admin/site-client-delete.js"],
  [["POST","DELETE"], "/api/admin/unblock",   "./api/admin/unblock.js"],
  // сайт-админ (JWT клиента с phone=837138321)
  [["GET"],   "/api/admin-site/clients",      "./api/admin-site/clients.js"],
  [["GET"],   "/api/admin-site/orders",       "./api/admin-site/orders.js"],
  [["POST"],  "/api/admin-site/delete-client","./api/admin-site/delete-client.js"],
  [["GET"],   "/api/admin-site/client-detail","./api/admin-site/client-detail.js"],
  [["POST"],  "/api/admin-site/update-client","./api/admin-site/update-client.js"],
  [["GET"],   "/api/admin-site/report",       "./api/admin-site/report.js"],
  [["POST"],  "/api/admin-site/reset-client-password","./api/admin-site/reset-client-password.js"],
  [["POST"],  "/api/admin-site/impersonate",  "./api/admin-site/impersonate.js"],
  [["POST"],  "/api/admin-site/order-status", "./api/admin-site/order-status.js"],
  [["POST"],  "/api/client/change-password",  "./api/client/change-password.js"],
  // telegram
  [["POST"],  "/api/bot",                     "./api/bot.js"],
  [["POST","OPTIONS"], "/api/telegram",       "./api/telegram.js"],
  // существующие API склада
  [["GET","POST","PUT","DELETE","OPTIONS"], "/api/sales",     "./api/sales.js"],
  [["GET","POST","PUT","DELETE","OPTIONS"], "/api/products",  "./api/products.js"],
  [["GET","POST","PUT","DELETE","OPTIONS"], "/api/customers", "./api/customers.js"],
  [["GET","POST","PUT","DELETE","OPTIONS"], "/api/payments",  "./api/payments.js"],
  [["GET","POST","PUT","DELETE","OPTIONS"], "/api/invoices",  "./api/invoices.js"],
  [["GET","POST","PUT","DELETE","OPTIONS"], "/api/order",     "./api/order.js"],
  [["GET","POST","PUT","DELETE","OPTIONS"], "/api/auth",      "./api/auth.js"],
  [["GET","POST","PUT","DELETE","OPTIONS"], "/api/settings",  "./api/settings.js"],
];

for (const [methods, path, file] of routes) {
  const absFile = join(__dirname, file.replace(/^\.\//, ""));
  for (const method of methods) {
    app[method.toLowerCase()](path, async (req, res) => {
      try {
        // кэшируем обработчик в prod, перезагружаем в dev
        if (!app._handlers) app._handlers = {};
        if (!app._handlers[file]) app._handlers[file] = (await import(absFile)).default;
        const handler = app._handlers[file];
        if (!handler) return res.status(404).json({ error: "Handler not found: " + file });
        await handler(req, wrapRes(res));
      } catch (e) {
        console.error(`[${method} ${path}]`, e);
        try { wrapRes(res).status(500).json({ error: "Internal server error" }); } catch {}
      }
    });
  }
}

// статичные файлы (если Nginx не отдаёт — резервный вариант)
app.use(express.static(__dirname, { index: "index.html" }));
app.get("/admin", (req, res) => res.sendFile(join(__dirname, "admin.html")));
app.get("/admin.html", (req, res) => res.sendFile(join(__dirname, "admin.html")));
// Мини-приложение склада и каталог: без явных маршрутов они проваливались
// в SPA-заглушку и отдавали index.html вместо своей страницы.
app.get("/sklad", (req, res) => res.sendFile(join(__dirname, "sklad.html")));
app.get("/sklad.html", (req, res) => res.sendFile(join(__dirname, "sklad.html")));
app.get("/catalog", (req, res) => res.sendFile(join(__dirname, "catalog.html")));
app.get("/catalog.html", (req, res) => res.sendFile(join(__dirname, "catalog.html")));
// SPA fallback
app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Not found" });
  res.sendFile(join(__dirname, "index.html"));
});

// ---------- вечерние итоги дня в Telegram ----------
// В 20:00 по Ташкенту бот сам присылает владельцу оборот за день.
// Проверяем раз в минуту и запоминаем, за какой день уже отправили,
// чтобы после перезапуска сервера не прислать второй раз.
let lastDayReport = "";
setInterval(async () => {
  const now = new Date(Date.now() + 5 * 3600e3);            // Ташкент, UTC+5
  if (now.getUTCHours() !== 20 || now.getUTCMinutes() !== 0) return;
  const day = now.toISOString().slice(0, 10);
  if (lastDayReport === day) return;
  lastDayReport = day;
  try {
    const { dayRange, buildSummary, formatMessage } = await import("./api/admin/day-report.js?v=20260820f");
    const { sget } = await import("./api/lib/supa.js?v=20260820f");
    const { from, to, label } = dayRange();
    const [sales, products] = await Promise.all([
      sget("sales?status=eq.final&date=gte." + encodeURIComponent(from.toISOString()) +
           "&select=id,date,currency,status,source,customer_id,items"),
      sget("products?select=id,name"),
    ]);
    const token = process.env.CLIENT_BOT_TOKEN, chat = process.env.ADMIN_CHAT_ID;
    if (!token || !chat) return;
    await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: String(chat),
        text: formatMessage(buildSummary(sales, products, from, to), label),
      }),
    });
    console.log("[GM] Итоги дня отправлены:", label);
  } catch (e) { console.error("[GM] Итоги дня не ушли:", e.message); }
}, 60000);

app.listen(PORT, () => console.log(`[GM] Server running on port ${PORT}`));
