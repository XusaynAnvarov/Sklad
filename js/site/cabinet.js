// ========================================================================
//  ЛИЧНЫЙ КАБИНЕТ КЛИЕНТА — вариант A «Premium Glass».
//
//  Главное: клиент находит любой товар и сразу видит, покупал ли он его,
//  по какой цене и когда. Все цифры приходят из /api/client/cabinet — он
//  отбирает строки только этого клиента по подписанному токену и считает
//  по правилам склада (api/lib/cabinetdata.js). Здесь ничего не
//  пересчитывается заново — только показывается.
//
//  Тексты на трёх языках — js/site/cabinet-i18n.js. Стили — css/cabinet.css.
//  На телефоне нижнее меню и окна подробностей живут прямо в <body>: у
//  раздела сайта есть анимация с filter, а при ней position: fixed внутри
//  раздела перестаёт работать.
// ========================================================================
import { api, saveToken } from "./api.js?v=20261113d";
import { sToast, t, getLang } from "./app.js?v=20261113d";
import { thumb, full } from "../img.js?v=20261113d";
import { подходит } from "../productsearch.js?v=20261113d";
import { компакт } from "../searchnorm.js?v=20261113d";
import { т, задатьЯзык, кол, заЕд, единица, money, dt, dtm } from "./cabinet-i18n.js?v=20261113d";

const CURS = ["som", "usd", "yuan"];
const MOB = matchMedia("(max-width: 760px)");
const ТИХО = matchMedia("(prefers-reduced-motion: reduce)");
const НА_СТРАНИЦЕ = { search: 24, inv: 12 };

// ---------- значки ----------
const ic = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  bag: '<path d="M5 8h14l-1 13H6z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M16 13h2M3 10h18"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  dl: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/>',
  rep: '<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
};
const svg = (k, fill) => `<svg viewBox="0 0 24 24" fill="${fill ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ic[k]}</svg>`;

// ---------- форматы ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const порог = (c) => (c === "som" ? 0.5 : 0.005);
const has = (o) => !!o && CURS.some(c => Math.abs(Number(o[c]) || 0) >= порог(c));
const both = (o) => CURS.filter(c => o && Math.abs(Number(o[c]) || 0) >= порог(c)).map(c => money(o[c], c)).join(" + ") || money(0, "som");
const имя = (x) => (x && x.name) || т("deleted");

// ---------- состояние ----------
let S = null;
let кэш = null, кэшКогда = 0;
let каталог = null, каталогЖдём = null;

async function данные(свежие) {
  if (!свежие && кэш && Date.now() - кэшКогда < 60e3) return кэш;
  кэш = await api.cabinet();
  кэшКогда = Date.now();
  return кэш;
}
function загрузитьКаталог() {
  if (каталог) return Promise.resolve(каталог);
  if (!каталогЖдём) {
    каталогЖдём = api.catalog()
      .then(r => { каталог = Array.isArray(r) ? r : (r.products || []); return каталог; })
      .catch(e => { каталогЖдём = null; throw e; });
  }
  return каталогЖдём;
}

