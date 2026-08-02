// ========================================================================
//  ДИАГРАММЫ — чистый SVG, без внешних библиотек.
//  Библиотеки с CDN брать нельзя: склад работает офлайн через Service Worker.
//  Каждая функция возвращает строку SVG/HTML — вставляется через innerHTML,
//  поэтому ВСЕ подписи проходят через esc() (названия товаров вводит владелец).
// ========================================================================

// экранирование текста для вставки в SVG/HTML
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
const uid = (p) => p + Math.random().toString(36).slice(2, 8);

// палитра под чёрно-золотую тему
export const C_REV = "#d9b45a";     // оборот — золото
export const C_PROFIT = "#34d399";  // прибыль — зелёный
export const C_LOSS = "#f87171";    // убыток — красный
export const C_GRID = "rgba(255,255,255,.10)";
export const C_TEXT = "rgba(255,255,255,.62)";
export const PALETTE = ["#d9b45a", "#34d399", "#60a5fa", "#f472b6", "#a78bfa", "#fbbf24", "#22d3ee", "#fb923c", "#94a3b8", "#4ade80"];

// «$1 234» / «$1.2K» — короткая подпись денег на осях
export function money(n) {
  const v = Math.round(Number(n) || 0);
  const a = Math.abs(v);
  if (a >= 1000000) return "$" + (v / 1000000).toFixed(1).replace(".0", "") + "M";
  if (a >= 1000) return "$" + (v / 1000).toFixed(1).replace(".0", "") + "K";
  return "$" + v;
}
const full = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("ru-RU");

// «нет данных» — общая заглушка вместо пустой диаграммы
export function noData(text = "Нет данных за период") {
  return `<div class="chart-empty">${esc(text)}</div>`;
}

// ========================================================================
//  Мини-график (спарклайн): SVG-линия + градиентная заливка под ней.
// ========================================================================
export function sparkline(values, opts = {}) {
  const w = opts.width || 240, h = opts.height || 56, pad = 4;
  const color = opts.color || "#a78bfa";
  const vals = (values && values.length ? values : [0, 0]).map(v => Number(v) || 0);
  const max = Math.max(...vals), min = Math.min(...vals);
  const span = max - min || 1;
  const n = vals.length;
  const x = i => pad + (i * (w - pad * 2)) / Math.max(1, n - 1);
  const y = v => h - pad - ((v - min) / span) * (h - pad * 2);
  const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${pad.toFixed(1)},${(h - pad).toFixed(1)} ${pts} ${(w - pad).toFixed(1)},${(h - pad).toFixed(1)}`;
  const id = uid("sg");
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" width="100%" height="${h}" style="display:block">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    <polygon points="${area}" fill="url(#${id})"/>
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

// ========================================================================
//  Столбики по месяцам: две серии рядом (оборот + прибыль).
//  rows: [{ label, key, a, b }]  a = оборот, b = прибыль
//  Клик по столбику → элемент с data-key (обработчик вешает вызывающий код).
// ========================================================================
export function barChart(rows, opts = {}) {
  const list = (rows || []).filter(Boolean);
  if (!list.length) return noData();
  const h = opts.height || 240;
  const padL = 46, padR = 10, padT = 14, padB = 30;
  const group = opts.slotWidth || 54;                       // ширина «месяца»
  const w = Math.max(opts.minWidth || 320, padL + padR + group * list.length);
  const nameA = opts.nameA || "Оборот", nameB = opts.nameB || "Прибыль";
  const colA = opts.colorA || C_REV, colB = opts.colorB || C_PROFIT;

  const maxV = Math.max(1, ...list.map(r => Math.max(Number(r.a) || 0, Number(r.b) || 0)));
  // «круглый» потолок оси, чтобы подписи были читаемыми
  const step = Math.pow(10, Math.floor(Math.log10(maxV)));
  const top = Math.ceil(maxV / step) * step || 1;
  const plotH = h - padT - padB;
  const yOf = v => padT + plotH - (Math.max(0, Number(v) || 0) / top) * plotH;

  let grid = "", ticks = "";
  for (let i = 0; i <= 4; i++) {
    const v = (top / 4) * i, y = yOf(v);
    grid += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${w - padR}" y2="${y.toFixed(1)}" stroke="${C_GRID}" stroke-width="1"/>`;
    ticks += `<text x="${padL - 6}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="10" fill="${C_TEXT}">${money(v)}</text>`;
  }

  const bw = Math.max(6, (group - 14) / 2);
  let bars = "";
  list.forEach((r, i) => {
    const cx = padL + group * i + group / 2;
    const xa = cx - bw - 2, xb = cx + 2;
    const ya = yOf(r.a), yb = yOf(r.b);
    const negB = (Number(r.b) || 0) < 0;
    bars += `<g class="bar-g" data-key="${esc(r.key || r.label)}">
      <rect x="${xa.toFixed(1)}" y="${ya.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, padT + plotH - ya).toFixed(1)}" rx="3" fill="${colA}"><title>${esc(r.label)} · ${nameA}: ${full(r.a)}</title></rect>
      <rect x="${xb.toFixed(1)}" y="${yb.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, padT + plotH - yb).toFixed(1)}" rx="3" fill="${negB ? C_LOSS : colB}"><title>${esc(r.label)} · ${nameB}: ${full(r.b)}</title></rect>
      <rect x="${(cx - group / 2).toFixed(1)}" y="${padT}" width="${group}" height="${plotH}" fill="transparent" style="cursor:pointer"><title>${esc(r.label)}
${nameA}: ${full(r.a)}
${nameB}: ${full(r.b)}</title></rect>
    </g>`;
  });

  let labels = "";
  const every = list.length > 14 ? 2 : 1;   // на узком экране подписываем через одну
  list.forEach((r, i) => {
    if (i % every !== 0) return;
    const cx = padL + group * i + group / 2;
    labels += `<text x="${cx.toFixed(1)}" y="${h - 10}" text-anchor="middle" font-size="10" fill="${C_TEXT}">${esc(r.label)}</text>`;
  });

  return `<div class="chart-scroll"><svg class="chart" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img">
    ${grid}${ticks}${bars}${labels}
  </svg></div>
  <div class="chart-legend"><span><i style="background:${colA}"></i>${esc(nameA)}</span><span><i style="background:${colB}"></i>${esc(nameB)}</span></div>`;
}

