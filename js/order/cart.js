// ========================================================================
//  КОРЗИНА КЛИЕНТА — живёт в телефоне, а не в памяти вкладки.
//
//  Раньше корзина была обычным Map: клиент собирал заказ, сворачивал
//  Telegram и терял всё. Теперь она лежит в localStorage, поэтому
//  переживает и сворачивание, и перезапуск приложения.
//
//  Пока клиент не нажал «Отправить», сервер про корзину ничего не знает.
// ========================================================================
const КЛЮЧ = "gm_order_cart_v1";
const ПОТОЛОК = 100000;

let корзина = загрузить();
const слушатели = new Set();

function загрузить() {
  try {
    const raw = localStorage.getItem(КЛЮЧ);
    const o = raw ? JSON.parse(raw) : null;
    if (!o || typeof o !== "object") return new Map();
    // отсеиваем мусор: чужие ключи и нечисловые количества
    return new Map(Object.entries(o)
      .map(([id, q]) => [String(id), Math.min(ПОТОЛОК, Math.floor(Number(q) || 0))])
      .filter(([id, q]) => id && q > 0));
  } catch { return new Map(); }
}

function сохранить() {
  try { localStorage.setItem(КЛЮЧ, JSON.stringify(Object.fromEntries(корзина))); } catch {}
  слушатели.forEach(fn => { try { fn(); } catch {} });
}

export const количество = (id) => корзина.get(String(id)) || 0;
export const позиции = () => [...корзина.entries()].map(([id, qty]) => ({ id, qty }));
export const пусто = () => корзина.size === 0;

// Сколько позиций и сколько штук — для значка на вкладке и подписи внизу.
export function итого() {
  let позиций = 0, штук = 0;
  корзина.forEach(q => { позиций++; штук += q; });
  return { позиций, штук };
}

export function поставить(id, qty) {
  const ключ = String(id);
  const n = Math.max(0, Math.min(ПОТОЛОК, Math.floor(Number(qty) || 0)));
  if (n <= 0) корзина.delete(ключ); else корзина.set(ключ, n);
  сохранить();
  return n;
}

export const добавить = (id, сколько = 1) => поставить(id, количество(id) + (Number(сколько) || 0));

export function очистить() {
  корзина.clear();
  сохранить();
}

// Убрать из корзины товары, которых больше нет в каталоге: иначе клиент
// отправит заказ, а сервер молча выбросит эти позиции.
export function оставитьТолько(идентификаторы) {
  const годные = new Set([...идентификаторы].map(String));
  let убрали = 0;
  for (const id of [...корзина.keys()]) if (!годные.has(id)) { корзина.delete(id); убрали++; }
  if (убрали) сохранить();
  return убрали;
}

export function подписаться(fn) {
  слушатели.add(fn);
  return () => слушатели.delete(fn);
}
