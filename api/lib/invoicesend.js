// ========================================================================
//  ОТПРАВИТЬ PDF НАКЛАДНОЙ В ЧАТ TELEGRAM.
//  Общая часть для бота (кнопки в чате) и мини-приложения («Накладные»):
//  PDF собирается одинаково, куда бы клиент ни нажал.
// ========================================================================
import { sget, okId } from "./supa.js";
import { buildInvoicePDF } from "./pdf.js";
import { invoiceCoverageStatus, invoiceDebtSummary } from "./debt.js";

const eid = (v) => encodeURIComponent(String(v || ""));
export const датаНакладной = (d) => new Date(d).toLocaleDateString("ru-RU");

// token — какого бота; cap — подпись под файлом.
// Возвращает true, если Telegram принял файл.
export async function отправитьНакладнуюPDF(token, chatId, saleId, cap) {
  if (!okId(saleId) || !token) return false;
  const sale = (await sget(`sales?id=eq.${eid(saleId)}&select=*`))[0];
  if (!sale) return false;
  const custId = okId(sale.customer_id) ? sale.customer_id : null;
  const customer = custId ? (await sget(`customers?id=eq.${eid(custId)}&select=*`))[0] : { name: "—" };
  const products = await sget("products?select=id,name,sku");
  const api = (m) => `https://api.telegram.org/bot${token}/${m}`;
  await fetch(api("sendChatAction"), {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "upload_document" }),
  }).catch(() => {});
  let status, debt;
  if (custId) {
    const [cs, pays] = await Promise.all([
      sget(`sales?customer_id=eq.${eid(custId)}&select=id,date,currency,items,status`),
      sget(`payments?customer_id=eq.${eid(custId)}&select=amount,currency,date`),
    ]);
    status = invoiceCoverageStatus(sale.id, cs, pays, customer.opening_debt);
    debt = invoiceDebtSummary(sale.id, cs, pays, customer.opening_debt);
  }
  const bytes = await buildInvoicePDF({ sale, customer, products, status, debt });
  const fd = new FormData();
  fd.append("chat_id", String(chatId));
  fd.append("caption", cap || `🧾 ${датаНакладной(sale.date)}`);
  fd.append("document", new Blob([bytes], { type: "application/pdf" }), `nakladnaya-${new Date(sale.date).toISOString().slice(0, 10)}.pdf`);
  const r = await fetch(api("sendDocument"), { method: "POST", body: fd });
  return r.ok;
}
