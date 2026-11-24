// ========================================================================
//  «СНОВА В НАЛИЧИИ» — кто ждёт товар и как ему сообщить.
//
//  Клиент жмёт на сайте «Сообщить, когда появится» → открывается бот
//  магазина с командой /start wait_<КОД> → здесь появляется ожидание.
//  Раз в несколько минут рассыльщик смотрит: товар снова есть? —
//  бот пишет клиенту ОДИН раз, ожидание закрывается.
//
//  Правила:
//   • одно ожидание на человека и товар (уникальный индекс в базе);
//   • перед отправкой ожидание «захватывается» условной записью
//     (notified_at ещё пуст) — два рассыльщика одно и то же не отправят;
//   • за один проход — не больше ЛИМИТ сообщений: Telegram не любит
//     пачки, а остальные уйдут следующим проходом;
//   • пока таблица не создана (db/stock-wait-migration.sql), всё молча
//     выключено: сайт и бот работают как раньше.
// ========================================================================
import { sget, sinsert, spatch } from "./supa.js";

export const ЛИМИТ = 25;
const КОД = /^[A-Za-z]{1,6}-\d{1,6}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const нетТаблицы = (e) => /stock_wait|42P01|does not exist|PGRST205/i.test(String(e?.message || ""));
const дубль = (e) => /23505|duplicate key|stock_wait_active/i.test(String(e?.message || ""));

// Код товара в ссылке t.me/<бот>?start=wait_<код>. Telegram пускает в
// параметр только латиницу, цифры, «_» и «-», до 64 знаков.
export const параметрОжидания = (код) => "wait_" + String(код || "").trim();
export function разобратьПараметр(payload) {
  const м = String(payload || "").match(/^wait_([A-Za-z]{1,6}-\d{1,6})$/);
  return м ? м[1].toUpperCase() : null;
}

// Подписать чат на товар. Возвращает, что сказать человеку.
export async function ждать({ chatId, код, source = "bot", lang = "ru" }) {
  const чат = Number(chatId);
  if (!Number.isSafeInteger(чат) || !КОД.test(String(код || ""))) return { ок: false, причина: "неверный товар" };
  let товар;
  try {
    [товар] = await sget(`products?code=eq.${encodeURIComponent(String(код).toUpperCase())}&select=id,code,name,stock_qty&limit=1`);
  } catch { return { ок: false, причина: "склад не ответил" }; }
  if (!товар) return { ок: false, нетТовара: true };
  if (Number(товар.stock_qty) > 0) return { ок: true, вНаличии: true, товар };
  try {
    const [строка] = await sinsert("stock_wait", [{ product_id: товар.id, chat_id: чат, source: source === "site" ? "site" : "bot", lang: lang === "uz" ? "uz" : "ru" }]);
    return { ок: true, товар, id: строка?.id || null };
  } catch (e) {
    if (дубль(e)) return { ок: true, уже: true, товар };
    if (нетТаблицы(e)) return { ок: false, нетТаблицы: true, товар };
    return { ок: false, причина: "не удалось записать" };
  }
}

// «Не ждать»: только своё ожидание (chat_id в условии) и только активное.
export async function неЖдать(id, chatId) {
  if (!UUID.test(String(id || "")) || !Number.isSafeInteger(Number(chatId))) return false;
  try {
    const r = await spatch(
      `stock_wait?id=eq.${id}&chat_id=eq.${Number(chatId)}&notified_at=is.null&canceled_at=is.null`,
      { canceled_at: new Date().toISOString() },
    );
    return Array.isArray(r) && r.length > 0;
  } catch { return false; }
}

// Текст сообщения клиенту. Только своё: название, код, ссылка.
export function текстВНаличии(товар, { lang = "ru", сайт = "https://generalmodern.uz" } = {}) {
  const экран = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const ссылка = `${сайт}/p/${String(товар.code || товар.id).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
  const текст = lang === "uz"
    ? `🔔 <b>Yana sotuvda!</b>\n\n${экран(товар.name)} (${экран(товар.code)}) omborga keldi.\nKutganingiz uchun rahmat.`
    : `🔔 <b>Снова в наличии!</b>\n\n${экран(товар.name)} (${экран(товар.code)}) снова на складе.\nВы просили сообщить — сообщаем.`;
  const кнопка = lang === "uz" ? "Buyurtma berish" : "Заказать";
  return { текст, кнопки: [[{ text: кнопка, url: ссылка }]], ссылка };
}

// Один проход рассыльщика. отправить(chatId, текст, кнопки) → true/false.
export async function разослать({ отправить, лимит = ЛИМИТ, сайт } = {}) {
  let ждут;
  try {
    ждут = await sget(
      "stock_wait?notified_at=is.null&canceled_at=is.null"
      + "&select=id,chat_id,lang,product_id,products(id,code,name,stock_qty)"
      + "&order=created_at&limit=500",
    );
  } catch (e) {
    return { отправлено: 0, нетТаблицы: нетТаблицы(e) };
  }
  const готовы = (ждут || []).filter((ж) => Number(ж.products?.stock_qty) > 0).slice(0, лимит);
  let отправлено = 0, неДошло = 0;
  for (const ж of готовы) {
    // Захват: только если ещё никто не отправил.
    let захват;
    try {
      захват = await spatch(
        `stock_wait?id=eq.${ж.id}&notified_at=is.null&canceled_at=is.null`,
        { notified_at: new Date().toISOString() },
      );
    } catch { continue; }
    if (!Array.isArray(захват) || !захват.length) continue;
    const { текст, кнопки } = текстВНаличии(ж.products, { lang: ж.lang, сайт });
    // Не дошло (человек остановил бота) — второй раз не пытаемся:
    // отметка уже стоит, навязываться нельзя.
    const ок = await отправить(ж.chat_id, текст, кнопки).catch(() => false);
    if (ок) отправлено++; else неДошло++;
  }
  return { отправлено, неДошло, ждутЕщё: (ждут || []).length - готовы.length };
}

// Для владельца: какие товары ждут и сколько человек.
export async function сводкаОжиданий() {
  try {
    const строки = await sget(
      "stock_wait?select=product_id,notified_at,canceled_at,created_at,products(code,name,stock_qty)&order=created_at.desc&limit=2000",
    );
    const м = new Map();
    for (const с of строки || []) {
      const id = String(с.product_id);
      if (!м.has(id)) м.set(id, { product_id: id, код: с.products?.code || "", имя: с.products?.name || "", остаток: Number(с.products?.stock_qty) || 0, ждут: 0, сообщено: 0, последний: с.created_at });
      const з = м.get(id);
      if (с.notified_at) з.сообщено++;
      else if (!с.canceled_at) з.ждут++;
    }
    return { готово: true, товары: [...м.values()].filter((з) => з.ждут || з.сообщено).sort((а, б) => б.ждут - а.ждут || б.сообщено - а.сообщено) };
  } catch (e) {
    return { готово: false, нетТаблицы: нетТаблицы(e), товары: [] };
  }
}
