// Генерация анимированного логотипа GENERAL MODERN → brand/bot-intro.gif
// (заставка бота «до Start» в BotFather и на /start). Запуск: node brand/render-intro.cjs
const { Resvg } = require("@resvg/resvg-js");
const { GIFEncoder, quantize, applyPalette } = require("gifenc");
const fs = require("fs"), path = require("path");

const SIZE = 240, FRAMES = 30, DUR = 2.4, DELAY = Math.round((DUR / FRAMES) * 1000);
const RING = 2 * Math.PI * 82; // длина окружности r=82
const ease = (x) => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);
const cl = (x) => Math.max(0, Math.min(1, x));

function frameSVG(t) {
  const bop = cl(t / 0.35);
  const scale = 0.62 + 0.38 * ease(cl(t / 0.55));
  const ringOff = (1 - ease(cl((t - 0.25) / 1.0))) * RING;
  const gp = ease(cl((t - 0.5) / 0.6));
  const gmDy = (1 - gp) * 22;
  const sp = cl((t - 1.2) / 1.15);
  const shineX = -90 + sp * (SIZE + 200);
  const shineOn = t >= 1.2 && t <= 2.5;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 240 240">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f7e9a6"/><stop offset=".45" stop-color="#e3c163"/>
      <stop offset=".75" stop-color="#c79a33"/><stop offset="1" stop-color="#a87b1f"/>
    </linearGradient>
    <linearGradient id="sh" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="240" height="240" fill="#182740"/>
  <g opacity="${bop.toFixed(3)}" transform="translate(120 120) scale(${scale.toFixed(3)}) translate(-120 -120)">
    <circle cx="120" cy="120" r="82" fill="none" stroke="url(#g)" stroke-width="7" stroke-linecap="round"
            stroke-dasharray="${RING.toFixed(1)}" stroke-dashoffset="${ringOff.toFixed(1)}" transform="rotate(-96 120 120)"/>
    <g opacity="${gp.toFixed(3)}" transform="translate(0 ${gmDy.toFixed(2)})">
      <text x="120" y="150" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="80" font-weight="700" letter-spacing="-3" fill="url(#g)">GM</text>
    </g>
    ${shineOn ? `<rect x="${shineX.toFixed(1)}" y="-50" width="32" height="340" fill="url(#sh)" transform="rotate(18 120 120)"/>` : ""}
  </g>
</svg>`;
}

const gif = GIFEncoder();
for (let f = 0; f < FRAMES; f++) {
  const t = (f / FRAMES) * DUR;
  const r = new Resvg(frameSVG(t), { font: { loadSystemFonts: true, defaultFontFamily: "Georgia" }, fitTo: { mode: "width", value: SIZE } });
  const rgba = r.render().pixels; // Buffer RGBA
  const data = new Uint8Array(rgba);
  const palette = quantize(data, 256);
  const index = applyPalette(data, palette);
  gif.writeFrame(index, SIZE, SIZE, { palette, delay: DELAY });
}
gif.finish();
const out = path.join(__dirname, "bot-intro.gif");
fs.writeFileSync(out, gif.bytes());
console.log(`✓ bot-intro.gif — ${FRAMES} кадров, ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
