// ========================================================================
//  СЛОЙ ДАННЫХ
//  Работает в двух режимах:
//   • supabase — если в config.js заданы SUPABASE_URL и SUPABASE_ANON_KEY
//   • local    — иначе: данные в localStorage + демо-наполнение
//  Весь остальной код приложения использует только объект `db`,
//  не зная, какой режим активен.
// ========================================================================

const cfg = window.APP_CONFIG || {};
const useSupabase = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);

export const DB_MODE = useSupabase ? "supabase" : "local";

// ---------- утилиты ----------
const uid = () => "id_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const todayISO = () => new Date().toISOString();

// ====================================================================
//  ЛОКАЛЬНЫЙ РЕЖИМ
// ====================================================================
const LS_KEY = "sklad_db_v1";

function seed() {
  const p = (name, category, photo, stock, cost_usd, cost_yuan, price_yuan, price_usd, price_som) =>
    ({ id: uid(), name, category, photo_url: photo, stock_qty: stock,
       cost_usd, cost_yuan, price_yuan, price_usd, price_som,
       status_override: null, created_at: todayISO() });

  const products = [
    p("Беспроводные наушники TWS", "Электроника", "https://picsum.photos/seed/tws/400", 24, 6.2, 44, 70, 11, 138000),
    p("Смарт-часы Series 9", "Электроника", "https://picsum.photos/seed/watch/400", 8, 14, 100, 150, 22, 278000),
    p("Рюкзак городской", "Аксессуары", "https://picsum.photos/seed/bag/400", 0, 5, 36, 60, 9, 113000),
    p("Power Bank 20000mAh", "Электроника", "https://picsum.photos/seed/pb/400", 40, 4.5, 32, 55, 8.5, 107000),
    p("Кроссовки Run Pro", "Обувь", "https://picsum.photos/seed/shoe/400", 15, 12, 86, 130, 19, 240000),
    p("Чехол силиконовый", "Аксессуары", "https://picsum.photos/seed/case/400", 0, 0.8, 6, 12, 2, 25000),
  ];
  const customers = [
    { id: uid(), name: "Магазин «Олтин»", contact: "+998 90 123-45-67", note: "Опт", tg_chat_id: "" },
    { id: uid(), name: "Бахтиёр (Чорсу)", contact: "@bakhtiyor", note: "Постоянный", tg_chat_id: "" },
  ];
  // одна демонстрационная продажа (для «последней цены клиенту»)
  const sales = [{
    id: uid(), customer_id: customers[1].id, date: todayISO(), currency: "yuan",
    status: "final", telegram_sent: false,
    items: [
      { id: uid(), product_id: products[0].id, qty: 5, unit_price: 65, currency: "yuan", price_yuan_norm: 65 },
      { id: uid(), product_id: products[3].id, qty: 3, unit_price: 50, currency: "yuan", price_yuan_norm: 50 },
    ],
  }];
  const purchases = [{
    id: uid(), supplier: "1688 / Гуанчжоу", date: todayISO(), currency: "yuan",
    status: "in_transit",
    items: [ { id: uid(), product_id: products[2].id, qty: 50, unit_cost: 36, currency: "yuan" } ],
  }];
  // демонстрационная оплата (для «последней оплаты»)
  const payments = [
    { id: uid(), customer_id: customers[1].id, amount: 300, currency: "yuan", date: todayISO(), note: "Частичная оплата" },
  ];
  const settings = {
    rate_yuan_usd: cfg.DEFAULT_RATES?.yuan_usd ?? 0.14,
    rate_som_usd: cfg.DEFAULT_RATES?.som_usd ?? 0.000079,
    rates_mode: "manual",
    rates_updated_at: todayISO(),
    telegram_channel: cfg.TELEGRAM_CHANNEL || "",
  };
  return { products, customers, sales, purchases, payments, settings };
}

function load() {
  let data = null;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) data = JSON.parse(raw);
  } catch (e) { /* ignore */ }
  if (!data) { data = seed(); localStorage.setItem(LS_KEY, JSON.stringify(data)); return data; }
  // мягкая миграция: дозаполняем недостающие коллекции в старых данных
  for (const k of ["products", "customers", "sales", "purchases", "payments"]) if (!data[k]) data[k] = [];
  if (!data.settings) data.settings = seed().settings;
  return data;
}
let store = DB_MODE === "local" ? load() : null;
function persist() { localStorage.setItem(LS_KEY, JSON.stringify(store)); }

// ====================================================================
//  SUPABASE РЕЖИМ
// ====================================================================
let sb = null;
async function initSupabase() {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  sb = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
}
// Общий supabase-клиент (чтобы вход и запись шли через один экземпляр с сессией)
export function rawClient() { return sb; }

