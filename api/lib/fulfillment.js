// ========================================================================
//  СБОРКА И ОТПРАВКА ЗАКАЗОВ — серверное ядро.
//
//  Этапы (db/order-fulfillment-migration.sql):
//    placed → packed → shipped,  исправление — на шаг назад с причиной.
//
//  Переход делает ТОЛЬКО SQL-функция fulfillment_transition: блокировка
//  строки, сверка ожидаемого этапа, запрет пропуска и журнал — всё в одной
//  транзакции. Здесь — вызов функции, перевод её ошибок в ответы и
//  уведомление клиента ПОСЛЕ успешной записи.
//
//  Остатки, суммы и оплата накладной не читаются и не меняются.
// ========================================================================
import { sget, supsert, okId } from "./supa.js";
import { СВОЯ_БАЗА, база } from "./pg.js";
import { забыть } from "./memcache.js";

const SB_URL = () => process.env.SUPABASE_URL;
const SB_KEY = () => process.env.SUPABASE_SERVICE_KEY;

export const ЭТАПЫ = ["placed", "packed", "shipped"];
export const ДЕЙСТВИЯ = ["track", "pack", "ship", "correct"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const этоUuid = (v) => UUID.test(String(v || ""));

// Короткий номер — тот же, что печатается в PDF накладной (api/lib/pdf.js).
export const номерЗаказа = (id) => String(id || "").replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase();

// Текст из запроса: без управляющих символов, обрезан по длине.
export const обрезать = (v, n) => {
  const s = String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return s ? s.slice(0, n) : null;
};

// Ошибка с HTTP-кодом для ответа.
export class ОшибкаЭтапа extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status; this.code = code;
    Object.assign(this, extra);
  }
}

// Таблиц ещё нет (миграцию не применили) — узнаём по тексту ошибки базы.
export const нетТаблицы = (msg) => /fulfillment/.test(msg || "")
  && /does not exist|could not find|PGRST202|PGRST205|42P01|42883|schema cache/i.test(msg || "");

// Перевод ошибок SQL-функции ('ff:…') в понятный ответ. Текст базы наружу
// не уходит — только наш код и фраза.
export function перевести(msg) {
  const m = String(msg || "");
  const k = m.match(/ff:([a-z_]+)(?::([a-z]+))?/);
  if (!k) {
    if (нетТаблицы(m)) return new ОшибкаЭтапа(503, "not_migrated", "Учёт сборки ещё не включён: примените db/order-fulfillment-migration.sql");
    return new ОшибкаЭтапа(500, "db", "Не удалось сохранить. Попробуйте ещё раз.");
  }
  const code = k[1], stage = ЭТАПЫ.includes(k[2]) ? k[2] : undefined;
  switch (code) {
    case "conflict": return new ОшибкаЭтапа(409, code, "Заказ уже изменил другой сотрудник — показываю актуальный этап.", { stage });
    case "bad_step": return new ОшибкаЭтапа(409, code, "Этот шаг сейчас недоступен: этапы идут строго по порядку.", { stage });
    case "not_final": return new ОшибкаЭтапа(400, code, "Сначала оформите накладную (склад + PDF) — до этого товар не списан.");
    case "not_tracked": return new ОшибкаЭтапа(400, code, "Накладная оформлена до запуска учёта. Сначала нажмите «Взять в учёт».");
    case "refund": return new ОшибкаЭтапа(400, code, "Возврат не собирают и не отправляют.");
    case "sale_not_found": return new ОшибкаЭтапа(404, code, "Накладная не найдена.");
    case "actor_required": return new ОшибкаЭтапа(400, code, "Укажите, кто подтверждает.");
    case "reason_required": return new ОшибкаЭтапа(400, code, "Для исправления нужна причина (не короче 3 символов).");
    default: return new ОшибкаЭтапа(400, "rejected", "Действие отклонено.");
  }
}

