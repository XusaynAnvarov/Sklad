// ========================================================================
//  ПОЧИНКА СКЛАДА: находит оформленные накладные, товар которых НЕ списан
//  со склада, показывает предпросмотр (было → станет) и списывает выбранные.
//  Повторное списание невозможно: после проведения позиции помечаются applied.
// ========================================================================
import { el, toast, modal, confirmDialog, showLoader, hideLoader, input } from "../ui.js?v=20260809a";
import { icon } from "../icons.js?v=20260809a";
import { consumeFIFO, ensureBatches, sumQty, costAfter } from "../inventory.js?v=20260809a";

// накладная считается непроведённой, если хотя бы одна позиция без метки applied
export function isUnapplied(s) {
  if (!s || s.status !== "final") return false;
  const items = s.items || [];
  return items.length > 0 && items.some(it => it.applied !== true);
}

// все оформленные накладные без отметки списания (свежие — сверху)
export function unappliedSales(sales, days) {
  const since = days ? Date.now() - days * 864e5 : 0;
  return (sales || [])
    .filter(isUnapplied)
    .filter(s => !since || new Date(s.date).getTime() >= since)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

// Провести выбранные накладные: списать товар со склада (FIFO) и пометить позиции.
async function applySales(ctx, list, pmapById) {
  let okCount = 0; const problems = [];
  for (const s of list) {
    try {
      // берём карточки товаров свежими — иначе можно записать устаревший остаток
      const ids = [...new Set((s.items || []).map(i => i.product_id).filter(Boolean))];
      const fresh = {};
      await Promise.all(ids.map(async (id) => { try { const p = await ctx.db.products.get(id); if (p && p.id) fresh[id] = p; } catch {} }));

      const items = JSON.parse(JSON.stringify(s.items || []));
      const expected = {};
      for (const it of items) {
        if (it.applied === true) continue;                       // эта позиция уже списана
        const p = fresh[it.product_id] || pmapById[it.product_id];
        if (!p) { problems.push(`${new Date(s.date).toLocaleDateString("ru-RU")}: товар не найден`); continue; }
        const r = consumeFIFO(ensureBatches(p), it.qty);
        p.batches = r.batches;
        it.cogs_yuan = r.cogY; it.cogs_usd = r.cogU; it.applied = true;
        expected[p.id] = sumQty(p.batches);
      }
      // пишем товары
      await Promise.all(Object.keys(expected).map(async (pid) => {
        const p = fresh[pid] || pmapById[pid]; if (!p) return;
        const cc = costAfter(p.batches || [], p);
        const base = { id: pid, stock_qty: expected[pid], cost_yuan: cc.cost_yuan, cost_usd: cc.cost_usd };
        try { await ctx.db.products.upsert({ ...base, batches: p.batches }); }
        catch { await ctx.db.products.upsert(base); }
      }));
      // проверяем, что остаток реально записался
      for (const pid of Object.keys(expected)) {
        const now = await ctx.db.products.get(pid).catch(() => null);
        if (!now || Math.abs((Number(now.stock_qty) || 0) - expected[pid]) > 0.001) {
          problems.push((pmapById[pid]?.name || pid) + ": остаток не записался");
        }
      }
      // помечаем накладную проведённой
      await ctx.db.sales.upsert({ id: s.id, items });
      okCount++;
    } catch (e) {
      problems.push(`${new Date(s.date).toLocaleDateString("ru-RU")}: ${e.message || e}`);
    }
  }
  return { okCount, problems };
}

// Пометить накладные как проверенные (склад НЕ трогаем) — «эти правильные, больше не показывать»
async function markChecked(ctx, list) {
  let ok = 0; const problems = [];
  for (const s of list) {
    try {
      const items = (s.items || []).map(it => ({ ...it, applied: true }));
      await ctx.db.sales.upsert({ id: s.id, items });
      ok++;
    } catch (e) { problems.push(`${new Date(s.date).toLocaleDateString("ru-RU")}: ${e.message || e}`); }
  }
  return { ok, problems };
}

// Модалка: список непроведённых накладных с галочками и предпросмотром остатков
export function openStockFix(ctx, products, sales) {
  const pmapById = Object.fromEntries(products.map(p => [p.id, p]));
  let days = 7;
  const box = el("div");
  const checked = new Set();

  const fDays = input({ type: "number", value: days, style: { width: "90px" } });
  fDays.addEventListener("change", () => { days = Math.max(0, +fDays.value || 0); draw(); });

  const summary = el("div.hint");

  function draw() {
    const list = unappliedSales(sales, days);
    box.innerHTML = "";
    summary.textContent = list.length
      ? `Найдено накладных без списания: ${list.length}. Отметьте нужные и нажмите «Списать выбранные».`
      : "Непроведённых накладных нет 👍";
    if (!list.length) return;

    // сводка «сколько всего спишется» по товарам
    const totalByProduct = {};
    list.forEach(s => (s.items || []).forEach(it => {
      if (it.applied === true) return;
      totalByProduct[it.product_id] = (totalByProduct[it.product_id] || 0) + (Number(it.qty) || 0);
    }));

    list.forEach(s => {
      const cb = el("input", { type: "checkbox" });
      cb.checked = checked.has(s.id);
      cb.addEventListener("change", () => { cb.checked ? checked.add(s.id) : checked.delete(s.id); });
      const lines = (s.items || []).filter(it => it.applied !== true).map(it => {
        const p = pmapById[it.product_id];
        const was = Number(p?.stock_qty) || 0;
        const will = was - (Number(it.qty) || 0);
        return el("div", { style: { fontSize: "12px", color: "var(--muted)", marginTop: "2px" } }, [
          el("span", { text: `• ${p?.name || "?"} × ${it.qty}  ` }),
          el("span", { text: `${was} → ${will}`, style: { fontWeight: "700", color: will < 0 ? "var(--danger,#f87171)" : "var(--ok,#34d399)" } }),
        ]);
      });
      box.append(el("div.card", { style: { padding: "10px 12px", marginBottom: "8px" } }, [
        el("label", { style: { display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" } }, [
          cb,
          el("div", { style: { flex: "1" } }, [
            el("div", { style: { fontWeight: "700" }, text: new Date(s.date).toLocaleDateString("ru-RU") + " · " + ((s.items || []).length + " поз.") }),
            el("div", { style: { fontSize: "12px", color: "var(--muted)" }, text: "накладная " + String(s.id).slice(-6).toUpperCase() }),
          ]),
        ]),
        ...lines,
      ]));
    });
  }
  draw();

  const m = modal({
    title: "Накладные без списания со склада",
    wide: true,
    body: el("div", {}, [
      el("div.hint", { style: { borderColor: "rgba(245,158,11,.5)" }, text: "⚠ ВАЖНО: у накладных, оформленных ДО этого обновления, отметки о списании нет — они тоже попадают в список, хотя товар мог уже уйти со склада. Отмечайте только те, где остаток точно НЕ уменьшился (смотрите «было → станет»). После списания накладная помечается — повторно списать нельзя." }),
      el("div", { style: { display: "flex", gap: "10px", alignItems: "center", margin: "10px 0" } }, [
        el("span", { text: "За последние" }), fDays, el("span", { text: "дней (0 — все)" }),
        el("button.btn.btn-outline.btn-sm", { text: "Отметить все", style: { marginLeft: "auto" }, onclick: () => { unappliedSales(sales, days).forEach(s => checked.add(s.id)); draw(); } }),
      ]),
      summary,
      el("div", { style: { maxHeight: "55vh", overflow: "auto", marginTop: "8px" } }, [box]),
    ]),
    actions: [
      { label: "Закрыть", kind: "btn-outline", onClick: c => c() },
      { label: "✓ Я проверил — остальные правильные", kind: "btn-outline", onClick: (close) => {
        // помечаем ВСЕ показанные накладные как проверенные, склад не трогаем:
        // они уйдут с дашборда, а новые проблемные появятся снова.
        const list = unappliedSales(sales, days);
        if (!list.length) { toast("Список пуст", "err"); return; }
        confirmDialog(`Пометить ${list.length} накладных как проверенные? Остатки НЕ изменятся, предупреждение с дашборда уйдёт.`, async () => {
          showLoader("Отмечаем…");
          try {
            const { ok, problems } = await markChecked(ctx, list);
            toast(`Отмечено: ${ok}` + (problems.length ? `, ошибок: ${problems.length}` : ""), problems.length ? "err" : "ok");
            close(); ctx.refresh();
          } catch (e) { toast("Ошибка: " + (e.message || e), "err"); }
          finally { hideLoader(); }
        });
      } },
      { label: "✅ Списать выбранные", kind: "btn-primary", onClick: (close) => {
        const list = unappliedSales(sales, days).filter(s => checked.has(s.id));
        if (!list.length) { toast("Отметьте накладные", "err"); return; }
        confirmDialog(`Списать товар со склада по ${list.length} накладным? Действие изменит остатки.`, async () => {
          showLoader("Списываем…");
          try {
            const { okCount, problems } = await applySales(ctx, list, pmapById);
            toast(`Проведено накладных: ${okCount}` + (problems.length ? `, проблем: ${problems.length}` : ""), problems.length ? "err" : "ok");
            if (problems.length) modal({ title: "Не удалось полностью", body: el("div", {}, problems.slice(0, 20).map(t => el("div", { text: "• " + t, style: { fontSize: "13px", padding: "3px 0" } }))), actions: [{ label: "Понятно", kind: "btn-primary", onClick: c => c() }] });
            close(); ctx.refresh();
          } catch (e) { toast("Ошибка: " + (e.message || e), "err"); }
          finally { hideLoader(); }
        });
      } },
    ],
  });
  return m;
}
