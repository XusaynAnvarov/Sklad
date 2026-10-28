// ========================================================================
//  UI-ХЕЛПЕРЫ: создание элементов, тосты, модалки, диалоги, анимации
// ========================================================================
// img.js ничего не импортирует, поэтому круга зависимостей не возникает.
import { full } from "./img.js?v=20261028b";

// Краткое создание элемента: el("div.card", {onclick}, [children])
export function el(tag, props = {}, children = []) {
  const [name, ...classes] = tag.split(".");
  const node = document.createElement(name || "div");
  if (classes.length) node.className = classes.join(" ");
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(c));
  }
  return node;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------- Тосты ----------
// Значок у сообщения: галочка рисуется сама (stroke-dashoffset в
// css/theme.css), у ошибки — восклицательный знак. По значку видно итог
// раньше, чем прочитан текст.
const ЗНАЧОК = {
  ok: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path class="gm-galka" d="m5 12.5 4.5 4.5L19 7.5"/></svg>`,
  err: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 6v8"/><path d="M12 18h.01"/></svg>`,
};

export function toast(msg, type = "ok") {
  let wrap = $("#toasts");
  if (!wrap) { wrap = el("div", { id: "toasts" }); document.body.append(wrap); }
  const t = el("div.toast." + type);
  const знак = el("span.toast-ic", { html: ЗНАЧОК[type] || ЗНАЧОК.ok });
  const текст = el("span.toast-txt", { text: msg });
  t.append(знак, текст);
  wrap.append(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 2800);
}

// ---------- Модальное окно ----------
export function modal({ title, body, actions, wide }) {
  const overlay = el("div.modal-overlay");
  const win = el("div.modal" + (wide ? ".wide" : ""));
  const head = el("div.modal-head", {}, [
    el("h3", { text: title || "" }),
    el("button.modal-x", { html: "&times;", onclick: close }),
  ]);
  const content = el("div.modal-body");
  if (typeof body === "string") content.innerHTML = body; else content.append(body);
  const foot = el("div.modal-foot");
  (actions || []).forEach(a => {
    const b = el("button.btn." + (a.kind || "btn-outline"), { text: a.label, onclick: () => a.onClick?.(close) });
    foot.append(b);
  });
  win.append(head, content, foot);
  overlay.append(win);
  overlay.addEventListener("mousedown", e => { if (e.target === overlay) close(); });
  document.body.append(overlay);
  requestAnimationFrame(() => overlay.classList.add("show"));
  function close() { overlay.classList.remove("show"); setTimeout(() => overlay.remove(), 250); }
  return { close, content };
}

// ---------- Подтверждение ----------
export function confirmDialog(message, onYes) {
  modal({
    title: "Подтверждение",
    body: el("p", { text: message }),
    actions: [
      { label: "Отмена", kind: "btn-outline", onClick: c => c() },
      { label: "Да", kind: "btn-danger", onClick: c => { c(); onYes(); } },
    ],
  });
}

// ---------- Анимация числа (счётчик) ----------
// Число не появляется разом, а набегает от нуля и тормозит у конца.
const мéньшеДвижения = () => {
  try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
};