// ---------- вызов SQL-функции ----------
async function rpc(имя, аргументы) {
  if (СВОЯ_БАЗА) {
    const ключи = Object.keys(аргументы);
    const sql = `select ${имя}(${ключи.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`;
    const бд = await база();
    const r = await бд.query(sql, ключи.map(k => аргументы[k]));
    return r.rows[0]?.r ?? null;
  }
  const r = await fetch(`${SB_URL()}/rest/v1/rpc/${имя}`, {
    method: "POST",
    headers: { apikey: SB_KEY(), Authorization: "Bearer " + SB_KEY(), "Content-Type": "application/json" },
    body: JSON.stringify(аргументы),
  });
  const txt = await r.text();
  if (!r.ok) {
    let j = {}; try { j = JSON.parse(txt); } catch {}
    throw new Error([j.message, j.code, j.hint, txt.slice(0, 200)].filter(Boolean).join(" "));
  }
  return txt ? JSON.parse(txt) : null;
}

// Переход этапа. Возвращает новую строку order_fulfillment.
export async function перейти({ sale_id, action, expected, actor, role = "admin", reason, carrier, tracking, comment }) {
  if (!этоUuid(sale_id)) throw new ОшибкаЭтапа(400, "bad_id", "Неверный номер накладной.");
  if (!ДЕЙСТВИЯ.includes(action)) throw new ОшибкаЭтапа(400, "bad_action", "Неизвестное действие.");
  if (expected != null && !ЭТАПЫ.includes(expected)) throw new ОшибкаЭтапа(400, "bad_stage", "Неизвестный этап.");
  try {
    const row = await rpc("fulfillment_transition", {
      p_sale: sale_id, p_action: action, p_expected: expected ?? null,
      p_actor: обрезать(actor, 80), p_role: role,
      p_reason: обрезать(reason, 500), p_carrier: обрезать(carrier, 120),
      p_tracking: обрезать(tracking, 120), p_comment: обрезать(comment, 500),
    });
    забыть("db:");
    return row;
  } catch (e) {
    if (e instanceof ОшибкаЭтапа) throw e;
    const о = перевести(e.message);
    if (о.code === "db") console.error("[сборка] переход не записан:", e.message);
    throw о;
  }
}

export async function проверитьЖурнал() {
  try { return await rpc("fulfillment_verify", {}); }
  catch (e) { throw перевести(e.message); }
}

// Всё для раздела склада: с какого момента идёт учёт, этапы, журнал и
// раскладка доски (ручной порядок, «срочно»). Доска читается отдельно:
// без её таблицы этапы работают, просто перестановка выключена.
export async function состояние({ журналДо = 3000 } = {}) {
  let основное;
  try {
    const [cfg, rows, log] = await Promise.all([
      sget("fulfillment_config?id=eq.1&select=since"),
      sget("order_fulfillment?select=*&order=updated_at.desc"),
      sget(`order_fulfillment_log?select=id,sale_id,action,from_stage,to_stage,actor,actor_role,reason,carrier,tracking,comment,at&order=id.desc&limit=${журналДо}`),
    ]);
    основное = { migrated: true, since: cfg[0]?.since || null, rows, log };
  } catch (e) {
    if (нетТаблицы(e.message)) return { migrated: false, since: null, rows: [], log: [], board: [], boardMigrated: false };
    throw e;
  }
  try {
    const board = await sget("order_board?select=sale_id,sort_key,urgent");
    return { ...основное, board, boardMigrated: true };
  } catch (e) {
    if (!/order_board/.test(e.message || "")) console.warn("[доска] раскладка не прочитана:", e.message);
    return { ...основное, board: [], boardMigrated: false };
  }
}

// ---------- доска: порядок и «срочно» ----------
// Не статус: журнал не пишется, этап не меняется, накладная не трогается.
const МАКС_КАРТОЧЕК = 3000;
const нетДоски = (msg) => /order_board/.test(msg || "") && /does not exist|could not find|PGRST205|42P01|schema cache/i.test(msg || "");

