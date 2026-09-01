// ========================================================================
//  ФОТО ТОВАРА в приложении заказа.
//  Клиент выбирает глазами: без снимка список названий вроде «Лапка кул
//  универсал» ему ничего не говорит.
//  Снимки идут через свой сервер (js/img.js) — так они кэшируются у нас,
//  а не тянутся из Supabase на каждый просмотр.
// ========================================================================
import { el } from "../el.js?v=20260901c";
import { thumb, full } from "../img.js?v=20260901c";

// Все снимки товара: новые лежат в photos, старые — в одном photo_url.
export function снимки(p) {
  if (!p) return [];
  if (Array.isArray(p.photos) && p.photos.length) return p.photos.filter(Boolean);
  return p.photo_url ? [p.photo_url] : [];
}

// Серый квадрат с первой буквой названия — пока фото нет или не открылось.
export function заглушка(имя = "?") {
  const ch = encodeURIComponent((String(имя)[0] || "?").toUpperCase());
  return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E"
    + "%3Crect width='200' height='200' fill='%23eceef1'/%3E%3Ctext x='50%25' y='56%25' font-size='96' "
    + `fill='%23b3b9c2' text-anchor='middle' font-family='sans-serif'%3E${ch}%3C/text%3E%3C/svg%3E`;
}

// <img> со снимком: сперва миниатюра, не вышло — оригинал, не вышло — буква.
// Терять фото нельзя: без него клиент не понимает, что заказывает.
export function картинка(url, { size = 300, имя = "", className = "ph" } = {}) {
  const ph = заглушка(имя);
  return el("img." + className, {
    src: url ? thumb(url, size) : ph,
    alt: имя,
    loading: "lazy",
    decoding: "async",
    "data-full": url || "",
    "data-ph": ph,
    onerror: function () {
      const о = this.getAttribute("data-full");
      if (о && this.src !== о) { this.src = о; return; }
      const з = this.getAttribute("data-ph");
      if (з && this.src !== з) this.src = з;
    },
  });
}

// Просмотр во весь экран: листается стрелками и свайпом.
export function открытьФото(список, начало = 0, имя = "") {
  const фото = (список || []).filter(Boolean);
  if (!фото.length) return;
  let i = Math.max(0, Math.min(начало, фото.length - 1));

  const img = el("img");
  const счёт = el("div.ord-lb-n");
  const box = el("div.ord-lb", {}, [img, счёт]);

  const показать = () => {
    img.src = full(фото[i]);
    счёт.textContent = фото.length > 1 ? (имя ? имя + " · " : "") + (i + 1) + " / " + фото.length : имя;
  };
  const листать = (d) => { i = (i + d + фото.length) % фото.length; показать(); };
  const закрыть = () => { document.removeEventListener("keydown", поКлавише); box.remove(); };
  const поКлавише = (e) => {
    if (e.key === "Escape") закрыть();
    else if (e.key === "ArrowLeft") листать(-1);
    else if (e.key === "ArrowRight") листать(1);
  };

  // Закрывает нажатие мимо снимка. По самому снимку — листаем свайпом,
  // и случайное касание не должно захлопывать просмотр.
  img.addEventListener("click", (e) => e.stopPropagation());
  box.addEventListener("click", закрыть);
  let sx = 0;
  box.addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; }, { passive: true });
  box.addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].clientX - sx;
    if (Math.abs(dx) > 40) { листать(dx < 0 ? 1 : -1); }
  });
  document.addEventListener("keydown", поКлавише);

  document.body.append(box);
  показать();
}
