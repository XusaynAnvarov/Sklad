// ========================================================================
//  UI-ХЕЛПЕРЫ: создание элементов, тосты, модалки, диалоги, анимации
// ========================================================================
// img.js ничего не импортирует, поэтому круга зависимостей не возникает.
import { full } from "./img.js?v=20260902b";

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
export function toast(msg, type = "ok") {
  let wrap = $("#toasts");
  if (!wrap) { wrap = el("div", { id: "toasts" }); document.body.append(wrap); }
  const t = el("div.toast." + type, { text: msg });
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
export function animateCount(node, to, formatter = (n) => Math.round(n).toLocaleString("ru-RU")) {
  const from = 0, dur = 900, start = performance.now();
  function step(now) {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 3);
    node.textContent = formatter(from + (to - from) * eased);
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
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
const LOADER_SVG = `<svg viewBox="0 0 512 512" width="84" height="84" aria-label="Загрузка">
  <defs>
    <linearGradient id="glnv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22324f"/><stop offset="1" stop-color="#141f33"/></linearGradient>
    <linearGradient id="glgd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7e9a6"/><stop offset=".45" stop-color="#e3c163"/><stop offset=".75" stop-color="#c79a33"/><stop offset="1" stop-color="#a87b1f"/></linearGradient>
  </defs>
  <rect width="512" height="512" rx="116" fill="url(#glnv)"/>
  <circle class="glr" cx="256" cy="256" r="182" fill="none" stroke="url(#glgd)" stroke-width="14" stroke-linecap="round" stroke-dasharray="300 1144"/>
  <text x="256" y="312" text-anchor="middle" font-family="Georgia,'Times New Roman',serif" font-size="172" font-weight="700" letter-spacing="-6" fill="url(#glgd)">GM</text>
</svg>`;
let _loaderEl = null, _loaderCount = 0, _loaderTimer = null;
export function showLoader(text) {
  _loaderCount++;
  if (!_loaderEl) {
    _loaderEl = el("div.gm-loader", { html: `<div class="gm-loader-box">${LOADER_SVG}<div class="gm-loader-txt"></div></div>` });
    document.body.append(_loaderEl);
    void _loaderEl.offsetWidth;   // форс-рефлоу, чтобы сработал transition (надёжнее rAF)
  }
  _loaderEl.querySelector(".gm-loader-txt").textContent = text || "Загрузка…";
  _loaderEl.classList.add("show");
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
