// ========================================================================
//  /api/admin/fulfillment — сборка и отправка заказов (раздел склада).
//
//  GET              → { migrated, since, rows, log }   (админ или гость-просмотр)
//  GET ?verify=1    → { ok, checked, problems }        проверка журнала
//  POST { sale_id, action, expected, actor, reason?, carrier?, tracking?, comment? }
//       action: track | pack | ship | correct          (ТОЛЬКО админ)
//       → { row, notified }
//
//  Этап меняется только SQL-функцией (см. api/lib/fulfillment.js): ответ
//  приходит после записи в базу, уведомление клиенту — после ответа базы.
//  409 — заказ уже изменил другой сотрудник (в ответе актуальный этап).
// ========================================================================
import { getUser } from "../lib/auth.js";
import { состояние, проверитьЖурнал, перейти, уведомитьКлиента, ОшибкаЭтапа } from "../lib/fulfillment.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    const user = await getUser(req, { allowGuest: true });
    if (!user) return res.status(401).json({ error: "Нужен вход в склад" });
    try {
      if (String(req.query?.verify || "") === "1") return res.status(200).json(await проверитьЖурнал());
      return res.status(200).json(await состояние());
    } catch (e) {
      if (e instanceof ОшибкаЭтапа) return res.status(e.status).json({ error: e.message, code: e.code });
      console.error("[сборка] чтение:", e.message);
      return res.status(500).json({ error: "Не удалось загрузить заказы" });
    }
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Гость (просмотр) сюда не проходит: getUser без allowGuest.
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: "Менять этапы может только администратор" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body && typeof body === "object" ? body : {};

  try {
    const row = await перейти({
      sale_id: body.sale_id, action: body.action, expected: body.expected ?? null,
      actor: body.actor, role: user.role === "admin" ? "admin" : "user",
      reason: body.reason, carrier: body.carrier, tracking: body.tracking, comment: body.comment,
    });
    // Только сборка и отправка, и только после того, как база подтвердила запись.
    const notified = (body.action === "pack" || body.action === "ship") && body.notify !== false
      ? await уведомитьКлиента(body.sale_id, row)
      : false;
    return res.status(200).json({ row, notified });
  } catch (e) {
    if (e instanceof ОшибкаЭтапа) return res.status(e.status).json({ error: e.message, code: e.code, stage: e.stage });
    console.error("[сборка] переход:", e.message);
    return res.status(500).json({ error: "Не удалось сохранить. Попробуйте ещё раз." });
  }
}
