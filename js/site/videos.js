// ========================================================================
//  Сайт → раздел «Видео»: видео запчастей. Только для ВОШЕДШИХ клиентов.
//  Воспроизведение по временной (signed) ссылке; деттеренты против
//  скачивания/ПКМ/PiP. 100% запрет скриншота/записи в вебе невозможен.
// ========================================================================
import { api, isLoggedIn } from "./api.js?v=20260816a";
import { openLogin } from "./auth.js?v=20260816a";
import { t } from "./app.js?v=20260816a";

export async function renderVideos(container) {
  container.innerHTML = "";
  const wrap = document.createElement("div"); wrap.className = "site-main";
  const h = document.createElement("h1"); h.textContent = "Видео запчастей"; h.style.cssText = "margin:0 0 6px";
  const sub = document.createElement("div"); sub.style.cssText = "color:var(--muted);margin-bottom:18px;font-size:14px"; sub.textContent = "Доступно только для вошедших клиентов.";
  wrap.append(h, sub); container.append(wrap);

  if (!isLoggedIn()) {
    const box = document.createElement("div"); box.style.cssText = "text-align:center;padding:40px 16px";
    const p = document.createElement("p"); p.textContent = "Войдите в аккаунт, чтобы смотреть видео.";
    const b = document.createElement("button"); b.className = "btn-primary"; b.style.cssText = "margin-top:12px;padding:10px 22px"; b.textContent = t("login") || "Войти";
    b.addEventListener("click", openLogin);
    box.append(p, b); wrap.append(box); return;
  }

  const grid = document.createElement("div"); grid.className = "product-grid"; wrap.append(grid);
  grid.innerHTML = '<div style="padding:40px;text-align:center;color:var(--muted)">Загрузка…</div>';
  let list = [];
  try { list = await api.videos(); } catch (e) { grid.innerHTML = `<div class="s-empty"><p>${e.message || "Ошибка"}</p></div>`; return; }
  if (!Array.isArray(list) || !list.length) { grid.innerHTML = `<div class="s-empty"><p>Видео пока нет</p></div>`; return; }
  grid.innerHTML = "";
  list.forEach(v => {
    const card = document.createElement("div"); card.className = "product-card"; card.style.cursor = "pointer";
    // обложка: фото привязанного товара (если есть) с иконкой ▶ поверх, иначе просто ▶
    const cover = document.createElement("div");
    cover.style.cssText = "position:relative;height:150px;background:var(--bg,#f4f0e8);display:flex;align-items:center;justify-content:center;overflow:hidden";
    if (v.product_photo) {
      const im = document.createElement("img");
      im.src = v.product_photo; im.loading = "lazy"; im.style.cssText = "width:100%;height:100%;object-fit:cover";
      im.onerror = () => { im.remove(); };
      cover.append(im);
    }
    const play = document.createElement("div");
    play.textContent = "▶";
    play.style.cssText = "position:absolute;font-size:34px;color:#fff;width:60px;height:60px;border-radius:50%;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;text-indent:4px";
    cover.append(play);
    const body = document.createElement("div"); body.className = "product-card-body";
    const nm = document.createElement("div"); nm.className = "product-name"; nm.textContent = v.title || "Видео";
    body.append(nm);
    if (v.product_name) { const pn = document.createElement("div"); pn.className = "product-category"; pn.textContent = v.product_name; body.append(pn); }
    card.append(cover, body);
    card.addEventListener("click", () => openVideoPlayer(v));
    grid.append(card);
  });
}

async function openVideoPlayer(v) {
  const ov = document.createElement("div");
  ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.88);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px";
  const box = document.createElement("div"); box.style.cssText = "max-width:900px;width:100%;background:#000;border-radius:12px;overflow:hidden;position:relative";
  const close = document.createElement("button"); close.textContent = "✕";
  close.style.cssText = "position:absolute;top:8px;right:10px;z-index:3;background:rgba(0,0,0,.55);color:#fff;border:none;font-size:18px;width:36px;height:36px;border-radius:50%;cursor:pointer";
  const title = document.createElement("div"); title.textContent = v.title || ""; title.style.cssText = "color:#fff;padding:10px 14px;font-weight:600;font-size:15px";

  const video = document.createElement("video");
  video.controls = true;
  video.setAttribute("controlsList", "nodownload noplaybackrate noremoteplayback");
  video.setAttribute("disablePictureInPicture", "");
  video.setAttribute("playsinline", "");
  video.disablePictureInPicture = true;
  video.oncontextmenu = () => false;            // запрет «сохранить видео»
  video.draggable = false;
  video.style.cssText = "width:100%;display:block;max-height:78vh;background:#000;user-select:none;-webkit-user-select:none;-webkit-user-drag:none";

  const onVis = () => { if (document.hidden) { try { video.pause(); } catch {} } }; // пауза при уходе со вкладки
  document.addEventListener("visibilitychange", onVis);
  function destroy() { document.removeEventListener("visibilitychange", onVis); try { video.pause(); video.removeAttribute("src"); video.load(); } catch {} ov.remove(); }
  close.addEventListener("click", destroy);
  ov.addEventListener("click", (e) => { if (e.target === ov) destroy(); });
  document.addEventListener("keydown", function esc(e) { if (e.key === "Escape") { destroy(); document.removeEventListener("keydown", esc); } });

  box.append(close, title, video); ov.append(box); document.body.append(ov);
  try {
    const r = await api.videoUrl(v.id);   // временная подписанная ссылка (5 мин)
    video.src = r.url; video.play().catch(() => {});
  } catch (e) {
    title.textContent = "Не удалось загрузить: " + (e.message || "");
  }
}
