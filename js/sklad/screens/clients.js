// Клиенты: кто сколько должен, по каким ценам брал, приём оплаты и новый клиент.
// Долг считает js/debt.js — то же самое место, что и склад на сайте.
// Раньше здесь была своя копия расчёта, и она забывала старый долг клиента:
// один и тот же человек показывал разные цифры в телефоне и на компьютере.
import { el } from "../app.js?v=20260820h";
import { icon } from "../../icons.js?v=20260820h";
import { toast, modal, confirmDialog } from "../../ui.js?v=20260820h";
import { fmt } from "../../fx.js?v=20260820h";
import { methodOptions, DEFAULT_METHOD } from "../../payment.js?v=20260820h";
import { debtByCur, onlyPositive, turnoverByCur, hasDebt, CURS, zero } from "../../debt.js?v=20260820h";

const uid = () => "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const curStr = (m) => {
  const parts = CURS.filter(c => Math.abs(m[c] || 0) > (c === "som" ? 0.5 : 0.009)).map(c => fmt(m[c], c));
  return parts.length ? parts.join(" + ") : "0";
};

export default async function render(box, ctx) {
  const [customers, sales, payments, products] = await Promise.all([
    ctx.db.customers.list(), ctx.db.sales.list(), ctx.db.payments.list(), ctx.db.products.list(),
  ]);
  const pmap = Object.fromEntries(products.map(p => [p.id, p]));

  // Раскладываем накладные и оплаты по клиентам один раз — списки длинные,
  // а карточек на экране много.
  const byClient = {}, paysOf = {};
  sales.forEach(s => { if (s.customer_id) (byClient[s.customer_id] = byClient[s.customer_id] || []).push(s); });
  payments.forEach(p => { if (p.customer_id) (paysOf[p.customer_id] = paysOf[p.customer_id] || []).push(p); });
  const cmap = Object.fromEntries(customers.map(c => [c.id, c]));

  const turn = {};
  customers.forEach(c => { turn[c.id] = turnoverByCur(byClient[c.id] || []); });
  // долг без минуса: аванс в списке только запутал бы
  const debtOf = (id) => onlyPositive(debtByCur(byClient[id] || [], paysOf[id] || [], cmap[id]));

  // ---------- поиск и кнопка «добавить» ----------
  const search = el("input.inp", { type: "search", placeholder: "Имя или телефон…", style: { flex: "1", minHeight: "44px", fontSize: "16px" } });
  const addBtn = el("button.mini-icon-btn", { title: "Добавить клиента" }, [icon("plus", { size: 18 })]);
  box.append(el("div.mini-search", {}, [search, addBtn]));

  const list = el("div.mini-list");
  box.append(list);

  // ---------- добавить клиента ----------
  addBtn.addEventListener("click", () => {
    const fName = el("input.inp", { type: "text", placeholder: "Имя", style: { width: "100%", minHeight: "46px", fontSize: "16px" } });
    const fPhone = el("input.inp", { type: "tel", placeholder: "+998…", style: { width: "100%", minHeight: "46px", fontSize: "16px" } });
    modal({
      title: "Новый клиент",
      body: el("div", { style: { display: "grid", gap: "10px" } }, [
        el("label.field", {}, [el("span.field-label", { text: "Имя" }), fName]),
        el("label.field", {}, [el("span.field-label", { text: "Телефон" }), fPhone]),
      ]),
      actions: [
        { label: "Отмена", kind: "btn-outline", onClick: c => c() },
        {
          label: "Добавить", kind: "btn-primary", onClick: async (close) => {
            const name = fName.value.trim();
            if (!name) { toast("Впишите имя", "err"); return; }
            try {
              const row = { id: uid(), name, contact: fPhone.value.trim() };
              await ctx.db.customers.upsert(row);
              customers.push(row);
              close(); draw();
              toast("Клиент добавлен", "ok");
            } catch (e) { toast("Не удалось: " + (e.message || e), "err"); }
          },
        },
      ],
    });
  });

  // ---------- оплата ----------
  function openPayment(c) {
    const fAmount = el("input.inp", { type: "number", inputmode: "decimal", step: "0.01", placeholder: "0", style: { width: "100%", minHeight: "46px", fontSize: "17px" } });
    const fCur = el("select.inp", { style: { width: "100%", minHeight: "46px", fontSize: "16px" } });
    [{ v: "som", l: "сум" }, { v: "usd", l: "$" }, { v: "yuan", l: "¥" }].forEach(x => fCur.append(el("option", { value: x.v, text: x.l })));
    const fMethod = el("select.inp", { style: { width: "100%", minHeight: "46px", fontSize: "16px" } });
    methodOptions().forEach(o => fMethod.append(el("option", { value: o.value, text: o.label })));
    fMethod.value = DEFAULT_METHOD;
    const d = debtOf(c.id);

    modal({
      title: "Оплата — " + c.name,
      body: el("div", { style: { display: "grid", gap: "10px" } }, [
        el("div.sku", { text: "Долг сейчас: " + curStr(d) }),
        el("label.field", {}, [el("span.field-label", { text: "Сумма" }), fAmount]),
        el("div", { style: { display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: "10px" } }, [
          el("label.field", {}, [el("span.field-label", { text: "Валюта" }), fCur]),
          el("label.field", {}, [el("span.field-label", { text: "Способ" }), fMethod]),
        ]),
      ]),
      actions: [
        { label: "Отмена", kind: "btn-outline", onClick: x => x() },
        {
          label: "Записать", kind: "btn-primary", onClick: async (close) => {
            const amount = Number(fAmount.value) || 0;
            if (amount <= 0) { toast("Впишите сумму", "err"); return; }
            const base = { id: "y" + Date.now().toString(36), customer_id: c.id, amount, currency: fCur.value, date: new Date().toISOString(), note: "Оплата (телефон)" };
            try {
              // колонки method может не быть в старой базе — тогда пишем без неё
              try { await ctx.db.payments.upsert({ ...base, method: fMethod.value }); }
              catch { await ctx.db.payments.upsert(base); }
              // кладём оплату в тот же список, из которого считается долг,
              // иначе на экране останется старая цифра до перезахода
              (paysOf[c.id] = paysOf[c.id] || []).push(base);
              close(); draw();
              toast("Оплата записана", "ok");
            } catch (e) { toast("Не удалось: " + (e.message || e), "err"); }
          },
        },
      ],
    });
  }

  // ---------- правка клиента ----------
  function openEditClient(c) {
    const fName = el("input.inp", { type: "text", value: c.name || "", style: { width: "100%", minHeight: "46px", fontSize: "16px" } });
    const fPhone = el("input.inp", { type: "tel", value: c.contact || "", placeholder: "+998…", style: { width: "100%", minHeight: "46px", fontSize: "16px" } });
    const d = debtOf(c.id);
    modal({
      title: "Клиент — " + c.name,
      body: el("div", { style: { display: "grid", gap: "10px" } }, [
        el("label.field", {}, [el("span.field-label", { text: "Имя" }), fName]),
        el("label.field", {}, [el("span.field-label", { text: "Телефон" }), fPhone]),
        hasDebt(d) ? el("div.hint", { text: "У клиента долг " + curStr(d) + ". Удалять его нельзя — сначала закройте долг." }) : null,
      ].filter(Boolean)),
      actions: [
        // удалять клиента с долгом опасно: пропадёт след того, кто должен деньги
        !hasDebt(d) ? { label: "Удалить", kind: "btn-danger", onClick: (close) => {
          confirmDialog("Удалить клиента «" + c.name + "»? Его накладные останутся, но будут без имени.", async () => {
            try {
              await ctx.db.customers.remove(c.id);
              const idx = customers.findIndex(x => x.id === c.id);
              if (idx >= 0) customers.splice(idx, 1);
              close(); draw(); toast("Клиент удалён", "ok");
            } catch (e) { toast("Не удалось: " + (e.message || e), "err"); }
          });
        } } : null,
        { label: "Отмена", kind: "btn-outline", onClick: x => x() },
        { label: "Сохранить", kind: "btn-primary", onClick: async (close) => {
          const name = fName.value.trim();
          if (!name) { toast("Впишите имя", "err"); return; }
          try {
            await ctx.db.customers.upsert({ id: c.id, name, contact: fPhone.value.trim() });
            c.name = name; c.contact = fPhone.value.trim();
            close(); draw(); toast("Сохранено", "ok");
          } catch (e) { toast("Не удалось: " + (e.message || e), "err"); }
        } },
      ].filter(Boolean),
    });
  }

  // ---------- карточка клиента ----------
  async function openCard(c) {
    const d = debtOf(c.id), t = turn[c.id] || zero();
    let priceRows = [el("div.sku", { text: "Загружаем цены…" })];
    const body = el("div", {}, [
      el("div.mini-nums", { style: { marginTop: 0 } }, [
        el("div.mini-num", {}, [el("div.l", { text: "Оборот" }), el("div.v", { text: curStr(t) })]),
        el("div.mini-num" + (hasDebt(d) ? ".warn" : ".good"), {}, [el("div.l", { text: "Долг" }), el("div.v", { text: curStr(d) })]),
      ]),
      c.contact ? el("div.sku", { style: { marginBottom: "10px" }, text: c.contact }) : null,
      el("div.mini-sec", { text: "Его последние цены" }),
      el("div", { id: "cl-prices" }, priceRows),
    ].filter(Boolean));

    modal({
      title: c.name, wide: true, body,
      actions: [
        { label: "Изменить", kind: "btn-outline", onClick: (close) => { close(); openEditClient(c); } },
        { label: "Внести оплату", kind: "btn-primary", onClick: (close) => { close(); openPayment(c); } },
      ],
    });

    // последние цены именно этого клиента — по ним он привык покупать
    try {
      const map = await ctx.db.lastPricesForCustomer(c.id);
      const holder = document.getElementById("cl-prices");
      if (!holder) return;
      holder.innerHTML = "";
      const rows = [...map.entries()].slice(0, 30);
      if (!rows.length) { holder.append(el("div.sku", { text: "Этот клиент ещё ничего не покупал" })); return; }
      const wrap = el("div.mini-list");
      rows.forEach(([pid, v]) => {
        const p = pmap[pid] || { name: "—" };
        wrap.append(el("div.mini-row", {}, [
          el("div.info", {}, [
            el("div.nm", { text: p.name }),
            el("div.sku", { text: new Date(v.date).toLocaleDateString("ru-RU") }),
          ]),
          el("div.qty", { text: v.price != null ? fmt(v.price, v.currency) : "—" }),
        ]));
      });
      holder.append(wrap);
    } catch {
      const holder = document.getElementById("cl-prices");
      if (holder) { holder.innerHTML = ""; holder.append(el("div.sku", { text: "Не удалось загрузить цены" })); }
    }
  }

  // ---------- список ----------
  function draw() {
    const q = search.value.trim().toLowerCase();
    const shown = customers
      .filter(c => !q || (c.name || "").toLowerCase().includes(q) || String(c.contact || "").includes(q))
      .slice()
      .sort((a, b) => {
        const da = hasDebt(debtOf(a.id)) ? 0 : 1, db2 = hasDebt(debtOf(b.id)) ? 0 : 1;
        return da - db2 || (a.name || "").localeCompare(b.name || "", "ru");   // должники сверху
      });
    list.innerHTML = "";
    if (!shown.length) { list.append(el("div.mini-empty", { text: "Никого не найдено" })); return; }
    shown.forEach(c => {
      const d = debtOf(c.id);
      const owes = hasDebt(d);
      list.append(el("div.mini-row" + (owes ? ".low" : ""), { onclick: () => openCard(c) }, [
        el("div.info", {}, [
          el("div.nm", { text: c.name }),
          el("div.sku", { text: c.contact || "—" }),
        ]),
        el("div.qty" + (owes ? ".low" : ""), { text: owes ? curStr(d) : "нет долга" }),
      ]));
    });
  }

  let t2 = 0;
  search.addEventListener("input", () => { clearTimeout(t2); t2 = setTimeout(draw, 180); });
  draw();
}
