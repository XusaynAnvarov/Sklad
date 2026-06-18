/* ============================================================
   Перенос данных из старого sklad.html в наш Supabase.
   Запуск:
     node import.cjs            → сухой прогон (только показать)
     node import.cjs SECRET     → реальная заливка (SECRET = secret key Supabase)
     node import.cjs SECRET reset → сначала очистить таблицы, потом залить
   ============================================================ */
const fs = require("fs");

const SRC = "C:/Users/ASUS/Downloads/sklad.html";
const SUPA_URL = "https://ttgcrcloioznojreogwn.supabase.co";
const SECRET = process.argv[2] || null;
const RESET = process.argv[3] === "reset";

// ---------- читаем встроенные данные ----------
const html = fs.readFileSync(SRC, "utf8");
const ext = (id) => (html.match(new RegExp('id="' + id + '"[^>]*>([\\s\\S]*?)</script>')) || [])[1];
const src = JSON.parse(ext("__seedData"));
const pics = ext("__seedPhotos") ? JSON.parse(ext("__seedPhotos")) : {};

const RATE_USD = src.settings?.rateUSD || 12100; // 1 USD = N UZS
const RATE_CNY = src.settings?.rateCNY || 1800;  // 1 CNY = N UZS
const curMap = { UZS: "som", USD: "usd", CNY: "yuan" };
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const toUZS = (v, cur) => cur === "UZS" ? v : cur === "USD" ? v * RATE_USD : v * RATE_CNY;
const isoDate = (d) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) ? d + "T00:00:00Z" : new Date().toISOString();

// ---------- агрегаты по товарам (остаток, себестоимость) ----------
const arrivedByProd = {}, soldByProd = {}, lastCostCNY = {};
src.purchases.forEach(t => {
  if (t.status === "arrived") arrivedByProd[t.productId] = (arrivedByProd[t.productId] || 0) + Number(t.qty || 0);
  // последняя себестоимость в юанях (по дате)
  if (!lastCostCNY[t.productId] || (t.date || "") >= (lastCostCNY[t.productId].date || ""))
    lastCostCNY[t.productId] = { v: Number(t.priceCNY || 0), date: t.date };
});
src.sales.forEach(s => { soldByProd[s.productId] = (soldByProd[s.productId] || 0) + Number(s.qty || 0); });

// ---------- трансформация ----------
const products = src.products.map(p => {
  const uzs = toUZS(Number(p.initPrice || 0), p.priceCur || "UZS");
  const costYuan = lastCostCNY[p.id] ? lastCostCNY[p.id].v : 0;
  const stock = Number(p.initStock || 0) + (arrivedByProd[p.id] || 0) - (soldByProd[p.id] || 0);
  return {
    old_id: p.id,
    name: p.name || "Без названия",
    category: p.category || "",
    stock_qty: stock,
    cost_yuan: r2(costYuan),
    cost_usd: r2(costYuan * RATE_CNY / RATE_USD),
    price_yuan: r2(uzs / RATE_CNY),
    price_usd: r2(uzs / RATE_USD),
    price_som: Math.round(uzs),
    status_override: null,
    has_photo: !!(p.hasPhoto && pics[p.id]),
  };
});

const customers = src.clients.map(c => ({ old_id: c.id, name: c.name || "Без имени", contact: c.phone || "", tg_chat_id: "", note: "" }));

// продажи группируем по (клиент + дата + валюта) → одна накладная
const saleGroups = {};
src.sales.forEach(s => {
  const cur = curMap[s.cur] || "som";
  const key = (s.clientId || "none") + "|" + (s.date || "") + "|" + cur;
  (saleGroups[key] = saleGroups[key] || { old_client_id: s.clientId || null, date: s.date, currency: cur, items: [] })
    .items.push({
      old_product_id: s.productId, qty: Number(s.qty || 0), unit_price: Number(s.price || 0),
      currency: cur, price_yuan_norm: r2(toUZS(Number(s.price || 0), s.cur) / RATE_CNY),
    });
});
const sales = Object.values(saleGroups);

const purchases = src.purchases.map(t => ({
  supplier: "Импорт", date: t.date, currency: "yuan",
  status: t.status === "arrived" ? "arrived" : "in_transit",
  items: [{ old_product_id: t.productId, qty: Number(t.qty || 0), unit_cost: Number(t.priceCNY || 0), currency: "yuan" }],
}));

const payments = src.payments.map(p => ({
  old_client_id: p.clientId, amount: Number(p.amount || 0), currency: curMap[p.cur] || "som",
  date: p.date, note: p.note || "",
}));

// ---------- сводка ----------
console.log("=== СВОДКА ПЕРЕНОСА ===");
console.log("Товары:        ", products.length, "(с фото:", products.filter(p => p.has_photo).length + ")");
console.log("Клиенты:       ", customers.length);
console.log("Накладные:     ", sales.length, "(из", src.sales.length, "строк продаж)");
console.log("Приходы:       ", purchases.length);
console.log("Оплаты:        ", payments.length);
console.log("Курсы источника: 1$=", RATE_USD, "сум, 1¥=", RATE_CNY, "сум");
console.log("\nПример товара:", JSON.stringify({ ...products[0], has_photo: products[0].has_photo }));
console.log("Пример накладной:", JSON.stringify(sales[0]).slice(0, 220));

