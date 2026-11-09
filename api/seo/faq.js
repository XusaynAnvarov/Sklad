// ========================================================================
//  SEO: страница «Вопросы и ответы» (FAQPage) на трёх языках.
//
//  Только проверяемые сведения: что продаём (из каталога), как заказать
//  (сайт и Telegram-бот), общие технические правила подбора деталей.
//  Адрес, доставка, часы работы появляются ТОЛЬКО если заполнены в
//  настройках SEO — сами мы их не придумываем.
// ========================================================================
import { esc } from "./text.js";
import { T, LANGS } from "./i18n.js";
import { настройки } from "./store.js";
import { страница, uFaq, uCats, uCat, uHome, abs } from "./render.js";

function вопросы(lang, кат) {
  const s = настройки();
  const n = кат.товары.length;
  const k = кат.товары.filter(x => x.status === "in_stock").length;
  const есть = (slug) => кат.категории.has(slug);
  const ссылка = (slug, текст) => есть(slug) ? `<a href="${uCat(lang, slug)}">${esc(текст)}</a>` : esc(текст);
  const где = s.street && s.city ? `${s.street}, ${s.city}` : "";
  const тг = s.telegram ? `<a href="${esc(s.telegram)}" rel="noopener">Telegram</a>` : "Telegram";
  const доставка = s["delivery_" + lang] || "";

  if (lang === "uz") return [
    ["O‘zbekistonda sanoat tikuv mashinasi uchun ehtiyot qismlarni qayerdan sotib olish mumkin?",
      `GENERAL MODERN — tikuv uskunalari uchun ehtiyot qismlar va anjomlar do‘koni. Katalogda ${n} ta mahsulot (${k} tasi mavjud): ${ссылка("lapki", "lapkalar")}, ${ссылка("igly", "ninalar")}, ${ссылка("chelnoki", "chelnoklar")}, ${ссылка("shpulnye-kolpachki", "mokkilar")}, ${ссылка("petliteli", "petlitellar")}, ${ссылка("nozhi", "pichoqlar")}. Buyurtmani saytda yoki ${тг} orqali berish mumkin.${где ? " Manzil: " + esc(где) + "." : ""}${доставка ? " " + esc(доставка) : ""}`],
    ["Tikuv mashinasi uchun lapkani qanday tanlash kerak?",
      "Avval mashina turini aniqlang: to‘g‘ri chok (bir ignali), ikki ignali, overlok yoki rasposhivalka — lapkalar ular orasida almashmaydi. Keyin vazifasini tanlang: oddiy chok, zamok (molniya), kant, burish, chetidan tikish. Eski lapkadagi belgi (masalan, P36LN, T36LN) bo‘yicha qidirsangiz, aynan shu modelni topish osonroq. Har bir mahsulot sahifasida kod, artikul va rasmlar bor — detalni o‘zingiznikiga solishtiring."],
    ["Chelnok modelini qanday aniqlash mumkin?",
      "Chelnok mashina modeli va turiga qarab tanlanadi. Mashinaning modelini (u odatda korpusdagi plastinkada yozilgan) va chelnok korpusidagi belgini toping, so‘ng kod yoki artikul bo‘yicha qidiring. Shubha bo‘lsa, eski chelnok rasmini Telegramga yuboring — rasmini katalogdagi bilan solishtiramiz."],
    ["Sanoat tikuv mashinasiga qaysi ninalar mos keladi?",
      "Nina tizimi mashina turiga bog‘liq: to‘g‘ri chokli sanoat mashinalari odatda DBx1, overloklar — DCx27, rasposhivalkalar — UYx128GAS, ayrim maxsus mashinalar — DPx5 tizimini ishlatadi. Ninadagi raqam (masalan, 90, 100, 110) — uning qalinligi millimetrning yuzdan bir ulushida: 90 = 0,9 mm. Qalinlik matoga qarab tanlanadi: yupqa matolar uchun ingichka, qalin matolar uchun yo‘g‘onroq nina."],
    ["Narxlarni qanday bilsam bo‘ladi?",
      "Narx buyurtma rasmiylashtirilganda aniqlanadi: saytda buyurtma bering yoki Telegram-bot orqali yozing."],
  ];
  if (lang === "en") return [
    ["Where can I buy industrial sewing machine parts in Uzbekistan?",
      `GENERAL MODERN is a store of spare parts and accessories for sewing equipment. The catalog lists ${n} products (${k} in stock): ${ссылка("lapki", "presser feet")}, ${ссылка("igly", "needles")}, ${ссылка("chelnoki", "rotary hooks")}, ${ссылка("shpulnye-kolpachki", "bobbin cases")}, ${ссылка("petliteli", "loopers")}, ${ссылка("nozhi", "knives")}. You can order on the website or via ${тг}.${где ? " Address: " + esc(где) + "." : ""}${доставка ? " " + esc(доставка) : ""}`],
    ["How do I choose a presser foot for a sewing machine?",
      "First identify the machine type: single-needle lockstitch, double-needle, overlock or coverstitch — feet are not interchangeable between them. Then choose the purpose: plain seam, zipper, piping, hemming, edge stitching. Searching by the marking on your old foot (for example P36LN or T36LN) is the fastest way to find the same model. Every product page shows the code, part number and photos so you can compare the part with yours."],
    ["How do I identify a rotary hook model?",
      "A hook is matched to the machine model and type. Find the machine model (usually on the plate on the machine body) and any marking on the hook itself, then search by code or part number. If in doubt, send a photo of your old hook via Telegram and we will compare it with the catalog."],
    ["Which needles fit an industrial sewing machine?",
      "The needle system depends on the machine type: industrial lockstitch machines usually use DBx1, overlocks DCx27, coverstitch machines UYx128GAS, and some special machines DPx5. The number on the needle (90, 100, 110…) is the blade diameter in hundredths of a millimetre: 90 = 0.9 mm. Pick a thinner needle for light fabrics and a thicker one for heavy fabrics."],
    ["How can I find out the price?",
      "The price is confirmed when the order is placed: order on the website or message us via the Telegram bot."],
  ];
  return [
    ["Где купить запчасти для промышленной швейной машины в Узбекистане?",
      `GENERAL MODERN — магазин запчастей и принадлежностей для швейного оборудования. В каталоге ${n} товаров (в наличии ${k}): ${ссылка("lapki", "лапки")}, ${ссылка("igly", "иглы")}, ${ссылка("chelnoki", "челноки")}, ${ссылка("shpulnye-kolpachki", "шпульные колпачки")}, ${ссылка("petliteli", "петлители")}, ${ссылка("nozhi", "ножи")}. Заказать можно на сайте или через ${тг}.${где ? " Адрес: " + esc(где) + "." : ""}${доставка ? " " + esc(доставка) : ""}`],
    ["Как подобрать лапку для швейной машины?",
      "Сначала определите тип машины: прямострочная одноигольная, двухигольная, оверлок или распошивальная — лапки между ними не взаимозаменяемы. Затем выберите назначение: обычная строчка, молния, кант, подгибка, отстрочка края. Быстрее всего искать по маркировке на старой лапке (например, P36LN или T36LN) — так находится именно эта модель. На странице каждого товара есть код, артикул и фотографии, чтобы сверить деталь с вашей."],
    ["Как определить модель челнока?",
      "Челнок подбирается под модель и тип машины. Найдите модель машины (обычно она указана на табличке на корпусе) и маркировку на самом челноке, затем ищите по коду или артикулу. Если сомневаетесь, отправьте фото старого челнока в Telegram — сверим его с каталогом."],
    ["Какие иглы подходят для промышленной швейной машины?",
      "Система иглы зависит от типа машины: промышленные прямострочные машины обычно используют систему DBx1, оверлоки — DCx27, распошивальные — UYx128GAS, часть специальных машин — DPx5. Число на игле (90, 100, 110…) — толщина в сотых долях миллиметра: 90 = 0,9 мм. Для тонких тканей берут иглу тоньше, для плотных — толще."],
    ["Как узнать цену?",
      "Цена подтверждается при оформлении заказа: оформите заказ на сайте или напишите в Telegram-бот."],
  ];
}

