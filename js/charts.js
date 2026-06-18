// ========================================================================
//  Мини-график (спарклайн): SVG-линия + градиентная заливка под ней.
//  Чистая функция без зависимостей — возвращает строку SVG.
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
  const id = "sg" + Math.random().toString(36).slice(2, 8);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" width="100%" height="${h}" style="display:block">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    <polygon points="${area}" fill="url(#${id})"/>
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}
