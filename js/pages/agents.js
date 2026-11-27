// ========================================================================
//  РАЗДЕЛ «ИИ-АГЕНТЫ».
//
//  Шесть карточек — по одной на агента, — и под ними общий центр:
//  согласования, уведомления, история прогонов.
//
//  Главное, что должно читаться с экрана за секунду: агент сам ничего
//  не поменял. Всё, что он предлагает, лежит во вкладке «Согласования»
//  и ждёт нажатия. Поэтому вкладка идёт первой и её счётчик виден
//  прямо на карточке.
//
//  Сервер — api/admin/agents.js и api/admin/agents-report.js.
//  Оформление — css/agents.css, только существующие токены темы.
// ========================================================================
import { el, toast, modal, confirmDialog, select, input, field } from "../ui.js?v=20261127a";
import { icon } from "../icons.js?v=20261127a";
import { authHeaders } from "../db.js?v=20261127a";
import { thumb } from "../img.js?v=20261127a";
import { вТекст, ДЛИНА_МАКС } from "../post-text.js?v=20261127a";

const API = "/api/admin/agents";
const API_СВЕДЕНИЯ = "/api/admin/facts";
const ОПРОС_МС = 45000;

const ЗНАЧКИ = { ok: "ok", busy: "cur", wait: "order", err: "danger", off: "muted", нет: "muted" };
// Уровень уведомления по-русски: в базе он хранится английским словом,
// но на экране «danger» ничего не объясняет.
const УРОВНИ = { info: ["muted", "к сведению"], warn: ["order", "внимание"], danger: ["danger", "срочно"] };
const значокУровня = (у) => {
  const [класс, текст] = УРОВНИ[у] || ["muted", String(у ?? "—")];
  return { класс, текст };
};

const ВИДЫ = [
  { value: "daily", label: "Каждый день" },
  { value: "weekly", label: "Раз в неделю" },
  { value: "monthly", label: "Раз в месяц" },
  { value: "interval", label: "Через промежуток" },
];
const ДНИ = [
  { value: "1", label: "Понедельник" }, { value: "2", label: "Вторник" }, { value: "3", label: "Среда" },
  { value: "4", label: "Четверг" }, { value: "5", label: "Пятница" }, { value: "6", label: "Суббота" },
  { value: "7", label: "Воскресенье" },
];
const ИМЯ_ДНЯ = (n) => (ДНИ.find((д) => д.value === String(n)) || {}).label || "понедельник";
// «по понедельникам», а не «по понедельникм»: приставить букву к
// названию дня нельзя, у каждого своё окончание.
const ПО_ДНЯМ = { 1: "понедельникам", 2: "вторникам", 3: "средам", 4: "четвергам", 5: "пятницам", 6: "субботам", 7: "воскресеньям" };

