// ========================================================================
//  ПОЛИТИКА БЕЗОПАСНОСТИ КОНТЕНТА (CSP) — пока в режиме НАБЛЮДЕНИЯ.
//
//  Заголовок Content-Security-Policy-Report-Only ничего не блокирует:
//  браузер только присылает отчёт на /api/csp-report, если страница грузит
//  что-то вне списка. Когда отчёты затихнут (кроме мусора от расширений),
//  политику можно включать по-настоящему — уже без риска сломать сайт.
//
//  'unsafe-inline' пока оставлен: на страницах много встроенных скриптов
//  и обработчиков onclick. Их вынос — отдельный большой шаг.
//
//  Та же строка стоит в deploy/nginx-security-headers.conf — их равенство
//  проверяет тест _tools/tests/t-csp.mjs.
// ========================================================================
export const CSP_НАБЛЮДЕНИЕ = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://esm.sh https://telegram.org https://cdn.jsdelivr.net https://www.googletagmanager.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://esm.sh https://open.er-api.com https://*.google-analytics.com https://www.googletagmanager.com",
  "worker-src 'self' blob:",
  "frame-src 'self' https://t.me https://telegram.org",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "report-uri /api/csp-report",
].join("; ");
