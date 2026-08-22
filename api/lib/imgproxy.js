// ========================================================================
//  ФОТО ТОВАРОВ ЧЕРЕЗ СВОЙ СЕРВЕР.
//
//  Раньше каждый просмотр каталога или склада тянул снимки прямо из
//  Supabase. На бесплатном плане это упирается в лимит исходящего трафика
//  — и упёрлось: организация вышла за квоту. Картинок много, смотрят их
//  постоянно, а файл каждый раз качается заново.
//
//  Теперь снимок скачивается из Supabase ОДИН раз, кладётся на диск и
//  дальше раздаётся отсюда. Заголовок кэша длинный, поэтому повторные
//  запросы браузер даже не шлёт. Supabase после этого отдаёт каждый
//  снимок ровно один раз — а именно этот трафик и вывел за квоту.
//
//  Адрес: /api/img?w=<ширина>&p=<путь в хранилище>
//  Например: /api/img?w=300&p=product-photos/1787296424013_photo.jpg
//
//  Путь идёт параметром, а не частью адреса, намеренно: nginx перехватывает
//  любой адрес, оканчивающийся на .jpg, и ищет файл на диске — до нашего
//  кода такой запрос не доходит.
//
//  БЕЗОПАСНОСТЬ: сюда нельзя подставить чужой адрес. Принимаем только
//  путь внутри нашего хранилища, собираем ссылку сами. Иначе получился бы
//  открытый прокси, через который качают что угодно с нашего сервера.
// ========================================================================
import { createHash } from "crypto";
import { mkdirSync, existsSync, readFileSync, writeFileSync, statSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

const SB_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const БАКЕТ = "product-photos";                  // единственное, что отдаём
const РАЗМЕРЫ = [64, 84, 96, 160, 300, 480, 640, 900, 1200];
const ГОД = 60 * 60 * 24 * 365;

// Кэш держим РЯДОМ С ПРИЛОЖЕНИЕМ, а не в /tmp: систему когда-нибудь
// перезагрузят, /tmp очистится, и все накопленные снимки придётся качать и
// уменьшать заново — а уменьшение у Supabase платное и считается отдельно.
// Выкладка кэш не трогает: git reset --hard не удаляет посторонние папки.
const КОРЕНЬ = fileURLToPath(new URL("../../", import.meta.url));
const ПАПКА = process.env.CACHE_DIR
  ? join(process.env.CACHE_DIR, "img")
  : join(КОРЕНЬ, ".cache", "img");
try { mkdirSync(ПАПКА, { recursive: true }); } catch { }

const ТИПЫ = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  webp: "image/webp", gif: "image/gif", avif: "image/avif",
};

// Путь в хранилище должен быть простым: буквы, цифры, точка, дефис,
// подчёркивание, косая. Никаких «..» и никаких двоеточий.
export function путьДопустим(p) {
  const s = String(p || "");
  if (!s || s.length > 300) return false;
  if (s.includes("..") || s.includes("//") || s.includes(":")) return false;
  if (!s.startsWith(БАКЕТ + "/")) return false;
  for (const ch of s) {
    const ok = (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z")
      || (ch >= "0" && ch <= "9") || ch === "." || ch === "-" || ch === "_" || ch === "/";
    if (!ok) return false;
  }
  return true;
}

// Ширину берём только из известного набора: иначе один и тот же снимок
// закэшируется в сотне почти одинаковых размеров и место кончится.
export function ширинаДопустима(w) {
  return РАЗМЕРЫ.includes(Number(w));
}

export function типПоИмени(p) {
  const точка = String(p).lastIndexOf(".");
  const ext = точка > 0 ? String(p).slice(точка + 1).toLowerCase() : "";
  return ТИПЫ[ext] || "image/jpeg";
}

const имяФайла = (path, w) =>
  createHash("sha1").update(w + "|" + path).digest("hex") + ".bin";

// Ссылки в Supabase: сперва уменьшенная копия, если не выйдет — оригинал.
export function адресаSupabase(path, w) {
  const base = SB_URL + "/storage/v1";
  return [
    `${base}/render/image/public/${path}?width=${w}&height=${w}&resize=contain&quality=70`,
    `${base}/object/public/${path}`,
  ];
}

export default async function handler(req, res) {
  const w = Number(req.query.w);
  const path = String(req.query.p || "");

  if (!ширинаДопустима(w) || !путьДопустим(path)) {
    return res.status(400).send("Некорректный запрос");
  }
  if (!SB_URL) return res.status(500).send("SUPABASE_URL не задан");

  const файл = join(ПАПКА, имяФайла(path, w));
  const тип = типПоИмени(path);

  // Уже качали — отдаём с диска, Supabase не трогаем вовсе.
  try {
    if (existsSync(файл) && statSync(файл).size > 0) {
      res.setHeader("Content-Type", тип);
      res.setHeader("Cache-Control", `public, max-age=${ГОД}, immutable`);
      res.setHeader("X-Img-Cache", "HIT");
      return res.end(readFileSync(файл));
    }
  } catch { }

  // Первый раз: скачиваем. Сначала уменьшенную копию, потом оригинал.
  for (const url of адресаSupabase(path, w)) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (!buf.length) continue;
      try { writeFileSync(файл, buf); } catch { }   // не смогли сохранить — не беда
      res.setHeader("Content-Type", r.headers.get("content-type") || тип);
      res.setHeader("Cache-Control", `public, max-age=${ГОД}, immutable`);
      res.setHeader("X-Img-Cache", "MISS");
      return res.end(buf);
    } catch { }
  }

  // Снимка нет. Кэшируем отказ ненадолго, чтобы битая ссылка в списке
  // не долбила Supabase на каждой прокрутке.
  res.setHeader("Cache-Control", "public, max-age=300");
  return res.status(404).send("Нет такого файла");
}
