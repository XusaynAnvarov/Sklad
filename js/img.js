// ========================================================================
//  МИНИАТЮРЫ ФОТО ТОВАРОВ
//  Фото товаров лежат в Supabase Storage в исходном размере (100–300 КБ,
//  1000–2000 px). В списках их сотни, и телефон умирает не от веса файлов,
//  а от РАСПАКОВАННЫХ картинок в памяти: снимок 1500×1500 занимает ~9 МБ,
//  а миниатюра 300×300 — 0.36 МБ. При 800 товарах это разница между
//  «работает» и «браузер завис».
//
//  Supabase умеет отдавать уменьшенную копию через /render/image/public/.
//  Если преобразование почему-то не сработает (файл не картинка, лимит и
//  т.п.) — по onerror возвращаемся к оригиналу, а потом к заглушке.
// ========================================================================

// Ссылка на уменьшенную копию. Чужие адреса и data: возвращаем как есть.
// ВАЖНО: задаём и width, и height с resize=contain. Если передать только
// width, Supabase отдаёт картинку 320×<исходная высота> — пропорции ломаются
// (проверено: квадратное фото 1254×1254 превращалось в 320×1254).
// contain вписывает снимок в квадрат, сохраняя пропорции, а обрезкой уже
// занимается CSS (object-fit: cover).
export function thumb(url, size = 300) {
  const u = String(url || "");
  if (!u || u.startsWith("data:")) return u;
  if (!u.includes("/storage/v1/object/public/")) return u;
  const s = Math.max(32, Math.round(Number(size) || 300));
  const base = u.split("?")[0].replace("/storage/v1/object/public/", "/storage/v1/render/image/public/");
  return `${base}?width=${s}&height=${s}&resize=contain&quality=65`;
}

// Готовые атрибуты для <img>: миниатюра + откат на оригинал + на заглушку.
// Использование: el("img.ph", { ...thumbAttrs(p.photo_url, ph, 300), alt: p.name })
export function thumbAttrs(url, placeholderUrl, width = 300) {
  const src = url ? thumb(url, width) : placeholderUrl;
  return {
    src,
    loading: "lazy",
    decoding: "async",
    "data-full": url || "",
    "data-ph": placeholderUrl || "",
    onerror: function () {
      // сперва пробуем оригинал, и только потом заглушку — чтобы не терять фото
      const full = this.getAttribute("data-full");
      if (full && this.src !== full) { this.src = full; return; }
      const ph = this.getAttribute("data-ph");
      if (ph && this.src !== ph) this.src = ph;
    },
  };
}
