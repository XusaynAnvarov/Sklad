// ========================================================================
//  ВСЕ ИМЕНА НА МЕСТЕ.  node _tools/tests/t-imports.mjs
//
//  Сентябрь 2026: в js/pages/sales.js добавили вызов изменениеСклада(),
//  а импорт забыли. Синтаксис верный, все тесты зелёные — и владелец
//  увидел «Ошибка сохранения: изменениеСклада is not defined» прямо
//  посреди накладной.
//
//  Браузер находит такое только в момент нажатия кнопки. Поэтому ищем
//  здесь: собираем все имена, которые модули отдают наружу (export), и
//  проверяем, что каждый файл, который их вызывает, либо объявляет их
//  сам, либо импортирует.
// ========================================================================
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const корень = fileURLToPath(new URL("../../", import.meta.url));

// Комментарии и строки выкидываем: в них полно русских слов со скобкой —
// «партии (по одной)», «Отчёты (за месяц)».
function толькоКод(s) {
  let out = "", i = 0;
  while (i < s.length) {
    const c = s[i], д = s[i + 1];
    if (c === "/" && д === "/") { while (i < s.length && s[i] !== "\n") i++; continue; }
    if (c === "/" && д === "*") { i += 2; while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) i++; i += 2; continue; }
    if (c === '"' || c === "'") { const к = c; i++; while (i < s.length && s[i] !== к) { if (s[i] === "\\") i++; i++; } i++; out += '""'; continue; }
    if (c === "`") {                      // шаблонная строка: внутри ${…} остаётся код
      i++; out += '""';
      while (i < s.length && s[i] !== "`") {
        if (s[i] === "\\") { i += 2; continue; }
        if (s[i] === "$" && s[i + 1] === "{") { let гл = 1; i += 2; out += "("; while (i < s.length && гл) { if (s[i] === "{") гл++; else if (s[i] === "}") гл--; if (гл) out += s[i]; i++; } out += ")"; continue; }
        i++;
      }
      i++; continue;
    }
    out += c; i++;
  }
  return out;
}

function всеФайлы(папка, out = []) {
  for (const имя of readdirSync(папка)) {
    const путь = join(папка, имя);
    if (statSync(путь).isDirectory()) всеФайлы(путь, out);
    else if (имя.endsWith(".js")) out.push(путь);
  }
  return out;
}

const имяФайла = (п) => п.replace(корень, "").replace(/\\/g, "/");

// что модуль отдаёт наружу
function экспортирует(код) {
  const имена = new Set();
  for (const m of код.matchAll(/export\s+(?:async\s+)?function\s+([\wА-Яа-яЁё$]+)/g)) имена.add(m[1]);
  for (const m of код.matchAll(/export\s+(?:const|let|var|class)\s+([\wА-Яа-яЁё$]+)/g)) имена.add(m[1]);
  for (const m of код.matchAll(/export\s*\{([^}]*)\}/g)) m[1].split(",").forEach(ч => { const n = ч.split(/\s+as\s+/).pop().trim(); if (n) имена.add(n); });
  return имена;
}

// что файл объявляет у себя
function объявляет(код) {
  const имена = new Set();
  for (const m of код.matchAll(/(?:async\s+)?function\s+([\wА-Яа-яЁё$]+)/g)) имена.add(m[1]);
  for (const m of код.matchAll(/(?:const|let|var|class)\s+([\wА-Яа-яЁё$]+)/g)) имена.add(m[1]);
  for (const m of код.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=/g)) m[1].split(",").forEach(ч => { const n = ч.split(":").pop().split("=")[0].trim(); if (n) имена.add(n); });
  // параметры функций и стрелок — тоже имена
  for (const m of код.matchAll(/\(([^()]*)\)\s*(?:=>|\{)/g)) m[1].split(",").forEach(ч => { const n = ч.split("=")[0].replace(/[{}[\].…]/g, "").trim(); if (n && !n.includes(" ")) имена.add(n); });
  return имена;
}

// что файл импортирует
function импортирует(код) {
  const имена = new Set();
  for (const m of код.matchAll(/import\s+([\s\S]+?)\s+from\s*["'][^"']+["']/g)) {
    const часть = m[1];
    const ф = часть.match(/\{([\s\S]*)\}/);
    if (ф) ф[1].split(",").forEach(ч => { const n = ч.split(/\s+as\s+/).pop().trim(); if (n) имена.add(n); });
    const звезда = часть.match(/\*\s+as\s+([\wА-Яа-яЁё$]+)/);
    if (звезда) имена.add(звезда[1]);
    const обычный = часть.replace(/\{[\s\S]*\}/g, "").replace(/\*\s+as\s+[\wА-Яа-яЁё$]+/g, "").split(",")[0].trim();
    if (обычный && /^[\wА-Яа-яЁё$]+$/.test(обычный)) имена.add(обычный);
  }
  return имена;
}

const файлы = всеФайлы(join(корень, "js"));
// Импорты читаем из исходного текста: в очищенном адреса модулей стёрты
// вместе со строками.
const исходный = new Map(файлы.map(п => [п, readFileSync(п, "utf8")]));
const код = new Map(файлы.map(п => [п, толькоКод(исходный.get(п))]));

// все имена, которые модули отдают наружу
const общие = new Set();
for (const [, с] of код) for (const имя of экспортирует(с)) общие.add(имя);

const проблемы = [];
for (const [путь, с] of код) {
  // объявления берём и из исходного текста: очистка от строк иногда
  // спотыкается о регулярные выражения с кавычками внутри
  const доступно = new Set([...объявляет(с), ...объявляет(исходный.get(путь)), ...импортирует(исходный.get(путь)), ...экспортирует(с)]);
  for (const имя of общие) {
    if (доступно.has(имя)) continue;
    const вызов = new RegExp("(?<![\\w$.])" + имя.replace(/[$]/g, "\\$") + "\\s*\\(");
    if (вызов.test(с)) проблемы.push(`${имяФайла(путь)} вызывает ${имя}(), но не импортирует его`);
  }
}

if (проблемы.length) {
  console.log("❌ найдено вызовов без импорта:", проблемы.length);
  проблемы.forEach(p => console.log("   ", p));
} else {
  console.log("✅ во всех", файлы.length, "файлах каждая общая функция объявлена или импортирована");
  console.log("   общих имён проверено:", общие.size);
}
console.log(проблемы.length ? `\n${проблемы.length} ОШИБОК` : "\nИМЕНА В ПОРЯДКЕ");
process.exit(проблемы.length ? 1 : 0);
