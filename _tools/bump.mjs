// ========================================================================
//  БАМП ВЕРСИЙ ПЕРЕД ДЕПЛОЕМ.  Запуск:  node _tools/bump.mjs
//
//  Зачем: nginx отдаёт .js/.css с "Cache-Control: immutable, max-age=604800",
//  поэтому браузер 7 дней НЕ перезапрашивает файл. Если у импорта нет ?v=,
//  пользователь продолжает работать на старом коде («ничего не изменилось»).
//  Скрипт добавляет свежую версию:
//   1) sw.js  CACHE = sklad-vN  → N+1  и все register("sw.js?v=N")
//   2) ?v=ДАТА+буква у входных html (script/css)
//   3) ?v=… КАЖДОМУ относительному импорту в js/**/*.js (в т.ч. динамическому)
// ========================================================================
import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const HTML = ["index.html", "admin.html", "catalog.html", "sklad.html"];

// --- следующая версия: 2026MMDD + буква (a..z) ---
function nextVersion(cur) {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // 20260731
  if (cur && cur.startsWith(today)) {
    const letter = cur.slice(-1);
    const next = letter >= "a" && letter < "z" ? String.fromCharCode(letter.charCodeAt(0) + 1) : "a";
    return next === "a" && letter === "z" ? today + "a1" : today + next;   // на всякий случай
  }
  return today + "a";
}

// --- собрать все js-файлы проекта (кроме служебных папок) ---
function jsFiles(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".git", "_import", "_tools", "_guide", "guide", "api"].includes(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) jsFiles(p, acc);
    else if (name.endsWith(".js") && name !== "sw.js" && name !== "config.js") acc.push(p);
  }
  return acc;
}

// 1) sw.js
let sw = readFileSync(join(ROOT, "sw.js"), "utf8");
const swNum = Number((sw.match(/sklad-v(\d+)/) || [])[1] || 0) + 1;
sw = sw.replace(/sklad-v\d+/g, "sklad-v" + swNum);

// 2) версия для html и импортов
const idx = readFileSync(join(ROOT, "index.html"), "utf8");
const curVer = (idx.match(/\?v=(\d{8}[a-z]\d*)/) || [])[1] || "";
const VER = nextVersion(curVer);

// Ту же версию пишем в sw.js отдельной строкой. По ней приложение узнаёт,
// что открытое в браузере устарело: страницу браузер кэширует по своему
// усмотрению (заголовка от nginx нет), а sw.js можно запросить в обход кэша.
if (sw.includes("const BUILD =")) sw = sw.replace(/const BUILD = "[^"]*";/, `const BUILD = "${VER}";`);
else sw = sw.replace(/(const CACHE = "[^"]*";)/, `$1
const BUILD = "${VER}";   // версия кода: по ней ловим устаревшую страницу`);
writeFileSync(join(ROOT, "sw.js"), sw);

for (const f of HTML) {
  const p = join(ROOT, f);
  let s = readFileSync(p, "utf8");
  s = s.replace(/\?v=\d{8}[a-z]\d*/g, "?v=" + VER);           // script/css с версией
  // метка версии в самой странице — по ней приложение ловит устаревшее
  s = s.replace(/(name="gm-build" content=")[^"]*"/, `$1${VER}"`);
  s = s.replace(/(href="css\/[a-z]+\.css)"/g, `$1?v=${VER}"`); // css без версии — добавим
  writeFileSync(p, s);
}

// 3) регистрация SW + версии у ВСЕХ относительных импортов
let touched = 0;
for (const p of jsFiles(ROOT)) {
  let s = readFileSync(p, "utf8"), before = s;
  s = s.replace(/sw\.js\?v=\d+/g, `sw.js?v=${swNum}`);
  // import ... from "./x.js"  |  "../x.js"  |  await import("./x.js")  (с ?v= или без)
  s = s.replace(/(from\s+["']|import\(\s*["'])(\.{1,2}\/[^"'?]+\.js)(\?v=[^"']*)?(["'])/g,
    (_m, pre, path, _old, q) => `${pre}${path}?v=${VER}${q}`);
  if (s !== before) { writeFileSync(p, s); touched++; }
}

console.log(`SW: sklad-v${swNum} · версия: ${VER} · файлов с импортами обновлено: ${touched}`);
