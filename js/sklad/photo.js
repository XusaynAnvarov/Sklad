// ========================================================================
//  ФОТО ТОВАРА в карточках склада.
//  Отсканировали наклейку — на экране должен быть виден сам товар, а не
//  только название. На складе много похожих названий, и снимок решает
//  вопрос «тот ли это» быстрее любой подписи.
//  Нажатие раскрывает фото во весь экран.
// ========================================================================
import { el } from "./app.js?v=20261114c";
import { thumb } from "../img.js?v=20261114c";
import { lightbox } from "../ui.js?v=20261114c";

// Все снимки товара и выбор главного — правило общее с каталогом, складом
// на сайте и PDF, поэтому живёт в одном месте: js/photo.js.
import { снимки, главноеФото, индексГлавного } from "../photo.js?v=20261114c";
export { снимки as photosOf };

// Крупный снимок для карточки. Нет фото — не занимаем место пустой рамкой.
export function photoBlock(p, { height = 200 } = {}) {
  const list = снимки(p);
  if (!list.length) return null;

  // Крупным — ГЛАВНОЕ фото: отсканировали наклейку и должны увидеть товар
  // таким, каким он выглядит в списках и у клиентов.
  const главныйСнимок = главноеФото(p);
  const начало = индексГлавного(p);

  const главное = el("img", {
    src: thumb(главныйСнимок, 640),
    alt: p.name || "",
    loading: "lazy",
    title: "Нажмите, чтобы увеличить",
    // Не открылось через свой сервер — берём оригинал. Иначе на месте
    // товара остаётся значок «битая картинка», и непонятно, дело в фото
    // или в приложении.
    "data-full": главныйСнимок,
    onerror: function () {
      const о = this.getAttribute("data-full");
      if (о && this.src !== о) this.src = о; else this.style.display = "none";
    },
    style: {
      width: "100%", maxHeight: height + "px", objectFit: "contain",
      borderRadius: "12px", background: "var(--bg2)", cursor: "zoom-in",
      display: "block", marginBottom: list.length > 1 ? "8px" : "10px",
    },
    onclick: () => lightbox(list, начало),
  });
  if (list.length === 1) return главное;

  // Остальные снимки — маленькие рядом, чтобы было видно, что они есть.
  // Крупное фото уже показано, второй раз его повторять незачем.
  const ряд = el("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "10px" } });
  // Не больше пяти: карточка — не галерея, всё остальное открывается
  // нажатием на крупный снимок.
  list.map((url, i) => ({ url, i })).filter(x => x.i !== начало).slice(0, 5).forEach(({ url, i }) => {
    ряд.append(el("img", {
      src: thumb(url, 160), alt: "", loading: "lazy",
      "data-full": url,
      onerror: function () {
        const о = this.getAttribute("data-full");
        if (о && this.src !== о) this.src = о; else this.style.display = "none";
      },
      style: { width: "52px", height: "52px", objectFit: "cover", borderRadius: "8px",
        background: "var(--bg2)", cursor: "zoom-in" },
      onclick: () => lightbox(list, i),
    }));
  });
  return el("div", {}, [главное, ряд]);
}