// Ручной порядок колонки: ids сверху вниз. Ключи переписываются целиком —
// так не накапливаются дроби и не бывает двух карточек на одном месте.
export async function переставить(ids, actor) {
  if (!Array.isArray(ids) || !ids.length || ids.length > МАКС_КАРТОЧЕК) throw new ОшибкаЭтапа(400, "bad_order", "Неверный порядок карточек.");
  if (!ids.every(этоUuid)) throw new ОшибкаЭтапа(400, "bad_id", "Неверный номер накладной.");
  if (new Set(ids.map(String)).size !== ids.length) throw new ОшибкаЭтапа(400, "duplicate", "Карточка повторяется в порядке.");
  const now = new Date().toISOString(), кто = обрезать(actor, 80);
  const строки = ids.map((id, i) => ({ sale_id: id, sort_key: (i + 1) * 1024, updated_at: now, updated_by: кто }));
  try { await supsert("order_board", строки); }
  catch (e) {
    if (нетДоски(e.message)) throw new ОшибкаЭтапа(503, "board_not_migrated", "Порядок ещё не сохраняется: примените db/order-board-migration.sql");
    console.error("[доска] порядок не записан:", e.message);
    throw new ОшибкаЭтапа(500, "db", "Не удалось сохранить порядок. Попробуйте ещё раз.");
  }
  return { saved: строки.length };
}

export async function отметитьСрочно(sale_id, urgent, actor) {
  if (!этоUuid(sale_id)) throw new ОшибкаЭтапа(400, "bad_id", "Неверный номер накладной.");
  if (typeof urgent !== "boolean") throw new ОшибкаЭтапа(400, "bad_flag", "Неверная отметка.");
  try {
    await supsert("order_board", [{ sale_id, urgent, updated_at: new Date().toISOString(), updated_by: обрезать(actor, 80) }]);
  } catch (e) {
    if (нетДоски(e.message)) throw new ОшибкаЭтапа(503, "board_not_migrated", "Отметка «срочно» ещё не сохраняется: примените db/order-board-migration.sql");
    console.error("[доска] «срочно» не записано:", e.message);
    throw new ОшибкаЭтапа(500, "db", "Не удалось сохранить отметку. Попробуйте ещё раз.");
  }
  return { sale_id, urgent };
}

// Попадает ли накладная в учёт без отдельного «Взять в учёт».
export function вУчёте(sale, since, есть) {
  if (!sale || sale.status !== "final" || sale.source === "refund") return false;
  if (есть) return true;
  if (!since) return false;
  const t = new Date(since).getTime();
  return new Date(sale.created_at || 0).getTime() >= t || new Date(sale.date || 0).getTime() >= t;
}

// Что видит клиент: только этап, время и данные доставки. Кто подтверждал,
// комментарии и журнал — внутренние, наружу не отдаются.
export function дляКлиента(sale, row, since) {
  if (!вУчёте(sale, since, !!row)) return null;
  const stage = row?.stage || "placed";
  return {
    stage,
    placed_at: sale.date || sale.created_at || null,
    packed_at: stage !== "placed" ? row?.packed_at || null : null,
    shipped_at: stage === "shipped" ? row?.shipped_at || null : null,
    carrier: stage === "shipped" ? row?.carrier || null : null,
    tracking: stage === "shipped" ? row?.tracking || null : null,
  };
}

