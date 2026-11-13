// GET /api/client/invoice-pdf?id=SALE_ID — скачать PDF накладной
//
// Скачать можно только СВОЮ оформленную накладную. Клиента определяем по
// подписанному токену и аккаунту в базе; накладная без клиента (гостевая)
// не принадлежит никому из вошедших — раньше пустой customer_id у токена
// совпадал с пустым у накладной, и проверка пропускала.
import { getValidClient } from "../lib/clientauth.js";
import { sget, okId } from "../lib/supa.js";
import { buildInvoicePDF } from "../lib/pdf.js";
import { invoiceCoverageStatus, invoiceDebtSummary } from "../lib/debt.js";

const eid = (v) => encodeURIComponent(String(v || ""));

// Не больше 30 PDF в 10 минут с одного клиента: каждый собирается заново.
const окно = new Map();
function можно(id) {
  const сейчас = Date.now();
  const было = (окно.get(id) || []).filter(t => сейчас - t < 600e3);
  if (было.length >= 30) { окно.set(id, было); return false; }
  было.push(сейчас); окно.set(id, было);
  if (окно.size > 5000) окно.clear();
  return true;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  res.setHeader("Cache-Control", "private, no-store");
  const client = await getValidClient(req);
  if (!client) return res.status(401).json({ error: "Не авторизован" });
  if (!client.customer_id || !okId(client.customer_id)) return res.status(403).json({ error: "Доступ запрещён" });

  const saleId = String(req.query?.id || "").trim();
  if (!saleId || !okId(saleId)) return res.status(400).json({ error: "id обязателен" });
  if (!можно(String(client.customer_id))) return res.status(429).json({ error: "Слишком много запросов. Попробуйте через несколько минут." });

  try {
    const sales = await sget(`sales?id=eq.${eid(saleId)}&select=*`);
    const sale = sales[0];
    if (!sale) return res.status(404).json({ error: "Накладная не найдена" });

    // клиент может скачать только свою накладную
    if (!sale.customer_id || String(sale.customer_id) !== String(client.customer_id)) return res.status(403).json({ error: "Доступ запрещён" });
    if (sale.status !== "final") return res.status(400).json({ error: "Накладная ещё не оформлена" });

    const ids = [...new Set((sale.items || []).map(i => i.product_id).filter(okId).map(String))];
    const cid = eid(sale.customer_id);
    const [customers, allSales, payments, products] = await Promise.all([
      sget(`customers?id=eq.${cid}&select=*`),
      sget(`sales?customer_id=eq.${cid}&select=id,date,currency,items,status`),
      sget(`payments?customer_id=eq.${cid}&select=amount,currency,date`),
      ids.length ? sget(`products?id=in.(${eid(ids.join(","))})&select=id,name`) : [],
    ]);
    const customer = customers[0] || { name: "—" };
    const status = invoiceCoverageStatus(sale.id, allSales, payments, customer.opening_debt);
    const debt = invoiceDebtSummary(sale.id, allSales, payments, customer.opening_debt);
    const bytes = await buildInvoicePDF({ sale, customer, products, status, debt });

    const dateStr = new Date(sale.date).toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="nakladnaya-${dateStr}.pdf"`);
    return res.status(200).end(Buffer.from(bytes));
  } catch (e) {
    console.error("client/invoice-pdf error", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