export function страницаFAQ(lang, кат) {
  const t = T[lang];
  const qa = вопросы(lang, кат);
  const crumbs = [{ name: t.home, url: uHome(lang) }, { name: t.faq, url: uFaq(lang) }];
  const strip = (h) => String(h).replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  const body = `<nav class="crumbs"><a href="${uHome(lang)}">${esc(t.home)}</a><span aria-hidden="true">›</span><span aria-current="page">${esc(t.faq)}</span></nav>
<h1>${esc(t.faq)}</h1>
<div class="faq prose">${qa.map(([q, a], i) => `<details class="card"${i === 0 ? " open" : ""}><summary><h2 style="display:inline;font-size:17px;margin:0">${esc(q)}</h2></summary><p>${a}</p></details>`).join("")}</div>
<p><a class="btn" href="${uCats(lang)}">${esc(t.allCats)}</a></p>`;
  return страница({
    lang, title: `${t.faq} — ${t.store} | GENERAL MODERN`,
    desc: strip(qa[0][1]).slice(0, 155),
    path: uFaq(lang), alternates: Object.fromEntries(LANGS.map(l => [l, uFaq(l)])), body, active: "faq",
    jsonld: [{ "@type": "FAQPage", inLanguage: lang, url: abs(uFaq(lang)),
      mainEntity: qa.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: strip(a) } })) },
    { "@type": "BreadcrumbList", itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: abs(c.url) })) }],
  });
}
