// ========================================================================
//  ЭФФЕКТЫ: свечение за курсором + переключатель светлой/тёмной темы
//  Используется и в админке, и в каталоге.
// ========================================================================

import { iconSvg } from "./icons.js?v=20261103i";
import { сменитьТемуВолной } from "./temavolna.js?v=20261103i";

const THEME_KEY = "sklad_theme";

// ---------- Свечение за курсором ----------
export function initCursorGlow() {
  if (document.querySelector(".cursor-glow")) return;
  if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return; // не на тач-экранах
  const glow = document.createElement("div");
  glow.className = "cursor-glow";
  document.body.appendChild(glow);
  let x = innerWidth / 2, y = innerHeight / 2, tx = x, ty = y;
  let raf = 0;

  // ЦИКЛ КРУТИЛСЯ ВСЕГДА — В ЭТОМ И БЫЛА БЕДА.
  //
  // Раньше здесь стоял requestAnimationFrame без единого условия: пятно
  // переписывало себе transform шестьдесят раз в секунду вечно. И когда
  // мышь не двигалась, и когда вкладка скрыта, и в светлой теме, где
  // пятна нет вовсе (css/theme.css: html[data-theme="light"] .cursor-glow
  // { display: none }). А у пятна стоит mix-blend-mode: screen — значит
  // на каждый такой кадр браузер заново смешивает область 420×420 со
  // всем, что под ней. Это и есть «лагает в чёрном режиме».
  //
  // Теперь кадр запрашивается, только пока пятну есть куда ехать, и
  // цикл сам засыпает, когда доехал.
  const нужно = () =>
    !document.hidden &&
    (document.documentElement.getAttribute("data-theme") || "light") === "dark";

  function шаг() {
    raf = 0;
    if (!нужно()) return;
    x += (tx - x) * 0.18; y += (ty - y) * 0.18;
    glow.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    // Доехали — спим до следующего движения мыши.
    if (Math.abs(tx - x) > 0.1 || Math.abs(ty - y) > 0.1) разбудить();
  }
  function разбудить() { if (!raf && нужно()) raf = requestAnimationFrame(шаг); }

  addEventListener("mousemove", (e) => { tx = e.clientX; ty = e.clientY; разбудить(); });
  addEventListener("mousedown", () => { glow.classList.add("click"); разбудить(); });
  addEventListener("mouseup", () => { glow.classList.remove("click"); разбудить(); });
  document.addEventListener("visibilitychange", разбудить);
  // Смена темы светлая → тёмная: пятно появляется и должно догнать курсор.
  new MutationObserver(разбудить).observe(document.documentElement, {
    attributes: true, attributeFilter: ["data-theme"],
  });
  разбудить();
}

// ---------- Анимированный фон: летящие частицы (звёзды) ----------
export function initStarfield() {
  if (document.querySelector(".bg-stars")) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  // НЕ запускаем на телефонах и планшетах. Каждый кадр рисуется до 90 кругов
  // со свечением (shadowBlur) — это самая тяжёлая операция canvas, и 60 раз в
  // секунду она съедает весь процессор: страница с товарами намертво зависала.
  // На узких экранах фон и так скрыт стилями — а раньше он оставался невидимым,
  // но продолжал рисоваться.
  if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return;
  if (window.innerWidth <= 860) return;
  const canvas = document.createElement("canvas");
  canvas.className = "bg-stars";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  let w = 0, h = 0, stars = [], raf = 0;

  // цвета берём из текущей темы (CSS-переменные)
  const colors = () => {
    const cs = getComputedStyle(document.documentElement);
    return [
      (cs.getPropertyValue("--accent") || "#7c5cff").trim(),
      (cs.getPropertyValue("--accent2") || "#22d3ee").trim(),
      "#ffffff",
    ];
  };
  let palette = colors();

  function resize() {
    // ХОЛСТ ДЕРЖИМ В ОДИН ПИКСЕЛЬ НА ТОЧКУ, А НЕ В ДВА.
    //
    // Раньше тут стоял devicePixelRatio до 2: на retina-ноутбуке холст
    // становился 2880×1720, и одна только его очистка каждый кадр стоила
    // вчетверо дороже. Замерено на 1440×860: сама clearRect — 1.72 мс из
    // 16.7 мс кадра, а все 48 частиц поверх неё — ещё 0.6 мс. То есть
    // платили мы за чистку пустоты, а не за звёзды.
    //
    // Частицы — мягкие светящиеся точки радиусом в пару пикселей; разницы
    // между одним и двумя пикселями на точку на них не видно.
    const dpr = 1;
    w = canvas.width = innerWidth * dpr;
    h = canvas.height = innerHeight * dpr;
    canvas.style.width = innerWidth + "px";
    canvas.style.height = innerHeight + "px";
    const count = Math.round((innerWidth * innerHeight) / 26000); // плотность
    stars = Array.from({ length: Math.max(36, Math.min(90, count)) }, () => spawn(dpr));
    palette = colors();
  }
  function spawn(dpr) {
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      r: (Math.random() * 1.6 + 0.5) * dpr,
      vx: (Math.random() - 0.5) * 0.18 * dpr,
      vy: (Math.random() - 0.5) * 0.18 * dpr,
      a: Math.random() * Math.PI * 2,             // фаза мерцания
      sp: Math.random() * 0.02 + 0.005,           // скорость мерцания
      c: palette[(Math.random() * palette.length) | 0],
    };
  }

  // В СВЕТЛОЙ ТЕМЕ ЦИКЛ ОСТАНАВЛИВАЕМ СОВСЕМ.
  //
  // Раньше он продолжал крутиться и каждый кадр звал clearRect на холст
  // во весь экран — при том что в светлой теме холст скрыт стилями
  // (css/theme.css: html[data-theme="light"] .bg-stars { display: none }).
  // Это 1.72 мс кадра, потраченные на очистку невидимого.
  const тёмная = () => (document.documentElement.getAttribute("data-theme") || "light") === "dark";

  function frame() {
    // вкладка скрыта или тема светлая — полностью останавливаем цикл,
    // а не крутим его вхолостую
    if (document.hidden || !тёмная()) { raf = 0; return; }
    raf = requestAnimationFrame(frame);
    ctx.clearRect(0, 0, w, h);
    for (const s of stars) {
      s.x += s.vx; s.y += s.vy; s.a += s.sp;
      if (s.x < 0) s.x = w; else if (s.x > w) s.x = 0;
      if (s.y < 0) s.y = h; else if (s.y > h) s.y = 0;
      const tw = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(s.a)); // мерцание
      ctx.beginPath();
      ctx.globalAlpha = tw * 0.85;
      ctx.shadowBlur = s.r * 4;
      ctx.shadowColor = s.c;
      ctx.fillStyle = s.c;
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }

  const пустить = () => { if (!raf && !document.hidden && тёмная()) frame(); };
  addEventListener("resize", resize, { passive: true });
  // вернулись на вкладку — запускаем цикл заново
  document.addEventListener("visibilitychange", пустить);
  // включили тёмную тему — звёзды должны полететь снова
  new MutationObserver(пустить).observe(document.documentElement, {
    attributes: true, attributeFilter: ["data-theme"],
  });
  resize();
  пустить();
}

