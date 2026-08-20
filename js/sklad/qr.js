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
import { toast } from "../ui.js?v=20260820d";

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
