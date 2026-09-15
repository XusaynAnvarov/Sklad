// ========================================================================
//  НАКЛАДНЫЕ КЛИЕНТА В БОТЕ И ПРИЛОЖЕНИИ.  node _tools/tests/t-clientinvoices.mjs
//
//  У постоянного клиента десятки накладных. В чате — последние десять,
//  в приложении — все, у каждой остаток долга. Чужую накладную получить
//  нельзя ни кнопкой в чате, ни из приложения.
// ========================================================================
import { createHmac } from "node:crypto";

process.env.SUPABASE_URL = "http://база";
process.env.SUPABASE_SERVICE_KEY = "тест";
process.env.CLIENT_BOT_TOKEN = "123:тест-бот";

const корень = new URL("../../", import.meta.url);
const { накладныеКлиента, подписьКнопки, своя, естьДолг, суммой } = await import(new URL("api/lib/clientinvoices.js", корень));

let плохо = 0;
const ok = (имя, условие) => { if (условие) console.log("✅", имя); else { console.log("❌", имя); плохо++; } };

// ru-RU разделяет разряды неразрывным пробелом — сравниваем с обычным
const пробелы = (s) => String(s).replace(/[  ]/g, " ");
const поз = (qty, unit_price, currency) => ({ product_id: "p1", qty, unit_price, ...(currency ? { currency } : {}) });

// ---------- расчёт ----------
{
  const sales = [
    { id: "s1", date: "2026-08-01", status: "final", currency: "som", items: [поз(10, 100000)] },           // 1 000 000
    { id: "s2", date: "2026-08-10", status: "final", currency: "som", items: [поз(5, 100000), поз(2, 10, "usd")] }, // 500 000 + $20
    { id: "s3", date: "2026-09-01", status: "final", currency: "som", items: [поз(3, 100000)] },           // 300 000
    { id: "d1", date: "2026-09-02", status: "draft", currency: "som", items: [поз(1, 999)] },
    { id: "o1", date: "2026-09-03", status: "order", currency: "som", items: [поз(1, 0)] },
    { id: "c1", date: "2026-09-04", status: "canceled", currency: "som", items: [поз(1, 5)] },
  ];
  const оплаты = [{ amount: 1200000, currency: "som" }, { amount: 20, currency: "usd" }];
  const спис = накладныеКлиента(sales, оплаты, { som: 0 });

  ok("только оформленные: черновик, заказ и отменённый не показываются", спис.length === 3 && спис.every(i => ["s1", "s2", "s3"].includes(i.id)));
  ok("новые сверху", спис.map(i => i.id).join() === "s3,s2,s1");
  const по = Object.fromEntries(спис.map(i => [i.id, i]));
  ok("оплата гасит старые первыми: s1 оплачена", !естьДолг(по.s1));
  ok("s2 оплачена частично: долг 300 000 сум, доллары закрыты",
     по.s2.remaining.som === 300000 && !по.s2.remaining.usd && по.s2.totals.usd === 20);
  ok("s3 не оплачена: долг на всю сумму", по.s3.remaining.som === 300000);
  ok("валюты не смешиваются", пробелы(суммой(по.s2.totals)) === "500 000 сум + $20");

  const соСтарым = накладныеКлиента(sales, оплаты, { som: 1000000 });
  ok("старый долг гасится первым — тогда и s1 не оплачена", естьДолг(соСтарым.find(i => i.id === "s1")));
  ok("пусто — пусто", накладныеКлиента([], [], null).length === 0 && накладныеКлиента(null, null, null).length === 0);

  ok("кнопка оплаченной: дата и сумма", пробелы(подписьКнопки(по.s1, "ru")) === "01.08.2026 · 1 000 000 сум");
  ok("кнопка с долгом: и остаток", пробелы(подписьКнопки(по.s2, "ru")) === "10.08.2026 · 500 000 сум + $20 · долг 300 000 сум");
  ok("на узбекском — qarz", пробелы(подписьКнопки(по.s3, "uz")).endsWith("qarz 300 000 сум"));
  ok("кнопка укладывается в ширину Telegram", подписьКнопки(по.s2, "en").length <= 64);

  ok("своя оформленная — можно", своя({ status: "final", customer_id: "k1" }, { id: "k1" }));
  ok("чужая — нельзя", !своя({ status: "final", customer_id: "k2" }, { id: "k1" }));
  ok("черновик своей — нельзя", !своя({ status: "draft", customer_id: "k1" }, { id: "k1" }));
  ok("клиент не найден — нельзя", !своя({ status: "final", customer_id: "k1" }, null) && !своя(null, { id: "k1" }));
}

