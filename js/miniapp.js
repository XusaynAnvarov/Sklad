// ========================================================================
//  ОБЩЕЕ ДЛЯ ДВУХ МИНИ-ПРИЛОЖЕНИЙ — склада (для владельца) и заказа
//  (для клиентов). Оба живут внутри Telegram и одинаково ведут себя на
//  компьютере: там окно Telegram узкое, и его нужно уметь развернуть.
// ========================================================================
import { el } from "./el.js?v=20260902b";
import { icon } from "./icons.js?v=20260902b";

const TG = () => (window.Telegram && window.Telegram.WebApp) || null;

// Компьютер ли это. На телефоне приложение и так во весь экран,
// поэтому кнопка «Развернуть» там не нужна — и не показывается.
// Смотрим на платформу, а не на ширину: окно Telegram на компьютере
// узкое, и по ширине его не отличить от телефона.
export function isDesktop() {
  const t = TG();
  const p = String((t && t.platform) || "").toLowerCase();
  return p === "tdesktop" || p === "macos" || p === "web" || p === "weba" || p === "webk";
}

// Умеет ли эта версия Telegram разворачивать окно на весь экран.
// Не умеет — кнопки просто нет, вместо неё не будет мёртвого значка.
export const умеетВесьЭкран = () =>
  isDesktop() && typeof (TG() || {}).requestFullscreen === "function";

// Кнопка «Развернуть» для шапки. Возвращает null, если она не нужна.
export function кнопкаРазвернуть() {
  if (!умеетВесьЭкран()) return null;
  const b = el("button.mini-full", { title: "Развернуть на весь экран" }, [icon("arrow-up-right", { size: 17 })]);
  b.addEventListener("click", () => {
    const t = TG();
    try { t.isFullscreen ? t.exitFullscreen() : t.requestFullscreen(); } catch { }
  });
  return b;
}
