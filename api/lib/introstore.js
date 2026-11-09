// ========================================================================
//  ВСТУПИТЕЛЬНОЕ ВИДЕО (интро сайта): настройки, история и статистика.
//
//  Хранится в файлах на сервере (data/intro.json, data/intro-stats.json),
//  как и SEO-уточнения: склад, заказы и база не затрагиваются, а любую
//  опубликованную версию можно вернуть из истории.
//
//  Статистика — только счётчики по дням (показ / досмотрели / пропустили /
//  ошибка / «Как заказать»), разрезы по устройству и языку. Ни IP, ни
//  идентификаторов посетителей здесь нет.
//
//  Папка data/ закрыта в nginx (deny all) и не попадает в git.
// ========================================================================
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

const КОРЕНЬ = fileURLToPath(new URL("../../", import.meta.url));
const ПАПКА = process.env.SEO_DATA_DIR || join(КОРЕНЬ, "data");
try { mkdirSync(ПАПКА, { recursive: true }); } catch { }
const файл = (имя) => join(ПАПКА, имя);

function прочитать(имя, поУмолчанию) {
  try {
    if (!existsSync(файл(имя))) return поУмолчанию;
    return JSON.parse(readFileSync(файл(имя), "utf8"));
  } catch (e) {
    console.error("[intro] не прочитал", имя, e.message);
    return поУмолчанию;
  }
}
function записать(имя, данные) {
  const tmp = файл(имя + ".tmp");
  writeFileSync(tmp, JSON.stringify(данные, null, 1));
  renameSync(tmp, файл(имя));
}

export const ЯЗЫКИ = ["ru", "uz", "en"];
export const УСТРОЙСТВА = ["desktop", "mobile"];

// Тексты сцен. Только то, что есть на сайте на самом деле: вход через
// Telegram, заказ без онлайн-оплаты, цену уточняет менеджер.
export const ТЕКСТЫ_ПО_УМОЛЧАНИЮ = {
  ru: { s1: "Всё для швейного оборудования — в одном месте", s2: "Выбирайте нужные детали за секунды", s3: "Менеджер ставит цену — вы подтверждаете в Telegram", s4: "Собираем, упаковываем и отправляем: Яндекс или BTS", s5: "Ваш заказ — наша забота" },
  uz: { s1: "Tikuv uskunalari uchun hammasi — bir joyda", s2: "Kerakli detallarni bir necha soniyada tanlang", s3: "Menejer narx qo‘yadi — siz Telegramda tasdiqlaysiz", s4: "Yig‘amiz, qadoqlaymiz va jo‘natamiz: Yandex yoki BTS", s5: "Buyurtmangiz — bizning g‘amxo‘rligimiz" },
  en: { s1: "Everything for sewing equipment — in one place", s2: "Pick the parts you need in seconds", s3: "A manager sets the price — you confirm in Telegram", s4: "We pick, pack and ship: Yandex or BTS", s5: "Your order is our care" },
};

export const НАСТРОЙКИ_ПО_УМОЛЧАНИЮ = {
  enabled: true,               // короткий ролик при входе; выключается в складе
  mode: "animation",           // animation — встроенная анимация; video — загруженный ролик
  frequency: "once",           // once | 30d | 7d | session
  skip_show: true,             // кнопка «Пропустить»
  skip_delay: 0,               // через сколько секунд она появляется (0–3)
  sound: false,                // звук в ролике (по умолчанию ролик всё равно стартует без звука)
  transition_ms: 900,          // переход от интро к сайту
  howto_button: true,          // кнопка «Как заказать» в меню сайта
  logo_url: "",                // пусто — фирменный знак GM
  product_codes: "",           // коды товаров для сцен через запятую; пусто — подбор автоматически
  texts: ТЕКСТЫ_ПО_УМОЛЧАНИЮ,
  // ролики: устройство → язык (all — для всех языков) → путь в хранилище
  video: { desktop: { all: "", ru: "", uz: "", en: "" }, mobile: { all: "", ru: "", uz: "", en: "" } },
  poster_url: "",
  seen_version: 1,             // увеличить — интро снова увидят все
  // экскурсия по сайту (js/site/tour.js)
  tour_mode: "intro",          // intro — короткий ролик при входе; invite — приглашение на экскурсию; button — только кнопка «Как заказать»
  scenes: [],                  // [{ id, on, k }] — порядок, показ, темп (k: 0.6–1.6); пусто — все по порядку
  tour_texts: {},              // { ru: { home: { t, d } } } — свои заголовки и пояснения сцен
  audio: { all: "", ru: "", uz: "", en: "" },   // музыка или озвучка
  audio_loop: false,
};
export const СЦЕНЫ_ТУРА = ["home", "cats", "search", "card", "auth", "order", "tgorder", "confirm", "stock", "delivery", "cabinet", "bot", "final"];

