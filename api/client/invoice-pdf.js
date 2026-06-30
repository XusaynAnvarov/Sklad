// GET /api/client/invoice-pdf?id=SALE_ID — скачать PDF накладной
import { getClient } from "../lib/clientauth.js";
import { sget } from "../lib/supa.js";
import { buildInvoicePDF } from "../lib/pdf.js";
import { invoiceCoverageStatus } from "../lib/debt.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const client = getClient(req);
  if (!client) return res.status(401).json({ error: "Не авторизован" });

  const saleId = String(req.query?.id || "").trim();
  if (!saleId) return res.status(400).json({ error: "id обязателен" });

  try {
    const [sales] = await Promise.all([
      sget(`sales?id=eq.${encodeURIComponent(saleId)}&select=*`),
    ]);
    const sale = sales[0];
    if (!sale) return res.status(404).json({ error: "Накладная не найдена" });

    // клиент может скачать только свою накладную
    if (sale.customer_id !== client.customer_id) return res.status(403).json({ error: "Доступ запрещён" });
    if (sale.status !== "final") return res.status(400).json({ error: "Накладная ещё не оформлена" });

    const [customers, allSales, payments, products] = await Promise.all([
      sget(`customers?id=eq.${sale.customer_id}&select=*`),
      sget(`sales?customer_id=eq.${sale.customer_id}&select=id,date,currency,items`),
      sget(`payments?customer_id=eq.${sale.customer_id}&select=amount,currency`),
      sget("products?select=id,name,sku"),
    ]);
    const customer = customers[0] || { name: "—" };
    const status = invoiceCoverageStatus(sale.id, allSales, payments, customer.opening_debt);
    const bytes = await buildInvoicePDF({ sale, customer, products, status });

    const dateStr = new Date(sale.date).toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="nakladnaya-${dateStr}.pdf"`);
    return res.status(200).end(Buffer.from(bytes));
  } catch (e) {
    console.error("client/invoice-pdf error", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
