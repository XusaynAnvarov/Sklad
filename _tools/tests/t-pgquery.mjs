// ========================================================================
//  ПЕРЕВОД ЗАПРОСОВ НА SQL.  node _tools/tests/t-pgquery.mjs
//
//  Сервер разговаривает с базой на языке Supabase (PostgREST). Своя база
//  понимает только SQL, поэтому запросы переводятся (api/lib/pgquery.js).
//  Ошибка в переводе — это молча не те строки: не тот клиент, не та
//  накладная, не тот остаток. Поэтому здесь проверяется КАЖДЫЙ вид
//  запроса, который встречается в коде, и отдельно — что чужой текст не
//  может подмешаться в запрос.
// ========================================================================
const корень = new URL("../../", import.meta.url);
const { разобрать, чтение, вставка, правка, удаление } = await import(new URL("api/lib/pgquery.js", корень));

let плохо = 0;
const ok = (имя, условие) => { if (условие) console.log("✅", имя); else { console.log("❌", имя); плохо++; } };
const бросает = (имя, fn) => { try { fn(); console.log("❌", имя, "— ошибки не было"); плохо++; } catch { console.log("✅", имя); } };

// ---------- чтение ----------
{
  const q = чтение("customers?select=*");
  ok("весь список", q.sql === "select * from customers" && q.значения.length === 0);
}
{
  const q = чтение("customers?id=eq.5&select=id,name");
  ok("одна строка по id", q.sql === "select id, name from customers where id = $1" && q.значения[0] === "5");
}
{
  const q = чтение("products?select=*&limit=1000&offset=2000");
  ok("порции (limit/offset)", q.sql === "select * from products limit 1000 offset 2000");
}
{
  const q = чтение("sales?select=*&order=date.desc");
  ok("сортировка по убыванию", q.sql.endsWith("order by date desc"));
}
{
  const q = чтение("products?select=*&order=created_at.desc,id.asc");
  ok("сортировка по двум полям", q.sql.endsWith("order by created_at desc, id asc"));
}
{
  const q = чтение("products?id=in.(a,b,c)&select=id");
  ok("список значений (in)", /id = any\(\$1::text\[\]\)/.test(q.sql) && Array.isArray(q.значения[0]) && q.значения[0].length === 3);
}
{
  const q = чтение("products?id=in.()&select=id");
  ok("пустой список ничего не вернёт", /where false/.test(q.sql));
}
{
  const q = чтение("sales?status=eq.final&date=gte.2026-10-01&select=items");
  ok("два условия сразу", q.sql.includes("status = $1") && q.sql.includes("date >= $2") && q.значения.length === 2);
}
{
  const q = чтение("customers?tg_chat_id=not.is.null&select=tg_chat_id");
  ok("«заполнено» (not.is.null)", q.sql.includes("tg_chat_id is not null") && q.значения.length === 0);
}
{
  const q = чтение("products?code=is.null&select=id");
  ok("«пусто» (is.null)", q.sql.includes("code is null"));
}
{
  const q = чтение('customers?tg_chat_ids=cs.["123"]&select=*');
  ok("поиск внутри списка (cs)", q.sql.includes("tg_chat_ids @> $1::jsonb") && q.значения[0] === '["123"]');
}
{
  const q = чтение("stock_log?created_at=gte.2026-10-01T00:00:00Z&created_at=lte.2026-10-07T23:59:59Z&select=*");
  ok("период от и до", q.sql.includes(">= $1") && q.sql.includes("<= $2"));
}
{
  // адрес приходит закодированным — значение должно раскодироваться
  const q = чтение("customers?name=eq." + encodeURIComponent("Хожи Ака") + "&select=id");
  ok("русское имя в условии", q.значения[0] === "Хожи Ака");
}

// ---------- запись ----------
{
  const q = вставка("payments", { id: "p1", amount: 100, currency: "som" });
  ok("новая строка", /insert into payments \(id, amount, currency\) values \(\$1, \$2, \$3\)/.test(q.sql));
  ok("перезапись по ключу", /on conflict \(id\) do update set amount = excluded.amount, currency = excluded.currency/.test(q.sql));
  ok("возвращает записанное", q.sql.endsWith("returning *"));
}
{
  const q = вставка("products", [{ id: "1", name: "А" }, { id: "2", name: "Б", code: "LP-1" }]);
  ok("несколько строк разом", q.значения.length === 6 && /values \(\$1, \$2, \$3\), \(\$4, \$5, \$6\)/.test(q.sql));
}
{
  const q = вставка("products", { id: "1", batches: [{ qty: 5 }] });
  ok("партии уходят как json", typeof q.значения[1] === "string" && q.значения[1] === '[{"qty":5}]');
}
{
  const q = вставка("bot_sessions", { chat_id: "77", state: {} }, "chat_id");
  ok("ключ может быть не id", /on conflict \(chat_id\)/.test(q.sql));
}

// ---------- правка ----------
{
  const q = правка("sales?id=eq.7", { status: "final" });
  ok("правка по id", q.sql === "update sales set status = $1 where id = $2 returning *");
  ok("значения по порядку", q.значения[0] === "final" && q.значения[1] === "7");
}
{
  const q = правка("products?id=eq.3", { stock_qty: 10, batches: [{ qty: 10 }] });
  ok("правка нескольких полей", q.sql.includes("stock_qty = $1") && q.sql.includes("batches = $2"));
}
бросает("правка без условия запрещена", () => правка("products", { stock_qty: 0 }));
бросает("правка без полей запрещена", () => правка("products?id=eq.1", {}));

// ---------- удаление ----------
{
  const q = удаление("sales?id=eq.9");
  ok("удаление по id", q.sql === "delete from sales where id = $1" && q.значения[0] === "9");
}
бросает("удаление без условия запрещено", () => удаление("sales"));

// ---------- защита от подмены запроса ----------
бросает("чужой текст вместо имени таблицы", () => чтение("products; drop table products--?select=*"));
бросает("чужой текст вместо колонки", () => чтение("products?select=id,(select password from site_accounts)"));
бросает("чужой текст вместо поля сортировки", () => чтение("products?order=id;drop table products.asc"));
бросает("неизвестное условие не угадываем", () => чтение("products?name=like.*нож*"));
{
  // значения НЕ подставляются в текст запроса — только параметрами
  const q = чтение("customers?name=eq." + encodeURIComponent("'; drop table customers; --"));
  ok("опасное значение осталось значением", !q.sql.includes("drop") && q.значения[0].includes("drop"));
}

// ---------- журнал: вставка без перезаписи ----------
{
  const q = вставка("stock_log", [{ product_id: "1", diff: -5 }], null);
  ok("журнал только дополняется", !/on conflict/.test(q.sql) && /insert into stock_log/.test(q.sql));
}

console.log(плохо ? "\n❌ ошибок: " + плохо : "\n✅ всё сошлось");
process.exit(плохо ? 1 : 0);