// ========================================================================
//  Кольцевая диаграмма: доли (категории товаров) + легенда.
//  parts: [{ label, value }]
// ========================================================================
export function donutChart(parts, opts = {}) {
  const all = (parts || []).map(p => ({ label: p.label, value: Math.max(0, Number(p.value) || 0) })).filter(p => p.value > 0);
  if (!all.length) return noData();
  all.sort((a, b) => b.value - a.value);
  const maxSlices = opts.max || 8;
  let list = all;
  if (all.length > maxSlices) {
    const head = all.slice(0, maxSlices - 1);
    const rest = all.slice(maxSlices - 1).reduce((t, p) => t + p.value, 0);
    list = [...head, { label: "Прочее", value: rest }];
  }
  const total = list.reduce((t, p) => t + p.value, 0) || 1;

  const size = opts.size || 190, R = size / 2 - 6, r = R * 0.58, cx = size / 2, cy = size / 2;
  let a0 = -Math.PI / 2, slices = "";
  list.forEach((p, i) => {
    const frac = p.value / total;
    const a1 = a0 + frac * Math.PI * 2;
    const color = PALETTE[i % PALETTE.length];
    const big = frac > 0.5 ? 1 : 0;
    const pt = (ang, rad) => `${(cx + Math.cos(ang) * rad).toFixed(2)},${(cy + Math.sin(ang) * rad).toFixed(2)}`;
    // почти полный круг рисуем кольцом, иначе дуга схлопывается
    const d = frac >= 0.999
      ? `M ${cx - R},${cy} a ${R},${R} 0 1,0 ${R * 2},0 a ${R},${R} 0 1,0 ${-R * 2},0 M ${cx - r},${cy} a ${r},${r} 0 1,1 ${r * 2},0 a ${r},${r} 0 1,1 ${-r * 2},0`
      : `M ${pt(a0, R)} A ${R},${R} 0 ${big},1 ${pt(a1, R)} L ${pt(a1, r)} A ${r},${r} 0 ${big},0 ${pt(a0, r)} Z`;
    slices += `<path d="${d}" fill="${color}" fill-rule="evenodd" class="donut-slice"><title>${esc(p.label)}: ${full(p.value)} (${(frac * 100).toFixed(1)}%)</title></path>`;
    a0 = a1;
  });

  const center = opts.centerLabel
    ? `<text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="15" font-weight="700" fill="rgba(255,255,255,.92)">${esc(opts.centerValue || money(total))}</text>
       <text x="${cx}" y="${cy + 15}" text-anchor="middle" font-size="10" fill="${C_TEXT}">${esc(opts.centerLabel)}</text>`
    : "";

  const legend = list.map((p, i) => `<span><i style="background:${PALETTE[i % PALETTE.length]}"></i>${esc(p.label)} <b>${((p.value / total) * 100).toFixed(1)}%</b> <em>${full(p.value)}</em></span>`).join("");
  return `<div class="donut-wrap">
    <svg class="chart" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img">${slices}${center}</svg>
    <div class="chart-legend col">${legend}</div>
  </div>`;
}

