// ========================================================================
//  Сканер QR-наклейки. Используем ВСТРОЕННЫЙ сканер Telegram
//  (showScanQrPopup): он работает и на iPhone, и на Android.
//  Свой сканер через камеру браузера на iPhone не заработал бы —
//  там нет BarcodeDetector, а сторонние библиотеки блокирует CSP.
//  В наклейке лежит номер товара (gm:<id>).
//
//  ВАЖНО про прошлую поломку: здесь стоял слушатель события focus как
//  подстраховка «вдруг окно закрыли крестиком». Но focus срабатывает
//  сразу при открытии окна сканера — ожидание завершалось пустым, а
//  настоящий результат, пришедший позже, отбрасывался. Из-за этого
//  сканирование не работало вообще. Теперь закрытие ловим тем событием,
//  которое для этого и предназначено: scanQrPopupClosed.
// ========================================================================
import { toast } from "../ui.js?v=20260831a";

const TG = () => window.Telegram && window.Telegram.WebApp;

export function canScan() {
  const t = TG();
  return !!(t && typeof t.showScanQrPopup === "function");
}

// Открыть сканер → вернуть содержимое наклейки (или null, если закрыли).
export function scanSku() {
  const t = TG();
  if (!canScan()) {
    toast("Сканер доступен только в Telegram — впишите артикул вручную", "err");
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    let done = false;
    const off = () => {
      try { if (typeof t.offEvent === "function") t.offEvent("scanQrPopupClosed", onClosed); } catch { }
    };
    const finish = (v) => { if (done) return; done = true; off(); resolve(v); };
    const onClosed = () => finish(null);          // окно закрыли, ничего не отсканировав

    try {
      if (typeof t.onEvent === "function") t.onEvent("scanQrPopupClosed", onClosed);
      t.showScanQrPopup({ text: "Наведите на наклейку товара" }, (text) => {
        const code = String(text || "").trim();
        if (!code) return false;                   // пусто — продолжаем сканировать
        try { t.closeScanQrPopup(); } catch { }
        finish(code);
        return true;                               // закрыть окно сканера
      });
    } catch (e) {
      toast("Сканер не открылся: " + (e.message || e), "err");
      finish(null);
    }
  });
}

// Компьютер ли это. На телефоне приложение и так во весь экран,
// поэтому кнопка «Развернуть» там не нужна — и не показывается.
export function isDesktop() {
  const t = TG();
  const p = String((t && t.platform) || "").toLowerCase();
  return p === "tdesktop" || p === "macos" || p === "web" || p === "weba" || p === "webk";
}

// ========================================================================
//  Что делать с тем, что прочитал сканер.
//  Раньше приложение молча отвечало «это не наша наклейка» и не говорило,
//  ЧТО именно оно прочитало — понять причину было невозможно.
//  Теперь: сначала пробуем нашу наклейку, потом номер товара как есть,
//  потом артикул. Если не нашли — показываем сам код.
// ========================================================================
import { parsePayload } from "../qr.js?v=20260831a";

const clean = (v) => String(v == null ? "" : v).trim().toLowerCase();
const tight = (v) => clean(v).split(" ").join("");

export function findByScan(raw, products) {
  const s = String(raw || "").trim();
  if (!s || !Array.isArray(products)) return null;

  const id = parsePayload(s);
  if (id) {
    const byId = products.find(p => String(p.id) === id);
    if (byId) return byId;
  }
  const low = clean(s);
  const flat = tight(s);
  return products.find(p => clean(p.id) === low)
      || products.find(p => clean(p.sku) === low)
      || products.find(p => p.sku && tight(p.sku) === flat)
      || null;
}

// Понятное объяснение вместо «это не наша наклейка»
export function scanFailText(raw) {
  const s = String(raw || "").trim();
  if (!s) return "Сканер ничего не прочитал";
  const short = s.length > 70 ? s.slice(0, 70) + "…" : s;
  return "Товар не найден. Код: " + short;
}

// Если товара нет в загруженном списке — спрашиваем базу напрямую по номеру.
// Так наклейка срабатывает даже тогда, когда список пришёл неполным.
export async function resolveScan(raw, products, db) {
  const found = findByScan(raw, products);
  if (found) return found;

  const id = parsePayload(String(raw || "").trim());
  if (!id || !db || !db.products || typeof db.products.get !== "function") return null;
  try {
    const one = await db.products.get(id);
    if (one && one.id) {
      // кладём в список, чтобы дальше всё работало как с обычным товаром
      if (Array.isArray(products) && !products.some(p => p.id === one.id)) products.push(one);
      return one;
    }
  } catch { }
  return null;
}
