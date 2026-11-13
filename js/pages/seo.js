// ========================================================================
//  СКЛАД → «SEO и поисковая видимость».
//
//  Показывает только настоящие данные: аудит товаров (считается на
//  сервере), живые проверки сайта снаружи, статусы сервисов. Показы,
//  клики и позиции — только из подключённой Google Search Console; пока
//  её нет, так и написано: «не подключено».
//
//  Все правки — в файле SEO-уточнений на сервере, не в складе. Перед
//  каждой правкой сохраняется снимок, внизу страницы — откат.
// ========================================================================
import { el, toast, modal, confirmDialog, input, showLoader, hideLoader } from "../ui.js?v=20261113d";
import { icon } from "../icons.js?v=20261113d";
import { authHeaders } from "../db.js?v=20261113d";

async function api(method, query = "", body) {
  const r = await fetch("/api/admin/seo" + query, {
    method, headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Ошибка " + r.status);
  return j;
}

const дата = (s) => s ? new Date(s).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const число = (n) => Number(n || 0).toLocaleString("ru-RU");
const значок = (ok, да = "Работает", нет = "Не подключено") => el("span.badge." + (ok ? "ok" : "muted"), { text: ok ? да : нет });
const ПРОБЛЕМЫ = {
  no_photo: "Нет фото", one_photo: "Одно фото", short_name: "Короткое название", long_title: "Длинный заголовок",
  dup_name: "Одинаковое название", no_sku: "Нет артикула", no_descr: "Нет своего описания", no_compat: "Нет совместимости",
  spaces: "Лишние пробелы", no_price: "Нет цены",
};

export default async function renderSeo(page, ctx) {
  page.append(el("div.topbar", {}, [
    el("div", {}, [el("h1", { text: "SEO и поисковая видимость" }),
      el("div.sub", { text: "Страницы товаров для Google, Яндекса, Bing и ИИ-поиска. Склад, цены и остатки отсюда не меняются." })]),
  ]));

  const actions = el("div.toolbar");
  const host = el("div");
  page.append(actions, host);

  let st;
  try { showLoader("Загружаю SEO-сводку…"); st = await api("GET", "?live=1&gsc=1"); }
  catch (e) { host.append(el("div.card", { style: { padding: "18px" }, text: "Не удалось загрузить: " + e.message })); return; }
  finally { hideLoader(); }

  actions.append(
    el("button.btn.btn-primary", { onclick: async () => {
      showLoader("Проверяю все товары…");
      try { await api("POST", "", { action: "audit" }); toast("Проверка готова", "ok"); ctx.refresh(); }
      catch (e) { toast(e.message, "err"); } finally { hideLoader(); }
    } }, [icon("check", { size: 16 }), "Проверить SEO всех товаров"]),
    el("button.btn.btn-outline", { onclick: () => безопасныеИсправления(ctx) }, [icon("settings", { size: 16 }), "Исправить безопасные SEO-ошибки"]),
    el("a.btn.btn-outline", { href: st.urls.catalog, target: "_blank", rel: "noopener" }, [icon("globe", { size: 16 }), "Открыть SEO-каталог"]),
  );

  // ---------- итоги ----------
  const L = st.last;
  host.append(el("div.stat-grid", {}, [
    карточка("Товаров на сайте", число(st.catalog.products), `категорий: ${st.catalog.categories}`),
    карточка("SEO заполнено полностью", L ? число(L.complete) : "—", L ? "без ошибок и предупреждений" : "запустите проверку"),
    карточка("Нужно поправить", L ? число(L.withErrors + L.withWarnings) : "—", L ? `ошибок: ${L.withErrors}, предупреждений: ${L.withWarnings}` : ""),
    карточка("Последняя проверка", L ? дата(L.at) : "ещё не было", "автоматически — каждые 6 часов"),
  ]));

  // ---------- статусы ----------
  host.append(el("div.section-h", { text: "Статусы" }));
  const live = Object.fromEntries((st.live || []).map(x => [x.path, x]));
  const живой = (p) => live[p] ? значок(live[p].ok, "Доступен (" + live[p].status + ")", live[p].status ? "Ошибка " + live[p].status : "Нет ответа") : значок(false, "", "не проверено");
  const productLive = (st.live || []).find(x => x.path.startsWith("/p/"));
  const rows = [
    ["Карта сайта (sitemap.xml)", живой("/sitemap.xml"), L ? `${число(L.sitemap.urls)} адресов товаров (3 языка) + категории. ${L.sitemap.error || ""}` : "", st.urls.sitemap],
    ["robots.txt", живой("/robots.txt"), "Открыт для поисковиков, ссылка на карту сайта", "/robots.txt"],
    ["Страницы товаров", productLive ? значок(productLive.ok, "Доступны, разметка Product есть", "Ошибка " + productLive.status) : значок(false, "", "не проверено"), "Полный HTML без JavaScript, фото, хлебные крошки, hreflang", productLive && productLive.path],
    ["Каталог и категории", живой("/c/"), L ? `${L.pages} страниц категорий` : "", "/c/"],
    ["llms.txt (для ИИ-поиска)", живой("/llms.txt"), "Краткая справка о магазине для ChatGPT, Perplexity и др.", st.urls.llms],
    ["Товарный фид Merchant Center", значок(false, "", "Не используется"), "Merchant Center принимает товар только с ценой, а цены не публикуются", null],
    ["Структурированные данные", L ? значок(L.schema.withErrors === 0, `Без ошибок (${L.schema.checked} проверено)`, `Ошибок: ${L.schema.withErrors}`) : значок(false, "", "не проверено"),
      "Product, BreadcrumbList, ItemList, FAQPage, OnlineStore. Без Offer — цены не публикуются", null],
    // Две разные вещи: сайт подтверждён в Search Console (это главное, уже сделано)
    // и статистика Search Console прямо здесь, в складе (нужен ключ на сервере).
    ["Google Search Console — сайт", значок(st.services.google_verify, "Подтверждён и работает", "Не подтверждён"),
      st.services.google_verify ? "Google видит сайт и карту сайта. Показы и клики смотрите в самой Search Console (аккаунт generalmodern.uz@gmail.com)." : "Подтвердите сайт в Search Console", "https://search.google.com/search-console"],
    ["Статистика Google в складе", значок(st.gsc && st.gsc.connected, "Показывается", "Не настроена"),
      st.gsc && st.gsc.connected ? st.gsc.property : "Необязательно. Чтобы клики и запросы были видны прямо здесь, нужен ключ сервисного аккаунта Google на сервере.", null],
    ["Подтверждение Google", значок(st.services.google_verify, "Код задан", "Не задан"), "Подтверждение владения: DNS в Cloudflare или файл google….html", null],
    ["Яндекс Вебмастер", значок(st.services.yandex_verify, "Код задан", "Не задан"), "Подтверждение: meta-тег или файл yandex_….html", "https://webmaster.yandex.ru"],
    ["Bing Webmaster Tools", значок(st.services.bing_verify, "Код задан", "Не задан"), "Можно импортировать сайт из Search Console", "https://www.bing.com/webmasters"],
    ["Google Analytics 4", значок(st.services.ga4, "Подключено", "Не используется"), "Необязательно: счётчик посещений. На поиск не влияет.", null],
    ["IndexNow (Bing, Яндекс)", значок(st.services.indexnow, "Включено", "Выключено"), "Сообщает поисковикам о новых товарах сразу", null],
  ];
  host.append(таблица(["Что", "Статус", "Подробности", ""], rows.map(([a, b, c, href]) => [
    a, b, c, href ? el("a", { href, target: "_blank", rel: "noopener", text: "открыть ↗" }) : "",
  ])));

  // ---------- поисковая статистика ----------
  host.append(el("div.section-h", { text: "Поисковый трафик (Google Search Console, 28 дней)" }));
  if (st.gsc && st.gsc.connected) {
    const t = st.gsc.totals;
    host.append(el("div.stat-grid", {}, [
      карточка("Клики", число(t.clicks), ""), карточка("Показы", число(t.impressions), ""),
      карточка("CTR", (t.ctr * 100).toFixed(1) + "%", ""), карточка("Средняя позиция", t.position ? t.position.toFixed(1) : "—", ""),
    ]));
    host.append(el("div.section-h", { text: "Запросы" }));
    host.append(таблица(["Запрос", "Клики", "Показы", "CTR", "Позиция"], st.gsc.queries.map(q => [q.q, число(q.clicks), число(q.impressions), (q.ctr * 100).toFixed(1) + "%", q.position.toFixed(1)])));
  } else {
    host.append(el("div.card", { style: { padding: "16px", lineHeight: "1.55" } }, [
      el("div", { text: "Сайт в Search Console подтверждён. Показы, клики, CTR, позиции и запросы уже собираются — смотрите их в самой Search Console (аккаунт generalmodern.uz@gmail.com). Здесь, в складе, они появятся только после необязательной настройки ниже." }),
      el("div.muted", { style: { marginTop: "8px" }, text: (st.services.google_verify ? "✓ 1) Сайт подтверждён в Search Console (файлом). " : "1) Подтвердить сайт в Search Console. ")
        + "2) Создать сервисный аккаунт Google Cloud с включённым Search Console API — не сделано. 3) Добавить его e-mail пользователем ресурса — не сделано. 4) Положить JSON-ключ на сервер в .env как GSC_SERVICE_ACCOUNT — не сделано." }),
    ]));
  }

  // ---------- проблемы по товарам ----------
  host.append(el("div.section-h", { text: "Товары: что улучшить" }));
  const prodHost = el("div");
  host.append(prodHost);
  товары(prodHost, st, ctx);

  // ---------- категории ----------
  host.append(el("div.section-h", { text: "Категории на сайте" }));
  host.append(el("div.hint", { style: { marginTop: "0" }, text: "Название в складе не меняется. Здесь — как категория называется на публичных страницах на трёх языках." }));
  host.append(таблица(["В складе", "Русский", "O‘zbekcha", "English", "Товаров", ""], st.catalog.categoryList.sort((a, b) => b.count - a.count).map(c => [
    c.raw, c.ru, c.uz, c.en, String(c.count),
    el("button.btn.btn-outline.btn-sm", { onclick: () => правкаКатегории(c, st.categoryOverrides[c.raw] || {}, ctx), text: "Изменить" }),
  ])));

  // ---------- настройки ----------
  host.append(el("div.section-h", { text: "Настройки: компания, подтверждение, цены" }));
  host.append(настройки(st.settings, ctx));

  // ---------- история ----------
  host.append(el("div.section-h", { text: "История изменений SEO (откат)" }));
  if (!st.history.length) host.append(el("div.muted", { text: "Изменений ещё не было." }));
  else host.append(таблица(["Когда", "Что", ""], st.history.map(h => [дата(h.at), h.label,
    el("button.btn.btn-outline.btn-sm", { text: "Вернуть как было до этого", onclick: () => confirmDialog(`Вернуть SEO-уточнения к состоянию до «${h.label}»? Текущее состояние тоже сохранится в истории.`, async () => {
      try { await api("POST", "", { action: "rollback", id: h.id }); toast("Откат выполнен", "ok"); ctx.refresh(); } catch (e) { toast(e.message, "err"); }
    }) })])));
}

function карточка(label, value, sub) {
  return el("div.stat-card", {}, [el("div.st-label", { text: label }), el("div.st-value", { text: value }), sub ? el("div.st-sub", { text: sub }) : null]);
}
function таблица(head, rows) {
  return el("div.tbl-wrap", { style: { overflowX: "auto" } }, [el("table.tbl", {}, [
    el("thead", {}, [el("tr", {}, head.map(h => el("th", { text: h })))]),
    el("tbody", {}, rows.map(r => el("tr", {}, r.map(c => el("td", {}, [c ?? ""]))))),
  ])]);
}

async function товары(hostEl, st, ctx) {
  let data;
  try { data = await api("GET", "?part=products"); } catch (e) { hostEl.append(el("div.muted", { text: e.message })); return; }
  if (!data.products.length) { hostEl.append(el("div.muted", { text: "Нажмите «Проверить SEO всех товаров»." })); return; }
  const уровни = { error: "Ошибки", warn: "Предупреждения", info: "Можно дополнить" };
  let level = "error", q = "";
  const counts = Object.fromEntries(Object.keys(уровни).map(l => [l, data.products.filter(p => p.issues.some(i => i.level === l)).length]));
  const tabs = el("div.pill-tabs");
  const search = input({ placeholder: "Код или название…", style: { maxWidth: "260px" } });
  const list = el("div");
  Object.entries(уровни).forEach(([k, label]) => {
    const b = el("button" + (k === level ? ".active" : ""), { text: `${label} (${counts[k]})`, onclick: () => { level = k; [...tabs.children].forEach(x => x.classList.remove("active")); b.classList.add("active"); draw(); } });
    tabs.append(b);
  });
  search.addEventListener("input", () => { q = search.value.toLowerCase(); draw(); });
  hostEl.append(el("div.toolbar", {}, [tabs, search]), list);
  function draw() {
    const rows = data.products.filter(p => p.issues.some(i => i.level === level))
      .filter(p => !q || p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)).slice(0, 200);
    list.innerHTML = "";
    if (!rows.length) { list.append(el("div.muted", { text: "Нет товаров в этом списке." })); return; }
    list.append(таблица(["Код", "Товар", "Что не так", ""], rows.map(p => [
      p.code,
      el("a", { href: "/p/" + p.slug, target: "_blank", rel: "noopener", text: p.name }),
      p.issues.filter(i => i.level === level).map(i => ПРОБЛЕМЫ[i.key] || i.key).join(", "),
      el("button.btn.btn-outline.btn-sm", { text: "Уточнить", onclick: () => правкаТовара(p, st.overrides[p.code] || {}, ctx) }),
    ])));
    if (rows.length === 200) list.append(el("div.muted", { style: { marginTop: "8px" }, text: "Показаны первые 200 — уточните поиском." }));
  }
  draw();
}

function правкаТовара(p, ov, ctx) {
  const f = {
    title: input({ value: ov.title || "", placeholder: "Пусто — заголовок собирается автоматически" }),
    description: el("textarea.inp", { rows: 4, placeholder: "Назначение, особенности — только проверенные сведения" }),
    compat: input({ value: ov.compat || "", placeholder: "Например: JUKI DDL-8700, JACK F4" }),
    brand: input({ value: ov.brand || "", placeholder: "Только если бренд производителя точно известен" }),
  };
  f.description.value = ov.description || "";
  const body = el("div", {}, [
    el("div.muted", { style: { marginBottom: "12px" }, text: `${p.code} · ${p.name}` }),
    ...[["SEO-заголовок", f.title], ["Описание", f.description], ["Совместимость", f.compat], ["Бренд", f.brand]]
      .map(([l, i]) => el("label.field", {}, [el("span.field-label", { text: l }), i])),
    el("div.hint", { style: { marginTop: "8px" }, text: "Название, цена и остаток в складе не меняются. Пустое поле — используется автоматическое значение." }),
  ]);
  modal({ title: "SEO товара", body, actions: [
    { label: "Отмена", onClick: c => c() },
    { label: "Сохранить", kind: "btn-primary", onClick: async (c) => {
      try {
        await api("POST", "", { action: "product", code: p.code, title: f.title.value, description: f.description.value, compat: f.compat.value, brand: f.brand.value });
        toast("Сохранено", "ok"); c(); ctx.refresh();
      } catch (e) { toast(e.message, "err"); }
    } },
  ] });
}

function правкаКатегории(c, ov, ctx) {
  const f = { ru: input({ value: ov.ru || c.ru }), uz: input({ value: ov.uz || c.uz }), en: input({ value: ov.en || c.en }),
    text_ru: el("textarea.inp", { rows: 3, placeholder: "Пусто — описание собирается автоматически" }) };
  f.text_ru.value = ov.text_ru || "";
  modal({ title: "Категория «" + c.raw + "»", body: el("div", {}, [
    ...[["Русский", f.ru], ["O‘zbekcha", f.uz], ["English", f.en], ["Описание (русский)", f.text_ru]].map(([l, i]) => el("label.field", {}, [el("span.field-label", { text: l }), i])),
    el("div.hint", { style: { marginTop: "8px" }, text: "Адрес категории (/c/" + c.slug + ") не меняется." }),
  ]), actions: [
    { label: "Отмена", onClick: x => x() },
    { label: "Сохранить", kind: "btn-primary", onClick: async (x) => {
      try { await api("POST", "", { action: "category", raw: c.raw, ru: f.ru.value, uz: f.uz.value, en: f.en.value, text_ru: f.text_ru.value }); toast("Сохранено", "ok"); x(); ctx.refresh(); }
      catch (e) { toast(e.message, "err"); }
    } },
  ] });
}

async function безопасныеИсправления(ctx) {
  let fixes;
  try { showLoader("Ищу безопасные исправления…"); fixes = (await api("POST", "", { action: "preview" })).fixes; }
  catch (e) { toast(e.message, "err"); return; } finally { hideLoader(); }
  if (!fixes.length) { toast("Безопасных исправлений не найдено", "ok"); return; }
  const body = el("div", {}, [
    el("p", { text: `Найдено: ${fixes.length}. Меняется только SEO-заголовок страницы; название в складе, цена и адрес остаются прежними. Перед применением сохраняется снимок для отката.` }),
    таблица(["Товар", "Было", "Станет", "Почему"], fixes.slice(0, 100).map(f => [f.code, f.before, f.after, f.why])),
    fixes.length > 100 ? el("div.muted", { text: `…и ещё ${fixes.length - 100}` }) : null,
  ]);
  modal({ title: "Предпросмотр исправлений", wide: true, body, actions: [
    { label: "Отмена", onClick: c => c() },
    { label: "Применить все", kind: "btn-primary", onClick: async (c) => {
      try { const r = await api("POST", "", { action: "apply" }); toast(`Исправлено: ${r.applied}`, "ok"); c(); ctx.refresh(); }
      catch (e) { toast(e.message, "err"); }
    } },
  ] });
}

function настройки(s, ctx) {
  const поля = [
    ["business_name", "Название компании"], ["phone", "Телефон (+998…)"], ["email", "E-mail"], ["telegram", "Telegram (https://t.me/…)"],
    ["street", "Улица, дом"], ["city", "Город"], ["region", "Область"], ["postal", "Индекс"], ["lat", "Широта"], ["lng", "Долгота"],
    ["hours", "Часы работы (Mo-Sa 09:00-18:00)"],
    ["delivery_ru", "О доставке (рус.) — только подтверждённое"], ["delivery_uz", "Yetkazib berish (o‘zb.)"], ["delivery_en", "Delivery (eng.)"],
    ["verify_google", "Google: код meta-тега"], ["google_file", "Google: имя файла (google….html)"],
    ["verify_yandex", "Яндекс: код meta-тега"], ["yandex_file", "Яндекс: код из имени файла yandex_….html"],
    ["verify_bing", "Bing: код (msvalidate / BingSiteAuth)"], ["ga4_id", "Google Analytics 4 (G-…)"], ["gsc_property", "Ресурс Search Console"],
  ];
  const inputs = {};
  const grid = el("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: "12px" } },
    поля.map(([k, l]) => { inputs[k] = input({ value: s[k] || "" }); return el("label.field", {}, [el("span.field-label", { text: l }), inputs[k]]); }));
  const chk = (k, label) => { const c = el("input", { type: "checkbox" }); c.checked = !!s[k]; inputs[k] = c; return el("label", { style: { display: "flex", gap: "8px", alignItems: "center", marginTop: "10px" } }, [c, label]); };
  const card = el("div.card", { style: { padding: "16px" } }, [
    grid,
    chk("local_business", "Показывать поисковикам физический магазин (LocalBusiness) — только при подтверждённом адресе"),
    chk("indexnow", "Сообщать Bing и Яндексу о новых товарах (IndexNow)"),
    el("div.hint", { style: { marginTop: "12px" }, text: "Цены на сайте и в поиске не публикуются: клиент присылает заявку с количеством, вы называете цену, клиент подтверждает." }),
    el("div", { style: { display: "flex", gap: "10px", marginTop: "14px", flexWrap: "wrap" } }, [
      el("button.btn.btn-primary", { text: "Сохранить настройки", onclick: () => {
        const settings = {};
        Object.entries(inputs).forEach(([k, i]) => { settings[k] = i.type === "checkbox" ? i.checked : i.value; });
        const go = async () => {
          try {
            if (settings.indexnow && !s.indexnow_key) await api("POST", "", { action: "indexnow-key" });
            await api("POST", "", { action: "settings", settings }); toast("Сохранено", "ok"); ctx.refresh();
          } catch (e) { toast(e.message, "err"); }
        };
        go();
      } }),
      s.indexnow ? el("button.btn.btn-outline", { text: "Отправить все страницы в IndexNow", onclick: async () => {
        try { const r = await api("POST", "", { action: "indexnow-all" }); toast(r.sent ? `Отправлено: ${r.sent}` : "Не отправлено (код " + (r.status || "—") + ")", r.sent ? "ok" : "err"); } catch (e) { toast(e.message, "err"); }
      } }) : null,
    ]),
  ]);
  return card;
}