// ========================================================================
//  Горизонтальные полосы: топ товаров / клиентов.
//  rows: [{ label, value, sub }]
// ========================================================================
export function hBars(rows, opts = {}) {
  const list = (rows || []).filter(r => r && isFinite(Number(r.value)));
  if (!list.length) return noData();
  const max = Math.max(1, ...list.map(r => Math.abs(Number(r.value) || 0)));
  const color = opts.color || C_REV;
  return `<div class="hbars">` + list.map((r, i) => {
    const v = Number(r.value) || 0;
    const pctW = (Math.abs(v) / max) * 100;
    const c = v < 0 ? C_LOSS : color;
    return `<div class="hbar" data-key="${esc(r.key != null ? r.key : r.label)}" title="${esc(r.label)}: ${full(v)}">
      <div class="hbar-name"><span class="hbar-n">${i + 1}</span>${esc(r.label)}</div>
      <div class="hbar-track"><div class="hbar-fill" style="width:${pctW.toFixed(1)}%;background:${c}"></div></div>
      <div class="hbar-val" style="color:${c}">${full(v)}${r.sub ? `<em>${esc(r.sub)}</em>` : ""}</div>
    </div>`;
  }).join("") + `</div>`;
}

// ========================================================================
//  Сезонная диаграмма: 4 сезона столбиками (оборот + прибыль).
//  bySeason: { winter:{rev,profit}, spring:{...}, summer:{...}, autumn:{...} }
// ========================================================================
export function seasonChart(bySeason, opts = {}) {
  const S = [["winter", "❄ Зима", "#60a5fa"], ["spring", "🌱 Весна", "#4ade80"], ["summer", "☀ Лето", "#fbbf24"], ["autumn", "🍂 Осень", "#fb923c"]];
  const data = S.map(([k, label, col]) => ({ k, label, col, rev: Number(bySeason?.[k]?.rev) || 0, profit: Number(bySeason?.[k]?.profit) || 0 }));
  if (!data.some(d => d.rev > 0)) return noData("Продаж за период нет");
  const max = Math.max(1, ...data.map(d => d.rev));
  const best = data.reduce((a, b) => (b.rev > a.rev ? b : a), data[0]);
  return `<div class="season-grid">` + data.map(d => {
    const hPct = (d.rev / max) * 100;
    const isBest = d.k === best.k && d.rev > 0;
    return `<div class="season-col${isBest ? " best" : ""}" data-key="${esc(d.k)}" title="${esc(d.label)} · оборот ${full(d.rev)} · прибыль ${full(d.profit)}">
      <div class="season-bar-box"><div class="season-bar" style="height:${Math.max(3, hPct).toFixed(1)}%;background:${d.col}"></div></div>
      <div class="season-lbl">${esc(d.label)}</div>
      <div class="season-val">${money(d.rev)}</div>
      <div class="season-sub">приб. ${money(d.profit)}</div>
    </div>`;
  }).join("") + `</div>` + (opts.hint === false ? "" : `<div class="chart-hint">Самый сильный сезон: <b>${esc(best.label)}</b> — ${full(best.rev)}</div>`);
}

// ========================================================================
//  Мини-полоска сезонов для строки товара: 4 доли одной линией.
//  shares: { winter, spring, summer, autumn } — доли 0..1
// ========================================================================
export function miniSeason(shares) {
  const S = [["winter", "#60a5fa", "Зима"], ["spring", "#4ade80", "Весна"], ["summer", "#fbbf24", "Лето"], ["autumn", "#fb923c", "Осень"]];
  const sum = S.reduce((t, [k]) => t + (Number(shares?.[k]) || 0), 0) || 1;
  return `<div class="mini-season">` + S.map(([k, col, lbl]) => {
    const v = (Number(shares?.[k]) || 0) / sum;
    if (v <= 0) return "";
    return `<i style="width:${(v * 100).toFixed(1)}%;background:${col}" title="${lbl}: ${(v * 100).toFixed(0)}%"></i>`;
  }).join("") + `</div>`;
}