// ---------- Тема ----------
export function initTheme() {
  // По умолчанию — светлая тема: склад идёт в пару к сайту, а тот с
  // переходом на стекло стал светлым (js/site/app.js, gm_theme_v3).
  // Разовый перевод: у кого стояла тёмная — включаем светлую один раз
  // (метка sklad_theme_v3), дальше выбор человека снова уважается —
  // переключатель в шапке никуда не делся.
  //
  // Прежняя метка sklad_theme_v2 переводила ровно наоборот, на тёмную.
  // Оставлять её нельзя: она сработала бы у новых людей раньше нашей и
  // вернула бы тёмную. Поэтому ставим обе сразу.
  try {
    if (!localStorage.getItem("sklad_theme_v3")) {
      localStorage.setItem(THEME_KEY, "light");
      localStorage.setItem("sklad_theme_v2", "1");
      localStorage.setItem("sklad_theme_v3", "1");
    }
  } catch {}
  const saved = localStorage.getItem(THEME_KEY) || "light";
  applyTheme(saved);
}
export function applyTheme(mode) {
  const root = document.documentElement;
  // глушим CSS-переходы на момент смены темы, чтобы не лагало
  root.classList.add("no-theme-anim");
  root.setAttribute("data-theme", mode);
  localStorage.setItem(THEME_KEY, mode);
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("no-theme-anim")));
}
export function currentTheme() {
  return document.documentElement.getAttribute("data-theme") || "light";
}
export function toggleTheme() {
  const next = currentTheme() === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
}

// Кнопка-переключатель (☀/🌙). onChange — колбэк после переключения.
export function makeThemeToggle(onChange) {
  const btn = document.createElement("button");
  btn.className = "theme-toggle";
  // Отступ между значком и подписью — такой же, как у «На сайт» и «Выход».
  // Ставим прямо на кнопке: в общем стиле он 8px, и правило из шапки его
  // не всегда перебивало.
  btn.style.gap = "6px";
  // Значок 15 и подпись в своей обёртке — как у соседних «На сайт» и
  // «Выход». Раньше значок был 16, а подпись шла простым текстом после
  // пробела: отступ получался больше, и кнопка выбивалась из ряда.
  const sync = () => {
    const тёмная = currentTheme() === "dark";
    btn.innerHTML = iconSvg(тёмная ? "sun" : "moon", { size: 15 })
      + "<span>" + (тёмная ? "Светлая" : "Тёмная") + "</span>";
  };
  sync();
  // Тема раскрывается кругом из самой кнопки (js/temavolna.js).
  // Подпись и значок меняем внутри того же перехода — иначе кнопка
  // переобувается раньше, чем волна до неё дойдёт.
  btn.addEventListener("click", () => {
    сменитьТемуВолной(btn, () => { toggleTheme(); sync(); onChange?.(); });
  });
  return btn;
}
