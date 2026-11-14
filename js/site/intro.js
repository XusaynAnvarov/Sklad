// ========================================================================
//  КОРОТКИЙ РОЛИК ПРИ ВХОДЕ НА САЙТ (~17 секунд, 5 сцен).
//
//  1. Знак GENERAL MODERN, вокруг — детали швейных машин.
//  2. Выбор детали: поиск, карточка, количество, «В корзину».
//  3. Цена и подтверждение: менеджер ставит цену, клиент подтверждает в Telegram.
//  4. Сборка, упаковка и отправка — Яндекс или почта BTS.
//  5. Посылка у вас → знак улетает в шапку, сайт проявляется.
//
//  Детали нарисованы (js/site/parts.js) — не снимки с сайта. Только CSS и
//  Web Animations, светлый стиль сайта, ru/uz/en, 16:9 и 9:16.
//  Подробная экскурсия по всему сайту — отдельно, по кнопке «▶ Как
//  заказать» (js/site/tour.js); при входе её не показываем.
//
//  Не показывается: вошедшим клиентам, по прямой ссылке на раздел, при
//  «уменьшении движения», экономии трафика / 2G, роботам, в Telegram-
//  мини-приложении и тем, кто уже смотрел. Любая ошибка — сразу сайт.
// ========================================================================
import { деталь } from "./parts.js?v=20261114d";

const ВЕРСИЯ_CSS = "20261109i3";
const CSS_URL = new URL(`../../css/intro.css?v=${ВЕРСИЯ_CSS}`, import.meta.url).href;
const КЛЮЧ_СМОТРЕЛ = "gm_intro_seen";
const КЛЮЧ_НАСТРОЕК = "gm_intro_cfg";
const ДЕНЬ = 864e5;

export const ТЕКСТЫ_РОЛИКА = {
  ru: { s1: "Всё для швейного оборудования — в одном месте", s2: "Выбирайте нужные детали за секунды", s3: "Менеджер ставит цену — вы подтверждаете в Telegram", s4: "Собираем, упаковываем и отправляем: Яндекс или BTS", s5: "Ваш заказ — наша забота" },
  uz: { s1: "Tikuv uskunalari uchun hammasi — bir joyda", s2: "Kerakli detallarni bir necha soniyada tanlang", s3: "Menejer narx qo‘yadi — siz Telegramda tasdiqlaysiz", s4: "Yig‘amiz, qadoqlaymiz va jo‘natamiz: Yandex yoki BTS", s5: "Buyurtmangiz — bizning g‘amxo‘rligimiz" },
  en: { s1: "Everything for sewing equipment — in one place", s2: "Pick the parts you need in seconds", s3: "A manager sets the price — you confirm in Telegram", s4: "We pick, pack and ship: Yandex or BTS", s5: "Your order is our care" },
};
const UI = {
  ru: { skip: "Пропустить", intro: "Вступление", search: "лапка", inStock: "В наличии", add: "В корзину", cart: "Корзина", names: ["Лапка", "Челнок", "Шпулька"],
    steps: ["Заказ отправлен", "Менеджер ставит цену", "Вы подтверждаете"], order: "Ваш заказ",
    msg: "🧾 Ваш заказ готов к подтверждению:", total: "💰 Итого", yes: "✅ Подтвердить", no: "❌ Отказаться", reply: "✅ Спасибо! Заказ подтверждён — мы готовим накладную.", bot: "бот магазина", price: "•• ••• сум" },
  uz: { skip: "O‘tkazib yuborish", intro: "Kirish", search: "lapka", inStock: "Mavjud", add: "Savatga", cart: "Savat", names: ["Lapka", "Moki", "Shpulka"],
    steps: ["Buyurtma yuborildi", "Menejer narx qo‘yadi", "Siz tasdiqlaysiz"], order: "Buyurtmangiz",
    msg: "🧾 Buyurtmangiz tasdiqlashga tayyor:", total: "💰 Jami", yes: "✅ Tasdiqlash", no: "❌ Rad etish", reply: "✅ Rahmat! Buyurtma tasdiqlandi — yuk xatini tayyorlayapmiz.", bot: "do‘kon boti", price: "•• ••• so‘m" },
  en: { skip: "Skip", intro: "Intro", search: "presser foot", inStock: "In stock", add: "Add to cart", cart: "Cart", names: ["Presser foot", "Rotary hook", "Bobbin"],
    steps: ["Order sent", "Manager sets the price", "You confirm"], order: "Your order",
    msg: "🧾 Your order is ready to confirm:", total: "💰 Total", yes: "✅ Confirm", no: "❌ Decline", reply: "✅ Thank you! Order confirmed — we are preparing the invoice.", bot: "shop bot", price: "•• ••• UZS" },
};

