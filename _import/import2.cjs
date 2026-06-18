/* ============================================================
   Перенос из ПОЛНОГО бэкапа sklad-backup-full-*.json в Supabase.
   Логика 1:1 со старым приложением (stockOf, unitCostUZS, clientDebt):
     • остаток = initStock + приходы(!fromImport) − продажи(!fromImport)
     • себестоимость = средневзвешенная (unitCostUZS)
     • долг = продажи(paid=false) − оплаты   → продажи paid=true идут как «оплата при продаже»
   Курсы приложения выставляются из бэкапа (rateUSD/rateCNY).
   Запуск:
     node import2.cjs            → сухой прогон
     node import2.cjs SECRET     → реальная заливка (полная замена)
   ============================================================ */
const fs = require("fs");

const SRC_FILE = "C:/Users/ASUS/Downloads/sklad-backup-full-2026-06-06.json";
const SUPA_URL = "https://ttgcrcloioznojreogwn.supabase.co";
const SECRET = process.argv[2] || null;

const backup = JSON.parse(fs.readFileSync(SRC_FILE, "utf8"));
const src = backup.data;
const pics = backup.photos || {};

const RATE_USD = src.settings?.rateUSD || 12000; // 1 USD = N UZS
const RATE_CNY = src.settings?.rateCNY || 1790;  // 1 CNY = N UZS
const curMap = { UZS: "som", USD: "usd", CNY: "yuan" };
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const toUZS = (v, cur) => cur === "UZS" ? v : cur === "USD" ? v * RATE_USD : v * RATE_CNY;
const isoDate = (d) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) ? d + "T00:00:00Z" : new Date().toISOString();

// ---------- остаток (как stockOf: исключаем fromImport) ----------
const arrivedNI = {}, soldNI = {};
src.purchases.forEach(t => { if (t.status !== "transit" && !t.fromImport) arrivedNI[t.productId] = (arrivedNI[t.productId] || 0) + Number(t.qty || 0); });
src.sales.forEach(s => { if (!s.fromImport) soldNI[s.productId] = (soldNI[s.productId] || 0) + Number(s.qty || 0); });

// ---------- себестоимость (как unitCostUZS) ----------
const purByProd = {};
src.purchases.forEach(t => { (purByProd[t.productId] = purByProd[t.productId] || []).push(t); });
function unitCostUZS(p) {
  const cur = p.priceCur || "CNY";
  let q = 0, sumCNY = 0;
  (purByProd[p.id] || []).forEach(t => { if (t.status !== "transit" && !t.fromImport) { q += Number(t.qty || 0); sumCNY += Number(t.qty || 0) * Number(t.priceCNY || 0); } });
  if (q > 0) {
    let totUZS = toUZS(sumCNY, "CNY"), totQ = q;
    if (p.initStock > 0 && p.initPrice > 0) { totUZS += p.initStock * toUZS(p.initPrice, cur); totQ += p.initStock; }
    return totQ ? totUZS / totQ : 0;
  }
  return toUZS(p.initPrice || 0, cur);
}

// ---------- последняя цена продажи товара (для отображения) ----------
const lastSale = {};
src.sales.forEach(s => { const e = lastSale[s.productId]; if (!e || (s.date || "") >= (e.date || "")) lastSale[s.productId] = { price: Number(s.price || 0), cur: s.cur, date: s.date }; });

const products = src.products.map(p => {
  const stock = Number(p.initStock || 0) + (arrivedNI[p.id] || 0) - (soldNI[p.id] || 0);
  const costUZS = unitCostUZS(p);
  const ls = lastSale[p.id];
  const saleUZS = ls ? toUZS(ls.price, ls.cur) : toUZS(Number(p.initPrice || 0), p.priceCur || "CNY");
  return {
    old_id: p.id, name: p.name || "Без названия", category: p.category || "",
    stock_qty: stock,
    cost_usd: r2(costUZS / RATE_USD), cost_yuan: r2(costUZS / RATE_CNY),
    price_yuan: r2(saleUZS / RATE_CNY), price_usd: r2(saleUZS / RATE_USD), price_som: Math.round(saleUZS),
    status_override: null, has_photo: !!(p.hasPhoto && pics[p.id]),
  };
});

