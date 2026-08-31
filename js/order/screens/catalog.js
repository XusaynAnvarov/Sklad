// ========================================================================
//  КАТАЛОГ — что можно заказать.
//  Две колонки карточек: снимок, название, наличие и кнопка «В корзину».
//  Цен здесь нет: цену выставляет владелец после заказа.
//  Нет в наличии — заказать нельзя, кнопка не нажимается.
// ========================================================================
import { el } from "../../el.js?v=20260831b";
import { icon } from "../../icons.js?v=20260831b";
import { toast } from "../../ui.js?v=20260831b";
import { идти } from "../app.js?v=20260831b";
import { снимки, картинка, открытьФото } from "../photo.js?v=20260831b";

const ВСЕ = "all";
const категория = (p) => (p.category && String(p.category).trim()) || "Без категории";

const МЕТКА = {
  in_stock:  { text: "Есть в наличии", cls: "ok" },
  soon:      { text: "Скоро будет",    cls: "soon" },
  out_stock: { text: "Нет в наличии",  cls: "no" },
};

export default function render(box, ctx) {
  const { корзина } = ctx;
  let запрос = "", выбрана = ВСЕ;

  if (!ctx.товары.length) {
    box.append(el("div.mini-empty", { text: "Каталог пока пуст. Загляните позже." }));
    return;
  }

  // ---------- поиск и категории ----------
  const поле = el("input.inp", {
    type: "search", placeholder: "Название или артикул…",
    // 16px — иначе телефон приближает страницу при наборе
    style: { fontSize: "16px" },
  });
  const выбор = el("select.inp", { style: { fontSize: "16px", minHeight: "44px" } });

  const счёт = {};
  ctx.товары.forEach(p => { const k = категория(p); счёт[k] = (счёт[k] || 0) + 1; });
  const категории = Object.keys(счёт).sort((a, b) => {
    if (a === "Без категории") return 1;
    if (b === "Без категории") return -1;
    return a.localeCompare(b, "ru");
  });
  выбор.append(el("option", { value: ВСЕ, text: `Все категории (${ctx.товары.length})` }));
  категории.forEach(c => выбор.append(el("option", { value: c, text: `${c} (${счёт[c]})` })));

  const сетка = el("div.ord-grid");
  box.append(
    el("div.mini-search", {}, [поле]),
    el("div", { style: { marginBottom: "12px" } }, [выбор]),
    сетка,
  );

  поле.addEventListener("input", () => { запрос = поле.value; рисовать(); });
  выбор.addEventListener("change", () => { выбрана = выбор.value; рисовать(); window.scrollTo({ top: 0 }); });

  // ---------- список ----------
  function отобранные() {
    const q = запрос.trim().toLowerCase();
    return ctx.товары.filter(p =>
      (выбрана === ВСЕ || категория(p) === выбрана) &&
      (!q || (p.name || "").toLowerCase().includes(q)
          || (p.sku || "").toLowerCase().includes(q)
          || (p.category || "").toLowerCase().includes(q)));
  }

  function карточка(p) {
    const есть = p.status === "in_stock";
    const м = МЕТКА[p.status] || МЕТКА.out_stock;
    const фото = снимки(p);
    const было = корзина.количество(p.id);

    const снимок = картинка(фото[0], { size: 300, имя: p.name, className: "ord-ph" });
    if (фото.length) снимок.addEventListener("click", () => открытьФото(фото, 0, p.name));

    const счётчик = el("span.n", { text: String(было || 1) });
    let сколько = было || 1;
    const поставить = (n) => { сколько = Math.max(1, Math.min(100000, n)); счётчик.textContent = String(сколько); };

    const кнопка = есть
      ? el("button.ord-add", {}, [icon("plus", { size: 15 }), было ? "Ещё" : "В корзину"])
      : el("button.ord-add.off", { disabled: "disabled", text: м.text });

    if (есть) {
      кнопка.addEventListener("click", () => {
        корзина.добавить(p.id, сколько);
        обновитьМетку();
        кнопка.classList.add("done");
        кнопка.textContent = "✓ Добавлено";
        clearTimeout(кнопка._t);
        кнопка._t = setTimeout(() => {
          кнопка.classList.remove("done");
          кнопка.innerHTML = "";
          кнопка.append(icon("plus", { size: 15 }), document.createTextNode("Ещё"));
        }, 900);
      });
    }

    const вКорзине = el("span.ord-incart", { text: было ? "в корзине: " + было : "" });
    const обновитьМетку = () => {
      const n = корзина.количество(p.id);
      вКорзине.textContent = n ? "в корзине: " + n : "";
    };

    return el("div.ord-card" + (есть ? "" : ".off"), {}, [
      el("div.ord-ph-box", {}, [
        снимок,
        фото.length > 1 ? el("span.ord-ph-n", {}, [icon("image", { size: 12 }), String(фото.length)]) : null,
        p.is_new ? el("span.ord-new", { text: "Новый" }) : null,
      ].filter(Boolean)),
      el("div.ord-body", {}, [
        el("div.ord-nm", { text: p.name || "—" }),
        p.sku ? el("div.ord-sku", { text: p.sku }) : null,
        el("div.ord-mark." + м.cls, { text: м.text }),
        вКорзине,
        есть ? el("div.ord-qty", {}, [
          el("button.q", { text: "−", onclick: () => поставить(сколько - 1) }),
          счётчик,
          el("button.q", { text: "+", onclick: () => поставить(сколько + 1) }),
        ]) : null,
        кнопка,
      ].filter(Boolean)),
    ]);
  }

  function рисовать() {
    const список = отобранные();
    сетка.innerHTML = "";
    if (!список.length) {
      сетка.append(el("div.mini-empty", { style: { gridColumn: "1/-1" }, text: "Ничего не нашлось" }));
      return;
    }
    список.forEach(p => сетка.append(карточка(p)));
  }

  рисовать();

  // Нижняя кнопка появляется, только когда в корзине что-то есть.
  const внизу = el("div.mini-cta", { style: { display: "none" } });
  const перейти = el("button.btn.btn-primary");
  перейти.addEventListener("click", () => идти("cart"));
  внизу.append(перейти);
  box.append(внизу);

  function обновитьНиз() {
    const { позиций, штук } = корзина.итого();
    if (!позиций) { внизу.style.display = "none"; return; }
    внизу.style.display = "";
    перейти.innerHTML = "";
    перейти.append(icon("cart", { size: 17 }),
      document.createTextNode(`Корзина: ${позиций} поз. · ${штук} шт.`));
  }
  обновитьНиз();

  if (!ctx.товары.some(p => p.status === "in_stock")) {
    toast("Сейчас в наличии ничего нет", "err");
  }

  // Экран пересоздаётся при каждом переходе — каркас снимет подписку.
  return корзина.подписаться(обновитьНиз);
}
