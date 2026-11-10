// ========================================================================
//  SQL-МИГРАЦИЯ СБОРКИ И ОТПРАВКИ на настоящем Postgres (PGlite, в памяти).
//
//    npm i --no-save @electric-sql/pglite@0.2.17
//    node _tools/tests/t-fulfillment-sql.mjs
//
//  Пакет в зависимости проекта не входит (на сервере он не нужен) — без него
//  тест пропускается. Проверяем: повторный запуск миграции, запрет пропуска
//  этапа, двойное подтверждение, исправление только с причиной, старые
//  накладные, неоформленные и возвраты, неизменяемость журнала, запрет
//  прямой правки этапа и то, что подмена записи видна fulfillment_verify().
// ========================================================================
import fs from "fs";
import { fileURLToPath } from "url";
let PGlite;
try { ({ PGlite } = await import("@electric-sql/pglite")); }
catch { console.log("⏭  @electric-sql/pglite не установлен — тест пропущен"); process.exit(0); }
const W = fileURLToPath(new URL("../../", import.meta.url));
let bad = 0;
const ok = (n, c) => { console.log(c ? "✅" : "❌", n); if (!c) bad++; };
const db = new PGlite();
await db.exec(fs.readFileSync(W + "/db/local-schema.sql", "utf8"));
// старая накладная (до запуска) и новая
await db.exec(`insert into sales (id, status, date, created_at, items) values
 ('00000000-0000-4000-8000-000000000001','final', now() - interval '30 days', now() - interval '30 days', '[]'),
 ('00000000-0000-4000-8000-000000000003','order', now() - interval '30 days', now() - interval '30 days', '[]'),
 ('00000000-0000-4000-8000-000000000004','final', now() - interval '30 days', now() - interval '30 days', '[]')`);
const mig = fs.readFileSync(W + "/db/order-fulfillment-migration.sql", "utf8");
await db.exec(mig);
await db.exec(mig); // повторный запуск безопасен
ok("миграция применяется дважды", true);
await db.exec(`insert into sales (id, status, source, items) values
 ('00000000-0000-4000-8000-000000000002','final','site','[]'),
 ('00000000-0000-4000-8000-000000000005','final','refund','[]'),
 ('00000000-0000-4000-8000-000000000006','order','site','[]')`);
const NEW = "00000000-0000-4000-8000-000000000002", OLD = "00000000-0000-4000-8000-000000000001";
async function tr(sale, action, expected, extra = {}) {
  try {
    const r = await db.query(`select fulfillment_transition($1,$2,$3,$4,'admin',$5,$6,$7,$8) as r`,
      [sale, action, expected, extra.actor ?? "Хусайн", extra.reason ?? null, extra.carrier ?? null, extra.tracking ?? null, extra.comment ?? null]);
    return { ok: true, row: r.rows[0].r };
  } catch (e) { return { ok: false, err: e.message }; }
}
let r;
r = await tr(NEW, "ship", "placed"); ok("нельзя перескочить сборку: " + r.err, !r.ok && /ff:bad_step|ff:conflict/.test(r.err));
r = await tr(NEW, "pack", "placed", { actor: "" }); ok("без ответственного нельзя: " + r.err, !r.ok && /actor_required/.test(r.err));
r = await tr(NEW, "pack", "placed"); ok("сборка подтверждена", r.ok && r.row.stage === "packed" && r.row.packed_by === "Хусайн");
r = await tr(NEW, "pack", "placed"); ok("повторное подтверждение сборки → conflict: " + r.err, !r.ok && /ff:conflict:packed/.test(r.err));
r = await tr(NEW, "ship", "packed", { carrier: "BTS", tracking: "AB123", comment: "2 коробки" });
ok("отправка подтверждена", r.ok && r.row.stage === "shipped" && r.row.carrier === "BTS");
r = await tr(NEW, "ship", "packed"); ok("двойная отправка → conflict", !r.ok && /conflict:shipped/.test(r.err));
r = await tr(NEW, "correct", "shipped", { reason: "" }); ok("исправление без причины нельзя", !r.ok && /reason_required/.test(r.err));
r = await tr(NEW, "correct", "shipped", { reason: "Ошибся заказом" }); ok("исправление shipped→packed", r.ok && r.row.stage === "packed" && r.row.carrier == null);
r = await tr(OLD, "pack", "placed"); ok("старая накладная не в учёте: " + r.err, !r.ok && /not_tracked/.test(r.err));
r = await tr(OLD, "track", null); ok("старую можно взять в учёт", r.ok && r.row.stage === "placed");
r = await tr(OLD, "track", null); ok("взять в учёт дважды нельзя", !r.ok && /conflict/.test(r.err));
r = await tr(OLD, "pack", "placed"); ok("старая после учёта собирается", r.ok);
r = await tr("00000000-0000-4000-8000-000000000006", "pack", "placed"); ok("неоформленный заказ нельзя: " + r.err, !r.ok && /not_final/.test(r.err));
r = await tr("00000000-0000-4000-8000-000000000005", "track", null); ok("возврат нельзя", !r.ok && /refund/.test(r.err));
r = await tr("00000000-0000-4000-8000-0000000000ff", "pack", "placed"); ok("нет накладной", !r.ok && /sale_not_found/.test(r.err));

// продажа не изменилась
const s = (await db.query(`select status, items from sales where id=$1`, [NEW])).rows[0];
ok("sales не тронута", s.status === "final");

let v = (await db.query(`select fulfillment_verify() as v`)).rows[0].v;
ok("журнал цел: " + JSON.stringify(v), v.ok && v.checked === 5);

// попытки незаметной правки
let e1 = null; try { await db.query(`update order_fulfillment_log set actor='X' where id=1`); } catch (e) { e1 = e.message; }
ok("правка журнала запрещена", /append_only/.test(e1 || ""));
e1 = null; try { await db.query(`delete from order_fulfillment_log`); } catch (e) { e1 = e.message; }
ok("удаление журнала запрещено", /append_only/.test(e1 || ""));
e1 = null; try { await db.query(`update order_fulfillment set stage='shipped' where sale_id=$1`, [NEW]); } catch (e) { e1 = e.message; }
ok("прямой update этапа запрещён", /direct_change_forbidden/.test(e1 || ""));
e1 = null; try { await db.query(`insert into order_fulfillment (sale_id, stage) values ($1,'shipped')`, ["00000000-0000-4000-8000-000000000004"]); } catch (e) { e1 = e.message; }
ok("прямой insert запрещён", /direct_change_forbidden/.test(e1 || ""));

// злоумышленник с правами владельца отключил триггеры и подменил запись
await db.exec(`alter table order_fulfillment_log disable trigger order_fulfillment_log_no_update;
  update order_fulfillment_log set actor='Чужой' where id=2;
  alter table order_fulfillment_log enable trigger order_fulfillment_log_no_update;`);
v = (await db.query(`select fulfillment_verify() as v`)).rows[0].v;
ok("подмена видна проверкой: " + JSON.stringify(v.problems), !v.ok && v.problems.some(p => p.log_id === 2));

console.log(bad ? `\n${bad} провал(ов)` : "\nВсе проверки SQL прошли");
process.exit(bad ? 1 : 0);
