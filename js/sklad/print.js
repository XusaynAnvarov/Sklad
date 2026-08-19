// ========================================================================
//  Печать из мини-приложения. Сам Telegram печатать не умеет, поэтому
//  собираем готовый лист и открываем его во внешней вкладке — оттуда
//  работает обычная печать телефона или компьютера.
// ========================================================================
const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const SIGN = { som: "сум", usd: "$", yuan: "¥" };
const money = (n, cur) => {
  const v = Number(n) || 0;
  const s = (cur === "som" ? Math.round(v) : Math.round(v * 100) / 100).toLocaleString("ru-RU");
  return cur === "som" ? s + " сум" : (SIGN[cur] || "") + s;
};
const totalsStr = (t) => {
  const parts = Object.entries(t || {}).filter(([, v]) => (Number(v) || 0) > 0.001).map(([c, v]) => money(v, c));
  return parts.length ? parts.join(" + ") : "0";
};

// Накладная одним листом. Имя-подпись необязательно — если его нет, ставим прочерк.
export function invoiceHtml({ who, date, items, totals }) {
  const rows = (items || []).map((it, i) => `
    <tr>
      <td class="n">${i + 1}</td>
      <td>${esc(it.name)}</td>
      <td class="r">${esc(it.qty)}</td>
      <td class="r">${esc(money(it.price, it.currency))}</td>
      <td class="r b">${esc(money((Number(it.qty) || 0) * (Number(it.price) || 0), it.currency))}</td>
    </tr>`).join("");
  const d = new Date(date || Date.now()).toLocaleDateString("ru-RU");
  return `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8">
<title>Накладная от ${esc(d)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',system-ui,-apple-system,Arial,sans-serif;color:#111;padding:12mm;background:#fff;font-size:11pt}
  .top{display:flex;justify-content:space-between;align-items:flex-start;gap:10mm;margin-bottom:8mm}
  .brand{font-family:Georgia,'Times New Roman',serif;font-size:16pt;font-weight:700}
  .meta{text-align:right;font-size:10pt;color:#444;line-height:1.6}
  .who{margin-bottom:6mm;font-size:11pt}
  .who b{font-size:12.5pt}
  table{width:100%;border-collapse:collapse;margin-bottom:6mm}
  th{text-align:left;font-size:8.5pt;text-transform:uppercase;letter-spacing:.04em;color:#666;
     border-bottom:1px solid #999;padding:2mm 2mm}
  td{padding:2mm;border-bottom:1px solid #e5e5e5;vertical-align:top}
  td.r,th.r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  td.n{color:#888;width:8mm}
  td.b{font-weight:700}
  .total{text-align:right;font-size:13pt;font-weight:700;padding-top:2mm}
  .sign{margin-top:14mm;display:flex;justify-content:space-between;gap:12mm;font-size:10pt;color:#444}
  .sign div{flex:1;border-top:1px solid #999;padding-top:2mm}
  .noprint{margin-bottom:6mm}
  .noprint button{padding:8px 18px;font-size:11pt;border:1px solid #111;background:#111;color:#fff;border-radius:6px;cursor:pointer}
  @media print{ .noprint{display:none} body{padding:8mm} }
</style></head><body>
<div class="noprint"><button onclick="window.print()">Печать</button></div>
<div class="top">
  <div class="brand">GENERAL MODERN</div>
  <div class="meta">Накладная<br>от ${esc(d)}</div>
</div>
<div class="who">Кому: <b>${who ? esc(who) : "—"}</b></div>
<table>
  <thead><tr><th></th><th>Товар</th><th class="r">Кол-во</th><th class="r">Цена</th><th class="r">Сумма</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="total">Итого: ${esc(totalsStr(totals))}</div>
<div class="sign"><div>Отпустил</div><div>Получил</div></div>
</body></html>`;
}

// Открыть готовый лист во внешней вкладке
export function openPrint(html) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) { try { window.location.href = url; } catch { } }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return !!w;
}
