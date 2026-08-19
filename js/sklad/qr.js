// ========================================================================
//  Сканер QR-наклейки. Используем ВСТРОЕННЫЙ сканер Telegram
//  (showScanQrPopup): он работает и на iPhone, и на Android.
//  Свой сканер через камеру браузера на iPhone не заработал бы —
//  там нет BarcodeDetector, а сторонние библиотеки блокирует CSP.
//  В наклейке лежит артикул товара.
// ========================================================================
import { toast } from "../ui.js?v=20260819a";

const TG = () => window.Telegram && window.Telegram.WebApp;

export function canScan() {
  const t = TG();
  return !!(t && typeof t.showScanQrPopup === "function");
}

// Открыть сканер → вернуть артикул из наклейки (или null, если закрыли).
export function scanSku() {
  const t = TG();
  if (!canScan()) {
    toast("Сканер доступен только в Telegram — впишите артикул вручную", "err");
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; resolve(v); };
    try {
      t.showScanQrPopup({ text: "Наведите на наклейку товара" }, (text) => {
        const sku = String(text || "").trim();
        try { t.closeScanQrPopup(); } catch { }
        finish(sku || null);
        return true;   // закрыть окно сканера
      });
      // если окно закрыли крестиком — обратный вызов не придёт
      const onClose = () => { window.removeEventListener("focus", onClose); setTimeout(() => finish(null), 400); };
      window.addEventListener("focus", onClose, { once: true });
    } catch (e) {
      toast("Сканер не открылся: " + (e.message || e), "err");
      finish(null);
    }
  });
}