// Заголовок авторизации для вызовов serverless-эндпоинтов (/api/*).
// Приоритет: кастомный admin JWT (из /api/admin-auth) → Supabase сессия.
export async function authHeaders() {
  const adminToken = localStorage.getItem("sklad_admin_token");
  if (adminToken) return { Authorization: "Bearer " + adminToken };
  if (DB_MODE !== "supabase" || !sb) return {};
  try {
    const { data } = await sb.auth.getSession();
    const t = data?.session?.access_token;
    return t ? { Authorization: "Bearer " + t } : {};
  } catch { return {}; }
}

// ---------- обёртки CRUD ----------
function localCollection(name) {
  return {
    async list() { return [...store[name]]; },
    async get(id) { return store[name].find(x => x.id === id) || null; },
    async upsert(obj) {
      if (!obj.id) { obj.id = uid(); obj.created_at = obj.created_at || todayISO(); store[name].push(obj); }
      else {
        const i = store[name].findIndex(x => x.id === obj.id);
        if (i >= 0) store[name][i] = { ...store[name][i], ...obj }; else store[name].push(obj);
      }
      persist(); return obj;
    },
    async remove(id) { store[name] = store[name].filter(x => x.id !== id); persist(); },
  };
}

// Прокси через сервер (service_key): используется когда залогинен как admin (кастомный JWT).
// Обходит RLS без раскрытия service_key браузеру.
function adminToken() { return localStorage.getItem("sklad_admin_token") || ""; }
function adminHeaders() { return { "Content-Type": "application/json", Authorization: "Bearer " + adminToken() }; }

function handleAuthError() {
  localStorage.removeItem("sklad_admin_token");
  localStorage.removeItem("sklad_authed");
  location.reload();
}

async function adminGet(table, id) {
  const q = id ? `?table=${table}&id=${encodeURIComponent(id)}` : `?table=${table}`;
  const r = await fetch("/api/admin/db" + q, { headers: adminHeaders() });
  const j = await r.json();
  if (r.status === 401) { handleAuthError(); throw new Error("Сессия истекла"); }
  if (!r.ok) throw new Error(j.error || r.status);
  return j;
}
async function adminPost(table, op, data, id) {
  const r = await fetch("/api/admin/db", { method: "POST", headers: adminHeaders(), body: JSON.stringify({ table, op, data, id }) });
  const j = await r.json();
  if (r.status === 401) { handleAuthError(); throw new Error("Сессия истекла"); }
  if (!r.ok) throw new Error(j.error || r.status);
  return j;
}

function sbTable(name) {
  return {
    async list() {
      if (!adminToken()) throw new Error("Требуется авторизация");
      return adminGet(name);
    },
    async get(id) {
      if (!adminToken()) throw new Error("Требуется авторизация");
      return adminGet(name, id);
    },
    async upsert(obj) {
      if (!adminToken()) throw new Error("Требуется авторизация");
      return adminPost(name, "upsert", obj);
    },
    async remove(id) {
      if (!adminToken()) throw new Error("Требуется авторизация");
      // в Корзину: сохраняем копию записи перед удалением (для восстановления)
      try { const row = await adminGet(name, id); if (row && row.id) await adminPost("trash", "upsert", { entity: name, data: row, deleted_at: new Date().toISOString() }); } catch {}
      return adminPost(name, "delete", null, id);
    },
  };
}

// Корзина: список удалённого, восстановление и окончательное удаление
const trashApi = {
  async list() { if (!adminToken()) throw new Error("Требуется авторизация"); return adminGet("trash"); },
  async restore(item) {
    if (!adminToken()) throw new Error("Требуется авторизация");
    await adminPost(item.entity, "upsert", item.data);   // возвращаем запись в её таблицу
    await adminPost("trash", "delete", null, item.id);     // убираем из корзины
  },
  async purge(id) { if (!adminToken()) throw new Error("Требуется авторизация"); return adminPost("trash", "delete", null, id); },
};

// Накладные/приходы хранят позиции как вложенный массив (JSONB в Supabase,
// массив в localStorage) — единый интерфейс для обоих режимов.
function docCollection(name) {
  if (DB_MODE === "local") return localCollection(name);
  return sbTable(name);
}

// Сжатие изображения в браузере: ужимаем до maxDim по большей стороне и кодируем в JPEG.
// Большие фото с телефона (5–12 МБ) → ~200–600 КБ, что проходит лимиты сервера (нет 413).
function fileToDataUrl(file) {
  return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(""); r.readAsDataURL(file); });
}
async function compressToDataUrl(file, maxChars = 650 * 1024) {
  if (!file || !String(file.type || "").startsWith("image/")) return fileToDataUrl(file);
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
    URL.revokeObjectURL(url);
    const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
    if (!w0 || !h0) return fileToDataUrl(file);
    // последовательно уменьшаем размер и качество, пока dataURL не уложится в лимит сервера (~800КБ)
    const dims = [1600, 1280, 1024, 860, 720, 560];
    const quals = [0.8, 0.68, 0.56, 0.45, 0.36];
    let best = "";
    for (const maxDim of dims) {
      let w = w0, h = h0;
      if (Math.max(w, h) > maxDim) { const k = maxDim / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const c2 = canvas.getContext("2d");
      c2.fillStyle = "#fff"; c2.fillRect(0, 0, w, h);   // белый фон (на случай прозрачного PNG → JPEG)
      c2.drawImage(img, 0, 0, w, h);
      for (const q of quals) {
        const out = canvas.toDataURL("image/jpeg", q);
        if (out && out.length > 32) best = out;
        if (out && out.length <= maxChars) return out; // уложились в лимит
      }
    }
    return best || fileToDataUrl(file);
  } catch { return fileToDataUrl(file); }
}

