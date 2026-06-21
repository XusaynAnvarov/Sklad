// Растеризация логотипа (icon.svg) в PNG-иконки и аватар бота.
// Запуск: node brand/render-icons.cjs
const { Resvg } = require("@resvg/resvg-js");
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const svg = fs.readFileSync(path.join(ROOT, "icon.svg"), "utf8");

const targets = [
  ["icon-512.png", 512],
  ["icon-192.png", 192],
  ["apple-touch-icon-180.png", 180],
  ["brand/bot-avatar.png", 512],
];

for (const [name, size] of targets) {
  const r = new Resvg(svg, {
    fitTo: { mode: "width", value: size },
    font: { loadSystemFonts: true, defaultFontFamily: "Georgia" },
    background: "#16233b",   // тёмно-синий фон — без белых/прозрачных углов
  });
  const png = r.render().asPng();
  const out = path.join(ROOT, name);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, png);
  console.log(`✓ ${name} — ${size}px, ${(png.length / 1024).toFixed(1)} KB`);
}
console.log("Готово.");
