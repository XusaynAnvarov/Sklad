// ========================================================================
//  МИНИАТЮРЫ ФОТО ТОВАРОВ
//  Фото товаров лежат в Supabase Storage в исходном размере (100–300 КБ,
//  1000–2000 px). В списках их сотни, и телефон умирает не от веса файлов,
//  а от РАСПАКОВАННЫХ картинок в памяти: снимок 1500×1500 занимает ~9 МБ,
//  а миниатюра 300×300 — 0.36 МБ. При 800 товарах это разница между
//  «работает» и «браузер завис».
//
//  ОТКУДА БЕРЁМ. Не напрямую из Supabase, а со своего сервера:
//      /api/img/<ширина>/product-photos/<файл>.jpg
//  Сервер скачивает снимок из Supabase ОДИН раз, кладёт на диск и дальше
//  раздаёт сам; Cloudflare забирает его к себе. Раньше каждый просмотр
//  каталога тянул все снимки из Supabase заново — на бесплатном плане это
//  упирается в лимит трафика, и упёрлось.
//
//  Если адрес чужой или это data: — возвращаем как есть.
// ========================================================================

const БАКЕТ = "product-photos";
// Те же ширины, что разрешены на сервере: произвольные плодят кэш впустую.
const ШИРИНЫ = [64, 84, 96, 160, 300, 480, 640, 900, 1200];

// Ближайшая разрешённая ширина, не меньше запрошенной.
export function ближайшаяШирина(size) {
  const n = Math.max(32, Math.round(Number(size) || 300));
  return ШИРИНЫ.find(w => w >= n) || ШИРИНЫ[ШИРИНЫ.length - 1];
}

// Путь внутри хранилища из полной ссылки Supabase.
// Понимаем оба вида: обычный object/public и уменьшенный render/image/public.
export function путьХранилища(url) {
  const u = String(url || "");
  for (const маркер of ["/storage/v1/object/public/", "/storage/v1/render/image/public/"]) {
    const i = u.indexOf(маркер);
    if (i < 0) continue;
    const путь = u.slice(i + маркер.length).split("?")[0];
    return путь.startsWith(БАКЕТ + "/") ? путь : "";
  }
  return "";
}

// Ссылка на уменьшенную копию — через свой сервер.
export function thumb(url, size = 300) {
  const u = String(url || "");
  if (!u || u.startsWith("data:")) return u;
  const путь = путьХранилища(u);
  if (!путь) return u;                       // чужой адрес — не трогаем
  return `/api/img/${ближайшаяШирина(size)}/${путь}`;
}

// Полноразмерный снимок (для просмотра во весь экран) — тоже через себя,
// иначе открытие фото снова било бы прямо в Supabase.
export function full(url) {
  const u = String(url || "");
  if (!u || u.startsWith("data:")) return u;
  const путь = путьХранилища(u);
  return путь ? `/api/img/1200/${путь}` : u;
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
