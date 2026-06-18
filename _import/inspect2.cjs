const fs = require("fs");
const j = JSON.parse(fs.readFileSync("C:/Users/ASUS/Downloads/sklad-backup-full-2026-06-05.json", "utf8"));
console.log("TOP KEYS:", Object.keys(j));
function describe(obj) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (Array.isArray(v)) {
      console.log(`\n== ${k}: ${v.length}`);
      if (v[0]) console.log("  поля:", Object.keys(v[0]).join(", "));
      if (v[0]) console.log("  пример:", JSON.stringify(v[0]).slice(0, 240));
    } else if (v && typeof v === "object") {
      const keys = Object.keys(v);
      console.log(`\n== ${k} (объект, ключей ${keys.length})`);
      // если это словарь фото
      if (keys.length && typeof v[keys[0]] === "string" && String(v[keys[0]]).startsWith("data:")) {
        console.log("  похоже на ФОТО. пример ключа:", keys[0], "| значение:", String(v[keys[0]]).slice(0, 30));
      } else {
        console.log("  ", JSON.stringify(v).slice(0, 240));
      }
    } else {
      console.log(`\n== ${k}:`, JSON.stringify(v));
    }
  }
}
// данные могут быть на верхнем уровне или внутри .db / .data
const root = j.db && typeof j.db === "object" ? j.db : j;
describe(root);
if (j.photos) console.log("\nФОТО на верхнем уровне:", Object.keys(j.photos).length);
