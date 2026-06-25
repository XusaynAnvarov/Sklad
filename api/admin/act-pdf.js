// GET /api/admin/act-pdf?customer_id=… — скачать акт сверки клиента в PDF (admin-токен)
import { getUser } from "../lib/auth.js";
import { sget } from "../lib/supa.js";
import { buildReconciliationPDF } from "../lib/pdf.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: "Не авторизован" });

  const customer_id = String(req.query?.customer_id || "").trim();
  if (!customer_id) return res.status(400).json({ error: "customer_id required" });

  try {
    const customer = (await sget(`customers?id=eq.${encodeURIComponent(customer_id)}&select=*`))[0];
    if (!customer) return res.status(404).json({ error: "Клиент не найден" });

    const [sales, payments] = await Promise.all([
      sget(`sales?customer_id=eq.${customer_id}&status=eq.final&select=id,date,currency,items&order=date.asc`),
      sget(`payments?customer_id=eq.${customer_id}&select=amount,currency,date&order=date.asc`),
    ]);

    const bytes = await buildReconciliationPDF({ customer, sales, payments });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="akt-sverki.pdf"`);
    return res.status(200).end(Buffer.from(bytes));
  } catch (e) {
    console.error("admin/act-pdf error", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
