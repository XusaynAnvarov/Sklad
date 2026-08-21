// Документы: последние накладные и оплаты, с правкой и удалением.
//
// Осторожно с удалением накладной: товар из неё уже списан со склада,
// поэтому при удалении его надо ВЕРНУТЬ обратно — иначе остатки разъедутся.
// Возврат делает returnItems из js/sklad/stock.js, теми же партиями FIFO.
import { el } from "../app.js?v=20260821i";
import { icon } from "../../icons.js?v=20260821i";
import { toast, modal, confirmDialog } from "../../ui.js?v=20260821i";
import { fmt } from "../../fx.js?v=20260821i";
import { returnItems } from "../stock.js?v=20260821i";
import { applyQtyChange, applyPriceChange } from "../issue.js?v=20260821i";
import { methodOptions, methodLabel, DEFAULT_METHOD } from "../../payment.js?v=20260821i";

const CURS = [{ value: "som", label: "сум" }, { value: "usd", label: "$" }, { value: "yuan", label: "¥" }];
const dt = (d) => new Date(d).toLocaleDateString("ru-RU");

export default async function render(box, ctx) {
  const [sales, payments, customers, products] = await Promise.all([
    ctx.db.sales.list(), ctx.db.payments.list(), ctx.db.customers.list(), ctx.db.products.list(),
  ]);
  const cmap = Object.fromEntries(customers.map(c => [c.id, c.name]));
  const pmap = Object.fromEntries(products.map(p => [p.id, p]));

  let tab = "sales";
  const tabs = el("div.mini-acts", { style: { marginBottom: "12px" } });
  const body = el("div");
  box.append(tabs, body);

  const total = (s) => {
    const t = { som: 0, usd: 0, yuan: 0 };
    (s.items || []).forEach(i => {
      const c = i.currency || s.currency || "som";
      if (t[c] !== undefined) t[c] += (Number(i.qty) || 0) * (Number(i.unit_price) || 0);
    });
    const parts = Object.entries(t).filter(([, v]) => v > 0.001).map(([c, v]) => fmt(v, c));
    return parts.length ? parts.join(" + ") : "0";
  };
  const whoOf = (s) => cmap[s.customer_id] || s.order_from?.name || "без имени";

  function drawTabs() {
    tabs.innerHTML = "";
    const btn = (id, label, sub) => el("button.mini-act", {
      onclick: () => { tab = id; drawTabs(); draw(); },
      style: tab === id ? { borderColor: "var(--accent)" } : {},
    }, [
      icon(tab === id ? "check" : "dot", { size: 18 }),
      el("div", {}, [el("div", { text: label }), el("div.sub", { text: sub })]),
    ]);
    tabs.append(btn("sales", "Накладные", sales.length + " шт"), btn("pays", "Оплаты", payments.length + " шт"));
  }

  // ---------- накладная ----------
  function openSale(s) {
    const список = el("div.mini-list");
    const подпись = el("div.sku", { style: { marginBottom: "10px" } });

    function drawItems() {
      список.innerHTML = "";
      if (!(s.items || []).length) { список.append(el("div.mini-empty", { text: "Позиций не осталось" })); }
      (s.items || []).forEach((it, idx) => {
        список.append(el("div.mini-row", { onclick: () => правкаПозиции(s, it, idx) }, [
          el("div.info", {}, [
            el("div.nm", { text: (pmap[it.product_id] || {}).name || "—" }),
            el("div.sku", { text: it.qty + " × " + fmt(it.unit_price, it.currency || s.currency) }),
          ]),
          el("div.qty", { text: fmt((Number(it.qty) || 0) * (Number(it.unit_price) || 0), it.currency || s.currency) }),
        ]));
      });
      подпись.textContent = whoOf(s) + " · " + total(s);
    }
    drawItems();

    modal({
      title: "Накладная от " + dt(s.date),
      wide: true,
      body: el("div", {}, [
        подпись,
        список,
        el("div.hint", { style: { marginTop: "10px" }, text: "Нажмите на позицию, чтобы поправить количество или цену — склад подвинется на разницу. Удаление накладной вернёт весь товар." }),
      ]),
      actions: [
        {
          label: "Удалить", kind: "btn-danger", onClick: (close) => {
            confirmDialog(
              `Удалить накладную на ${total(s)}? Товар вернётся на склад, долг клиента уменьшится.`,
              async () => {
                try {
                  // 1) сначала возвращаем товар — если это не выйдет, накладную не трогаем
                  await returnItems(ctx.db, (s.items || []).map(i => ({ product_id: i.product_id, qty: i.qty })));
                  // 2) и только потом убираем запись
                  await ctx.db.sales.remove(s.id);
                  const i = sales.findIndex(x => x.id === s.id);
                  if (i >= 0) sales.splice(i, 1);
                  close(); drawTabs(); draw();
                  toast("Накладная удалена, товар возвращён", "ok");
                } catch (e) {
                  toast("Не удалось: " + (e.message || e), "err");
                }
              });
          },
        },
        { label: "Закрыть", kind: "btn-primary", onClick: c => c() },
      ],
    });
  }

  // Правка позиции в уже выданной накладной. Количество двигает склад на
  // разницу, цена склада не касается. Считает общий js/sklad/issue.js.
  function правкаПозиции(s, it, idx) {
    const p = pmap[it.product_id] || {};
    const fQty = el("input.inp", { type: "number", inputmode: "numeric", value: String(it.qty),
      style: { width: "100%", minHeight: "46px", fontSize: "17px", textAlign: "center" } });
    const fPrice = el("input.inp", { type: "number", inputmode: "decimal", step: "0.01", value: String(it.unit_price || ""),
      style: { width: "100%", minHeight: "46px", fontSize: "17px" } });
    const fCur = el("select.inp", { style: { width: "100%", minHeight: "46px", fontSize: "17px" } });
    [["som", "сум"], ["usd", "$"], ["yuan", "¥"]].forEach(([v, l]) => fCur.append(el("option", { value: v, text: l })));
    fCur.value = it.currency || s.currency || "som";

    modal({
      title: p.name || "Позиция",
      body: el("div", {}, [
        el("div.sku", { style: { marginBottom: "10px" }, text: "На складе сейчас: " + (Number(p.stock_qty) || 0) }),
        el("div", { style: { display: "grid", gridTemplateColumns: "1fr 1.4fr 0.9fr", gap: "8px" } }, [
          el("label.field", {}, [el("span.field-label", { text: "Кол-во" }), fQty]),
          el("label.field", {}, [el("span.field-label", { text: "Цена" }), fPrice]),
          el("label.field", {}, [el("span.field-label", { text: "Валюта" }), fCur]),
        ]),
        el("div.hint", { style: { marginTop: "8px" }, text: "Увеличите количество — товар спишется со склада, уменьшите — вернётся." }),
      ]),
      actions: [
        { label: "Убрать позицию", kind: "btn-outline", onClick: (close) => {
          confirmDialog("Убрать «" + (p.name || "позицию") + "» из накладной? Товар вернётся на склад.", async () => {
            try {
              await applyQtyChange(ctx.db, it, 0);
              s.items.splice(idx, 1);
              await ctx.db.sales.upsert({ id: s.id, items: s.items });
              await освежить(s);
              close(); drawItems(); draw();
              toast("Позиция убрана, товар возвращён", "ok");
            } catch (e) { toast("Не удалось: " + (e.message || e), "err"); }
          });
        } },
        { label: "Сохранить", kind: "btn-primary", onClick: async (close) => {
          const q = Number(fQty.value) || 0;
          const pr = Number(fPrice.value) || 0;
          if (q <= 0) { toast("Количество должно быть больше нуля", "err"); return; }
          try {
            await applyQtyChange(ctx.db, it, q);
            applyPriceChange(it, pr, fCur.value);
            await ctx.db.sales.upsert({ id: s.id, items: s.items });
            await освежить(s);
            close(); drawItems(); draw();
            toast("Накладная обновлена", "ok");
          } catch (e) { toast("Не удалось: " + (e.message || e), "err"); }
        } },
      ],
    });
  }

  // перечитываем задетые товары: остатки на экране должны быть настоящими
  async function освежить(s) {
    const ids = [...new Set((s.items || []).map(i => i.product_id).filter(Boolean))];
    for (const id of ids) {
      try { const свежий = await ctx.db.products.get(id); if (свежий && pmap[id]) Object.assign(pmap[id], свежий); }
      catch { }
    }
  }

  // ---------- оплата ----------
  function openPay(p) {
    const fAmount = el("input.inp", { type: "number", inputmode: "decimal", step: "0.01", value: String(p.amount || ""), style: { width: "100%", minHeight: "46px", fontSize: "17px" } });
    const fCur = el("select.inp", { style: { width: "100%", minHeight: "46px", fontSize: "16px" } });
    CURS.forEach(c => fCur.append(el("option", { value: c.value, text: c.label })));
    fCur.value = p.currency || "som";
    const fMethod = el("select.inp", { style: { width: "100%", minHeight: "46px", fontSize: "16px" } });
    methodOptions().forEach(o => fMethod.append(el("option", { value: o.value, text: o.label })));
    fMethod.value = p.method || DEFAULT_METHOD;

    modal({
      title: "Оплата от " + dt(p.date),
      body: el("div", { style: { display: "grid", gap: "10px" } }, [
        el("div.sku", { text: cmap[p.customer_id] || "без клиента" }),
        el("label.field", {}, [el("span.field-label", { text: "Сумма" }), fAmount]),
        el("div", { style: { display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: "10px" } }, [
          el("label.field", {}, [el("span.field-label", { text: "Валюта" }), fCur]),
          el("label.field", {}, [el("span.field-label", { text: "Способ" }), fMethod]),
        ]),
      ]),
      actions: [
        {
          label: "Удалить", kind: "btn-danger", onClick: (close) => {
            confirmDialog(`Удалить оплату ${fmt(p.amount, p.currency)}? Долг клиента вырастет обратно.`, async () => {
              try {
                await ctx.db.payments.remove(p.id);
                const i = payments.findIndex(x => x.id === p.id);
                if (i >= 0) payments.splice(i, 1);
                close(); drawTabs(); draw();
                toast("Оплата удалена", "ok");
              } catch (e) { toast("Не удалось: " + (e.message || e), "err"); }
            });
          },
        },
        { label: "Отмена", kind: "btn-outline", onClick: c => c() },
        {
          label: "Сохранить", kind: "btn-primary", onClick: async (close) => {
            const amount = Number(fAmount.value) || 0;
            if (amount <= 0) { toast("Впишите сумму", "err"); return; }
            const base = { id: p.id, customer_id: p.customer_id, amount, currency: fCur.value, date: p.date, note: p.note };
            try {
              try { await ctx.db.payments.upsert({ ...base, method: fMethod.value }); }
              catch { await ctx.db.payments.upsert(base); }
              Object.assign(p, base, { method: fMethod.value });
              close(); draw();
              toast("Сохранено", "ok");
            } catch (e) { toast("Не удалось: " + (e.message || e), "err"); }
          },
        },
      ],
    });
  }

  // ---------- списки ----------
  function draw() {
    body.innerHTML = "";
    const list = el("div.mini-list");
    if (tab === "sales") {
      const rows = sales.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 40);
      if (!rows.length) { body.append(el("div.mini-empty", { text: "Накладных пока нет" })); return; }
      rows.forEach(s => list.append(el("div.mini-row", { onclick: () => openSale(s) }, [
        el("div.info", {}, [
          el("div.nm", { text: whoOf(s) }),
          el("div.sku", { text: dt(s.date) + " · " + (s.items || []).length + " поз." }),
        ]),
        el("div.qty", { text: total(s) }),
      ])));
    } else {
      const rows = payments.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 40);
      if (!rows.length) { body.append(el("div.mini-empty", { text: "Оплат пока нет" })); return; }
      rows.forEach(p => list.append(el("div.mini-row", { onclick: () => openPay(p) }, [
        el("div.info", {}, [
          el("div.nm", { text: cmap[p.customer_id] || "без клиента" }),
          el("div.sku", { text: dt(p.date) + " · " + methodLabel(p.method) }),
        ]),
        el("div.qty", { text: fmt(p.amount, p.currency) }),
      ])));
    }
    body.append(list);
  }

  drawTabs(); draw();
}
