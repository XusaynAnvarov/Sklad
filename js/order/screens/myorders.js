// ========================================================================
//  МОИ ЗАКАЗЫ — то, чего клиенту не хватало больше всего.
//  Раньше он отправлял заказ и больше его не видел: непонятно, дошёл ли,
//  посчитали ли цену, что вообще происходит. Теперь виден каждый заказ
//  и его состояние.
//
//  Пока цену не проставили — заказ можно поправить и отменить. После —
//  только согласиться с ценой или отказаться: заказ уже в работе.
// ========================================================================
import { el } from "../../el.js?v=20260831b";
import { icon } from "../../icons.js?v=20260831b";
import { toast, confirmDialog } from "../../ui.js?v=20260831b";
import { fmt } from "../../fx.js?v=20260831b";
import { идти } from "../app.js?v=20260831b";
import { мои } from "../api.js?v=20260831b";
import { картинка } from "../photo.js?v=20260831b";

const СОСТОЯНИЕ = {
  order:           { метка: "Считаем цену",   cls: "wait",  что: "Мы готовим цену. Пока можно поправить заказ." },
  pending_confirm: { метка: "Проверьте цену", cls: "ask",   что: "Цена готова. Согласны — подтвердите, и мы соберём заказ." },
  confirmed:       { метка: "Подтверждён",    cls: "ok",    что: "Спасибо! Собираем ваш заказ." },
  final:           { метка: "Оформлен",       cls: "done",  что: "Заказ оформлен, накладная готова." },
  canceled:        { метка: "Отменён",        cls: "off",   что: "Заказ отменён." },
};
const состояние = (s) => СОСТОЯНИЕ[s] || { метка: s || "—", cls: "off", что: "" };

const когда = (d) => {
  const t = new Date(d);
  return isFinite(t) ? t.toLocaleDateString("ru-RU", { day: "2-digit", month: "long" }) : "—";
};
const итогСтрокой = (o) => {
  const части = Object.entries(o.totals || {}).filter(([, v]) => v > 0.001).map(([c, v]) => fmt(v, c));
  return части.length ? части.join(" + ") : "";
};

