// Чистка партий: сортировка по дате (старые первыми) + замена нулевой себестоимости
// на реальную из соседней партии; пересчёт текущей себестоимости и остатка.
const U = "https://ttgcrcloioznojreogwn.supabase.co/rest/v1/";
const K = "";
const h = { apikey: K, Authorization: "Bearer " + K, "Content-Type": "application/json" };
(async () => {
  const all = []; let from = 0;
  while (true) {
    const part = await (await fetch(U + "products?select=id,batches&limit=1000&offset=" + from, { headers: h })).json();
    if (!Array.isArray(part) || !part.length) break;
    all.push(...part); from += part.length; if (part.length < 1000) break;
  }
  let fixed = 0;
  for (const p of all) {
    let b = Array.isArray(p.batches) ? p.batches.map(x => ({ ...x })) : [];
    if (!b.length) continue;
    // сортировка по дате (старые первыми)
    b.sort((a, c) => String(a.date || "").localeCompare(String(c.date || "")));
    // реальная цена = первая ненулевая
    const nz = b.find(x => (Number(x.cost_yuan) || 0) > 0 || (Number(x.cost_usd) || 0) > 0);
    let changed = false;
    if (nz) b.forEach(x => {
      if ((Number(x.cost_yuan) || 0) <= 0 && (Number(x.cost_usd) || 0) <= 0) {
        x.cost_yuan = nz.cost_yuan; x.cost_usd = nz.cost_usd; changed = true;
      }
    });
    // всегда перезаписываем (сортировка тоже важна)
    const cc = b.find(x => (Number(x.qty) || 0) > 0) || b[0] || {};
    const stock = b.reduce((t, x) => t + (Number(x.qty) || 0), 0);
    const r = await fetch(U + "products?id=eq." + p.id, { method: "PATCH", headers: { ...h, Prefer: "return=minimal" }, body: JSON.stringify({ batches: b, cost_yuan: Number(cc.cost_yuan) || 0, cost_usd: Number(cc.cost_usd) || 0, stock_qty: stock }) });
    if (r.ok) fixed++;
  }
  console.log("Обработано товаров:", fixed, "из", all.length);
})();
