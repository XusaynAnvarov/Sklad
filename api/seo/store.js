// ========================================================================
//  SEO: настройки и ручные уточнения — в файле на сервере, НЕ в базе.
//
//  Так SEO ничего не меняет в складе (названия, цены, остатки остаются
//  как есть), а любое изменение можно откатить: перед каждым применением
//  исправлений сохраняется снимок «как было».
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
    console.error("[seo] не прочитал", имя, e.message);
    return поУмолчанию;
  }
}

// запись через временный файл: при сбое посреди записи старый файл цел
function записать(имя, данные) {
  const tmp = файл(имя + ".tmp");
  writeFileSync(tmp, JSON.stringify(данные, null, 1));
  renameSync(tmp, файл(имя));
}

export const НАСТРОЙКИ_ПО_УМОЛЧАНИЮ = {
  business_name: "GENERAL MODERN",
  phone: "", email: "",
  telegram: "https://t.me/generalmodernbot",
  street: "", city: "", region: "", postal: "", country: "UZ",
  lat: "", lng: "",
  hours: "",               // например: "Mo-Sa 09:00-18:00"
  delivery_ru: "", delivery_uz: "", delivery_en: "",   // текст о доставке — только подтверждённый
  local_business: false,   // включать разметку LocalBusiness — только при подтверждённом адресе
  price_policy: "hidden",  // hidden | show — показывать ли цены поисковикам и в фиде
  price_currency: "UZS",
  verify_google: "", verify_yandex: "", verify_bing: "",   // коды meta-тегов
  google_file: "", yandex_file: "",                          // файл подтверждения: google….html / код из yandex_….html
  ga4_id: "",
  gsc_property: "sc-domain:generalmodern.uz",   // ресурс в Search Console (доступ — сервисный аккаунт в .env)
  indexnow: false, indexnow_key: "",
};

let кэш = null;
export function данные() {
  if (кэш) return кэш;
  const d = прочитать("seo-settings.json", {});
  кэш = {
    settings: { ...НАСТРОЙКИ_ПО_УМОЛЧАНИЮ, ...(d.settings || {}) },
    products: d.products || {},      // code → { title, description, compat, brand }
    categories: d.categories || {},  // raw → { ru, uz, en, text_ru, text_uz, text_en }
    history: d.history || [],        // снимки для отката
  };
  return кэш;
}
export const настройки = () => данные().settings;

export function сохранить(d = данные()) {
  кэш = d;
  записать("seo-settings.json", d);
}

// Снимок перед изменением: что было в уточнениях товаров и категорий
export function снимок(метка) {
  const d = данные();
  const id = Date.now().toString(36);
  d.history.unshift({
    id, at: new Date().toISOString(), label: метка,
    products: JSON.parse(JSON.stringify(d.products)),
    categories: JSON.parse(JSON.stringify(d.categories)),
    settings: JSON.parse(JSON.stringify(d.settings)),
  });
  d.history = d.history.slice(0, 30);
  return id;
}

export function откатить(id) {
  const d = данные();
  const s = d.history.find(h => h.id === id);
  if (!s) return false;
  снимок("Перед откатом к «" + s.label + "»");
  d.products = s.products; d.categories = s.categories; d.settings = { ...НАСТРОЙКИ_ПО_УМОЛЧАНИЮ, ...s.settings };
  сохранить(d);
  return true;
}

// Какие товары мы уже видели: код → категория и адрес. Нужен, чтобы
// удалённый товар вёл на свою категорию (301), а не в пустоту, и чтобы
// заметить новинки (отправить их в IndexNow).
export const виденные = () => прочитать("seo-seen.json", {});
export const сохранитьВиденные = (v) => { try { записать("seo-seen.json", v); } catch (e) { console.error("[seo] seen", e.message); } };

export const аудит = () => прочитать("seo-audit.json", { runs: [] });
export const сохранитьАудит = (a) => { try { записать("seo-audit.json", a); } catch (e) { console.error("[seo] audit", e.message); } };