// Этапы для набора накладных клиента (кабинет).
export async function этапыДляНакладных(sales) {
  const ids = (sales || []).filter(s => s.status === "final" && okId(s.id)).map(s => s.id);
  if (!ids.length) return new Map();
  try {
    const [cfg, rows] = await Promise.all([
      sget("fulfillment_config?id=eq.1&select=since"),
      sget(`order_fulfillment?sale_id=in.(${encodeURIComponent(ids.join(","))})&select=sale_id,stage,packed_at,shipped_at,carrier,tracking`),
    ]);
    const since = cfg[0]?.since || null;
    const byId = new Map(rows.map(r => [String(r.sale_id), r]));
    const out = new Map();
    for (const s of sales) {
      const v = дляКлиента(s, byId.get(String(s.id)), since);
      if (v) out.set(String(s.id), v);
    }
    return out;
  } catch (e) {
    if (!нетТаблицы(e.message)) console.warn("[сборка] этапы для кабинета не прочитаны:", e.message);
    return new Map();
  }
}

// ---------- уведомление клиента ----------
// Шлётся ТОЛЬКО после успешной записи этапа и только на сборку/отправку.
// Сбой Telegram этап не откатывает — он уже сохранён.
const ТЕКСТ = {
  packed: {
    ru: (n, d) => `📦 Ваш заказ № ${n} от ${d} собран и проверен. Скоро передадим его на отправку.`,
    uz: (n, d) => `📦 ${d} sanadagi № ${n} buyurtmangiz yig‘ildi va tekshirildi. Tez orada jo‘natamiz.`,
    en: (n, d) => `📦 Your order No. ${n} of ${d} has been packed and checked. It will be handed over for shipping soon.`,
  },
  shipped: {
    ru: (n, d) => `🚚 Ваш заказ № ${n} от ${d} отправлен.`,
    uz: (n, d) => `🚚 ${d} sanadagi № ${n} buyurtmangiz jo‘natildi.`,
    en: (n, d) => `🚚 Your order No. ${n} of ${d} has been shipped.`,
  },
  carrier: { ru: "Перевозчик", uz: "Tashuvchi", en: "Carrier" },
  tracking: { ru: "Номер накладной", uz: "Yuk xati raqami", en: "Tracking number" },
};

async function tgSend(token, chatId, text) {
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: String(chatId), text, disable_web_page_preview: true }),
      });
      if (r.ok) return true;
      if (r.status < 500 && r.status !== 429) return false;
    } catch {}
    await new Promise(z => setTimeout(z, 800));
  }
  return false;
}

export async function уведомитьКлиента(sale_id, row) {
  const token = process.env.CLIENT_BOT_TOKEN;
  if (!token || !row || !["packed", "shipped"].includes(row.stage) || !okId(sale_id)) return false;
  try {
    const sale = (await sget(`sales?id=eq.${encodeURIComponent(sale_id)}&select=id,customer_id,date,order_from`))[0];
    if (!sale) return false;
    let customer = null;
    if (sale.customer_id && okId(sale.customer_id)) {
      customer = (await sget(`customers?id=eq.${encodeURIComponent(sale.customer_id)}&select=id,tg_chat_id,tg_lang`))[0] || null;
    }
    const chat = customer?.tg_chat_id || (!sale.customer_id ? sale.order_from?.chat_id : null);
    if (!chat) return false;
    let lang = customer?.tg_lang;
    if (!lang) {
      try { lang = (await sget(`bot_sessions?chat_id=eq.${encodeURIComponent(String(chat))}&select=lang`))[0]?.lang; } catch {}
    }
    if (!["ru", "uz", "en"].includes(lang)) lang = "ru";
    const d = new Date(sale.date || Date.now()).toLocaleDateString("ru-RU", { timeZone: "Asia/Tashkent" });
    let text = ТЕКСТ[row.stage][lang](номерЗаказа(sale.id), d);
    if (row.stage === "shipped") {
      if (row.carrier) text += `\n${ТЕКСТ.carrier[lang]}: ${row.carrier}`;
      if (row.tracking) text += `\n${ТЕКСТ.tracking[lang]}: ${row.tracking}`;
    }
    return await tgSend(token, chat, text);
  } catch (e) {
    console.warn("[сборка] уведомление клиенту не ушло:", e.message);
    return false;
  }
}
