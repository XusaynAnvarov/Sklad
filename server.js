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

app.use(express.json({ limit: "4mb" }));
app.use(express.urlencoded({ extended: true, limit: "4mb" }));

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
  [["POST"],  "/api/client/login",             "./api/client/login.js"],
  // кабинет
  [["GET"],   "/api/client/me",               "./api/client/me.js"],
  [["GET"],   "/api/client/orders",           "./api/client/orders.js"],
  [["GET"],   "/api/client/invoices",         "./api/client/invoices.js"],
  [["GET"],   "/api/client/payments",         "./api/client/payments.js"],
  [["GET"],   "/api/client/invoice-pdf",      "./api/client/invoice-pdf.js"],
  // заказ
  [["POST"],  "/api/site-order",              "./api/site-order.js"],
  // каталог (переиспользуем если есть)
  [["GET"],   "/api/catalog",                 "./api/catalog.js"],
  // адмнн
  [["GET"],   "/api/admin/site-clients",      "./api/admin/site-clients.js"],
  [["POST","DELETE"], "/api/admin/site-client-delete", "./api/admin/site-client-delete.js"],
  [["POST","DELETE"], "/api/admin/unblock",   "./api/admin/unblock.js"],
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
// SPA fallback
app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Not found" });
  res.sendFile(join(__dirname, "index.html"));
});

app.listen(PORT, () => console.log(`[GM] Server running on port ${PORT}`));
