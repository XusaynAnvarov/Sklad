// ========================================================================
//  /api/admin/agents — раздел «ИИ-Агенты» в складе.
//
//  GET                  → состояние всех агентов, прогоны, уведомления,
//                         ожидающие согласования   (админ или гость-просмотр)
//  GET ?run=<uuid>      → подробности прогона и его субагентов
//
//  POST { action, ... } — ТОЛЬКО администратор:
//     run      { id }                       запустить агента сейчас
//     enable   { id }  /  disable { id }    включить / приостановить
//     schedule { id, schedule }             сменить расписание
//     config   { id, config }               настройки агента
//     seen     { ids: [...] }               отметить уведомления прочитанными
//     approve  { id }                       одобрить предложение
//     reject   { id }                       отклонить
//     plan     { id, when }                 запланировать на время
//     channel  { id }                       одобренный в тестовом режиме пост — в канал (один раз)
//     edit_post { id, товары:[{id,текст}] } правка ждущего черновика поста (текст обычный)
//
//  Гость (просмотр) сюда не проходит: решения принимает только владелец.
//  Любое решение попадает в журнал действий (crm_audit).
// ========================================================================
import { getUser } from "../lib/auth.js";
import {
  состояние, отчётПрогона, запустить, включить, сменитьРасписание,
  сменитьНастройки, отметитьПрочитанным, решить, таблицыГотовы, записатьРезультат,
  текущиеНастройки, отправитьВКанал, правитьЧерновик,
} from "../lib/agents/core.js";
import { проверитьНастройки } from "../lib/agents/настройки.js";
import { sget } from "../lib/supa.js";
import { исполнить } from "../lib/agents/исполнение.js";

const okId = (v) => /^[a-z_]{2,32}$/.test(String(v || ""));
const okUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ""));

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    const user = await getUser(req, { allowGuest: true });
    if (!user) return res.status(401).json({ error: "Нужен вход в склад" });
    try {
      // ?waits=1 — «Ждут товар»: кто ждёт поступления (api/lib/stockwait.js).
      if (String(req.query?.waits || "") === "1") {
        const { сводкаОжиданий } = await import("../lib/stockwait.js");
        return res.status(200).json(await сводкаОжиданий());
      }
      const run = String(req.query?.run || "");
      if (run) {
        if (!okUuid(run)) return res.status(400).json({ error: "Неверный номер прогона" });
        const о = await отчётПрогона(run);
        return о ? res.status(200).json(о) : res.status(404).json({ error: "Прогон не найден" });
      }
      return res.status(200).json(await состояние());
    } catch (e) {
      console.error("[агенты] чтение:", e.message);
      return res.status(500).json({ error: "Не удалось загрузить состояние агентов" });
    }
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: "Решения по агентам принимает только администратор" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body && typeof body === "object" ? body : {};
  const действие = String(body.action || "");

  if (!таблицыГотовы()) {
    return res.status(409).json({
      error: "Таблицы агентов ещё не созданы. Выполните db/agents-migration.sql в SQL-редакторе Supabase.",
      code: "нет_миграции",
    });
  }

  try {
    switch (действие) {
      case "run": {
        if (!okId(body.id)) return res.status(400).json({ error: "Не указан агент" });
        const r = await запустить(body.id, { trigger: "manual" });
        return res.status(200).json(r);
      }
      case "enable":
      case "disable": {
        if (!okId(body.id)) return res.status(400).json({ error: "Не указан агент" });
        await включить(body.id, действие === "enable");
        return res.status(200).json(await состояние());
      }
      case "schedule": {
        if (!okId(body.id)) return res.status(400).json({ error: "Не указан агент" });
        await сменитьРасписание(body.id, body.schedule || {});
        return res.status(200).json(await состояние());
      }
      case "config": {
        if (!okId(body.id)) return res.status(400).json({ error: "Не указан агент" });
        // Настройки проверяются здесь, а не в браузере: в базу попадает
        // только то, что прошло проверку (api/lib/agents/настройки.js).
        const [было, служебный] = await Promise.all([
          текущиеНастройки(body.id),
          sget("settings?select=telegram_channel").then((r) => r?.[0]?.telegram_channel || "").catch(() => ""),
        ]);
        const п = проверитьНастройки(body.id, body.config || {}, { было, каналНакладных: служебный });
        if (!п.ok) return res.status(400).json({ error: п.ошибки.join(". "), code: "плохие_настройки" });
        await сменитьНастройки(body.id, п.config);
        return res.status(200).json(await состояние());
      }
      case "edit_post": {
        // Правка черновика поста: текст товаров и состав. Разметку ставит
        // сервер сам (js/post-text.js) — из браузера приходит обычный текст.
        if (!okUuid(body.id)) return res.status(400).json({ error: "Не указан черновик" });
        if (!Array.isArray(body.товары) || body.товары.length > 20) return res.status(400).json({ error: "Неверный состав поста" });
        const итог = await правитьЧерновик(body.id, body.товары, { кто: "владелец (склад)" });
        if (!итог.ок) return res.status(итог.уже ? 409 : 400).json({ error: итог.причина, code: итог.уже ? "уже_решено" : "плохая_правка" });
        return res.status(200).json(await состояние());
      }
      case "channel": {
        // Пост, одобренный в тестовом режиме, — теперь в канал. Ровно один
        // раз: защита от повтора — в самом отправитьВКанал (core.js).
        if (!okUuid(body.id)) return res.status(400).json({ error: "Не указан пост" });
        const итог = await отправитьВКанал(body.id, { кто: "владелец (склад)" });
        if (!итог.ок) return res.status(итог.уже ? 409 : 400).json({ error: итог.причина || "Не отправлено", code: итог.уже ? "уже_в_канале" : "не_отправлено" });
        return res.status(200).json({ итог });
      }
      case "seen": {
        const n = await отметитьПрочитанным(body.ids || body.id);
        return res.status(200).json({ отмечено: n });
      }
      case "approve":
      case "reject":
      case "plan": {
        if (!okUuid(body.id)) return res.status(400).json({ error: "Не указано предложение" });
        const решение = действие === "approve" ? "approved" : действие === "reject" ? "rejected" : "scheduled";
        const когда = действие === "plan" ? Date.parse(body.when || "") : null;
        if (действие === "plan" && !Number.isFinite(когда))
          return res.status(400).json({ error: "Не разобрал дату публикации" });
        const строка = await решить(body.id, решение, { кто: "admin", через: "admin", когда });
        if (!строка) return res.status(409).json({ error: "Это предложение уже решено", code: "уже_решено" });
        // Исполняем только одобренное. «Запланировать» ждёт своего часа,
        // «Отклонить» не делает ничего — так и задумано.
        if (решение === "approved") {
          const итог = await исполнить(строка).catch((e) => ({ ок: false, причина: e.message }));
          await записатьРезультат(строка.id, итог).catch(() => {});
          return res.status(200).json({ строка, итог });
        }
        return res.status(200).json({ строка });
      }
      default:
        return res.status(400).json({ error: "Непонятное действие: " + действие });
    }
  } catch (e) {
    // Подробности — в журнал сервера, наружу — общая фраза.
    console.error("[агенты] действие " + действие + ":", e.message);
    return res.status(500).json({ error: "Не удалось выполнить действие. Подробности — в журнале сервера" });
  }
}
