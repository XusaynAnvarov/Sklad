// ========================================================================
//  СКЛАД → «Интерактивная презентация сайта» (экскурсия js/site/tour.js).
//
//  Всё правится как черновик: «Предпросмотр» открывает сайт с черновиком
//  в новой вкладке, на сайт уходит только по «Опубликовать». Каждая
//  публикация сохраняет прежнюю версию — внизу её можно вернуть.
//  Статистика — обезличенные счётчики по дням (без IP и идентификаторов).
// ========================================================================
import { el, toast, confirmDialog, showLoader, hideLoader } from "../ui.js?v=20261114e";
import { icon } from "../icons.js?v=20261114e";
import { authHeaders, db } from "../db.js?v=20261114e";
import { ТЕКСТЫ_ТУРА, СЦЕНЫ_ПО_УМОЛЧАНИЮ } from "../site/tour.js?v=20261114e";
import { ТЕКСТЫ_РОЛИКА } from "../site/intro.js?v=20261114e";

async function api(method, query = "", body) {
  const r = await fetch("/api/admin/intro" + query, {
    method, headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Ошибка " + r.status);
  return j;
}

const ЯЗЫКИ = [["ru", "Русский"], ["uz", "O‘zbekcha"], ["en", "English"]];
const РЕЖИМЫ = [["intro", "Короткий ролик (≈17 с) — рекомендуется"], ["invite", "Приглашение «Посмотреть экскурсию»"], ["button", "Ничего — только кнопка «▶ Как заказать»"]];
const ПОЛЯ_РОЛИКА = [["s1", "Сцена 1 — знак и детали"], ["s2", "Сцена 2 — выбор детали"], ["s3", "Сцена 3 — цена и подтверждение"], ["s4", "Сцена 4 — сборка и доставка"], ["s5", "Сцена 5 — финал"]];
const ЧАСТОТА = [["once", "Один раз на устройстве"], ["30d", "Раз в 30 дней"], ["7d", "Раз в 7 дней"], ["session", "При каждом новом визите"]];
const ТЕМП = [["0.7", "Быстрее"], ["1", "Обычно"], ["1.3", "Медленнее"], ["1.6", "Очень медленно"]];
const дата = (s) => s ? new Date(s).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const число = (n) => Number(n || 0).toLocaleString("ru-RU");
const доля = (a, b) => b ? Math.round(a / b * 100) + "%" : "—";

function выбор(варианты, значение) {
  const s = el("select.inp");
  for (const [v, t] of варианты) s.append(el("option", { value: v, text: t, selected: String(v) === String(значение) ? "selected" : null }));
  return s;
}
function флажок(подпись, значение, подсказка) {
  const i = el("input", { type: "checkbox" }); i.checked = !!значение;
  return { node: el("label", { style: { display: "flex", gap: "10px", alignItems: "flex-start", margin: "6px 0 12px", cursor: "pointer" } }, [
    i, el("span", {}, [el("span", { text: подпись }), подсказка ? el("div", { style: { color: "var(--muted)", fontSize: "12px", marginTop: "2px" }, text: подсказка }) : null]),
  ]), input: i };
}
const поле = (подпись, узел, подсказка) => el("label.field", {}, [
  el("span.field-label", { text: подпись }), узел,
  подсказка ? el("span", { style: { color: "var(--muted)", fontSize: "12px" }, text: подсказка }) : null,
]);
const карточка = (заголовок, дети, sub) => el("div.card", { style: { padding: "18px", marginBottom: "16px" } }, [
  el("h3", { style: { margin: "0 0 4px", fontSize: "17px" }, text: заголовок }),
  sub ? el("div", { style: { color: "var(--muted)", fontSize: "13px", marginBottom: "14px" }, text: sub }) : el("div", { style: { height: "10px" } }),
  ...[].concat(дети),
]);

export default async function renderIntroAdmin(page, ctx) {
  page.append(el("div.topbar", {}, [
    el("div", {}, [el("h1", { text: "Интерактивная презентация сайта" }),
      el("div.sub", { text: "Экскурсия по сайту для покупателей: каталог, поиск, заказ, цена, подтверждение, склад, доставка, кабинет и бот. Показывает только то, что на сайте есть. Склад, заказы и цены отсюда не меняются." })]),
  ]));
  const actions = el("div.toolbar");
  const host = el("div");
  page.append(actions, host);

  let st;
  try { showLoader("Загружаю настройки…"); st = await api("GET"); }
  catch (e) { host.append(el("div.card", { style: { padding: "18px" }, text: "Не удалось загрузить: " + e.message })); return; }
  finally { hideLoader(); }

  const d = JSON.parse(JSON.stringify(st.settings));
  d.tour_texts = d.tour_texts || {}; ЯЗЫКИ.forEach(([l]) => { d.tour_texts[l] = d.tour_texts[l] || {}; });
  d.audio = d.audio || { all: "", ru: "", uz: "", en: "" };
  // сцены: сохранённый порядок + новые, которых в нём ещё нет
  const сцены = [...(d.scenes || []).filter(s => СЦЕНЫ_ПО_УМОЛЧАНИЮ.includes(s.id))];
  СЦЕНЫ_ПО_УМОЛЧАНИЮ.forEach(id => { if (!сцены.some(s => s.id === id)) сцены.push({ id, on: true, k: 1 }); });

  // ---------------- основное ----------------
  const fEnabled = флажок("Показывать новым посетителям при входе на сайт", d.enabled,
    "Не показывается вошедшим клиентам, по прямым ссылкам на разделы, поисковым роботам и при экономии трафика. Кнопка «▶ Как заказать» работает всегда.");
  const fMode = выбор(РЕЖИМЫ, ["intro", "invite", "button"].includes(d.tour_mode) ? d.tour_mode : "intro");
  const fFreq = выбор(ЧАСТОТА, d.frequency);
  const fHow = флажок("Кнопка «▶ Как заказать» в шапке сайта", d.howto_button);
  const fReset = флажок("Показать заново всем, кто уже видел", false, "Сработает при ближайшей публикации.");
  host.append(карточка("Основное", [fEnabled.node, поле("Что показывать при входе", fMode, "Подробная экскурсия по сайту всегда открывается кнопкой «▶ Как заказать». Просмотр не обязателен: «Пропустить» есть всегда."), поле("Как часто показывать одному посетителю", fFreq), fHow.node, fReset.node]));

  // ---------------- короткий ролик при входе ----------------
  d.texts = d.texts || {}; ЯЗЫКИ.forEach(([l]) => { d.texts[l] = d.texts[l] || {}; });
  const роликТексты = el("div");
  let языкРолика = "ru";
  const вкладкиРолика = el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", margin: "0 0 12px" } });
  function нарисоватьРолик() {
    роликТексты.innerHTML = "";
    вкладкиРолика.querySelectorAll("button").forEach(b => b.classList.toggle("btn-primary", b.dataset.l === языкРолика));
    for (const [k, подпись] of ПОЛЯ_РОЛИКА) {
      const def = ТЕКСТЫ_РОЛИКА[языкРолика][k];
      const своё = d.texts[языкРолика][k];
      const i = el("input.inp", { maxlength: "140", placeholder: def, value: своё && своё !== def ? своё : "" });
      i.addEventListener("input", () => { d.texts[языкРолика][k] = i.value.trim() || def; });
      роликТексты.append(поле(подпись, i));
    }
  }
  ЯЗЫКИ.forEach(([l, t]) => вкладкиРолика.append(el("button.btn.btn-outline", { type: "button", text: t, "data-l": l, onclick: () => { языкРолика = l; нарисоватьРолик(); } })));
  нарисоватьРолик();
  const кнопкиРолика = el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } }, [
    el("button.btn.btn-outline", { type: "button", onclick: () => {
      try { localStorage.setItem("gm_intro_draft", JSON.stringify({ texts: d.texts })); } catch { }
      window.open("/?intro=draft", "_blank", "noopener");
    } }, [icon("broadcast", { size: 16 }), "Предпросмотр ролика"]),
    el("a.btn.btn-outline", { href: "/?intro=1", target: "_blank", rel: "noopener" }, [icon("globe", { size: 16 }), "Опубликованный ролик"]),
  ]);
  host.append(карточка("Короткий ролик при входе", [вкладкиРолика, роликТексты, кнопкиРолика],
    "Пять сцен: знак и детали → выбор детали → цена и подтверждение в Telegram → сборка и доставка (Яндекс / BTS) → посылка у вас. Детали нарисованы, а не взяты с фото. Пустое поле — текст по умолчанию (виден серым)."));

  // ---------------- сцены ----------------
  const списокСцен = el("div");
  let языкТекстов = "ru";
  const вкладки = el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", margin: "0 0 12px" } });
  function нарисоватьСцены() {
    списокСцен.innerHTML = "";
    вкладки.querySelectorAll("button").forEach(b => b.classList.toggle("btn-primary", b.dataset.l === языкТекстов));
    сцены.forEach((s, i) => {
      const [t0, d0] = ТЕКСТЫ_ТУРА[языкТекстов][s.id];
      const свои = d.tour_texts[языкТекстов][s.id] || {};
      const on = el("input", { type: "checkbox" }); on.checked = s.on !== false;
      on.addEventListener("change", () => { s.on = on.checked; });
      const темп = выбор(ТЕМП, String(s.k || 1)); темп.style.maxWidth = "150px";
      темп.addEventListener("change", () => { s.k = Number(темп.value); });
      const вверх = el("button.btn.btn-outline", { type: "button", title: "Выше", style: { padding: "6px 10px" }, text: "↑", onclick: () => { if (i > 0) { [сцены[i - 1], сцены[i]] = [сцены[i], сцены[i - 1]]; нарисоватьСцены(); } } });
      const вниз = el("button.btn.btn-outline", { type: "button", title: "Ниже", style: { padding: "6px 10px" }, text: "↓", onclick: () => { if (i < сцены.length - 1) { [сцены[i + 1], сцены[i]] = [сцены[i], сцены[i + 1]]; нарисоватьСцены(); } } });
      const ti = el("input.inp", { maxlength: "60", placeholder: t0, value: свои.t || "" });
      const di = el("textarea.inp", { maxlength: "220", rows: "2", placeholder: d0, style: { resize: "vertical" } }); di.value = свои.d || "";
      const сохр = () => { const v = { t: ti.value.trim(), d: di.value.trim() }; if (v.t || v.d) d.tour_texts[языкТекстов][s.id] = v; else delete d.tour_texts[языкТекстов][s.id]; };
      ti.addEventListener("input", сохр); di.addEventListener("input", сохр);
      списокСцен.append(el("div", { style: { borderTop: "1px solid var(--border)", padding: "12px 0", display: "grid", gap: "8px" } }, [
        el("div", { style: { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" } }, [
          on, el("b", { style: { minWidth: "28px", color: "var(--muted)" }, text: String(i + 1).padStart(2, "0") }),
          el("b", { style: { flex: "1", minWidth: "160px" }, text: t0 }), темп, вверх, вниз,
          el("button.btn.btn-outline", { type: "button", style: { padding: "6px 10px" }, title: "Открыть эту сцену на сайте", onclick: () => предпросмотр(i) }, [icon("broadcast", { size: 14 })]),
        ]),
        el("div", { style: { display: "grid", gap: "6px", paddingLeft: "38px" } }, [ti, di]),
      ]));
    });
  }
  ЯЗЫКИ.forEach(([l, t]) => вкладки.append(el("button.btn.btn-outline", { type: "button", text: t, "data-l": l, onclick: () => { языкТекстов = l; нарисоватьСцены(); } })));
  нарисоватьСцены();
  host.append(карточка("Сцены, порядок и тексты", [вкладки, списокСцен],
    "Галочка — показывать сцену. Стрелки меняют порядок, «темп» — длительность сцены. Пустые поля — текст по умолчанию (виден серым). Язык экскурсии = язык сайта у посетителя."));

  // ---------------- звук ----------------
  const звук = el("div");
  function нарисоватьЗвук() {
    звук.innerHTML = "";
    звук.append(el("div", { style: { display: "flex", gap: "12px", flexWrap: "wrap" } }, [["all", "Для всех языков"], ...ЯЗЫКИ].map(([l, n]) => {
      const путь = d.audio[l];
      const файл = el("input", { type: "file", accept: "audio/mpeg,audio/mp4,audio/aac,audio/ogg", style: { display: "none" } });
      файл.addEventListener("change", async () => {
        const f = файл.files[0]; if (!f) return;
        if (f.size > 15 * 1024 * 1024) { toast("Файл больше 15 МБ — сожмите его (MP3, 128 кбит/с)", "err"); return; }
        showLoader("Загружаю звук…");
        try { d.audio[l] = await db.uploadVideo(f); toast("Загружено — не забудьте опубликовать", "ok"); нарисоватьЗвук(); }
        catch (e) { toast(e.message, "err"); } finally { hideLoader(); }
      });
      return el("div", { style: { border: "1px solid var(--border)", borderRadius: "12px", padding: "10px 12px", minWidth: "190px" } }, [
        файл, el("div", { style: { fontWeight: "600", marginBottom: "6px" }, text: n }),
        el("div", { style: { fontSize: "12px", color: "var(--muted)", marginBottom: "6px", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, text: путь ? путь.split("/").pop() : "не загружено" }),
        el("div", { style: { display: "flex", gap: "6px" } }, [
          el("button.btn.btn-outline", { type: "button", style: { padding: "6px 10px", fontSize: "12px" }, text: путь ? "Заменить" : "Загрузить", onclick: () => файл.click() }),
          путь ? el("button.btn.btn-outline", { type: "button", style: { padding: "6px 10px", fontSize: "12px" }, text: "Убрать", onclick: () => { d.audio[l] = ""; нарисоватьЗвук(); } }) : null,
        ]),
      ]);
    })));
  }
  нарисоватьЗвук();
  const fLoop = флажок("Повторять по кругу (для фоновой музыки)", d.audio_loop);
  host.append(карточка("Музыка и озвучка (необязательно)", [звук, fLoop.node],
    "Звук всегда стартует выключенным — посетитель включает его кнопкой. Озвучка идёт одной дорожкой на всю экскурсию: при переходе к другой сцене она не перематывается."));

  // ---------------- кнопки ----------------
  function собрать() {
    return { ...d, enabled: fEnabled.input.checked, tour_mode: fMode.value, frequency: fFreq.value, howto_button: fHow.input.checked, audio_loop: fLoop.input.checked, scenes: сцены.map(s => ({ id: s.id, on: s.on !== false, k: s.k || 1 })) };
  }
  function предпросмотр(start = 0) {
    const s = собрать();
    // Черновик передаётся сайту через localStorage (тот же адрес — тот же браузер).
    try { localStorage.setItem("gm_tour_draft", JSON.stringify({ scenes: s.scenes.map((x, i) => i < start ? { ...x, on: false } : x), tour_texts: s.tour_texts })); } catch { }
    window.open("/?tour=draft", "_blank", "noopener");
  }
  actions.append(
    el("button.btn.btn-outline", { type: "button", onclick: () => предпросмотр(0) }, [icon("broadcast", { size: 16 }), "Предпросмотр черновика"]),
    el("button.btn.btn-primary", { type: "button", onclick: async () => {
      const s = собрать(); if (fReset.input.checked) s.reset_seen = true;
      showLoader("Публикую…");
      try { await api("POST", "", { action: "publish", settings: s, label: s.enabled ? "Публикация (экскурсия включена)" : "Публикация (экскурсия выключена)" }); toast("Опубликовано. На сайте — в течение минуты", "ok"); ctx.refresh(); }
      catch (e) { toast(e.message, "err"); } finally { hideLoader(); }
    } }, [icon("check", { size: 16 }), "Опубликовать"]),
    el("a.btn.btn-outline", { href: "/?tour=1&preview=1", target: "_blank", rel: "noopener" }, [icon("globe", { size: 16 }), "Запустить опубликованную"]),
  );

  // ---------------- статистика ----------------
  const т = st.stats.total || {};
  const плитка = (подпись, значение, sub) => el("div", { style: { padding: "12px 14px", borderRadius: "12px", border: "1px solid var(--border)", minWidth: "130px", flex: "1 1 130px" } }, [
    el("div", { style: { color: "var(--muted)", fontSize: "12px" }, text: подпись }),
    el("div", { style: { fontSize: "22px", fontWeight: "600", marginTop: "2px" }, text: значение }),
    sub ? el("div", { style: { color: "var(--muted)", fontSize: "12px" }, text: sub }) : null,
  ]);
  const открыли = т.tour_open || 0;
  const воронка = el("div", { style: { display: "grid", gap: "6px", marginTop: "14px" } },
    СЦЕНЫ_ПО_УМОЛЧАНИЮ.map(id => {
      const n = т["scene_" + id] || 0, w = открыли ? Math.round(n / открыли * 100) : 0;
      return el("div", { style: { display: "grid", gridTemplateColumns: "170px 1fr 60px", gap: "10px", alignItems: "center", fontSize: "13px" } }, [
        el("span", { text: ТЕКСТЫ_ТУРА.ru[id][0] }),
        el("div", { style: { height: "8px", borderRadius: "4px", background: "var(--border)", overflow: "hidden" } }, [el("div", { style: { width: w + "%", height: "100%", background: "var(--accent)" } })]),
        el("span", { style: { textAlign: "right", color: "var(--muted)" }, text: число(n) }),
      ]);
    }));
  host.append(карточка(`Статистика за ${st.stats.period_days} дней`, [
    el("div", { style: { display: "flex", gap: "10px", flexWrap: "wrap" } }, [
      плитка("Приглашение показано", число(т.invite_shown), `смотреть: ${число(т.invite_accept)} · не сейчас: ${число(т.invite_dismiss)}`),
      плитка("Экскурсию открыли", число(открыли), `телефон ${число(т["tour_open:mobile"])} · компьютер ${число(т["tour_open:desktop"])}`),
      плитка("Досмотрели", число(т.completed), доля(т.completed || 0, открыли)),
      плитка("Пропустили", число(т.skipped), доля(т.skipped || 0, открыли)),
      плитка("«Начать покупки»", число(т.start_shopping), "переход в магазин"),
      плитка("Языки", `${число(т["tour_open:ru"])} / ${число(т["tour_open:uz"])} / ${число(т["tour_open:en"])}`, "ru / uz / en"),
    ]),
    el("div", { style: { marginTop: "16px", fontWeight: "600" }, text: "До какой сцены доходят" }), воронка,
  ], "Только счётчики по дням: без IP, телефонов и идентификаторов посетителей."));

  // ---------------- история ----------------
  const список = el("div");
  if (!st.history.length) список.append(el("div", { style: { color: "var(--muted)" }, text: "Публикаций ещё не было." }));
  for (const h of st.history) {
    список.append(el("div", { style: { display: "flex", gap: "12px", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid var(--border)", flexWrap: "wrap" } }, [
      el("div", {}, [el("div", { style: { fontWeight: "600" }, text: h.label || "Версия" }),
        el("div", { style: { color: "var(--muted)", fontSize: "12px" }, text: `${дата(h.at)} · версия ${h.rev} · ${h.enabled ? "включена" : "выключена"}` })]),
      el("button.btn.btn-outline", { type: "button", onclick: () => confirmDialog("Вернуть эту версию настроек? Текущая сохранится в истории.", async () => {
        showLoader("Возвращаю…");
        try { await api("POST", "", { action: "rollback", id: h.id }); toast("Версия восстановлена", "ok"); ctx.refresh(); }
        catch (e) { toast(e.message, "err"); } finally { hideLoader(); }
      }) }, [icon("undo", { size: 16 }), "Восстановить"]),
    ]));
  }
  host.append(карточка("История версий", [
    el("div", { style: { color: "var(--muted)", fontSize: "13px", marginBottom: "6px" }, text: `Сейчас на сайте: версия ${st.rev}${st.updated_at ? ", опубликована " + дата(st.updated_at) + (st.label ? " — " + st.label : "") : " (ещё не публиковалось — экскурсия выключена)"}.` }),
    список,
  ]));
}
