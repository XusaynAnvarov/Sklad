// ========================================================================
//  КОРЗИНА — что уйдёт в заказ.
//  Здесь же честно сказано, что произойдёт при отправке: если заказ уже
//  отправлен и ещё не оценён, товары допишутся в него, а количества
//  сложатся. Раньше клиент об этом узнавал постфактум — и решал, что
//  первый заказ пропал.
// ========================================================================
import { el } from "../../el.js?v=20260831b";
import { icon } from "../../icons.js?v=20260831b";
import { toast, confirmDialog } from "../../ui.js?v=20260831b";
import { идти } from "../app.js?v=20260831b";
import { отправитьКорзину } from "../api.js?v=20260831b";
import { снимки, картинка } from "../photo.js?v=20260831b";

const дата = (d) => { const t = new Date(d); return isFinite(t) ? t.toLocaleDateString("ru-RU") : "—"; };

export default function render(box, ctx) {
  const { корзина } = ctx;
  // Заказ, в который допишутся товары: тот, которому ещё не дали цену.
  const открытый = ctx.заказы.find(o => o.status === "order") || null;

  const список = el("div.mini-list");
  const низ = el("div.mini-cta");
  box.append(список, низ);

  function рисовать() {
    список.innerHTML = "";
    низ.innerHTML = "";

    const позиции = корзина.позиции();
    if (!позиции.length) {
      список.append(el("div.mini-empty", { text: "Корзина пуста. Выберите товары в каталоге." }));
      const кн = el("button.btn.btn-outline", {
        style: { width: "100%", justifyContent: "center", minHeight: "46px", marginTop: "4px" },
        text: "Открыть каталог", onclick: () => идти("catalog"),
      });
      список.append(кн);
      return;
    }

    if (открытый) {
      список.append(el("div.ord-note", {}, [
        icon("alert", { size: 16 }),
        el("span", { text: `У вас уже есть заказ от ${дата(открытый.date)}, мы его ещё считаем. `
          + "Эти товары допишем в него — одинаковые сложатся по количеству." }),
      ]));
    }

    позиции.forEach(({ id, qty }) => {
      const p = ctx.поИд.get(String(id));
      const имя = p ? p.name : "товар недоступен";
      const фото = p ? снимки(p) : [];

      const число = el("span.n", { text: String(qty) });
      const поставить = (n) => {
        const стало = корзина.поставить(id, n);
        if (стало <= 0) { рисовать(); return; }
        число.textContent = String(стало);
      };

      список.append(el("div.mini-row", {}, [
        картинка(фото[0], { size: 96, имя, className: "ph" }),
        el("div.info", {}, [
          el("div.nm", { text: имя }),
          p && p.sku ? el("div.sku", { text: p.sku }) : null,
        ].filter(Boolean)),
        el("div.ord-qty", {}, [
          el("button.q", { text: "−", onclick: () => поставить(корзина.количество(id) - 1) }),
          число,
          el("button.q", { text: "+", onclick: () => поставить(корзина.количество(id) + 1) }),
        ]),
        el("button.ord-del", { title: "Убрать", onclick: () => поставить(0) }, [icon("trash", { size: 16 })]),
      ]));
    });

    const { позиций, штук } = корзина.итого();
    список.append(el("div.ord-sum", { text: `${позиций} поз. · ${штук} шт.` }));
    список.append(el("div.hint", { style: { marginTop: "6px" },
      text: "Цену мы посчитаем и пришлём вам на подтверждение." }));

    const отправить = el("button.btn.btn-primary", {}, [
      icon("send", { size: 17 }),
      открытый ? "Добавить к заказу" : "Отправить заказ",
    ]);
    отправить.addEventListener("click", () => подтвердить(отправить));
    низ.append(отправить);
  }

  function подтвердить(кнопка) {
    const { позиций, штук } = корзина.итого();
    const вопрос = открытый
      ? `Дописать ${позиций} поз. (${штук} шт.) к заказу от ${дата(открытый.date)}?`
      : `Отправить заказ: ${позиций} поз., ${штук} шт.?`;
    confirmDialog(вопрос, async () => {
      кнопка.disabled = true;
      const прежний = кнопка.innerHTML;
      кнопка.textContent = "Отправляем…";
      try {
        const ответ = await отправитьКорзину(корзина.позиции().map(({ id, qty }) => ({ id, qty })));
        корзина.очистить();
        if (ответ.skipped && ответ.skipped.length) {
          toast("Не попали в заказ (разобрали): " + ответ.skipped.join(", "), "err");
        }
        try { await ctx.обновитьЗаказы(); } catch {}
        toast(ответ.merged ? "Товары добавлены в ваш заказ" : "Заказ отправлен", "ok");
        идти("orders");
      } catch (e) {
        кнопка.disabled = false;
        кнопка.innerHTML = прежний;
        toast("Не удалось отправить: " + (e.message || e), "err");
      }
    });
  }

  рисовать();
}