// ---------- сервер мини-приложения ----------
{
  const КЛИЕНТ = { id: "k1", name: "Клиент", tg_chat_id: "777", opening_debt: {} };
  const НАКЛАДНЫЕ = [];
  for (let i = 0; i < 50; i++) {
    НАКЛАДНЫЕ.push({ id: "s" + i, customer_id: "k1", status: "final", currency: "som", date: new Date(Date.UTC(2026, 0, 1 + i * 5)).toISOString(), items: [поз(1, 100000)] });
  }
  НАКЛАДНЫЕ.push({ id: "foreign1", customer_id: "k2", status: "final", currency: "som", date: "2026-09-01", items: [поз(1, 1)] });
  НАКЛАДНЫЕ.push({ id: "draft1", customer_id: "k1", status: "draft", currency: "som", date: "2026-09-01", items: [поз(1, 1)] });

  const отправлено = [];
  const запросыБазы = [];
  globalThis.fetch = async (url, opt = {}) => {
    const u = String(url);
    const ответ = (body, status = 200) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
    if (u.startsWith("https://api.telegram.org/")) {
      if (u.endsWith("/sendDocument")) отправлено.push(opt.body.get("chat_id"));
      return ответ({ ok: true });
    }
    запросыБазы.push(decodeURIComponent(u));
    const q = new URL(u);
    const таблица = q.pathname.split("/").pop();
    const p = Object.fromEntries(q.searchParams);
    if (таблица === "customers") return ответ(p.tg_chat_id === "eq.777" || p.id === "eq.k1" ? [КЛИЕНТ] : []);
    if (таблица === "payments") return ответ([{ amount: 4700000, currency: "som", date: "2026-09-01" }]);
    if (таблица === "products") return ответ([{ id: "p1", name: "Лапка", sku: "" }]);
    if (таблица === "bot_sessions") return ответ([]);
    if (таблица === "sales") {
      let строки = НАКЛАДНЫЕ;
      if (p.id) строки = строки.filter(s => "eq." + s.id === p.id);
      if (p.customer_id) строки = строки.filter(s => "eq." + s.customer_id === p.customer_id);
      if (p.status) строки = строки.filter(s => "eq." + s.status === p.status);
      return ответ(строки);
    }
    return ответ([]);
  };

  const подписать = (user) => {
    const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify(user) });
    const dataCheck = [...params.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => `${k}=${v}`).join("\n");
    const secret = createHmac("sha256", "WebAppData").update(process.env.CLIENT_BOT_TOKEN).digest();
    params.set("hash", createHmac("sha256", secret).update(dataCheck).digest("hex"));
    return params.toString();
  };
  const { default: handler } = await import(new URL("api/my-orders.js", корень));
  const вызвать = async (body) => {
    const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
    await handler({ method: "POST", body }, res);
    return res;
  };
  const мой = подписать({ id: 777, first_name: "Клиент" });

  ok("без подписи Telegram — 401", (await вызвать({ action: "invoices" })).code === 401);
  ok("поддельная подпись — 401", (await вызвать({ action: "invoices", initData: мой.replace(/hash=\w/, "hash=0") })).code === 401);

  const r = await вызвать({ action: "invoices", initData: мой });
  const спис = r.body.invoices;
  ok("в приложении все 50 накладных, не 20", r.code === 200 && спис.length === 50);
  ok("без чужих и черновиков", !спис.some(i => i.id === "foreign1" || i.id === "draft1"));
  ok("новые сверху", спис[0].id === "s49" && спис[49].id === "s0");
  ok("оплата 4 700 000 закрыла 47 старых, у 3 новых долг", спис.filter(естьДолг).map(i => i.id).join() === "s49,s48,s47");
  ok("в базу за накладными — только этого клиента и только оформленные",
     запросыБазы.some(q => q.includes("sales?customer_id=eq.k1&status=eq.final")));

  const чужая = await вызвать({ action: "invoice_pdf", initData: мой, invoice_id: "foreign1" });
  ok("PDF чужой накладной — 404, ничего не отправлено", чужая.code === 404 && отправлено.length === 0);
  const черн = await вызвать({ action: "invoice_pdf", initData: подписать({ id: 777 }), invoice_id: "draft1" });
  ok("PDF черновика — 404", черн.code === 404 && отправлено.length === 0);
  ok("кривой номер — 400", (await вызвать({ action: "invoice_pdf", initData: мой, invoice_id: "../x" })).code === 400);

  const наш = await вызвать({ action: "invoice_pdf", initData: мой, invoice_id: "s10" });
  ok("своя накладная — PDF ушёл в чат этого клиента", наш.code === 200 && отправлено.join() === "777");
  const сразу = await вызвать({ action: "invoice_pdf", initData: мой, invoice_id: "s11" });
  ok("второе нажатие сразу — «подождите», PDF не собирается", сразу.code === 429 && отправлено.length === 1);
}

console.log(плохо ? `\n${плохо} ОШИБОК` : "\nНАКЛАДНЫЕ КЛИЕНТА В ПОРЯДКЕ");
process.exit(плохо ? 1 : 0);