const customers = src.clients.map(c => ({ old_id: c.id, name: c.name || "Без имени", contact: c.phone || "", tg_chat_id: "", note: "" }));

// продажи -> накладные (по клиент+дата+валюта+оплачено)
const saleGroups = {};
src.sales.forEach(s => {
  const cur = curMap[s.cur] || "som";
  const paid = !!s.paid;
  const key = (s.clientId || "none") + "|" + (s.date || "") + "|" + cur + "|" + paid;
  (saleGroups[key] = saleGroups[key] || { old_client_id: s.clientId || null, date: s.date, currency: cur, paid, items: [] })
    .items.push({ old_product_id: s.productId, qty: Number(s.qty || 0), unit_price: Number(s.price || 0), currency: cur, price_yuan_norm: r2(toUZS(Number(s.price || 0), s.cur) / RATE_CNY), paid });
});
const sales = Object.values(saleGroups);

// приходы -> по поставщик+дата+статус (чтобы JET/JACK/Хелин и «в дороге» сохранились)
const purGroups = {};
src.purchases.forEach(t => {
  const sup = t.supplier || "Без поставщика";
  const st = t.status === "arrived" ? "arrived" : "in_transit";
  const key = sup + "|" + (t.date || "") + "|" + st;
  (purGroups[key] = purGroups[key] || { supplier: sup, date: t.date, currency: "yuan", status: st, items: [] })
    .items.push({ old_product_id: t.productId, qty: Number(t.qty || 0), unit_cost: Number(t.priceCNY || 0), currency: "yuan" });
});
const purchases = Object.values(purGroups);

// оплаты: только реальные платежи по долгам (оплата при продаже теперь видна
// как признак paid у накладной, а не как отдельный платёж)
const payments = src.payments.map(p => ({ old_client_id: p.clientId, amount: Number(p.amount || 0), currency: curMap[p.cur] || "som", date: p.date, note: p.note || "Оплата" }));

// курсы приложения из бэкапа
const APP_RATES = { rate_yuan_usd: RATE_CNY / RATE_USD, rate_som_usd: 1 / RATE_USD, rates_updated_at: new Date().toISOString() };

// ---------- сводка + проверка ----------
let stockSumUZS = 0;
products.forEach(p => { stockSumUZS += p.stock_qty * (p.cost_usd * RATE_USD); });
console.log("=== СВОДКА ===");
console.log("Товары:", products.length, "| Клиенты:", customers.length, "| Накладные:", sales.length, "| Приходы:", purchases.length, "| Оплаты:", payments.length);
console.log("Курсы: 1$=", RATE_USD, " 1¥=", RATE_CNY, " → app rate_yuan_usd=", r2(APP_RATES.rate_yuan_usd), " rate_som_usd=", APP_RATES.rate_som_usd.toFixed(8));
console.log("СУММА СКЛАДА (себестоимость): ", Math.round(stockSumUZS).toLocaleString("ru-RU"), "сум  ≈ $", Math.round(stockSumUZS / RATE_USD).toLocaleString("ru-RU"));
// проверка долга по клиентам (как в источнике, по валютам)
const cById = Object.fromEntries(src.clients.map(c => [c.id, c.name]));
const debt = {};
src.sales.forEach(s => { if (s.clientId && !s.paid) { (debt[s.clientId] = debt[s.clientId] || { UZS: 0, USD: 0, CNY: 0 }); debt[s.clientId][s.cur] += s.qty * s.price; } });
src.payments.forEach(p => { if (p.clientId && debt[p.clientId]) debt[p.clientId][p.cur] -= p.amount; });
console.log("Долги клиентов (источник):");
src.clients.forEach(c => { const b = debt[c.id]; if (b) { const parts = []; if (Math.abs(b.UZS) >= 1) parts.push(Math.round(b.UZS) + " сум"); if (Math.abs(b.USD) >= 0.01) parts.push(b.USD.toFixed(2) + "$"); if (Math.abs(b.CNY) >= 0.01) parts.push(b.CNY.toFixed(2) + "¥"); console.log("  " + c.name + ": " + (parts.join(" + ") || "0")); } });

if (!SECRET) { console.log("\n[Сухой прогон] запись не выполнялась."); process.exit(0); }

