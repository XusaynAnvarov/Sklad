// ========================================================================
//  ФОТО ЧЕРЕЗ СВОЙ СЕРВЕР (/api/img) и оригиналы для печатного каталога.
//  node _tools/tests/t-imgproxy.mjs
//
//  Через /api/img идут все картинки сайта и склада, поэтому проверяем,
//  что Supabase трогается только один раз на снимок.
// ========================================================================
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.CACHE_DIR = mkdtempSync(join(tmpdir(), "gm-img-"));
process.env.SUPABASE_URL = "https://база.supabase.co";

const запросы = [];
globalThis.fetch = async (url) => {
  запросы.push(String(url));
  if (String(url).includes("/nofile")) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
  const тело = String(url).includes("/render/") ? "уменьшенный" : "оригинал";
  return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode(тело).buffer };
};

const корень = new URL("../../", import.meta.url);
const { default: handler, снимок, оригинал } = await import(new URL("api/lib/imgproxy.js", корень));

let плохо = 0;
const ok = (имя, условие) => { if (условие) console.log("✅", имя); else { console.log("❌", имя); плохо++; } };

const вызвать = async (query) => {
  const заголовки = {};
  const res = {
    code: 200, тело: null,
    setHeader(k, v) { заголовки[k] = v; },
    status(c) { this.code = c; return this; },
    send(b) { this.тело = String(b); return this; },
    end(b) { this.тело = Buffer.isBuffer(b) ? b.toString() : b; return this; },
  };
  await handler({ query }, res);
  return { ...res, заголовки };
};

const p = "product-photos/1_a.jpg";
const первый = await вызвать({ w: "300", p });
ok("первый раз — скачан уменьшенный из Supabase", первый.code === 200 && первый.тело === "уменьшенный" && первый.заголовки["X-Img-Cache"] === "MISS");
ok("тип и долгий кэш", первый.заголовки["Content-Type"] === "image/jpeg" && /immutable/.test(первый.заголовки["Cache-Control"]));
const n = запросы.length;
const второй = await вызвать({ w: "300", p });
ok("второй раз — с диска, Supabase не трогаем", второй.тело === "уменьшенный" && второй.заголовки["X-Img-Cache"] === "HIT" && запросы.length === n);

ok("чужая ширина — отказ", (await вызвать({ w: "333", p })).code === 400);
ok("чужой путь — отказ", (await вызвать({ w: "300", p: "../.env" })).code === 400 && (await вызвать({ w: "300", p: "https://evil/x.jpg" })).code === 400);
const нет = await вызвать({ w: "300", p: "product-photos/nofile.jpg" });
ok("нет файла — 404 и короткий кэш", нет.code === 404 && нет.заголовки["Cache-Control"] === "public, max-age=300");

const ор = await оригинал(p);
ok("оригинал для каталога — без уменьшения", ор && ор.байты.toString() === "оригинал" && !ор.изКэша && запросы.at(-1).includes("/object/public/"));
const m = запросы.length;
ok("оригинал второй раз — с диска", (await оригинал(p)).изКэша && запросы.length === m);
ok("снимок() отдаёт то же, что /api/img", (await снимок(p, 300)).байты.toString() === "уменьшенный");
ok("оригинал по чужому пути — нет", (await оригинал("../.env")) === null);

console.log(плохо ? `\n${плохо} ОШИБОК` : "\nФОТО ЧЕРЕЗ СЕРВЕР В ПОРЯДКЕ");
process.exit(плохо ? 1 : 0);
