// ========================================================================
//  Отметка визита + уведомление о данных. Общий модуль для сайта и
//  мини-приложения заказа.
//
//  Визит отмечается один раз за сеанс вкладки (sessionStorage), без
//  внешних счётчиков: только свой /api/track. Сервер сам смотрит
//  приблизительную страну/город по IP и тип устройства.
// ========================================================================
const NOTICE_KEY = "gm_privacy_notice_v1";

function utmИзАдреса() {
  try {
    const q = new URLSearchParams(location.search), utm = {};
    for (const k of ["source", "medium", "campaign", "content", "term"]) { const v = q.get("utm_" + k); if (v) utm[k] = v.slice(0, 80); }
    return Object.keys(utm).length ? utm : null;
  } catch { return null; }
}

export function отметитьВизит({ initData = "", token = "" } = {}) {
  try {
    const ключ = "gm_visit_" + location.pathname;
    try { if (sessionStorage.getItem(ключ)) return; sessionStorage.setItem(ключ, "1"); } catch {}
    const headers = { "Content-Type": "application/json" };
    const t = token || (() => { try { return localStorage.getItem("gm_client_token") || ""; } catch { return ""; } })();
    if (t) headers.Authorization = "Bearer " + t;
    // внешний referrer: только домен, без пути и параметров
    let referrer = null;
    try { if (document.referrer) { const u = new URL(document.referrer); if (u.host !== location.host) referrer = u.host; } } catch {}
    fetch("/api/track", { method: "POST", headers, keepalive: true,
      body: JSON.stringify({ path: location.pathname, referrer, utm: utmИзАдреса(), initData: initData || undefined }) }).catch(() => {});
  } catch {}
}

// Короткое уведомление внизу экрана — один раз, до нажатия «Понятно».
export function уведомлениеОДанных(lang = "ru") {
  try { if (localStorage.getItem(NOTICE_KEY)) return; } catch { return; }
  const T = {
    ru: ["Мы записываем время визита, тип устройства и примерный город по IP — для статистики и защиты аккаунтов. Сторонних счётчиков нет.", "Подробнее", "Понятно"],
    uz: ["Biz tashrif vaqti, qurilma turi va IP bo‘yicha taxminiy shaharni statistika va akkauntlarni himoya qilish uchun yozib boramiz. Uchinchi tomon hisoblagichlari yo‘q.", "Batafsil", "Tushunarli"],
    en: ["We record visit time, device type and approximate city by IP — for statistics and account protection. No third-party trackers.", "Details", "Got it"],
  }[lang] || null;
  const [текст, подробнее, ок] = T || ["", "", ""];
  if (!текст) return уведомлениеОДанных("ru");
  const box = document.createElement("div");
  box.setAttribute("role", "note");
  box.style.cssText = "position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;max-width:560px;margin:0 auto;padding:12px 14px;border-radius:12px;" +
    "background:rgba(20,20,28,.92);color:#f3f3f6;font:13px/1.45 Inter,system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.3);display:flex;gap:12px;align-items:center;" +
    "padding-bottom:calc(12px + env(safe-area-inset-bottom));transition:opacity .25s,transform .25s;";
  const p = document.createElement("div");
  p.style.flex = "1";
  p.append(текст + " ");
  const a = document.createElement("a");
  a.href = "/privacy.html"; a.textContent = подробнее; a.style.color = "#e7c873";
  p.append(a);
  const b = document.createElement("button");
  b.type = "button"; b.textContent = ок;
  b.style.cssText = "flex:0 0 auto;border:0;border-radius:8px;padding:8px 14px;background:#d9b45a;color:#1a1a1a;font-weight:600;cursor:pointer;min-height:36px";
  b.onclick = () => { try { localStorage.setItem(NOTICE_KEY, new Date().toISOString()); } catch {} box.style.opacity = "0"; box.style.transform = "translateY(8px)"; setTimeout(() => box.remove(), 260); };
  box.append(p, b);
  document.body.append(box);
}
