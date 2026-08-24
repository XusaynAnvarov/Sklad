// =====================================================================
//  Скрипт создания проверочного клиента для тестирования кабинета.
//  Запускать ТОЛЬКО на VPS: node scripts/seed-test-client.js
//  Требует .env с SUPABASE_URL и SUPABASE_SERVICE_KEY.
// =====================================================================
import "dotenv/config";
import { sget, supsert } from "../api/lib/supa.js?v=20260824a";
import { hashPassword, normPhone } from "../api/lib/clientauth.js?v=20260824a";

const TEST_PHONE_RAW = "+998 90 000 11 22"; // изменить если нужен другой номер
const TEST_PASSWORD  = "test1234";
const PHONE = normPhone(TEST_PHONE_RAW); // "900001122"

async function main() {
  console.log("Проверяю наличие дубликата (phone=" + PHONE + ")…");

  // --- Проверка: не создавать дубли ---
  const existing = await sget(`site_accounts?phone=eq.${PHONE}&select=id,customer_id`);
  if (existing.length) {
    console.log("Аккаунт с таким номером уже есть (id=" + existing[0].id + "). Пропускаю.");
    console.log("Телефон: " + TEST_PHONE_RAW + " | Пароль: " + TEST_PASSWORD);
    return;
  }

  // --- 1. Получаем несколько реальных товаров для накладной ---
  const products = await sget("products?select=id,name,price_som,price_usd&order=created_at.desc&limit=3");
  if (!products.length) {
    console.error("Нет товаров в базе. Сначала добавьте хотя бы один товар.");
    process.exit(1);
  }

  // --- 2. Создаём клиента ---
  const now = new Date().toISOString();
  const customerObj = {
    name: "Проверочный клиент",
    contact: TEST_PHONE_RAW,
    opening_debt: { som: 150000, usd: 0, yuan: 0 },
    created_at: now,
  };

  // supsert не возвращает id без Prefer: return=representation на POST — делаем insert через sget-подход
  const URL = process.env.SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_KEY;
  const H = { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json", Prefer: "return=representation" };

  async function insert(table, body) {
    const r = await fetch(URL + "/rest/v1/" + table, { method: "POST", headers: H, body: JSON.stringify(body) });
    if (!r.ok) throw new Error("INSERT " + table + " " + r.status + ": " + await r.text());
    return r.json();
  }

  console.log("Создаю клиента…");
  const [customer] = await insert("customers", customerObj);
  const cid = customer.id;
  console.log("Клиент создан: id=" + cid);

  // --- 3. Накладная (final) ---
  const saleItems = products.map(p => ({
    product_id: p.id,
    qty: 2,
    unit_price: p.price_som || 50000,
    currency: "som",
  }));
  const saleDate = new Date(Date.now() - 5 * 86400000).toISOString(); // 5 дней назад
  const saleObj = {
    customer_id: cid,
    date: saleDate,
    currency: "som",
    status: "final",
    source: "manual",
    items: saleItems,
  };
  console.log("Создаю накладную (final)…");
  const [sale] = await insert("sales", saleObj);
  console.log("Накладная создана: id=" + sale.id);

  // --- 4. Заказ (confirmed) — для вкладки «Мои заказы» ---
  const orderObj = {
    customer_id: cid,
    date: now,
    currency: "som",
    status: "confirmed",
    source: "site",
    items: [{ product_id: products[0].id, qty: 1, unit_price: products[0].price_som || 50000, currency: "som" }],
  };
  console.log("Создаю заказ (confirmed)…");
  await insert("sales", orderObj);

  // --- 5. Оплата ---
  const payObj = {
    customer_id: cid,
    date: new Date(Date.now() - 2 * 86400000).toISOString(),
    amount: 300000,
    currency: "som",
    note: "Тестовая оплата",
  };
  console.log("Создаю оплату…");
  await insert("payments", payObj);

  // --- 6. Аккаунт на сайте ---
  const password_hash = await hashPassword(TEST_PASSWORD);
  const accountObj = {
    customer_id: cid,
    phone: PHONE,
    password_hash,
    tg_verified: true,
    created_at: now,
  };
  console.log("Создаю site_account…");
  await insert("site_accounts", accountObj);

  console.log("\n===========================================");
  console.log("  Проверочный клиент создан!");
  console.log("  Телефон : " + TEST_PHONE_RAW);
  console.log("  Пароль  : " + TEST_PASSWORD);
  console.log("  customer_id: " + cid);
  console.log("===========================================");
  console.log("Войдите на сайт и проверьте кабинет: долг, накладные, заказы, оплаты.\n");
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
