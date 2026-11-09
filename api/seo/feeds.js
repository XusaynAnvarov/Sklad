// ========================================================================
//  SEO: карта сайта (с фото и языковыми версиями), товарный фид Google
//  Merchant Center и llms.txt для ИИ-поисковиков.
//  Всё строится из тех же данных, что и страницы, — расхождений нет.
// ========================================================================
import { xesc } from "./text.js";
import { LANGS, HREFLANG } from "./i18n.js";
import { настройки } from "./store.js";
import { abs, uProduct, uCat, uCats, uFaq, uImg, seoTitle, seoDesc, имяКат, altФото, НА_СТРАНИЦЕ } from "./render.js";

const дата = (s) => (s ? String(s).slice(0, 10) : undefined);

function url(loc, { lastmod, alts, images } = {}) {
  return `<url><loc>${xesc(abs(loc))}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}`
    + (alts ? LANGS.map(l => `<xhtml:link rel="alternate" hreflang="${HREFLANG[l]}" href="${xesc(abs(alts[l]))}"/>`).join("")
      + `<xhtml:link rel="alternate" hreflang="x-default" href="${xesc(abs(alts.ru))}"/>` : "")
    + (images || []).map(i => `<image:image><image:loc>${xesc(abs(i))}</image:loc></image:image>`).join("")
    + `</url>`;
}
const urlset = (body) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${body}
</urlset>`;

export function sitemapIndex(кат) {
  const last = кат.товары.map(т => т.lastmod).filter(Boolean).sort().pop();
  const maps = ["/sitemap-pages.xml", "/sitemap-categories.xml", "/sitemap-products.xml"];
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${maps.map(m => `<sitemap><loc>${xesc(abs(m))}</loc>${last ? `<lastmod>${дата(last)}</lastmod>` : ""}</sitemap>`).join("\n")}
</sitemapindex>`;
}

export function sitemapPages() {
  const alts = (f) => Object.fromEntries(LANGS.map(l => [l, f(l)]));
  const a1 = alts(uCats), a2 = alts(uFaq);
  return urlset([
    `<url><loc>${xesc(abs("/"))}</loc></url>`,
    ...LANGS.map(l => url(a1[l], { alts: a1 })),
    ...LANGS.map(l => url(a2[l], { alts: a2 })),
  ].join("\n"));
}

export function sitemapCategories(кат) {
  const out = [];
  for (const c of кат.категории.values()) {
    const last = дата(c.items.map(т => т.lastmod).filter(Boolean).sort().pop());
    const страниц = Math.max(1, Math.ceil(c.items.length / НА_СТРАНИЦЕ));
    for (let p = 1; p <= страниц; p++) {
      const alts = Object.fromEntries(LANGS.map(l => [l, uCat(l, c.slug, p)]));
      for (const l of LANGS) out.push(url(alts[l], { lastmod: last, alts }));
    }
  }
  return urlset(out.join("\n"));
}

export function sitemapProducts(кат) {
  const out = [];
  for (const т of кат.товары) {
    const alts = Object.fromEntries(LANGS.map(l => [l, uProduct(l, т)]));
    const images = т.photos.map((_, i) => uImg(т, i + 1));
    for (const l of LANGS) out.push(url(alts[l], { lastmod: дата(т.lastmod), alts, images: l === "ru" ? images : [] }));
  }
  return urlset(out.join("\n"));
}

