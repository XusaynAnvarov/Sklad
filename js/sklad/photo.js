// ========================================================================
//  ФОТО ТОВАРА в карточках склада.
//  Отсканировали наклейку — на экране должен быть виден сам товар, а не
//  только название. На складе много похожих названий, и снимок решает
//  вопрос «тот ли это» быстрее любой подписи.
//  Нажатие раскрывает фото во весь экран.
// ========================================================================
import { el } from "./app.js?v=20260821e";
import { thumb } from "../img.js?v=20260821e";
import { lightbox } from "../ui.js?v=20260821e";

// Все снимки товара: новые лежат в photos, старые — в одном photo_url.
export function photosOf(p) {
  if (!p) return [];
  if (Array.isArray(p.photos) && p.photos.length) return p.photos.filter(Boolean);
  return p.photo_url ? [p.photo_url] : [];
}

// Крупный снимок для карточки. Нет фото — не занимаем место пустой рамкой.
export function photoBlock(p, { height = 200 } = {}) {
  const list = photosOf(p);
  if (!list.length) return null;

  const главное = el("img", {
    src: thumb(list[0], 640),
    alt: p.name || "",
    loading: "lazy",
    title: "Нажмите, чтобы увеличить",
    style: {
      width: "100%", maxHeight: height + "px", objectFit: "contain",
      borderRadius: "12px", background: "var(--bg2)", cursor: "zoom-in",
      display: "block", marginBottom: list.length > 1 ? "8px" : "10px",
    },
    onclick: () => lightbox(list),
  });
  if (list.length === 1) return главное;

  // Несколько снимков — маленькие рядом, чтобы было видно, что они есть
  const ряд = el("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "10px" } });
  list.slice(1, 6).forEach(url => {
    ряд.append(el("img", {
      src: thumb(url, 160), alt: "", loading: "lazy",
      style: { width: "52px", height: "52px", objectFit: "cover", borderRadius: "8px",
        background: "var(--bg2)", cursor: "zoom-in" },
      onclick: () => lightbox(list),
    }));
  });
  return el("div", {}, [главное, ряд]);
}
