// ========================================================================
//  СБОРКА И ОТПРАВКА — расчёты без DOM (их проверяет
//  _tools/tests/t-fulfillment.mjs).
//
//  Источник правды об этапе — сервер (таблица order_fulfillment). Здесь мы
//  лишь собираем то, что показать: какая накладная в каком разделе, сколько
//  в ней товаров и на какую сумму, и история событий.
// ========================================================================

export const ЭТАПЫ = ["placed", "packed", "shipped"];

export const ЭТАП = {
  placed:  { label: "Оформлен, не собран",            short: "Ожидают сборки",            step: "Оформлен", ic: "clipboard", tone: "amber" },
  packed:  { label: "Оформлен, собран, не отправлен", short: "Собраны, ожидают отправки", step: "Собран",   ic: "package",   tone: "blue" },
  shipped: { label: "Оформлен, собран и отправлен",   short: "Отправлены",                step: "Отправлен", ic: "truck",    tone: "green" },
};

// Следующее действие на каждом этапе.
export const ДАЛЬШЕ = {
  placed: { action: "pack", label: "Подтвердить сборку" },
  packed: { action: "ship", label: "Подтвердить отправку" },
  shipped: null,
};

export const номерЗаказа = (id) => String(id || "").replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase();

// Та же граница, что на сервере (api/lib/fulfillment.js, вУчёте).
export function вУчёте(sale, since, есть) {
  if (!sale || sale.status !== "final" || sale.source === "refund") return false;
  if (есть) return true;
  if (!since) return false;
  const t = new Date(since).getTime();
  return new Date(sale.created_at || 0).getTime() >= t || new Date(sale.date || 0).getTime() >= t;
}

// Итог накладной по валютам. Оплата (paid) не учитывается и не меняется.
export function итогНакладной(sale) {
  const totals = { som: 0, usd: 0, yuan: 0 };
  let штук = 0;
  for (const it of sale?.items || []) {
    const q = Number(it.qty) || 0;
    штук += q;
    const c = it.currency || sale.currency || "som";
    if (totals[c] !== undefined) totals[c] += q * (Number(it.unit_price) || 0);
  }
  return { totals, штук, позиций: (sale?.items || []).length };
}

// Собрать карточки для доски.
//   sales     — список накладных склада
//   state     — ответ GET /api/admin/fulfillment { since, rows, log }
//   customers — для имени клиента
export function собратьЗаказы(sales, state, customers = []) {
  const rows = new Map((state?.rows || []).map(r => [String(r.sale_id), r]));
  const logs = new Map();
  for (const l of state?.log || []) {
    const k = String(l.sale_id);
    if (!logs.has(k)) logs.set(k, []);
    logs.get(k).push(l);
  }
  for (const arr of logs.values()) arr.sort((a, b) => Number(a.id) - Number(b.id));
  const cmap = new Map(customers.map(c => [String(c.id), c]));

  const out = [];
  for (const s of sales || []) {
    const row = rows.get(String(s.id));
    if (!вУчёте(s, state?.since, !!row)) continue;
    const c = s.customer_id ? cmap.get(String(s.customer_id)) : null;
    const { totals, штук, позиций } = итогНакладной(s);
    out.push({
      id: s.id,
      номер: номерЗаказа(s.id),
      sale: s,
      клиент: c?.name || s.order_from?.name || "Без клиента",
      телефон: c?.contact || s.order_from?.phone || "",
      customer_id: s.customer_id || "",
      дата: s.date || s.created_at,
      stage: row?.stage || "placed",
      version: row?.version || 0,
      row: row || null,
      log: logs.get(String(s.id)) || [],
      totals, штук, позиций,
    });
  }
  // Внутри раздела: ждущие — старые сверху (их собирать первыми),
  // отправленные — свежие сверху.
  out.sort((a, b) => {
    if (a.stage !== b.stage) return ЭТАПЫ.indexOf(a.stage) - ЭТАПЫ.indexOf(b.stage);
    const ta = new Date(a.stage === "shipped" ? a.row?.shipped_at || a.дата : a.дата).getTime();
    const tb = new Date(b.stage === "shipped" ? b.row?.shipped_at || b.дата : b.дата).getTime();
    return a.stage === "shipped" ? tb - ta : ta - tb;
  });
  return out;
}

export function счётчики(заказы) {
  const n = { placed: 0, packed: 0, shipped: 0 };
  for (const z of заказы) n[z.stage]++;
  return n;
}

// Фильтры экрана: текст (номер, клиент, телефон, товар, трек), этап,
// период по дате оформления, клиент.
export function отфильтровать(заказы, ф = {}, имяТовара = () => "") {
  const q = String(ф.q || "").trim().toLowerCase().replace(/^№\s*/, "");
  const от = ф.from ? new Date(ф.from + "T00:00:00").getTime() : null;
  const до = ф.to ? new Date(ф.to + "T23:59:59.999").getTime() : null;
  return заказы.filter(z => {
    if (ф.stage && ф.stage !== "all" && z.stage !== ф.stage) return false;
    if (ф.customer && String(z.customer_id) !== String(ф.customer)) return false;
    const t = new Date(z.дата).getTime();
    if (от != null && t < от) return false;
    if (до != null && t > до) return false;
    if (!q) return true;
    const стог = [
      z.номер, z.клиент, z.телефон, z.row?.tracking, z.row?.carrier,
      ...(z.sale.items || []).map(it => имяТовара(it.product_id)),
    ].filter(Boolean).join(" ").toLowerCase();
    return стог.includes(q);
  });
}

// История для вертикальной шкалы: оформление + записи журнала.
const НАЗВАНИЕ = {
  track: "Взят в учёт сборки",
  pack: "Сборка подтверждена",
  ship: "Отправка подтверждена",
  correct: "Исправление статуса",
};
export function история(z) {
  const события = [{ kind: "placed", title: "Заказ оформлен", at: z.дата, text: "Накладная выписана, товар списан со склада" }];
  for (const l of z.log) {
    const e = { kind: l.action, title: НАЗВАНИЕ[l.action] || l.action, at: l.at, who: l.actor, id: l.id };
    if (l.action === "correct") {
      e.text = `${ЭТАП[l.from_stage]?.step || l.from_stage} → ${ЭТАП[l.to_stage]?.step || l.to_stage}`;
      e.reason = l.reason || "";
    }
    if (l.action === "ship") e.text = [l.carrier, l.tracking ? "№ " + l.tracking : "", l.comment].filter(Boolean).join(" · ");
    события.push(e);
  }
  return события;
}

// Пункты шкалы Оформлен → Собран → Отправлен: done / current / todo.
export function шкала(stage) {
  const i = ЭТАПЫ.indexOf(stage);
  return ЭТАПЫ.map((s, k) => ({ stage: s, state: k < i ? "done" : k === i ? "current" : "todo" }));
}
