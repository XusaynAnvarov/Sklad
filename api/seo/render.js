// ========================================================================
//  SEO: HTML публичных страниц (сервер собирает их целиком — поисковик
//  получает полный текст, фото и разметку даже без JavaScript).
//
//  Страницы лёгкие: стили встроены, скриптов нет (кроме GA4, если он
//  подключён в настройках). Покупатель отсюда идёт в магазин (SPA) —
//  кнопка «Заказать» открывает каталог сайта с этим товаром.
// ========================================================================
import { esc, cut } from "./text.js";
import { T, LANGS, prefix, HREFLANG, OG_LOCALE } from "./i18n.js";
import { настройки } from "./store.js";

export const BASE = () => String(process.env.PUBLIC_URL || "https://generalmodern.uz").replace(/\/+$/, "");
export const НА_СТРАНИЦЕ = 48;

// ---------- адреса ----------
export const uProduct = (lang, т) => `${prefix(lang)}/p/${т.slug}`;
export const uCat = (lang, slug, page = 1) => `${prefix(lang)}/c/${slug}${page > 1 ? "?page=" + page : ""}`;
export const uCats = (lang) => `${prefix(lang)}/c/`;
export const uFaq = (lang) => `${prefix(lang)}/faq`;
export const uHome = (lang) => (lang === "ru" ? "/" : `${prefix(lang)}/c/`);
export const uImg = (т, n = 1, w = 0) => `/img/p/${т.slug}-${n}.jpg${w ? "?w=" + w : ""}`;
export const abs = (u) => BASE() + u;

export function имяКат(cat, lang) { return cat[lang] || cat.ru; }
export function статусТекст(s, lang) { return T[lang][s] || T[lang].out_stock; }

// Заголовок страницы товара: «<название> (<артикул>) — купить в Узбекистане»
export function seoTitle(т, lang) {
  if (т.ov.title && lang === "ru") return т.ov.title;
  const имя = т.sku && !т.name.toLowerCase().includes(т.sku.toLowerCase()) ? `${т.name} ${т.sku}` : т.name;
  // Название с артикулом важнее марки магазина: если не помещается —
  // сначала уходит «| GENERAL MODERN», и только длинное название режется.
  const купить = ` — ${T[lang].titleSuffix}`;
  const t = cut(имя, 75 - купить.length) + купить;
  return t.length <= 58 ? t + " | GENERAL MODERN" : t;
}
export function seoDesc(т, lang) {
  if (т.ov.description && lang === "ru") return cut(т.ov.description, 158);
  return cut(T[lang].prodDesc({ ...т, statusText: статусТекст(т.status, lang) }, имяКат(т.cat, lang)), 158);
}
// alt фото: название + артикул + код + номер ракурса
export function altФото(т, n, lang) {
  const части = [т.name];
  if (т.sku && !т.name.toLowerCase().includes(т.sku.toLowerCase())) части.push(т.sku);
  части.push(`(${T[lang].code} ${т.code})`);
  if (n > 1) части.push(`— ${T[lang].photos.toLowerCase()} ${n}`);
  return части.join(" ");
}