export function animateCount(node, to, formatter = (n) => Math.round(n).toLocaleString("ru-RU")) {
  node.dataset.gmSchet = "1";          // чтобы общий сборщик ниже не завёл второй счётчик
  if (мéньшеДвижения()) { node.textContent = formatter(to); return; }
  const from = 0, dur = 1100, start = performance.now();
  function step(now) {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 4);
    node.textContent = formatter(from + (to - from) * eased);
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ---------- Оживить числа на всём экране ----------
// Раньше счётчик стоял только на дашборде: в отчётах, у клиентов и в
// телефоне числа просто появлялись. Эта функция проходит по готовому
// экрану, находит крупные числа и запускает тот же счётчик — разметку
// страниц менять не нужно, достаточно позвать её после отрисовки.
//
// Разбираем УЖЕ показанный текст («¥ 48 300», «18 450 000 сум», «$12 480»),
// чтобы сохранить валюту и подпись как есть: формат у каждой страницы свой,
// и переписывать его в одном месте было бы неверно.
const ЧИСЛА_ГДЕ = ".st-value, .mini-num .v, .big-num, [data-schet]";

export function оживитьЧисла(корень) {
  const где = корень || document;
  if (мéньшеДвижения()) return;
  где.querySelectorAll(ЧИСЛА_ГДЕ).forEach(узел => {
    if (узел.dataset.gmSchet) return;
    const текст = (узел.textContent || "").trim();
    const найдено = текст.match(/-?\d[\d\s .,]*/);
    if (!найдено) return;
    const сырое = найдено[0].trim();
    const цифры = сырое.replace(/[\s ]/g, "").replace(",", ".");
    const знач = Number(цифры);
    // Мелкие числа (остаток «3 шт», номер) не крутим — это выглядит суетой.
    if (!isFinite(знач) || Math.abs(знач) < 10) return;
    const дробных = Math.min(2, (цифры.split(".")[1] || "").length);
    const до = текст.slice(0, найдено.index);
    const после = текст.slice(найдено.index + найдено[0].length);
    animateCount(узел, знач, n => до + n.toLocaleString("ru-RU", {
      minimumFractionDigits: дробных, maximumFractionDigits: дробных,
    }) + после);
  });
}

// ---------- Поле ввода (для форм) ----------
export function field(label, input) {
  return el("label.field", {}, [el("span.field-label", { text: label }), input]);
}
export function input(props = {}) { return el("input.inp", props); }

// Просмотр фото в полном размере (зум по клику)
// принимает один src ИЛИ массив фото (тогда — галерея со стрелками/свайпом)
export function lightbox(src) {
  const исходные = Array.isArray(src) ? src.filter(Boolean) : (src ? [src] : []);
  if (!исходные.length) return;
  // Полный снимок тоже идём брать через свой сервер: иначе открытие фото
  // било бы прямо в Supabase, а именно этот трафик и вывел за квоту.
  // Перехватываем здесь, в одном месте — вызовов по проекту два десятка.
  const photos = исходные.map(u => full(u));
  let idx = 0;
  const img = el("img", { src: photos[0], onerror: function () {
    // не открылось через свой сервер — показываем оригинал
    const i = photos.indexOf(this.src.replace(location.origin, ""));
    const запас = исходные[i >= 0 ? i : 0];
    if (запас && this.src !== запас) this.src = запас;
  }, style: { maxWidth: "92vw", maxHeight: "84vh", borderRadius: "12px", boxShadow: "0 20px 60px rgba(0,0,0,.6)", objectFit: "contain" } });
  img.addEventListener("click", (e) => e.stopPropagation());
  const ov = el("div.modal-overlay.lb", { onclick: () => close() }, [img]);
  ov.style.cursor = "zoom-out";
  let onKey = null;
  function close() { if (onKey) document.removeEventListener("keydown", onKey); ov.classList.remove("show"); setTimeout(() => ov.remove(), 200); }
  if (photos.length > 1) {
    const counter = el("div", { style: { position: "absolute", bottom: "16px", left: "0", right: "0", textAlign: "center", color: "#fff", fontSize: "14px" } });
    const show = () => { img.src = photos[idx]; counter.textContent = (idx + 1) + " / " + photos.length; };
    const go = (d, e) => { if (e) e.stopPropagation(); idx = (idx + d + photos.length) % photos.length; show(); };
    const prev = el("button", { text: "‹", onclick: (e) => go(-1, e) });
    const next = el("button", { text: "›", onclick: (e) => go(1, e) });
    [prev, next].forEach(b => b.style.cssText = "position:absolute;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.16);color:#fff;border:none;font-size:42px;width:54px;height:74px;border-radius:12px;cursor:pointer;line-height:1");
    prev.style.left = "12px"; next.style.right = "12px";
    ov.append(prev, next, counter);
    let sx = 0;
    ov.addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; }, { passive: true });
    ov.addEventListener("touchend", (e) => { const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); });
    // навигация клавишами (ноутбук): ← → и Esc
    onKey = (e) => { if (e.key === "ArrowLeft") go(-1); else if (e.key === "ArrowRight") go(1); else if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    show();
  } else {
    onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
  }
  document.body.append(ov);
  requestAnimationFrame(() => ov.classList.add("show"));
}

