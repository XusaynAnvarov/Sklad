// ========================================================================
//  GET /api/video?id=… — сам ролик, отданный НАШИМ сервером.
//
//  Раньше клиент получал временную ссылку и качал видео прямо из Supabase
//  (api/video-url.js). Каждый просмотр — весь файл целиком; на бесплатном
//  плане это и вывело организацию за лимит трафика.
//
//  Теперь ролик скачивается из Supabase один раз, ложится на диск сервера
//  и дальше раздаётся отсюда, с поддержкой перемотки.
//
//  Доступ: короткий пропуск на один ролик, который выдаёт /api/video-url
//  вошедшему клиенту. Бакет остаётся приватным, прямой ссылки на файл
//  наружу по-прежнему нет.
// ========================================================================
import { sget } from "./lib/supa.js";
import { положитьНаДиск, отдать, проверитьПропуск } from "./lib/videocache.js";

const ТИПЫ = { mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", m4v: "video/x-m4v" };

function типПоИмени(path) {
  const точка = String(path).lastIndexOf(".");
  const ext = точка > 0 ? String(path).slice(точка + 1).toLowerCase() : "";
  return ТИПЫ[ext] || "video/mp4";
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Пропуск выдаёт /api/video-url — только вошедшему клиенту и только на
  // один ролик. Сюда тег <video> приходит без заголовков, поэтому иначе
  // проверить, кто это, нельзя.
  const id = проверитьПропуск(req.query?.t);
  if (!id) return res.status(403).json({ error: "Ссылка на видео устарела — откройте заново" });

  try {
    const rows = await sget(`videos?id=eq.${encodeURIComponent(id)}&select=path`);
    const path = rows[0]?.path;
    if (!path) return res.status(404).json({ error: "Видео не найдено" });

    const { файл } = await положитьНаДиск(path);
    return отдать(req, res, файл, типПоИмени(path));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