// ====================================================================
//  ПУБЛИЧНЫЙ API
// ====================================================================
export const db = {
  mode: DB_MODE,
  ready: (async () => { if (useSupabase) await initSupabase(); })(),

  products: DB_MODE === "local" ? localCollection("products") : sbTable("products"),
  customers: DB_MODE === "local" ? localCollection("customers") : sbTable("customers"),
  sales: docCollection("sales"),
  purchases: docCollection("purchases"),
  payments: DB_MODE === "local" ? localCollection("payments") : sbTable("payments"),
  trash: trashApi,

  async getSettings() {
    if (DB_MODE === "local") return { ...store.settings };
    let data = null;
    try {
      if (adminToken()) data = await adminGet("settings");
      else { const r = await sb.from("settings").select("*").limit(1).maybeSingle(); data = r.data; }
    } catch (e) { console.warn("getSettings:", e.message); }
    // если строки настроек ещё нет — не падаем, отдаём значения по умолчанию
    return data || {
      rate_yuan_usd: cfg.DEFAULT_RATES?.yuan_usd ?? 0.14,
      rate_som_usd: cfg.DEFAULT_RATES?.som_usd ?? 0.000079,
      rates_mode: "manual", rates_updated_at: new Date().toISOString(),
      telegram_channel: cfg.TELEGRAM_CHANNEL || "",
    };
  },
  async saveSettings(patch) {
    if (DB_MODE === "local") { store.settings = { ...store.settings, ...patch }; persist(); return store.settings; }
    if (adminToken()) return adminPost("settings", "saveSettings", patch);
    const cur = await this.getSettings();
    const { data } = await sb.from("settings").update(patch).eq("id", cur.id).select().single();
    return data;
  },

  // Загрузка фото: локально → dataURL (base64); Supabase → через серверный
  // эндпоинт /api/upload (сервисный ключ, минуя RLS).
  async uploadPhoto(file) {
    // сжимаем в браузере (макс 1600px, JPEG) — иначе большое фото с телефона даёт 413 (слишком большой запрос)
    const dataUrl = await compressToDataUrl(file);
    if (DB_MODE === "local") return dataUrl;
    const resp = await fetch((cfg.UPLOAD_API || "/api/upload"), {
      method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ dataUrl, name: file.name }),
    });
    const j = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(j.error || ("Загрузка не удалась " + resp.status));
    return j.url;
  },

  // Последняя цена в юанях, по которой товар продавался данному клиенту.
  async lastYuanPriceForCustomer(customerId, productId) {
    const info = await this.lastSaleInfoForCustomer(customerId, productId);
    return info ? info.priceYuan : null;
  },

  // Карта последних цен клиента по ВСЕМ товарам за один проход (для редактора заказа).
  // product_id → { price, currency, date }. Берём первую (самую свежую) продажу каждого товара.
  async lastPricesForCustomer(customerId) {
    const map = new Map();
    if (!customerId) return map;
    const sales = (await this.sales.list())
      .filter(s => s.customer_id === customerId)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    for (const s of sales) {
      for (const it of (s.items || [])) {
        if (!it.product_id || map.has(it.product_id)) continue;
        if (it.unit_price == null && it.price_yuan_norm == null) continue;
        map.set(it.product_id, { price: it.unit_price != null ? it.unit_price : null, currency: it.currency || s.currency || "som", priceYuan: it.price_yuan_norm != null ? it.price_yuan_norm : null, date: s.date });
      }
    }
    return map;
  },

  // Последняя продажа товара клиенту: ТОЧНАЯ цена в её валюте + дата.
  // (раньше возвращали цену в юанях и пересчитывали обратно — давало дрейф из-за округления/курса)
  async lastSaleInfoForCustomer(customerId, productId) {
    if (!customerId || !productId) return null;
    const sales = await this.sales.list();
    const rows = sales
      .filter(s => s.customer_id === customerId)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    for (const s of rows) {
      const it = (s.items || []).find(i => i.product_id === productId);
      if (it && (it.unit_price != null || it.price_yuan_norm != null)) {
        return {
          price: it.unit_price != null ? it.unit_price : null,
          currency: it.currency || s.currency || "som",
          priceYuan: it.price_yuan_norm != null ? it.price_yuan_norm : null,
          date: s.date,
        };
      }
    }
    return null;
  },

  // Полный сброс локальных демо-данных (кнопка в настройках).
  resetLocal() { if (DB_MODE === "local") { store = seed(); persist(); } },
};
