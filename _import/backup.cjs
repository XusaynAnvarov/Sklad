/* ============================================================
   ЗАХИРА (BACKUP) всех данных склада из Supabase в один JSON-файл.
   Скачивает все таблицы и сохраняет рядом: sklad-backup-<дата>.json

   Запуск (нужен SERVICE-ключ Supabase — тот же, которым делали импорт):
     node _import/backup.cjs <SUPABASE_SERVICE_KEY>

   Где взять ключ: Supabase → Project Settings → API → service_role (secret).
   Файл можно хранить где угодно (флешка, облако) — это полный снимок данных.
   ВАЖНО: фотографии товаров лежат в Supabase Storage; в JSON попадают только
   их ссылки (photo_url). Сами данные (товары, клиенты, продажи, приходы,
   оплаты, настройки) сохраняются полностью.
   ============================================================ */
const fs = require("fs");

const SUPA_URL = "https://ttgcrcloioznojreogwn.supabase.co";
const KEY = process.argv[2];

if (!KEY) {
  console.error("❌ Не передан service-ключ.\n   Запуск: node _import/backup.cjs <SUPABASE_SERVICE_KEY>");
  process.exit(1);
}

const H = { apikey: KEY, Authorization: "Bearer " + KEY };
const TABLES = ["products", "customers", "sales", "purchases", "payments", "settings"];

// Постраничная выгрузка (PostgREST по умолчанию отдаёт максимум 1000 строк).
async function fetchAll(table) {
  const PAGE = 1000;
  let from = 0, out = [];
  for (;;) {
    const r = await fetch(`${SUPA_URL}/rest/v1/${table}?select=*`, {
      headers: { ...H, Range: `${from}-${from + PAGE - 1}`, "Range-Unit": "items" },
    });
    if (!r.ok) throw new Error(`${table}: HTTP ${r.status} — ${(await r.text()).slice(0, 200)}`);
    const rows = await r.json();
    out = out.concat(rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

(async () => {
  const data = {};
  for (const t of TABLES) {
    process.stdout.write(`• ${t} … `);
    try {
      data[t] = await fetchAll(t);
      console.log(`${data[t].length} строк`);
    } catch (e) {
      console.log("ОШИБКА");
      console.error("  " + e.message);
      data[t] = { __error: e.message };
    }
  }

  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-"); // YYYY-MM-DD-HH-MM
  const file = `sklad-backup-${stamp}.json`;
  const payload = { app: "sklad", exported_at: new Date().toISOString(), source: SUPA_URL, data };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");

  const counts = TABLES.map(t => `${t}=${Array.isArray(data[t]) ? data[t].length : "err"}`).join(", ");
  console.log(`\n✅ Готово: ${file}`);
  console.log(`   ${counts}`);
  console.log("   Сохраните файл в надёжном месте (флешка / облако).");
})();
