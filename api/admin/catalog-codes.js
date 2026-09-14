// ========================================================================
//  РАЗДАЧА ПОСТОЯННЫХ КОДОВ ТОВАРАМ (LP-017) — для печатного каталога.
//
//  GET  /api/admin/catalog-codes  → что будет выдано, БЕЗ записи:
//       { колонка, всего, сКодом, выдать: [{ id, name, category, code }], новыеРазделы }
//  POST /api/admin/catalog-codes  { ожидается }  → записать.
//
//  Список на запись сервер считает сам, заново, а не берёт из браузера:
//  иначе через эту ручку можно было бы вписать любому товару любой код.
//  «ожидается» — сколько кодов владелец видел в списке. Если за это время
//  товаров без кода стало другое число, запись не идёт: пусть посмотрит
//  список ещё раз.
//
//  Пишем только поле code и только тем, у кого его всё ещё нет
//  (code=is.null): код, который успели выдать в карточке товара, не трогаем.
// ========================================================================
import { getUser } from "../lib/auth.js";
import { listAll } from "./db.js";
import { раздатьКоды, таблицаПоТоварам, БУКВЫ } from "../../js/catalogcode.js";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const заголовки = (extra = {}) => ({ apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "Content-Type": "application/json", ...extra });

async function sbGet(path) {
  const r = await fetch(SB_URL + "/rest/v1/" + path, { headers: заголовки() });
  if (!r.ok) {
    const e = new Error("DB GET " + r.status + ": " + (await r.text()).slice(0, 300));
    e.status = r.status;
    throw e;
  }
  return r.json();
}

// Колонки code нет, пока владелец не выполнил db/catalog-migration.sql.
const нетКолонки = (e) => /code/.test(String(e && e.message)) && /does not exist|42703/.test(String(e && e.message));

async function посчитать() {
  let товары;
  try {
    товары = await listAll("products", "select=id,name,category,code,created_at&order=created_at.asc,id.asc", sbGet);
  } catch (e) {
    if (нетКолонки(e)) return { колонка: false };
    throw e;
  }
  const { выдать, таблица } = раздатьКоды(товары, таблицаПоТоварам(товары));
  const новыеРазделы = Object.fromEntries(Object.entries(таблица).filter(([k]) => !(k in БУКВЫ)));
  return {
    колонка: true,
    всего: товары.length,
    сКодом: товары.filter(p => p.code).length,
    выдать,
    новыеРазделы,
  };
}

// Записать по одному товару, не больше ПАРАЛЛЕЛЬНО запросов разом.
async function записать(выдать) {
  const ПАРАЛЛЕЛЬНО = 8;
  let записано = 0;
  const ошибки = [];
  let i = 0;
  async function поток() {
    while (i < выдать.length) {
      const x = выдать[i++];
      try {
        const r = await fetch(`${SB_URL}/rest/v1/products?id=eq.${encodeURIComponent(x.id)}&code=is.null`, {
          method: "PATCH", headers: заголовки({ Prefer: "return=representation" }),
          body: JSON.stringify({ code: x.code }),
        });
        if (!r.ok) throw new Error((await r.text()).slice(0, 200));
        const строки = await r.json();
        // пусто — код успели выдать в карточке товара, пока шла раздача
        if (Array.isArray(строки) && строки.length) записано++;
        else ошибки.push({ id: x.id, name: x.name, code: x.code, ошибка: "у товара уже есть код — пропущен" });
      } catch (e) {
        ошибки.push({ id: x.id, name: x.name, code: x.code, ошибка: String(e.message || e) });
      }
    }
  }
  await Promise.all(Array.from({ length: ПАРАЛЛЕЛЬНО }, поток));
  return { записано, ошибки };
}

export default async function handler(req, res) {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: "Не авторизован" });
  if (!SB_URL || !SB_KEY) return res.status(500).json({ error: "SUPABASE_URL / SUPABASE_SERVICE_KEY не заданы" });

  try {
    const план = await посчитать();
    if (!план.колонка) {
      return res.status(409).json({ error: "Сначала выполните db/catalog-migration.sql в Supabase", колонка: false });
    }

    if (req.method === "GET") return res.json(план);

    if (req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") try { body = JSON.parse(body); } catch { body = {}; }
      const ожидается = Number(body && body.ожидается);
      if (!Number.isFinite(ожидается) || ожидается !== план.выдать.length) {
        return res.status(409).json({
          error: `Список изменился: сейчас без кода ${план.выдать.length}, а в просмотре было ${body && body.ожидается}. Откройте список заново.`,
          ...план,
        });
      }
      if (!план.выдать.length) return res.json({ записано: 0, ошибки: [] });
      const итог = await записать(план.выдать);
      return res.json(итог);
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error("[catalog-codes]", e);
    return res.status(500).json({ error: String(e.message || e) });
  }
}