if (!SECRET) {
  console.log("\n[Сухой прогон] Ключ не передан — запись НЕ выполнялась.");
  console.log("Чтобы залить: node import.cjs <SECRET_KEY> [reset]");
  process.exit(0);
}

// ============================================================
//  РЕАЛЬНАЯ ЗАЛИВКА
// ============================================================
const H = { apikey: SECRET, Authorization: "Bearer " + SECRET, "Content-Type": "application/json" };
const rest = (path, opt = {}) => fetch(SUPA_URL + "/rest/v1/" + path, { ...opt, headers: { ...H, ...(opt.headers || {}) } });

async function insertReturn(table, rows) {
  const out = [];
  const B = 200;
  for (let i = 0; i < rows.length; i += B) {
    const batch = rows.slice(i, i + B);
    const r = await rest(table, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(batch) });
    if (!r.ok) throw new Error(table + " insert " + r.status + ": " + (await r.text()).slice(0, 300));
    out.push(...await r.json());
    process.stdout.write(`  ${table}: ${out.length}/${rows.length}\r`);
  }
  console.log("");
  return out;
}

async function uploadPhoto(path, dataUrl) {
  const m = /^data:(image\/\w+);base64,(.*)$/s.exec(dataUrl);
  if (!m) return null;
  const buf = Buffer.from(m[2], "base64");
  const r = await fetch(SUPA_URL + "/storage/v1/object/product-photos/" + path, {
    method: "POST", headers: { apikey: SECRET, Authorization: "Bearer " + SECRET, "Content-Type": m[1], "x-upsert": "true" }, body: buf,
  });
  if (!r.ok) { console.log("  фото", path, "ошибка", r.status); return null; }
  return SUPA_URL + "/storage/v1/object/public/product-photos/" + path;
}

(async function run() {
  try {
    if (RESET) {
      console.log("Очистка таблиц…");
      for (const t of ["sales", "purchases", "payments", "products", "customers"])
        await rest(t + "?id=not.is.null", { method: "DELETE", headers: { Prefer: "return=minimal" } });
    }

    // 1) клиенты
    console.log("Заливаю клиентов…");
    const insCust = await insertReturn("customers", customers.map(({ old_id, ...c }) => c));
    const custMap = {}; customers.forEach((c, i) => custMap[c.old_id] = insCust[i].id);

    // 2) фото → storage
    console.log("Загружаю фото в хранилище…");
    const photoUrl = {};
    const withPhoto = products.filter(p => p.has_photo);
    let done = 0; const CH = 8;
    for (let i = 0; i < withPhoto.length; i += CH) {
      await Promise.all(withPhoto.slice(i, i + CH).map(async p => {
        const url = await uploadPhoto(p.old_id + ".jpg", pics[p.old_id]);
        if (url) photoUrl[p.old_id] = url; done++;
      }));
      process.stdout.write(`  фото: ${done}/${withPhoto.length}\r`);
    }
    console.log("");

    // 3) товары
    console.log("Заливаю товары…");
    const prodRows = products.map(p => ({
      name: p.name, category: p.category, stock_qty: p.stock_qty,
      cost_usd: p.cost_usd, cost_yuan: p.cost_yuan,
      price_yuan: p.price_yuan, price_usd: p.price_usd, price_som: p.price_som,
      status_override: p.status_override, photo_url: photoUrl[p.old_id] || "",
    }));
    const insProd = await insertReturn("products", prodRows);
    const prodMap = {}; products.forEach((p, i) => prodMap[p.old_id] = insProd[i].id);

    // 4) накладные
    console.log("Заливаю накладные…");
    const saleRows = sales.map(s => ({
      customer_id: s.old_client_id ? custMap[s.old_client_id] || null : null,
      date: isoDate(s.date), currency: s.currency, status: "final", telegram_sent: false,
      items: s.items.map(it => ({ product_id: prodMap[it.old_product_id] || null, qty: it.qty, unit_price: it.unit_price, currency: it.currency, price_yuan_norm: it.price_yuan_norm })),
    }));
    await insertReturn("sales", saleRows);

    // 5) приходы
    console.log("Заливаю приходы…");
    const purRows = purchases.map(t => ({
      supplier: t.supplier, date: isoDate(t.date), currency: t.currency, status: t.status,
      items: t.items.map(it => ({ product_id: prodMap[it.old_product_id] || null, qty: it.qty, unit_cost: it.unit_cost, currency: it.currency })),
    }));
    await insertReturn("purchases", purRows);

    // 6) оплаты
    console.log("Заливаю оплаты…");
    const payRows = payments.map(p => ({
      customer_id: p.old_client_id ? custMap[p.old_client_id] || null : null,
      amount: p.amount, currency: p.currency, date: isoDate(p.date), note: p.note,
    }));
    await insertReturn("payments", payRows);

    console.log("\n✅ ГОТОВО! Все данные перенесены в Supabase.");
  } catch (e) {
    console.error("\n❌ Ошибка:", e.message);
    process.exit(1);
  }
})();
