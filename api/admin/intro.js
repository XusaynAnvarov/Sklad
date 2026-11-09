// ========================================================================
//  СКЛАД → «Вступительное видео» (js/pages/intro_admin.js).
//
//  GET  /api/admin/intro                — настройки, история, статистика
//  POST /api/admin/intro { action }     — publish | rollback
//
//  Пишет только файл data/intro.json. Склад, заказы и база не меняются.
// ========================================================================
import { getUser } from "../lib/auth.js";
import { данные, опубликовать, откатить, очистить, сводка, НАСТРОЙКИ_ПО_УМОЛЧАНИЮ } from "../lib/introstore.js";
import { забыть } from "../lib/memcache.js";

export default async function handler(req, res) {
  const чтение = req.method === "GET";
  const user = await getUser(req, { allowGuest: чтение });
  if (!user) return res.status(401).json({ error: "Не авторизован" });
  res.setHeader("Cache-Control", "no-store");

  try {
    if (чтение) {
      const d = данные();
      return res.json({
        settings: d.settings,
        defaults: НАСТРОЙКИ_ПО_УМОЛЧАНИЮ,
        rev: d.rev,
        updated_at: d.updated_at,
        label: d.label || "",
        history: d.history.map(h => ({ id: h.id, at: h.at, label: h.label, rev: h.rev, enabled: !!h.settings?.enabled, mode: h.settings?.mode })),
        stats: сводка(Number(req.query?.days) || 30),
      });
    }
    if (user.role !== "admin") return res.status(403).json({ error: "Только для владельца" });

    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
    const action = body?.action;

    if (action === "publish") {
      const новые = очистить(body.settings || {}, данные().settings);
      const d = опубликовать(новые, String(body.label || "Публикация настроек").slice(0, 80));
      забыть && забыть("intro:");
      return res.json({ ok: true, rev: d.rev, settings: d.settings });
    }
    if (action === "rollback") {
      const id = String(body.id || "");
      if (!/^[a-z0-9]{4,16}$/.test(id)) return res.status(400).json({ error: "Некорректный id" });
      const d = откатить(id);
      if (!d) return res.status(404).json({ error: "Версия не найдена" });
      забыть && забыть("intro:");
      return res.json({ ok: true, rev: d.rev, settings: d.settings });
    }
    return res.status(400).json({ error: "Неизвестное действие" });
  } catch (e) {
    console.error("[admin/intro]", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
