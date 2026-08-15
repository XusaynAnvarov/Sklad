// ========================================================================
//  ТИП ПРИХОДА — от поставщика или из другого магазина.
//  Магазин (например «Сирож Акам») даёт товар, а цена берётся НАША,
//  складская — поэтому себестоимость и прибыль не искажаются.
//  Хранится в purchases.kind. У старых приходов колонки нет — считаем
//  их приходом от поставщика, как было раньше.
// ========================================================================

export const KIND_SUPPLIER = "supplier";
export const KIND_SHOP = "shop";

export const KINDS = [
  { value: KIND_SUPPLIER, label: "От поставщика", icon: "🚚", who: "Поставщик" },
  { value: KIND_SHOP, label: "Из магазина", icon: "🏪", who: "Магазин" },
];

const BY_VALUE = Object.fromEntries(KINDS.map(k => [k.value, k]));

// Тип прихода. Пусто/неизвестное → поставщик (так было до появления колонки).
export function purchaseKind(p) {
  const v = String((p && p.kind) || "").trim();
  return BY_VALUE[v] ? v : KIND_SUPPLIER;
}
export const isShop = (p) => purchaseKind(p) === KIND_SHOP;

export function kindLabel(v) { return (BY_VALUE[String(v || "").trim()] || BY_VALUE[KIND_SUPPLIER]).label; }
export function kindText(v) { const k = BY_VALUE[String(v || "").trim()] || BY_VALUE[KIND_SUPPLIER]; return `${k.icon} ${k.label}`; }
// Как подписать поле с названием: «Поставщик» или «Магазин»
export function kindWho(v) { return (BY_VALUE[String(v || "").trim()] || BY_VALUE[KIND_SUPPLIER]).who; }
export function kindOptions() { return KINDS.map(k => ({ value: k.value, label: `${k.icon} ${k.label}` })); }
