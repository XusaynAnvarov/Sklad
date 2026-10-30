// Растеризация логотипа в PNG-иконки и аватар бота.
// Запуск: node brand/render-icons.cjs
const { Resvg } = require("@resvg/resvg-js");
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");

function render(svgFile, outFile, size, background) {
  const svg = fs.readFileSync(svgFile, "utf8");
  const r = new Resvg(svg, {
    fitTo: { mode: "width", value: size },
    font: { loadSystemFonts: true, defaultFontFamily: "Georgia" },
    ...(background ? { background } : {}),
  });
  const png = r.render().asPng();
  const out = path.join(ROOT, outFile);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, png);
  console.log(`✓ ${outFile} — ${size}px, ${(png.length / 1024).toFixed(1)} KB`);
}

const darkSvg = path.join(ROOT, "icon.svg");
render(darkSvg, "icon-512.png",           512, "#ffffff");
render(darkSvg, "icon-192.png",           192, "#ffffff");
render(darkSvg, "apple-touch-icon-180.png", 180, "#ffffff");

// Белый аватар бота (светлый фон, тёмные буквы — в точности как старый)
const whiteSvg = path.join(ROOT, "brand/logo-white.svg");
render(whiteSvg, "brand/bot-avatar.png",  512, "#ffffff");

console.log("Готово.");
