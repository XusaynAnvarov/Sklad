// ========================================================================
//  ВОЗВРАТ ТОВАРА НА СКЛАД.  node _tools/tests/t-return.mjs
//
//  Сентябрь 2026: владелец вернул товар от клиента, а на складе он не
//  появился — и никто об этом не сказал. Возврат обязан либо пройти,
//  либо честно ругнуться.
// ========================================================================
const корень = new URL("../../", import.meta.url);
const { returnItems } = await import(new URL("js/sklad/stock.js", корень));

let плохо = 0;
const ok = (имя, условие) => { if (условие) console.log("✅", имя); else { console.log("❌", имя); плохо++; } };

// Подставной склад: товары в памяти, запись как в базе.
function склад(товары, { ломатьЗапись = false, терятьТовар = null } = {}) {
  const по = Object.fromEntries(товары.map(p => [p.id, { ...p }]));
  const записано = [];
  return {
    по, записано,
    products: {
      async getMany(ids) { return ids.filter(id => id !== терятьТовар).map(id => по[id]).filter(Boolean); },
      async get(id) { return id === терятьТовар ? null : по[id] || null; },
      async upsertMany(rows) {
        if (ломатьЗапись) throw new Error("база недоступна");
        rows.forEach(r => { по[r.id] = { ...по[r.id], ...r }; записано.push(r.id); });
        return rows;
      },
      async upsert(row) {
        if (ломатьЗапись) throw new Error("база недоступна");
        по[row.id] = { ...по[row.id], ...row }; записано.push(row.id); return row;
      },
    },
  };
}

// ---------- обычный возврат ----------
{
  const db = склад([{ id: "t1", name: "Нож", stock_qty: 4, cost_yuan: 10, cost_usd: 1.4, batches: [{ qty: 4, cost_yuan: 10, cost_usd: 1.4, date: "2026-08-30" }] }]);
  await returnItems(db, [{ product_id: "t1", qty: 1 }]);
  ok("вернули 1 — на складе стало 5", db.по.t1.stock_qty === 5);
  ok("партии сходятся с остатком", db.по.t1.batches.reduce((a, b) => a + b.qty, 0) === 5);
}

// ---------- возврат по товару, ушедшему в минус ----------
{
  // продали больше, чем было: на складе долг −3
  const db = склад([{ id: "t1", name: "Линейный нож", stock_qty: -3, cost_yuan: 145, cost_usd: 20, batches: [{ qty: -3, cost_yuan: 0, cost_usd: 0, date: "2026-09-16", shortage: true }] }]);
  await returnItems(db, [{ product_id: "t1", qty: 1 }]);
  ok("возврат гасит долг: было −3, стало −2", db.по.t1.stock_qty === -2);
  ok("остаток всё ещё в минусе — товар не появился на полке", db.по.t1.stock_qty < 0);
}

// ---------- две строки одного товара ----------
{
  const db = склад([{ id: "t1", name: "Нож", stock_qty: 0, cost_yuan: 10, cost_usd: 1.4, batches: [] }]);
  await returnItems(db, [{ product_id: "t1", qty: 1 }, { product_id: "t1", qty: 2 }]);
  ok("два возврата одного товара складываются: 3", db.по.t1.stock_qty === 3);
}

// ---------- товара нет в складе ----------
{
  const db = склад([{ id: "t1", name: "Нож", stock_qty: 1, batches: [] }], { терятьТовар: "t1" });
  let ошибка = "";
  try { await returnItems(db, [{ product_id: "t1", qty: 1 }]); } catch (e) { ошибка = e.message; }
  ok("карточку товара удалили — возврат не молчит: " + ошибка, /не найден/.test(ошибка));
  ok("и ничего не записано", db.записано.length === 0);
}

// ---------- запись не прошла ----------
{
  const db = склад([{ id: "t1", name: "Нож", stock_qty: 1, cost_yuan: 10, cost_usd: 1.4, batches: [{ qty: 1, cost_yuan: 10, cost_usd: 1.4, date: "2026-08-30" }] }], { ломатьЗапись: true });
  let ошибка = "";
  try { await returnItems(db, [{ product_id: "t1", qty: 1 }]); } catch (e) { ошибка = e.message; }
  ok("база молчала — владелец узнает: " + ошибка, !!ошибка);
  ok("остаток не изменился", db.по.t1.stock_qty === 1);
}

// ---------- пустой список ----------
{
  const db = склад([{ id: "t1", name: "Нож", stock_qty: 1, batches: [] }]);
  await returnItems(db, []);
  ok("пустой возврат ничего не ломает", db.записано.length === 0);
}

console.log(плохо ? `\n${плохо} ОШИБОК` : "\nВОЗВРАТ НА СКЛАД В ПОРЯДКЕ");
process.exit(плохо ? 1 : 0);
