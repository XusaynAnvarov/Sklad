// ========================================================================
//  ВАЛЮТЫ И КУРСЫ
//  Три валюты: yuan (¥), usd ($), som (сум).
//  Курсы хранятся в settings относительно доллара:
//    rate_yuan_usd — сколько $ в одном юане
//    rate_som_usd  — сколько $ в одном суме
// ========================================================================

// Порядок важен: по нему строятся выпадающие списки валют в накладных
// (js/pages/sales.js). Сум первым — им торгуют каждый день, юань вторым —
// им закупаются, доллар последним: он нужен реже всех.
export const CUR = {
  som:  { code: "som",  sign: "сум", label: "Сум" },
  yuan: { code: "yuan", sign: "¥", label: "Юань" },
  usd:  { code: "usd",  sign: "$", label: "Доллар" },
};

let rates = { yuan_usd: 0.14, som_usd: 0.000079 };

export function setRates(settings) {
  if (!settings) return;
  rates = {
    yuan_usd: Number(settings.rate_yuan_usd) || rates.yuan_usd,
    som_usd: Number(settings.rate_som_usd) || rates.som_usd,
  };
}
export function getRates() { return { ...rates }; }

// перевод любой суммы в доллары
export function toUSD(amount, currency) {
  amount = Number(amount) || 0;
  if (currency === "usd") return amount;
  if (currency === "yuan") return amount * rates.yuan_usd;
  if (currency === "som") return amount * rates.som_usd;
  return amount;
}

// перевод из долларов в нужную валюту
export function fromUSD(usd, currency) {
  usd = Number(usd) || 0;
  if (currency === "usd") return usd;
  if (currency === "yuan") return usd / rates.yuan_usd;
  if (currency === "som") return usd / rates.som_usd;
  return usd;
}

// конвертация между любыми двумя валютами
export function convert(amount, from, to) {
  if (from === to) return Number(amount) || 0;
  return fromUSD(toUSD(amount, from), to);
}

// суммы позиций по валютам: {som,usd,yuan}
export function sumByCur(items) {
  const o = { som: 0, usd: 0, yuan: 0 };
  (items || []).forEach(it => { const c = it.currency || "som"; if (o[c] !== undefined) o[c] += (Number(it.qty) || 0) * (Number(it.unit_price) || 0); });
  return o;
}
// строка сумм по валютам: "500 000 сум + $40"
export function curStr(o) {
  const a = [];
  ["som", "yuan", "usd"].forEach(c => { if (Math.abs(o[c] || 0) >= (c === "som" ? 1 : 0.01)) a.push(fmt(o[c], c)); });
  return a.length ? a.join(" + ") : "0";
}

// форматирование суммы с разделителями и знаком валюты
export function fmt(amount, currency) {
  const n = Number(amount) || 0;
  const c = CUR[currency] || { sign: "" };
  const digits = currency === "som" ? 0 : (Math.abs(n) >= 1000 ? 0 : 2);
  const s = n.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: digits });
  return currency === "som" ? `${s} ${c.sign}` : `${c.sign}${s}`;
}

// автоподтягивание курсов из интернета (без ключа)
export async function fetchLiveRates() {
  const r = await fetch("https://open.er-api.com/v6/latest/USD");
  if (!r.ok) throw new Error("Не удалось получить курсы");
  const j = await r.json();
  const cny = j?.rates?.CNY; // сколько юаней за $1
  const uzs = j?.rates?.UZS; // сколько сумов за $1
  if (!cny || !uzs) throw new Error("Нет данных по валютам");
  return {
    rate_yuan_usd: 1 / cny,
    rate_som_usd: 1 / uzs,
    rates_updated_at: new Date().toISOString(),
  };
}
