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

// Телефонов может быть несколько: «+998…, +998…»
export function телефоны() {
  return String(настройки().phone || "").split(/[,;]/).map(x => x.trim()).filter(x => /d{7,}/.test(x.replace(/D/g, "")));
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
const CSS = `
:root{--bg:#f4f6fa;--card:#fff;--ink:#16203a;--muted:#5d6782;--line:#e2e6ef;--navy:#1c2b4a;--gold:#b8892a;--ok:#1d7a46;--no:#9a3b3b;--soon:#8a6a12}
@media (prefers-color-scheme:dark){:root{--bg:#0e1424;--card:#151d31;--ink:#e8ecf5;--muted:#9aa4bd;--line:#26314b;--navy:#c9d4ee;--gold:#e0b65a;--ok:#5cc58b;--no:#e08a8a;--soon:#e0c06a}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:inherit}img{max-width:100%;height:auto;display:block}
.w{max-width:1160px;margin:0 auto;padding:0 16px}
header.h{background:var(--card);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:5}
header.h .w{display:flex;align-items:center;gap:14px;min-height:60px;flex-wrap:wrap}
.logo{display:flex;align-items:center;gap:10px;text-decoration:none;font-weight:800;letter-spacing:.04em}
.logo b{display:grid;place-items:center;width:34px;height:34px;border-radius:9px;border:2px solid var(--gold);font-family:Georgia,serif;font-size:15px}
nav.n{display:flex;gap:4px;margin-left:auto;flex-wrap:wrap;align-items:center}
nav.n a{padding:7px 11px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;color:var(--muted)}
nav.n a:hover,nav.n a[aria-current]{background:var(--bg);color:var(--ink)}
.lang a{font-size:13px;padding:5px 8px}
.btn{display:inline-flex;align-items:center;gap:8px;padding:12px 18px;border-radius:10px;background:var(--navy);color:var(--bg);text-decoration:none;font-weight:700;border:0}
.btn.alt{background:transparent;color:var(--ink);border:1.5px solid var(--line)}
main{padding:18px 0 40px}
.crumbs{font-size:13px;color:var(--muted);margin:4px 0 14px;display:flex;flex-wrap:wrap;gap:6px}
.crumbs a{text-decoration:none}.crumbs a:hover{text-decoration:underline}
h1{font-size:clamp(22px,3.4vw,32px);line-height:1.2;margin:0 0 12px;letter-spacing:-.01em}
h2{font-size:20px;margin:28px 0 12px}
.lead{color:var(--muted);max-width:780px;margin:0 0 18px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px}
.prod{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:22px}
@media (max-width:820px){.prod{grid-template-columns:1fr}}
.gal{padding:12px}.gal .main{aspect-ratio:1/1;object-fit:contain;width:100%;background:#fff;border-radius:10px}
.thumbs{display:flex;gap:8px;margin-top:10px;overflow-x:auto}.thumbs img{width:76px;height:76px;object-fit:contain;background:#fff;border-radius:8px;border:1px solid var(--line)}
.info{padding:18px}
.facts{width:100%;border-collapse:collapse;margin:6px 0 16px}.facts th,.facts td{text-align:left;padding:9px 0;border-bottom:1px solid var(--line);vertical-align:top;font-size:15px}
.facts th{color:var(--muted);font-weight:500;width:42%;padding-right:12px}
.st{font-weight:700}.st.in_stock{color:var(--ok)}.st.out_stock{color:var(--no)}.st.soon{color:var(--soon)}
.cta{display:flex;gap:10px;flex-wrap:wrap;margin-top:6px}
.how{margin:0 0 16px;padding-left:20px;color:var(--muted);font-size:15px}.how li{margin:3px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
@media (max-width:640px){header.h{position:static}nav.n{margin-left:0}nav.n a{padding:6px 8px}.grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.tile .t{font-size:13px}}
.tile{background:var(--card);border:1px solid var(--line);border-radius:12px;text-decoration:none;display:flex;flex-direction:column;overflow:hidden}
.tile img{aspect-ratio:1/1;object-fit:contain;background:#fff;width:100%}
.tile .noimg{aspect-ratio:1/1;display:grid;place-items:center;color:var(--muted);font-size:13px;background:var(--bg)}
.tile .t{padding:10px 11px 12px;font-size:14px;line-height:1.35;font-weight:600}
.tile .m{display:block;color:var(--muted);font-weight:500;font-size:12.5px;margin-top:4px}
.cats{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px}
.cats a{display:flex;justify-content:space-between;gap:10px;padding:14px 16px;text-decoration:none;font-weight:600}
.cats a span{color:var(--muted);font-weight:500;font-size:14px;white-space:nowrap}
.pager{display:flex;gap:8px;flex-wrap:wrap;margin:22px 0}.pager a,.pager span{padding:8px 13px;border-radius:8px;border:1px solid var(--line);text-decoration:none;font-size:14px}
.pager span{background:var(--navy);color:var(--bg);border-color:var(--navy)}
form.s{display:flex;gap:8px;margin:0 0 18px;max-width:560px}form.s input{flex:1;min-width:0;padding:12px 14px;border-radius:10px;border:1.5px solid var(--line);background:var(--card);color:var(--ink);font:inherit}
.faq details{padding:14px 16px;margin-bottom:10px}.faq summary{font-weight:700;cursor:pointer}.faq details p{margin:10px 0 0;color:var(--ink)}
.prose{max-width:780px}.prose p,.prose li{color:var(--ink)}
footer.f{border-top:1px solid var(--line);background:var(--card);padding:22px 0;font-size:14px;color:var(--muted)}
footer.f .w{display:flex;gap:18px;flex-wrap:wrap;justify-content:space-between}
footer.f a{text-decoration:none}footer.f a:hover{text-decoration:underline}
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
  const langNav = alt ? `<span class="lang">${LANGS.map(l => l === lang
    ? `<a aria-current="true" href="${esc(alt[l])}" hreflang="${l}">${l.toUpperCase()}</a>`
    : `<a href="${esc(alt[l])}" hreflang="${l}" lang="${l}">${l.toUpperCase()}</a>`).join("")}</span>` : "";
  const s = настройки();
  const graph = { "@context": "https://schema.org", "@graph": [организация(), website(), ...(localBusiness() ? [localBusiness()] : []), ...jsonld] };
  const контакты = [
    s.phone ? `<a href="tel:${esc(s.phone.replace(/[^\d+]/g, ""))}">${esc(s.phone)}</a>` : "",
    s.telegram ? `<a href="${esc(s.telegram)}" rel="noopener">Telegram</a>` : "",
    s.street && s.city ? `<span>${esc(s.street)}, ${esc(s.city)}</span>` : "",
  ].filter(Boolean).join(" · ");
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
<meta name="theme-color" content="#1c2b4a">
<link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" href="/favicon-96.png" type="image/png" sizes="96x96"><link rel="icon" href="/icon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon-180.png">
${verification()}
<style>${CSS}</style>
${ld(graph)}
${analytics()}
</head>
<body>
<header class="h"><div class="w">
<a class="logo" href="${uHome(lang)}"><b>GM</b>GENERAL MODERN</a>
<nav class="n" aria-label="${esc(t.catalog)}">
<a href="${uCats(lang)}"${active === "cats" ? ' aria-current="page"' : ""}>${esc(t.catalog)}</a>
<a href="${prefix(lang)}/search"${active === "search" ? ' aria-current="page"' : ""}>${esc(t.search)}</a>
<a href="${uFaq(lang)}"${active === "faq" ? ' aria-current="page"' : ""}>${esc(t.faq)}</a>
<a href="/#catalog">${esc(t.openStore)}</a>
${langNav}
</nav>
</div></header>
<main><div class="w">
${body}
</div></main>
<footer class="f"><div class="w">
<div><strong>GENERAL MODERN</strong> — ${esc(t.store)}, ${esc(t.country)}.${контакты ? "<br>" + контакты : ""}</div>
<div><a href="${uCats(lang)}">${esc(t.allCats)}</a> · <a href="${uFaq(lang)}">${esc(t.faq)}</a> · <a href="/sitemap.xml">Sitemap</a></div>
</div></footer>
</body>
</html>`;
}

