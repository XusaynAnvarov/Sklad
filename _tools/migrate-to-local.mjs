// ========================================================================
//  ПЕРЕНОС ДАННЫХ ИЗ SUPABASE В СВОЮ БАЗУ.
//
//  Запускать НА СЕРВЕРЕ:  node _tools/migrate-to-local.mjs
//  Supabase при этом ничего не теряет — мы только читаем.
//
//  Порядок важен: сначала клиенты и товары, потом то, что на них
//  ссылается (накладные, оплаты, журнал). Иначе база откажется принимать
//  строку, которая ссылается на ещё не перенесённого клиента.
//
//  В конце — СВЕРКА: количество строк в каждой таблице должно совпасть.
//  Не совпало хоть в одной — переключать склад нельзя.
// ========================================================================
import fs from "node:fs";
import path from "node:path";
import pgпакет from "pg";

const { Pool } = pgпакет;
const КОРЕНЬ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");

// --- настройки из .env (тот же файл, что читает сервер) ---
const env = fs.readFileSync(path.join(КОРЕНЬ, ".env"), "utf8");
const нас = (k, по = "") => (env.match(new RegExp(k + "=(.*)")) || [])[1]?.trim().replace(/^["']|["']$/g, "") || по;

const SB_URL = нас("SUPABASE_URL");
const SB_KEY = нас("SUPABASE_SERVICE_KEY");
if (!SB_URL || !SB_KEY) { console.error("В .env нет SUPABASE_URL / SUPABASE_SERVICE_KEY"); process.exit(1); }

const бассейн = new Pool({
  host: нас("PGHOST", "127.0.0.1"),
  port: Number(нас("PGPORT", "5432")),
  database: нас("PGDATABASE", "sklad"),
  user: нас("PGUSER", "sklad"),
  password: нас("PGPASSWORD", ""),
});

// Сначала то, на что ссылаются остальные.
const ТАБЛИЦЫ = [
  "settings", "customers", "products", "purchases", "sales", "payments",
  "videos", "site_accounts", "site_verifications", "blocked_phones",
  "bot_sessions", "stock_log", "trash",
];

const H = { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY };
const ЧАСТЬ = 500;                      // переносим порциями: так видно ход и не упираемся в память

async function прочитатьВсё(таблица) {
  const всё = [];
  for (;;) {
    const r = await fetch(`${SB_URL}/rest/v1/${таблица}?select=*&limit=1000&offset=${всё.length}`, { headers: H });
    if (!r.ok) throw new Error(`${таблица}: чтение ${r.status} ${(await r.text()).slice(0, 200)}`);
    const порция = await r.json();
    всё.push(...порция);
    if (порция.length < 1000) return всё;
  }
}

function значение(v) {
  if (v === undefined) return null;
  if (v !== null && typeof v === "object") return JSON.stringify(v);
  return v;
}

async function записать(таблица, строки) {
  if (!строки.length) return 0;
  const поля = [...new Set(строки.flatMap(r => Object.keys(r)))];
  let записано = 0;
  for (let i = 0; i < строки.length; i += ЧАСТЬ) {
    const кусок = строки.slice(i, i + ЧАСТЬ);
    const значения = [];
    let n = 1;
    const места = кусок.map(r => "(" + поля.map(p => { значения.push(значение(r[p])); return "$" + n++; }).join(",") + ")");
    // on conflict do nothing — чтобы повторный запуск не падал и не плодил дубли
    const sql = `insert into ${таблица} (${поля.join(",")}) values ${места.join(",")} on conflict do nothing`;
    const r = await бассейн.query(sql, значения);
    записано += r.rowCount;
    process.stdout.write(`\r   ${таблица}: ${Math.min(i + ЧАСТЬ, строки.length)} из ${строки.length}   `);
  }
  return записано;
}

async function главное() {
  console.log("=== ПЕРЕНОС ДАННЫХ: Supabase → своя база ===\n");

  // схема
  const схема = fs.readFileSync(path.join(КОРЕНЬ, "db", "local-schema.sql"), "utf8");
  await бассейн.query(схема);
  console.log("Таблицы созданы (или уже были).\n");

  const итог = [];
  for (const таблица of ТАБЛИЦЫ) {
    let строки = [];
    try { строки = await прочитатьВсё(таблица); }
    catch (e) { console.log(`   ${таблица}: пропускаем — ${String(e.message).slice(0, 80)}`); итог.push({ таблица, было: "—", стало: "—" }); continue; }
    await записать(таблица, строки);
    const r = await бассейн.query(`select count(*)::int as n from ${таблица}`);
    process.stdout.write("\r");
    console.log(`   ${таблица.padEnd(20)} в Supabase ${String(строки.length).padStart(5)} · у нас ${String(r.rows[0].n).padStart(5)} ${строки.length === r.rows[0].n ? "✓" : "✗ РАСХОЖДЕНИЕ"}`);
    итог.push({ таблица, было: строки.length, стало: r.rows[0].n });
  }

  const плохо = итог.filter(x => typeof x.было === "number" && x.было !== x.стало);
  console.log("\n" + (плохо.length
    ? "✗ ЕСТЬ РАСХОЖДЕНИЯ — переключать склад НЕЛЬЗЯ: " + плохо.map(x => x.таблица).join(", ")
    : "✓ Всё сошлось: столько же строк, сколько в Supabase."));

  // sequence для settings.id (единственная таблица с числовым ключом)
  try { await бассейн.query("select setval(pg_get_serial_sequence('settings','id'), coalesce((select max(id) from settings),1))"); } catch {}
  await бассейн.end();
  process.exit(плохо.length ? 1 : 0);
}

главное().catch(e => { console.error("\nОШИБКА:", e.message); process.exit(1); });
