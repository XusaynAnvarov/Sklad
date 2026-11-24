// ========================================================================
//  /api/admin/facts — сведения о товарах (таблица product_fact).
//
//  GET                     → сводка: у каких товаров есть сведения
//  GET ?product=<uuid>     → все сведения одного товара
//  POST { product, факты } → сохранить набор сведений товара (только админ)
//
//  Гость (просмотр) читает, но не меняет. Проверка — api/lib/facts.js.
//  Сведения, которых экран не знает (свои поля карточки-картинки),
//  при сохранении не трогаются.
// ========================================================================
import { getUser } from "../lib/auth.js";
import { sget, supsert, sdelete } from "../lib/supa.js";
import { audit } from "../lib/crm.js";
import { ВИДЫ, проверитьСведения, сводкаСведений } from "../lib/facts.js";

const okUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ""));
const нетТаблицы = (e) => /product_fact|42P01|does not exist|PGRST205/i.test(String(e?.message || ""));

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    const user = await getUser(req, { allowGuest: true });
    if (!user) return res.status(401).json({ error: "Нужен вход в склад" });
    try {
      const товар = String(req.query?.product || "");
      if (товар) {
        if (!okUuid(товар)) return res.status(400).json({ error: "Неверный товар" });
        const строки = await sget(`product_fact?product_id=eq.${товар}&select=key,sort,value,source,confidence,confirmed_by,confirmed_at,updated_at&order=key,sort`);
        return res.status(200).json({ факты: строки || [], виды: ВИДЫ });
      }
      const строки = await sget("product_fact?select=product_id,key,value,source,confidence");
      return res.status(200).json({ сводка: сводкаСведений(строки), виды: ВИДЫ });
    } catch (e) {
      if (нетТаблицы(e)) return res.status(200).json({ сводка: [], виды: ВИДЫ, нетТаблицы: true });
      console.error("[сведения] чтение:", e.message);
      return res.status(500).json({ error: "Не удалось загрузить сведения" });
    }
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: "Менять сведения может только администратор" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const товар = String(body?.product || "");
  if (!okUuid(товар)) return res.status(400).json({ error: "Не указан товар" });
  if (!Array.isArray(body?.факты) || body.факты.length > 40) return res.status(400).json({ error: "Неверный список сведений" });

  const п = проверитьСведения(body.факты);
  if (!п.ok) return res.status(400).json({ error: п.ошибки.join(". "), code: "плохие_сведения" });

  try {
    const [есть] = await Promise.all([
      sget(`product_fact?product_id=eq.${товар}&select=key,sort,confidence,confirmed_by,confirmed_at`),
      sget(`products?id=eq.${товар}&select=id`).then((r) => { if (!r?.length) throw Object.assign(new Error("нет товара"), { нетТовара: true }); }),
    ]);
    const было = new Map((есть || []).map((с) => [`${с.key}|${с.sort}`, с]));
    const сейчас = new Date().toISOString();

    // Отметку «кто проверил» ставим, когда «проверено» появилось впервые,
    // и снимаем, если проверку убрали.
    const строки = п.строки.map((с) => {
      const прежняя = было.get(`${с.key}|${с.sort}`);
      const проверено = с.confidence === "подтверждено";
      return {
        product_id: товар, ...с, updated_at: сейчас,
        confirmed_by: проверено ? (прежняя?.confidence === "подтверждено" ? прежняя.confirmed_by : "владелец (склад)") : null,
        confirmed_at: проверено ? (прежняя?.confidence === "подтверждено" ? прежняя.confirmed_at : сейчас) : null,
      };
    });
    if (строки.length) await supsert("product_fact", строки);

    // Убрать то, что владелец удалил. Только известные экрану виды:
    // чужие поля (карточки-картинки и будущие) не трогаем никогда.
    const оставить = new Set(строки.map((с) => `${с.key}|${с.sort}`));
    const лишние = (есть || []).filter((с) => ВИДЫ[с.key] && !оставить.has(`${с.key}|${с.sort}`));
    for (const с of лишние) {
      await sdelete(`product_fact?product_id=eq.${товар}&key=eq.${encodeURIComponent(с.key)}&sort=eq.${Number(с.sort) || 0}`);
    }

    await audit("admin", "product_facts_save", товар, { сохранено: строки.length, удалено: лишние.length }).catch(() => {});
    const теперь = await sget(`product_fact?product_id=eq.${товар}&select=key,sort,value,source,confidence,confirmed_by,confirmed_at,updated_at&order=key,sort`);
    return res.status(200).json({ факты: теперь || [], сохранено: строки.length, удалено: лишние.length });
  } catch (e) {
    if (e?.нетТовара) return res.status(404).json({ error: "Такого товара нет" });
    if (нетТаблицы(e)) return res.status(409).json({ error: "Таблица сведений не создана. Выполните db/product-card-migration.sql", code: "нет_миграции" });
    console.error("[сведения] запись:", e.message);
    return res.status(500).json({ error: "Не удалось сохранить сведения. Подробности — в журнале сервера" });
  }
}
