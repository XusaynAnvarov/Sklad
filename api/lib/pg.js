// ========================================================================
//  СВОЯ БАЗА (PostgreSQL на этом же сервере).
//
//  Зачем. Supabase отвечает примерно секунду на запрос — не потому, что
//  медленный, а потому, что далеко: сам он работает 44 мс, остальное —
//  дорога. Читать это можно из памяти сервера, а вот ЗАПИСЬ закэшировать
//  нельзя, поэтому сохранение накладной и тянулось. База на этой же
//  машине отвечает за 1–3 мс.
//
//  Как включается. Настройка DB_MODE в .env:
//      DB_MODE=supabase  — как было (по умолчанию)
//      DB_MODE=local     — своя база
//  Откат — одна строка и перезапуск: Supabase остаётся нетронутым.
//
//  Снаружи ничего не меняется: функции здесь принимают тот же «язык
//  Supabase», что и api/lib/supa.js, а перевод на SQL делает
//  api/lib/pgquery.js (он проверен тестом t-pgquery.mjs).
// ========================================================================
import { чтение, вставка, правка, удаление } from "./pgquery.js";
import { забыть } from "./memcache.js";

export const СВОЯ_БАЗА = String(process.env.DB_MODE || "supabase").trim().toLowerCase() === "local";

// У каждой таблицы свой главный ключ — по нему «перезаписать, если уже есть».
const КЛЮЧ = {
  bot_sessions: "chat_id",
  blocked_phones: "phone",
  site_verifications: "token",
};
export const ключТаблицы = (t) => КЛЮЧ[t] || "id";

// Драйвер базы подключаем ЛЕНИВО — только когда своя база включена.
// Пока работаем на Supabase, пакета pg на сервере может не быть, и
// обычный import обрушил бы весь сервер при выкладке.
let бассейн = null;
export async function база() {
  if (бассейн) return бассейн;
  const { default: pgпакет } = await import("pg");
  const { Pool } = pgпакет;
  бассейн = new Pool({
    host: process.env.PGHOST || "127.0.0.1",
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || "sklad",
    user: process.env.PGUSER || "sklad",
    password: process.env.PGPASSWORD || "",
    max: 10,                       // больше и не нужно: сервер один, запросы короткие
    idle_timeout_millis: 30000,
    connectionTimeoutMillis: 5000,
  });
  // Падение одного соединения не должно ронять весь сервер: бассейн сам
  // откроет новое, а нам важно лишь увидеть это в логах.
  бассейн.on("error", (e) => console.warn("[база] соединение оборвалось:", e.message));
  return бассейн;
}

// Любая запись делает прошлые ответы устаревшими — память сервера чистим,
// как это делает supa.js для Supabase.
const устарело = () => { забыть("db:"); забыть("catalog"); };

async function выполнить({ sql, значения }) {
  const бд = await база();
  const r = await бд.query(sql, значения);
  return r.rows;
}

// ---- те же четыре действия, что и у Supabase ----
export async function pgGet(path) {
  return выполнить(чтение(path));
}
export async function pgUpsert(table, body) {
  const q = вставка(table, body, ключТаблицы(table));
  if (!q) return [];
  const строки = await выполнить(q);
  устарело();
  return строки;
}
// Вставить и не перезаписывать: журнал изменений только дополняется.
export async function pgВставить(table, rows) {
  const q = вставка(table, rows, null);
  if (!q) return [];
  const строки = await выполнить(q);
  устарело();
  return строки;
}
export async function pgPatch(path, body) {
  const строки = await выполнить(правка(path, body));
  устарело();
  return строки;
}
export async function pgDelete(path) {
  await выполнить(удаление(path));
  устарело();
  return true;
}

// Проверка связи — зовём при запуске сервера, чтобы «база не поднялась»
// выяснилось сразу, а не на первой продаже.
export async function проверитьСвязь() {
  const бд = await база();
  const r = await бд.query("select count(*)::int as n from products");
  return r.rows[0].n;
}
