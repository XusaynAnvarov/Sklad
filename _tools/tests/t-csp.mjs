// ========================================================================
//  ПОЛИТИКА CSP И ОТЧЁТЫ О НАРУШЕНИЯХ.  node _tools/tests/t-csp.mjs
//
//  Одна и та же политика стоит в двух местах: в Node (api/lib/csp.js) и в
//  nginx (deploy/nginx-security-headers.conf). Если разойдутся — страницы
//  сайта и API будут жить по разным правилам. Ещё проверяем приёмник
//  отчётов: мусор от расширений не считается, повтор не множится.
// ========================================================================
import fs from "fs";
const корень = new URL("../../", import.meta.url);
delete process.env.TELEGRAM_BOT_TOKEN;   // в тесте ничего не отправляем
const { CSP_НАБЛЮДЕНИЕ } = await import(new URL("api/lib/csp.js", корень));
const { default: приёмник, _виденные } = await import(new URL("api/csp-report.js", корень));

let плохо = 0;
const ok = (имя, условие) => { if (условие) console.log("✅", имя); else { console.log("❌", имя); плохо++; } };

const nginx = fs.readFileSync(new URL("deploy/nginx-security-headers.conf", корень), "utf8");
const m = nginx.match(/^add_header Content-Security-Policy-Report-Only "([^"]+)" always;$/m);
ok("в nginx есть заголовок наблюдения", !!m);
ok("политика в nginx совпадает с api/lib/csp.js", m && m[1] === CSP_НАБЛЮДЕНИЕ);
ok("в nginx нет блокирующей CSP кроме frame-ancestors", /add_header Content-Security-Policy "frame-ancestors [^"]+" always;/.test(nginx) && (nginx.match(/add_header Content-Security-Policy "/g) || []).length === 1);
ok("политика шлёт отчёты на /api/csp-report", /report-uri \/api\/csp-report/.test(CSP_НАБЛЮДЕНИЕ));
ok("объекты/плагины запрещены", /object-src 'none'/.test(CSP_НАБЛЮДЕНИЕ));
ok("нет двойных кавычек, ломающих nginx", !CSP_НАБЛЮДЕНИЕ.includes('"'));

const конф = fs.readFileSync(new URL("deploy/nginx-generalmodern.conf", корень), "utf8");
const мани = конф.indexOf("\\.webmanifest$"), статика = конф.indexOf("\\.(js|css|");
ok("манифест получает свой тип и стоит ДО общего правила статики", мани > 0 && статика > 0 && мани < статика && /application\/manifest\+json/.test(конф));
ok("каждая строка с add_header в nginx подключает защитные заголовки",
  конф.split(/\r?\n/).filter(l => /^\s*location /.test(l) && /add_header/.test(l)).every(l => /nginx-security-headers/.test(l)));

const отправить = (body) => приёмник({ method: "POST", body }, { status() { return { end() {} }; }, end() {} });
_виденные.clear();
await отправить({ "csp-report": { "effective-directive": "script-src-elem", "blocked-uri": "https://evil.example/x.js?a=1", "document-uri": "https://generalmodern.uz/p/igla" } });
await отправить({ "csp-report": { "effective-directive": "script-src-elem", "blocked-uri": "https://evil.example/other.js", "document-uri": "https://generalmodern.uz/" } });
ok("одинаковый источник считается одним ключом", _виденные.size === 1 && [..._виденные.values()][0].count === 2);
ok("в ключе только домен, без пути и параметров", [..._виденные.keys()][0] === "script-src-elem ← https://evil.example");
await отправить({ "csp-report": { "violated-directive": "img-src", "blocked-uri": "chrome-extension://abc/icon.png" } });
await отправить([{ body: { effectiveDirective: "img-src", blockedURL: "moz-extension://x/y.png" } }]);
ok("мусор от расширений браузера не считается", _виденные.size === 1);
await отправить([{ body: { effectiveDirective: "connect-src", blockedURL: "https://api.example.com/v1", documentURL: "https://generalmodern.uz/#cabinet" } }]);
ok("новый формат отчётов (Reporting API) тоже понимается", _виденные.has("connect-src ← https://api.example.com"));
await отправить("не json");
await отправить({ "csp-report": "строка" });
await отправить(null);
ok("кривые отчёты не роняют приёмник", _виденные.size === 2);
const журнал = console.warn; console.warn = () => {};
for (let i = 0; i < 400; i++) await отправить({ "csp-report": { "effective-directive": "img-src", "blocked-uri": `https://h${i}.example/` } });
console.warn = журнал;
ok("память под отчёты ограничена (300 ключей)", _виденные.size === 300);

console.log(плохо ? `\n${плохо} ОШИБОК` : "\nCSP В ПОРЯДКЕ");
process.exit(плохо ? 1 : 0);