// ------------------------------------------------------------------
//  Google Merchant Center (RSS 2.0, пространство g:).
//  Товар без цены Merchant Center не принимает. Пока владелец не включил
//  показ цен (SEO → Настройки), фид честно пустой и сообщает почему.
// ------------------------------------------------------------------
export function merchantFeed(кат) {
  const s = настройки();
  const готовые = кат.товары.filter(т => т.price && т.photos.length);
  const items = готовые.map(т => {
    const avail = т.status === "in_stock" ? "in_stock" : "out_of_stock";
    const price = т.price.currency === "UZS" ? `${т.price.value} UZS` : `${т.price.value.toFixed(2)} USD`;
    return `<item>
<g:id>${xesc(т.code)}</g:id>
<g:title>${xesc(т.name.slice(0, 150))}</g:title>
<g:description>${xesc(seoDesc(т, "ru"))}</g:description>
<g:link>${xesc(abs(uProduct("ru", т)))}</g:link>
<g:image_link>${xesc(abs(uImg(т, 1)))}</g:image_link>
${т.photos.slice(1, 10).map((_, i) => `<g:additional_image_link>${xesc(abs(uImg(т, i + 2)))}</g:additional_image_link>`).join("")}
<g:availability>${avail}</g:availability>
<g:price>${price}</g:price>
<g:condition>new</g:condition>
${т.ov.brand ? `<g:brand>${xesc(т.ov.brand)}</g:brand>` : ""}
${т.sku ? `<g:mpn>${xesc(т.sku)}</g:mpn>` : ""}
${!т.ov.brand || !т.sku ? "<g:identifier_exists>no</g:identifier_exists>" : ""}
<g:product_type>${xesc("Запчасти для швейных машин > " + имяКат(т.cat, "ru"))}</g:product_type>
</item>`;
  }).join("\n");
  const note = s.price_policy !== "show"
    ? "<!-- Фид пуст: показ цен выключен (склад → SEO → Настройки → «Показывать цены»). Без цены Merchant Center товар не примет. -->"
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
<title>GENERAL MODERN — запчасти для швейных машин</title>
<link>${xesc(abs("/"))}</link>
<description>Товарный фид GENERAL MODERN</description>
${note}
${items}
</channel>
</rss>`;
}

// ------------------------------------------------------------------
//  llms.txt — краткая справка о магазине для ИИ-поисковиков (Markdown).
//  Только факты из каталога и настроек; никаких «инструкций» модели.
// ------------------------------------------------------------------
export function llmsTxt(кат) {
  const s = настройки();
  const n = кат.товары.length, k = кат.товары.filter(т => т.status === "in_stock").length;
  const cats = [...кат.категории.values()].sort((a, b) => b.items.length - a.items.length);
  const марки = {};
  кат.товары.forEach(т => т.mentions.forEach(m => { марки[m] = (марки[m] || 0) + 1; }));
  const lines = [
    "# GENERAL MODERN",
    "",
    "> Магазин запчастей и принадлежностей для промышленных и бытовых швейных машин в Узбекистане. Sewing machine spare parts store in Uzbekistan. Tikuv mashinalari ehtiyot qismlari do‘koni.",
    "",
    `- Сайт: ${abs("/")}`,
    `- Каталог (HTML, без JavaScript): ${abs(uCats("ru"))} · O‘zbekcha: ${abs(uCats("uz"))} · English: ${abs(uCats("en"))}`,
    `- Товаров в каталоге: ${n}, в наличии: ${k} (данные обновляются автоматически из складской системы)`,
    `- Как заказать: на сайте (${abs("/#catalog")})${s.telegram ? ` или через Telegram: ${s.telegram}` : ""}`,
    s.phone ? `- Телефон: ${s.phone}` : null,
    s.street && s.city ? `- Адрес: ${s.street}, ${s.city}` : null,
    s.hours ? `- Часы работы: ${s.hours}` : null,
    s.delivery_ru ? `- Доставка: ${s.delivery_ru}` : null,
    s.price_policy === "show" ? "- Цены указаны на страницах товаров." : "- Цены на сайте не публикуются, их подтверждают при заказе.",
    `- У каждого товара есть постоянная страница с фото, кодом (например MK-003) и артикулом: ${abs("/p/")}<код>-<название>`,
    `- Поиск по названию, артикулу или коду: ${abs("/search?q=")}<запрос>`,
    `- Вопросы и ответы: ${abs(uFaq("ru"))}`,
    `- Карта сайта: ${abs("/sitemap.xml")}`,
    "",
    "## Категории",
    "",
    ...cats.map(c => `- [${c.ru}](${abs(uCat("ru", c.slug))}) — ${c.items.length} товаров, в наличии ${c.inStock}`),
    "",
    Object.keys(марки).length ? "## Марки и модели, встречающиеся в названиях товаров" : null,
    Object.keys(марки).length ? "" : null,
    ...Object.entries(марки).sort((a, b) => b[1] - a[1]).map(([m, c]) => `- ${m}: ${c}`),
  ];
  return lines.filter(l => l !== null).filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n") + "\n";
}