const ld = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`;

// Номер магазина по умолчанию — тот же, что в config.js (PHONE): на
// случай, если в настройках SEO телефон ещё не заполнен.
const ТЕЛЕФОН_ПО_УМОЛЧАНИЮ = "+998 97 409 01 19";

// Телефонов может быть несколько: «+998…, +998…»
export function телефоны() {
  return String(настройки().phone || "").split(/[,;]/).map(x => x.trim()).filter(x => /\d{7,}/.test(x.replace(/\D/g, "")));
}

// ---------- организация (одна на весь сайт) ----------
export function организация() {
  const s = настройки();
  const org = {
    "@type": "OnlineStore",
    "@id": abs("/#organization"),
    name: s.business_name || "GENERAL MODERN",
    url: abs("/"),
    logo: abs("/icon-512.png"),
    image: abs("/icon-512.png"),
    description: "Магазин запчастей и принадлежностей для промышленных и бытовых швейных машин в Узбекистане.",
    areaServed: { "@type": "Country", name: "Uzbekistan" },
    knowsLanguage: ["ru", "uz", "en"],
  };
  const same = [s.telegram].filter(u => /^https:\/\//.test(u || ""));
  if (same.length) org.sameAs = same;
  const phones = телефоны();
  if (phones.length || s.email) {
    org.contactPoint = (phones.length ? phones : [""]).map(ph => ({ "@type": "ContactPoint", contactType: "sales",
      ...(ph ? { telephone: ph } : {}), ...(s.email ? { email: s.email } : {}),
      areaServed: "UZ", availableLanguage: ["Russian", "Uzbek", "English"] }));
  }
  if (s.street && s.city) {
    org.address = { "@type": "PostalAddress", streetAddress: s.street, addressLocality: s.city,
      ...(s.region ? { addressRegion: s.region } : {}), ...(s.postal ? { postalCode: s.postal } : {}),
      addressCountry: s.country || "UZ" };
  }
  return org;
}
function localBusiness() {
  const s = настройки();
  if (!s.local_business || !s.street || !s.city) return null;
  const lb = { "@type": "Store", "@id": abs("/#store"), name: s.business_name || "GENERAL MODERN", url: abs("/"),
    image: abs("/icon-512.png"), parentOrganization: { "@id": abs("/#organization") },
    address: организация().address };
  if (телефоны()[0]) lb.telephone = телефоны()[0];
  if (s.lat && s.lng) lb.geo = { "@type": "GeoCoordinates", latitude: Number(s.lat), longitude: Number(s.lng) };
  if (s.hours) lb.openingHours = String(s.hours).split(/\s*;\s*/).filter(Boolean);
  return lb;
}
const website = () => ({
  "@type": "WebSite", "@id": abs("/#website"), url: abs("/"), name: "GENERAL MODERN",
  inLanguage: ["ru", "uz", "en"], publisher: { "@id": abs("/#organization") },
  potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: abs("/search?q={search_term_string}") },
    "query-input": "required name=search_term_string" },
});
const крошкиLD = (items) => ({
  "@type": "BreadcrumbList",
  itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: abs(it.url) })),
});

// ---------- общий каркас ----------
// Версия стилей магазина — та же, что у главной (sw.js → BUILD), чтобы
// после выкладки браузер не держал старые css.
import { readFileSync } from "fs";
let ВЕРСИЯ = "1";
try { ВЕРСИЯ = (/const BUILD = "([^"]+)"/.exec(readFileSync(new URL("../../sw.js", import.meta.url), "utf8")) || [])[1] || "1"; } catch { }

// Оформление берём у магазина: шапка, фон, карточки товара, лента категорий
// и анимации (css/site.css + css/glassos-site.css). Здесь — только то, чего
// в магазине нет: хлебные крошки, страница товара, вопросы-ответы.
const CSS = `
.ssr-main{max-width:1240px;margin:0 auto}
.crumbs{font-size:13px;color:var(--muted);margin:4px 0 16px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.crumbs a{color:inherit;text-decoration:none;transition:color var(--t-fast) var(--ease)}.crumbs a:hover{color:var(--text)}
.ssr-h1{font-size:clamp(24px,3vw,32px);font-weight:600;letter-spacing:-.02em;color:var(--text);margin:0 0 12px;line-height:1.15;text-wrap:balance}
.ssr-h2{font-size:clamp(18px,2.2vw,22px);font-weight:600;color:var(--text);margin:32px 0 16px;letter-spacing:-.01em}
.ssr-h3{font-size:1rem;font-weight:600;color:var(--text);margin:20px 0 8px}
.lead{color:var(--muted);max-width:860px;margin:0 0 24px;line-height:1.6;font-size:15px}
.mono{font-family:var(--mono)}
.card{background:var(--white);border:1px solid var(--line);border-radius:20px}
a.card{text-decoration:none;color:var(--text);transition:border-color var(--t-fast) var(--ease),box-shadow var(--t-fast) var(--ease)}
a.card:hover{border-color:var(--line-strong);box-shadow:0 8px 24px rgba(16,24,40,.08)}
.prod{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:24px}
@media (max-width:860px){.prod{grid-template-columns:1fr}}
.gal{padding:16px}.gal .main{aspect-ratio:1/1;object-fit:contain;width:100%;padding:6%;background:var(--img-bg);border-radius:12px;display:block}
.gal .noimg{aspect-ratio:1/1;display:grid;place-items:center;background:var(--img-bg);border-radius:12px;color:var(--muted);font-family:var(--mono);font-size:1.25rem}
.thumbs{display:flex;gap:8px;margin-top:12px;overflow-x:auto}.thumbs img{width:76px;height:76px;object-fit:contain;padding:4px;background:var(--img-bg);border-radius:8px;border:1px solid var(--line);transition:border-color var(--t-fast) var(--ease)}.thumbs a:hover img{border-color:var(--line-strong)}
.info{padding:24px}.info p{color:var(--text);line-height:1.6}
.facts{width:100%;border-collapse:collapse;margin:8px 0 16px}.facts th,.facts td{text-align:left;padding:12px 0;border-bottom:1px solid var(--border);vertical-align:top;font-size:15px;color:var(--text)}
.facts th{color:var(--muted);font-weight:500;width:42%;padding-right:12px}.facts a{color:var(--brass);text-decoration:none;font-weight:500}.facts a:hover{text-decoration:underline;text-underline-offset:2px}
.st{font-weight:500}.st.in_stock{color:var(--ok)}.st.out_stock{color:var(--muted)}.st.soon{color:var(--soon)}
.how{margin:0 0 20px;padding-left:20px;color:var(--muted);font-size:15px}.how li{margin:4px 0}
.cta{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
.ssr-btn{text-decoration:none}
.ssr-ghost{display:inline-flex;align-items:center;gap:8px;padding:12px 20px;border-radius:var(--radius-sm);border:1px solid var(--border);background:transparent;color:var(--text);text-decoration:none;font-size:.875rem;font-weight:500;transition:background-color var(--t-fast) var(--ease)}
.ssr-ghost:hover{background:var(--bg2)}
a.product-card{text-decoration:none;color:inherit}
.product-sku .sku-code{font-family:var(--mono);color:var(--text)}
.cats{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
.cats a{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:16px;font-weight:500}
.cats a span{color:var(--muted);font-weight:500;font-size:13px;white-space:nowrap;font-variant-numeric:tabular-nums}
a.rail-item{text-decoration:none;color:inherit;display:flex;justify-content:space-between}
.pager{display:flex;gap:8px;flex-wrap:wrap;margin:24px 0}.pager a,.pager span{padding:8px 12px;border-radius:10px;border:1px solid var(--border);background:var(--white);text-decoration:none;font-size:14px;color:var(--text);font-weight:500;font-variant-numeric:tabular-nums}
.pager a:hover{border-color:var(--line-strong)}
.pager span{background:var(--navy);color:#fff;border-color:var(--navy)}
form.s{display:flex;gap:8px;margin:0 0 20px;max-width:620px}form.s input{flex:1;min-width:0;padding:12px 16px;border-radius:12px;border:1px solid var(--border);background:var(--white);color:var(--text);font:inherit;outline:none;transition:border-color var(--t-fast) var(--ease)}
form.s input:focus{border-color:var(--navy)}
.faq details{padding:16px 20px;margin-bottom:12px}.faq summary{font-weight:600;cursor:pointer;color:var(--text)}.faq details p{margin:12px 0 0;color:var(--text);line-height:1.6}.faq a{color:var(--brass)}
.ssr-lang{display:inline-flex;gap:2px;padding:2px;border-radius:10px;border:1px solid var(--border)}
.ssr-lang a{padding:4px 8px;border-radius:8px;font-size:12px;font-weight:600;color:var(--muted);text-decoration:none}
.ssr-lang a[aria-current]{background:var(--navy);color:#fff}
html[data-site-theme="dark"] .pager span,html[data-site-theme="dark"] .ssr-lang a[aria-current]{color:#17140c}
@media (max-width:640px){.info{padding:16px}}
`;

function analytics() {
  const id = настройки().ga4_id;
  if (!/^G-[A-Z0-9]{4,20}$/.test(id || "")) return "";
  return `<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${id}');</script>`;
}
function verification() {
  const s = настройки();
  const ok = (v) => /^[A-Za-z0-9_\-]{6,100}$/.test(v || "");
  return [
    ok(s.verify_google) ? `<meta name="google-site-verification" content="${esc(s.verify_google)}">` : "",
    ok(s.verify_yandex) ? `<meta name="yandex-verification" content="${esc(s.verify_yandex)}">` : "",
    ok(s.verify_bing) ? `<meta name="msvalidate.01" content="${esc(s.verify_bing)}">` : "",
  ].join("");
}

// alternates: { ru: "/p/..", uz: "/uz/p/..", en: "/en/p/.." }
export function страница({ lang, title, desc, path, alternates, body, jsonld = [], robots = "index,follow", image, ogType = "website", active = "" }) {
  const t = T[lang];
  const alt = alternates || null;
  const altLinks = alt ? LANGS.map(l => `<link rel="alternate" hreflang="${HREFLANG[l]}" href="${esc(abs(alt[l]))}">`).join("")
    + `<link rel="alternate" hreflang="x-default" href="${esc(abs(alt.ru))}">` : "";
  const langNav = alt ? `<span class="ssr-lang">${LANGS.map(l => l === lang
    ? `<a aria-current="true" href="${esc(alt[l])}" hreflang="${l}">${l.toUpperCase()}</a>`
    : `<a href="${esc(alt[l])}" hreflang="${l}" lang="${l}">${l.toUpperCase()}</a>`).join("")}</span>` : "";
  const s = настройки();
  const graph = { "@context": "https://schema.org", "@graph": [организация(), website(), ...(localBusiness() ? [localBusiness()] : []), ...jsonld] };
  const контакты = [
    ...телефоны().map(ph => `<a href="tel:${esc(ph.replace(/[^\d+]/g, ""))}">${esc(ph)}</a>`),
    s.telegram ? `<a href="${esc(s.telegram)}" rel="noopener">Telegram</a>` : "",
    s.street && s.city ? `<span>${esc(s.street)}, ${esc(s.city)}</span>` : "",
    s["hours_" + lang] ? `<span>${esc(s["hours_" + lang])}</span>` : "",
  ].filter(Boolean).join(" · ");
  const тел = телефоны()[0] || ТЕЛЕФОН_ПО_УМОЛЧАНИЮ;
  const телШапка = `<a class="site-phone" href="tel:+${esc(тел.replace(/\D/g, ""))}" aria-label="${esc(тел)}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg><span>${esc(тел)}</span></a>`;
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="${robots}${robots.startsWith("index") ? ",max-image-preview:large" : ""}">
<link rel="canonical" href="${esc(abs(path))}">
${altLinks}
<meta property="og:type" content="${ogType}"><meta property="og:site_name" content="GENERAL MODERN">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(abs(path))}"><meta property="og:locale" content="${OG_LOCALE[lang]}">
<meta property="og:image" content="${esc(abs(image || "/icon-512.png"))}">
<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">
<meta name="theme-color" content="#eef1f7">
<script>try{var t=localStorage.getItem("gm_site_theme");document.documentElement.setAttribute("data-site-theme",t==="dark"?"dark":"light")}catch(e){document.documentElement.setAttribute("data-site-theme","light")}</script>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap">
<link rel="stylesheet" href="/css/site.css?v=${ВЕРСИЯ}"><link rel="stylesheet" href="/css/glassos-site.css?v=${ВЕРСИЯ}">
<link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" href="/favicon-96.png" type="image/png" sizes="96x96"><link rel="icon" href="/icon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon-180.png">
${verification()}
<style>${CSS}</style>
${ld(graph)}
${analytics()}
</head>
<body>
<div id="site-app">
<header class="site-header"><div class="site-header-inner">
<a class="site-logo" href="${uHome(lang)}"><svg class="gm-znak" width="36" height="36" viewBox="0 0 512 512" aria-hidden="true"><defs><linearGradient id="hst" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#f2f4f9"/><stop offset="1" stop-color="#e4e9f2"/></linearGradient><linearGradient id="hzl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7e9a6"/><stop offset=".42" stop-color="#e3c163"/><stop offset=".74" stop-color="#c79a33"/><stop offset="1" stop-color="#a87b1f"/></linearGradient></defs><rect width="512" height="512" rx="116" fill="url(#hst)"/><rect x="5" y="5" width="502" height="502" rx="111" fill="none" stroke="#c8cedd" stroke-width="5"/><circle class="gm-koltso" cx="256" cy="256" r="182" fill="none" stroke="url(#hzl)" stroke-width="14" stroke-linecap="round" stroke-dasharray="1062 1144"/><text x="256" y="312" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="172" font-weight="700" letter-spacing="-6" fill="#16203a">GM</text></svg><span class="site-logo-text">GENERAL<span>MODERN</span></span></a>
<nav class="site-nav" aria-label="${esc(t.catalog)}">
<a class="site-nav-link${active === "cats" ? " active" : ""}" href="${uCats(lang)}">${esc(t.catalog)}</a>
<a class="site-nav-link${active === "search" ? " active" : ""}" href="${prefix(lang)}/search">${esc(t.search)}</a>
<a class="site-nav-link${active === "faq" ? " active" : ""}" href="${uFaq(lang)}">${esc(t.faq)}</a>
</nav>
<div class="site-header-right">${langNav}${телШапка}<a class="btn-primary btn-sm ssr-btn" href="/#catalog">${esc(t.openStore)}</a></div>
</div></header>
<div class="site-main site-смена"><div class="ssr-main">
${body}
</div></div>
<footer class="site-подвал"><div><strong>GENERAL MODERN</strong> — ${esc(t.store)}, ${esc(t.country)}.${контакты ? "<br>" + контакты : ""}</div>
<div><a href="${uCats(lang)}">${esc(t.allCats)}</a> · <a href="${uFaq(lang)}">${esc(t.faq)}</a> · <a href="/sitemap.xml">Sitemap</a></div></footer>
</div>
</body>
</html>`;
}

function крошки(items) {
  return `<nav class="crumbs" aria-label="breadcrumbs">${items.map((it, i) =>
    i === items.length - 1 ? `<span aria-current="page">${esc(it.name)}</span>` : `<a href="${esc(it.url)}">${esc(it.name)}</a><span aria-hidden="true">›</span>`
  ).join("")}</nav>`;
}

function плитка(т, lang) {
  const статус = { in_stock: ["in-stock", "есть"], soon: ["soon", "скоро"], out_stock: ["out-stock", "нет"] }[т.status] || ["out-stock", "нет"];
  const img = т.photos.length
    ? `<div class="product-card-img"><img src="${uImg(т, 1, 480)}" alt="${esc(altФото(т, 1, lang))}" width="480" height="480" loading="lazy" decoding="async"><div class="product-badges"><span class="product-badge ${статус[0]}">${esc(статусТекст(т.status, lang))}</span></div></div>`
    : `<div class="product-card-img"><div class="product-card-img-placeholder mono">${esc(т.code)}</div></div>`;
  return `<a class="product-card" href="${uProduct(lang, т)}">${img}<div class="product-card-body"><div class="product-name">${esc(т.name)}</div><div class="product-category">${esc(имяКат(т.cat, lang))}</div><div class="product-sku"><span class="sku-code">${esc(т.code)}</span>${т.sku ? `<span class="sku-vendor">${lang === "en" ? "P/N" : "Арт."}: ${esc(т.sku)}</span>` : ""}</div><div class="product-status ${статус[1]}"><span class="status-dot"></span><span>${esc(статусТекст(т.status, lang))}</span></div></div></a>`;
}

// Лента категорий слева — как в магазине
function лента(кат, lang, текущая) {
  const t = T[lang];
  if (!кат || !кат.категории) return "";
  const все = [...кат.категории.values()].sort((a, b) => имяКат(a, lang).localeCompare(имяКат(b, lang)));
  return `<aside class="cat-rail" aria-label="${esc(t.categories)}"><div class="cat-rail-title">${esc(t.categories)}</div>
<a class="rail-item${!текущая ? " active" : ""}" href="${uCats(lang)}"${!текущая ? ' aria-current="page"' : ""}><span>${esc(t.allCats)}</span><span class="rail-count">${кат.товары.length}</span></a>
${все.map(c => `<a class="rail-item${c.slug === текущая ? " active" : ""}" href="${uCat(lang, c.slug)}"${c.slug === текущая ? ' aria-current="page"' : ""}><span>${esc(имяКат(c, lang))}</span><span class="rail-count">${c.items.length}</span></a>`).join("")}</aside>`;
}

// ---------- товар ----------
export function страницаТовара(т, lang, кат) {
  const t = T[lang];
  const s = настройки();
  const catName = имяКат(т.cat, lang);
  const items = [
    { name: t.home, url: uHome(lang) },
    { name: t.catalog, url: uCats(lang) },
    { name: catName, url: uCat(lang, т.cat.slug) },
    { name: т.name, url: uProduct(lang, т) },
  ];
  const фото = т.photos.map((_, i) => uImg(т, i + 1));
  const gallery = фото.length
    ? `<img class="main" src="${фото[0]}" alt="${esc(altФото(т, 1, lang))}" width="900" height="900" fetchpriority="high">`
      + (фото.length > 1 ? `<div class="thumbs">${фото.map((u, i) => `<a href="${u}"><img src="${uImg(т, i + 1, 160)}" alt="${esc(altФото(т, i + 1, lang))}" width="76" height="76" loading="lazy"></a>`).join("")}</div>` : "")
    : `<div class="noimg">${esc(т.code)}</div>`;

  const ov = т.ov || {};
  const rows = [
    [t.code, `<span class="mono">${esc(т.code)}</span>`],
    т.sku ? [t.sku, `<span class="mono">${esc(т.sku)}</span>`] : null,
    [t.category, `<a href="${uCat(lang, т.cat.slug)}">${esc(catName)}</a>`],
    [t.availability, `<span class="st ${т.status}">${esc(статусТекст(т.status, lang))}</span>`],
    ov.brand ? [lang === "ru" ? "Бренд" : lang === "uz" ? "Brend" : "Brand", esc(ov.brand)] : (т.mentions.length ? [t.mentions, esc(т.mentions.join(", "))] : null),
    ov.compat ? [t.compat, esc(ov.compat)] : null,
    [t.price, т.price ? `<strong>${т.price.value.toLocaleString("ru-RU")} ${т.price.currency === "UZS" ? "сум" : "$"}</strong>` : esc(t.priceOnRequest)],
  ].filter(Boolean);

  const descr = (lang === "ru" && ov.description) ? ov.description : T[lang].prodDesc({ ...т, statusText: статусТекст(т.status, lang) }, catName);
  const похожие = кат ? кат.items.filter(x => x.code !== т.code).slice(0, 8) : [];

  const body = `${крошки(items)}
<article class="prod">
<div class="card gal">${gallery}</div>
<div class="card info">
<h1 class="ssr-h1">${esc(т.name)}</h1>
<table class="facts"><tbody>${rows.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${v}</td></tr>`).join("")}</tbody></table>
<p>${esc(descr)}</p>
<h2 class="ssr-h3">${esc(t.howTitle)}</h2>
<ol class="how">${t.how.map(x => `<li>${esc(x)}</li>`).join("")}</ol>
<div class="cta"><a class="btn-primary ssr-btn" href="/#catalog?q=${encodeURIComponent(т.code)}">${esc(t.order)}</a>${s.telegram ? `<a class="ssr-ghost" href="${esc(s.telegram)}" rel="noopener">${esc(t.orderTg)}</a>` : ""}</div>
</div>
</article>
${похожие.length ? `<h2 class="ssr-h2">${esc(t.related)}: ${esc(catName.toLowerCase())}</h2><div class="product-grid gm-smena">${похожие.map(x => плитка(x, lang)).join("")}</div>` : ""}`;

  const product = {
    "@type": "Product",
    "@id": abs(uProduct(lang, т)) + "#product",
    name: т.name,
    sku: т.sku || т.code,
    productID: т.code,
    ...(т.sku ? { mpn: т.sku } : {}),
    category: catName,
    description: descr,
    url: abs(uProduct(lang, т)),
    ...(фото.length ? { image: фото.map((u, i) => ({ "@type": "ImageObject", contentUrl: abs(u), url: abs(u), caption: altФото(т, i + 1, lang), representativeOfPage: i === 0 })) } : {}),
    ...(ov.brand ? { brand: { "@type": "Brand", name: ov.brand } } : {}),
    inLanguage: lang,
  };
  if (т.price) {
    product.offers = {
      "@type": "Offer", url: abs(uProduct(lang, т)), price: т.price.value, priceCurrency: т.price.currency,
      availability: т.status === "in_stock" ? "https://schema.org/InStock" : т.status === "soon" ? "https://schema.org/BackOrder" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@id": abs("/#organization") },
    };
  }
  return страница({
    lang, title: seoTitle(т, lang), desc: seoDesc(т, lang), path: uProduct(lang, т),
    alternates: Object.fromEntries(LANGS.map(l => [l, uProduct(l, т)])),
    body, image: фото[0], ogType: "product",
    jsonld: [product, крошкиLD(items)],
  });
}

// ---------- категория ----------
export function страницаКатегории(кат, lang, page, весь) {
  const t = T[lang];
  const name = имяКат(кат, lang);
  const всего = кат.items.length;
  const страниц = Math.max(1, Math.ceil(всего / НА_СТРАНИЦЕ));
  const items = кат.items.slice((page - 1) * НА_СТРАНИЦЕ, page * НА_СТРАНИЦЕ);
  const crumbs = [{ name: t.home, url: uHome(lang) }, { name: t.catalog, url: uCats(lang) }, { name, url: uCat(lang, кат.slug) }];
  const текст = кат.text[lang] || t.catIntro(name, всего, кат.inStock);
  const pager = страниц > 1 ? `<nav class="pager" aria-label="${esc(t.page)}">${Array.from({ length: страниц }, (_, i) => i + 1)
    .map(n => n === page ? `<span>${n}</span>` : `<a href="${uCat(lang, кат.slug, n)}">${n}</a>`).join("")}</nav>` : "";
  const body = `<div class="cat-layout">${лента(весь, lang, кат.slug)}<div class="cat-main">${крошки(crumbs)}
<h1 class="ssr-h1">${esc(name)}${page > 1 ? ` — ${esc(t.page.toLowerCase())} ${page}` : ""}</h1>
<p class="lead">${esc(текст)}</p>
<div class="product-grid gm-smena">${items.map(x => плитка(x, lang)).join("")}</div>
${pager}</div></div>`;
  const list = {
    "@type": "ItemList", name, numberOfItems: всего,
    itemListElement: items.map((x, i) => ({ "@type": "ListItem", position: (page - 1) * НА_СТРАНИЦЕ + i + 1, url: abs(uProduct(lang, x)), name: x.name })),
  };
  const title = t.catTitle(name) + (page > 1 ? ` — ${t.page} ${page}` : "");
  return страница({
    lang, title, desc: t.catDesc(name, всего), path: uCat(lang, кат.slug, page),
    alternates: Object.fromEntries(LANGS.map(l => [l, uCat(l, кат.slug, page)])),
    body, image: items[0] && items[0].photos.length ? uImg(items[0], 1) : null, active: "cats",
    jsonld: [{ "@type": "CollectionPage", name, url: abs(uCat(lang, кат.slug, page)), inLanguage: lang, mainEntity: list }, крошкиLD(crumbs)],
  });
}

// ---------- все категории ----------
export function страницаКаталога(кат, lang) {
  const t = T[lang];
  const все = [...кат.категории.values()].sort((a, b) => b.items.length - a.items.length);
  const n = кат.товары.length, k = кат.товары.filter(x => x.status === "in_stock").length;
  const crumbs = [{ name: t.home, url: uHome(lang) }, { name: t.catalog, url: uCats(lang) }];
  const body = `<div class="cat-layout">${лента(кат, lang, "")}<div class="cat-main">${крошки(crumbs)}
<h1 class="ssr-h1">${esc(lang === "ru" ? "Швейные запчасти — запчасти для швейных машин" : lang === "uz" ? "Tikuv mashinasi ehtiyot qismlari (zapchastlari)" : "Sewing machine spare parts")}</h1>
<p class="lead">${esc(t.catsIntro(n, k))}</p>
<form class="s" action="${prefix(lang)}/search" method="get" role="search"><input name="q" type="search" placeholder="${esc(t.searchPh)}" aria-label="${esc(t.search)}"><button class="btn-primary ssr-btn" type="submit">${esc(t.search)}</button></form>
<h2 class="ssr-h2">${esc(t.categories)}</h2>
<div class="cats">${все.map(c => `<a class="card" href="${uCat(lang, c.slug)}">${esc(имяКат(c, lang))}<span>${esc(t.products(c.items.length))}</span></a>`).join("")}</div>
${кат.марки && кат.марки.size ? `<h2 class="ssr-h2">${esc(lang === "ru" ? "Запчасти по маркам" : lang === "uz" ? "Markalar bo‘yicha" : "By brand")}</h2>
<div class="cats">${[...кат.марки.values()].sort((a, b) => b.items.length - a.items.length).map(b => `<a class="card" href="${uCat(lang, b.slug)}">${esc(имяКат(b, lang))}<span>${esc(t.products(b.items.length))}</span></a>`).join("")}</div>` : ""}
<h2 class="ssr-h2">${esc(lang === "ru" ? "Новые поступления" : lang === "uz" ? "Yangi kelganlar" : "New arrivals")}</h2>
<div class="product-grid gm-smena">${[...кат.товары].filter(x => x.photos.length).sort((a, b) => String(b.lastmod || "").localeCompare(String(a.lastmod || ""))).slice(0, 12).map(x => плитка(x, lang)).join("")}</div></div></div>`;
  return страница({
    lang, title: t.catsTitle, desc: t.catsDesc(n), path: uCats(lang),
    alternates: Object.fromEntries(LANGS.map(l => [l, uCats(l)])), body, active: "cats",
    jsonld: [{ "@type": "CollectionPage", name: t.catsTitle, url: abs(uCats(lang)), inLanguage: lang,
      mainEntity: { "@type": "ItemList", itemListElement: все.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: имяКат(c, lang), url: abs(uCat(lang, c.slug)) })) } }, крошкиLD(crumbs)],
  });
}

// ---------- поиск (не индексируется, но понимает опечатки) ----------
export function страницаПоиска(lang, q, найдено) {
  const t = T[lang];
  const body = `<h1 class="ssr-h1">${esc(t.search)}</h1>
<form class="s" action="${prefix(lang)}/search" method="get" role="search"><input name="q" type="search" value="${esc(q)}" placeholder="${esc(t.searchPh)}" aria-label="${esc(t.search)}" autofocus><button class="btn-primary ssr-btn" type="submit">${esc(t.search)}</button></form>
${q ? `<p class="lead">${esc(найдено.length ? t.found(найдено.length) : t.nothing)}</p>` : ""}
<div class="product-grid gm-smena">${найдено.slice(0, 96).map(x => плитка(x, lang)).join("")}</div>`;
  return страница({
    lang, title: `${t.search}${q ? ": " + q : ""} | GENERAL MODERN`, desc: t.searchPh, path: `${prefix(lang)}/search`,
    alternates: Object.fromEntries(LANGS.map(l => [l, `${prefix(l)}/search`])), body, robots: "noindex,follow", active: "search",
  });
}

export function страница404(lang) {
  const t = T[lang];
  return страница({
    lang, title: `${t.notFound} | GENERAL MODERN`, desc: t.notFoundText, path: uCats(lang), robots: "noindex,follow",
    body: `<h1 class="ssr-h1">${esc(t.notFound)}</h1><p class="lead">${esc(t.notFoundText)}</p><p><a class="btn-primary ssr-btn" href="${uCats(lang)}">${esc(t.allCats)}</a></p>`,
  });
}