const H = { apikey: SECRET, Authorization: "Bearer " + SECRET, "Content-Type": "application/json" };
const rest = (path, opt = {}) => fetch(SUPA_URL + "/rest/v1/" + path, { ...opt, headers: { ...H, ...(opt.headers || {}) } });
async function insertReturn(table, rows) {
  const out = []; const B = 200;
  for (let i = 0; i < rows.length; i += B) {
    const r = await rest(table, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(rows.slice(i, i + B)) });
    if (!r.ok) throw new Error(table + " " + r.status + ": " + (await r.text()).slice(0, 300));
    out.push(...await r.json()); process.stdout.write(`  ${table}: ${out.length}/${rows.length}\r`);
  }
  console.log(""); return out;
}
async function uploadPhoto(path, dataUrl) {
  const m = /^data:(image\/\w+);base64,(.*)$/s.exec(dataUrl); if (!m) return null;
  const r = await fetch(SUPA_URL + "/storage/v1/object/product-photos/" + path, { method: "POST", headers: { apikey: SECRET, Authorization: "Bearer " + SECRET, "Content-Type": m[1], "x-upsert": "true" }, body: Buffer.from(m[2], "base64") });
  return r.ok ? SUPA_URL + "/storage/v1/object/public/product-photos/" + path : null;
}

(async function run() {
  try {
    console.log("\nОбновляю курсы приложения…");
    await rest("settings?id=eq.1", { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(APP_RATES) });

    console.log("Полная замена: очищаю таблицы…");
    for (const t of ["sales", "purchases", "payments", "products", "customers"])
      await rest(t + "?id=not.is.null", { method: "DELETE", headers: { Prefer: "return=minimal" } });

    console.log("Клиенты…");
    const insCust = await insertReturn("customers", customers.map(({ old_id, ...c }) => c));
    const custMap = {}; customers.forEach((c, i) => custMap[c.old_id] = insCust[i].id);

    console.log("Фото в хранилище…");
    const photoUrl = {}; const withPhoto = products.filter(p => p.has_photo); let done = 0; const CH = 8;
    for (let i = 0; i < withPhoto.length; i += CH) {
      await Promise.all(withPhoto.slice(i, i + CH).map(async p => { const u = await uploadPhoto(p.old_id + ".jpg", pics[p.old_id]); if (u) photoUrl[p.old_id] = u; done++; }));
      process.stdout.write(`  фото: ${done}/${withPhoto.length}\r`);
    }
    console.log("");

    console.log("Товары…");
    const insProd = await insertReturn("products", products.map(p => ({ name: p.name, category: p.category, stock_qty: p.stock_qty, cost_usd: p.cost_usd, cost_yuan: p.cost_yuan, price_yuan: p.price_yuan, price_usd: p.price_usd, price_som: p.price_som, status_override: null, photo_url: photoUrl[p.old_id] || "" })));
    const prodMap = {}; products.forEach((p, i) => prodMap[p.old_id] = insProd[i].id);

    console.log("Накладные…");
    await insertReturn("sales", sales.map(s => ({ customer_id: s.old_client_id ? custMap[s.old_client_id] || null : null, date: isoDate(s.date), currency: s.currency, status: "final", telegram_sent: false, items: s.items.map(it => ({ product_id: prodMap[it.old_product_id] || null, qty: it.qty, unit_price: it.unit_price, currency: it.currency, price_yuan_norm: it.price_yuan_norm, paid: !!it.paid })) })));

    console.log("Приходы…");
    await insertReturn("purchases", purchases.map(t => ({ supplier: t.supplier, date: isoDate(t.date), currency: t.currency, status: t.status, items: t.items.map(it => ({ product_id: prodMap[it.old_product_id] || null, qty: it.qty, unit_cost: it.unit_cost, currency: it.currency })) })));

    console.log("Оплаты…");
    await insertReturn("payments", payments.map(p => ({ customer_id: p.old_client_id ? custMap[p.old_client_id] || null : null, amount: p.amount, currency: p.currency, date: isoDate(p.date), note: p.note })));

    console.log("\n✅ ГОТОВО! Данные пересчитаны по логике источника и заменены.");
  } catch (e) { console.error("\n❌ Ошибка:", e.message); process.exit(1); }
})();
