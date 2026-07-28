// ========================================================================
//  Генератор видео-инструкции (анимированный GIF) «Как зарегистрироваться»
//  Сайт generalmodern.uz + Telegram-бот @generalmodernbot, языки ru/uz.
//  Запуск:  node _guide/build-guide.mjs [папка-вывода]
//  Telegram при отправке сам конвертирует GIF в видео.
// ========================================================================
import { Resvg } from "@resvg/resvg-js";
import gifenc from "gifenc";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const { GIFEncoder, quantize, applyPalette } = gifenc;

const W = 540, H = 1100;               // кадр под телефон
const NAVY = "#16233b", NAVY2 = "#22324f", GOLD = "#d9b45a", BG = "#f4f0e8";
const TG = "#2aabee", OK = "#16a34a", TXT = "#1c2b4a", MUT = "#6b7a90";
const FONT = "Inter, Segoe UI, Arial, sans-serif";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---------- мелкие рисовалки (возвращают строку SVG) ----------
const rect = (x, y, w, h, r, fill, extra = "") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`;
const text = (x, y, s, { size = 22, fill = TXT, anchor = "start", weight = 400 } = {}) =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-weight="${weight}">${esc(s)}</text>`;
// текст с переносом по ширине (грубо, по словам)
function wrap(x, y, s, { size = 22, fill = TXT, weight = 400, max = 30, lh = 30, anchor = "start" } = {}) {
  const words = String(s).split(" ");
  const lines = []; let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > max) { if (cur) lines.push(cur); cur = w; }
    else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.map((l, i) => text(x, y + i * lh, l, { size, fill, weight, anchor })).join("");
}
// кнопка
const btn = (x, y, w, h, label, { fill = NAVY, color = "#fff", size = 22, r = 12, glow = false } = {}) =>
  (glow ? rect(x - 6, y - 6, w + 12, h + 12, r + 6, "rgba(217,180,90,.45)") : "") +
  rect(x, y, w, h, r, fill) +
  text(x + w / 2, y + h / 2 + size * 0.35, label, { size, fill: color, anchor: "middle", weight: 700 });
// поле ввода
const field = (x, y, w, h, label, { filled = "" } = {}) =>
  rect(x, y, w, h, 12, "#fff", 'stroke="#d7dbe3" stroke-width="2"') +
  text(x + 16, y + h / 2 + 7, filled || label, { size: 20, fill: filled ? TXT : "#9aa6b6" });
// указатель «нажмите сюда» — рядом с элементом, не закрывая его текст.
// dir="up"   → указатель НИЖЕ элемента, стрелка смотрит вверх (элемент над ним)
// dir="down" → указатель ВЫШЕ элемента, стрелка смотрит вниз
const tap = (x, y, dir = "up") => dir === "up"
  ? `<g>
      <path d="M ${x} ${y + 8} L ${x - 11} ${y + 26} L ${x + 11} ${y + 26} Z" fill="${GOLD}"/>
      <circle cx="${x}" cy="${y + 44}" r="20" fill="rgba(217,180,90,.35)"/>
      <circle cx="${x}" cy="${y + 44}" r="11" fill="${GOLD}"/>
    </g>`
  : `<g>
      <circle cx="${x}" cy="${y + 20}" r="20" fill="rgba(217,180,90,.35)"/>
      <circle cx="${x}" cy="${y + 20}" r="11" fill="${GOLD}"/>
      <path d="M ${x} ${y + 60} L ${x - 11} ${y + 42} L ${x + 11} ${y + 42} Z" fill="${GOLD}"/>
    </g>`;