export default function render(box, ctx) {
  let открыт = null;   // id заказа, раскрытого на весь экран

  function рисовать() {
    box.innerHTML = "";
    if (открыт) {
      const заказ = ctx.заказы.find(o => String(o.id) === String(открыт));
      if (заказ) return подробно(заказ);
      открыт = null;   // заказ исчез (отменили) — возвращаемся к списку
    }
    списком();
  }

  // ---------- список заказов ----------
  function списком() {
    if (!ctx.заказы.length) {
      box.append(
        el("div.mini-empty", { text: "Заказов пока нет. Выберите товары в каталоге — мы посчитаем цену." }),
        el("button.btn.btn-outline", {
          style: { width: "100%", justifyContent: "center", minHeight: "46px" },
          text: "Открыть каталог", onclick: () => идти("catalog"),
        }),
      );
      return;
    }

    const ждут = ctx.заказы.filter(o => o.status === "pending_confirm").length;
    if (ждут) {
      box.append(el("div.ord-note.ask", {}, [
        icon("clock", { size: 16 }),
        el("span", { text: ждут === 1
          ? "По одному заказу готова цена — посмотрите и подтвердите."
          : `Готова цена по заказам: ${ждут}. Посмотрите и подтвердите.` }),
      ]));
    }

    const список = el("div.mini-list");
    ctx.заказы.forEach(o => {
      const с = состояние(o.status);
      const итог = итогСтрокой(o);
      список.append(el("div.mini-row", { onclick: () => { открыт = o.id; рисовать(); } }, [
        el("div.info", {}, [
          el("div.nm", { text: "Заказ от " + когда(o.date) }),
          el("div.sku", { text: (o.items || []).length + " поз." + (итог ? " · " + итог : "") }),
          el("div.ord-mark." + с.cls, { text: с.метка }),
        ]),
        el("div.qty", {}, [icon("arrow-up-right", { size: 16 })]),
      ]));
    });
    box.append(список);
  }

  // ---------- один заказ ----------
  function подробно(o) {
    const с = состояние(o.status);
    const правится = o.status === "order";
    const спрашивают = o.status === "pending_confirm";

    box.append(
      el("button.btn.btn-outline", {
        style: { minHeight: "40px", marginBottom: "12px" },
        onclick: () => { открыт = null; рисовать(); },
      }, [icon("arrow-left", { size: 15 }), "Все заказы"]),
      el("div.ord-head", {}, [
        el("div.t", { text: "Заказ от " + когда(o.date) }),
        el("div.ord-mark." + с.cls, { text: с.метка }),
      ]),
      el("div.hint", { style: { margin: "6px 0 12px" }, text: с.что }),
    );

    const список = el("div.mini-list");
    (o.items || []).forEach(it => {
      const цена = it.unit_price > 0
        ? `${it.qty} × ${fmt(it.unit_price, it.currency)} = ${fmt(it.qty * it.unit_price, it.currency)}`
        : `${it.qty} шт. · цену считаем`;

      const строка = el("div.mini-row", {}, [
        картинка(it.photo, { size: 96, имя: it.name, className: "ph" }),
        el("div.info", {}, [
          el("div.nm", { text: it.name }),
          el("div.sku", { text: цена }),
        ]),
      ]);

      // Править можно, только пока цену не проставили: после этого заказ
      // уже считают и собирают, и менять его молча нельзя.
      if (правится) {
        строка.append(
          el("div.ord-qty", {}, [
            el("button.q", { text: "−", onclick: () => правка(o, it, it.qty - 1) }),
            el("span.n", { text: String(it.qty) }),
            el("button.q", { text: "+", onclick: () => правка(o, it, it.qty + 1) }),
          ]),
          el("button.ord-del", { title: "Убрать", onclick: () => убрать(o, it) }, [icon("trash", { size: 16 })]),
        );
      }
      список.append(строка);
    });
    box.append(список);

    const итог = итогСтрокой(o);
    if (итог) box.append(el("div.ord-sum", { text: "Итого: " + итог }));

    // ---------- действия ----------
    if (правится) {
      box.append(el("div.mini-cta", {}, [
        el("button.btn.btn-outline", {
          style: { width: "100%", justifyContent: "center", minHeight: "46px" },
          onclick: () => отменить(o),
        }, [icon("x", { size: 16 }), "Отменить заказ"]),
      ]));
    } else if (спрашивают) {
      box.append(el("div.ord-actions", {}, [
        el("button.btn.btn-outline", { onclick: () => ответить(o, false) }, [icon("x", { size: 16 }), "Не подходит"]),
        el("button.btn.btn-primary", { onclick: () => ответить(o, true) }, [icon("check", { size: 16 }), "Подтвердить"]),
      ]));
    }
  }

  // ---------- обращения к серверу ----------
  async function перечитать() {
    try { await ctx.обновитьЗаказы(); } catch (e) { toast("Не удалось обновить: " + (e.message || e), "err"); }
    рисовать();
  }

  async function правка(o, it, qty) {
    const n = Math.max(0, Math.floor(Number(qty) || 0));
    if (n <= 0) return убрать(o, it);
    try {
      await мои("edit", { order_id: o.id, product_id: it.product_id, qty: n });
      await перечитать();
    } catch (e) { toast(e.message || String(e), "err"); }
  }

  function убрать(o, it) {
    if ((o.items || []).length <= 1) {
      toast("Это последний товар. Чтобы убрать всё — отмените заказ.", "err");
      return;
    }
    confirmDialog(`Убрать «${it.name}» из заказа?`, async () => {
      try {
        await мои("edit", { order_id: o.id, product_id: it.product_id, qty: 0 });
        await перечитать();
      } catch (e) { toast(e.message || String(e), "err"); }
    });
  }

  function отменить(o) {
    confirmDialog("Отменить заказ целиком? Вернуть его будет нельзя — придётся собрать заново.", async () => {
      try {
        await мои("cancel", { order_id: o.id });
        открыт = null;
        await перечитать();
        toast("Заказ отменён", "ok");
      } catch (e) { toast(e.message || String(e), "err"); }
    });
  }

  function ответить(o, согласен) {
    const вопрос = согласен
      ? "Подтвердить заказ по этой цене?"
      : "Отказаться от этой цены? Мы пересчитаем и свяжемся с вами.";
    confirmDialog(вопрос, async () => {
      try {
        await мои("confirm", { order_id: o.id, agree: согласен });
        await перечитать();
        toast(согласен ? "Спасибо! Собираем заказ" : "Передали — пересчитаем", "ok");
      } catch (e) { toast(e.message || String(e), "err"); }
    });
  }

  рисовать();
}