const чистый = (v, n = 300) => String(v ?? "").replace(/[\u0000-\u001F]/g, " ").trim().slice(0, n);
const путьХранилища = (v) => {
  const s = чистый(v, 300);
  return /^[\w\-./]+$/.test(s) && !s.includes("..") ? s : "";
};
const ссылкаКартинки = (v) => {
  const s = чистый(v, 500);
  return /^https:\/\/[^\s"'<>]+$/.test(s) || /^\/[\w\-./?=&%]*$/.test(s) ? s : "";
};

// Привести присланное из склада к безопасному виду (всё лишнее — отбросить)
export function очистить(вход = {}, было = НАСТРОЙКИ_ПО_УМОЛЧАНИЮ) {
  const s = { ...НАСТРОЙКИ_ПО_УМОЛЧАНИЮ, ...было };
  const b = (k) => { if (k in вход) s[k] = !!вход[k]; };
  b("enabled"); b("skip_show"); b("sound"); b("howto_button");
  if (["animation", "video"].includes(вход.mode)) s.mode = вход.mode;
  if (["once", "30d", "7d", "session"].includes(вход.frequency)) s.frequency = вход.frequency;
  if ("skip_delay" in вход) s.skip_delay = Math.max(0, Math.min(3, Math.round(Number(вход.skip_delay) || 0)));
  if ("transition_ms" in вход) s.transition_ms = Math.max(300, Math.min(2500, Math.round(Number(вход.transition_ms) || 900)));
  if ("logo_url" in вход) s.logo_url = ссылкаКартинки(вход.logo_url);
  if ("poster_url" in вход) s.poster_url = ссылкаКартинки(вход.poster_url);
  if ("product_codes" in вход) s.product_codes = чистый(вход.product_codes, 400).replace(/[^\w\-,\s]/g, "");
  if (вход.texts && typeof вход.texts === "object") {
    const t = {};
    for (const я of ЯЗЫКИ) {
      t[я] = { ...ТЕКСТЫ_ПО_УМОЛЧАНИЮ[я] };
      const src = вход.texts[я] || {};
      for (const k of Object.keys(ТЕКСТЫ_ПО_УМОЛЧАНИЮ[я])) if (k in src) t[я][k] = чистый(src[k], 140) || ТЕКСТЫ_ПО_УМОЛЧАНИЮ[я][k];
    }
    s.texts = t;
  }
  if (вход.video && typeof вход.video === "object") {
    const v = {};
    for (const у of УСТРОЙСТВА) {
      v[у] = {};
      for (const я of ["all", ...ЯЗЫКИ]) v[у][я] = путьХранилища(вход.video?.[у]?.[я]);
    }
    s.video = v;
  }
  if (["intro", "invite", "button"].includes(вход.tour_mode)) s.tour_mode = вход.tour_mode;
  if ("audio_loop" in вход) s.audio_loop = !!вход.audio_loop;
  if (Array.isArray(вход.scenes)) {
    const виден = new Set();
    s.scenes = вход.scenes.filter(x => x && СЦЕНЫ_ТУРА.includes(x.id) && !виден.has(x.id) && виден.add(x.id))
      .map(x => ({ id: x.id, on: x.on !== false, k: Math.max(.6, Math.min(1.6, Math.round((Number(x.k) || 1) * 10) / 10)) }));
  }
  if (вход.tour_texts && typeof вход.tour_texts === "object") {
    const t = {};
    for (const я of ЯЗЫКИ) {
      const src = вход.tour_texts[я] || {}; t[я] = {};
      for (const id of СЦЕНЫ_ТУРА) {
        const v = src[id] || {}; const tt = чистый(v.t, 60), dd = чистый(v.d, 220);
        if (tt || dd) t[я][id] = { t: tt, d: dd };
      }
    }
    s.tour_texts = t;
  }
  if (вход.audio && typeof вход.audio === "object") {
    s.audio = {}; for (const я of ["all", ...ЯЗЫКИ]) s.audio[я] = путьХранилища(вход.audio[я]);
  }
  if (вход.reset_seen) s.seen_version = (Number(s.seen_version) || 1) + 1;
  return s;
}

let кэш = null;
export function данные() {
  if (кэш) return кэш;
  const d = прочитать("intro.json", {});
  кэш = {
    settings: очистить(d.settings || {}, НАСТРОЙКИ_ПО_УМОЛЧАНИЮ),
    rev: Number(d.rev) || 0,
    updated_at: d.updated_at || null,
    label: d.label || "",
    history: Array.isArray(d.history) ? d.history : [],
  };
  return кэш;
}
export const настройки = () => данные().settings;

// Опубликовать: прежняя версия (со своей подписью и временем) уходит в историю (последние 15)
export function опубликовать(новые, метка = "Изменение настроек") {
  const d = данные();
  d.history.unshift({ id: Date.now().toString(36), at: d.updated_at || new Date().toISOString(), label: d.label || "Начальные настройки", rev: d.rev, settings: d.settings });
  d.history = d.history.slice(0, 15);
  d.settings = новые;
  d.label = метка;
  d.rev += 1;
  d.updated_at = new Date().toISOString();
  кэш = d;
  записать("intro.json", d);
  return d;
}

const поТашкенту = (iso) => new Date(iso).toLocaleString("ru-RU", { timeZone: "Asia/Tashkent", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
export function откатить(id) {
  const d = данные();
  const h = d.history.find(x => x.id === id);
  if (!h) return null;
  return опубликовать(очистить(h.settings, НАСТРОЙКИ_ПО_УМОЛЧАНИЮ), "Возврат к версии " + h.rev + " (" + поТашкенту(h.at) + ")");
}

// ---------------- статистика ----------------
export const СОБЫТИЯ = ["shown", "completed", "skipped", "error", "howto", "sound_on",
  "tour_open", "start_shopping", "invite_shown", "invite_accept", "invite_dismiss"];
const событиеЕсть = (e) => СОБЫТИЯ.includes(e) || (e.startsWith("scene_") && СЦЕНЫ_ТУРА.includes(e.slice(6)));
let стат = null, таймерЗаписи = null;
function статистика() {
  if (!стат) стат = прочитать("intro-stats.json", { days: {} });
  return стат;
}
export function отметить({ event, device, lang, at_sec }) {
  if (!событиеЕсть(event)) return false;
  const s = статистика();
  const день = new Date().toISOString().slice(0, 10);
  const d = s.days[день] || (s.days[день] = {});
  const плюс = (k) => { d[k] = (d[k] || 0) + 1; };
  плюс(event);
  if (УСТРОЙСТВА.includes(device)) плюс(event + ":" + device);
  if (ЯЗЫКИ.includes(lang)) плюс(event + ":" + lang);
  if (event === "skipped" && Number.isFinite(Number(at_sec))) {
    d.skip_sec_sum = (d.skip_sec_sum || 0) + Math.max(0, Math.min(60, Number(at_sec)));
  }
  // храним 120 дней
  const дни = Object.keys(s.days).sort();
  while (дни.length > 120) delete s.days[дни.shift()];
  // пишем на диск не чаще раза в 10 секунд
  if (!таймерЗаписи) таймерЗаписи = setTimeout(() => {
    таймерЗаписи = null;
    try { записать("intro-stats.json", s); } catch (e) { console.error("[intro] stats", e.message); }
  }, 10e3);
  return true;
}
export function сводка(днейНазад = 30) {
  const s = статистика();
  const с = new Date(Date.now() - днейНазад * 864e5).toISOString().slice(0, 10);
  const итог = {};
  const поДням = [];
  for (const [день, d] of Object.entries(s.days).sort()) {
    if (день < с) continue;
    поДням.push({ day: день, ...d });
    for (const [k, v] of Object.entries(d)) итог[k] = (итог[k] || 0) + v;
  }
  return { total: итог, days: поДням, period_days: днейНазад };
}
