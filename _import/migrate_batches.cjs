// Миграция: текущие остатки → стартовая FIFO-партия. Запуск после добавления колонки batches.
const U = "https://ttgcrcloioznojreogwn.supabase.co/rest/v1/";
const K = "";
const h = { apikey: K, Authorization: "Bearer " + K, "Content-Type": "application/json" };
(async () => {
  const all = [];
  let from = 0;
  while (true) {
    const r = await fetch(U + "products?select=id,stock_qty,cost_yuan,cost_usd,batches,created_at&limit=1000&offset=" + from, { headers: h });
    const part = await r.json();
    if (!Array.isArray(part)) { console.log("Ошибка чтения (колонка batches есть?):", JSON.stringify(part).slice(0, 200)); return; }
    all.push(...part); from += part.length; if (part.length < 1000) break;
  }
  let done = 0, skip = 0;
  for (const p of all) {
    const has = Array.isArray(p.batches) && p.batches.length;
    if (has) { skip++; continue; }
    const q = Number(p.stock_qty) || 0;
    const batches = q > 0 ? [{ qty: q, cost_yuan: Number(p.cost_yuan) || 0, cost_usd: Number(p.cost_usd) || 0, date: p.created_at || new Date().toISOString() }] : [];
    const r = await fetch(U + "products?id=eq." + p.id, { method: "PATCH", headers: { ...h, Prefer: "return=minimal" }, body: JSON.stringify({ batches }) });
    if (r.ok) done++; else { console.log("fail", p.id, r.status, (await r.text()).slice(0, 120)); }
  }
  console.log(`Готово: создано партий ${done}, пропущено (уже были) ${skip}, всего ${all.length}`);
})();
