// ========================================================================
//  SEO: работа с текстом — транслитерация, адреса (slug), экранирование,
//  нормализация поисковых запросов (опечатки, раскладка, синонимы).
// ========================================================================

export { translit, компакт, разобратьЗапрос, подходитЗапрос } from "../../js/searchnorm.js";
import { translit } from "../../js/searchnorm.js";

export function slugify(s, max = 70) {
  const base = translit(s)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (base.length <= max) return base;
  const cut = base.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf("-"), 20)).replace(/-+$/, "");
}

export const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// XML не знает &#39; в старых парсерах — экранируем отдельно
export const xesc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&apos;")
  // управляющие символы ломают XML целиком
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

// Чистое название: двойные пробелы, пробелы у скобок, хвостовая пунктуация
export function cleanName(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .replace(/\(\s+/g, "(").replace(/\s+\)/g, ")")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/[\s,.;:–-]+$/, "")
    .trim();
}

export function cut(s, n) {
  s = String(s || "").trim();
  if (s.length <= n) return s;
  const c = s.slice(0, n - 1);
  const i = c.lastIndexOf(" ");
  return (i > n * 0.6 ? c.slice(0, i) : c).replace(/[\s,.;:–-]+$/, "") + "…";
}

