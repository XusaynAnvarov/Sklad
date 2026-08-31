// Приход: что уже пришло и что ещё в дороге.
// Заводить новое поступление из Китая здесь нельзя — там курс, расходы и
// себестоимость, это делается за компьютером. С телефона нужно другое:
// увидеть, что едет, и отметить «пришло», когда коробки на месте.
// Приход из магазина живёт отдельным экраном — он для телефона и создан.
import { el, go } from "../app.js?v=20260831a";
import { icon } from "../../icons.js?v=20260831a";
import { toast, confirmDialog, modal } from "../../ui.js?v=20260831a";
import { fmt } from "../../fx.js?v=20260831a";
import { applyArrival } from "../../arrival.js?v=20260831a";
import { isShop, kindText } from "../../purchase.js?v=20260831a";

const дата = (d) => { const t = new Date(d); return isFinite(t) ? t.toLocaleDateString("ru-RU") : "—"; };
const сумма = (s) => (s.items || []).reduce((t, i) => t + (Number(i.qty) || 0) * (Number(i.unit_cost) || 0), 0);
const штук = (s) => (s.items || []).reduce((t, i) => t + (Number(i.qty) || 0), 0);

export default async function render(box, ctx) {
  const [purchases, products] = await Promise.all([ctx.db.purchases.list(), ctx.db.products.list()]);
  const pmap = Object.fromEntries(products.map(p => [p.id, p]));

  const all = purchases.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  const вДороге = all.filter(s => s.status !== "arrived");
  const пришло = all.filter(s => s.status === "arrived");

  let вкладка = вДороге.length ? "transit" : "arrived";

  // ---------- приход из магазина — крупной кнопкой ----------
  box.append(el("div.mini-acts", { style: { marginBottom: "14px" } }, [
    el("button.mini-act.wide", { onclick: () => go("arrival") }, [
      icon("truck", { size: 20 }),
      el("div", {}, [
        el("div", { text: "Принять из магазина" }),
        el("div.sub", { text: "товар куплен здесь и уже на руках" }),
      ]),
    ]),
  ]));

  // ---------- вкладки ----------
  const tabsBox = el("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "12px" } });
  const list = el("div.mini-list");
  box.append(tabsBox, list);

  function drawTabs() {
    tabsBox.innerHTML = "";
    [["transit", "В дороге", вДороге.length], ["arrived", "Пришло", пришло.length]].forEach(([id, label, n]) => {
      tabsBox.append(el("button.btn" + (вкладка === id ? ".btn-primary" : ".btn-outline"), {
        style: { justifyContent: "center", minHeight: "44px", fontSize: "15px" },
        text: label + " · " + n,
        onclick: () => { вкладка = id; drawTabs(); draw(); },
      }));
    });
  }

  function draw() {
    list.innerHTML = "";
    const rows = вкладка === "transit" ? вДороге : пришло;
    if (!rows.length) {
      list.append(el("div.mini-empty", { text: вкладка === "transit" ? "В дороге ничего нет" : "Приходов пока не было" }));
      return;
    }
    rows.forEach(s => {
      const едет = s.status !== "arrived";
      list.append(el("div.mini-row" + (едет ? ".low" : ""), { onclick: () => открыть(s) }, [
        el("div.info", {}, [
          el("div.nm", { text: (s.supplier || "—") + (isShop(s) ? " · магазин" : "") }),
          el("div.sku", { text: дата(s.date) + " · " + (s.items || []).length + " поз. · " + штук(s) + " шт" }),
        ]),
        el("div.qty" + (едет ? ".low" : ""), { text: fmt(сумма(s), s.currency || "yuan") }),
      ]));
    });
  }

  // ---------- карточка поступления ----------
  function открыть(s) {
    const едет = s.status !== "arrived";
    const строки = (s.items || []).map(it => {
      const p = pmap[it.product_id];
      return el("div.mini-row", {}, [
        el("div.info", {}, [
          el("div.nm", { text: p ? p.name : "товар удалён" }),
          el("div.sku", { text: "сейчас на складе: " + (p ? (Number(p.stock_qty) || 0) : "—") }),
        ]),
        el("div.qty", { text: "+" + (Number(it.qty) || 0) }),
      ]);
    });

    modal({
      title: (s.supplier || "—") + " · " + (едет ? "в дороге" : "пришло"),
      body: el("div", {}, [
        el("div.sku", { style: { marginBottom: "10px" },
          text: kindText(s.kind) + " · " + дата(s.date) + " · на " + fmt(сумма(s), s.currency || "yuan") }),
        строки.length ? el("div.mini-list", {}, строки) : el("div.mini-empty", { text: "Позиций нет" }),
        едет ? el("div.hint", { style: { marginTop: "10px" },
          text: "«Пришло» добавит эти количества на склад. Себестоимость останется по старым партиям — новая цена вступит в силу, когда старые разойдутся." }) : null,
      ].filter(Boolean)),
      actions: [
        { label: "Закрыть", kind: "btn-outline", onClick: c => c() },
        едет ? {
          label: "Пришло — на склад", kind: "btn-primary", onClick: (close) => {
            confirmDialog("Оприходовать «" + (s.supplier || "—") + "»? На склад добавится " + штук(s) + " шт.", async () => {
              try {
                await applyArrival(ctx.db, s, products);
                await ctx.db.purchases.upsert({ id: s.id, status: "arrived" });
                s.status = "arrived";
                вДороге.splice(вДороге.indexOf(s), 1);
                пришло.unshift(s);
                close(); drawTabs(); draw();
                toast("Оприходовано, остатки обновлены", "ok");
              } catch (e) { toast("Не удалось: " + (e.message || e), "err"); }
            });
          },
        } : null,
      ].filter(Boolean),
    });
  }

  drawTabs();
  draw();
}