const язык = () => { try { const l = localStorage.getItem("gm_lang"); return UI[l] ? l : "ru"; } catch { return "ru"; } };
const меньшеДвижения = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
const телефон = () => { try { return matchMedia("(max-width: 760px)").matches; } catch { return false; } };
const прочитать = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
const записать = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } };
const экран = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function узел(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

const ЗНАК = (id) => `<svg viewBox="0 0 512 512" aria-hidden="true"><defs>
  <linearGradient id="${id}a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#f2f4f9"/><stop offset="1" stop-color="#e4e9f2"/></linearGradient>
  <linearGradient id="${id}b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7e9a6"/><stop offset=".42" stop-color="#e3c163"/><stop offset=".74" stop-color="#c79a33"/><stop offset="1" stop-color="#a87b1f"/></linearGradient></defs>
  <rect width="512" height="512" rx="116" fill="url(#${id}a)"/><rect x="5" y="5" width="502" height="502" rx="111" fill="none" stroke="#c8cedd" stroke-width="5"/>
  <circle class="ring" cx="256" cy="256" r="182" fill="none" stroke="url(#${id}b)" stroke-width="14" stroke-linecap="round" transform="rotate(-96 256 256)"/>
  <text x="256" y="312" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="172" font-weight="700" letter-spacing="-6" fill="#16203a">GM</text></svg>`;
const IC = {
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>`,
  cart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.6 12.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L22 7H6"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
  truck: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6h11v10H2zM13 9h4l4 4v3h-8z"/><circle cx="6" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/></svg>`,
  box: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5L12 12l9-4.5M12 12v9"/></svg>`,
  cursor: `<svg viewBox="0 0 24 24" width="28" height="28"><path d="M5 3l14 8-6 1.6L10 19z" fill="#16203a" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
};
// Узбекистан, упрощённый контур; склад и точки без названий городов
const КОНТУР = [[56,45],[58.6,45.55],[61,44.4],[62.1,43.5],[64.9,43.7],[65.5,43.3],[66.1,42.9],[66,42],[66.5,41.9],[67.9,41.1],[68.6,40.7],[69,41.4],[70.4,42.1],[71.2,42.2],[70.9,41.5],[71.8,41.4],[73.1,40.85],[72.7,40.5],[71.7,40.2],[70.6,40.2],[70.4,40.6],[69.5,40.1],[68.7,40.1],[68.6,39.4],[67.4,39.15],[67.7,38.4],[68.2,38],[67.8,37.2],[67.3,37.1],[66.6,37.4],[66.5,38],[65,38.6],[64.2,38.95],[63.5,39.4],[62.4,40.1],[61.9,41.1],[61,41.2],[60,41.8],[60.1,42.2],[58.8,42.6],[58.1,42.4],[57.9,41.9],[56.95,41.3],[56,41.3]];
const пт = ([lon, lat]) => [+((lon - 55.5) * 34).toFixed(1), +((45.8 - lat) * 42).toFixed(1)];
const УЗ = "M" + КОНТУР.map(p => пт(p).join(",")).join(" L") + " Z";
const СКЛАД = пт([69.25, 41.3]);
const ТОЧКИ = [[66.95, 39.65], [64.4, 39.77], [71.8, 40.75], [59.6, 42.45], [67.3, 37.3], [65.8, 38.85]].map(пт);
const МАРШРУТЫ = ТОЧКИ.map(([x, y]) => `M${СКЛАД[0]},${СКЛАД[1]} Q${((СКЛАД[0] + x) / 2).toFixed(1)},${(Math.min(СКЛАД[1], y) - 44).toFixed(1)} ${x},${y}`);

let cssОбещание = null;
function подключитьCss() {
  if (cssОбещание) return cssОбещание;
  cssОбещание = new Promise((ok, fail) => {
    if (document.querySelector("link[data-gi]")) { ok(); return; }
    const l = document.createElement("link"); l.rel = "stylesheet"; l.href = CSS_URL; l.dataset.gi = "1";
    const t = setTimeout(() => fail(new Error("css")), 4000);
    l.onload = () => { clearTimeout(t); ok(); };
    l.onerror = () => { clearTimeout(t); cssОбещание = null; fail(new Error("css")); };
    document.head.append(l);
  });
  return cssОбещание;
}
async function загрузитьНастройки(lang, мс = 2500) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), мс);
  try {
    const r = await fetch(`/api/intro-config?lang=${lang}`, { signal: ctl.signal, credentials: "omit" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
function запомнитьНастройки(c) {
  записать(КЛЮЧ_НАСТРОЕК, { enabled: c.enabled !== false, frequency: c.frequency, seen_version: c.seen_version, howto_button: c.howto_button !== false, tour_mode: c.tour_mode || "intro", at: Date.now() });
}
function отметить(event, extra = {}) {
  try {
    const body = JSON.stringify({ event, device: телефон() ? "mobile" : "desktop", lang: язык(), ...extra });
    navigator.sendBeacon ? navigator.sendBeacon("/api/intro-stat", new Blob([body], { type: "application/json" }))
      : fetch("/api/intro-stat", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => { });
  } catch { }
}

// ========================================================================
//  ПРОИГРЫВАТЕЛЬ: playIntro(cfg, { preview, onEnd })
// ========================================================================
const ДЛИТ = [3300, 3900, 3600, 4600, 2900];

export function playIntro(cfg = {}, opts = {}) {
  const lang = UI[cfg.lang] ? cfg.lang : язык();
  const ui = UI[lang];
  const tx = { ...ТЕКСТЫ_РОЛИКА[lang], ...(cfg.texts || {}) };
  const calm = меньшеДвижения();
  const preview = !!opts.preview;
  const переход = Math.max(300, Math.min(2500, Number(cfg.transition_ms) || 1000));

  const root = узел("div", "gi" + (calm ? " gi-calm" : ""));
  root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true"); root.setAttribute("aria-label", ui.intro);
  const виды = ["foot", "hook", "bobbin", "needle", "case", "knife"];
  const орбита = виды.map((v, i) => {
    // по овалу, без точек строго сверху и снизу — там знак и подпись
    const a = (i / виды.length) * Math.PI * 2 - Math.PI / 3;
    return `<div class="gi-orb" style="--i:${i};--x:${(Math.cos(a) * 40).toFixed(1)}cqmin;--y:${(Math.sin(a) * 23).toFixed(1)}cqmin"><div class="gi-glass gi-part">${деталь(v, "o")}</div></div>`;
  }).join("");
  const карточки = ["foot", "hook", "bobbin"].map((v, i) => `
    <div class="gi-pc${i === 0 ? " tgt" : ""}" style="--i:${i}"><div class="gi-ph"><div class="gi-part">${деталь(v, "c")}</div></div>
      <div class="gi-nm">${экран(ui.names[i])}</div>
      <div class="gi-row"><span class="gi-ok">${экран(ui.inStock)}</span><span class="gi-code">${["LP-236", "CH-021", "SH-006"][i]}</span></div>
      ${i === 0 ? `<div class="gi-qty"><i class="mi">−</i><b>1</b><i class="pl">+</i></div>` : ""}<div class="gi-add">${экран(ui.add)}</div></div>`).join("");

  root.innerHTML = `
    <div class="gi-bg"><i></i><i></i><i></i></div><div class="gi-sweep"></div>
    <div class="gi-stage">
      <section class="gi-s gi-s1"><div class="gi-hello">${орбита}<div class="gi-mark">${ЗНАК("m")}</div><div class="gi-word">GENERAL <b>MODERN</b></div></div></section>
      <section class="gi-s gi-s2"><div class="gi-win gi-glass">
        <div class="gi-bar"><div class="gi-logo"><i>${ЗНАК("l")}</i><span>GENERAL<b>MODERN</b></span></div>
          <div class="gi-search">${IC.search}<b class="typed"></b><span class="gi-caret"></span></div>
          <div class="gi-cart">${IC.cart}<span>${экран(ui.cart)}</span><em class="gi-badge">0</em></div></div>
        <div class="gi-grid">${карточки}</div></div></section>
      <section class="gi-s gi-s3"><div class="gi-duo">
        <div class="gi-card3 gi-glass"><h4>${экран(ui.order)}</h4><div class="st">${ui.steps.map((s, i) => `<div class="gi-step" data-i="${i}"><i>${i + 1}</i><span>${экран(s)}</span></div>`).join("")}</div></div>
        <div class="gi-phone"><div class="gi-ph-top"><i>${ЗНАК("p")}</i><div><b>GENERAL MODERN</b><small>${экран(ui.bot)}</small></div></div>
          <div class="gi-msgs">
            <div class="gi-msg m1">${экран(ui.msg)}<div class="ln"><span>${экран(ui.names[0])} × 3</span><em>${экран(ui.price)}</em></div><div class="ln"><span>${экран(ui.names[1])} × 1</span><em>${экран(ui.price)}</em></div><div class="ln"><b>${экран(ui.total)}</b><em>${экран(ui.price)}</em></div>
              <div class="gi-btns"><span class="pri yes">${экран(ui.yes)}</span><span>${экран(ui.no)}</span></div></div>
            <div class="gi-msg me m2">${экран(ui.yes)}</div><div class="gi-msg m3">${экран(ui.reply)}</div>
          </div></div></div></section>
      <section class="gi-s gi-s4"><div class="gi-ship">
        <div class="gi-boxw">${["foot", "bobbin", "needle"].map((v, i) => `<div class="gi-drop gi-part" style="--i:${i};--dx:${(i - 1) * 70}%">${деталь(v, "d")}</div>`).join("")}
          <div class="gi-box"><div class="b"></div><div class="f l"></div><div class="f r"></div><div class="t"></div><div class="lb">${ЗНАК("x")}</div></div></div>
        <div class="gi-map"><svg viewBox="-20 -40 660 430" aria-hidden="true"><path class="land" d="${УЗ}"/>${МАРШРУТЫ.map((d, i) => `<path class="route" style="--i:${i}" d="${d}"/>`).join("")}
          <g transform="translate(${СКЛАД[0]},${СКЛАД[1]})"><circle class="halo" r="14"/><circle class="wh" r="7"/></g>${ТОЧКИ.map((p, i) => `<g transform="translate(${p[0]},${p[1]})"><circle class="dst" style="--i:${i}" r="6"/></g>`).join("")}</svg>
          <div class="gi-ways"><span class="gi-way" style="--i:0">${IC.truck}Яндекс</span><span class="gi-way" style="--i:1">${IC.box}BTS</span></div></div>
      </div></section>
      <section class="gi-s gi-s5"><div class="gi-home"><div class="gi-pad"></div><div class="gi-parcel"><div class="gi-box"><div class="b"></div><div class="t"></div><div class="lb">${ЗНАК("y")}</div></div><div class="gi-seal">${IC.check}</div></div></div><div class="gi-hero">${ЗНАК("h")}</div></section>
    </div>
    <p class="gi-cap" aria-live="polite"></p>
    <button type="button" class="gi-skip">${экран(ui.skip)} <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 5v14l10-7zM16 5h3v14h-3z"/></svg></button>
    <div class="gi-prog" aria-hidden="true">${ДЛИТ.map(() => "<span><i></i></span>").join("")}</div>
    <div class="gi-cur">${IC.cursor}<i></i></div>`;
  const $ = (s) => root.querySelector(s);
  const сцены = [...root.querySelectorAll(".gi-s")];
  const полоски = [...root.querySelectorAll(".gi-prog i")];
  const cap = $(".gi-cap"), cur = $(".gi-cur"), skip = $(".gi-skip");
  if (cfg.skip_show === false) skip.hidden = true;

  // ---------- время ----------
  const начала = []; let всего = 0; ДЛИТ.forEach(d => { начала.push(всего); всего += d; });
  const метки = []; const на = (t, fn) => метки.push({ t, fn });
  const жив = new Set();
  function подпись(text) {
    cap.innerHTML = "";
    String(text).split(/\s+/).filter(Boolean).forEach((w, i) => {
      const o = узел("span", "w"); const s = узел("span"); s.textContent = w; s.style.setProperty("--i", i); o.append(s);
      if (i) cap.append(document.createTextNode(" ")); cap.append(o);
    });
  }
  let текущая = -1;
  function сцена(i) {
    const было = сцены[текущая];
    if (было) { было.classList.add("out"); setTimeout(() => было.classList.remove("on", "out"), 650); }
    текущая = i; сцены[i].classList.add("on");
    подпись([tx.s1, tx.s2, tx.s3, tx.s4, tx.s5][i]);
    if (i && !calm) { const sw = $(".gi-sweep"); sw.classList.remove("go"); void sw.offsetWidth; sw.classList.add("go"); }
  }
  ДЛИТ.forEach((_, i) => на(начала[i], () => сцена(i)));

  const курсор = (el, d = 550) => {
    if (!el) return;
    const R = root.getBoundingClientRect(), r = el.getBoundingClientRect();
    const x = r.left - R.left + r.width * .55, y = r.top - R.top + r.height * .6;
    cur.classList.add("on");
    if (calm) { cur.style.transform = `translate(${x}px,${y}px)`; return; }
    const из = cur.style.transform || `translate(${R.width * .7}px,${R.height * .8}px)`;
    const a = cur.animate([{ transform: из }, { transform: `translate(${x}px,${y}px)` }], { duration: d, easing: "cubic-bezier(.55,0,.25,1)", fill: "forwards" });
    жив.add(a); a.onfinish = () => жив.delete(a); cur.style.transform = `translate(${x}px,${y}px)`;
  };
  const нажать = (el) => { cur.classList.remove("tap"); void cur.offsetWidth; cur.classList.add("tap"); if (el) { el.classList.add("gi-press"); setTimeout(() => el.classList.remove("gi-press"), 300); } };

  // 2 — поиск, выбор, количество, в корзину
  const S2 = начала[1], tgt = $(".gi-pc.tgt"), typed = $(".typed");
  [...ui.search].forEach((_, k) => на(S2 + 750 + k * 90, () => { typed.textContent = ui.search.slice(0, k + 1); }));
  на(S2 + 1650, () => { $(".gi-grid").classList.add("focus"); tgt.classList.add("pick"); });
  на(S2 + 1900, () => курсор(tgt.querySelector(".pl")));
  [2, 3].forEach((n, k) => на(S2 + 2400 + k * 330, () => { const pl = tgt.querySelector(".pl"); нажать(); pl.classList.add("hit"); setTimeout(() => pl.classList.remove("hit"), 160); const b = tgt.querySelector(".gi-qty b"); b.textContent = n; b.classList.remove("tick"); void b.offsetWidth; b.classList.add("tick"); }));
  на(S2 + 2900, () => курсор(tgt.querySelector(".gi-add"), 380));
  на(S2 + 3300, () => { const add = tgt.querySelector(".gi-add"); нажать(add); лететь(tgt.querySelector(".gi-ph .gi-part"), $(".gi-cart"), () => { const b = $(".gi-badge"); b.textContent = "3"; b.classList.add("show"); }); });
  на(S2 + 3700, () => cur.classList.remove("on"));

  // 3 — шаги заказа и подтверждение в Telegram
  const S3 = начала[2];
  const шаг = (i) => root.querySelectorAll(".gi-step").forEach((e, k) => { e.classList.toggle("done", k < i); e.classList.toggle("on", k === i); });
  на(S3 + 300, () => шаг(0));
  на(S3 + 900, () => { шаг(1); $(".m1").classList.add("show"); });
  на(S3 + 1900, () => курсор($(".m1 .yes")));
  на(S3 + 2500, () => { нажать($(".m1 .yes")); шаг(2); $(".m2").classList.add("show"); });
  на(S3 + 2950, () => { $(".m3").classList.add("show"); root.querySelectorAll(".gi-step").forEach(e => { e.classList.remove("on"); e.classList.add("done"); }); });
  на(S3 + 3300, () => cur.classList.remove("on"));

  // 4 — коробка, потом карта
  на(начала[3] + 2200, () => сцены[3].classList.add("map"));
  // 5 — знак
  на(начала[4] + 1700, () => сцены[4].classList.add("logo"));
  метки.sort((a, b) => a.t - b.t);

  function лететь(из, в, готово) {
    if (calm || !из || !в) { готово(); return; }
    const R = root.getBoundingClientRect(), a = из.getBoundingClientRect(), b = в.getBoundingClientRect();
    const f = узел("div", "gi-fly", из.innerHTML);
    Object.assign(f.style, { left: (a.left - R.left) + "px", top: (a.top - R.top) + "px", width: a.width + "px", height: a.height + "px" });
    root.append(f);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const s = Math.max(.15, b.height / a.height * .8);
    const anim = f.animate([
      { transform: "translate(0,0) scale(1) rotate(0)", opacity: 1 },
      { transform: `translate(${dx * .45}px, ${dy * .45 - a.height * .6}px) scale(.7) rotate(-20deg)`, opacity: 1, offset: .5 },
      { transform: `translate(${dx}px, ${dy}px) scale(${s}) rotate(-40deg)`, opacity: .3 },
    ], { duration: 720, easing: "cubic-bezier(.45,0,.25,1)", fill: "forwards" });
    жив.add(anim); anim.onfinish = () => { жив.delete(anim); f.remove(); готово(); };
  }

  // ---------- ход времени ----------
  let прошло = 0, пред = 0, кадр = 0, пауза = false, конец = false, след = 0;
  function тик(now) {
    кадр = requestAnimationFrame(тик);
    const dt = пред ? Math.min(100, now - пред) : 0; пред = now;
    if (пауза || конец) return;
    прошло += dt;
    while (след < метки.length && метки[след].t <= прошло) { try { метки[след].fn(); } catch { } след++; }
    полоски.forEach((p, i) => p.style.setProperty("--p", Math.max(0, Math.min(1, (прошло - начала[i]) / ДЛИТ[i])).toFixed(3)));
    if (прошло >= всего) закончить("completed");
  }
  function поставитьПаузу(да) { пауза = да; root.classList.toggle("paused", да); жив.forEach(a => { try { да ? a.pause() : a.play(); } catch { } }); }
  const наВидимость = () => поставитьПаузу(document.hidden);
  document.addEventListener("visibilitychange", наВидимость);

  const началось = performance.now();
  function закончить(причина) {
    if (конец) return; конец = true;
    if (!preview) {
      if (причина === "skipped") отметить("skipped", { at_sec: Math.round((performance.now() - началось) / 100) / 10 });
      else отметить("completed");
    }
    раствориться(причина === "completed");
  }
  // знак из финала улетает на место логотипа в шапке, сайт проявляется
  function раствориться(красиво) {
    const html = document.documentElement;
    const знак = $(".gi-hero");
    const вШапке = !calm && красиво && сцены[4].classList.contains("logo") && document.querySelector(".site-header .site-logo svg");
    html.classList.remove("gi-lock"); html.classList.add("gi-reveal");
    const длит = calm ? 350 : (красиво ? переход : Math.min(переход, 650));
    root.querySelectorAll(".gi-cap, .gi-skip, .gi-prog, .gi-cur, .gi-s").forEach(e => { if (!e.contains(знак)) { e.style.transition = `opacity ${Math.round(длит * .5)}ms ease`; e.style.opacity = "0"; } });
    const bg = $(".gi-bg"); bg.style.transition = `opacity ${длит}ms ease`; bg.style.opacity = "0";
    root.style.transition = `background-color ${длит}ms ease`; root.style.backgroundColor = "transparent";
    if (вШапке) {
      const a = знак.getBoundingClientRect(), b = вШапке.getBoundingClientRect();
      if (b.width && a.width) {
        знак.animate([{ transform: "none" }, { transform: `translate(${b.left + b.width / 2 - (a.left + a.width / 2)}px, ${b.top + b.height / 2 - (a.top + a.height / 2)}px) scale(${b.width / a.width})` }],
          { duration: длит, easing: "cubic-bezier(.65,0,.2,1)", fill: "forwards" });
        вШапке.style.opacity = "0";
        setTimeout(() => { вШапке.style.transition = "opacity .25s"; вШапке.style.opacity = ""; }, длит - 60);
      }
    } else { знак.style.transition = `opacity ${длит}ms`; знак.style.opacity = "0"; }
    root.style.pointerEvents = "none";
    setTimeout(() => { убрать(); setTimeout(() => html.classList.remove("gi-reveal"), 1400); opts.onEnd && opts.onEnd(); }, длит + 40);
  }
  function убрать() {
    конец = true; cancelAnimationFrame(кадр);
    document.removeEventListener("visibilitychange", наВидимость);
    document.removeEventListener("keydown", клавиши, true);
    жив.forEach(a => { try { a.cancel(); } catch { } });
    root.remove(); document.documentElement.classList.remove("gi-lock");
  }
  skip.addEventListener("click", () => закончить("skipped"));
  function клавиши(e) {
    if (конец) return;
    if (e.key === "Escape") { e.preventDefault(); закончить("skipped"); }
    else if (e.key === "Tab") { e.preventDefault(); skip.focus(); }
  }
  document.addEventListener("keydown", клавиши, true);
  const задержка = Math.max(0, Math.min(3, Number(cfg.skip_delay) || 0));
  if (задержка) { skip.classList.add("wait"); setTimeout(() => skip.classList.remove("wait"), задержка * 1000); }

  document.body.append(root);
  document.documentElement.classList.add("gi-lock");
  if (!preview) отметить("shown");
  requestAnimationFrame(() => { try { skip.focus({ preventScroll: true }); } catch { } });
  кадр = requestAnimationFrame(тик);
  if (document.hidden) поставитьПаузу(true);
  return { finish: () => закончить("skipped") };
}

// ========================================================================
//  ПЕРВЫЙ ВИЗИТ — вызывается из boot() сайта до отрисовки
// ========================================================================
function подходит() {
  try {
    const ua = navigator.userAgent || "";
    if (/bot|crawl|spider|slurp|lighthouse|headless|preview|yandex|facebookexternalhit|whatsapp|pagespeed/i.test(ua) || navigator.webdriver) return false;
    if (window.Telegram?.WebApp?.initData) return false;
    if (localStorage.getItem("gm_client_token")) return false;
    const h = location.hash.replace(/^#\/?/, "").split("?")[0];
    if (h && h !== "catalog") return false;
    const q = new URLSearchParams(location.search);
    if (q.has("reg") || q.has("tour")) return false;
    if (меньшеДвижения()) return false;
    const c = navigator.connection;
    if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ""))) return false;
    return true;
  } catch { return false; }
}
function уже(cfg) {
  if (cfg.frequency === "session") { try { return sessionStorage.getItem("gm_intro_s") === "1"; } catch { return false; } }
  const r = прочитать(КЛЮЧ_СМОТРЕЛ);
  if (!r || (Number(r.v) || 0) < (Number(cfg.seen_version) || 1)) return false;
  if (!cfg.frequency || cfg.frequency === "once") return true;
  return Date.now() - (Number(r.at) || 0) < (cfg.frequency === "7d" ? 7 : 30) * ДЕНЬ;
}
const показывать = (c) => c && c.enabled !== false && (c.tour_mode || "intro") === "intro";
function отметитьПросмотр(cfg) {
  записать(КЛЮЧ_СМОТРЕЛ, { v: Number(cfg.seen_version) || 1, at: Date.now() });
  try { sessionStorage.setItem("gm_intro_s", "1"); } catch { }
}

export async function maybeShowIntro() {
  let q; try { q = new URLSearchParams(location.search); } catch { q = new URLSearchParams(); }
  const режим = q.get("intro");
  if (режим === "0") return false;
  const lang = язык();
  // ?intro=1 — показать опубликованный, ?intro=draft — черновик из склада
  if (режим === "1" || режим === "draft") {
    try { await подключитьCss(); } catch { return false; }
    let cfg = {}; try { cfg = await загрузитьНастройки(lang); } catch { }
    if (режим === "draft") { const d = прочитать("gm_intro_draft"); if (d?.texts) cfg.texts = d.texts[lang] || cfg.texts; }
    playIntro({ ...cfg, lang }, { preview: true });
    return true;
  }
  if (!подходит()) return false;
  const сохр = прочитать(КЛЮЧ_НАСТРОЕК);
  if (сохр && (!показывать(сохр) || уже(сохр))) {
    if (Date.now() - (Number(сохр.at) || 0) > 3600e3) (window.requestIdleCallback || setTimeout)(() => загрузитьНастройки(lang, 6000).then(запомнитьНастройки).catch(() => { }), 3000);
    return false;
  }
  // кандидат: сразу закрываем сайт светлой подложкой со знаком (как заставка)
  const html = document.documentElement;
  const щит = узел("div", "", `<div style="width:96px;height:96px;filter:drop-shadow(0 16px 30px rgba(28,43,74,.2))">${ЗНАК("sh")}</div>`);
  щит.setAttribute("aria-hidden", "true");
  щит.style.cssText = "position:fixed;inset:0;z-index:10001;display:grid;place-items:center;background:radial-gradient(120% 90% at 50% 0%,#f7f8fc 0%,#eef1f7 55%,#e6eaf3 100%);transition:opacity .4s ease";
  document.body.append(щит); html.classList.add("gi-lock");
  const снятьЩит = () => { щит.style.opacity = "0"; setTimeout(() => щит.remove(), 420); };
  let cfg = null;
  try { [cfg] = await Promise.all([загрузитьНастройки(lang), подключитьCss()]); запомнитьНастройки(cfg); } catch { cfg = null; }
  if (!cfg || !показывать(cfg) || уже(cfg)) { html.classList.remove("gi-lock"); снятьЩит(); return false; }
  try { playIntro({ ...cfg, lang }, { onEnd: () => отметитьПросмотр(cfg) }); }
  catch (e) { console.warn("[intro]", e); html.classList.remove("gi-lock"); }
  снятьЩит();
  return true;
}
