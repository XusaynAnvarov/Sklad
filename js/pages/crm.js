// ========================================================================
//  «КЛИЕНТЫ И БЕЗОПАСНОСТЬ» — единая база людей из склада, бота и сайта.
//
//  Правило экрана: ничего не придумываем. Нет данных — пишем
//  «Не определено» и в подсказке объясняем, почему их нет.
//  Всё, что пришло по IP, помечено «≈»: это приблизительно.
//
//  Ссылка из уведомления Telegram: #/crm?id=<crm_id> — сразу открывает карточку.
// ========================================================================
import { el, toast, modal, select } from "../ui.js?v=20261109l";
import { icon } from "../icons.js?v=20261109l";
import { authHeaders } from "../db.js?v=20261109l";

const НЕТ = "Не определено";
const API = "/api/admin/crm";
async function api(method, query = "", body) {
  const r = await fetch(API + query, { method, headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

const TZ = { timeZone: "Asia/Tashkent" };
const дата = (d) => d ? new Date(d).toLocaleDateString("ru-RU", TZ) : "—";
const времяДата = (d) => d ? new Date(d).toLocaleString("ru-RU", { ...TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const день = (d) => new Date(new Date(d).getTime() + 5 * 3600e3).toISOString().slice(0, 10);

const ИСТОЧНИК = { telegram: "Telegram-бот", site: "Сайт", warehouse: "Внесён в складе", miniapp: "Мини-приложение" };
const ВИД = {
  customer: ["Клиент склада", "ok"], lead: ["Лид", "order"], review: ["Проверить вручную", "transit"], started: ["Запустил бота, номер не дал", "muted"],
};
const ГЕО_ИСТОЧНИК = { ip_cloudflare: "≈ по IP", user_city: "указал сам", location: "≈ геопозиция, ~10 км", admin: "исправлено вручную" };
const точкаВхода = (e) => {
  const s = String(e || "");
  if (!s) return null;
  if (s.startsWith("deeplink:qr")) return "QR-код: " + s.slice(12).replace(/_/g, " ");
  if (s.startsWith("deeplink:")) return "Ссылка t.me: " + s.slice(9).replace(/_/g, " ");
  if (s.startsWith("campaign:")) return "Кампания: " + s.slice(9).replace(/_/g, " ");
  if (s.startsWith("ref:")) return "Приглашение: " + s.slice(4);
  return { bot_direct: "Открыл бота напрямую", site: "Регистрация на сайте" }[s] || s;
};
// Почему гео неизвестно — честное объяснение для подсказки
function почемуНетГео(p) {
  if (p.source === "telegram") return "Telegram не передаёт ботам IP и город. Клиент не указал город и не поделился геопозицией.";
  if (p.source === "warehouse" && !p.has_site) return "Клиент внесён в складе вручную и не заходил на сайт — определить не из чего.";
  return "Cloudflare не передал страну для его IP, или визитов за последние 90 дней не было.";
}
const место = (p) => [p.city, p.country].filter(Boolean).join(", ");

let стильДобавлен = false;
function стиль() {
  if (стильДобавлен) return; стильДобавлен = true;
  document.head.append(el("style", { text: `
.crm-kpi{grid-template-columns:repeat(4,minmax(0,1fr))}
.crm-board{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:12px;margin:12px 0}
.crm-bars{display:flex;flex-direction:column;gap:7px}
.crm-bar{display:grid;grid-template-columns:minmax(90px,38%) 1fr 34px;gap:8px;align-items:center;font-size:.8125rem}
.crm-bar .t{height:8px;border-radius:99px;background:rgba(140,140,160,.16);overflow:hidden}
.crm-bar .f{height:100%;border-radius:99px;background:var(--grad,#d9b45a);transform-origin:left;animation:crmGrow .6s cubic-bezier(.2,.8,.2,1) both}
.crm-bar .n{text-align:right;font-variant-numeric:tabular-nums;color:var(--muted)}
.crm-bar.unk .f{background:rgba(140,140,160,.45)}
@keyframes crmGrow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@media (prefers-reduced-motion:reduce){.crm-bar .f{animation:none}}
.crm-ev{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:.8125rem}
.crm-ev:last-child{border-bottom:none}
.crm-risk{flex:0 0 auto;min-width:38px;text-align:center;border-radius:6px;padding:2px 6px;font-weight:700;font-variant-numeric:tabular-nums}
.crm-risk.hi{background:rgba(248,113,113,.16);color:var(--danger)}
.crm-risk.md{background:rgba(251,191,36,.16);color:var(--warn)}
.crm-risk.lo{background:rgba(140,140,160,.14);color:var(--muted)}
.crm-filters{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;margin:4px 0 12px}
.crm-filters .inp{min-width:0}
.crm-unk{color:var(--muted);border-bottom:1px dotted currentColor;cursor:help}
.crm-geo-src{display:block;font-size:.6875rem;color:var(--muted)}
.crm-card h4{margin:18px 0 8px;font-size:.8125rem;text-transform:uppercase;letter-spacing:.5px;color:var(--muted)}
.crm-kv{display:grid;grid-template-columns:minmax(120px,34%) 1fr;gap:6px 12px;font-size:.875rem}
.crm-kv>div:nth-child(odd){color:var(--muted)}
.crm-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.crm-note{width:100%;min-height:80px;resize:vertical}
.crm-banner{border-color:rgba(251,191,36,.5)!important}
@media (max-width:1100px){.crm-board{grid-template-columns:1fr 1fr}.crm-filters{grid-template-columns:repeat(4,minmax(0,1fr))}}
@media (max-width:720px){.crm-kpi{grid-template-columns:1fr 1fr}.crm-board{grid-template-columns:1fr}.crm-filters{grid-template-columns:1fr 1fr}.crm-kv{grid-template-columns:1fr}.crm-kv>div:nth-child(odd){margin-top:6px}}
` }));
}

export default async function render(page, ctx) {
  стиль();
  page.append(el("div.topbar", {}, [
    el("div", {}, [el("h1", { text: "Клиенты и безопасность" }),
      el("div.sub", { text: "Склад, Telegram-бот и сайт в одной базе. География — приблизительная." })]),
    el("button.btn.btn-outline.btn-sm", { onclick: () => загрузка() }, [icon("undo", { size: 14 }), " Обновить"]),
  ]));
  const host = el("div");
  page.append(host);

  let данные = null;
  const ф = { from: "", to: "", country: "", city: "", source: "", status: "", q: "" };

  async function загрузка() {
    host.innerHTML = "";
    host.append(el("div.muted", { style: { padding: "24px 0", textAlign: "center" }, text: "Загрузка…" }));
    try { данные = await api("GET"); }
    catch (e) { host.innerHTML = ""; host.append(el("div.empty", {}, [el("div.em-ic", {}, [icon("alert", { size: 32 })]), el("p", { text: "Ошибка: " + e.message })])); return; }
    рисовать();
    const id = (location.hash.match(/[?&]id=([^&]+)/) || [])[1];
    if (id) {
      const p = данные.people.find(x => x.crm_id === decodeURIComponent(id) || x.customer_id === decodeURIComponent(id));
      if (p) открыть(p); else toast("Карточка из ссылки не найдена — возможно, удалена", "err");
    }
  }

  function рисовать() {
    host.innerHTML = "";
    const s = данные.stats;
    if (!данные.crmReady) host.append(el("div.card.crm-banner", { style: { marginBottom: "12px" } }, [
      el("b", { text: "CRM ещё не включена. " }),
      el("span", { text: "Запустите db/crm-security-migration.sql в боевой базе. До этого видны только клиенты склада; бот и сайт работают как раньше, но журнал входов, лиды и география не записываются." }),
    ]));

    // ---- показатели ----
    const k = (ic, label, val, под, tip, вид = "") => el("div.gm-k.stat-card" + (вид ? "." + вид : ""), { "data-tip": tip }, [
      el("div.gm-k-top", {}, [el("div.gm-k-ic", {}, [icon(ic, { size: 15 })]), el("div.gm-k-lab", { text: label })]),
      el("div.gm-k-val", { text: String(val) }), el("div.gm-k-sub", {}, [el("span", { text: под })]),
    ]);
    host.append(el("div.gm-kpi.crm-kpi", {}, [
      k("user", "Всего клиентов", s.total, `лидов: ${s.leads} · без номера: ${s.started}`, "Клиенты склада + лиды, поделившиеся номером. Те, кто только запустил бота и не дал номер, сюда не входят."),
      k("sparkle", "Новых сегодня", s.today, "по времени Ташкента", "Поделились номером в боте или зарегистрировались на сайте сегодня."),
      k("broadcast", "Через Telegram", s.telegram, "поделились номером в боте", "Источник регистрации — Telegram-бот."),
      k("globe", "Через сайт", s.site, "есть аккаунт на сайте", "Есть аккаунт на generalmodern.uz."),
      k("check", "Из Узбекистана", s.uz, "≈ по IP или со слов клиента", "Страна определена: по IP (приблизительно), по выбранному городу или геопозиции.", "gm-k-ok"),
      k("arrow-up-right", "Другие страны", s.other, "VPN тоже даёт «другую страну»", "Другая страна — не повод для блокировки: часто это VPN или роуминг."),
      k("dot", "Без региона", s.unknown, "данных нет — честно пусто", "Telegram не передаёт город, а клиент его не указал; или не было визитов на сайт."),
      k("alert", "Подозрительное", s.suspicious, "риск ≥ 40 за 7 дней", "Много неудачных входов, перебор номеров, флуд боту, чужой контакт и т.п.", s.suspicious ? "gm-k-danger" : "gm-k-ok"),
    ]));

    // ---- география / подозрительное / дубли ----
    const полосы = (rows) => {
      if (!rows.length) return el("div.muted", { text: "Пока нет данных" });
      const max = Math.max(...rows.map(r => r.count));
      return el("div.crm-bars", {}, rows.map(r => el("div.crm-bar" + (r.name === НЕТ ? ".unk" : ""), {}, [
        el("span", { text: r.name, title: r.name }), el("div.t", {}, [el("div.f", { style: { width: Math.max(4, r.count / max * 100) + "%" } })]), el("span.n", { text: String(r.count) }),
      ])));
    };
    const панель = (title, body, extra) => el("div.gm-panel.card", {}, [
      el("div.gm-panel-h", {}, [el("b", { text: title }), extra || null]), el("div.gm-panel-body", {}, body),
    ]);
    const geoTabs = el("div.pill-tabs", {}, ["Страны", "Города"].map((t, i) => el("button" + (i ? "" : ".active"), { text: t, onclick: (e) => {
      geoTabs.querySelectorAll("button").forEach(b => b.classList.toggle("active", b === e.currentTarget));
      geoBody.replaceChildren(полосы(i ? данные.geo.cities : данные.geo.countries));
    } })));
    const geoBody = el("div", {}, [полосы(данные.geo.countries)]);
    const подозр = данные.suspicious.slice(0, 30).map(e => el("div.crm-ev", {}, [
      el("span.crm-risk." + (e.risk >= 70 ? "hi" : e.risk >= 40 ? "md" : "lo"), { text: String(e.risk) }),
      el("div", {}, [el("div", { text: e.kind_ru + (e.phone9 ? " · …" + e.phone9.slice(-4) : "") }),
        el("div.muted", { text: [(e.flags || []).join("; "), [e.city, e.country].filter(Boolean).join(", "), времяДата(e.created_at)].filter(Boolean).join(" · ") })]),
    ]));
    const дубли = данные.duplicates.slice(0, 30).map(d => el("div.crm-ev", {}, [
      icon("alert", { size: 14 }),
      el("div", {}, [el("div", { text: (d.phone || "—") + (d.crm_num ? " · CRM " + d.crm_num : "") }),
        el("div.muted", { text: d.reason + ": " + d.customers.map(c => c.name).join(", ") })]),
    ]));
    host.append(el("div.crm-board", {}, [
      панель("География клиентов", [geoBody, el("div.muted", { style: { fontSize: ".75rem", marginTop: "10px" }, text: "По IP — приблизительно (VPN, мобильные сети). По городу/геопозиции — со слов клиента." })], geoTabs),
      панель("Подозрительные события", подозр.length ? подозр : [el("div.muted", { text: "За 30 дней ничего подозрительного" })]),
      панель("Возможные дубликаты", дубли.length ? [el("div.muted", { style: { fontSize: ".75rem", marginBottom: "6px" }, text: "Ничего не объединяется автоматически — откройте лида и привяжите вручную." }), ...дубли] : [el("div.muted", { text: "Дублей не найдено" })]),
    ]));

    // ---- фильтры ----
    const люди = данные.people;
    const уник = (f) => [...new Set(люди.map(f).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
    const sel = (key, ph, opts) => {
      const s = select([{ value: "", label: ph }, ...opts.map(o => typeof o === "string" ? { value: o, label: o } : o)], ф[key]);
      s.addEventListener("change", () => { ф[key] = s.value; таблица(); });
      return s;
    };
    const dateInp = (key, title) => { const i = el("input.inp", { type: "date", title, value: ф[key] }); i.addEventListener("change", () => { ф[key] = i.value; таблица(); }); return i; };
    const q = el("input.inp", { placeholder: "Имя, @username, телефон", value: ф.q });
    q.addEventListener("input", () => { ф.q = q.value; таблица(); });
    host.append(el("div.crm-filters", {}, [
      q, dateInp("from", "Зарегистрирован с"), dateInp("to", "Зарегистрирован по"),
      sel("country", "Все страны", [{ value: "-", label: НЕТ }, ...уник(p => p.country)]),
      sel("city", "Все города", уник(p => p.city)),
      sel("source", "Все источники", Object.entries(ИСТОЧНИК).map(([value, label]) => ({ value, label }))),
      sel("status", "Все статусы", Object.entries(ВИД).map(([value, [label]]) => ({ value, label }))),
    ]));
    const tableHost = el("div.card", { style: { padding: "0", overflowX: "auto" } });
    host.append(tableHost);
    таблица();

    function таблица() {
      const qq = ф.q.trim().toLowerCase(), qd = qq.replace(/\D/g, "");
      const rows = люди.filter(p => {
        const reg = p.registered_at || p.created_at;
        if (ф.from && (!reg || день(reg) < ф.from)) return false;
        if (ф.to && (!reg || день(reg) > ф.to)) return false;
        if (ф.country === "-" ? p.country : ф.country && p.country !== ф.country) return false;
        if (ф.city && p.city !== ф.city) return false;
        if (ф.source && p.source !== ф.source) return false;
        if (ф.status && p.kind !== ф.status) return false;
        if (qq && !(String(p.name).toLowerCase().includes(qq) || String(p.tg_username || "").toLowerCase().includes(qq.replace(/^@/, ""))
          || (qd.length >= 3 && String(p.phone || "").replace(/\D/g, "").includes(qd)))) return false;
        return true;
      }).sort((a, b) => String(b.registered_at || b.created_at || "").localeCompare(String(a.registered_at || a.created_at || "")));
      const tbody = el("tbody");
      rows.slice(0, 500).forEach(p => {
        const [вид, цвет] = ВИД[p.kind] || [p.kind, "muted"];
        const geo = место(p)
          ? el("span", {}, [место(p), el("span.crm-geo-src", { text: ГЕО_ИСТОЧНИК[p.geo_source] || "" })])
          : el("span.crm-unk", { text: НЕТ, title: почемуНетГео(p) });
        tbody.append(el("tr", { style: { cursor: "pointer" }, onclick: () => открыть(p) }, [
          el("td", { text: p.crm_num != null ? String(p.crm_num) : "—" }),
          el("td", {}, [el("b", { text: p.name })]),
          el("td", { text: p.phone || "—" }),
          el("td", { text: p.tg_username ? "@" + p.tg_username : (p.tg_user_id ? "ID " + p.tg_user_id : "—") }),
          el("td", {}, [ИСТОЧНИК[p.source] || p.source || "—", точкаВхода(p.entry_point) ? el("span.crm-geo-src", { text: точкаВхода(p.entry_point) }) : null]),
          el("td", {}, [geo]),
          el("td", { text: дата(p.registered_at || p.created_at) }),
          el("td", {}, [el("span.badge." + цвет, { text: вид })]),
        ]));
      });
      tableHost.replaceChildren(el("table.tbl", {}, [
        el("thead", {}, [el("tr", {}, ["CRM ID", "Имя", "Телефон", "Telegram", "Источник", "Город / страна", "Регистрация", "Статус"].map(h => el("th", { text: h })))]),
        tbody,
      ]), rows.length ? (rows.length > 500 ? el("div.muted", { style: { padding: "10px 16px" }, text: `Показаны 500 из ${rows.length} — уточните фильтр` }) : null)
        : el("div.muted", { style: { padding: "20px", textAlign: "center" }, text: "Никого не найдено" }));
      // подписи ячеек для карточного вида на телефоне
      const heads = [...tableHost.querySelectorAll("thead th")].map(th => th.textContent);
      tableHost.querySelectorAll("tbody tr").forEach(tr => [...tr.children].forEach((td, i) => td.setAttribute("data-label", heads[i])));
    }
  }

  // =================== КАРТОЧКА КЛИЕНТА ===================
  async function открыть(p) {
    const body = el("div.crm-card", {}, [el("div.muted", { text: "Загрузка…" })]);
    const m = modal({ title: p.name + (p.crm_num != null ? " · CRM " + p.crm_num : ""), body, wide: true, actions: [{ label: "Закрыть", onClick: c => c() }] });
    let d;
    try { d = await api("GET", "?key=" + encodeURIComponent(p.key)); }
    catch (e) { body.replaceChildren(el("p", { text: "Ошибка: " + e.message })); return; }
    const crm = d.crm[0] || null;
    const kv = (pairs) => el("div.crm-kv", {}, pairs.flatMap(([k, v]) => [el("div", { text: k }), v && v.nodeType ? v : el("div", { text: v == null || v === "" ? "—" : String(v) })]));
    const нет = (почему) => el("span.crm-unk", { text: НЕТ, title: почему });
    const geoTxt = crm && (crm.city || crm.country)
      ? `${[crm.city, crm.region !== crm.city ? crm.region : null, crm.country].filter(Boolean).join(", ")} (${ГЕО_ИСТОЧНИК[crm.geo_source] || crm.geo_source || "?"}, ${дата(crm.geo_updated_at)})`
      : null;
    const секции = [];

    секции.push(el("h4", { text: "1. Основная информация" }), kv([
      ["Статус", (ВИД[p.kind] || [p.kind])[0]],
      ["Карточка склада", d.customer ? d.customer.name : "нет — это лид"],
      ["Создан", времяДата(d.customer?.created_at || crm?.created_at)],
      ["Последняя активность", времяДата(p.last_active_at)],
      ["Город / страна", geoTxt || нет(почемуНетГео(p))],
    ]));
    секции.push(el("h4", { text: "2. Telegram-профиль" }), d.crm.length ? kv(d.crm.flatMap((r, i) => [
      [d.crm.length > 1 ? `Аккаунт ${i + 1}` : "Имя", [r.first_name, r.last_name].filter(Boolean).join(" ") || "—"],
      ["Username", r.tg_username ? "@" + r.tg_username : "нет username"], ["Telegram ID", r.tg_user_id],
      ["Язык Telegram", r.tg_lang || "не передан"], ["Первое обращение к боту", времяДата(r.first_seen_at)],
      ["Привязка", { linked: "привязан к складу", lead: "лид, не привязан", review: "нужна ручная проверка", started: "номер не дан" }[r.link_status] || r.link_status],
    ])) : el("div.muted", { text: "К этому клиенту Telegram через бота не подключался (или до включения CRM)." }));
    секции.push(el("h4", { text: "3. Контактные данные" }), kv([
      ["Телефон", p.phone || "—"],
      ["Доп. номера", (d.customer?.phones || []).join(", ") || "—"],
      ["Аккаунт сайта", d.accounts.length ? d.accounts.map(a => `${a.phone} · создан ${дата(a.created_at)} · вход ${времяДата(a.last_login)}`).join("\n") : "нет"],
    ]));
    секции.push(el("h4", { text: "4. Источник регистрации" }), kv([
      ["Канал", ИСТОЧНИК[p.source] || p.source || "—"],
      ["Точка входа", точкаВхода(crm?.entry_point) || нет("Клиент пришёл до включения CRM или источник не передан")],
      ["UTM", crm?.utm ? Object.entries(crm.utm).filter(([, v]) => v).map(([k, v]) => k + "=" + v).join(", ") : "—"],
      ["Реферальный код", crm?.ref_code || "—"],
      ["Дата регистрации", времяДата(crm?.registered_at || d.accounts[0]?.created_at)],
      ["Согласие с уведомлением", crm?.consent_at ? `${времяДата(crm.consent_at)} (версия ${crm.consent_version})` : "—"],
    ]));

    // 6. заказы
    секции.push(el("h4", { text: `6. История заказов (${d.orders.length})` }));
    секции.push(d.orders.length ? el("table.tbl", {}, [
      el("thead", {}, [el("tr", {}, ["Дата", "Статус", "Позиций", "Сумма", "Откуда"].map(h => el("th", { text: h })))]),
      el("tbody", {}, d.orders.slice(0, 50).map(o => el("tr", {}, [el("td", { text: дата(o.date) }), el("td", { text: o.status }), el("td", { text: String(o.items) }),
        el("td", { text: o.total.toLocaleString("ru-RU") + " " + ({ yuan: "¥", usd: "$", som: "сум" }[o.currency] || o.currency || "") }), el("td", { text: o.source || "—" })]))),
    ]) : el("div.muted", { text: d.customer ? "Заказов нет" : "У лида заказов нет — перенесите в склад, чтобы оформить продажу" }));

    // 7. входы
    const входы = d.events.filter(e => ["login_ok", "login_fail", "login_code", "register", "verify_start", "bot_start", "bot_contact", "miniapp_open"].includes(e.kind));
    const evRow = (e) => el("div.crm-ev", {}, [
      el("span.crm-risk." + (e.risk >= 70 ? "hi" : e.risk >= 40 ? "md" : "lo"), { text: e.ok === false ? "✕" : e.risk ? String(e.risk) : "✓", title: e.risk ? "Риск " + e.risk + "/100" : "" }),
      el("div", {}, [el("div", { text: `${e.kind_ru} · ${времяДата(e.created_at)}` }),
        el("div.muted", { text: [
          { site: "сайт", telegram: "Telegram", miniapp: "мини-приложение" }[e.channel] || e.channel,
          [e.city, e.country].filter(Boolean).join(", ") || (e.channel === "telegram" ? "гео: Telegram не передаёт" : "гео: " + НЕТ),
          [e.device, e.os, e.browser].filter(Boolean).join(" · ") || (e.channel === "telegram" ? null : "устройство: " + НЕТ),
          e.ip ? "IP " + e.ip : null, (e.flags || []).join("; ") || null,
        ].filter(Boolean).join(" · ") })]),
    ]);
    секции.push(el("h4", { text: `7. История входов (${входы.length})` }), входы.length ? el("div", {}, входы.slice(0, 60).map(evRow)) : el("div.muted", { text: "Записей нет. Журнал ведётся с момента применения миграции." }));
    // 8. география посещений
    секции.push(el("h4", { text: "8. География посещений" }), d.geo.length ? el("div.crm-bars", {}, d.geo.slice(0, 10).map(g => {
      const max = d.geo[0].count;
      return el("div.crm-bar" + (g.place === НЕТ ? ".unk" : ""), {}, [el("span", { text: g.place }), el("div.t", {}, [el("div.f", { style: { width: Math.max(4, g.count / max * 100) + "%" } })]), el("span.n", { text: String(g.count) })]);
    })) : el("div.muted", { text: "Посещений не записано" }));
    // 9. безопасность
    const опасн = d.events.filter(e => (e.risk || 0) > 0 || ["impersonation", "bot_flood"].includes(e.kind));
    секции.push(el("h4", { text: `9. События безопасности (${опасн.length})` }), опасн.length ? el("div", {}, опасн.slice(0, 40).map(evRow)) : el("div.muted", { text: "Ничего подозрительного" }));

    // 10. примечания + действия
    секции.push(el("h4", { text: "10. Примечания администратора" }));
    if (crm) {
      const note = el("textarea.inp.crm-note", { placeholder: "Только для сотрудников. Клиент это не видит." });
      note.value = crm.admin_notes || "";
      секции.push(note, el("div.crm-actions", {}, [el("button.btn.btn-primary.btn-sm", { text: "Сохранить примечание", onclick: () => действие({ action: "note", crm_id: crm.id, text: note.value }, "Сохранено") })]));
      const кандидаты = данные.duplicates.find(x => x.crm_id === crm.id)?.customers || [];
      const кнопки = [];
      if (!crm.customer_id) {
        кнопки.push(el("button.btn.btn-ok.btn-sm", { text: "➕ Перенести в склад", onclick: () => действие({ action: "promote", crm_id: crm.id }, "Клиент создан в складе", true) }));
        const все = данные.people.filter(x => x.kind === "customer");
        const выбор = select([{ value: "", label: кандидаты.length ? "Привязать к… (совпадение по номеру)" : "Привязать к клиенту склада…" },
          ...кандидаты.map(c => ({ value: c.id, label: "★ " + c.name })), ...все.filter(x => !кандидаты.some(c => c.id === x.customer_id)).map(x => ({ value: x.customer_id, label: x.name + (x.phone ? " · " + x.phone : "") }))], "");
        выбор.style.minWidth = "240px";
        выбор.addEventListener("change", () => {
          if (!выбор.value) return;
          const кому = все.find(x => x.customer_id === выбор.value)?.name || "клиенту";
          if (confirm(`Привязать этот Telegram к «${кому}»? Убедитесь, что это один и тот же человек.`)) действие({ action: "link", crm_id: crm.id, customer_id: выбор.value }, "Привязано", true);
        });
        кнопки.push(выбор);
      }
      const статус = select(["new", "active", "blocked", "archived"].map(v => ({ value: v, label: { new: "Статус: новый", active: "Статус: активный", blocked: "Статус: заблокирован", archived: "Статус: архив" }[v] })), crm.status || "new");
      статус.addEventListener("change", () => действие({ action: "status", crm_id: crm.id, status: статус.value }, "Статус изменён"));
      кнопки.push(статус);
      кнопки.push(el("button.btn.btn-outline.btn-sm", { text: "✏️ Исправить данные", onclick: () => исправить(crm) }));
      кнопки.push(el("button.btn.btn-outline.btn-sm", { text: "⬇ Выгрузить данные", onclick: () => выгрузить(crm) }));
      кнопки.push(el("button.btn.btn-danger.btn-sm", { text: "Удалить по запросу клиента", onclick: () => забыть(crm) }));
      секции.push(el("div.crm-actions", {}, кнопки));
    } else секции.push(el("div.muted", { text: "Примечания и действия появятся, когда клиент подключится к боту (нужна CRM-карточка). Заметки склада — в разделе «Клиенты»." }));

    // журнал действий сотрудников
    секции.push(el("h4", { text: `История изменений (${d.audit.length})` }), d.audit.length ? el("div", {}, d.audit.slice(0, 50).map(a => el("div.crm-ev", {}, [
      icon("clock", { size: 14 }), el("div", {}, [el("div", { text: `${{ note: "Примечание", status: "Статус", edit: "Исправление данных", promote: "Перенос в склад", link: "Привязка", export: "Выгрузка данных", forget: "Удаление" }[a.action] || a.action} · ${a.actor} · ${времяДата(a.created_at)}` }),
        el("div.muted", { text: a.details ? JSON.stringify(a.details).slice(0, 300) : "" })]),
    ]))) : el("div.muted", { text: "Изменений не было" }));

    body.replaceChildren(...секции);

    async function действие(b, msg, закрыть) {
      try { await api("POST", "", b); toast(msg); if (закрыть) { m.close(); await загрузка(); } }
      catch (e) { toast(e.message, "err"); }
    }
    function исправить(r) {
      const поля = { first_name: "Имя", last_name: "Фамилия", city: "Город", region: "Регион", country: "Страна" };
      const inputs = {};
      const form = el("div.crm-kv", {}, Object.entries(поля).flatMap(([k, l]) => { inputs[k] = el("input.inp", { value: r[k] || "" }); return [el("div", { text: l }), inputs[k]]; }));
      modal({ title: "Исправить данные клиента", body: el("div", {}, [el("p.muted", { text: "По запросу клиента. Изменение попадёт в журнал." }), form]), actions: [
        { label: "Отмена", onClick: c => c() },
        { label: "Сохранить", kind: "btn-primary", onClick: async c => { const fields = {}; for (const k in inputs) if ((inputs[k].value || "") !== (r[k] || "")) fields[k] = inputs[k].value; if (!Object.keys(fields).length) return c(); c(); await действие({ action: "edit", crm_id: r.id, fields }, "Данные исправлены", true); } },
      ] });
    }
    async function выгрузить(r) {
      try {
        const res = await fetch(API + "?export=" + encodeURIComponent(r.id), { headers: await authHeaders() });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
        const url = URL.createObjectURL(await res.blob());
        el("a", { href: url, download: `client-${r.num}.json` }).click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } catch (e) { toast(e.message, "err"); }
    }
    function забыть(r) {
      const inp = el("input.inp", { placeholder: "Напишите УДАЛИТЬ" });
      modal({ title: "Удалить данные клиента", body: el("div", {}, [
        el("p", { text: "Удаляются CRM-карточка и журнал событий (входы, визиты, гео). Накладные и оплаты склада остаются — это бухгалтерские документы." }),
        el("p.muted", { text: "Действие необратимо." }), inp,
      ]), actions: [
        { label: "Отмена", onClick: c => c() },
        { label: "Удалить", kind: "btn-danger", onClick: async c => { if (inp.value.trim() !== "УДАЛИТЬ") return toast("Нужно написать УДАЛИТЬ", "err"); c(); await действие({ action: "forget", crm_id: r.id, confirm: "УДАЛИТЬ" }, "Данные удалены", true); } },
      ] });
    }
  }

  await загрузка();
}
