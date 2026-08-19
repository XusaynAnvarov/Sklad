// ========================================================================
//  POST /api/admin/invoice-pdf — собрать PDF накладной и прислать его
//  ВЛАДЕЛЬЦУ в Telegram. Из бота он пересылает файл покупателю.
//  Body: { id } — номер накладной.
//  Доступ: токен склада (getUser) — тот же, что выдаёт вход в мини-приложение.
//  ENV: CLIENT_BOT_TOKEN, ADMIN_CHAT_ID
// ========================================================================
import { getUser } from "../lib/auth.js";
import { sget, okId } from "../lib/supa.js";
import { buildInvoicePDF } from "../lib/pdf.js";
import { invoiceCoverageStatus, invoiceDebtSummary } from "../lib/debt.js";

const BOT_TOKEN = process.env.CLIENT_BOT_TOKEN;
const ADMIN_CHAT = process.env.ADMIN_CHAT_ID;
const eid = (v) => encodeURIComponent(String(v || ""));

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Только POST" });
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: "Не авторизован" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const saleId = String((body && body.id) || "").trim();
  if (!okId(saleId)) return res.status(400).json({ error: "Неверный номер накладной" });

  if (!BOT_TOKEN || !ADMIN_CHAT) {
    console.error("invoice-pdf: не заданы CLIENT_BOT_TOKEN или ADMIN_CHAT_ID");
    return res.status(500).json({ error: "Сервер не настроен" });
  }

  try {
    const sale = (await sget(`sales?id=eq.${eid(saleId)}&select=*`))[0];
    if (!sale) return res.status(404).json({ error: "Накладная не найдена" });

    // Кому: настоящий клиент из базы либо имя-подпись обычной продажи.
    // Подпись клиента в базе не создаёт — она только печатается на накладной.
    let customer = { name: sale.order_from?.name || "—" };
    if (okId(sale.customer_id)) {
      const c = (await sget(`customers?id=eq.${eid(sale.customer_id)}&select=*`))[0];
      if (c) customer = c;
    }

    const products = await sget("products?select=id,name,sku");

    // Долг и оплата показываются только для продаж настоящему клиенту:
    // у обычной продажи долга нет по определению.
    let status, debt;
    if (okId(sale.customer_id)) {
      const [cs, pays] = await Promise.all([
        sget(`sales?customer_id=eq.${eid(sale.customer_id)}&select=id,date,currency,items,status`),
        sget(`payments?customer_id=eq.${eid(sale.customer_id)}&select=amount,currency,date`),
      ]);
      status = invoiceCoverageStatus(sale.id, cs, pays, customer.opening_debt);
      debt = invoiceDebtSummary(sale.id, cs, pays, customer.opening_debt);
    }

    const bytes = await buildInvoicePDF({ sale, customer, products, status, debt });
    const day = new Date(sale.date || Date.now()).toISOString().slice(0, 10);

    const fd = new FormData();
    fd.append("chat_id", String(ADMIN_CHAT));
    fd.append("caption", `Накладная от ${new Date(sale.date || Date.now()).toLocaleDateString("ru-RU")}` +
      (customer.name && customer.name !== "—" ? ` · ${customer.name}` : ""));
    fd.append("document", new Blob([bytes], { type: "application/pdf" }), `nakladnaya-${day}.pdf`);
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
      method: "POST", body: fd, signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) {
      console.error("invoice-pdf: Telegram ответил", r.status);
      return res.status(502).json({ error: "Telegram не принял файл" });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("invoice-pdf error", e);
    return res.status(500).json({ error: "Не удалось собрать накладную" });
  }
}
