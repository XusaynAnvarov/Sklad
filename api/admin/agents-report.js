// ========================================================================
//  /api/admin/agents-report — отчёт одного агента.
//
//  GET ?agent=<id>[&runs=50][&notices=100]
//     → { агент, прогоны, уведомления, согласования }
//
//  Отдельная ручка от /api/admin/agents не для красоты: состояние всех
//  агентов запрашивается часто и должно быть лёгким, а история одного
//  агента — редко и помногу. Смешивать их в одном ответе значит каждые
//  полминуты тянуть сотни строк, которые никто не смотрит.
//
//  Только чтение. Гостевой пропуск допускается: смотреть историю можно,
//  менять что-либо отсюда нельзя — здесь просто нет такой возможности.
// ========================================================================
import { getUser } from "../lib/auth.js";
import { историяАгента } from "../lib/agents/core.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const user = await getUser(req, { allowGuest: true });
  if (!user) return res.status(401).json({ error: "Нужен вход в склад" });

  const id = String(req.query?.agent || "");
  if (!/^[a-z_]{2,32}$/.test(id)) return res.status(400).json({ error: "Не указан агент" });

  try {
    return res.status(200).json(await историяАгента(id, {
      прогонов: Number(req.query?.runs) || 50,
      уведомлений: Number(req.query?.notices) || 100,
    }));
  } catch (e) {
    if (/Неизвестный агент/.test(e.message)) return res.status(404).json({ error: e.message });
    console.error("[агенты] отчёт:", e.message);
    return res.status(500).json({ error: "Не удалось загрузить отчёт" });
  }
}