// Избранное — на этом устройстве, отдельно для каждого клиента.
function ключКлиента() {
  try {
    const tk = localStorage.getItem("gm_client_token") || "";
    const p = JSON.parse(atob(tk.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return String(p.customer_id || p.sub || p.id || "x");
  } catch { return "x"; }
}
function избранное() { try { return new Set(JSON.parse(localStorage.getItem("gm_fav_" + ключКлиента()) || "[]")); } catch { return new Set(); } }
function сохранитьИзбранное() { try { localStorage.setItem("gm_fav_" + ключКлиента(), JSON.stringify([...S.fav])); } catch {} }

const NAV = [["home", "home"], ["search", "search"], ["buys", "bag"], ["fin", "wallet"], ["me", "user"]];
const ЗАГОЛОВОК = {
  home: () => [т("hHome", S.data?.customer?.name ? S.data.customer.name.split(" ")[0] : ""), т("pHome")],
  search: () => [т("hSearch"), т("pSearch")],
  buys: () => [т("hBuys"), т("pBuys")],
  fin: () => [т("hFin"), т("pFin")],
  me: () => [т("hMe"), т("pMe")],
};

// ========================================================================
//  ВХОД
// ========================================================================
export async function renderCabinet(container) {
  убратьПорталы();
  задатьЯзык(getLang());
  let вкладка = "home";
  try { вкладка = sessionStorage.getItem("gm_cab_tab") || "home"; } catch {}
  if (!ЗАГОЛОВОК[вкладка]) вкладка = "home";
  S = {
    tab: вкладка, data: null, info: new Map(), fav: избранное(),
    q: "", filter: "all", shown: НА_СТРАНИЦЕ.search, list: null, listKey: "",
    inv: { q: "", period: "all", pay: "all", cat: "", shown: НА_СТРАНИЦЕ.inv },
    root: null, dock: null,
  };

  const root = document.createElement("div");
  root.className = "gmc";
  root.innerHTML = `
    <aside class="gmc-side" aria-label="${esc(т("navAria"))}">
      <div class="gmc-who"><span class="gmc-ava">·</span><div><b>${esc(т("cabinet"))}</b><span>${esc(т("loading"))}</span></div></div>
      ${NAV.map(([id, i]) => `<button class="gmc-nav" data-act="go:${id}">${svg(i)}<span>${esc(т(id))}</span></button>`).join("")}
    </aside>
    <section class="gmc-main">
      <div class="gmc-top">
        <div class="gmc-hello"><h1 data-h></h1><p data-p></p></div>
        <label class="gmc-sbox">${svg("search")}
          <input data-q type="search" enterkeyhint="search" autocomplete="off" spellcheck="false" placeholder="${esc(т("searchPh"))}" aria-label="${esc(т("searchAria"))}">
          <button class="gmc-clr" type="button" data-act="clear" aria-label="${esc(т("clear"))}" hidden>×</button>
        </label>
      </div>
      <div class="gmc-view" data-view></div>
    </section>`;
  container.innerHTML = "";
  container.append(root);
  S.root = root;

  const dock = document.createElement("nav");
  dock.className = "gmc-dock";
  dock.setAttribute("aria-label", т("navAria"));
  dock.innerHTML = NAV.map(([id, i]) => `<button data-act="go:${id}">${svg(i)}<span>${esc(т(id))}</span></button>`).join("");
  document.body.append(dock);
  S.dock = dock;

  root.addEventListener("click", действие);
  dock.addEventListener("click", действие);
  root.addEventListener("keydown", клавиши);
  root.addEventListener("input", ввод);
  root.addEventListener("change", ввод);
  подключитьОбщее();

  отметитьМеню();
  шапка();
  вид().innerHTML = скелет(S.tab);

  try {
    S.data = await данные(true);
  } catch (e) {
    вид().innerHTML = `<div class="gmc-card gmc-empty">${esc(т("loadErr"))}${esc(e.message || e)}<br><br><button class="gmc-btn pri" data-act="retry">${esc(т("retry"))}</button></div>`;
    return;
  }
  подготовить();
  кто();
  отметитьМеню();
  шапка();
  нарисовать();
  загрузитьКаталог().then(() => { S.list = null; if (S.tab === "search") результаты(); }).catch(() => {});
}

const вид = () => S.root.querySelector("[data-view]");

function подготовить() {
  const d = S.data;
  S.info = new Map();
  const запомнить = (it) => {
    if (!it.product_id) return;
    const id = String(it.product_id);
    if (!S.info.has(id)) S.info.set(id, { id, name: it.name, photo: it.photo, sku: it.sku, unit: it.unit, category: it.category });
  };
  (d.invoices || []).forEach(i => i.items.forEach(запомнить));
  (d.orders || []).forEach(o => o.items.forEach(запомнить));
  S.list = null; S.all = null;
}

function кто() {
  const c = S.data.customer || {};
  const w = S.root.querySelector(".gmc-who");
  w.innerHTML = `<span class="gmc-ava">${esc(((c.name || "?").trim()[0] || "?").toUpperCase())}</span><div><b>${esc(c.name || т("client"))}</b><span>${esc(c.contact || "")}</span></div>`;
}

function шапка() {
  const [h, p] = ЗАГОЛОВОК[S.tab]();
  S.root.querySelector("[data-h]").textContent = h;
  S.root.querySelector("[data-p]").textContent = p;
}

function отметитьМеню() {
  const sm = S.data?.summary;
  const знак = { buys: sm && sm.in_work ? String(sm.in_work) : "", fin: sm && has(sm.debt) ? "!" : "" };
  [...S.root.querySelectorAll(".gmc-nav"), ...S.dock.querySelectorAll("button")].forEach(b => {
    const id = b.dataset.act.slice(3);
    if (id === S.tab) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    b.querySelector(".gmc-dot")?.remove();
    if (знак[id]) { const s = document.createElement("span"); s.className = "gmc-dot"; s.textContent = знак[id]; b.append(s); }
  });
}

// ---------- переходы: старое уходит по очереди, новое приходит по очереди ----------
let ход = 0;
function go(tab) {
  if (!ЗАГОЛОВОК[tab]) return;
  if (tab === S.tab && tab !== "search") return;
  const было = S.tab;
  S.tab = tab;
  try { sessionStorage.setItem("gm_cab_tab", tab); } catch {}
  отметитьМеню();
  if (!S.data) return;
  if (было === tab) { нарисовать(); return; }
  const v = вид(), kids = [...v.children].slice(0, 8), id = ++ход;
  kids.forEach((k, i) => { k.style.setProperty("--i", i); k.classList.remove("gmc-a"); k.classList.add("gmc-o"); });
  const ждать = ТИХО.matches || !kids.length ? 0 : MOB.matches ? 120 : 160 + kids.length * 22;
  setTimeout(() => {
    if (id !== ход) return;
    шапка();
    нарисовать();
    const верх = S.root.getBoundingClientRect().top + window.scrollY - 80;
    if (window.scrollY > верх) window.scrollTo({ top: Math.max(0, верх), behavior: ТИХО.matches ? "auto" : "smooth" });
  }, ждать);
}

function нарисовать() {
  const v = вид();
  v.innerHTML = ({ home: vHome, search: vSearch, buys: vBuys, fin: vFin, me: vMe })[S.tab]();
  появление(v.children);
  if (S.tab === "search") результаты();
  if (S.tab === "buys") накладные();
}
function появление(nodes, от = 0) {
  if (ТИХО.matches) return;
  [...nodes].forEach((k, i) => { k.style.setProperty("--i", Math.min(i + от, 9)); k.classList.remove("gmc-o"); k.classList.add("gmc-a"); });
}

function скелет(tab) {
  if (tab === "search") return `<div class="gmc-sk" style="height:40px;max-width:460px"></div><div class="gmc-res">${'<div class="gmc-sk" style="height:230px"></div>'.repeat(MOB.matches ? 2 : 4)}</div>`;
  if (tab === "buys") return '<div class="gmc-sk" style="height:60px"></div>' + '<div class="gmc-sk" style="height:190px"></div>'.repeat(3);
  return `<div class="gmc-kpis">${'<div class="gmc-sk" style="height:100px"></div>'.repeat(4)}</div><div class="gmc-g2"><div class="gmc-sk" style="height:260px"></div><div class="gmc-sk" style="height:260px"></div></div>`;
}

// ---------- фото ----------
const ПУСТО_ФОТО = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">${ic.box}</svg>`;
function фото(url, cls = "", name = "", увеличивать = true) {
  if (!url) return `<span class="gmc-ph ${cls}">${ПУСТО_ФОТО}</span>`;
  const размер = cls === "lg" ? 240 : cls === "md" ? 160 : 96;
  const zoom = увеличивать ? ` zoom" data-zoom="${esc(full(url))}" data-name="${esc(name)}" role="button" tabindex="0" aria-label="${esc(т("zoom"))}` : "";
  return `<span class="gmc-ph ${cls}${zoom}"><img src="${esc(thumb(url, размер))}" alt="" loading="lazy" decoding="async"></span>`;
}

// ---------- метки состояния ----------
const метка = (k, txt) => `<span class="gmc-pill ${k}">${esc(txt)}</span>`;
function меткаОплаты(inv) {
  if (inv.refund) return метка("warn", т("refund"));
  return { paid: метка("ok", т("paid")), partial: метка("warn", т("partial")), debt: метка("bad", т("unpaid")) }[inv.pay] || "";
}
function меткаЭтапа(inv) {
  if (inv.refund) return "";
  const f = inv.fulfillment;
  if (!f) return метка("ok", т("issued"));
  return { placed: метка("warn", т("stPlaced")), packed: метка("info", т("stPacked")), shipped: метка("ok", т("stShipped")) }[f.stage] || "";
}
const СТАТУС_ЗАКАЗА = { order: ["warn", "ordOrder"], pending_confirm: ["info", "ordPending"], confirmed: ["info", "ordConfirmed"], canceled: ["mut", "ordCanceled"] };
const меткаЗаказа = (o) => { const [k, key] = СТАТУС_ЗАКАЗА[o.status] || ["mut", "ordGeneric"]; return метка(k, т(key)); };
function наличие(st) {
  return { in_stock: метка("ok", т("inStock")), out_stock: метка("mut", т("outStock")), soon: метка("info", т("soon")) }[st] || "";
}
const номерНакл = (inv) => (inv.refund ? т("refundNo", inv.no) : т("invoiceNo", inv.no));

// Шкала «Оформлен → Собран → Отправлен» (классы — css/fulfillment-site.css).
const ЭТАПЫ = ["placed", "packed", "shipped"];
const ЗНАЧОК_ЭТАПА = {
  placed: '<path d="M9 4.5V3.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/><rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 10h6M9 13.5h6M9 17h3.5"/>',
  packed: ic.box,
  shipped: '<path d="M14 18V6a1 1 0 0 0-1-1H2a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h1"/><path d="M14 9h4l3 3v6h-2"/><circle cx="7.5" cy="18.5" r="1.8"/><circle cx="17.5" cy="18.5" r="1.8"/>',
  done: '<path d="M20 6 9 17l-5-5"/>',
};
function шкала(f) {
  const i = ЭТАПЫ.indexOf(f && f.stage);
  if (i < 0) return "";
  const подпись = { placed: t("ffPlaced"), packed: t("ffPacked"), shipped: t("ffShipped") };
  const когда = { placed: f.placed_at, packed: f.packed_at, shipped: f.shipped_at };
  let h = "";
  ЭТАПЫ.forEach((s, k) => {
    if (k > 0) h += `<span class="gm-ff-line${k <= i ? " on" : ""}"><i></i></span>`;
    const сост = k < i ? "done" : k === i ? "current" : "todo";
    const время = k <= i && когда[s] ? new Date(когда[s]).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : t("ffPending");
    h += `<div class="gm-ff-node gm-ff-${s} ${сост}"><span class="gm-ff-ic"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${сост === "done" ? 2.4 : 1.8}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${сост === "done" ? ЗНАЧОК_ЭТАПА.done : ЗНАЧОК_ЭТАПА[s]}</svg></span><span class="gm-ff-lab">${esc(подпись[s])}</span><span class="gm-ff-time">${esc(время)}</span></div>`;
  });
  let доставка = "";
  if (f.stage === "shipped" && (f.carrier || f.tracking)) {
    доставка = `<div class="gm-ff-ship">${f.carrier ? `<span>${esc(t("ffCarrier"))}: ${esc(f.carrier)}</span>` : ""}${f.tracking ? `<span>${esc(t("ffTracking"))}: ${esc(f.tracking)}</span>` : ""}</div>`;
  }
  return `<div class="gm-ff" data-stage="${esc(f.stage)}"><div class="gm-ff-steps">${h}</div>${доставка}</div>`;
}

// ========================================================================
//  ГЛАВНАЯ
// ========================================================================
function плиткиСводки(sm) {
  const послОплата = (S.data.payments || [])[0];
  const долг = has(sm.debt);
  return `<div class="gmc-kpis">
    <div class="gmc-card gmc-kpi main"><div class="l">${esc(т("kTurn"))}</div><div class="v">${esc(both(sm.turn))}</div><div class="s">${esc(т("nInv", sm.invoices))}${sm.refunds ? " · " + esc(т("nRef", sm.refunds)) : ""}</div></div>
    <div class="gmc-card gmc-kpi"><div class="l">${esc(т("kPaid"))}</div><div class="v">${esc(both(sm.paid))}</div><div class="s">${esc(послОплата ? т("lastPay", dt(послОплата.date)) : т("noPay"))}</div></div>
    <div class="gmc-card gmc-kpi ${долг ? "bad" : "good"} lift" role="button" tabindex="0" data-act="go:fin"><div class="l">${esc(т("kDebt"))}</div><div class="v">${долг ? esc(both(sm.debt)) : esc(т("none"))}</div><div class="s">${esc(долг ? т("debtMore") : has(sm.advance) ? т("advance", both(sm.advance)) : т("noDebt"))}</div></div>
    <div class="gmc-card gmc-kpi lift" role="button" tabindex="0" data-act="go:buys"><div class="l">${esc(т("kOrders"))}</div><div class="v">${sm.orders}</div><div class="s">${esc(т("ordersSub", sm.completed, sm.in_work))}</div></div>
  </div>`;
}

function последний() {
  const inv = (S.data.invoices || []).find(i => !i.refund);
  const ord = (S.data.orders || []).find(o => o.status !== "canceled");
  if (ord && (!inv || new Date(ord.date) > new Date(inv.date))) return { kind: "ord", x: ord };
  return inv ? { kind: "inv", x: inv } : null;
}

function строкиТоваров(items, max) {
  return items.slice(0, max).map(it => `<div class="gmc-row">${фото(it.photo, "", имя(it))}<div class="t"><b>${esc(имя(it))}</b><span>${esc(кол(it.qty, it.unit))}${it.unit_price > 0 ? " × " + esc(money(it.unit_price, it.currency)) : " · " + esc(т("priceTbd"))}</span></div>${it.unit_price > 0 ? `<div class="n">${esc(money(it.sum, it.currency))}</div>` : ""}</div>`).join("")
    + (items.length > max ? `<div class="gmc-muted" style="padding:4px 6px">${esc(т("andMore", items.length - max))}</div>` : "");
}

function vHome() {
  const d = S.data, sm = d.summary;
  if (!d.customer) {
    return `<div class="gmc-card gmc-empty">${esc(т("notLinked"))}<br><br><button class="gmc-btn pri" data-act="go:search">${esc(т("searchItems"))}</button></div>`;
  }
  const п = последний();
  let карточка;
  if (!п) {
    карточка = `<div class="gmc-card"><h2>${esc(т("lastOrder"))}</h2><div class="gmc-empty">${esc(т("noOrders"))}<br><br><button class="gmc-btn pri" data-act="go:search">${esc(т("findItem"))}</button></div></div>`;
  } else if (п.kind === "inv") {
    const i = п.x;
    карточка = `<div class="gmc-card"><h2>${esc(т("lastOrder"))} <small>№ ${esc(i.no)} · ${dt(i.date)}</small></h2>
      <div class="gmc-pills" style="margin-bottom:10px">${меткаЭтапа(i)}${меткаОплаты(i)}</div>
      ${шкала(i.fulfillment)}
      <div class="gmc-list">${строкиТоваров(i.items, MOB.matches ? 3 : 4)}</div>
      <div class="gmc-acts" style="margin-top:12px"><button class="gmc-btn" data-act="inv:${esc(i.id)}">${esc(т("more"))}</button><button class="gmc-btn pri" data-act="rep-inv:${esc(i.id)}">${svg("rep")}${esc(т("repeatOrder"))}</button></div></div>`;
  } else {
    const o = п.x;
    карточка = `<div class="gmc-card"><h2>${esc(т("lastOrder"))} <small>№ ${esc(o.no)} · ${dt(o.date)}</small></h2>
      <div class="gmc-pills" style="margin-bottom:10px">${меткаЗаказа(o)}</div>
      <div class="gmc-list">${строкиТоваров(o.items, MOB.matches ? 3 : 4)}</div>
      <div class="gmc-acts" style="margin-top:12px"><button class="gmc-btn" data-act="ord:${esc(o.id)}">${esc(т("more"))}</button></div></div>`;
  }

  const СОБЫТИЕ = {
    shipped: (n) => [т("evShipped", n.no), n.carrier ? t("ffCarrier") + ": " + n.carrier : т("inTransit"), "ok"],
    packed: (n) => [т("evPacked", n.no), т("evPackedSub"), "info"],
    placed: (n) => [т("evPlaced", n.no), т("evPlacedSub"), "warn"],
    confirm: (n) => [т("evConfirm", n.no), т("evConfirmSub"), "info"],
    order: (n) => [т("evOrder", n.no), т("evOrderSub"), "warn"],
  };
  const события = (d.notices || []).filter(n => СОБЫТИЕ[n.kind]).map(n => {
    const [заг, под, k] = СОБЫТИЕ[n.kind](n);
    const act = n.invoice_id ? "inv:" + n.invoice_id : "ord:" + n.order_id;
    return `<button class="gmc-row" data-act="${esc(act)}"><span class="gmc-pill ${k}" style="width:10px;height:10px;padding:0"></span><div class="t"><b>${esc(заг)}</b><span>${esc(под)} · ${dt(n.at)}</span></div></button>`;
  }).join("");
  const уведомления = `<div class="gmc-card"><h2>${esc(т("notices"))} <small>${esc(т("twoWeeks"))}</small></h2>${события ? `<div class="gmc-list">${события}</div>` : `<div class="gmc-empty">${esc(т("noNotices"))}</div>`}</div>`;

  // последние купленные товары — разные, новые первыми
  const видели = new Set(), плитки = [];
  for (const inv of d.invoices || []) {
    if (inv.refund) continue;
    for (const it of inv.items) {
      if (!it.product_id || it.qty <= 0 || видели.has(it.product_id)) continue;
      видели.add(it.product_id);
      плитки.push({ it, date: inv.date });
    }
    if (плитки.length >= 12) break;
  }
  const сколькоПлиток = MOB.matches ? 6 : 10;
  const последние = плитки.length ? `<div class="gmc-card"><h2>${esc(т("recentBought"))} <small>${esc(т("tapHistory"))}</small></h2><div class="gmc-tiles">${плитки.slice(0, сколькоПлиток).map(({ it, date }) =>
    `<button class="gmc-tile" data-act="hist:${esc(it.product_id)}">${фото(it.photo, "", имя(it), false)}<b>${esc(имя(it))}</b><span>${esc(money(it.unit_price, it.currency))} ${esc(заЕд(it.unit))}<br>${dt(date)} · ${esc(кол(it.qty, it.unit))}</span></button>`).join("")}</div></div>` : "";

  const частые = (d.top || []).map(id => {
    const p = d.purchases[id], i = S.info.get(id) || {};
    if (!p) return "";
    return `<div class="gmc-row click" role="button" tabindex="0" data-act="hist:${esc(id)}">${фото(i.photo, "", имя(i), false)}<div class="t"><b>${esc(имя(i))}</b><span>${esc(т("times", p.count))} · ${esc(т("lastPrice", money(p.last.unit_price, p.last.currency)))} ${esc(заЕд(p.unit))}</span></div><button class="gmc-btn" data-act="rep-prod:${esc(id)}">${esc(т("toOrder"))}</button></div>`;
  }).join("");
  const часто = `<div class="gmc-card"><h2>${esc(т("oftenBuy"))}</h2>${частые ? `<div class="gmc-list">${частые}</div>` : `<div class="gmc-empty">${esc(т("oftenEmpty"))}</div>`}</div>`;

  const платежи = (d.payments || []).slice(0, 5).map(p => `<div class="gmc-row"><div class="t"><b>${esc(money(p.amount, p.currency))}</b><span>${dt(p.date)}${p.note ? " · " + esc(p.note) : ""}</span></div>${метка("ok", т("accepted"))}</div>`).join("");
  const оплаты = `<div class="gmc-card"><h2>${esc(т("lastPayments"))} <small><button class="gmc-btn" style="min-height:30px;padding:4px 10px" data-act="go:fin">${esc(т("all"))}</button></small></h2>${платежи ? `<div class="gmc-list">${платежи}</div>` : `<div class="gmc-empty">${esc(т("noPayments"))}</div>`}</div>`;

  return плиткиСводки(sm) + `<div class="gmc-g2">${карточка}${уведомления}</div>` + последние + `<div class="gmc-g2">${часто}${оплаты}</div>`;
}

// ========================================================================
//  ПОИСК
// ========================================================================
function vSearch() {
  const chips = [["all", "fAll"], ["bought", "fBought"], ["never", "fNever"], ["fav", "fFav"]]
    .map(([id, key]) => `<button class="gmc-chip" data-act="f:${id}" aria-pressed="${S.filter === id}">${esc(т(key))}</button>`).join("");
  return `<div class="gmc-chips" role="group" aria-label="${esc(т("filterAria"))}">${chips}</div>
    <p class="gmc-muted" data-hint style="margin:0">${esc(т("loadingCatalog"))}</p>
    <div class="gmc-res" data-res>${'<div class="gmc-sk" style="height:230px"></div>'.repeat(MOB.matches ? 2 : 4)}</div>
    <button class="gmc-btn gmc-more" data-act="more" hidden></button>`;
}

function всеТовары() {
  if (S.all && S.allFrom === каталог) return S.all;
  const m = new Map();
  (каталог || []).forEach(p => {
    m.set(String(p.id), { id: String(p.id), name: p.name || "", sku: p.sku || "", code: p.code || "", category: p.category || "", photo: p.photo_url || (p.photos || [])[0] || null, status: p.status });
  });
  // купленное, которого уже нет в каталоге (скрыто или удалено), тоже ищется
  Object.keys(S.data.purchases || {}).forEach(id => {
    if (m.has(id)) return;
    const i = S.info.get(id) || {};
    m.set(id, { id, name: i.name || "", sku: i.sku || "", code: "", category: i.category || "", photo: i.photo || null, status: "hidden" });
  });
  const list = [...m.values()];
  list.forEach(p => {
    p._k = компакт([p.name, p.sku, p.code].join(" "));
    p._w = [...new Set(String(p.name + " " + p.sku + " " + p.category).split(/[\s,;/()«»"]+/).map(компакт).filter(w => w.length >= 3))];
  });
  S.all = list; S.allFrom = каталог;
  return list;
}

function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}
function близко(w, x) {
  const допуск = w.length >= 7 ? 2 : w.length >= 4 ? 1 : 0;
  if (!допуск) return x.startsWith(w);
  return lev(w, x.slice(0, w.length)) <= допуск || lev(w, x) <= допуск;
}
function оценка(p, q, qk, слова) {
  if (!q) return 1;
  if (qk.length >= 2 && (компакт(p.sku) === qk || компакт(p.code) === qk)) return 5;
  if (qk.length >= 2 && p._k.includes(qk)) return 4;
  if (подходит(p, q)) return 3;
  // опечатки: каждое слово запроса похоже на какое-то слово товара
  if (слова.length && слова.every(w => (w.length < 3 ? p._k.includes(w) : p._w.some(x => близко(w, x))))) return 1;
  return 0;
}

function отобрать() {
  const key = S.q + "|" + S.filter + "|" + (каталог ? каталог.length : 0) + "|" + S.fav.size;
  if (S.list && S.listKey === key) return S.list;
  const q = S.q.trim(), qk = компакт(q);
  const слова = q.split(/[\s,;/]+/).map(компакт).filter(Boolean);
  const pu = S.data.purchases || {};
  let list = всеТовары().map(p => ({ p, s: оценка(p, q, qk, слова) })).filter(x => x.s > 0);
  if (S.filter === "bought") list = list.filter(x => pu[x.p.id]);
  if (S.filter === "never") list = list.filter(x => !pu[x.p.id]);
  if (S.filter === "fav") list = list.filter(x => S.fav.has(x.p.id));
  // скрытые из каталога показываем, только если клиент их покупал
  list = list.filter(x => x.p.status !== "hidden" || pu[x.p.id]);
  const когда = (id) => (pu[id] ? new Date(pu[id].last.date).getTime() || 0 : 0);
  list.sort((a, b) => b.s - a.s || (!!pu[b.p.id] - !!pu[a.p.id]) || когда(b.p.id) - когда(a.p.id) || a.p.name.localeCompare(b.p.name, "ru"));
  S.list = list.map(x => x.p); S.listKey = key;
  return S.list;
}

function подсветка(text) {
  const s = String(text || "");
  const ws = S.q.trim().split(/\s+/).filter(w => w.length >= 2).slice(0, 8).map(w => w.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!ws.length) return esc(s);
  const re = new RegExp("(" + ws.join("|") + ")", "giu");
  return s.split(re).map((part, i) => (i % 2 ? "<mark>" + esc(part) + "</mark>" : esc(part))).join("");
}

function карточкаТовара(p) {
  const pu = S.data.purchases[p.id];
  const fav = S.fav.has(p.id);
  const код = [p.sku ? esc(т("sku")) + " " + подсветка(p.sku) : "", p.code && p.code !== p.sku ? esc(т("code")) + " " + подсветка(p.code) : "", p.category ? esc(p.category) : ""].filter(Boolean).join(" · ");
  const цена = pu
    ? `<div class="gmc-price"><span class="gmc-pill ok" style="justify-self:start">${esc(т("boughtBefore", pu.count))}</span>
        <div class="big">${esc(money(pu.last.unit_price, pu.last.currency))} <small>${esc(заЕд(pu.unit))}</small></div>
        <div class="meta">${esc(т("yourLast", dt(pu.last.date), кол(pu.last.qty, pu.unit)))}</div></div>`
    : `<div class="gmc-price never"><span class="gmc-pill mut" style="justify-self:start">${esc(т("notBought"))}</span>
        <div class="big">${esc(т("neverBig"))}</div>
        <div class="meta">${esc(т("neverMeta"))}</div></div>`;
  const можно = p.status === "in_stock";
  const кнопки = pu
    ? `<button class="gmc-btn" data-act="hist:${esc(p.id)}">${esc(т("history"))}</button>${можно ? `<button class="gmc-btn pri" data-act="rep-prod:${esc(p.id)}">${esc(т("repeatOrder"))}</button>` : ""}`
    : `<button class="gmc-btn${можно ? "" : " pri"}" data-act="askprice:${esc(p.id)}">${esc(т("askPrice"))}</button>${можно ? `<button class="gmc-btn pri" data-act="rep-prod:${esc(p.id)}">${esc(т("order"))}</button>` : ""}`;
  return `<article class="gmc-card gmc-pc">
    <button class="gmc-fav" data-act="fav:${esc(p.id)}" aria-pressed="${fav}" aria-label="${esc(fav ? т("favDel") : т("favAdd"))}">${svg("star", fav)}</button>
    <div class="hd">${фото(p.photo, "md", имя(p))}<div style="min-width:0"><div class="nm">${p.name ? подсветка(p.name) : esc(т("deleted"))}</div>${код ? `<div class="sku">${код}</div>` : ""}<div class="gmc-pills" style="margin-top:6px">${наличие(p.status)}</div></div></div>
    ${цена}<div class="gmc-acts">${кнопки}</div></article>`;
}

function результаты(добавить) {
  const box = S.root.querySelector("[data-res]");
  if (!box) return;
  const hint = S.root.querySelector("[data-hint]");
  const ещё = S.root.querySelector('[data-act="more"]');
  if (!каталог) {
    загрузитьКаталог().then(() => { if (S.tab === "search") результаты(); }).catch(() => {
      if (S.tab !== "search") return;
      hint.textContent = "";
      box.innerHTML = `<div class="gmc-card gmc-empty" style="grid-column:1/-1">${esc(т("catFail"))}<br><br><button class="gmc-btn pri" data-act="search-retry">${esc(т("retry"))}</button></div>`;
    });
    return;
  }
  const list = отобрать();
  const купленных = list.filter(p => S.data.purchases[p.id]).length;
  hint.textContent = S.q.trim() ? т("found", list.length, купленных) : S.filter === "all" ? т("listAll", list.length) : т("listShown", list.length);
  if (!list.length) {
    const txt = S.filter === "fav" && !S.q ? т("favEmpty") : S.filter === "never" && !S.q ? т("allBought") : т("nothing");
    box.innerHTML = `<div class="gmc-card gmc-empty" style="grid-column:1/-1">${esc(txt)}<br><br><button class="gmc-btn" data-act="go:me">${esc(т("askManager"))}</button></div>`;
    ещё.hidden = true;
    return;
  }
  if (добавить) {
    const было = box.children.length;
    box.insertAdjacentHTML("beforeend", list.slice(было, S.shown).map(карточкаТовара).join(""));
    появление([...box.children].slice(было));
  } else {
    box.innerHTML = list.slice(0, S.shown).map(карточкаТовара).join("");
    появление([...box.children].slice(0, 10));
  }
  ещё.hidden = list.length <= S.shown;
  ещё.textContent = т("showMore", list.length - Math.min(S.shown, list.length));
}

// ========================================================================
//  ПОКУПКИ — все накладные с фото
// ========================================================================
function vBuys() {
  const d = S.data;
  const открытые = (d.orders || []).filter(o => o.status !== "canceled");
  const заказы = открытые.length ? `<div class="gmc-card"><h2>${esc(т("ordersInWork"))} <small>${esc(т("notInvoicesYet"))}</small></h2><div class="gmc-list">${открытые.map(o => `
      <button class="gmc-row" data-act="ord:${esc(o.id)}">
        <div style="display:flex;gap:4px">${o.items.slice(0, 3).map(it => фото(it.photo, "sm", имя(it), false)).join("")}</div>
        <div class="t"><b>№ ${esc(o.no)} · ${dt(o.date)}</b><span>${esc(т("positions", o.items.length))} · ${o.totals ? esc(both(o.totals)) : esc(t("priceNote"))}</span><div class="gmc-pills" style="margin-top:5px">${меткаЗаказа(o)}</div></div></button>`).join("")}</div></div>` : "";
  const кат = [...new Set((d.invoices || []).flatMap(i => i.items.map(it => it.category)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
  const f = S.inv;
  const opt = (v, txt, cur) => `<option value="${esc(v)}"${cur === v ? " selected" : ""}>${esc(txt)}</option>`;
  const фильтры = `<div class="gmc-card"><div class="gmc-filters">
      <input class="gmc-in" data-inv="q" type="search" value="${esc(f.q)}" placeholder="${esc(т("invQ"))}" aria-label="${esc(т("invQAria"))}">
      <select class="gmc-sel" data-inv="period" aria-label="${esc(т("period"))}">${opt("all", т("pAll"), f.period)}${opt("m1", т("pM1"), f.period)}${opt("m3", т("pM3"), f.period)}${opt("y", т("pY"), f.period)}</select>
      <select class="gmc-sel" data-inv="pay" aria-label="${esc(т("statusAria"))}">${opt("all", т("sAll"), f.pay)}${opt("debt", т("sDebt"), f.pay)}${opt("paid", т("sPaid"), f.pay)}${opt("way", т("sWay"), f.pay)}${opt("refund", т("sRef"), f.pay)}</select>
      ${кат.length > 1 ? `<select class="gmc-sel" data-inv="cat" aria-label="${esc(т("catAria"))}">${opt("", т("catAll"), f.cat)}${кат.map(c => opt(c, c, f.cat)).join("")}</select>` : ""}
      <button class="gmc-btn" data-act="csv">${svg("dl")}${esc(т("dlHistory"))}</button>
    </div><p class="gmc-muted" data-invhint style="margin:10px 2px 0"></p></div>`;
  return заказы + фильтры + `<div class="gmc-view" data-invlist style="gap:12px"></div><button class="gmc-btn gmc-more" data-act="invmore" hidden></button>`;
}

function отобратьНакладные() {
  const f = S.inv, now = new Date();
  const q = f.q.trim().toLowerCase(), qk = компакт(f.q);
  return (S.data.invoices || []).filter(inv => {
    const d = new Date(inv.date);
    if (f.period === "m1" && (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear())) return false;
    if (f.period === "m3" && now - d > 92 * 864e5) return false;
    if (f.period === "y" && d.getFullYear() !== now.getFullYear()) return false;
    if (f.pay === "debt" && !(inv.pay === "debt" || inv.pay === "partial")) return false;
    if (f.pay === "paid" && inv.pay !== "paid") return false;
    if (f.pay === "refund" && !inv.refund) return false;
    if (f.pay === "way" && !(inv.fulfillment && inv.fulfillment.stage !== "shipped")) return false;
    if (f.cat && !inv.items.some(it => it.category === f.cat)) return false;
    if (q) {
      const ok = inv.no.toLowerCase().includes(q) || inv.items.some(it =>
        String(it.name || "").toLowerCase().includes(q) || (qk.length >= 2 && компакт((it.name || "") + " " + (it.sku || "")).includes(qk)));
      if (!ok) return false;
    }
    return true;
  });
}

function карточкаНакладной(inv) {
  const n = inv.items.length, видно = 6, полоска = 5;
  const остаток = has(inv.remaining);
  const плитки = inv.items.slice(0, видно).map(it => `<div class="gmc-it">${фото(it.photo, "", имя(it))}<div class="t"><b>${esc(имя(it))}</b><span>${esc(кол(it.qty, it.unit))} × ${esc(money(it.unit_price, it.currency))}</span></div></div>`).join("")
    + (n > видно ? `<button class="gmc-it more" data-act="inv:${esc(inv.id)}">${esc(т("moreItems", n - видно))}</button>` : "");
  const мини = inv.items.slice(0, полоска).map(it => фото(it.photo, "sm", имя(it), false)).join("") + (n > полоска ? `<span class="gmc-more-n">+${n - полоска}</span>` : "");
  const низ = inv.refund ? esc(т("refundNote"))
    : остаток ? `${esc(т("paidX", both(inv.paid)))} · <b style="color:var(--c-bad)">${esc(т("leftX", both(inv.remaining)))}</b>` : esc(т("paidFull"));
  return `<article class="gmc-card gmc-inv lift" role="button" tabindex="0" data-act="inv:${esc(inv.id)}" aria-label="${esc(номерНакл(inv) + " · " + dt(inv.date))}">
    <div class="hd"><div><b>${esc(номерНакл(inv))}</b><div class="gmc-muted">${dt(inv.date)} · ${esc(т("positions", n))}</div><div class="gmc-pills" style="margin-top:7px">${меткаЭтапа(inv)}${меткаОплаты(inv)}</div></div>
      <div class="sum"><b>${esc(both(inv.totals))}</b>${остаток ? `<span style="color:var(--c-bad)">${esc(т("debtShort", both(inv.remaining)))}</span>` : ""}</div></div>
    <div class="gmc-items">${плитки}</div>
    <div class="gmc-strip">${мини}</div>
    <div class="ft"><span class="gmc-muted">${низ}</span><div class="gmc-acts">
      <button class="gmc-btn" data-act="pdf:${esc(inv.id)}">${svg("dl")}PDF</button>
      ${inv.refund ? "" : `<button class="gmc-btn" data-act="rep-inv:${esc(inv.id)}">${svg("rep")}${esc(т("repeat"))}</button>`}
      <button class="gmc-btn pri" data-act="inv:${esc(inv.id)}">${esc(т("more"))}</button></div></div>
  </article>`;
}

function накладные(добавить) {
  const box = S.root.querySelector("[data-invlist]");
  if (!box) return;
  const list = отобратьНакладные();
  const всего = (S.data.invoices || []).length;
  const сумма = { som: 0, usd: 0, yuan: 0 };
  list.forEach(i => CURS.forEach(c => { сумма[c] += i.totals[c] || 0; }));
  S.root.querySelector("[data-invhint]").textContent = всего ? т("invShown", list.length, всего, both(сумма)) : "";
  const ещё = S.root.querySelector('[data-act="invmore"]');
  if (!list.length) {
    box.innerHTML = `<div class="gmc-card gmc-empty">${esc(всего ? т("noInvFilter") : т("noInv"))}</div>`;
    ещё.hidden = true;
    return;
  }
  if (добавить) {
    const было = box.children.length;
    box.insertAdjacentHTML("beforeend", list.slice(было, S.inv.shown).map(карточкаНакладной).join(""));
    появление([...box.children].slice(было));
  } else {
    box.innerHTML = list.slice(0, S.inv.shown).map(карточкаНакладной).join("");
    появление([...box.children].slice(0, 8));
  }
  ещё.hidden = list.length <= S.inv.shown;
  ещё.textContent = т("showMore", list.length - Math.min(S.inv.shown, list.length));
}

// ========================================================================
//  ФИНАНСЫ
// ========================================================================
function vFin() {
  const d = S.data, sm = d.summary;
  const долг = has(sm.debt);
  const неопл = (d.invoices || []).filter(i => !i.refund && (i.pay === "debt" || i.pay === "partial"));
  const пл = d.payments || [];
  const четвёртая = has(sm.advance)
    ? `<div class="gmc-card gmc-kpi good"><div class="l">${esc(т("advanceK"))}</div><div class="v">${esc(both(sm.advance))}</div><div class="s">${esc(т("advanceSub"))}</div></div>`
    : `<div class="gmc-card gmc-kpi"><div class="l">${esc(т("paymentsK"))}</div><div class="v">${пл.length}</div><div class="s">${esc(пл[0] ? т("lastX", dt(пл[0].date)) : т("notYet"))}</div></div>`;
  const плитки = `<div class="gmc-kpis">
    <div class="gmc-card gmc-kpi main"><div class="l">${esc(т("kTurn"))}</div><div class="v">${esc(both(sm.turn))}</div><div class="s">${esc(т("allIssued"))}</div></div>
    <div class="gmc-card gmc-kpi"><div class="l">${esc(т("kPaid"))}</div><div class="v">${esc(both(sm.paid))}</div><div class="s">${esc(т("byPayments"))}</div></div>
    <div class="gmc-card gmc-kpi ${долг ? "bad" : "good"}"><div class="l">${esc(т("curDebt"))}</div><div class="v">${долг ? esc(both(sm.debt)) : esc(т("none"))}</div><div class="s">${esc(долг ? т("toPay", неопл.length) : т("noDebt"))}</div></div>
    ${четвёртая}</div>`;
  const статус = долг ? "" : `<div class="gmc-okbox">${esc(т("noDebtThanks"))}</div>`;
  const старый = has(sm.opening) ? `<div class="gmc-row"><div class="t"><b>${esc(т("oldDebt"))}</b><span>${esc(т("oldDebtSub"))}</span></div><div class="n">${esc(both(sm.opening))}</div></div>` : "";
  const список = неопл.map(i => `<button class="gmc-row" data-act="inv:${esc(i.id)}">
      <div style="display:flex;gap:4px">${i.items.slice(0, 3).map(it => фото(it.photo, "sm", имя(it), false)).join("")}</div>
      <div class="t"><b>№ ${esc(i.no)} · ${dt(i.date)}</b><span>${esc(т("sumX", both(i.totals)))}${has(i.paid) ? " · " + esc(т("paidSmall", both(i.paid))) : ""}</span></div>
      <div class="n" style="color:var(--c-bad)">${esc(both(i.remaining))}</div></button>`).join("");
  const долги = `<div class="gmc-card"><h2>${esc(т("unpaidInv"))} <small>${неопл.length}</small></h2>
    ${старый || список ? `<div class="gmc-list">${старый}${список}</div>` : `<div class="gmc-empty">${esc(т("allPaid"))}</div>`}
    <p class="gmc-muted" style="margin:12px 4px 0">${esc(т("allocNote"))}</p></div>`;
  const платежи = `<div class="gmc-card"><h2>${esc(т("payHistory"))} <small>${пл.length}</small></h2>${пл.length ? `<div class="gmc-tw"><table class="gmc-tbl adapt"><thead><tr><th>${esc(т("date"))}</th><th class="r">${esc(т("amount"))}</th><th>${esc(т("note"))}</th></tr></thead><tbody>${пл.map(p =>
    `<tr><td>${dt(p.date)}</td><td class="r" style="color:var(--c-ok);font-weight:750">${esc(money(p.amount, p.currency))}</td><td class="full gmc-muted">${esc(p.note || "—")}</td></tr>`).join("")}</tbody></table></div>` : `<div class="gmc-empty">${esc(т("noPayments"))}</div>`}</div>`;
  return плитки + статус + `<div class="gmc-g2">${долги}${платежи}</div>`;
}

// ========================================================================
//  ПРОФИЛЬ
// ========================================================================
function vMe() {
  const c = S.data.customer || {};
  return `<div class="gmc-g2">
    <div class="gmc-card"><h2>${esc(т("contacts"))}</h2>
      <div class="gmc-row"><span class="gmc-ava">${esc(((c.name || "?").trim()[0] || "?").toUpperCase())}</span><div class="t"><b>${esc(c.name || "—")}</b><span>${esc(c.contact || "—")}</span></div><button class="gmc-btn" data-act="edit">${esc(т("edit"))}</button></div>
      <form data-form="profile" hidden style="display:grid;gap:8px;margin-top:12px">
        <input class="gmc-in" name="name" autocomplete="name" maxlength="100" placeholder="${esc(т("namePh"))}" value="${esc(c.name || "")}" aria-label="${esc(т("nameAria"))}">
        <input class="gmc-in" name="phone" type="tel" autocomplete="tel" maxlength="20" placeholder="${esc(т("phonePh"))}" value="${esc(c.contact || "")}" aria-label="${esc(т("phoneAria"))}">
        <div data-codebox hidden style="display:grid;gap:8px">
          <p class="gmc-muted" data-codehint style="margin:0"></p>
          <input class="gmc-in" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="${esc(т("codePh"))}" aria-label="${esc(т("codeAria"))}">
          <button class="gmc-btn" type="button" data-act="resend">${esc(т("codeResend"))}</button>
        </div>
        <p class="gmc-muted" data-err style="color:var(--c-bad);margin:0"></p>
        <button class="gmc-btn pri" type="submit">${esc(т("save"))}</button>
      </form>
    </div>
    <div class="gmc-card"><h2>${esc(т("changePass"))}</h2>
      <form data-form="pass" style="display:grid;gap:8px">
        <input class="gmc-in" name="cur" type="password" autocomplete="current-password" placeholder="${esc(т("curPass"))}" aria-label="${esc(т("curPass"))}">
        <input class="gmc-in" name="new" type="password" autocomplete="new-password" placeholder="${esc(т("newPass"))}" aria-label="${esc(т("newPassAria"))}">
        <input class="gmc-in" name="new2" type="password" autocomplete="new-password" placeholder="${esc(т("newPass2"))}" aria-label="${esc(т("newPass2"))}">
        <p class="gmc-muted" data-err style="color:var(--c-bad);margin:0"></p>
        <button class="gmc-btn pri" type="submit">${esc(т("changePass"))}</button>
      </form>
    </div></div>
    <div class="gmc-card"><h2>${esc(т("writeManager"))}</h2>
      <form data-form="ask" style="display:grid;gap:10px">
        <textarea class="gmc-ta" name="text" maxlength="1000" placeholder="${esc(т("msgPh"))}" aria-label="${esc(т("msgAria"))}"></textarea>
        <div class="gmc-acts" style="justify-content:space-between;align-items:center"><span class="gmc-muted">${esc(т("msgNote"))}</span><button class="gmc-btn pri" type="submit">${esc(т("send"))}</button></div>
      </form>
    </div>`;
}

async function отправитьФорму(form) {
  const kind = form.dataset.form;
  const err = form.querySelector("[data-err]");
  const btn = form.querySelector('[type="submit"]');
  const v = (n) => (form.elements[n] ? form.elements[n].value : "");
  if (err) err.textContent = "";
  const стоп = (m) => { if (err) err.textContent = m; else sToast(m, "err"); };
  btn.disabled = true;
  try {
    if (kind === "profile") {
      const код = form.querySelector("[data-codebox]");
      const телефон = v("phone").trim();
      // номер изменился — сначала код из Telegram нового номера
      if (код.hidden && цифры(телефон) !== цифры(S.data.customer?.contact)) {
        try { await api.updateProfile({ name: v("name").trim().slice(0, 100), phone: телефон }); }
        catch (e) { if (!e.data?.need_code) throw e; await запроситьКод(form); return; }
      } else {
        if (!код.hidden && !/^\d{6}$/.test(v("code").trim())) return стоп(т("codeNeed"));
        const r = await api.updateProfile({ name: v("name").trim().slice(0, 100), phone: телефон, code: код.hidden ? undefined : v("code").trim() });
        if (r && r.token) saveToken(r.token);
      }
      sToast(т("profileSaved"), "ok");
      S.data = await данные(true); подготовить(); кто(); нарисовать();
      return;
    }
    if (kind === "pass") {
      if (!v("cur") || !v("new")) return стоп(т("fillAll"));
      if (v("new").length < 6) return стоп(т("passShort"));
      if (v("new") !== v("new2")) return стоп(т("passMismatch"));
      await api.changePassword(v("cur"), v("new"));
      form.reset();
      sToast(т("passChanged"), "ok");
      return;
    }
    if (kind === "ask") {
      if (!v("text").trim()) return стоп(т("writeMsg"));
      await api.ask(v("text").trim());
      form.reset();
      sToast(т("msgSent"), "ok");
    }
  } catch (e) {
    стоп(e.message || т("error"));
  } finally {
    btn.disabled = false;
  }
}

const цифры = (x) => String(x || "").replace(/\D/g, "").slice(-9);

// Шаг 1 смены номера: код уходит в Telegram владельца нового номера.
async function запроситьКод(form) {
  const box = form.querySelector("[data-codebox]");
  const hint = form.querySelector("[data-codehint]");
  const err = form.querySelector("[data-err]");
  try {
    await api.phoneCode(form.elements.phone.value.trim());
    box.hidden = false;
    form.elements.phone.readOnly = true;
    hint.textContent = т("codeSent");
    form.elements.code.value = "";
    form.elements.code.focus();
  } catch (e) {
    if (e.data?.need_bot) {
      err.innerHTML = `${esc(т("codeNeedBot"))} <a href="${esc(e.data.bot_url || "https://t.me/generalmodernbot")}" target="_blank" rel="noopener">${esc(т("codeOpenBot"))}</a>`;
    } else err.textContent = e.message || т("error");
  }
}

// ========================================================================
//  ОКНА ПОДРОБНОСТЕЙ
// ========================================================================
let лист = null;
function открыть(html, label) {
  закрыть(true);
  const ov = document.createElement("div");
  ov.className = "gmc-ov";
  ov.innerHTML = `<div class="gmc-sheet" role="dialog" aria-modal="true" aria-label="${esc(label || т("details"))}" tabindex="-1"><span class="grab" aria-hidden="true"></span><button class="x" data-close aria-label="${esc(т("close"))}">×</button>${html}</div>`;
  document.body.append(ov);
  document.body.style.overflow = "hidden";
  ov.addEventListener("click", (e) => {
    if (e.target === ov || e.target.closest("[data-close]")) { закрыть(); return; }
    действие(e);
  });
  ov.addEventListener("input", ввод);
  ov.addEventListener("keydown", клавиши);
  requestAnimationFrame(() => ov.classList.add("show"));
  ov.querySelector(".gmc-sheet").focus({ preventScroll: true });
  лист = ov;
  return ov.querySelector(".gmc-sheet");
}
function закрыть(сразу) {
  const ov = лист;
  if (!ov) return;
  лист = null;
  document.body.style.overflow = "";
  if (сразу || ТИХО.matches) { ov.remove(); return; }
  ov.classList.remove("show");
  setTimeout(() => ov.remove(), 300);
}

const найтиНакл = (id) => (S.data.invoices || []).find(i => String(i.id) === String(id));
const найтиЗаказ = (id) => (S.data.orders || []).find(o => String(o.id) === String(id));
const ссылка = 'style="border:0;background:none;padding:0;font-weight:650;text-align:left;text-decoration:underline;text-decoration-color:var(--border);text-underline-offset:3px"';

function таблицаПозиций(items) {
  return `<div class="gmc-tw"><table class="gmc-tbl adapt"><thead><tr><th>${esc(т("thProduct"))}</th><th class="r">${esc(т("thQtyPrice"))}</th><th class="r">${esc(т("thSum"))}</th></tr></thead><tbody>${items.map(it => `
    <tr><td class="full"><div class="pn">${фото(it.photo, "md", имя(it))}<div style="min-width:0"><b>${it.product_id ? `<button data-act="hist:${esc(it.product_id)}" ${ссылка}>${esc(имя(it))}</button>` : esc(имя(it))}</b><span>${it.sku ? esc(т("sku")) + " " + esc(it.sku) : ""}</span></div></div></td>
      <td class="r">${esc(кол(it.qty, it.unit))} × ${it.unit_price > 0 ? esc(money(it.unit_price, it.currency)) : esc(т("priceTbd"))}</td>
      <td class="r"><b>${it.unit_price > 0 ? esc(money(it.sum, it.currency)) : "—"}</b></td></tr>`).join("")}</tbody></table></div>`;
}

function открытьНакладную(id) {
  const inv = найтиНакл(id);
  if (!inv) return;
  const f = inv.fulfillment;
  const история = f
    ? [[t("ffPlaced"), f.placed_at], [t("ffPacked"), f.packed_at], [t("ffShipped") + (f.carrier ? " · " + f.carrier : ""), f.shipped_at]]
      .map(([txt, at]) => `<div class="${at ? "" : "todo"}">${esc(txt)}<span>${esc(at ? dtm(at) : t("ffPending"))}</span></div>`).join("")
    : `<div>${esc(т("issuedAt"))}<span>${dt(inv.date)}</span></div>`;
  открыть(`
    <div><div class="gmc-muted">${dt(inv.date)} · ${esc(т("positions", inv.items.length))}</div><h3>${esc(номерНакл(inv))}</h3></div>
    <div class="gmc-pills">${меткаЭтапа(inv)}${меткаОплаты(inv)}</div>
    ${шкала(f)}
    ${таблицаПозиций(inv.items)}
    <div class="gmc-tot">
      <div><span>${esc(т("total"))}</span><b>${esc(both(inv.totals))}</b></div>
      ${inv.refund ? `<div><span>${esc(т("refundReduced"))}</span><b>${esc(both(inv.totals))}</b></div>` : `
      <div><span>${esc(т("paidByInv"))}</span><b>${has(inv.paid) ? esc(both(inv.paid)) : "0"}</b></div>
      <div class="${has(inv.remaining) ? "bad" : ""}"><span>${esc(т("debtByInv"))}</span><b>${has(inv.remaining) ? esc(both(inv.remaining)) : esc(т("none"))}</b></div>`}
    </div>
    <div><h4 style="margin-bottom:10px">${esc(т("statusHistory"))}</h4><div class="gmc-tl">${история}</div></div>
    <div class="gmc-acts">
      <button class="gmc-btn" data-act="pdf:${esc(inv.id)}">${svg("dl")}PDF</button>
      <button class="gmc-btn" data-act="xls:${esc(inv.id)}">${svg("dl")}Excel</button>
      ${inv.refund ? "" : `<button class="gmc-btn pri" style="flex:1" data-act="rep-inv:${esc(inv.id)}">${svg("rep")}${esc(т("repeatOrder"))}</button>`}
    </div>`, номерНакл(inv));
}

function открытьЗаказ(id) {
  const o = найтиЗаказ(id);
  if (!o) return;
  открыть(`
    <div><div class="gmc-muted">${dt(o.date)} · ${esc(т("positions", o.items.length))}</div><h3>${esc(т("orderNo", o.no))}</h3></div>
    <div class="gmc-pills">${меткаЗаказа(o)}</div>
    ${таблицаПозиций(o.items)}
    <div class="gmc-tot"><div><span>${esc(т("total"))}</span><b>${o.totals ? esc(both(o.totals)) : esc(t("priceNote"))}</b></div></div>
    <p class="gmc-muted" style="margin:0">${esc(o.status === "canceled" ? т("canceledNote") : т("orderNote"))}</p>`, т("orderNo", o.no));
}

function график(lines, cur) {
  const pts = lines.filter(l => !l.refund && l.unit_price > 0 && l.currency === cur).slice().reverse();
  if (pts.length < 2) return "";
  const W = 560, H = 96, L = 10, R = 10, T = 18, B = 20;
  const vs = pts.map(p => p.unit_price), mn = Math.min(...vs), mx = Math.max(...vs);
  const X = (i) => L + i * (W - L - R) / (pts.length - 1);
  const Y = (v) => (mx === mn ? (T + H - B) / 2 : T + (mx - v) / (mx - mn) * (H - T - B));
  const d = pts.map((p, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(p.unit_price).toFixed(1)).join(" ");
  const последн = pts.length - 1;
  return `<svg class="gmc-spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(т("priceChange"))}">
    <path d="${d} L${X(последн)} ${H - B} L${X(0)} ${H - B}Z" fill="rgba(201,168,76,.16)"/>
    <path d="${d}" fill="none" stroke="var(--gold)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${pts.map((p, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(p.unit_price).toFixed(1)}" r="${i === последн ? 5 : 3.5}" fill="var(--gold)"/>`).join("")}
    <text x="${L}" y="${H - 4}">${esc(dt(pts[0].date))}</text><text x="${W - R}" y="${H - 4}" text-anchor="end">${esc(dt(pts[последн].date))}</text>
    <text x="${X(последн)}" y="${Math.max(11, Y(pts[последн].unit_price) - 8)}" text-anchor="end" style="font-weight:700;fill:var(--text)">${esc(money(pts[последн].unit_price, cur))}</text>
  </svg>`;
}

function открытьИсторию(id) {
  const pu = S.data.purchases[id];
  const i = S.info.get(id) || (всеТовары().find(p => p.id === id)) || {};
  const кат = каталог ? каталог.find(p => String(p.id) === id) : null;
  const unit = (pu && pu.unit) || i.unit || "шт";
  const шапкаТовара = `<div style="display:flex;gap:14px;align-items:center;padding-right:44px">${фото(i.photo, "lg", имя(i))}<div style="min-width:0"><h3 style="padding:0">${esc(имя(i))}</h3><div class="gmc-muted">${i.sku ? esc(т("sku")) + " " + esc(i.sku) + " · " : ""}${esc(т("unitLabel", единица(unit)))}</div><div class="gmc-pills" style="margin-top:6px">${наличие(кат && кат.status)}</div></div></div>`;
  if (!pu) {
    открыть(`${шапкаТовара}<div class="gmc-price never"><span class="gmc-pill mut" style="justify-self:start">${esc(т("notBought"))}</span><div class="big">${esc(т("neverBig"))}</div><div class="meta">${esc(т("neverMeta"))}</div></div>
      <div class="gmc-acts"><button class="gmc-btn pri" style="flex:1" data-act="askprice:${esc(id)}">${esc(т("askPrice"))}</button></div>`, имя(i));
    return;
  }
  const валюты = [...new Set(pu.lines.filter(l => !l.refund).map(l => l.currency))];
  const графики = валюты.map(c => {
    const g = график(pu.lines, c);
    return g ? `<div><h4>${esc(т("yourPrice"))}${валюты.length > 1 ? " " + esc(т("in_" + c)) : ""} ${esc(заЕд(unit))}</h4>${g}</div>` : "";
  }).join("");
  const можно = !кат || кат.status === "in_stock";
  открыть(`${шапкаТовара}
    <div class="gmc-kpis" style="grid-template-columns:repeat(2,minmax(0,1fr))">
      <div class="gmc-card gmc-kpi main"><div class="l">${esc(т("kLastPrice"))}</div><div class="v">${esc(money(pu.last.unit_price, pu.last.currency))}</div><div class="s">${esc(заЕд(unit))} · ${dt(pu.last.date)}</div></div>
      <div class="gmc-card gmc-kpi"><div class="l">${esc(т("kLastTime"))}</div><div class="v">${esc(кол(pu.last.qty, unit))}</div><div class="s">${esc(т("invNoX", pu.last.no))}</div></div>
      <div class="gmc-card gmc-kpi"><div class="l">${esc(т("kTotalBought"))}</div><div class="v">${esc(кол(pu.qty, unit))}</div><div class="s">${esc(т("times", pu.count))}</div></div>
      <div class="gmc-card gmc-kpi"><div class="l">${esc(т("kReturned"))}</div><div class="v">${pu.returned ? esc(кол(pu.returned, unit)) : "—"}</div><div class="s">${esc(pu.returned ? т("inDebt") : т("noReturns"))}</div></div>
    </div>
    ${графики}
    <div><h4 style="margin-bottom:6px">${esc(т("allPurchases"))}</h4><div class="gmc-tw"><table class="gmc-tbl adapt"><thead><tr><th>${esc(т("date"))}</th><th>${esc(т("thInvoice"))}</th><th class="r">${esc(т("thQtyPrice"))}</th><th class="r">${esc(т("thSum"))}</th></tr></thead><tbody>${pu.lines.map(l => `
      <tr class="${l.refund ? "ref" : ""}"><td>${dt(l.date)}${l.refund ? " · " + esc(т("refundMark")) : ""}</td><td><button data-act="inv:${esc(l.invoice_id)}" ${ссылка}>№ ${esc(l.no)}</button></td>
      <td class="r">${esc(кол(Math.abs(l.qty), unit))} × ${esc(money(l.unit_price, l.currency))}</td><td class="r"><b>${esc(money(l.sum, l.currency))}</b></td></tr>`).join("")}</tbody></table></div></div>
    <p class="gmc-muted" style="margin:0">${esc(т("histNote"))}</p>
    <div class="gmc-acts">${можно ? `<button class="gmc-btn pri" style="flex:1" data-act="rep-prod:${esc(id)}">${svg("rep")}${esc(т("repeatX", кол(pu.last.qty, unit)))}</button>` : `<span class="gmc-muted">${esc(т("noStockAsk"))}</span><button class="gmc-btn" data-act="askprice:${esc(id)}">${esc(т("ask"))}</button>`}</div>`, имя(i));
}

// ---------- повтор заказа ----------
// Заказ уходит обычным путём сайта (/api/site-order): цену подтверждает
// менеджер. Если у клиента уже есть открытый заказ, товары дописываются в него.
let повтор = null;
async function открытьПовтор(позиции, заголовок) {
  const sheet = открыть(`<h3>${esc(заголовок)}</h3><div class="gmc-sk" style="height:200px"></div>`, заголовок);
  try { await загрузитьКаталог(); } catch {}
  if (!лист || !лист.contains(sheet)) return;
  const стат = new Map((каталог || []).map(p => [String(p.id), p.status]));
  повтор = позиции.map(p => ({ ...p, status: каталог ? (стат.get(String(p.product_id)) || "out_stock") : "in_stock" }));
  const есть = повтор.filter(p => p.status === "in_stock").length;
  sheet.innerHTML = `<span class="grab" aria-hidden="true"></span><button class="x" data-close aria-label="${esc(т("close"))}">×</button>
    <h3>${esc(заголовок)}</h3>
    <p class="gmc-muted" style="margin:0">${esc(т("checkQty"))}</p>
    <div class="gmc-list">${повтор.map((p, k) => `<div class="gmc-row" style="flex-wrap:wrap">
      ${фото(p.photo, "", имя(p), false)}<div class="t" style="min-width:140px"><b>${esc(имя(p))}</b><span>${esc(p.last ? т("lastTime", кол(p.last, p.unit)) : единица(p.unit))}</span></div>
      ${p.status === "in_stock"
        ? `<div class="gmc-step"><button type="button" data-act="dec:${k}" aria-label="${esc(т("less"))}">−</button><input data-qty="${k}" type="number" inputmode="decimal" min="0" max="100000" step="1" value="${esc(p.qty)}" aria-label="${esc(т("qty"))}"><button type="button" data-act="inc:${k}" aria-label="${esc(т("moreQ"))}">+</button></div>`
        : наличие(p.status) || метка("mut", т("outStock"))}</div>`).join("")}</div>
    ${есть ? `<button class="gmc-btn pri" data-act="send-order">${esc(т("sendOrder"))}</button>` : `<div class="gmc-empty">${esc(т("noneInStock"))}<br><br><button class="gmc-btn" data-act="go:me">${esc(т("writeManager"))}</button></div>`}`;
}
function повторНакладной(id) {
  const x = найтиНакл(id);
  if (!x) return;
  const m = new Map();
  x.items.forEach(it => {
    if (!it.product_id || !(it.qty > 0)) return;
    const id2 = String(it.product_id), was = m.get(id2);
    if (was) { was.qty += it.qty; was.last += it.qty; }
    else m.set(id2, { product_id: id2, name: it.name, photo: it.photo, unit: it.unit, qty: it.qty, last: it.qty });
  });
  открытьПовтор([...m.values()], т("repeatOrderNo", x.no));
}
function повторТовара(id) {
  const pu = S.data.purchases[id];
  const i = S.info.get(id) || всеТовары().find(p => p.id === id) || {};
  открытьПовтор([{ product_id: id, name: i.name, photo: i.photo, unit: (pu && pu.unit) || i.unit || "шт", qty: pu ? pu.last.qty : 1, last: pu ? pu.last.qty : 0 }], pu ? т("repeatOrder") : т("orderProduct"));
}
async function отправитьПовтор(btn) {
  const items = (повтор || []).filter(p => p.status === "in_stock" && Number(p.qty) > 0).map(p => ({ product_id: p.product_id, qty: Math.min(100000, Number(p.qty)) }));
  if (!items.length) { sToast(т("enterQty"), "err"); return; }
  btn.disabled = true; btn.textContent = т("sending");
  try {
    await api.placeOrder(items);
    закрыть();
    sToast(т("orderSent"), "ok");
    S.data = await данные(true); подготовить(); отметитьМеню();
    S.inv.shown = НА_СТРАНИЦЕ.inv;
    if (S.tab === "buys") нарисовать(); else go("buys");
  } catch (e) {
    sToast(e.message || т("orderFail"), "err");
    btn.disabled = false; btn.textContent = т("sendOrder");
  }
}

// ---------- файлы ----------
function скачатьPDF(id, btn) {
  const inv = найтиНакл(id);
  if (!inv) return;
  if (btn) btn.disabled = true;
  fetch(api.invoicePdfUrl(id), { headers: { Authorization: "Bearer " + (localStorage.getItem("gm_client_token") || "") } })
    .then(r => { if (!r.ok) throw new Error(); return r.blob(); })
    .then(blob => сохранить(blob, `nakladnaya-${inv.no}-${dt(inv.date).replace(/[./]/g, "-")}.pdf`))
    .catch(() => sToast(т("pdfFail"), "err"))
    .finally(() => { if (btn) btn.disabled = false; });
}
async function скачатьExcel(id, btn) {
  const inv = найтиНакл(id);
  if (!inv) return;
  const main = CURS.find(c => Math.abs(inv.totals[c] || 0) >= порог(c)) || "som";
  if (btn) btn.disabled = true;
  try {
    const { exportClientInvoiceExcel } = await import("../xlsx-export.js?v=20261113d");
    await exportClientInvoiceExcel({
      id: inv.id, date: inv.date, currency: main,
      items: inv.items.map(it => ({ product_name: имя(it), photo: it.photo, qty: it.qty, unit_price: it.unit_price, currency: it.currency })),
      covered: inv.paid[main] || 0, remaining: inv.remaining[main] || 0,
    }, S.data.customer?.name || "");
    sToast(т("xlsSaved"), "ok");
  } catch (e) { sToast(т("error") + ": " + (e.message || e), "err"); }
  finally { if (btn) btn.disabled = false; }
}
// История покупок под текущим фильтром — таблицей, которую открывает Excel.
function скачатьИсторию() {
  const list = отобратьНакладные();
  if (!list.length) { sToast(т("noInvFilter"), "err"); return; }
  const ч = (n) => String(Math.round((Number(n) || 0) * 100) / 100).replace(".", ",");
  // Ячейку, начинающуюся с = + - @, Excel счёл бы формулой — гасим апострофом.
  const кл = (s) => { let v = String(s ?? ""); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; };
  const ВАЛ = { som: "UZS", usd: "USD", yuan: "CNY" };
  const rows = [т("csvHead")];
  list.forEach(inv => inv.items.forEach(it => rows.push([dt(inv.date), inv.no, имя(it), it.sku, ч(it.qty), единица(it.unit), ч(it.unit_price), ВАЛ[it.currency] || it.currency, ч(it.sum), inv.refund ? т("refund") : т("purchase")])));
  const csv = "﻿" + rows.map(r => r.map(кл).join(";")).join("\r\n");
  сохранить(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${т("csvName")}-${new Date().toISOString().slice(0, 10)}.csv`);
  sToast(т("csvSaved"), "ok");
}
function сохранить(blob, файл) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = файл;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// Полноэкранный просмотр фото
function открытьФото(src, name) {
  const ov = document.createElement("div");
  ov.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.9);display:flex;align-items:center;justify-content:center;cursor:zoom-out;padding:16px";
  const img = document.createElement("img");
  img.src = src; img.alt = name || "";
  img.style.cssText = "max-width:92vw;max-height:82vh;border-radius:12px;object-fit:contain";
  ov.append(img);
  if (name) { const cap = document.createElement("div"); cap.textContent = name; cap.style.cssText = "position:absolute;bottom:18px;left:0;right:0;text-align:center;color:#fff;font-size:14px;padding:0 16px"; ov.append(cap); }
  const убрать = () => { ov.remove(); document.removeEventListener("keydown", esc2, true); };
  const esc2 = (e) => { if (e.key === "Escape") { e.stopPropagation(); убрать(); } };
  ov.addEventListener("click", убрать);
  document.addEventListener("keydown", esc2, true);
  document.body.append(ov);
}

// ========================================================================
//  СОБЫТИЯ
// ========================================================================
function действие(e) {
  const el = e.target.closest("[data-act],[data-zoom]");
  if (!el) return;
  if (el.dataset.zoom && !el.dataset.act) { e.stopPropagation(); открытьФото(el.dataset.zoom, el.dataset.name); return; }
  const raw = el.dataset.act, k = raw.indexOf(":");
  const a = k < 0 ? raw : raw.slice(0, k), v = k < 0 ? "" : raw.slice(k + 1);
  switch (a) {
    case "go": if (лист) закрыть(); go(v); break;
    case "retry": renderCabinet(S.root.parentNode); break;
    case "search-retry": каталогЖдём = null; результаты(); break;
    case "clear": { const q = S.root.querySelector("[data-q]"); q.value = ""; S.q = ""; S.shown = НА_СТРАНИЦЕ.search; el.hidden = true; q.focus(); if (S.tab === "search") результаты(); break; }
    case "f": S.filter = v; S.shown = НА_СТРАНИЦЕ.search; el.parentNode.querySelectorAll(".gmc-chip").forEach(c => c.setAttribute("aria-pressed", c === el)); результаты(); break;
    case "more": S.shown += НА_СТРАНИЦЕ.search; результаты(true); break;
    case "invmore": S.inv.shown += НА_СТРАНИЦЕ.inv; накладные(true); break;
    case "fav": {
      S.fav.has(v) ? S.fav.delete(v) : S.fav.add(v);
      сохранитьИзбранное();
      const on = S.fav.has(v);
      el.setAttribute("aria-pressed", on); el.setAttribute("aria-label", on ? т("favDel") : т("favAdd"));
      el.innerHTML = svg("star", on);
      if (S.filter === "fav") { S.list = null; результаты(); }
      break;
    }
    case "hist": открытьИсторию(v); break;
    case "inv": открытьНакладную(v); break;
    case "ord": открытьЗаказ(v); break;
    case "rep-inv": повторНакладной(v); break;
    case "rep-prod": повторТовара(v); break;
    case "askprice":
      el.disabled = true;
      api.ask("", v).then(() => sToast(т("priceRequested"), "ok")).catch(er => { sToast(er.message || т("sendFail"), "err"); el.disabled = false; });
      break;
    case "pdf": скачатьPDF(v, el); break;
    case "xls": скачатьExcel(v, el); break;
    case "csv": скачатьИсторию(); break;
    case "edit": {
      const f = S.root.querySelector('[data-form="profile"]'); f.hidden = !f.hidden; el.textContent = f.hidden ? т("edit") : т("cancel");
      if (f.hidden) { f.reset(); f.querySelector("[data-codebox]").hidden = true; f.elements.phone.readOnly = false; f.querySelector("[data-err]").textContent = ""; }
      break;
    }
    case "resend": {
      const f = el.closest("form"); if (!f) break;
      f.querySelector("[data-err]").textContent = "";
      el.disabled = true; запроситьКод(f).finally(() => { el.disabled = false; });
      break;
    }
    case "dec": case "inc": {
      const p = повтор && повтор[+v];
      if (!p) break;
      p.qty = Math.min(100000, Math.max(0, (Number(p.qty) || 0) + (a === "inc" ? 1 : -1)));
      const inp = лист && лист.querySelector(`[data-qty="${+v}"]`);
      if (inp) inp.value = p.qty;
      break;
    }
    case "send-order": отправитьПовтор(el); break;
  }
}

let таймер = 0;
function ввод(e) {
  const el = e.target;
  if (el.matches("[data-q]")) {
    if (e.type !== "input") return;
    S.q = el.value.slice(0, 120); S.shown = НА_СТРАНИЦЕ.search;
    S.root.querySelector('[data-act="clear"]').hidden = !el.value;
    clearTimeout(таймер);
    if (S.tab !== "search") { go("search"); return; }
    таймер = setTimeout(результаты, 110);
    return;
  }
  if (el.matches("[data-inv]")) {
    S.inv[el.dataset.inv] = el.value; S.inv.shown = НА_СТРАНИЦЕ.inv;
    clearTimeout(таймер);
    таймер = setTimeout(накладные, el.tagName === "INPUT" ? 150 : 0);
    return;
  }
  if (el.matches("[data-qty]") && повтор) {
    const p = повтор[+el.dataset.qty];
    if (p) p.qty = Math.min(100000, Math.max(0, Number(String(el.value).replace(",", ".")) || 0));
  }
}

function клавиши(e) {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches('[role="button"]')) { e.preventDefault(); e.target.click(); }
  if (e.key === "Enter" && e.target.matches("[data-q]")) { e.preventDefault(); e.target.blur(); }
}

// Общие обработчики — один раз на страницу.
let подключено = false;
function подключитьОбщее() {
  if (подключено) return;
  подключено = true;
  document.addEventListener("submit", (e) => {
    const f = e.target.closest && e.target.closest("form[data-form]");
    if (!f || !S || !S.root.contains(f)) return;
    e.preventDefault();
    отправитьФорму(f);
  });
  // нет снимка — тихая заглушка вместо битой картинки
  document.addEventListener("error", (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    const ph = img.closest(".gmc-ph");
    if (!ph) return;
    ph.classList.remove("zoom"); ph.removeAttribute("data-zoom"); ph.removeAttribute("role");
    ph.innerHTML = ПУСТО_ФОТО;
  }, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && лист) закрыть(); });
  window.addEventListener("hashchange", () => { if (!/^#\/?cabinet/.test(location.hash)) убратьПорталы(); });
  MOB.addEventListener?.("change", () => { if (S && S.data && document.body.contains(S.root)) нарисовать(); });
}
function убратьПорталы() {
  закрыть(true);
  document.querySelectorAll(".gmc-dock").forEach(n => n.remove());
  document.body.style.overflow = "";
}
