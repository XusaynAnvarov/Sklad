// ========================================================================
//  ЭФФЕКТЫ: свечение за курсором + переключатель светлой/тёмной темы
//  Используется и в админке, и в каталоге.
// ========================================================================

import { iconSvg } from "./icons.js?v=20260821i";

const THEME_KEY = "sklad_theme";

// ---------- Свечение за курсором ----------
export function initCursorGlow() {
  if (document.querySelector(".cursor-glow")) return;
  if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return; // не на тач-экранах
  const glow = document.createElement("div");
  glow.className = "cursor-glow";
  document.body.appendChild(glow);
  let x = innerWidth / 2, y = innerHeight / 2, tx = x, ty = y;
  addEventListener("mousemove", (e) => { tx = e.clientX; ty = e.clientY; });
  addEventListener("mousedown", () => glow.classList.add("click"));
  addEventListener("mouseup", () => glow.classList.remove("click"));
  (function loop() {
    x += (tx - x) * 0.18; y += (ty - y) * 0.18;
    glow.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    requestAnimationFrame(loop);
  })();
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
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
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

  function frame() {
    // вкладка скрыта — полностью останавливаем цикл, а не крутим его вхолостую
    if (document.hidden) { raf = 0; return; }
    raf = requestAnimationFrame(frame);
    if ((document.documentElement.getAttribute("data-theme") || "light") !== "dark") { ctx.clearRect(0, 0, w, h); return; } // частицы только на тёмной
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

  addEventListener("resize", resize, { passive: true });
  // вернулись на вкладку — запускаем цикл заново
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !raf) frame(); });
  resize();
  frame();
}

// ---------- Тема ----------
export function initTheme() {
  // по умолчанию — тёмная тема («чёрный и изумруд»).
  // Разовый переход на новый дизайн: у кого раньше стояла светлая — включаем тёмную
  // один раз (метка sklad_theme_v2), дальше выбор пользователя снова уважается.
  try {
    if (!localStorage.getItem("sklad_theme_v2")) {
      localStorage.setItem(THEME_KEY, "dark");
      localStorage.setItem("sklad_theme_v2", "1");
    }
  } catch {}
  const saved = localStorage.getItem(THEME_KEY) || "dark";
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
  return document.documentElement.getAttribute("data-theme") || "dark";
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
  const sync = () => { btn.innerHTML = currentTheme() === "dark" ? iconSvg("sun", { size: 16 }) + " Светлая" : iconSvg("moon", { size: 16 }) + " Тёмная"; };
  sync();
  btn.addEventListener("click", () => { toggleTheme(); sync(); onChange?.(); });
  return btn;
}
