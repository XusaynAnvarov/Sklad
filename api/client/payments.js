// GET /api/client/payments — история оплат клиента
import { getClient } from "../lib/clientauth.js";
import { sget } from "../lib/supa.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const client = getClient(req);
  if (!client) return res.status(401).json({ error: "Не авторизован" });
  if (!client.customer_id) return res.status(200).json({ payments: [] });

  try {
    const payments = await sget(
      `payments?customer_id=eq.${client.customer_id}&select=id,amount,currency,date,note&order=date.desc`
    );
    return res.status(200).json({ payments });
  } catch (e) {
    console.error("client/payments error", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
