// ========================================================================
//  ПЕЧАТНЫЙ КАТАЛОГ: ОЧЕРЕДЬ СБОРКИ И СКАЧИВАНИЕ.  node _tools/tests/t-catalogbook-job.mjs
//
//  Одна сборка за раз; недособранную книгу не скачать; ссылка на книгу
//  не открывает ничего, кроме книги.
// ========================================================================
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { createHmac } from "node:crypto";

const папка = mkdtempSync(join(tmpdir(), "gm-book-"));
process.env.CACHE_DIR = папка;
process.env.SITE_JWT_SECRET = "тест-секрет";

const корень = new URL("../../", import.meta.url);
const job = await import(new URL("api/lib/catalogbook-job.js", корень));
const { default: ручка } = await import(new URL("api/admin/catalog-book.js", корень));
const { default: файлРучка } = await import(new URL("api/catalog-book-file.js", корень));
const { выписатьПропуск } = await import(new URL("api/lib/videocache.js", корень));

let плохо = 0;
const ok = (имя, условие) => { if (условие) console.log("✅", имя); else { console.log("❌", имя); плохо++; } };

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const голова = b64({ alg: "HS256", typ: "JWT" });
const токен = (role) => { const т = b64({ role, exp: Math.floor(Date.now() / 1000) + 600 }); return голова + "." + т + "." + createHmac("sha256", "тест-секрет").update(голова + "." + т).digest("base64url"); };
const ответ = () => ({ code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() { } });

// ---------- очередь ----------
let потоки = [];
job._подменитьПоток((файл, данные) => { const п = new EventEmitter(); п.данные = данные; потоки.push(п); return п; });

ok("неизвестный язык — отказ", !!job.запустить({ язык: "fr" }).ошибка);
const r1 = job.запустить({ язык: "ru", образец: true });
ok("сборка запущена: образец на русском", r1.задача && r1.задача.язык === "ru" && r1.задача.образец && потоки.length === 1);
ok("файл пишется в папку книг", потоки[0].данные.файл === join(папка, "catalog", "general-modern-katalog-ru-obrazec.pdf"));
ok("вторая сборка, пока идёт первая, — «уже собирается»", job.запустить({ язык: "uz" }).занято === true && потоки.length === 1);

потоки[0].emit("message", { вид: "ход", этап: "фото", готово: 40, всего: 900 });
ok("ход сборки виден", job.текущаяЗадача().этап === "фото" && job.текущаяЗадача().готово === 40);
потоки[0].emit("message", { вид: "готово", страниц: 7, всегоСтраниц: 72, байт: 1000, товаров: 933 });
потоки[0].emit("exit", 0);
const з = job.текущаяЗадача();
ok("готово: без ошибки, даже после выхода потока", з.закончено && !з.ошибка && з.всегоСтраниц === 72);

const r2 = job.запустить({ язык: "en" });
ok("после конца можно собирать снова", r2.задача && !r2.занято && потоки.length === 2);
потоки[1].emit("exit", 1);
ok("поток упал — сборка закончена с ошибкой, очередь свободна",
   !!job.текущаяЗадача().ошибка && job.текущаяЗадача().закончено && !job.запустить({ язык: "en" }).занято);
потоки[2].emit("message", { вид: "ошибка", ошибка: "нет связи с базой" });
ok("ошибка из потока показывается как есть", job.текущаяЗадача().ошибка === "нет связи с базой");

// ---------- готовые книги ----------
mkdirSync(join(папка, "catalog"), { recursive: true });
writeFileSync(join(папка, "catalog", "general-modern-katalog-ru.pdf"), Buffer.from("%PDF-1.7 книга"));
writeFileSync(join(папка, "catalog", "general-modern-katalog-ru.pdf.part"), "недособранная");
writeFileSync(join(папка, "catalog", "чужой.pdf"), "x");
const книги = job.готовыеКниги();
ok("в списке только готовые книги — без .part и чужих файлов", книги.length === 1 && книги[0].язык === "ru" && !книги[0].образец);