// Красивое поле с автодополнением: свой стилизованный анимированный список
// (можно печатать для фильтрации ИЛИ выбрать мышкой/стрелками). Возвращает <input>.
export function inputList(options, props = {}) {
  const opts = [...new Set((options || []).filter(Boolean).map(String))]
    .sort((a, b) => a.localeCompare(b, "ru")).map(o => ({ value: o, label: o }));
  const inp = el("input.inp", { ...props, autocomplete: "off" });
  let panel = null, items = [], hi = -1;

  const ensure = () => { if (!panel) { panel = el("div.combo-panel"); document.body.appendChild(panel); } };
  const position = () => { const r = inp.getBoundingClientRect(); panel.style.left = r.left + "px"; panel.style.top = (r.bottom + 6) + "px"; panel.style.minWidth = r.width + "px"; };
  const render = () => {
    const q = (inp.value || "").toLowerCase();
    items = opts.filter(o => o.label.toLowerCase().includes(q)).slice(0, 60);
    panel.innerHTML = "";
    items.forEach((o, i) => panel.append(el("div.combo-item" + (i === hi ? ".hi" : ""), {
      onmousedown: (e) => { e.preventDefault(); choose(o); },
    }, [o.label])));
  };
  const show = () => { ensure(); position(); render(); if (items.length) panel.classList.add("show"); };
  const hide = () => { if (panel) panel.classList.remove("show"); hi = -1; };
  const choose = (o) => {
    inp.value = o.value;
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    inp.dispatchEvent(new Event("change", { bubbles: true }));
    hide();
    // визуальная отдача: краткая «вспышка», что выбор принят
    inp.classList.remove("picked-flash"); void inp.offsetWidth; inp.classList.add("picked-flash");
    setTimeout(() => inp.classList.remove("picked-flash"), 500);
  };

  inp.addEventListener("focus", show);
  inp.addEventListener("input", () => { hi = -1; show(); });
  inp.addEventListener("blur", () => setTimeout(hide, 150));
  inp.addEventListener("keydown", (e) => {
    const open = panel && panel.classList.contains("show");
    if (e.key === "ArrowDown") { e.preventDefault(); if (!open) return show(); hi = Math.min(items.length - 1, hi + 1); render(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); hi = Math.max(0, hi - 1); render(); }
    else if (e.key === "Enter") { if (open && hi >= 0 && items[hi]) { e.preventDefault(); choose(items[hi]); } }
    else if (e.key === "Escape") { hide(); }
  });
  window.addEventListener("scroll", () => { if (panel && panel.classList.contains("show")) position(); }, true);
  return inp;
}
// Стилизованный выпадающий список (замена нативного <select>).
// API совместим: .value (get/set) и событие "change".
export function select(options, value, props = {}) {
  const wrap = el("div.cselect.inp", props);
  const labelEl = el("span.cs-label");
  wrap.append(labelEl, el("span.cs-caret", { text: "▾" }));
  let val = value !== undefined ? value : (options[0] && options[0].value);
  const setLabel = () => { const o = options.find(x => x.value === val); labelEl.textContent = o ? o.label : ""; };
  setLabel();

  let panel = null;
  const onDoc = (e) => { if (panel && !panel.contains(e.target) && !wrap.contains(e.target)) close(); };
  const close = () => { if (panel) panel.classList.remove("show"); document.removeEventListener("mousedown", onDoc); };
  const open = () => {
    if (!panel) { panel = el("div.combo-panel.cselect-panel"); document.body.appendChild(panel); }
    panel.innerHTML = "";
    options.forEach(o => panel.append(el("div.combo-item" + (o.value === val ? ".hi" : ""), {
      onmousedown: (e) => {
        e.preventDefault(); val = o.value; setLabel(); close();
        wrap.dispatchEvent(new Event("change", { bubbles: true }));
        // визуальная отдача: краткая «вспышка» выбранного поля
        wrap.classList.remove("picked-flash"); void wrap.offsetWidth; wrap.classList.add("picked-flash");
        setTimeout(() => wrap.classList.remove("picked-flash"), 500);
      },
    }, [o.label])));
    const r = wrap.getBoundingClientRect();
    panel.style.left = r.left + "px"; panel.style.top = (r.bottom + 6) + "px"; panel.style.minWidth = r.width + "px";
    panel.classList.add("show");
    setTimeout(() => document.addEventListener("mousedown", onDoc), 0);
  };
  wrap.addEventListener("click", () => { (panel && panel.classList.contains("show")) ? close() : open(); });
  Object.defineProperty(wrap, "value", { get: () => val, set: (v) => { val = v; setLabel(); } });
  return wrap;
}