// ---------------------------------------------------------------- связь
async function запрос(method, body, query = "") {
  let r;
  try {
    r = await fetch(API + query, {
      method, cache: "no-store",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    const e = new Error("Нет связи с сервером. Ничего не изменилось.");
    e.код = "сеть"; throw e;
  }
  let j = {};
  try { j = await r.json(); } catch {}
  if (!r.ok) {
    const e = new Error(j.error || (r.status === 401 ? "Нужен вход администратора" : "Ошибка сервера " + r.status));
    e.status = r.status; e.код = j.code; throw e;
  }
  return j;
}

// ------------------------------------------------------------- время
// Сервер отдаёт метки в UTC, живём мы по Ташкенту. Приводим здесь, а не
// полагаемся на часы телефона: телефон может стоять в другом поясе, и
// «следующий запуск в 03:30» сбивал бы с толку.
const СДВИГ = 5 * 3600e3;
const МЕСЯЦЫ = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];

function когда(метка) {
  if (!метка) return "—";
  const ms = Date.parse(метка);
  if (!Number.isFinite(ms)) return "—";
  const d = new Date(ms + СДВИГ);
  const время = String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0");
  const сегодня = new Date(Date.now() + СДВИГ);
  const тотЖеДень = d.getUTCFullYear() === сегодня.getUTCFullYear() && d.getUTCMonth() === сегодня.getUTCMonth() && d.getUTCDate() === сегодня.getUTCDate();
  return тотЖеДень ? `сегодня, ${время}` : `${d.getUTCDate()} ${МЕСЯЦЫ[d.getUTCMonth()]}, ${время}`;
}

function расписаниеСловами(s) {
  if (!s || !s.вид) return "не задано";
  const времена = [].concat(s.время || []).filter(Boolean).join(" и ");
  if (s.вид === "interval") {
    const м = Number(s.минут) || 0;
    return м % 60 === 0 && м >= 60 ? `каждые ${м / 60} ч` : `каждые ${м} мин`;
  }
  if (s.вид === "daily") return `каждый день в ${времена || "—"}`;
  if (s.вид === "weekly") return `по ${ПО_ДНЯМ[s.день] || ПО_ДНЯМ[1]} в ${времена || "—"}`;
  if (s.вид === "monthly") return `${s.число || 1}-го числа в ${времена || "—"}`;
  return "не задано";
}

// Одна строка на карточке: что у агента настроено, а чего не хватает.
// Показываем именно недостающее («канал не задан»), чтобы было видно,
// почему агент пока не делает свою работу.
const ДНЕЙ = (n) => n + " дн.";
function сводкаНастроек(а) {
  const c = а.config || {};
  const части = [];
  if (а.id === "orders") {
    const п = c.просрочка || {};
    части.push(`норма: оформлен ${ДНЕЙ(п.placed ?? 2)}, собран ${ДНЕЙ(п.packed ?? 1)}`);
  }
  if (а.id === "security") части.push(c.копии ? "копии: " + c.копии : "папка копий не задана");
  if (а.id === "telegram") {
    части.push(c.канал ? "канал " + c.канал : "канал не задан");
    части.push(c.тест === false ? "публикует в канал" : "тестовый режим");
    if (c.цены === true) части.push("с ценами");
  }
  if (c.тихо?.с && c.тихо?.до) части.push(`тихо ${c.тихо.с}–${c.тихо.до}`);
  return части.length ? части.join(" · ") : "по умолчанию";
}

// =====================================================================
//  РАЗДЕЛ
// =====================================================================
export default async function render(page, ctx) {
  let данные = null;
  let вкладка = "appr";
  let таймер = null;

  page.append(el("div.topbar", {}, [
    el("div", {}, [
      el("h1", { text: "ИИ-Агенты" }),
      el("div.sub", { text: "Агенты считают и предлагают. Меняете всё вы — вот этими кнопками" }),
    ]),
    el("button.btn.btn-outline", { onclick: () => обновить(true) }, [icon("refresh", { size: 16 }), "Обновить"]),
  ]));

  const тело = el("div.agents-wrap");
  page.append(тело);

  // Опрос останавливаем, когда раздел ушёл с экрана: иначе он продолжал
  // бы дёргать сервер, пока открыт склад.
  const наблюдатель = new MutationObserver(() => {
    if (!document.body.contains(тело)) { clearInterval(таймер); наблюдатель.disconnect(); }
  });
  наблюдатель.observe(document.body, { childList: true, subtree: true });

  await обновить(false);
  таймер = setInterval(() => обновить(false), ОПРОС_МС);

  async function обновить(шумно) {
    try {
      данные = await запрос("GET");
    } catch (e) {
      if (шумно) toast(e.message, "err");
      if (!данные) тело.replaceChildren(el("div.empty", { text: e.message }));
      return;
    }
    // Отрисовка — отдельно от запроса. Раньше обе были в одном try, и
    // ошибка в отрисовке оставляла пустой экран без единого слова:
    // данные есть, показать нечего, причина неизвестна. Так нельзя.
    try {
      нарисовать();
      if (шумно) toast("Обновлено");
    } catch (e) {
      console.error("[ИИ-Агенты] отрисовка:", e);
      тело.replaceChildren(el("div.empty", { text: "Раздел не отрисовался: " + e.message }));
    }
  }

  // ------------------------------------------------------------------
  function нарисовать() {
    const кусок = el("div.enter");

    if (!данные.готово) {
      кусок.append(el("div.card.agents-setup", {}, [
        el("h3", { text: "Таблицы агентов ещё не созданы" }),
        el("p", { text: данные.причина || "Выполните db/agents-migration.sql в SQL-редакторе Supabase." }),
        el("p.muted", { text: "Склад работает как раньше. Пока файл не выполнен, агенты молчат и ничего не меняют." }),
      ]));
    }

    кусок.append(el("div.agent-grid", {}, (данные.агенты || []).map(карточка)));

    const ждут = (данные.согласования || []).length;
    const непрочитано = (данные.уведомления || []).filter((у) => !у.seen_at).length;

    const табы = el("div.pill-tabs.agents-tabs", {}, [
      кнопкаВкладки("appr", `Согласования${ждут ? " · " + ждут : ""}`),
      кнопкаВкладки("note", `Уведомления${непрочитано ? " · " + непрочитано : ""}`),
      кнопкаВкладки("hist", "История"),
      кнопкаВкладки("facts", "Сведения о товарах"),
      кнопкаВкладки("waits", "Ждут товар"),
    ]);
    кусок.append(табы, el("div.card.agents-panel", {}, [телоВкладки()]));

    тело.replaceChildren(кусок);
  }

  function кнопкаВкладки(id, текст) {
    return el("button" + (вкладка === id ? ".active" : ""), {
      text: текст,
      onclick: () => { вкладка = id; нарисовать(); },
    });
  }

  // ------------------------------------------------------------- карточка
  function карточка(а) {
    const с = а.статус || { код: "нет", текст: "—" };
    const строки = [
      ["Последний запуск", когда(а.last_run_at)],
      ["Последний успех", когда(а.last_ok_at)],
      ["Следующий запуск", а.enabled ? когда(а.next_run_at) : "приостановлен"],
      ["Расписание", расписаниеСловами(а.schedule)],
      ["Настройки", сводкаНастроек(а)],
    ];

    return el("div.card.agent-card" + (а.enabled ? "" : ".off"), {}, [
      el("div.agent-head", {}, [
        el("div.agent-ic", { html: "" }, [icon("sparkle", { size: 18 })]),
        el("div.agent-ttl", {}, [
          el("h3", { text: а.имя || а.id }),
          el("div.sub", { text: а.описание || "" }),
        ]),
        el("span.badge." + (ЗНАЧКИ[с.код] || "muted"), { text: с.текст }),
      ]),

      !а.подключён ? el("div.agent-soon", { text: `Задачи подключаются на этапе ${а.этап}. Ядро уже работает: расписание идёт, прогоны пишутся в журнал.` }) : null,

      el("dl.agent-facts", {}, строки.flatMap(([k, v]) => [el("dt", { text: k }), el("dd", { text: v })])),

      // У неподключённого агента сводка прогона повторяет слово в слово
      // пояснение выше — второй раз её не показываем.
      а.last_summary && !(!а.подключён && а.last_status === "skipped")
        ? el("div.agent-sum" + (а.last_status === "error" ? ".err" : ""), { text: а.last_summary })
        : null,

      el("div.agent-rights", { text: а.права || "" }),

      el("div.agent-acts", {}, [
        а.ждётСогласования
          ? el("button.btn.btn-primary", { text: `Решить · ${а.ждётСогласования}`, onclick: () => { вкладка = "appr"; нарисовать(); } })
          : null,
        el("button.btn.btn-outline", { onclick: () => отчёт(а) }, [icon("chart", { size: 15 }), "Отчёт"]),
        el("button.btn.btn-outline", { title: "Выполнить работу агента сейчас, не дожидаясь расписания", onclick: (e) => запустить(а, e.currentTarget) }, [icon("refresh", { size: 15 }), а.действие || "Запустить"]),
        а.id === "telegram"
          ? el("button.btn.btn-outline", { title: "Новый набор черновиков постов сейчас, не дожидаясь пятницы", onclick: (e) => собратьЗаново(а, e.currentTarget) }, [icon("sparkle", { size: 15 }), "Собрать посты заново"])
          : null,
        el("button.btn.btn-outline", { onclick: () => какРаботает(а) }, ["Как работает"]),
        el("button.btn.btn-outline", { onclick: () => расписание(а) }, [icon("clock", { size: 15 }), "Расписание"]),
        el("button.btn.btn-outline", { onclick: () => настройкиАгента(а) }, [icon("settings", { size: 15 }), "Настройки"]),
        el("button.btn.btn-outline", {
          text: а.enabled ? "Приостановить" : "Включить",
          onclick: () => переключить(а),
        }),
      ]),
    ]);
  }

  // ------------------------------------------------------------- действия
  // «Собрать посты заново»: новый набор черновиков сейчас. Каждый придёт
  // в Telegram на одобрение — поэтому спрашиваем.
  function собратьЗаново(а, кнопка) {
    confirmDialog("Собрать новый набор черновиков постов сейчас? Каждый придёт вам в Telegram на одобрение. Товары, которые уже предлагались за последние 30 дней, не повторятся.",
      () => запустить(а, кнопка, { заново: true }));
  }

  // «Как работает»: что делает агент, когда, чего не делает сам.
  function какРаботает(а) {
    const пункты = а.как || [а.описание || ""];
    modal({
      title: "Как работает · " + (а.имя || а.id),
      body: el("div.agent-how", {}, [
        el("ul", {}, пункты.map((п) => el("li", { text: п }))),
        el("div.agent-hint", { text: `Расписание: ${расписаниеСловами(а.schedule)}. Кнопка «${а.действие || "Запустить"}» делает то же самое сейчас.` }),
        el("div.agent-hint", { text: "Любой агент только считает и предлагает. Всё, что меняет склад, деньги, заказы или публикует в канал, — только после вашей кнопки." }),
      ]),
      actions: [{ label: "Понятно", kind: "btn-primary", onClick: (c) => c() }],
    });
  }

  async function запустить(а, кнопка, опции = {}) {
    кнопка.disabled = true;
    const было = кнопка.textContent;
    кнопка.textContent = "Выполняю…";
    try {
      const r = await запрос("POST", { action: "run", id: а.id, ...(опции.заново ? { заново: true } : {}) });
      if (!r.взято) toast(r.причина || "Агент сейчас занят", "err");
      else if (r.статус === "error") toast("Прогон упал: " + r.ошибка, "err");
      else toast(r.сводка || "Готово");
      await обновить(false);
    } catch (e) {
      toast(e.message, "err");
      кнопка.disabled = false; кнопка.textContent = было;
    }
  }

  async function переключить(а) {
    const вкл = !а.enabled;
    const сделать = async () => {
      try { await запрос("POST", { action: вкл ? "enable" : "disable", id: а.id }); await обновить(false); toast(вкл ? "Агент включён" : "Агент приостановлен"); }
      catch (e) { toast(e.message, "err"); }
    };
    if (вкл) return сделать();
    confirmDialog(`Приостановить «${а.имя}»? Он перестанет запускаться по расписанию. Уже сделанные предложения останутся.`, сделать);
  }

  // Расписание правится прямо отсюда: лезть в базу ради смены времени
  // отчёта — это гарантия, что время никогда не поменяют.
  // ------------------------------------------------------------------
  //  НАСТРОЙКИ АГЕНТА
  //
  //  Форма показывает только то, что конкретный агент понимает. Проверка
  //  — на сервере (api/lib/agents/настройки.js): браузеру не верим, и
  //  ошибка возвращается человеческой фразой, которую мы и показываем.
  //  Пустое поле значит «убрать настройку».
  // ------------------------------------------------------------------
  function настройкиАгента(а) {
    const c = а.config || {};
    const части = [];
    const собрать = [];                         // функции, каждая дописывает своё в итог

    // Тихие часы — у всех агентов.
    const тихоС = input({ type: "time", value: c.тихо?.с || "" });
    const тихоДо = input({ type: "time", value: c.тихо?.до || "" });
    части.push(
      el("div.agent-form-h", { text: "Тихие часы" }),
      el("div.agent-hint", { text: "В это время агент работает, но в Telegram не пишет — сообщения дождутся утра. Оставьте пустым, чтобы писать в любое время." }),
      el("div.agent-row2", {}, [field("С", тихоС), field("До", тихоДо)]),
    );
    собрать.push((и) => { и.тихо = { с: тихоС.value, до: тихоДо.value }; });

    if (а.id === "orders") {
      const п = c.просрочка || {};
      const нормаP = input({ type: "number", min: "0", max: "30", value: п.placed ?? "", placeholder: "2" });
      const нормаK = input({ type: "number", min: "0", max: "30", value: п.packed ?? "", placeholder: "1" });
      части.push(
        el("div.agent-form-h", { text: "Когда заказ считается просроченным" }),
        el("div.agent-hint", { text: "Сколько дней заказу можно стоять на этапе, прежде чем агент назовёт его просроченным в отчёте. Пусто — 2 дня на сборку и 1 на отправку. Доска «Сборка и отправка» пока считает по этим нормам по умолчанию." }),
        el("div.agent-row2", {}, [field("Оформлен, не собран — дней", нормаP), field("Собран, не отправлен — дней", нормаK)]),
      );
      собрать.push((и) => { и.просрочка = { placed: нормаP.value, packed: нормаK.value }; });
    }

    if (а.id === "security") {
      const копии = input({ value: c.копии || "", placeholder: "/var/backups/sklad" });
      части.push(
        el("div.agent-form-h", { text: "Резервные копии" }),
        el("div.agent-hint", { text: "Полный путь к папке с копиями базы на сервере. Агент смотрит, когда была сделана последняя копия, и предупредит, если ей больше двух суток. Пусто — проверка копий не делается." }),
        field("Папка копий на сервере", копии),
      );
      собрать.push((и) => { и.копии = копии.value; });
    }

    if (а.id === "telegram") {
      const канал = input({ value: c.канал || "", placeholder: "@generalmodern" });
      const тест = el("input", { type: "checkbox", checked: c.тест !== false });
      const цены = el("input", { type: "checkbox", checked: c.цены === true });
      части.push(
        el("div.agent-form-h", { text: "Канал-витрина" }),
        el("div.agent-hint", { text: "Новый канал для товаров. Служебный канал накладных сюда вписать нельзя — сервер не примет. Бот магазина должен быть администратором канала." }),
        field("Адрес канала", канал),
        el("label.agent-check", {}, [тест, el("span", {}, [
          el("b", { text: "Тестовый режим. " }),
          "Одобренные посты приходят вам в личные сообщения, а не в канал. Выключите, когда убедитесь, что посты выглядят как надо.",
        ])]),
        el("label.agent-check", {}, [цены, el("span", {}, [
          el("b", { text: "Показывать цены. " }),
          "В канале цена устаревает быстрее, чем в складе, поэтому по умолчанию выключено.",
        ])]),
      );
      собрать.push((и) => { и.канал = канал.value; и.тест = тест.checked; и.цены = цены.checked; });
    }

    if (а.id === "warehouse" || а.id === "design") {
      части.push(el("div.agent-hint", { text: а.id === "warehouse"
        ? "Сроки поставки агент считает сам — по датам оприходования в приходах. Отдельные пороги по товару задаются таблицей product_policy."
        : "Агент только собирает сигналы, настраивать в нём больше нечего." }));
    }

    modal({
      title: "Настройки · " + (а.имя || а.id),
      body: el("div.agent-form", {}, части),
      actions: [
        { label: "Отмена", onClick: (закрыть) => закрыть() },
        {
          label: "Сохранить", kind: "btn-primary", onClick: async (закрыть) => {
            const итог = {};
            собрать.forEach((ф) => ф(итог));
            try {
              await запрос("POST", { action: "config", id: а.id, config: итог });
              закрыть();
              await обновить(false);
              toast("Настройки сохранены");
            } catch (e) { toast(e.message, "err"); }
          },
        },
      ],
    });
  }

  function расписание(а) {
    const s = а.schedule || {};
    const видПоле = select(ВИДЫ, s.вид || "daily");
    const времяПоле = input({ value: [].concat(s.время || []).filter(Boolean).join(", "), placeholder: "09:00 или 09:00, 18:00" });
    const деньПоле = select(ДНИ, String(s.день || 1));
    const числоПоле = input({ type: "number", min: "1", max: "28", value: String(s.число || 1) });
    const минутыПоле = input({ type: "number", min: "1", max: "10080", value: String(s.минут || 60) });

    const строки = {
      время: field("Время по Ташкенту", времяПоле),
      день: field("День недели", деньПоле),
      число: field("Число месяца (1–28)", числоПоле),
      минуты: field("Промежуток, минут", минутыПоле),
    };
    const форма = el("div.agent-form", {}, [field("Как часто", видПоле), строки.время, строки.день, строки.число, строки.минуты]);

    const показать = () => {
      const v = видПоле.value;
      строки.время.style.display = v === "interval" ? "none" : "";
      строки.день.style.display = v === "weekly" ? "" : "none";
      строки.число.style.display = v === "monthly" ? "" : "none";
      строки.минуты.style.display = v === "interval" ? "" : "none";
    };
    видПоле.addEventListener("change", показать);
    показать();

    modal({
      title: "Расписание · " + (а.имя || а.id),
      body: форма,
      actions: [
        { label: "Отмена", onClick: (c) => c() },
        {
          label: "Сохранить", kind: "btn-primary", onClick: async (c) => {
            const вид = видПоле.value;
            const времена = String(времяПоле.value || "").split(/[,;]+/).map((t) => t.trim()).filter(Boolean);
            const новое = { вид };
            if (вид === "interval") новое.минут = Number(минутыПоле.value) || 60;
            else {
              if (!времена.length) return toast("Укажите время в виде 09:00", "err");
              if (времена.some((t) => !/^\d{1,2}:\d{2}$/.test(t))) return toast("Время пишется как 09:00", "err");
              новое.время = времена.length === 1 ? времена[0] : времена;
              if (вид === "weekly") новое.день = Number(деньПоле.value) || 1;
              if (вид === "monthly") новое.число = Number(числоПоле.value) || 1;
            }
            try { await запрос("POST", { action: "schedule", id: а.id, schedule: новое }); c(); await обновить(false); toast("Расписание сохранено"); }
            catch (e) { toast(e.message, "err"); }
          },
        },
      ],
    });
  }

  async function отчёт(а) {
    const окно = modal({ title: "Отчёт · " + (а.имя || а.id), body: el("div.empty", { text: "Загружаю…" }), wide: true, actions: [{ label: "Закрыть", onClick: (c) => c() }] });
    try {
      const r = await fetch(`/api/admin/agents-report?agent=${encodeURIComponent(а.id)}`, {
        cache: "no-store", headers: await authHeaders(),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Ошибка сервера");
      окно.content.replaceChildren(телоОтчёта(j));
    } catch (e) {
      окно.content.replaceChildren(el("div.empty", { text: e.message }));
    }
  }

  function телоОтчёта(j) {
    const блок = el("div.agent-report");
    блок.append(el("div.agent-rights", { text: j.агент?.права || "" }));

    // План закупки на шесть листов. Кнопка появляется, только если
    // агент и правда что-то посчитал: выгружать нечего — не обещаем.
    const сЛистами = (j.прогоны || []).find((п) => п.details?.листы);
    if (сЛистами) {
      блок.append(el("div.agent-panel-h", { style: { justifyContent: "flex-start", marginBottom: "10px" } }, [
        el("button.btn.btn-primary", {
          onclick: async (e) => {
            const к = e.currentTarget;
            к.disabled = true; к.textContent = "Собираю…";
            try {
              const { exportPurchasePlanExcel } = await import("../xlsx-export.js?v=20261127a");
              await exportPurchasePlanExcel(сЛистами.details.листы, { когда: new Date(сЛистами.started_at) });
              toast("Файл собран");
            } catch (err) {
              console.error("[ИИ-Агенты] Excel:", err);
              toast("Не удалось собрать файл: " + err.message, "err");
            }
            к.disabled = false; к.textContent = "Скачать план закупки (Excel)";
          },
        }, [icon("download", { size: 15 }), "Скачать план закупки (Excel)"]),
        el("span.tbl-wrap", { style: { alignSelf: "center", fontSize: ".75rem", color: "var(--muted)" } },
          ["Шесть листов: срочная закупка, скоро закончатся, сезонная, постоянные, медленные, аналитика"]),
      ]));
    }

    блок.append(el("h4", { text: "Прогоны" }));
    блок.append((j.прогоны || []).length
      ? таблица(["Когда", "Повод", "Итог", "Длительность", "Что сделано"],
          j.прогоны.map((п) => [
            когда(п.started_at),
            { schedule: "по расписанию", manual: "вручную", chain: "по цепочке" }[п.trigger] || п.trigger,
            значокИтога(п),
            п.duration_ms ? Math.round(п.duration_ms / 100) / 10 + " с" : "—",
            п.summary || п.error || "—",
          ]))
      : el("div.empty", { text: "Агент ещё не запускался" }));

    блок.append(el("h4", { text: "Уведомления" }));
    блок.append((j.уведомления || []).length
      ? таблица(["Когда", "Уровень", "Что", "Подробности"],
          j.уведомления.map((у) => {
            const ур = значокУровня(у.level);
            return [когда(у.created_at), el("span.badge." + ур.класс, { text: ур.текст }), у.title, у.body || "—"];
          }))
      : el("div.empty", { text: "Уведомлений нет" }));

    return блок;
  }

  // ------------------------------------------------------------- вкладки
  function телоВкладки() {
    if (вкладка === "appr") return вкладкаСогласований();
    if (вкладка === "note") return вкладкаУведомлений();
    if (вкладка === "facts") return вкладкаСведений();
    if (вкладка === "waits") return вкладкаОжиданий();
    return вкладкаИстории();
  }

  // ------------------------------------------------------------------
  //  СВЕДЕНИЯ О ТОВАРАХ (product_fact)
  //
  //  Раздел перерисовывается каждые 45 секунд. Чтобы не сбрасывать
  //  поле поиска посреди набора, вкладка держит свой узел и при
  //  перерисовке возвращает его же, а не строит заново.
  // ------------------------------------------------------------------
  let узелСведений = null;
  let сведения = { сводка: [], виды: {}, товары: [], загружено: false, ошибка: "" };

  async function запросСведений(method, body, query = "") {
    let r;
    try {
      r = await fetch(API_СВЕДЕНИЯ + query, {
        method, cache: "no-store",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch { throw new Error("Нет связи с сервером. Ничего не изменилось."); }
    let j = {};
    try { j = await r.json(); } catch {}
    if (!r.ok) throw new Error(j.error || "Ошибка сервера " + r.status);
    return j;
  }

  async function загрузитьСведения() {
    try {
      const [ответ, товары] = await Promise.all([
        запросСведений("GET"),
        ctx?.db?.products?.list ? ctx.db.products.list() : Promise.resolve([]),
      ]);
      сведения = { ...сведения, сводка: ответ.сводка || [], виды: ответ.виды || {}, товары: товары || [], загружено: true, ошибка: ответ.нетТаблицы ? "Таблица сведений не создана — выполните db/product-card-migration.sql" : "" };
    } catch (e) {
      сведения = { ...сведения, загружено: true, ошибка: e.message };
    }
  }

  function вкладкаСведений() {
    if (узелСведений) return узелСведений;
    const поиск = input({ placeholder: "Найти товар: код или название", type: "search" });
    const список = el("div.facts-list", {}, [el("div.empty", { text: "Загружаю…" })]);
    узелСведений = el("div.facts-tab", {}, [
      el("div.agent-hint", { text: "Здесь видно, что известно о каждом товаре. Эти сведения агент Telegram ставит в посты: понятное название, описание, к каким машинам подходит, свойства. В пост идут только сведения с указанным источником." }),
      el("div.facts-search", {}, [поиск]),
      список,
    ]);

    const показать = () => {
      if (сведения.ошибка) { список.replaceChildren(el("div.empty", { text: сведения.ошибка })); return; }
      const сводка = new Map(сведения.сводка.map((с) => [String(с.product_id), с]));
      const q = поиск.value.trim().toLowerCase();
      let товары = сведения.товары;
      if (q) товары = товары.filter((т) => `${т.code || ""} ${т.name || ""} ${сводка.get(String(т.id))?.название || ""}`.toLowerCase().includes(q));
      else товары = товары.filter((т) => сводка.has(String(т.id)));
      товары = [...товары].sort((а, б) => String(а.code || "").localeCompare(String(б.code || ""), "ru")).slice(0, 40);

      if (!товары.length) {
        список.replaceChildren(el("div.empty", { text: q ? "Ничего не нашлось" : "Сведений пока нет ни у одного товара. Найдите товар поиском и добавьте." }));
        return;
      }
      список.replaceChildren(...товары.map((т) => {
        const с = сводка.get(String(т.id));
        const значки = с
          ? [
              el("span.badge" + (с.проверено === с.всего ? ".ok" : ".warn"), { text: `проверено ${с.проверено} из ${с.всего}` }),
              !с.описание ? el("span.badge.muted", { text: "нет описания" }) : null,
            ]
          : [el("span.badge.muted", { text: "нет сведений" })];
        return el("div.facts-row", { onclick: () => окноСведений(т) }, [
          т.photo_url ? el("img.facts-thumb", { src: thumb(т.photo_url, 96), alt: "", loading: "lazy" }) : el("div.facts-thumb"),
          el("div.facts-txt", {}, [
            el("div.facts-name", { text: `${т.code ? т.code + " · " : ""}${т.name || "без названия"}` }),
            с?.название ? el("div.muted", { text: "В постах: " + с.название }) : null,
          ]),
          el("div.facts-badges", {}, значки),
        ]);
      }));
    };
    поиск.addEventListener("input", показать);
    узелСведений._показать = показать;

    загрузитьСведения().then(показать);
    return узелСведений;
  }

  // ------------------------------------------------------------------
  //  «ЖДУТ ТОВАР»: клиенты нажали «Сообщить о поступлении». Лучшая
  //  подсказка, что заказывать первым: сколько людей ждёт товар.
  // ------------------------------------------------------------------
  function вкладкаОжиданий() {
    const узел = el("div.facts-tab", {}, [el("div.empty", { text: "Загружаю…" })]);
    запрос("GET", null, "?waits=1").then((о) => {
      if (о.нетТаблицы) {
        узел.replaceChildren(el("div.empty", {}, [
          el("div", { text: "Таблица ожиданий ещё не создана." }),
          el("div.muted", { text: "Выполните db/stock-wait-migration.sql в SQL-редакторе Supabase. До этого кнопка «Сообщить о поступлении» отвечает клиенту, что подписка пока недоступна." }),
        ]));
        return;
      }
      const товары = о.товары || [];
      if (!товары.length) {
        узел.replaceChildren(el("div.empty", {}, [
          el("div", { text: "Пока никто не ждёт товар." }),
          el("div.muted", { text: "Когда клиент нажмёт «Сообщить о поступлении» у товара, которого нет, он появится здесь. Бот напишет ему сам, как только товар снова будет на складе." }),
        ]));
        return;
      }
      const всего = товары.reduce((с, т) => с + т.ждут, 0);
      узел.replaceChildren(
        el("div.agent-hint", { text: `Сейчас ждут: ${всего} — по ${товары.filter((т) => т.ждут).length} товарам. Бот напишет каждому сам, когда товар появится, один раз.` }),
        таблица(["Товар", "Ждут", "Уже сообщили", "Остаток"], товары.map((т) => [
          `${т.код ? т.код + " · " : ""}${т.имя || "—"}`,
          el("span.badge" + (т.ждут ? ".warn" : ".muted"), { text: String(т.ждут) }),
          String(т.сообщено),
          т.остаток > 0 ? el("span.badge.ok", { text: String(т.остаток) }) : "0",
        ])),
      );
    }).catch((e) => узел.replaceChildren(el("div.empty", { text: e.message })));
    return узел;
  }

  // Окно сведений одного товара: каждая строка — вид, текст, источник,
  // «проверено». Пустая строка при сохранении удаляется.
  async function окноСведений(т) {
    let данныеТовара;
    try { данныеТовара = await запросСведений("GET", null, "?product=" + encodeURIComponent(т.id)); }
    catch (e) { return toast(e.message, "err"); }
    const виды = данныеТовара.виды || сведения.виды || {};
    const порядок = Object.keys(виды);

    const строкиУзел = el("div.facts-rows");
    const строки = [];
    const добавить = (ф = {}) => {
      const вид = select(порядок.map((к) => ({ value: к, label: виды[к].подпись })), ф.key || "свойство");
      const текст = el("textarea.inp.facts-value", { rows: "2", maxlength: "600", placeholder: "Текст сведения" });
      текст.value = ф.value || "";
      const источник = input({ value: ф.source || "", placeholder: "Откуда: упаковка, сайт производителя, владелец…", maxlength: "200" });
      const проверено = el("input", { type: "checkbox", checked: ф.confidence === "подтверждено" });
      const строка = { вид, текст, источник, проверено };
      const узел = el("div.facts-item", {}, [
        el("div.facts-item-top", {}, [
          вид,
          el("label.facts-check", {}, [проверено, el("span", { text: "проверено" })]),
          el("button.btn.btn-outline.facts-del", { type: "button", title: "Убрать", text: "✕", onclick: () => { узел.remove(); строки.splice(строки.indexOf(строка), 1); } }),
        ]),
        текст, источник,
      ]);
      строки.push(строка);
      строкиУзел.append(узел);
    };
    const есть = (данныеТовара.факты || []).filter((ф) => виды[ф.key]);
    есть.sort((а, б) => порядок.indexOf(а.key) - порядок.indexOf(б.key) || (а.sort - б.sort));
    есть.forEach(добавить);
    if (!есть.length) { добавить({ key: "название" }); добавить({ key: "описание" }); добавить({ key: "совместимость" }); }

    modal({
      title: `Сведения · ${т.code ? т.code + " · " : ""}${т.name || ""}`,
      wide: true,
      body: el("div.facts-editor", {}, [
        el("div.facts-head", {}, [
          т.photo_url ? el("img.facts-photo", { src: thumb(т.photo_url, 300), alt: "" }) : null,
          el("div.agent-hint", { text: "«Понятное название» станет заголовком поста, складское название останется строкой ниже. В пост идут только сведения с источником. «Проверено» — вы сами убедились, что это верно. Пустую строку можно не удалять: при сохранении она уберётся сама." }),
        ]),
        строкиУзел,
        el("button.btn.btn-outline", { type: "button", text: "+ Добавить сведение", onclick: () => добавить({ key: "свойство" }) }),
      ]),
      actions: [
        { label: "Отмена", onClick: (закрыть) => закрыть() },
        {
          label: "Всё проверено", onClick: () => {
            let без = 0;
            строки.forEach((с) => { if (с.текст.value.trim() && с.источник.value.trim()) с.проверено.checked = true; else if (с.текст.value.trim()) без++; });
            toast(без ? `Отмечено. Без источника осталось: ${без} — их нельзя отметить проверенными` : "Все сведения отмечены проверенными", без ? "err" : undefined);
          },
        },
        {
          label: "Сохранить", kind: "btn-primary", onClick: async (закрыть) => {
            const факты = строки.map((с) => ({
              key: с.вид.value, value: с.текст.value, source: с.источник.value,
              confidence: с.проверено.checked ? "подтверждено" : "требует проверки",
            }));
            try {
              const r = await запросСведений("POST", { product: т.id, факты });
              закрыть();
              toast(`Сохранено: ${r.сохранено}` + (r.удалено ? `, убрано: ${r.удалено}` : ""));
              await загрузитьСведения();
              узелСведений?._показать?.();
            } catch (e) { toast(e.message, "err"); }
          },
        },
      ],
    });
  }

  function вкладкаСогласований() {
    const список = данные.согласования || [];
    const вКанал = блокВКанал();
    const уже = блокУжеВКанале();
    // «Уже в канале» — первым: у него срок (48 часов), его нельзя прятать внизу.
    if (!список.length) {
      return el("div", {}, [
        уже,
        el("div.empty", {}, [
          el("div", { text: "Ничего не ждёт вашего решения." }),
          el("div.muted", { text: "Когда агент что-то предложит — закупку, пост, замену фото — предложение появится здесь и будет ждать. Само оно не выполнится." }),
        ]),
        вКанал,
      ]);
    }
    return el("div", {}, [уже, списокСогласований(список), вКанал]);
  }

  // Посты, которые уже в канале (последние 47 часов — дольше Telegram
  // удалять не даёт). Дописали «Сведения» — одной кнопкой старые
  // сообщения удаляются, и товары уходят заново уже с описанием.
  function блокУжеВКанале() {
    const посты = данные.вКаналеНедавно || [];
    if (!посты.length) return null;
    return el("div.agent-tochannel", {}, [
      el("h4", { text: "Уже в канале — можно отправить заново с описанием" }),
      el("div.agent-hint", { text: "Старые сообщения этих постов удалятся из канала, и товары уйдут заново с описанием из «Сведений». Товар без описания останется как есть. Telegram даёт удалять сообщения только 48 часов после отправки." }),
      el("div.agent-appr", {}, посты.map((п) => el("div.appr-row", {}, [
        el("div.appr-txt", {}, [
          el("div.appr-ttl", { text: п.title }),
          el("div.muted", { text: `В канале с ${когда(п.когда)} · товаров: ${п.товаров}` + (п.обновлён ? ` · обновлён ${когда(п.обновлён)}` : "") }),
        ]),
      ]))),
      el("div.appr-acts", { style: "margin-top:10px" }, [
        el("button.btn.btn-primary", { text: `🔄 Отправить заново с описанием (${посты.length})`, onclick: () => переотправить(посты) }),
      ]),
    ]);
  }

  function переотправить(посты) {
    confirmDialog(`Удалить из канала старые сообщения ${посты.length} постов и отправить товары заново с описанием? Подписчики увидят новые посты.`, async () => {
      try {
        const ответ = await запрос("POST", { action: "repost", ids: посты.map((п) => п.id) });
        const и = ответ?.итог || {};
        await обновить(false);
        const такие = (и.пропущено || []).filter((п) => п.такой).length;
        const пропущено = (и.пропущено || []).filter((п) => !п.такой).map((п) => `${п.код}: ${п.причина}`);
        toast(`Отправлено заново: ${(и.обновлено || []).length}`
          + (такие ? `. Уже с описанием, не тронуты: ${такие}` : "")
          + (пропущено.length ? `. Пропущено: ${пропущено.join("; ").slice(0, 300)}` : ""));
      } catch (e) { toast(e.message, "err"); await обновить(false); }
    });
  }

  // Посты, одобренные в тестовом режиме: ушли владельцу в личку. Здесь их
  // можно отправить в канал — один раз, повтор сервер не пропустит.
  function блокВКанал() {
    const посты = данные.вКаналМожно || [];
    if (!посты.length) return null;
    return el("div.agent-tochannel", {}, [
      el("h4", { text: "Одобрено в тестовом режиме — можно отправить в канал" }),
      el("div.agent-appr", {}, посты.map((п) => el("div.appr-row", {}, [
        el("div.appr-txt", {}, [
          el("div.appr-ttl", { text: п.title }),
          el("div.muted", { text: `Одобрено ${когда(п.decided_at)} · сейчас только у вас в личке` }),
        ]),
        el("div.appr-acts", {}, [
          el("button.btn.btn-primary", { text: "📢 В канал", onclick: () => вКаналПост(п) }),
          el("button.btn.btn-outline", { text: "Убрать", title: "Не отправлять в канал и убрать из этого списка", onclick: () => убратьОдобренное(п, "Не отправлять в канал") }),
        ]),
      ]))),
    ]);
  }

  // «Убрать»: одобренное больше не предлагается. Не удаление — в истории
  // запись остаётся с отметкой.
  function убратьОдобренное(п, вопрос) {
    confirmDialog(`${вопрос}: «${п.title}»? Запись останется в истории.`, async () => {
      try { await запрос("POST", { action: "dismiss", id: п.id }); await обновить(false); toast("Убрано"); }
      catch (e) { toast(e.message, "err"); }
    });
  }

  function вКаналПост(п) {
    confirmDialog(`Отправить в канал: «${п.title}»? Посты увидят все подписчики.`, async () => {
      try {
        const ответ = await запрос("POST", { action: "channel", id: п.id });
        const и = ответ?.итог || {};
        await обновить(false);
        toast(`Отправлено в канал ${String(и.канал || "").slice(0, 40)}: ${Number(и.успешно) || 0} из ${Number(и.всего) || 0}`);
      } catch (e) { toast(e.message, "err"); await обновить(false); }
    });
  }

  function списокСогласований(список) {
    return el("div.agent-appr", {}, список.map((с) => el("div.appr-row", {}, [
      el("div.appr-txt", {}, [
        el("div.appr-ttl", { text: с.title }),
        el("div.muted", { text: `${имяАгента(с.agent_id)} · ${когда(с.created_at)}` }),
      ]),
      el("div.appr-acts", {}, [
        с.kind === "post"
          ? el("button.btn.btn-outline", { text: "Изменить", onclick: () => редакторПоста(с) })
          : el("button.btn.btn-outline", { text: "Посмотреть", onclick: () => показатьПредложение(с) }),
        el("button.btn.btn-primary", { text: "Одобрить", onclick: () => решить(с, "approve") }),
        el("button.btn.btn-outline", { text: "Отклонить", onclick: () => решить(с, "reject") }),
      ]),
    ])));
  }

  // ------------------------------------------------------------------
  //  РЕДАКТОР ЧЕРНОВИКА ПОСТА
  //
  //  Владелец правит обычный текст: первая строка — заголовок (в посте
  //  жирным), строка «Артикул: …» — код. Разметку ставит сервер
  //  (js/post-text.js), так что ни один символ из текста не сломает пост.
  //  Предпросмотр собирается через textContent — разметку из текста
  //  браузер не исполняет никогда.
  //  Фото, видео и ссылку «Заказать» правка не меняет: их даёт склад.
  // ------------------------------------------------------------------
  function редакторПоста(с) {
    const товары = с.payload?.товары || [];
    if (!товары.length) return показатьПредложение(с);

    const поля = товары.map((т) => {
      const включён = el("input", { type: "checkbox", checked: true });
      const текст = el("textarea.inp.post-ed-text", { rows: "11", maxlength: String(ДЛИНА_МАКС) });
      текст.value = вТекст(т.текст || "");
      const счётчик = el("div.post-ed-count");
      const пузырь = el("div.post-ed-bubble");

      const нарисовать = () => {
        const v = текст.value;
        const n = v.trim().length;
        счётчик.textContent = n > 1024
          ? `${n} знаков — длиннее подписи к фото (1024): фото уйдёт, а текст отдельным сообщением под ним`
          : `${n} знаков — помещается под фото`;
        счётчик.classList.toggle("warn", n > 1024);
        const строки = v.replace(/\r\n?/g, "\n").trim().split("\n");
        пузырь.replaceChildren(
          т.фото ? el("img.post-ed-photo", { src: thumb(т.фото, 480), alt: "", loading: "lazy" }) : null,
          т.видео ? el("div.post-ed-video", { text: "🎬 + видео товара рядом с фото (альбомом)" }) : null,
          el("div.post-ed-body", {}, строки.map((стр, i) => i === 0
            ? el("div", {}, [el("b", { text: стр })])
            : el("div", { text: стр || " " }))),
        );
        карточка.classList.toggle("off", !включён.checked);
      };

      const карточка = el("div.post-ed-item", {}, [
        el("label.post-ed-head", {}, [
          включён,
          el("span", {}, [el("b", { text: т.name || "Товар" }), т.код ? el("span.muted", { text: " · " + т.код }) : null]),
        ]),
        el("div.post-ed-grid", {}, [
          el("div", {}, [
            el("div.agent-hint", { text: "Первая строка — заголовок поста (жирным). Остальное — как напишете." }),
            текст, счётчик,
          ]),
          el("div", {}, [el("div.agent-hint", { text: "Так увидят в канале" }), пузырь]),
        ]),
      ]);
      текст.addEventListener("input", нарисовать);
      включён.addEventListener("change", нарисовать);
      нарисовать();
      return { т, включён, текст, карточка };
    });

    modal({
      title: "Изменить черновик · " + (с.payload?.рубрика || с.title),
      wide: true,
      body: el("div.post-ed", {}, [
        el("div.agent-hint", { text: "Снимите галочку «В посте», чтобы убрать товар. Фото, видео и кнопку «Заказать» агент берёт из склада — здесь они не меняются. После сохранения кнопки в Telegram одобрят уже исправленный вариант." }),
        ...поля.map((п) => п.карточка),
      ]),
      actions: [
        { label: "Отмена", onClick: (закрыть) => закрыть() },
        {
          label: "Сохранить", kind: "btn-primary", onClick: async (закрыть) => {
            const оставить = поля.filter((п) => п.включён.checked);
            if (!оставить.length) return toast("В посте должен остаться хотя бы один товар", "err");
            if (оставить.some((п) => !п.текст.value.trim())) return toast("У товара пустой текст", "err");
            try {
              await запрос("POST", { action: "edit_post", id: с.id, товары: оставить.map((п) => ({ id: п.т.id, текст: п.текст.value })) });
              закрыть();
              await обновить(false);
              toast("Черновик сохранён. Одобрить можно здесь или кнопкой в Telegram");
            } catch (e) { toast(e.message, "err"); }
          },
        },
      ],
    });
  }

  function показатьПредложение(с) {
    modal({
      title: с.title,
      wide: true,
      body: el("div", {}, [
        el("div.muted", { text: `${имяАгента(с.agent_id)} · ${когда(с.created_at)}` }),
        el("pre.agent-json", { text: JSON.stringify(с.payload ?? {}, null, 2) }),
      ]),
      actions: [
        { label: "Отклонить", onClick: (c) => { c(); решить(с, "reject"); } },
        { label: "Одобрить", kind: "btn-primary", onClick: (c) => { c(); решить(с, "approve"); } },
      ],
    });
  }

  function решить(с, действие) {
    const вопрос = действие === "approve"
      ? `Одобрить: «${с.title}»? После одобрения агент выполнит ровно это предложение.`
      : `Отклонить: «${с.title}»?`;
    confirmDialog(вопрос, async () => {
      try {
        const ответ = await запрос("POST", { action: действие, id: с.id });
        await обновить(false);
        // После одобрения сервер сразу исполняет — показываем, что вышло,
        // а не просто «Одобрено»: публикация могла и не пройти.
        // toast выводит текст через textContent (js/ui.js), так что разметка
        // из ответа исполниться не может. Длину всё равно режем: сырое
        // сообщение об ошибке на экране владельцу ни к чему.
        const и = ответ?.итог;
        const коротко = (s) => String(s ?? "").slice(0, 200);
        if (действие !== "approve") toast("Отклонено");
        else if (и && !и.ок) toast("Одобрено, но не исполнено: " + коротко(и.причина || (и.ошибки || [])[0] || "ошибка"), "err");
        else toast(коротко(и?.всего ? `${и.что}: ${Number(и.успешно) || 0} из ${Number(и.всего) || 0}` : (и?.что || "Одобрено")));
      } catch (e) { toast(e.message, "err"); }
    });
  }

  function вкладкаУведомлений() {
    const список = данные.уведомления || [];
    if (!список.length) return el("div.empty", { text: "Уведомлений пока нет" });
    const непрочитанные = список.filter((у) => !у.seen_at).map((у) => у.id);
    const шапка = непрочитанные.length
      ? el("div.agent-panel-h", {}, [
          el("button.btn.btn-outline", {
            text: `Отметить прочитанными · ${непрочитанные.length}`,
            onclick: async () => {
              try { await запрос("POST", { action: "seen", ids: непрочитанные }); await обновить(false); }
              catch (e) { toast(e.message, "err"); }
            },
          }),
        ])
      : null;
    return el("div", {}, [
      шапка,
      таблица(["Когда", "Агент", "Уровень", "Что", "Подробности"], список.map((у) => {
        const ур = значокУровня(у.level);
        return [
          когда(у.created_at),
          имяАгента(у.agent_id),
          el("span.badge." + ур.класс, { text: ур.текст }),
          el("span" + (у.seen_at ? "" : ".agent-new"), { text: у.title }),
          у.body || "—",
        ];
      })),
    ]);
  }

  function вкладкаИстории() {
    const список = данные.прогоны || [];
    if (!список.length) return el("div.empty", { text: "Агенты ещё не запускались" });
    return таблица(["Когда", "Агент", "Повод", "Итог", "Длительность", "Что сделано"], список.map((п) => [
      когда(п.started_at),
      имяАгента(п.agent_id),
      { schedule: "по расписанию", manual: "вручную", chain: "по цепочке" }[п.trigger] || п.trigger,
      значокИтога(п),
      п.duration_ms ? Math.round(п.duration_ms / 100) / 10 + " с" : "—",
      п.summary || п.error || "—",
    ]));
  }

  // ------------------------------------------------------------- мелочи
  // Объявление, а не const-стрелка: вкладки рисуются выше по файлу, и
  // стрелка в этом месте просто не существует к моменту вызова.
  function имяАгента(id) {
    return (данные.агенты || []).find((а) => а.id === id)?.имя || id;
  }

  function значокИтога(п) {
    const вид = { ok: ["ok", "успех"], error: ["danger", "ошибка"], skipped: ["muted", "пропущен"], running: ["cur", "идёт"] }[п.status] || ["muted", п.status];
    return el("span.badge." + вид[0], { text: вид[1] });
  }

  function таблица(заголовки, строки) {
    return el("div.tbl-wrap", { style: { overflowX: "auto" } }, [
      el("table.tbl", {}, [
        el("thead", {}, [el("tr", {}, заголовки.map((з) => el("th", { text: з })))]),
        el("tbody", {}, строки.map((р) => el("tr", {}, р.map((к) => el("td", {}, [к?.nodeType ? к : String(к ?? "—")]))))),
      ]),
    ]);
  }
}