// ---------- ручка сборки ----------
{
  const r = ответ();
  await ручка({ method: "GET", headers: {} }, r);
  ok("без входа — 401", r.code === 401);
  const g = ответ();
  await ручка({ method: "POST", headers: { authorization: "Bearer " + токен("guest") }, body: { язык: "ru" } }, g);
  ok("гостю собирать нельзя", g.code === 401);
  const a = ответ();
  await ручка({ method: "GET", headers: { authorization: "Bearer " + токен("admin") } }, a);
  ok("владелец видит книги со ссылками", a.code === 200 && a.body.книги.length === 1 && a.body.книги[0].ссылка.startsWith("/api/catalog-book-file?t="));
  var ссылка = a.body.книги[0].ссылка;
}

// ---------- скачивание ----------
async function скачать(t, range) {
  const res = new PassThrough();
  const заголовки = {};
  res.code = 200;
  res.status = (c) => { res.code = c; return res; };
  res.json = (b) => { res.тело = b; res.end(); return res; };
  res.setHeader = (k, v) => { заголовки[k.toLowerCase()] = v; };
  const куски = [];
  res.on("data", (c) => куски.push(c));
  const конец = new Promise((ok) => res.on("end", ok));
  await файлРучка({ method: "GET", query: { t }, headers: range ? { range } : {} }, res);
  await конец;
  return { code: res.code, заголовки, данные: Buffer.concat(куски).toString(), тело: res.тело };
}
{
  const t = decodeURIComponent(ссылка.split("t=")[1]);
  const d = await скачать(t);
  ok("по ссылке скачивается книга", d.code === 200 && d.данные === "%PDF-1.7 книга" && d.заголовки["content-type"] === "application/pdf");
  ok("с именем файла", /attachment; filename="general-modern-katalog-ru\.pdf"/.test(d.заголовки["content-disposition"]));
  const часть = await скачать(t, "bytes=0-7");
  ok("докачка работает", часть.code === 206 && часть.данные === "%PDF-1.7");

  ok("без пропуска — отказ", (await скачать("")).code === 403);
  ok("пропуск на видео сюда не подходит", (await скачать(выписатьПропуск("video-123"))).code === 403);
  ok("чужой путь в пропуске не пройдёт", (await скачать(выписатьПропуск("catalog:../../.env"))).code === 403);
  ok("пропуск на .part не пройдёт", (await скачать(выписатьПропуск("catalog:general-modern-katalog-ru.pdf.part"))).code === 403);
  ok("испорченный пропуск — отказ", (await скачать(t.slice(0, -2) + "xx")).code === 403);
  ok("книга не собрана — 404", (await скачать(выписатьПропуск("catalog:general-modern-katalog-uz.pdf"))).code === 404);
  const просрочен = выписатьПропуск("catalog:general-modern-katalog-ru.pdf", -5);
  ok("просроченный пропуск — отказ", (await скачать(просрочен)).code === 403);
}

// ---------- поворот фото из телефона ----------
{
  const { ориентацияJpeg } = await import(new URL("api/lib/catalogbook.js", корень));
  // SOI + APP1 Exif (II) с одной записью Orientation = 6
  const tiff = [0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
  const app1 = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
  const len = app1.length + 2;
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 255, ...app1, 0xff, 0xda, 0, 2]);
  ok("поворот из EXIF читается: 6", ориентацияJpeg(jpeg) === 6);
  ok("без EXIF — как есть", ориентацияJpeg(Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0, 2])) === 1);
  ok("не JPEG — как есть", ориентацияJpeg(Uint8Array.from([0x89, 0x50, 0x4e, 0x47])) === 1);
  ok("обрезанный файл не роняет", ориентацияJpeg(jpeg.slice(0, 20)) === 1);
}

console.log(плохо ? `\n${плохо} ОШИБОК` : "\nСБОРКА И СКАЧИВАНИЕ КАТАЛОГА В ПОРЯДКЕ");
process.exit(плохо ? 1 : 0);