// ---------- каркас кадра: заголовок шага + «телефон» ----------
function frame({ step, total, title, subtitle, screen, badge, siteLabel = "Сайт" }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${NAVY}"/>
  ${text(W / 2, 58, "GENERAL MODERN", { size: 28, fill: GOLD, anchor: "middle", weight: 700 })}
  ${rect(W / 2 - 60, 74, 120, 4, 2, "rgba(217,180,90,.5)")}
  ${badge ? rect(28, 96, 150, 40, 20, badge === "tg" ? TG : "rgba(255,255,255,.14)") : ""}
  ${badge ? text(103, 123, badge === "tg" ? "Telegram" : siteLabel, { size: 19, fill: "#fff", anchor: "middle", weight: 700 }) : ""}
  ${text(W - 28, 123, `${step} / ${total}`, { size: 20, fill: "rgba(255,255,255,.65)", anchor: "end", weight: 600 })}
  ${wrap(28, 186, title, { size: 30, fill: "#fff", weight: 700, max: 26, lh: 38 })}
  ${subtitle ? wrap(28, 186 + 38 * Math.ceil(title.length / 26) + 16, subtitle, { size: 21, fill: "rgba(255,255,255,.72)", max: 34, lh: 28 }) : ""}
  <g transform="translate(60, 340)">
    ${rect(-10, -10, 440, 700, 34, "rgba(255,255,255,.10)")}
    ${rect(0, 0, 420, 680, 28, BG)}
    ${screen}
  </g>
</svg>`;
}

// ---------- экраны ----------
const scrSite = (L, opts = {}) => `
  ${rect(0, 0, 420, 68, 0, "#fff")}
  ${text(20, 42, "generalmodern.uz", { size: 19, fill: MUT })}
  ${btn(268, 16, 132, 38, L.login, { fill: NAVY, size: 17, r: 10, glow: opts.glowLogin })}
  ${rect(20, 88, 180, 26, 8, "rgba(28,43,74,.10)")}
  ${[0, 1, 2, 3].map(i => rect(20 + (i % 2) * 200, 130 + Math.floor(i / 2) * 210, 180, 190, 14, "#fff")).join("")}
  ${[0, 1, 2, 3].map(i => rect(36 + (i % 2) * 200, 146 + Math.floor(i / 2) * 210, 148, 110, 10, "#e7e2d6")).join("")}
  ${[0, 1, 2, 3].map(i => rect(36 + (i % 2) * 200, 268 + Math.floor(i / 2) * 210, 110, 14, 7, "#dfe3ea")).join("")}
  ${opts.glowLogin ? tap(334, 54) : ""}`;

const scrModal = (L, opts = {}) => `
  ${rect(0, 0, 420, 680, 28, "rgba(20,31,51,.55)")}
  ${rect(30, 120, 360, 420, 20, "#fff")}
  ${text(210, 172, L.mTitle, { size: 23, fill: TXT, anchor: "middle", weight: 700 })}
  ${field(56, 206, 308, 54, L.fPhone, { filled: opts.phone })}
  ${wrap(56, 288, L.hint, { size: 16, fill: MUT, max: 40, lh: 22 })}
  ${btn(56, 336, 308, 54, opts.btnLabel || L.bNext, { fill: NAVY, glow: opts.glowBtn })}
  ${opts.link ? text(210, 424, opts.link, { size: 17, fill: NAVY2, anchor: "middle", weight: 600 }) : ""}
  ${opts.glowLink ? tap(210, 430) : ""}
  ${opts.glowBtn ? tap(210, 390) : ""}`;

const scrBot = (L, opts = {}) => `
  ${rect(0, 0, 420, 680, 28, "#e9edf2")}
  ${rect(0, 0, 420, 62, 0, TG)}
  ${text(20, 39, "@generalmodernbot", { size: 19, fill: "#fff", weight: 700 })}
  ${rect(20, 88, 300, 92, 14, "#fff")}
  ${wrap(36, 118, opts.botText || L.botHello, { size: 17, fill: TXT, max: 32, lh: 24 })}
  ${opts.mine ? rect(120, 200, 280, 60, 14, "#d7f4c8") : ""}
  ${opts.mine ? wrap(136, 228, opts.mine, { size: 17, fill: TXT, max: 30, lh: 22 }) : ""}
  ${btn(20, 566, 380, 62, opts.kbd || L.bShare, { fill: "#fff", color: TG, size: 20, glow: opts.glowKbd })}
  ${opts.glowKbd ? tap(210, 480, "down") : ""}`;

const scrPass = (L, opts = {}) => `
  ${rect(0, 0, 420, 680, 28, "rgba(20,31,51,.55)")}
  ${rect(30, 100, 360, 470, 20, "#fff")}
  ${text(210, 152, L.mDone, { size: 23, fill: TXT, anchor: "middle", weight: 700 })}
  ${rect(56, 176, 308, 40, 10, "rgba(22,163,74,.12)")}
  ${text(210, 202, L.confirmed, { size: 17, fill: OK, anchor: "middle", weight: 700 })}
  ${field(56, 236, 308, 54, L.fPass, { filled: opts.filled ? "••••••••" : "" })}
  ${field(56, 302, 308, 54, L.fPass2, { filled: opts.filled ? "••••••••" : "" })}
  ${btn(56, 380, 308, 54, L.bFinish, { fill: OK, glow: opts.glowBtn })}
  ${opts.glowBtn ? tap(210, 434) : ""}`;

const scrMenu = (L) => `
  ${rect(0, 0, 420, 680, 28, "#e9edf2")}
  ${rect(0, 0, 420, 62, 0, TG)}
  ${text(20, 39, "@generalmodernbot", { size: 19, fill: "#fff", weight: 700 })}
  ${rect(20, 88, 340, 76, 14, "#fff")}
  ${wrap(36, 116, L.menuHi, { size: 17, fill: TXT, max: 34, lh: 22 })}
  ${["🛍 " + L.mCatalog, "💰 " + L.mDebt, "🧾 " + L.mInvoices, "🌐 " + L.mSite].map((s, i) =>
    rect(20, 200 + i * 84, 380, 66, 14, "#fff") + text(44, 240 + i * 84, s, { size: 20, fill: TXT, weight: 600 })).join("")}`;

const scrFinal = (L) => `
  ${rect(0, 0, 420, 680, 28, BG)}
  ${text(210, 200, "✅", { size: 96, anchor: "middle" })}
  ${wrap(210, 300, L.finalTitle, { size: 26, fill: TXT, weight: 700, max: 24, lh: 34, anchor: "middle" })}
  ${wrap(210, 380, L.finalSub, { size: 19, fill: MUT, max: 32, lh: 26, anchor: "middle" })}
  ${rect(60, 470, 300, 56, 14, NAVY)}
  ${text(210, 505, "generalmodern.uz", { size: 20, fill: "#fff", anchor: "middle", weight: 700 })}
  ${rect(60, 548, 300, 56, 14, TG)}
  ${text(210, 583, "@generalmodernbot", { size: 19, fill: "#fff", anchor: "middle", weight: 700 })}`;

// ---------- тексты ----------
const RU = {
  badgeSite: "Сайт",
  login: "Войти", mTitle: "Вход / Регистрация", fPhone: "Номер телефона",
  hint: "Номер должен быть открыт в Telegram — на него придёт подтверждение.",
  bNext: "Продолжить", bGetCode: "Получить код", bOpenBot: "Открыть Telegram-бот",
  bShare: "📱 Поделиться номером", botHello: "Здравствуйте! Нажмите кнопку «Поделиться номером» ниже, чтобы подтвердить телефон.",
  mDone: "Завершение регистрации", confirmed: "✓ Номер подтверждён", fPass: "Придумайте пароль (мин. 6)",
  fPass2: "Повторите пароль", bFinish: "Завершить регистрацию",
  menuHi: "Готово! Вы вошли. Выберите раздел:", mCatalog: "Каталог товаров", mDebt: "Мой долг", mInvoices: "Мои накладные (PDF)", mSite: "Открыть сайт",
  finalTitle: "Готово! Теперь всё под рукой", finalSub: "Каталог, заказы, долг и накладные — на сайте и в боте",
  steps: [
    { title: "Откройте сайт generalmodern.uz", sub: "Нажмите кнопку «Войти» в правом верхнем углу", badge: "site", scr: (L) => scrSite(L, { glowLogin: true }) },
    { title: "Нажмите «Зарегистрироваться»", sub: "Если аккаунта ещё нет — ссылка внизу окна", badge: "site", scr: (L) => scrModal(L, { link: "Нет аккаунта? Зарегистрироваться", glowLink: true }) },
    { title: "Введите номер телефона", sub: "Тот же номер, что в Telegram → «Продолжить»", badge: "site", scr: (L) => scrModal(L, { phone: "+998 90 123 45 67", glowBtn: true }) },
    { title: "Откройте Telegram-бот", sub: "Кнопка откроет @generalmodernbot", badge: "site", scr: (L) => scrModal(L, { phone: "+998 90 123 45 67", btnLabel: L.bOpenBot, glowBtn: true }) },
    { title: "В боте нажмите «Поделиться номером»", sub: "Кнопка внизу экрана — так мы подтвердим телефон", badge: "tg", scr: (L) => scrBot(L, { glowKbd: true }) },
    { title: "Вернитесь на сайт", sub: "Номер подтверждён — придумайте пароль (мин. 6 символов)", badge: "site", scr: (L) => scrPass(L, { filled: true, glowBtn: true }) },
    { title: "Вход в следующий раз", sub: "«Войти» → номер → код придёт в бот → код + пароль", badge: "site", scr: (L) => scrModal(L, { phone: "+998 90 123 45 67", btnLabel: L.bGetCode, glowBtn: true }) },
    { title: "В боте всё под рукой", sub: "Каталог, долг, накладные в PDF", badge: "tg", scr: (L) => scrMenu(L) },
    { title: "Готово!", sub: "", badge: null, scr: (L) => scrFinal(L) },
  ],
};

const UZ = {
  badgeSite: "Sayt",
  login: "Kirish", mTitle: "Kirish / Ro'yxatdan o'tish", fPhone: "Telefon raqami",
  hint: "Raqam Telegram'da ochiq bo'lishi kerak — tasdiq o'sha yerga keladi.",
  bNext: "Davom etish", bGetCode: "Kod olish", bOpenBot: "Telegram-botni ochish",
  bShare: "📱 Raqamni yuborish", botHello: "Assalomu alaykum! Telefonni tasdiqlash uchun pastdagi «Raqamni yuborish» tugmasini bosing.",
  mDone: "Ro'yxatni yakunlash", confirmed: "✓ Raqam tasdiqlandi", fPass: "Parol o'ylab toping (min. 6)",
  fPass2: "Parolni takrorlang", bFinish: "Ro'yxatdan o'tishni yakunlash",
  menuHi: "Tayyor! Siz kirdingiz. Bo'limni tanlang:", mCatalog: "Mahsulotlar katalogi", mDebt: "Mening qarzim", mInvoices: "Mening hisob-fakturalarim (PDF)", mSite: "Saytni ochish",
  finalTitle: "Tayyor! Endi hammasi qo'l ostida", finalSub: "Katalog, buyurtma, qarz va fakturalar — saytda va botda",
  steps: [
    { title: "generalmodern.uz saytini oching", sub: "O'ng yuqoridagi «Kirish» tugmasini bosing", badge: "site", scr: (L) => scrSite(L, { glowLogin: true }) },
    { title: "«Ro'yxatdan o'tish»ni bosing", sub: "Hisobingiz yo'q bo'lsa — havola oyna pastida", badge: "site", scr: (L) => scrModal(L, { link: "Hisob yo'qmi? Ro'yxatdan o'tish", glowLink: true }) },
    { title: "Telefon raqamingizni kiriting", sub: "Telegram'dagi raqam → «Davom etish»", badge: "site", scr: (L) => scrModal(L, { phone: "+998 90 123 45 67", glowBtn: true }) },
    { title: "Telegram-botni oching", sub: "Tugma @generalmodernbot'ni ochadi", badge: "site", scr: (L) => scrModal(L, { phone: "+998 90 123 45 67", btnLabel: L.bOpenBot, glowBtn: true }) },
    { title: "Botda «Raqamni yuborish»ni bosing", sub: "Ekran pastidagi tugma — telefon shunday tasdiqlanadi", badge: "tg", scr: (L) => scrBot(L, { glowKbd: true }) },
    { title: "Saytga qayting", sub: "Raqam tasdiqlandi — parol o'ylab toping (min. 6 belgi)", badge: "site", scr: (L) => scrPass(L, { filled: true, glowBtn: true }) },
    { title: "Keyingi safar kirish", sub: "«Kirish» → raqam → kod botga keladi → kod + parol", badge: "site", scr: (L) => scrModal(L, { phone: "+998 90 123 45 67", btnLabel: L.bGetCode, glowBtn: true }) },
    { title: "Botda hammasi qo'l ostida", sub: "Katalog, qarz, PDF fakturalar", badge: "tg", scr: (L) => scrMenu(L) },
    { title: "Tayyor!", sub: "", badge: null, scr: (L) => scrFinal(L) },
  ],
};

// ---------- сборка GIF ----------
function buildGif(L, outFile) {
  const enc = GIFEncoder();
  const total = L.steps.length;
  L.steps.forEach((st, i) => {
    const svg = frame({ step: i + 1, total, title: st.title, subtitle: st.sub, screen: st.scr(L), badge: st.badge, siteLabel: L.badgeSite });
    const png = new Resvg(svg, { font: { loadSystemFonts: true } }).render();
    // GUIDE_PNG=1 — дополнительно сохранить кадры картинками (удобно проверить вёрстку)
    if (process.env.GUIDE_PNG) writeFileSync(outFile.replace(/\.gif$/, `-${i + 1}.png`), png.asPng());
    const pal = quantize(png.pixels, 256);
    const idx = applyPalette(png.pixels, pal);
    // последний кадр держим дольше — чтобы контакты успели прочитать
    enc.writeFrame(idx, png.width, png.height, { palette: pal, delay: i === total - 1 ? 4500 : 3000 });
  });
  enc.finish();
  writeFileSync(outFile, Buffer.from(enc.bytes()));
  return outFile;
}

const outDir = process.argv[2] || "_guide";
mkdirSync(outDir, { recursive: true });
for (const [lang, L] of [["ru", RU], ["uz", UZ]]) {
  const f = buildGif(L, join(outDir, `guide-${lang}.gif`));
  console.log("готово:", f);
}