// ---------- Появление элементов при скролле ----------
export function reveal(root = document) {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); obs.unobserve(e.target); } });
  }, { threshold: 0.08 });
  $$(".reveal", root).forEach(n => obs.observe(n));
}

// ---------- Глобальный лоадер с анимированным логотипом GENERAL MODERN ----------
// Знак «стеклянная печать» — тот же, что в icon.svg и в шапке сайта:
// перламутровая плитка с косым бликом, золотое кольцо из двух дуг (оно и
// крутится, класс .glr в css/theme.css) и монограмма чернилами.
const LOADER_SVG = `<svg viewBox="0 0 512 512" width="88" height="88" role="img" aria-label="Загрузка">
  <defs>
    <linearGradient id="glst" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#f2f4f9"/><stop offset="1" stop-color="#dfe4ee"/></linearGradient>
    <linearGradient id="glzl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7e9a6"/><stop offset=".42" stop-color="#e3c163"/><stop offset=".74" stop-color="#c79a33"/><stop offset="1" stop-color="#a87b1f"/></linearGradient>
    <linearGradient id="glbl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".92"/><stop offset=".55" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <clipPath id="glpl"><rect width="512" height="512" rx="112"/></clipPath>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#glst)"/>
  <g clip-path="url(#glpl)"><path d="M-120 300 L300 -120 L430 10 L10 430 Z" fill="url(#glbl)"/></g>
  <rect x="6" y="6" width="500" height="500" rx="106" fill="none" stroke="#c8cedd" stroke-width="5"/>
  <g class="glr" fill="none" stroke="url(#glzl)" stroke-width="14" stroke-linecap="round">
    <path d="M256 74a182 182 0 0 1 182 182"/>
    <path d="M256 438A182 182 0 0 1 74 256"/>
  </g>
  <text x="256" y="314" text-anchor="middle" font-family="Inter, 'Segoe UI', system-ui, sans-serif" font-size="166" font-weight="800" letter-spacing="-8" fill="#16203a">GM</text>
</svg>`;
let _loaderEl = null, _loaderCount = 0, _loaderTimer = null;
export function showLoader(text) {
  _loaderCount++;
  if (!_loaderEl) {
    // Полоска под подписью бежит сама: по ней видно, что работа идёт, даже
    // когда шагов не считают и подпись не меняется.
    _loaderEl = el("div.gm-loader", { html: `<div class="gm-loader-box">${LOADER_SVG}<div class="gm-loader-txt"></div><div class="gm-loader-bar" aria-hidden="true"></div></div>` });
    document.body.append(_loaderEl);
    void _loaderEl.offsetWidth;   // форс-рефлоу, чтобы сработал transition (надёжнее rAF)
  }
  _loaderEl.querySelector(".gm-loader-txt").textContent = text || "Загрузка…";
  _loaderEl.classList.add("show");
}
// Сменить подпись уже показанного загрузчика, НЕ открывая второй.
// showLoader считает вызовы: когда его звали в цикле ради подписи
// («Оприходование… 12 из 34»), счётчик уходил вверх, и один hideLoader
// в конце его не обнулял — загрузчик оставался висеть поверх склада,
// и работа выглядела зависшей. Для хода работы зовите эту функцию.
export function setLoaderText(text) {
  if (_loaderEl && _loaderCount > 0) {
    const t = _loaderEl.querySelector(".gm-loader-txt");
    if (t) t.textContent = text || "Загрузка…";
  }
}
export function hideLoader() {
  _loaderCount = Math.max(0, _loaderCount - 1);
  if (_loaderCount === 0 && _loaderEl) _loaderEl.classList.remove("show");
}
// Обёртка: показать лоадер на время выполнения промиса/функции.
export async function withLoader(fn, text) {
  showLoader(text);
  try { return await (typeof fn === "function" ? fn() : fn); }
  finally { hideLoader(); }
}
