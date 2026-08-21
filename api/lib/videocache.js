// ========================================================================
//  ВИДЕО ЧЕРЕЗ СВОЙ СЕРВЕР.
//
//  Раньше клиент получал временную ссылку и качал ролик прямо из Supabase.
//  Каждый просмотр — это весь файл целиком, а видео весит в десятки раз
//  больше фотографии: несколько просмотров съедают месячный лимит.
//  Именно из-за трафика организация вышла за квоту.
//
//  Теперь ролик скачивается из Supabase ОДИН раз, ложится на диск и
//  дальше раздаётся отсюда.
//
//  ПЕРЕМОТКА. Плееры не качают файл подряд: они просят куски (заголовок
//  Range). Без поддержки Range перемотка не работает, а Safari вообще
//  отказывается играть. Поэтому отвечаем 206 и отдаём запрошенный кусок.
//
//  МЕСТО НА ДИСКЕ. Видео большие, диск не резиновый. Держим папку в
//  пределах лимита: когда переполняется, удаляем самые давние ролики —
//  они просто скачаются заново при следующем просмотре.
// ========================================================================
import { createHash } from "crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync } from "fs";
import { Readable } from "stream";
import { join } from "path";
import { tmpdir } from "os";

const SUPA_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
const BUCKET = "product-videos";
const ГОД = 60 * 60 * 24 * 365;
const ЛИМИТ_ПАПКИ = 3 * 1024 * 1024 * 1024;      // 3 ГБ под кэш видео

export const ПАПКА = join(tmpdir(), "gm-videocache");
try { mkdirSync(ПАПКА, { recursive: true }); } catch { }

export const имяФайла = (path) => createHash("sha1").update(String(path)).digest("hex") + ".vid";

// Разобрать заголовок Range: "bytes=1000-" или "bytes=0-1023".
// Возвращает { start, end } в пределах файла либо null, если заголовка нет
// или он бессмысленный — тогда отдаём файл целиком.
export function разобратьRange(header, размер) {
  const s = String(header || "").trim();
  if (!s.startsWith("bytes=")) return null;
  const кусок = s.slice(6).split(",")[0];
  const [a, b] = кусок.split("-");
  let start, end;

  if (a === "" && b !== "") {
    // "bytes=-500" — последние 500 байт
    const хвост = Number(b);
    if (!isFinite(хвост) || хвост <= 0) return null;
    start = Math.max(0, размер - хвост);
    end = размер - 1;
  } else {
    start = Number(a);
    if (!isFinite(start) || start < 0) return null;
    end = b === "" || b === undefined ? размер - 1 : Number(b);
    if (!isFinite(end)) return null;
    end = Math.min(end, размер - 1);
  }
  if (start > end || start >= размер) return null;
  return { start, end };
}

// Убрать самые давние ролики, если папка переросла лимит.
export function прибратьсяВПапке(лимит = ЛИМИТ_ПАПКИ) {
  let файлы = [];
  try {
    файлы = readdirSync(ПАПКА)
      .filter(f => f.endsWith(".vid"))
      .map(f => {
        const п = join(ПАПКА, f);
        try { const st = statSync(п); return { п, размер: st.size, когда: st.mtimeMs }; }
        catch { return null; }
      })
      .filter(Boolean);
  } catch { return 0; }

  let всего = файлы.reduce((s, f) => s + f.размер, 0);
  if (всего <= лимит) return 0;

  файлы.sort((a, b) => a.когда - b.когда);     // самые давние первыми
  let удалено = 0;
  for (const f of файлы) {
    if (всего <= лимит) break;
    try { unlinkSync(f.п); всего -= f.размер; удалено++; } catch { }
  }
  return удалено;
}

// Скачать ролик из Supabase на диск. Пишем потоком: держать в памяти
// файл на десятки мегабайт нельзя.
async function скачать(path, файл) {
  const r = await fetch(`${SUPA_URL}/storage/v1/object/sign/${BUCKET}/${encodeURIComponent(path)}`, {
    method: "POST",
    headers: { apikey: SERVICE, Authorization: "Bearer " + SERVICE, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 300 }),
  });
  if (!r.ok) throw new Error("Не удалось получить ссылку на видео");
  const j = await r.json();

  const файлВидео = await fetch(`${SUPA_URL}/storage/v1${j.signedURL}`);
  if (!файлВидео.ok || !файлВидео.body) throw new Error("Видео не скачалось");

  // Пишем во временное имя и переименовываем: если скачивание оборвётся,
  // на месте не останется обрезанного файла, который потом отдадут клиенту.
  const врем = файл + ".part";
  await new Promise((готово, ошибка) => {
    const поток = createWriteStream(врем);
    Readable.fromWeb(файлВидео.body).pipe(поток);
    поток.on("finish", готово);
    поток.on("error", ошибка);
  });
  renameSync(врем, файл);
  прибратьсяВПапке();
  return файл;
}

// Убедиться, что ролик лежит на диске, и вернуть путь к нему.
export async function положитьНаДиск(path) {
  const файл = join(ПАПКА, имяФайла(path));
  try { if (existsSync(файл) && statSync(файл).size > 0) return { файл, свежий: false }; } catch { }
  await скачать(path, файл);
  return { файл, свежий: true };
}

// Отдать файл клиенту, поддерживая перемотку.
export function отдать(req, res, файл, тип = "video/mp4") {
  const размер = statSync(файл).size;
  const range = разобратьRange(req.headers.range, размер);

  res.setHeader("Content-Type", тип);
  res.setHeader("Accept-Ranges", "bytes");
  // Ссылка на видео живёт под нашим доступом, поэтому кэш только у клиента
  res.setHeader("Cache-Control", `private, max-age=${ГОД}`);

  if (!range) {
    res.setHeader("Content-Length", размер);
    return createReadStream(файл).pipe(res);
  }
  res.status(206);
  res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${размер}`);
  res.setHeader("Content-Length", range.end - range.start + 1);
  return createReadStream(файл, { start: range.start, end: range.end }).pipe(res);
}

// ------------------------------------------------------------------
//  ПРОПУСК НА ОДИН РОЛИК.
//  Тег <video src="..."> не умеет слать заголовок авторизации — браузер
//  просто качает адрес. Класть в этот адрес токен сессии нельзя: он
//  осядет в логах сервера и в истории браузера.
//  Поэтому выдаём отдельный короткий пропуск: только на этот ролик и
//  только на несколько минут. Ровно тот же приём, что у подписанных
//  ссылок Supabase, но ведёт он на наш сервер.
// ------------------------------------------------------------------
import { createHmac, timingSafeEqual } from "crypto";

const секрет = () => process.env.SITE_JWT_SECRET || "dev-secret-change-in-production";
const подпись = (тело) => createHmac("sha256", секрет()).update(тело).digest("base64url");

export function выписатьПропуск(videoId, секунд = 600) {
  const тело = Buffer.from(JSON.stringify({
    v: String(videoId),
    exp: Math.floor(Date.now() / 1000) + секунд,
  })).toString("base64url");
  return тело + "." + подпись(тело);
}

// Возвращает номер ролика или null, если пропуск чужой, испорчен или истёк.
export function проверитьПропуск(пропуск) {
  try {
    const [тело, sig] = String(пропуск || "").split(".");
    if (!тело || !sig) return null;
    const ждём = подпись(тело);
    if (sig.length !== ждём.length) return null;
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(ждём))) return null;
    const d = JSON.parse(Buffer.from(тело, "base64url").toString());
    if (!d.v || !d.exp || d.exp < Math.floor(Date.now() / 1000)) return null;
    return String(d.v);
  } catch { return null; }
}