function крошки(items) {
  return `<nav class="crumbs" aria-label="breadcrumbs">${items.map((it, i) =>
    i === items.length - 1 ? `<span aria-current="page">${esc(it.name)}</span>` : `<a href="${esc(it.url)}">${esc(it.name)}</a><span aria-hidden="true">›</span>`
  ).join("")}</nav>`;
}

function плитка(т, lang) {
  const img = т.photos.length
    ? `<img src="${uImg(т, 1, 480)}" alt="${esc(altФото(т, 1, lang))}" width="480" height="480" loading="lazy" decoding="async">`
    : `<div class="noimg">${esc(т.code)}</div>`;
  return `<a class="tile" href="${uProduct(lang, т)}">${img}<span class="t">${esc(т.name)}<span class="m">${esc(т.code)}${т.sku ? " · " + esc(т.sku) : ""} · <span class="st ${т.status}">${esc(статусТекст(т.status, lang))}</span></span></span></a>`;
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
    : `<div class="tile"><div class="noimg">${esc(т.code)}</div></div>`;

  const ov = т.ov || {};
  const rows = [
    [t.code, esc(т.code)],
    т.sku ? [t.sku, esc(т.sku)] : null,
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
<h1>${esc(т.name)}</h1>
<table class="facts"><tbody>${rows.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${v}</td></tr>`).join("")}</tbody></table>
<p>${esc(descr)}</p>
<h2 style="font-size:16px;margin:16px 0 6px">${esc(t.howTitle)}</h2>
<ol class="how">${t.how.map(x => `<li>${esc(x)}</li>`).join("")}</ol>
<div class="cta"><a class="btn" href="/#catalog?q=${encodeURIComponent(т.code)}">${esc(t.order)}</a>${s.telegram ? `<a class="btn alt" href="${esc(s.telegram)}" rel="noopener">${esc(t.orderTg)}</a>` : ""}</div>
</div>
</article>
${похожие.length ? `<h2>${esc(t.related)}: ${esc(catName.toLowerCase())}</h2><div class="grid">${похожие.map(x => плитка(x, lang)).join("")}</div>` : ""}`;

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
export function страницаКатегории(кат, lang, page) {
  const t = T[lang];
  const name = имяКат(кат, lang);
  const всего = кат.items.length;
  const страниц = Math.max(1, Math.ceil(всего / НА_СТРАНИЦЕ));
  const items = кат.items.slice((page - 1) * НА_СТРАНИЦЕ, page * НА_СТРАНИЦЕ);
  const crumbs = [{ name: t.home, url: uHome(lang) }, { name: t.catalog, url: uCats(lang) }, { name, url: uCat(lang, кат.slug) }];
  const текст = кат.text[lang] || t.catIntro(name, всего, кат.inStock);
  const pager = страниц > 1 ? `<nav class="pager" aria-label="${esc(t.page)}">${Array.from({ length: страниц }, (_, i) => i + 1)
    .map(n => n === page ? `<span>${n}</span>` : `<a href="${uCat(lang, кат.slug, n)}">${n}</a>`).join("")}</nav>` : "";
  const body = `${крошки(crumbs)}
<h1>${esc(name)}${page > 1 ? ` — ${esc(t.page.toLowerCase())} ${page}` : ""}</h1>
<p class="lead">${esc(текст)}</p>
<div class="grid">${items.map(x => плитка(x, lang)).join("")}</div>
${pager}`;
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
  const body = `${крошки(crumbs)}
<h1>${esc(lang === "ru" ? "Швейные запчасти — запчасти для швейных машин" : lang === "uz" ? "Tikuv mashinasi ehtiyot qismlari" : "Sewing machine spare parts")}</h1>
<p class="lead">${esc(t.catsIntro(n, k))}</p>
<form class="s" action="${prefix(lang)}/search" method="get" role="search"><input name="q" type="search" placeholder="${esc(t.searchPh)}" aria-label="${esc(t.search)}"><button class="btn" type="submit">${esc(t.search)}</button></form>
<h2>${esc(t.categories)}</h2>
<div class="cats">${все.map(c => `<a class="card" href="${uCat(lang, c.slug)}">${esc(имяКат(c, lang))}<span>${esc(t.products(c.items.length))}</span></a>`).join("")}</div>
${кат.марки && кат.марки.size ? `<h2>${esc(lang === "ru" ? "Запчасти по маркам" : lang === "uz" ? "Markalar bo‘yicha" : "By brand")}</h2>
<div class="cats">${[...кат.марки.values()].sort((a, b) => b.items.length - a.items.length).map(b => `<a class="card" href="${uCat(lang, b.slug)}">${esc(имяКат(b, lang))}<span>${esc(t.products(b.items.length))}</span></a>`).join("")}</div>` : ""}
<h2>${esc(lang === "ru" ? "Новые поступления" : lang === "uz" ? "Yangi kelganlar" : "New arrivals")}</h2>
<div class="grid">${[...кат.товары].filter(x => x.photos.length).sort((a, b) => String(b.lastmod || "").localeCompare(String(a.lastmod || ""))).slice(0, 12).map(x => плитка(x, lang)).join("")}</div>`;
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
  const body = `<h1>${esc(t.search)}</h1>
<form class="s" action="${prefix(lang)}/search" method="get" role="search"><input name="q" type="search" value="${esc(q)}" placeholder="${esc(t.searchPh)}" aria-label="${esc(t.search)}" autofocus><button class="btn" type="submit">${esc(t.search)}</button></form>
${q ? `<p class="lead">${esc(найдено.length ? t.found(найдено.length) : t.nothing)}</p>` : ""}
<div class="grid">${найдено.slice(0, 96).map(x => плитка(x, lang)).join("")}</div>`;
  return страница({
    lang, title: `${t.search}${q ? ": " + q : ""} | GENERAL MODERN`, desc: t.searchPh, path: `${prefix(lang)}/search`,
    alternates: Object.fromEntries(LANGS.map(l => [l, `${prefix(l)}/search`])), body, robots: "noindex,follow", active: "search",
  });
}

export function страница404(lang) {
  const t = T[lang];
  return страница({
    lang, title: `${t.notFound} | GENERAL MODERN`, desc: t.notFoundText, path: uCats(lang), robots: "noindex,follow",
    body: `<h1>${esc(t.notFound)}</h1><p class="lead">${esc(t.notFoundText)}</p><p><a class="btn" href="${uCats(lang)}">${esc(t.allCats)}</a></p>`,
  });
}
