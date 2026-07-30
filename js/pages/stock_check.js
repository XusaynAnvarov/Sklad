// ========================================================================
//  ПРОВЕРКА СКЛАДА — одно место, где видно все расхождения по остаткам
//  и где их можно исправить в один клик.
//  A. Накладные оформлены, но товар не списан
//  B. Остаток не сходится с партиями
//  C. Товары в минусе (+ быстрый ввод прихода)
//  D. Заказы не оформлены (склад ещё не трогали — это норма)
// ========================================================================
import { el, toast, input, confirmDialog, showLoader, hideLoader } from "../ui.js";
import { icon } from "../icons.js";
import { ensureBatches, sumQty, costAfter, returnToStock, currentCost } from "../inventory.js";
import { placeholder } from "./products.js";
import { openStockFix, unappliedSales } from "./stock_fix.js";

export default async function render(page, ctx) {
  const [products, sales] = await Promise.all([ctx.db.products.list(), ctx.db.sales.list()]);

  page.append(el("div.topbar", {}, [
    el("div", {}, [
      el("h1", { text: "Проверка склада" }),
      el("div.sub", { text: "Здесь видно всё, что могло разойтись с остатками, и как это исправить" }),
    ]),
    el("button.btn.btn-outline", { onclick: () => ctx.refresh() }, [icon("refresh", { size: 16 }), "Обновить"]),
  ]));

  // --- считаем проблемы ---
  const unapplied = unappliedSales(sales, 0);                       // без ограничения по датам
  const mismatch = products.filter(p => sumQty(ensureBatches(p)) !== (Number(p.stock_qty) || 0));
  const negative = products.filter(p => (Number(p.stock_qty) || 0) < 0)
    .sort((a, b) => (Number(a.stock_qty) || 0) - (Number(b.stock_qty) || 0));
  const pending = sales.filter(s => ["order", "pending_confirm", "confirmed"].includes(s.status));

  const allGood = !unapplied.length && !mismatch.length && !negative.length;
  if (allGood) {
    page.append(el("div.card", { style: { padding: "18px", marginBottom: "16px", borderColor: "rgba(52,211,153,.4)", background: "rgba(52,211,153,.06)" } }, [
      el("div", { style: { display: "flex", alignItems: "center", gap: "10px" } }, [
        el("span", { style: { color: "var(--ok)", display: "flex" } }, [icon("check", { size: 22 })]),
        el("div", {}, [
          el("div", { style: { fontWeight: "700" }, text: "Со складом всё в порядке" }),
          el("div.muted", { style: { fontSize: "13px" }, text: "Расхождений не найдено: накладные списаны, остатки сходятся с партиями, минусов нет." }),
        ]),
      ]),
    ]));
  }

  // ---------- A. Накладные без списания ----------
  block(page, {
    ic: "receipt", danger: unapplied.length > 0,
    title: `Накладные без списания со склада: ${unapplied.length}`,
    text: "Накладная оформлена, но товар с остатка не ушёл. Проверьте «было → станет» и спишите нужные.",
    actions: unapplied.length ? [
      { label: "Проверить и списать", kind: "btn-primary", onClick: () => openStockFix(ctx, products, sales) },
    ] : [],
  });

  // ---------- B. Остаток ≠ партии ----------
  block(page, {
    ic: "box", danger: mismatch.length > 0,
    title: `Остаток не сходится с партиями: ${mismatch.length}`,
    text: "Так бывает после ручных правок. Пересчёт приведёт остаток к сумме партий (минус сохраняется).",
    list: mismatch.slice(0, 50).map(p => ({
      p, right: `${Number(p.stock_qty) || 0} → ${sumQty(ensureBatches(p))}`,
    })),
    actions: mismatch.length ? [
      { label: "Пересчитать по партиям", kind: "btn-primary", onClick: () => confirmDialog(`Пересчитать остаток у ${mismatch.length} товаров?`, async () => {
        showLoader("Пересчитываем…");
        try {
          for (const p of mismatch) {
            const b = ensureBatches(p), q = sumQty(b), cc = costAfter(b, p);
            const base = { id: p.id, stock_qty: q, cost_yuan: cc.cost_yuan, cost_usd: cc.cost_usd };
            try { await ctx.db.products.upsert({ ...base, batches: b }); } catch { await ctx.db.products.upsert(base); }
          }
          toast("Остатки пересчитаны", "ok"); ctx.refresh();
        } catch (e) { toast("Ошибка: " + (e.message || e), "err"); }
        finally { hideLoader(); }
      }) },
    ] : [],
  });

  // ---------- C. Минус: быстрый приход ----------
  const negBox = el("div");
  if (negative.length) {
    negative.forEach(p => {
      const need = Math.abs(Number(p.stock_qty) || 0);
      const inp = input({ type: "number", min: "1", placeholder: "сколько пришло", style: { width: "150px" } });
      const btn = el("button.btn.btn-ok.btn-sm", { text: "Добавить" });
      btn.addEventListener("click", async () => {
        const add = +inp.value || 0;
        if (add <= 0) { toast("Укажите количество", "err"); return; }
        showLoader("Сохраняем…");
        try {
          const fresh = await ctx.db.products.get(p.id).catch(() => p) || p;
          const cc0 = currentCost(ensureBatches(fresh));
          const batches = returnToStock(ensureBatches(fresh), add,
            cc0.cost_yuan || Number(fresh.cost_yuan) || 0, cc0.cost_usd || Number(fresh.cost_usd) || 0);
          const q = sumQty(batches), cc = costAfter(batches, fresh);
          const base = { id: p.id, stock_qty: q, cost_yuan: cc.cost_yuan, cost_usd: cc.cost_usd };
          try { await ctx.db.products.upsert({ ...base, batches }); } catch { await ctx.db.products.upsert(base); }
          toast(`${p.name}: остаток ${q}`, "ok"); ctx.refresh();
        } catch (e) { toast("Ошибка: " + (e.message || e), "err"); }
        finally { hideLoader(); }
      });
      negBox.append(el("div.card", { style: { padding: "10px 12px", marginBottom: "8px", display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" } }, [
        el("img.thumb", { src: p.photo_url || placeholder(p.name), style: { width: "40px", height: "40px" }, onerror: function () { this.src = placeholder(p.name); } }),
        el("div", { style: { flex: "1", minWidth: "140px" } }, [
          el("div", { style: { fontWeight: "600" }, text: p.name }),
          el("div", { style: { fontSize: "12px", color: "var(--danger,#f87171)", fontWeight: "700" }, text: "не хватает: " + need }),
        ]),
        inp, btn,
      ]));
    });
  }
  block(page, {
    ic: "alert", danger: negative.length > 0,
    title: `Товары в минусе: ${negative.length}`,
    text: "Продали больше, чем было. Впишите, сколько привезли — минус погасится (можно и в карточке товара, поле «Пришло на склад»).",
    body: negative.length ? negBox : null,
  });

  // ---------- D. Заказы не оформлены ----------
  block(page, {
    ic: "cart", danger: false,
    title: `Заказы не оформлены: ${pending.length}`,
    text: "Это норма: товар по заказу ещё не отгружён, поэтому со склада не списан. Списание произойдёт при оформлении накладной.",
    actions: pending.length ? [{ label: "Перейти в «Заказы»", kind: "btn-outline", onClick: () => ctx.navigate("orders") }] : [],
  });
}

// карточка-блок проверки
function block(page, { ic, title, text, danger, actions = [], list = [], body = null }) {
  const card = el("div.card", {
    style: {
      marginBottom: "14px",
      borderColor: danger ? "rgba(245,158,11,.5)" : "var(--border)",
      background: danger ? "rgba(245,158,11,.06)" : "var(--card)",
    },
  }, [
    el("div", { style: { display: "flex", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" } }, [
      el("span", { style: { color: danger ? "var(--warn)" : "var(--muted)", display: "flex", marginTop: "2px" } }, [icon(ic, { size: 22 })]),
      el("div", { style: { flex: "1", minWidth: "200px" } }, [
        el("div", { style: { fontWeight: "700", fontSize: "15px" }, text: title }),
        el("div.muted", { style: { fontSize: "13px", marginTop: "2px" }, text }),
      ]),
      ...(actions.length ? [el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } },
        actions.map(a => el("button." + (a.kind || "btn-outline") + ".btn", { text: a.label, onclick: a.onClick })))] : []),
    ]),
  ]);
  if (list.length) {
    const box = el("div", { style: { marginTop: "10px", maxHeight: "260px", overflow: "auto" } });
    list.forEach(({ p, right }) => box.append(el("div", { style: { display: "flex", gap: "10px", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: "13px" } }, [
      el("span", { style: { flex: "1", minWidth: "0" }, text: p.name }),
      el("strong", { text: right }),
    ])));
    card.append(box);
  }
  if (body) card.append(el("div", { style: { marginTop: "10px" } }, [body]));
  page.append(card);
}
