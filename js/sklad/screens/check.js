// Проверка склада: одно место, где видно всё, что разошлось с остатками.
// Список расхождений считает общий js/stockcheck.js — тот же, что на сайте,
// иначе получалось бы «на компьютере чисто, а в телефоне десять проблем».
import { el } from "../app.js?v=20260831b";

import { toast, confirmDialog, modal } from "../../ui.js?v=20260831b";
import { fmt } from "../../fx.js?v=20260831b";
import { findProblems } from "../../stockcheck.js?v=20260831b";
import { ensureBatches, sumQty, consumeFIFO, costAfter } from "../../inventory.js?v=20260831b";
import { setStock } from "../stock.js?v=20260831b";

const когда = (d) => { const t = new Date(d); return isFinite(t) ? t.toLocaleDateString("ru-RU") : "—"; };

export default async function render(box, ctx) {
  const [products, sales] = await Promise.all([ctx.db.products.list(), ctx.db.sales.list()]);
  const pmap = Object.fromEntries(products.map(p => [p.id, p]));
  let проблемы = findProblems(products, sales);

  const шапка = el("div.mini-nums");
  const тело = el("div");
  box.append(шапка, тело);

  function draw() {
    проблемы = findProblems(products, sales);
    шапка.innerHTML = "";
    тело.innerHTML = "";

    шапка.append(
      число("Расхождений", String(проблемы.total), проблемы.total ? "warn" : "good"),
      число("В минусе", String(проблемы.negative.length), проблемы.negative.length ? "warn" : "good"),
      число("Не списано", String(проблемы.unapplied.length), проблемы.unapplied.length ? "warn" : "good"),
    );

    if (проблемы.allGood) {
      тело.append(el("div.mini-empty", { text: "Расхождений нет: накладные списаны, остатки сходятся с партиями, минусов нет." }));
      if (проблемы.pending.length) {
        тело.append(el("div.hint", { style: { marginTop: "10px" },
          text: "Заказов, по которым склад ещё не трогали: " + проблемы.pending.length + ". Это норма — они ждут оформления." }));
      }
      return;
    }

    раздел("Продали больше, чем было", проблемы.negative,
      "Впишите, сколько привезли — минус погасится.",
      p => строка(p.name, "остаток " + (Number(p.stock_qty) || 0), String(Number(p.stock_qty) || 0), "neg",
        () => приход(p)));

    раздел("Остаток не сходится с партиями", проблемы.mismatch,
      "Так бывает после ручных правок. Пересчёт приведёт остаток к сумме партий.",
      p => строка(p.name, "в карточке " + (Number(p.stock_qty) || 0) + ", по партиям " + sumQty(ensureBatches(p)),
        String(sumQty(ensureBatches(p))), "low", () => пересчитатьОстаток(p)));

    раздел("Себестоимость уехала", проблемы.costOff,
      "Цена должна быть как у старейшей партии — той, что продаётся сейчас.",
      x => строка(x.p.name, "в карточке " + fmt(x.was.cost_yuan, "yuan") + ", по партиям " + fmt(x.now.cost_yuan, "yuan"),
        fmt(x.now.cost_yuan, "yuan"), "low", () => пересчитатьЦену(x)));

    раздел("Накладные без списания", проблемы.unapplied,
      "Накладная оформлена, но товар со склада не сняли.",
      s => строка("Накладная от " + когда(s.date), (s.items || []).length + " поз.", "списать", "low",
        () => провести(s)));

    раздел("Дальше пойдём в убыток", проблемы.nextTooPricey,
      "Пока продаётся старая партия — всё хорошо. Как только кончится, цена закупки станет выше цены продажи.",
      x => строка(x.p.name, "продаём по " + fmt(x.price, "yuan") + ", следующая партия " + fmt(x.o.next.cost_yuan, "yuan"),
        fmt(x.o.next.cost_yuan - x.price, "yuan"), "low", null));
  }

  // ---------- кирпичики ----------
  function число(l, v, cls) {
    return el("div.mini-num" + (cls ? "." + cls : ""), {}, [el("div.l", { text: l }), el("div.v", { text: v })]);
  }
  function строка(имя, подпись, справа, cls, onclick) {
    return el("div.mini-row" + (cls ? "." + cls : ""), onclick ? { onclick } : {}, [
      el("div.info", {}, [el("div.nm", { text: имя }), el("div.sku", { text: подпись })]),
      el("div.qty" + (cls ? "." + cls : ""), { text: справа }),
    ]);
  }
  function раздел(title, items, hint, render) {
    if (!items.length) return;
    const list = el("div.mini-list");
    items.slice(0, 40).forEach(x => list.append(render(x)));
    тело.append(
      el("div", { style: { fontWeight: "700", fontSize: "15px", margin: "16px 0 6px" }, text: title + " · " + items.length }),
      el("div.hint", { style: { marginBottom: "8px" }, text: hint }),
      list,
      items.length > 40 ? el("div.hint", { style: { marginTop: "6px" }, text: "Показаны первые 40." }) : null,
    );
  }

  // ---------- исправления ----------
  function приход(p) {
    const f = el("input.inp", { type: "number", inputmode: "numeric", placeholder: "сколько привезли",
      style: { width: "100%", minHeight: "48px", fontSize: "18px", textAlign: "center" } });
    modal({
      title: p.name,
      body: el("div", {}, [
        el("div.sku", { style: { marginBottom: "10px" }, text: "Сейчас в минусе: " + (Number(p.stock_qty) || 0) }),
        el("label.field", {}, [el("span.field-label", { text: "Привезли, штук" }), f]),
        el("div.hint", { style: { marginTop: "8px" }, text: "Зачислим по нынешней складской цене — прибыль не изменится." }),
      ]),
      actions: [
        { label: "Отмена", kind: "btn-outline", onClick: c => c() },
        { label: "Зачислить", kind: "btn-primary", onClick: async (close) => {
          const n = Number(f.value) || 0;
          if (n <= 0) { toast("Впишите число", "err"); return; }
          try {
            const r = await setStock(ctx.db, p.id, (Number(p.stock_qty) || 0) + n);
            // перечитываем товар: партии изменились, а список проблем
            // считается по ним — иначе строка осталась бы висеть
            try { Object.assign(p, (await ctx.db.products.get(p.id)) || { stock_qty: r.stock }); }
            catch { p.stock_qty = r.stock; }
            close(); draw();
            toast("Остаток: " + r.stock, "ok");
          } catch (e) { toast("Не удалось: " + (e.message || e), "err"); }
        } },
      ],
    });
  }

  function пересчитатьОстаток(p) {
    const надо = sumQty(ensureBatches(p));
    confirmDialog(p.name + ": поставить остаток " + надо + " — как в партиях?", async () => {
      try {
        await ctx.db.products.upsert({ id: p.id, stock_qty: надо });
        p.stock_qty = надо;
        draw();
        toast("Остаток пересчитан", "ok");
      } catch (e) { toast("Не удалось: " + (e.message || e), "err"); }
    });
  }

  function пересчитатьЦену(x) {
    confirmDialog(x.p.name + ": поставить себестоимость " + fmt(x.now.cost_yuan, "yuan") + " — как у старейшей партии?", async () => {
      try {
        await ctx.db.products.upsert({ id: x.p.id, cost_yuan: x.now.cost_yuan, cost_usd: x.now.cost_usd });
        x.p.cost_yuan = x.now.cost_yuan; x.p.cost_usd = x.now.cost_usd;
        draw();
        toast("Себестоимость исправлена", "ok");
      } catch (e) { toast("Не удалось: " + (e.message || e), "err"); }
    });
  }

  // Списать товар по накладной, которую оформили, но со склада не сняли.
  // Помечаем позиции — иначе накладная останется в списке и её спишут ещё раз.
  function провести(s) {
    const строки = (s.items || []).map(it => (pmap[it.product_id] || {}).name + " × " + it.qty).join(", ");
    confirmDialog("Списать со склада: " + строки + "?", async () => {
      try {
        const items = JSON.parse(JSON.stringify(s.items || []));
        for (const it of items) {
          const p = pmap[it.product_id];
          if (!p) continue;
          const r = consumeFIFO(ensureBatches(p), Number(it.qty) || 0);
          const cc = costAfter(r.batches, p);
          const row = { id: p.id, stock_qty: sumQty(r.batches), cost_yuan: cc.cost_yuan, cost_usd: cc.cost_usd, batches: r.batches };
          try { await ctx.db.products.upsert(row); }
          catch { const { batches, ...без } = row; await ctx.db.products.upsert(без); }
          p.batches = r.batches; p.stock_qty = row.stock_qty; p.cost_yuan = cc.cost_yuan; p.cost_usd = cc.cost_usd;
          it.cogs_yuan = r.cogY; it.cogs_usd = r.cogU;
          it.applied = true;
        }
        await ctx.db.sales.upsert({ id: s.id, items });
        s.items = items;
        draw();
        toast("Списано со склада", "ok");
      } catch (e) { toast("Не удалось: " + (e.message || e), "err"); }
    });
  }

  draw();
}
