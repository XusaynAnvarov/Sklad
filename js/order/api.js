// ========================================================================
//  ОБРАЩЕНИЯ К СЕРВЕРУ из мини-приложения заказа.
//
//  Кто именно открыл приложение, сервер узнаёт по подписи Telegram
//  (initData). Пароля здесь нет и быть не должно: приложение открывается
//  из чата бота, и Telegram сам подтверждает аккаунт.
// ========================================================================
const TG = () => (window.Telegram && window.Telegram.WebApp) || null;
export const подпись = () => (TG() && TG().initData) || "";

async function послать(url, тело) {
  let r;
  try {
    r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(тело),
    });
  } catch { throw new Error("Нет связи. Проверьте интернет."); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || "Ошибка " + r.status);
  return j;
}

// Свои заказы, правка, отмена, ответ на выставленную цену.
export const мои = (action, данные = {}) =>
  послать("/api/my-orders", { initData: подпись(), action, ...данные });

// Отправка корзины. Если незакрытый заказ уже есть, сервер допишет товары
// в него — количества сложатся (api/lib/mergeorder.js).
export const отправитьКорзину = (items) =>
  послать("/api/order", { initData: подпись(), items });

// Каталог: только фото, название, категория и наличие. Цен здесь нет
// и никогда не было — клиент видит цену только в своём заказе.
export async function каталог() {
  const r = await fetch("/api/catalog");
  if (!r.ok) throw new Error("Каталог недоступен");
  const data = await r.json();
  return Array.isArray(data) ? data : [];
}
